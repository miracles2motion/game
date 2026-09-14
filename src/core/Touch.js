import { input } from './Input.js';
import { settings } from './Settings.js';

const LOOK_SENS = 0.0045; // radians per css px at sensitivity 1.0

/**
 * Touch controls modelled on Delta Force Mobile's default layout:
 *  - floating joystick in the left zone (auto-sprint on full push)
 *  - drag-to-look anywhere in the right zone (and the left zone when the stick is already held)
 *  - big FIRE button bottom-right + secondary FIRE bottom-left
 *  - ADS, JUMP, CROUCH, RELOAD, SWAP, SPRINT-lock, PAUSE buttons
 * Builds its own DOM inside #touch-root and only listens while enabled.
 */
export class TouchControls {
  constructor(root) {
    this.root = root;
    this.enabled = false;
    this.el = null;
    this.touches = new Map();   // id -> {kind:'stick'|'look'|'btn', ...}
    this.stick = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this._adsLatch = false; this._crouchLatch = false; this._sprintLock = false;
    this._bound = {
      start: e => this._start(e), move: e => this._move(e), end: e => this._end(e),
    };
    this.onPause = null;
  }

  build() {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'touch-controls';
    el.innerHTML = `
      <div class="tc-zone tc-left" data-zone="left"></div>
      <div class="tc-zone tc-right" data-zone="right"></div>
      <div class="tc-stick" id="tc-stick"><div class="tc-stick-knob"></div></div>
      <button class="tc-btn tc-fire tc-fire-r" data-act="fire"><span>FIRE</span></button>
      <button class="tc-btn tc-fire tc-fire-l" data-act="fire"><span>FIRE</span></button>
      <button class="tc-btn tc-ads" data-act="ads"><span>ADS</span></button>
      <button class="tc-btn tc-jump" data-act="jump"><span>JUMP</span></button>
      <button class="tc-btn tc-crouch" data-act="crouch"><span>CRCH</span></button>
      <button class="tc-btn tc-reload" data-act="reload"><span>RLD</span></button>
      <button class="tc-btn tc-swap" data-act="swap"><span>SWAP</span></button>
      <button class="tc-btn tc-sprint" data-act="sprint"><span>RUN</span></button>
      <button class="tc-btn tc-interact" data-act="interact"><span>USE</span></button>
      <button class="tc-btn tc-pause" data-act="pause"><span>II</span></button>
    `;
    this.root.appendChild(el);
    this.el = el;
    this.stickEl = el.querySelector('#tc-stick');
    this.knobEl = el.querySelector('.tc-stick-knob');
    this.applyLayout();
  }

  applyLayout() {
    if (!this.el) return;
    this.el.style.setProperty('--stick', settings.get('touchStickSize') + 'px');
    this.el.style.setProperty('--btn', settings.get('touchButtonSize') + 'px');
    this.el.classList.toggle('left-handed', !!settings.get('leftHanded'));
  }

  enable() {
    if (this.enabled) return;
    this.build();
    this.enabled = true;
    this.el.classList.add('active');
    const o = { passive: false };
    this.el.addEventListener('touchstart', this._bound.start, o);
    this.el.addEventListener('touchmove', this._bound.move, o);
    this.el.addEventListener('touchend', this._bound.end, o);
    this.el.addEventListener('touchcancel', this._bound.end, o);
    // Also let mouse drive the touch UI when in forced-touch mode on desktop (testing)
    this.el.addEventListener('pointerdown', this._pd = e => { if (e.pointerType === 'mouse') this._start(this._fake(e, 'start')); }, o);
    this.el.addEventListener('pointermove', this._pm = e => { if (e.pointerType === 'mouse' && e.buttons) this._move(this._fake(e, 'move')); }, o);
    this.el.addEventListener('pointerup', this._pu = e => { if (e.pointerType === 'mouse') this._end(this._fake(e, 'end')); }, o);
  }
  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.el.classList.remove('active');
    this.el.removeEventListener('touchstart', this._bound.start);
    this.el.removeEventListener('touchmove', this._bound.move);
    this.el.removeEventListener('touchend', this._bound.end);
    this.el.removeEventListener('touchcancel', this._bound.end);
    this.el.removeEventListener('pointerdown', this._pd);
    this.el.removeEventListener('pointermove', this._pm);
    this.el.removeEventListener('pointerup', this._pu);
    this.touches.clear(); this._resetStick();
    this._adsLatch = this._crouchLatch = this._sprintLock = false;
    this._refreshButtons();
    input.resetHeld();
  }
  setVisible(v) { this.el?.classList.toggle('hidden', !v); }

  _fake(e, type) {
    const t = { identifier: 999, clientX: e.clientX, clientY: e.clientY, target: e.target };
    return { preventDefault() {}, changedTouches: [t], type };
  }

  _btnAt(target) { return target?.closest?.('.tc-btn') || null; }

  _start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const btn = this._btnAt(t.target);
      if (btn) { this._press(btn, t.identifier); continue; }
      const zone = t.target?.closest?.('.tc-zone')?.dataset.zone;
      const w = window.innerWidth;
      const leftSide = settings.get('leftHanded') ? t.clientX > w * 0.5 : t.clientX < w * 0.5;
      if ((zone === 'left' || leftSide) && !this.stick.active) {
        this.stick.active = true; this.stick.id = t.identifier;
        this.stick.cx = t.clientX; this.stick.cy = t.clientY;
        this._placeStick(t.clientX, t.clientY, 0, 0);
        this.touches.set(t.identifier, { kind: 'stick' });
      } else {
        this.touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
      }
    }
  }
  _move(e) {
    e.preventDefault();
    const sens = LOOK_SENS * settings.get('touchSens') * (input.ads ? settings.get('adsSensMult') : 1);
    const inv = settings.get('invertY') ? -1 : 1;
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (!rec) continue;
      if (rec.kind === 'stick') {
        const r = settings.get('touchStickSize') * 0.5;
        let dx = t.clientX - this.stick.cx, dy = t.clientY - this.stick.cy;
        const d = Math.hypot(dx, dy);
        if (d > r) { dx *= r / d; dy *= r / d; }
        const nx = dx / r, ny = -dy / r;
        this.stick.x = nx; this.stick.y = ny;
        this._placeStick(this.stick.cx, this.stick.cy, dx, dy);
        input.move.x = nx; input.move.y = ny;
        const mag = Math.hypot(nx, ny);
        if (settings.get('autoSprint')) input.sprint = this._sprintLock || (mag > 0.92 && ny > 0.6);
        else input.sprint = this._sprintLock;
      } else if (rec.kind === 'look') {
        const dx = t.clientX - rec.x, dy = t.clientY - rec.y;
        rec.x = t.clientX; rec.y = t.clientY;
        input.addLook(-dx * sens, -dy * sens * inv);
      } else if (rec.kind === 'btn' && rec.act === 'fire') {
        // DF-mobile: dragging on the fire button also aims.
        const dx = t.clientX - rec.x, dy = t.clientY - rec.y;
        rec.x = t.clientX; rec.y = t.clientY;
        input.addLook(-dx * sens, -dy * sens * inv);
      }
    }
  }
  _end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      this.touches.delete(t.identifier);
      if (!rec) continue;
      if (rec.kind === 'stick') this._resetStick();
      else if (rec.kind === 'btn') this._release(rec.act, rec.el);
    }
  }
  _resetStick() {
    this.stick.active = false; this.stick.id = null; this.stick.x = this.stick.y = 0;
    input.move.x = 0; input.move.y = 0;
    input.sprint = this._sprintLock;
    if (this.stickEl) this.stickEl.classList.remove('visible');
  }
  _placeStick(cx, cy, dx, dy) {
    const s = settings.get('touchStickSize');
    this.stickEl.classList.add('visible');
    this.stickEl.style.transform = `translate(${cx - s / 2}px, ${cy - s / 2}px)`;
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _press(btn, id) {
    const act = btn.dataset.act;
    const rec = { kind: 'btn', act, el: btn, x: 0, y: 0 };
    this.touches.set(id, rec);
    btn.classList.add('pressed');
    switch (act) {
      case 'fire': input.fire = true; break;
      case 'ads':
        if (settings.get('adsToggle')) { this._adsLatch = !this._adsLatch; input.ads = this._adsLatch; }
        else input.ads = true; break;
      case 'jump': input.jump = true; break;
      case 'crouch':
        if (settings.get('crouchToggle')) { this._crouchLatch = !this._crouchLatch; input.crouch = this._crouchLatch; }
        else input.crouch = true; break;
      case 'reload': input.reload = true; break;
      case 'swap': input.swap = true; break;
      case 'sprint': this._sprintLock = !this._sprintLock; input.sprint = this._sprintLock; break;
      case 'interact': input.interact = true; break;
      case 'pause': input.pause = true; break;
    }
    this._refreshButtons();
  }
  _release(act, el) {
    el.classList.remove('pressed');
    switch (act) {
      case 'fire': input.fire = false; break;
      case 'ads': if (!settings.get('adsToggle')) input.ads = false; break;
      case 'crouch': if (!settings.get('crouchToggle')) input.crouch = false; break;
      case 'interact': input.interact = false; break;
    }
    this._refreshButtons();
  }
  _refreshButtons() {
    if (!this.el) return;
    this.el.querySelector('.tc-ads')?.classList.toggle('latched', this._adsLatch);
    this.el.querySelector('.tc-crouch')?.classList.toggle('latched', this._crouchLatch);
    this.el.querySelector('.tc-sprint')?.classList.toggle('latched', this._sprintLock);
  }
  /** Player calls when a state is force-cleared (e.g. slide ends sprint, death). */
  clearLatches() { this._adsLatch = this._crouchLatch = this._sprintLock = false; input.ads = input.crouch = input.sprint = false; this._refreshButtons(); }
  /** Some DOM state for the HUD: show/hide USE button. */
  setInteractVisible(v) { this.el?.querySelector('.tc-interact')?.classList.toggle('show', v); }
}

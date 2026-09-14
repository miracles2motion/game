import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { settings } from '../core/Settings.js';

const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const _v = new THREE.Vector3();

export class HUD {
  constructor(root) {
    const el = document.createElement('div'); el.id = 'hud'; el.className = 'hidden';
    el.innerHTML = `
      <div class="vignette"></div>
      <div class="dmg-flash"></div><div class="low-hp" style="opacity:0"></div>
      <div class="dmg-ring"></div>
      <div class="crosshair" style="--gap:6px"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="hitmarker"><i></i><i></i><i></i><i></i></div>
      <div class="hud-tc">
        <div class="compass"><div class="strip"></div><div class="center"></div></div>
        <div class="objective"><div class="t"></div><div class="s"></div></div>
      </div>
      <div class="hud-tl"><span class="wave-pill">Wave <b class="wv">–</b></span><div class="kills">Kills <b class="kl">0</b></div><div class="fps hidden"></div></div>
      <div class="hud-bl">
        <div class="hp-num"><span class="hpn">100</span><small>HP</small></div>
        <div class="bar hp"><i></i></div>
        <div class="bar armor"><i></i></div>
      </div>
      <div class="hud-br">
        <div class="reload-ring"></div>
        <div class="ammo"><span class="mag">30</span><small> / <span class="res">120</span></small></div>
        <div class="wpn"><b class="wn">M4-D</b> · Assault</div>
        <div class="wpn-slots"><span data-s="0">1 · M4-D</span><span data-s="1">2 · V-9</span></div>
      </div>
      <div class="extract-bar hidden"><div class="l">Extracting</div><div class="bar"><i style="width:0"></i></div></div>
      <div class="hint hidden"></div>
      <div class="marker hidden">EXTRACT<br><span class="md"></span></div>
    `;
    root.appendChild(el); this.el = el;
    const q = s => el.querySelector(s);
    this.$ = { cross: q('.crosshair'), hm: q('.hitmarker'), ring: q('.dmg-ring'), flash: q('.dmg-flash'), low: q('.low-hp'), strip: q('.strip'), objT: q('.objective .t'), objS: q('.objective .s'), obj: q('.objective'),
      wv: q('.wv'), kl: q('.kl'), fps: q('.fps'), hpn: q('.hpn'), hpBar: q('.bar.hp'), hpI: q('.bar.hp i'), arI: q('.bar.armor i'), rel: q('.reload-ring'), mag: q('.mag'), res: q('.res'), ammo: q('.ammo'), wn: q('.wn'), wpn: q('.wpn'), slots: [...el.querySelectorAll('.wpn-slots span')],
      ext: q('.extract-bar'), extI: q('.extract-bar i'), hint: q('.hint'), marker: q('.marker'), md: q('.md') };
    this._buildCompass();
    this.extractPos = null;
    this._offs = [
      bus.on('obj', o => { this.$.objT.textContent = o.text; this.$.objS.textContent = o.sub || ''; this.$.obj.classList.remove('flash'); void this.$.obj.offsetWidth; this.$.obj.classList.add('flash'); }),
      bus.on('wave', (w, n) => { this.$.wv.textContent = `${w}/${n}`; }),
      bus.on('kill', k => { this.$.kl.textContent = k; }),
      bus.on('engine:fps', f => { this.$.fps.textContent = `${f} FPS`; }),
      bus.on('player:damage', (from) => this.damageFrom(from)),
      bus.on('extract', t => { this.$.ext.classList.toggle('hidden', t <= 0); this.$.extI.style.width = `${Math.min(100, t * 100)}%`; }),
      bus.on('extract:open', p => { this.extractPos = p; this.$.marker.classList.remove('hidden'); }),
      bus.on('settings:change', k => { if (k === 'showFps') this.$.fps.classList.toggle('hidden', !settings.get('showFps')); }),
    ];
    this.$.fps.classList.toggle('hidden', !settings.get('showFps'));
    this._lastFrom = null;
  }
  _buildCompass() {
    const s = this.$.strip; s.innerHTML = '';
    // 3 copies for wrap: -360..720, 1px per degree scaled by 2.2
    this.pxPerDeg = 2.2;
    for (let d = -360; d <= 720; d += 15) {
      const el = document.createElement('span'); const dd = ((d % 360) + 360) % 360;
      if (CARD[dd] !== undefined) { el.className = 'card'; el.textContent = CARD[dd]; }
      else if (dd % 45 === 0) { el.textContent = dd; }
      else el.className = 'tick';
      el.style.left = `${d * this.pxPerDeg}px`; s.appendChild(el);
    }
    this.objMark = document.createElement('span'); this.objMark.className = 'obj'; this.objMark.textContent = '◆'; this.objMark.style.display = 'none'; s.appendChild(this.objMark);
  }
  show() { this.el.classList.remove('hidden'); this.$.marker.classList.add('hidden'); this.$.ext.classList.add('hidden'); this.extractPos = null; this.$.wv.textContent = '–'; this.$.kl.textContent = '0'; }
  hide() { this.el.classList.add('hidden'); }

  hit(head, kill) {
    const h = this.$.hm; h.classList.remove('show', 'kill', 'head'); void h.offsetWidth;
    h.classList.add('show'); if (kill) h.classList.add('kill'); else if (head) h.classList.add('head');
  }
  damageFrom(from) { this._lastFrom = from ? from.clone() : null; this._ringT = 1.2; this.$.flash.style.opacity = 0.9; setTimeout(() => this.$.flash.style.opacity = 0, 80); }

  update(dt, player, camera) {
    const w = player.weapon;
    // crosshair spread
    const hs = Math.hypot(player.ctrl.velocity.x, player.ctrl.velocity.z);
    const spread = THREE.MathUtils.lerp(w.def.spreadBase, w.def.spreadAds, player.ads) + w.spread + hs * 0.12 + (player.ctrl.onGround ? 0 : 2.5);
    this.$.cross.style.setProperty('--gap', `${4 + spread * 4}px`);
    this.$.cross.classList.toggle('ads', player.ads > 0.7);
    this.$.cross.classList.toggle('enemy', player.aimingAtEnemy);
    this.$.cross.style.opacity = player.sprinting ? 0.25 : 1;
    // hp/armor
    const hp = Math.ceil(player.hp);
    this.$.hpn.textContent = hp; this.$.hpI.style.width = `${player.hp / player.maxHp * 100}%`; this.$.arI.style.width = `${player.armor / player.maxArmor * 100}%`;
    this.$.hpBar.classList.toggle('low', hp < 35); this.$.low.style.opacity = hp < 35 ? 1 : 0;
    // ammo
    this.$.mag.textContent = w.ammo; this.$.res.textContent = w.reserve; this.$.ammo.classList.toggle('low', w.ammo <= w.def.mag * 0.25);
    this.$.wn.textContent = w.def.name; this.$.wpn.innerHTML = `<b>${w.def.name}</b> · ${w.def.kind === 'ar' ? 'Assault' : 'SMG'}`;
    this.$.slots.forEach((s, i) => s.classList.toggle('on', i === player.wi));
    this.$.rel.textContent = w.reloading > 0 ? 'Reloading' : (w.ammo === 0 && w.reserve === 0 ? 'No ammo' : '');
    // compass
    const yawDeg = ((-player.yaw * THREE.MathUtils.RAD2DEG) % 360 + 360) % 360;
    this.$.strip.style.transform = `translateX(${-yawDeg * this.pxPerDeg}px)`;
    if (this.extractPos) {
      const dx = this.extractPos.x - player.position.x, dz = this.extractPos.z - player.position.z;
      let b = Math.atan2(dx, -dz) * THREE.MathUtils.RAD2DEG; b = (b + 360) % 360;
      let rel = b - yawDeg; rel = ((rel + 540) % 360) - 180;
      this.objMark.style.display = ''; this.objMark.style.left = `${(yawDeg + rel) * this.pxPerDeg}px`;
      // world marker
      _v.copy(this.extractPos).add(new THREE.Vector3(0, 3, 0)).project(camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
      this.$.marker.style.display = onScreen ? '' : 'none';
      if (onScreen) { this.$.marker.style.left = `${(_v.x * 0.5 + 0.5) * 100}%`; this.$.marker.style.top = `${(-_v.y * 0.5 + 0.5) * 100}%`; this.$.md.textContent = `${Math.round(Math.hypot(dx, dz))} m`; }
    } else this.objMark.style.display = 'none';
    // damage ring
    if (this._ringT > 0 && this._lastFrom) {
      this._ringT -= dt;
      const dx = this._lastFrom.x - player.position.x, dz = this._lastFrom.z - player.position.z;
      const ang = Math.atan2(dx, -dz) - (-player.yaw);
      this.$.ring.style.transform = `rotate(${ang}rad)`; this.$.ring.style.opacity = Math.min(1, this._ringT);
    } else this.$.ring.style.opacity = 0;
  }
  setHint(txt) { this.$.hint.classList.toggle('hidden', !txt); if (txt) this.$.hint.innerHTML = txt; }
  dispose() { this._offs.forEach(f => f()); this.el.remove(); }
}

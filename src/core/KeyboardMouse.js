import { input } from './Input.js';
import { settings } from './Settings.js';
import { bus } from './EventBus.js';

const BASE_SENS = 0.0022; // radians per pixel at sensitivity 1.0

export const KEYBINDS = [
  ['W A S D', 'Move'], ['Mouse', 'Look'], ['LMB', 'Fire'], ['RMB', 'Aim (ADS)'],
  ['Shift', 'Sprint'], ['Space', 'Jump'], ['C', 'Crouch'], ['Ctrl (while sprinting)', 'Slide'],
  ['R', 'Reload'], ['1 / 2', 'Select weapon'], ['Q', 'Swap weapon'], ['F', 'Interact / Extract'],
  ['Esc', 'Pause'],
];

export class KeyboardMouse {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this.keys = new Set();
    this.locked = false;
    this._sprintLatch = false;
    this._crouchLatch = false;
    this._adsLatch = false;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onContext = e => e.preventDefault();
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.canvas.addEventListener('contextmenu', this._onContext);
  }
  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.canvas.removeEventListener('contextmenu', this._onContext);
    this.keys.clear();
    this._sprintLatch = this._crouchLatch = this._adsLatch = false;
    input.resetHeld();
    this.unlock();
  }

  requestLock() {
    if (document.pointerLockElement === this.canvas) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* */ } });
    } catch { try { this.canvas.requestPointerLock(); } catch { /* */ } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    bus.emit('input:lock', this.locked);
    if (!this.locked) { input.fire = false; input.ads = false; }
  }

  _onKeyDown(e) {
    if (e.repeat) return;
    const c = e.code;
    if (c === 'Escape') { input.pause = true; return; }
    // Don't steal typing focus from inputs.
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    this.keys.add(c);
    if (c === 'Space') { input.jump = true; e.preventDefault(); }
    else if (c === 'KeyR') input.reload = true;
    else if (c === 'KeyQ') input.swap = true;
    else if (c === 'Digit1') input.weaponSlot = 1;
    else if (c === 'Digit2') input.weaponSlot = 2;
    else if (c === 'KeyC') {
      if (settings.get('crouchToggle')) { this._crouchLatch = !this._crouchLatch; input.crouch = this._crouchLatch; }
      else input.crouch = true;
    }
    else if (c === 'ControlLeft' || c === 'ControlRight') { input.crouch = true; e.preventDefault(); }
    else if (c === 'ShiftLeft' || c === 'ShiftRight') {
      if (settings.get('sprintToggle')) { this._sprintLatch = !this._sprintLatch; input.sprint = this._sprintLatch; }
      else input.sprint = true;
    }
    else if (c === 'KeyF') input.interact = true;
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(c)) e.preventDefault();
    this._updateMove();
  }
  _onKeyUp(e) {
    const c = e.code;
    this.keys.delete(c);
    if (c === 'KeyC' && !settings.get('crouchToggle')) input.crouch = false;
    if (c === 'ControlLeft' || c === 'ControlRight') { if (!this._crouchLatch) input.crouch = false; }
    if ((c === 'ShiftLeft' || c === 'ShiftRight') && !settings.get('sprintToggle')) input.sprint = false;
    if (c === 'KeyF') input.interact = false;
    this._updateMove();
  }
  _updateMove() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y) || 1;
    input.move.x = x / l; input.move.y = y / l;
    // Moving backwards/sideways cancels sprint latch feel-wise; keep simple: sprint needs forward
  }
  _onMouseMove(e) {
    if (!this.locked) return;
    const s = BASE_SENS * settings.get('mouseSens') * (input.ads ? settings.get('adsSensMult') : 1);
    const inv = settings.get('invertY') ? -1 : 1;
    input.addLook(-e.movementX * s, -e.movementY * s * inv);
  }
  _onMouseDown(e) {
    if (!this.locked) { if (e.target === this.canvas) this.requestLock(); return; }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) {
      if (settings.get('adsToggle')) { this._adsLatch = !this._adsLatch; input.ads = this._adsLatch; }
      else input.ads = true;
    }
  }
  _onMouseUp(e) {
    if (e.button === 0) input.fire = false;
    if (e.button === 2 && !settings.get('adsToggle')) input.ads = false;
  }
  /** Called by player when sprint ends (e.g. slide) to clear latch. */
  clearSprint() { this._sprintLatch = false; input.sprint = false; }
  clearCrouch() { this._crouchLatch = false; input.crouch = false; }
}

import * as THREE from 'three';

export const PHYS = {
  gravity: -22,
  jumpVel: 7.2,
  groundAccel: 40,
  groundFriction: 10,
  airAccel: 6,
  stepHeight: 0.4,
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.2,
};

const _corr = new THREE.Vector3();
const _start = new THREE.Vector3();
const _end = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _v = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _o = new THREE.Vector3();
const RAY_OFFS = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]];

/**
 * Capsule character controller shared by player and bots.
 * `position` is the FEET point. The collision capsule "floats" `stepHeight` above the feet and a
 * set of short downward rays keep the feet glued to the ground — this is what lets the character
 * glide up stairs, curbs and sandbags (anything <= stepHeight) without explicit step logic.
 */
export class CharacterController {
  constructor(world, opts = {}) {
    this.world = world;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = opts.radius ?? PHYS.radius;
    this.height = opts.height ?? PHYS.standHeight;
    this.step = opts.step ?? PHYS.stepHeight;
    this.onGround = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this._lastGroundTime = 0;
    this.time = 0;
  }

  /**
   * @param {THREE.Vector3} wishDir world-space desired direction (xz), length <= 1
   * @param {number} speed target speed m/s
   */
  move(wishDir, speed, dt) {
    this.time += dt;
    const v = this.velocity;
    _wish.set(wishDir.x, 0, wishDir.z);
    const wl = _wish.length(); if (wl > 1) _wish.divideScalar(wl);
    if (this.onGround) {
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) { const ns = Math.max(sp - sp * PHYS.groundFriction * dt, 0) / sp; v.x *= ns; v.z *= ns; }
    }
    const dx = _wish.x * speed - v.x, dz = _wish.z * speed - v.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) {
      const k = this.onGround ? Math.min(dl, PHYS.groundAccel * dt) : (wl > 0 ? Math.min(dl, PHYS.airAccel * dt) : 0);
      v.x += dx / dl * k; v.z += dz / dl * k;
    }
    v.y += PHYS.gravity * dt;
    if (v.y < -40) v.y = -40;

    const wasGround = this.onGround;
    const steps = Math.max(1, Math.ceil(v.length() * dt / (this.radius * 0.5)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.position.addScaledVector(v, sdt);
      this._collide(sdt, wasGround);
    }
  }

  _capsule(h = this.height) {
    const r = this.radius;
    _start.set(this.position.x, this.position.y + this.step + r, this.position.z);
    _end.set(this.position.x, this.position.y + Math.max(h - r, this.step + r + 0.05), this.position.z);
  }

  _collide(dt, wasGround) {
    const r = this.radius;
    let grounded = false;
    // 1) Push the floating capsule out of walls / ceilings / tall obstacles.
    for (let it = 0; it < 4; it++) {
      this._capsule();
      if (!this.world.resolveCapsule(_start, _end, r, _corr)) break;
      const len = _corr.length(); if (len < 1e-6) break;
      const n = _v.copy(_corr).divideScalar(len);
      this.position.add(_corr);
      const vn = this.velocity.dot(n);
      if (vn < 0) this.velocity.addScaledVector(n, -vn);
      if (n.y > 0.55) { grounded = true; this.groundNormal.copy(n); }
    }
    // 2) Ground rays from the bottom sphere centre. Reach = step + r (+ stick margin when we were grounded).
    if (this.velocity.y <= 0.01) {
      const reach = this.step + r + (wasGround ? 0.3 : 0.05);
      let best = null;
      for (const [ox, oz] of RAY_OFFS) {
        _o.set(this.position.x + ox * r, this.position.y + this.step + r, this.position.z + oz * r);
        const h = this.world.raycast(_o, _down, reach);
        if (h && h.normal.y > 0.55 && (!best || h.point.y > best.point.y)) best = { point: h.point.clone(), normal: h.normal.clone() };
      }
      if (best) {
        grounded = true;
        this.groundNormal.copy(best.normal);
        const targetY = best.point.y;
        // Smooth when climbing (stairs glide), instant when the ground is below us.
        if (targetY > this.position.y) this.position.y += (targetY - this.position.y) * Math.min(1, dt * 18);
        else this.position.y = targetY;
        if (this.velocity.y < 0) this.velocity.y = 0;
      }
    }
    this.onGround = grounded;
    if (grounded) this._lastGroundTime = this.time;
  }

  canJump(coyote = 0.12) { return this.onGround || (this.time - this._lastGroundTime) < coyote; }
  jump(vel = PHYS.jumpVel) { this.velocity.y = vel; this.onGround = false; this._lastGroundTime = -10; }

  /** Try to change height (crouch/stand). Returns false if blocked overhead. */
  setHeight(h) {
    if (h <= this.height) { this.height = h; return true; }
    this._capsule(h);
    if (this.world.resolveCapsule(_start, _end, this.radius * 0.95, _corr) && _corr.y < -0.001) return false;
    this.height = h; return true;
  }

  teleport(p) { this.position.copy(p); this.velocity.set(0, 0, 0); this.onGround = false; }
}

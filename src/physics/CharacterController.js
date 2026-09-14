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

/**
 * Capsule character controller shared by player and bots.
 * `position` is the capsule's FEET point. Height changes (crouch) are handled by `height`.
 * Uses sub-stepped move + iterative capsule push-out against the WorldCollider BVH.
 */
export class CharacterController {
  constructor(world, opts = {}) {
    this.world = world;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = opts.radius ?? PHYS.radius;
    this.height = opts.height ?? PHYS.standHeight;
    this.onGround = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this._lastGroundTime = 0;
    this.time = 0;
  }

  /**
   * @param {THREE.Vector3} wishDir world-space desired direction (xz), length <= 1
   * @param {number} speed target speed m/s
   * @param {number} dt
   */
  move(wishDir, speed, dt) {
    this.time += dt;
    const v = this.velocity;
    // Horizontal acceleration (Quake-style but friction-based for weight)
    _wish.set(wishDir.x, 0, wishDir.z);
    const wl = _wish.length(); if (wl > 1) _wish.divideScalar(wl);
    const accel = this.onGround ? PHYS.groundAccel : PHYS.airAccel;
    if (this.onGround) {
      // friction
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const drop = sp * PHYS.groundFriction * dt;
        const ns = Math.max(sp - drop, 0) / sp;
        v.x *= ns; v.z *= ns;
      }
    }
    // accelerate toward wish velocity
    const targetX = _wish.x * speed, targetZ = _wish.z * speed;
    const dx = targetX - v.x, dz = targetZ - v.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) {
      const add = Math.min(dl, accel * dt * (this.onGround ? 1 : 0.5) * Math.max(wl, this.onGround ? 1 : 0));
      // In air only accelerate if input present
      const k = this.onGround ? add : (wl > 0 ? Math.min(dl, accel * dt) : 0);
      v.x += dx / dl * k; v.z += dz / dl * k;
    }
    // Gravity
    v.y += PHYS.gravity * dt;
    if (v.y < -40) v.y = -40;

    // Integrate in substeps for tunnelling safety
    const steps = Math.max(1, Math.ceil(v.length() * dt / (this.radius * 0.5)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.position.addScaledVector(v, sdt);
      this._collide(dt);
    }
    // ground stick: if we were on ground and are slightly above, snap down gently
  }

  _collide() {
    const r = this.radius;
    let grounded = false;
    let steepest = 1;
    // iterative resolution
    for (let it = 0; it < 4; it++) {
      _start.set(this.position.x, this.position.y + r, this.position.z);
      _end.set(this.position.x, this.position.y + this.height - r, this.position.z);
      const hit = this.world.resolveCapsule(_start, _end, r, _corr);
      if (!hit) break;
      const len = _corr.length();
      if (len < 1e-6) break;
      const n = _v.copy(_corr).divideScalar(len);
      // Apply correction; treat as step if it is small vertical lift on a walkable slope
      this.position.add(_corr);
      // Remove velocity into the surface
      const vn = this.velocity.dot(n);
      if (vn < 0) this.velocity.addScaledVector(n, -vn);
      if (n.y > 0.55) { grounded = true; if (n.y < steepest) { steepest = n.y; this.groundNormal.copy(n); } }
      else if (n.y < -0.5 && this.velocity.y > 0) this.velocity.y = 0; // head bump
    }
    // Ground probe (short ray under feet) so walking off small ledges keeps us grounded briefly.
    if (!grounded && this.velocity.y <= 0.5) {
      const h = this.world.raycast(_start.set(this.position.x, this.position.y + r, this.position.z), _v.set(0, -1, 0), r + 0.12);
      if (h && h.normal.y > 0.55) {
        grounded = true;
        // snap to ground
        const dy = (h.point.y) - this.position.y;
        if (dy > -0.12 && dy < 0.02) { this.position.y = h.point.y; if (this.velocity.y < 0) this.velocity.y = 0; }
      }
    }
    this.onGround = grounded;
    if (grounded) { this._lastGroundTime = this.time; if (this.velocity.y < 0) this.velocity.y = Math.max(this.velocity.y, -2); }
  }

  /** Coyote time helper */
  canJump(coyote = 0.12) { return this.onGround || (this.time - this._lastGroundTime) < coyote; }
  jump(vel = PHYS.jumpVel) { this.velocity.y = vel; this.onGround = false; this._lastGroundTime = -10; }

  /** Try to change height (crouch/stand). Returns false if blocked overhead. */
  setHeight(h) {
    if (h <= this.height) { this.height = h; return true; }
    _start.set(this.position.x, this.position.y + this.radius, this.position.z);
    _end.set(this.position.x, this.position.y + h - this.radius, this.position.z);
    if (this.world.resolveCapsule(_start, _end, this.radius * 0.95, _corr) && _corr.y < -0.001) return false;
    this.height = h; return true;
  }

  teleport(p) { this.position.copy(p); this.velocity.set(0, 0, 0); }
}

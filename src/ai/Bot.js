import * as THREE from 'three';
import { CharacterController } from '../physics/CharacterController.js';
import { audio } from '../core/Audio.js';

const STATE = { IDLE: 0, ALERT: 1, CHASE: 2, SHOOT: 3, COVER: 4, DEAD: 5 };
export { STATE };
const _to = new THREE.Vector3(), _eye = new THREE.Vector3(), _pe = new THREE.Vector3(), _dir = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

// Shared geometry/materials for all bots (cheap)
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const body = new THREE.MeshStandardMaterial({ color: 0x4a4f3c, roughness: 0.85 });
  const vest = new THREE.MeshStandardMaterial({ color: 0x2b2d28, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9c7a5a, roughness: 0.9 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0x5c5a45, roughness: 0.7 });
  const gun = new THREE.MeshStandardMaterial({ color: 0x1f2225, roughness: 0.5, metalness: 0.5 });
  SHARED = {
    torso: new THREE.BoxGeometry(0.5, 0.65, 0.3), vestG: new THREE.BoxGeometry(0.54, 0.5, 0.36),
    head: new THREE.SphereGeometry(0.15, 10, 8), helmetG: new THREE.SphereGeometry(0.175, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    legs: new THREE.BoxGeometry(0.2, 0.85, 0.22), arm: new THREE.BoxGeometry(0.13, 0.6, 0.13), gunG: new THREE.BoxGeometry(0.06, 0.08, 0.6),
    body, vest, skin, helmet, gun,
  };
  return SHARED;
}

export class Bot {
  constructor(world, scene, mgr) {
    this.world = world; this.scene = scene; this.mgr = mgr;
    this.ctrl = new CharacterController(world, { radius: 0.32, height: 1.75 });
    this.hp = 100; this.state = STATE.IDLE; this.alive = false;
    this.yaw = 0; this.targetYaw = 0;
    this.stateT = 0; this.burst = 0; this.burstGap = 0; this.shotCd = 0; this.lastSeen = new THREE.Vector3(); this.seenT = 99;
    this.strafeDir = 1; this.strafeT = 0; this.deathT = 0;
    this.walkT = 0;
    this._buildMesh();
    this.headPos = new THREE.Vector3();
    this.bodyCenter = new THREE.Vector3();
    this.awareness = 0;
    this.skill = 1;
  }
  _buildMesh() {
    const S = shared();
    const g = new THREE.Group();
    this.legL = new THREE.Mesh(S.legs, S.body); this.legL.position.set(-0.13, 0.425, 0);
    this.legR = new THREE.Mesh(S.legs, S.body); this.legR.position.set(0.13, 0.425, 0);
    const torso = new THREE.Mesh(S.torso, S.body); torso.position.y = 1.18;
    const vest = new THREE.Mesh(S.vestG, S.vest); vest.position.y = 1.2;
    this.head = new THREE.Mesh(S.head, S.skin); this.head.position.y = 1.65;
    const helmet = new THREE.Mesh(S.helmetG, S.helmet); helmet.position.y = 1.66;
    this.armL = new THREE.Mesh(S.arm, S.body); this.armL.position.set(-0.32, 1.15, 0);
    this.armR = new THREE.Mesh(S.arm, S.body); this.armR.position.set(0.32, 1.15, 0);
    this.gun = new THREE.Mesh(S.gunG, S.gun); this.gun.position.set(0.12, 1.25, -0.35);
    g.add(this.legL, this.legR, torso, vest, this.head, helmet, this.armL, this.armR, this.gun);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    g.visible = false;
    this.mesh = g; this.scene.add(g);
    this.mesh.userData.bot = this;
  }

  spawn(pos, skill = 1) {
    this.ctrl.teleport(pos); this.hp = 100; this.alive = true; this.state = STATE.IDLE; this.stateT = 0;
    this.mesh.visible = true; this.mesh.rotation.set(0, 0, 0); this.mesh.scale.setScalar(1); this.mesh.position.copy(pos);
    this.skill = skill; this.awareness = 0; this.seenT = 99; this.deathT = 0;
    this.headPos.set(pos.x, pos.y + 1.65, pos.z); this.bodyCenter.set(pos.x, pos.y + 1.0, pos.z);
    this.mesh.traverse(o => { if (o.material) { o.material.transparent = false; o.material.opacity = 1; } });
  }

  /** Returns true if killed. */
  damage(amount, head, dir) {
    if (!this.alive) return false;
    this.hp -= amount; this.awareness = 1; this.seenT = 0; this.lastSeen.copy(this.mgr.player.position);
    if (this.state === STATE.IDLE) this.state = STATE.ALERT;
    if (this.hp <= 0) { this.die(dir); return true; }
    return false;
  }
  die(dir) {
    this.alive = false; this.state = STATE.DEAD; this.deathT = 0;
    this.fallDir = new THREE.Vector3(dir?.x || 0, 0, dir?.z || 1).normalize();
    this.mgr.onBotDied(this);
  }

  update(dt, player) {
    if (this.state === STATE.DEAD) { this._updateDeath(dt); return; }
    this.stateT += dt; this.shotCd -= dt; this.strafeT -= dt;
    const p = this.ctrl.position;
    _eye.set(p.x, p.y + 1.6, p.z);
    player.getEye(_pe);
    _to.subVectors(_pe, _eye);
    const dist = _to.length();
    // ---- perception ----
    let sees = false;
    if (player.alive && dist < 55) {
      _dir.copy(_to).divideScalar(dist);
      const fwd = _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const cosA = fwd.x * _dir.x + fwd.z * _dir.z;
      const inFov = cosA > Math.cos(THREE.MathUtils.degToRad(this.state === STATE.IDLE ? 60 : 85));
      if ((inFov || dist < 6 || this.awareness > 0.5) && this.world.clear(_eye, _pe)) sees = true;
    }
    if (sees) { this.seenT = 0; this.lastSeen.copy(player.position); this.awareness = Math.min(1, this.awareness + dt * (dist < 20 ? 4 : 1.5)); }
    else { this.seenT += dt; this.awareness = Math.max(0, this.awareness - dt * 0.15); }

    // ---- FSM ----
    let wish = _w.set(0, 0, 0), speed = 0;
    switch (this.state) {
      case STATE.IDLE:
        if (this.awareness > 0.3) this._set(STATE.ALERT);
        // slow patrol towards map centre-ish
        else { speed = 1.6; wish = this._steer(_tmp.set(Math.sin(this.stateT * 0.3) * 20, 0, Math.cos(this.stateT * 0.23) * 20), p); this._face(wish); }
        break;
      case STATE.ALERT:
        this._faceTo(this.lastSeen, p);
        if (this.awareness > 0.9 && sees) this._set(dist < 26 ? STATE.SHOOT : STATE.CHASE);
        else if (this.stateT > 0.6) this._set(STATE.CHASE);
        break;
      case STATE.CHASE:
        speed = 4.2; wish = this._steer(this.lastSeen, p); this._face(wish);
        if (sees && dist < 28) this._set(STATE.SHOOT);
        if (!sees && this.seenT > 8 && p.distanceTo(this.lastSeen) < 2.5) this._set(STATE.IDLE);
        break;
      case STATE.SHOOT: {
        this._faceTo(player.position, p);
        // strafe & occasionally push forward
        if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.8 + Math.random() * 1.4; }
        const right = _tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        wish.copy(right).multiplyScalar(this.strafeDir);
        if (dist > 18) wish.addScaledVector(_dir, 0.8);
        if (dist < 7) wish.addScaledVector(_dir, -0.6);
        speed = 2.6;
        wish = this._avoid(wish, p);
        if (sees) this._shoot(dt, player, dist);
        if (!sees && this.seenT > 1.2) this._set(STATE.CHASE);
        if (this.hp < 40 && Math.random() < dt * 0.4) this._set(STATE.COVER);
        break;
      }
      case STATE.COVER: {
        // retreat from player for a moment then re-engage
        _dir.subVectors(p, player.position).setY(0).normalize();
        wish = this._avoid(_dir, p); speed = 4.0; this._face(_tmp.copy(wish).negate());
        if (sees && this.shotCd <= 0 && Math.random() < dt * 2) this._shoot(dt, player, dist);
        if (this.stateT > 2.2) this._set(STATE.SHOOT);
        break;
      }
    }
    this.ctrl.move(wish, speed, dt);
    // bots can't leave map bounds
    const B = this.mgr.bounds - 1.5;
    p.x = THREE.MathUtils.clamp(p.x, -B, B); p.z = THREE.MathUtils.clamp(p.z, -B, B);
    // unstuck: jump if stuck against something while wanting to move
    if (speed > 0 && this.ctrl.onGround && Math.hypot(this.ctrl.velocity.x, this.ctrl.velocity.z) < 0.4 && Math.random() < dt * 0.8) this.ctrl.jump(6);
    // smooth yaw
    let d = this.targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 8);
    // animate
    this._animate(dt, speed > 0 ? Math.hypot(this.ctrl.velocity.x, this.ctrl.velocity.z) : 0);
  }
  _set(s) { this.state = s; this.stateT = 0; this.burst = 0; }
  _face(v) { if (v.lengthSq() > 1e-4) this.targetYaw = Math.atan2(-v.x, -v.z); }
  _faceTo(target, p) { this.targetYaw = Math.atan2(-(target.x - p.x), -(target.z - p.z)); }
  _steer(target, p) {
    _dir.subVectors(target, p).setY(0);
    if (_dir.lengthSq() < 0.5) return _dir.set(0, 0, 0);
    _dir.normalize();
    return this._avoid(_dir, p);
  }
  /** Three whisker raycasts at knee height; deflect from obstacles. */
  _avoid(dir, p) {
    const out = _w.copy(dir);
    if (out.lengthSq() < 1e-6) return out;
    out.normalize();
    _eye.set(p.x, p.y + 0.9, p.z);
    const probe = (ang, len) => {
      _q.setFromAxisAngle(_tmp.set(0, 1, 0), ang);
      const d = _dir.copy(out).applyQuaternion(_q);
      const h = this.world.raycast(_eye, d, len);
      return h ? 1 - h.distance / len : 0;
    };
    const c = probe(0, 2.2), l = probe(0.6, 1.6), r = probe(-0.6, 1.6);
    if (c > 0 || l > 0 || r > 0) {
      const turn = (l - r) * 1.5 + (c > 0 ? (l >= r ? -1 : 1) * c * 1.5 : 0);
      _q.setFromAxisAngle(_tmp.set(0, 1, 0), turn);
      out.applyQuaternion(_q);
    }
    return out;
  }
  _shoot(dt, player, dist) {
    if (this.shotCd > 0) return;
    if (this.burst <= 0) {
      if (this.burstGap > 0) { this.burstGap -= dt; return; }
      this.burst = 3 + Math.floor(Math.random() * 3); this.burstGap = 0.9 + Math.random() * 0.9 / this.skill;
    }
    this.burst--; this.shotCd = 0.11;
    // accuracy: 35% at 30m scaled; better when player still / closer
    const base = 0.35 * this.skill;
    const pv = Math.hypot(player.ctrl.velocity.x, player.ctrl.velocity.z);
    const acc = THREE.MathUtils.clamp(base * (30 / Math.max(8, dist)) * (1 - Math.min(0.5, pv * 0.06)) * (player.crouchT > 0.5 ? 0.75 : 1), 0.04, 0.85);
    const p = this.ctrl.position;
    _eye.set(p.x, p.y + 1.35, p.z);
    _pe.set(player.position.x, player.position.y + player.eyeHeight - 0.3, player.position.z);
    const hit = Math.random() < acc;
    const end = _tmp.copy(_pe);
    if (!hit) end.add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2.5));
    _dir.subVectors(end, _eye).normalize();
    const wh = this.world.raycast(_eye, _dir, dist + 5);
    const blocked = wh && wh.distance < dist - 0.5;
    const tEnd = blocked ? wh.point : end.clone().addScaledVector(_dir, hit ? 0 : 30);
    this.mgr.fx.tracer(_eye.clone().addScaledVector(_dir, 0.7), tEnd);
    if (blocked) this.mgr.fx.spark(wh.point, wh.normal, 3);
    else if (hit) player.takeDamage(9 * this.skill, p);
    else audio.whizz(this._pan(player));
    audio.gunshot({ kind: 'ar', pan: this._pan(player), dist });
    this.mgr.fx.muzzle(_eye.clone().addScaledVector(_dir, 0.8));
  }
  _pan(player) {
    const p = this.ctrl.position;
    const right = _w.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const d = _dir.subVectors(p, player.position).setY(0).normalize();
    return d.dot(right);
  }
  _animate(dt, speed) {
    const p = this.ctrl.position;
    this.mesh.position.copy(p); this.mesh.rotation.y = this.yaw;
    this.walkT += dt * speed * 2.4;
    const s = Math.sin(this.walkT) * Math.min(1, speed / 3) * 0.6;
    this.legL.rotation.x = s; this.legR.rotation.x = -s;
    this.armL.rotation.x = -0.9 + s * 0.2; this.armR.rotation.x = -1.1;
    this.armL.position.z = -0.2; this.armR.position.z = -0.22;
    this.headPos.set(p.x, p.y + 1.65, p.z);
    this.bodyCenter.set(p.x, p.y + 1.0, p.z);
  }
  _updateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.5);
    const e = 1 - (1 - t) * (1 - t);
    this.mesh.rotation.x = e * Math.PI / 2 * -Math.cos(this.mesh.rotation.y - Math.atan2(-this.fallDir.x, -this.fallDir.z));
    this.mesh.rotation.z = e * 0.2;
    if (this.deathT > 4) {
      const f = Math.max(0, 1 - (this.deathT - 4) / 1.5);
      this.mesh.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = f; } });
      if (f <= 0) { this.mesh.visible = false; this.state = -1; this.mesh.traverse(o => { if (o.material) { o.material.transparent = false; o.material.opacity = 1; } }); }
    }
  }
  /** Ray vs this bot's hitboxes: head sphere + body capsule-ish (cylinder approx). */
  raycast(origin, dir, maxD) {
    if (!this.alive) return null;
    const p = this.ctrl.position;
    // Head sphere
    const rh = raySphere(origin, dir, this.headPos, 0.2);
    if (rh !== null && rh < maxD) return { distance: rh, head: true, point: origin.clone().addScaledVector(dir, rh), bot: this };
    // Body: vertical segment from feet+0.1 to 1.5, radius 0.32 → sphere-swept approx using closest approach
    const rb = rayCapsule(origin, dir, _tmp.set(p.x, p.y + 0.35, p.z), _w.set(p.x, p.y + 1.45, p.z), 0.3);
    if (rb !== null && rb < maxD) return { distance: rb, head: false, point: origin.clone().addScaledVector(dir, rb), bot: this };
    return null;
  }
}

// ----- analytic ray tests -----
const _oc = new THREE.Vector3(), _ab = new THREE.Vector3(), _ao = new THREE.Vector3();
function raySphere(o, d, c, r) {
  _oc.subVectors(o, c);
  const b = _oc.dot(d), cc = _oc.dot(_oc) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
function rayCapsule(o, d, a, b, r) {
  // Ray vs infinite cylinder around segment ab, clamped to segment extent; plus end spheres.
  _ab.subVectors(b, a); _ao.subVectors(o, a);
  const abab = _ab.dot(_ab), abd = _ab.dot(d), abao = _ab.dot(_ao);
  const A = abab - abd * abd, B = abab * _ao.dot(d) - abao * abd, C = abab * _ao.dot(_ao) - abao * abao - r * r * abab;
  let best = null;
  if (Math.abs(A) > 1e-6) {
    const disc = B * B - A * C;
    if (disc >= 0) {
      const t = (-B - Math.sqrt(disc)) / A;
      if (t > 0) { const y = abao + t * abd; if (y >= 0 && y <= abab) best = t; }
    }
  }
  const ta = raySphere(o, d, a, r), tb = raySphere(o, d, b, r);
  for (const t of [ta, tb]) if (t !== null && (best === null || t < best)) best = t;
  return best;
}

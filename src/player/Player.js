import * as THREE from 'three';
import { CharacterController, PHYS } from '../physics/CharacterController.js';
import { input } from '../core/Input.js';
import { settings } from '../core/Settings.js';
import { audio } from '../core/Audio.js';
import { bus } from '../core/EventBus.js';
import { WEAPONS, WeaponState } from './Weapon.js';

const SPEED = { walk: 4.6, sprint: 7.0, ads: 2.6, crouch: 2.4, slideBurst: 9.0, slideTime: 0.9 };
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3();
const _dir = new THREE.Vector3(), _origin = new THREE.Vector3(), _q = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class Player {
  constructor(world, camera, effects, targets) {
    this.world = world; this.camera = camera; this.fx = effects; this.targets = targets; // targets: BotManager (hit tests)
    this.ctrl = new CharacterController(world);
    this.yaw = 0; this.pitch = 0;
    this.recoilPitch = 0; this.recoilYaw = 0;         // accumulated recoil offset (radians)
    this.hp = 100; this.maxHp = 100; this.armor = 50; this.maxArmor = 50;
    this.alive = true;
    this.weapons = [new WeaponState(WEAPONS.ar), new WeaponState(WEAPONS.smg)];
    this.wi = 0;
    this.ads = 0;             // 0..1 smoothed
    this.crouchT = 0;         // 0..1 smoothed
    this.sliding = 0;         // time remaining
    this.slideDir = new THREE.Vector3();
    this.sprinting = false;
    this.bobT = 0; this.bobY = 0; this.landBump = 0; this._wasGround = true; this._lastStep = 0;
    this.baseFov = settings.get('fov');
    this.fovKick = 0;
    this.shake = 0;
    this.regenTimer = 0;
    this.kills = 0; this.shotsFired = 0; this.shotsHit = 0;
    this.viewModel = null;
    this.onHit = null; // (isHead, killed) hitmarker callback
    this.aimingAtEnemy = false;
    bus.on('settings:change', k => { if (k === 'fov') this.baseFov = settings.get('fov'); });
  }
  get weapon() { return this.weapons[this.wi]; }
  get eyeHeight() { return this.ctrl.height - 0.15; }
  get position() { return this.ctrl.position; }

  spawn(pos, yaw) {
    this.spawnPos = pos.clone(); this.ctrl.teleport(pos); this.yaw = yaw; this.pitch = 0; this.hp = this.maxHp; this.armor = this.maxArmor; this.alive = true;
    this.weapons.forEach(w => w.refill()); this.wi = 0; this.viewModel?.setWeapon('ar'); this.sliding = 0; this.crouchT = 0; this.ads = 0;
    this.recoilPitch = this.recoilYaw = 0; this.kills = 0; this.shotsFired = 0; this.shotsHit = 0;
  }

  /** Fixed-step simulation. */
  update(dt) {
    if (!this.alive) { this.ctrl.move(_wish.set(0, 0, 0), 0, dt); return; }
    const w = this.weapon;
    // ---- look ----
    const [dx, dy] = input.consumeLook();
    this._lookDX = dx; this._lookDY = dy;
    this.yaw += dx; this.pitch += dy;
    // Recoil recovery: decay the accumulated kick and apply the same delta to the real view angles,
    // so the camera settles back toward where the player was aiming (DF-style recoil recentre).
    const prevRP = this.recoilPitch, prevRY = this.recoilYaw;
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, w.def.recoilRecover, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, w.def.recoilRecover, dt);
    // If the player counter-pulls (mouse down) while recoil is active, consume the offset instead of fighting them.
    if (dy < 0 && this.recoilPitch > 0) this.recoilPitch = Math.max(0, this.recoilPitch + dy);
    this.pitch -= (prevRP - this.recoilPitch) * (dy < 0 ? 0 : 1);
    this.yaw -= (prevRY - this.recoilYaw);
    const lim = Math.PI / 2 - 0.02;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -lim, lim);

    // ---- states ----
    const wantCrouch = input.crouch;
    const moving = Math.hypot(input.move.x, input.move.y) > 0.1;
    const forward = input.move.y > 0.5;
    const isReloading = w.reloading > 0;
    // Sprint: needs forward input, on ground-ish, no ADS, no fire
    const wantSprint = input.sprint && forward && !input.ads && !input.fire && this.sliding <= 0;
    // Slide trigger: sprint + crouch press while grounded
    if (this.sprinting && wantCrouch && this.ctrl.onGround && this.sliding <= 0 && !this._slideLatch) {
      this.sliding = SPEED.slideTime; this._slideLatch = true;
      this.slideDir.set(Math.sin(this.yaw) * -1, 0, Math.cos(this.yaw) * -1).normalize(); // forward
      this.ctrl.velocity.x = this.slideDir.x * SPEED.slideBurst; this.ctrl.velocity.z = this.slideDir.z * SPEED.slideBurst;
      this.fovKick = 6;
    }
    if (!wantCrouch) this._slideLatch = false;
    // Reloading blocks sprint (DF: you can't sprint-reload). Empty-mag reloads are never cancelled.
    this.sprinting = wantSprint && !isReloading;

    // Crouch height
    const crouched = this.sliding > 0 || wantCrouch;
    const targetH = crouched ? PHYS.crouchHeight : PHYS.standHeight;
    if (targetH !== this.ctrl.height) {
      if (!this.ctrl.setHeight(targetH)) { /* blocked: stay crouched */ }
    }
    this.crouchT = THREE.MathUtils.damp(this.crouchT, this.ctrl.height < 1.5 ? 1 : 0, 12, dt);

    // ADS smoothing (blocked while sprinting/sliding/reloading-draw)
    const adsWanted = input.ads && !this.sprinting && w.drawTimer <= 0;
    this.ads = THREE.MathUtils.damp(this.ads, adsWanted ? 1 : 0, 1 / w.def.adsTime * 0.9, dt);

    // ---- movement ----
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _wish.set(0, 0, 0).addScaledVector(_fwd, input.move.y).addScaledVector(_right, input.move.x);
    let speed = SPEED.walk;
    if (this.sprinting) speed = SPEED.sprint;
    else if (this.crouchT > 0.5) speed = SPEED.crouch;
    if (this.ads > 0.3) speed = Math.min(speed, THREE.MathUtils.lerp(SPEED.walk, SPEED.ads, this.ads));
    if (input.move.y < -0.3) speed *= 0.85;
    if (this.sliding > 0) {
      this.sliding -= dt;
      // slide: ignore input, decaying velocity via friction (controller handles), keep small steer
      _wish.copy(this.slideDir).addScaledVector(_right, input.move.x * 0.3);
      speed = SPEED.slideBurst * Math.max(0.3, this.sliding / SPEED.slideTime);
      if (Math.hypot(this.ctrl.velocity.x, this.ctrl.velocity.z) < 2.5) this.sliding = 0;
    }
    // Jump
    if (input.take('jump')) {
      if (this.ctrl.canJump() && this.ctrl.height > 1.5 && this.sliding <= 0) { this.ctrl.jump(); this.fovKick = 2; }
    }
    const wasGround = this.ctrl.onGround;
    const vyBefore = this.ctrl.velocity.y;
    this.ctrl.move(_wish, speed, dt);
    if (!wasGround && this.ctrl.onGround) { this.landBump = Math.min(0.12, Math.abs(vyBefore) * 0.012); audio.footstep(true); this.shake += Math.min(0.5, Math.abs(vyBefore) * 0.03); }
    // Head bob + footsteps
    const hs = Math.hypot(this.ctrl.velocity.x, this.ctrl.velocity.z);
    if (this.ctrl.onGround && hs > 0.5 && this.sliding <= 0) {
      const freq = this.sprinting ? 12 : (this.crouchT > 0.5 ? 6 : 9);
      const prev = this.bobT; this.bobT += dt * freq * Math.min(1, hs / SPEED.walk);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bobT / Math.PI)) audio.footstep(this.sprinting);
      const amp = (this.sprinting ? 0.05 : 0.035) * (1 - this.ads * 0.7) * (this.crouchT > 0.5 ? 0.5 : 1);
      this.bobY = Math.abs(Math.sin(this.bobT)) * amp;
    } else this.bobY = THREE.MathUtils.damp(this.bobY, 0, 10, dt);
    this.landBump = THREE.MathUtils.damp(this.landBump, 0, 8, dt);
    this.fovKick = THREE.MathUtils.damp(this.fovKick, 0, 6, dt);
    this.shake = THREE.MathUtils.damp(this.shake, 0, 7, dt);

    // Out-of-world safety
    if (this.ctrl.position.y < -20) this.ctrl.teleport(this.spawnPos || new THREE.Vector3(-58, 4, -62));

    // ---- weapons ----
    const slot = input.takeSlot();
    if (slot === 1 || slot === 2) this.switchTo(slot - 1);
    if (input.take('swap')) this.switchTo(1 - this.wi);
    if (input.take('reload')) { if (w.startReload()) { this.viewModel?.onReload(w.def.reload); this.sprinting = false; } }
    this.weapons.forEach(ws => ws.update(dt));
    if (w.ammo === 0 && w.reloading <= 0 && w.reserve > 0 && w.drawTimer <= 0) { if (w.startReload()) this.viewModel?.onReload(w.def.reload); }
    // Auto-fire for touch (settings) when crosshair over enemy
    const autoFire = settings.inputMode === 'touch' && settings.get('autoFire') && this.aimingAtEnemy && !this.sprinting;
    if ((input.fire || autoFire) && !this.sprinting) {
      if (w.canFire) this.fire(w);
      else if (w.ammo === 0 && w.reserve === 0 && w.cooldown <= 0) { audio.dryFire(); w.cooldown = 0.25; }
    }
    // Regen (DF style: armor doesn't regen, HP regen slowly after 5s)
    this.regenTimer += dt;
    if (this.regenTimer > 5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 6 * dt);
  }

  switchTo(i) {
    if (i === this.wi || i < 0 || i > 1) return;
    this.weapon.cancelReload();
    this.wi = i; this.weapon.drawTimer = 0.35; this.viewModel?.setWeapon(this.weapon.def.id); audio.click();
  }

  fire(w) {
    w.fire(); this.shotsFired++;
    const d = w.def;
    // Spread (deg): base or ads + accumulated + movement
    const hs = Math.hypot(this.ctrl.velocity.x, this.ctrl.velocity.z);
    let spread = THREE.MathUtils.lerp(d.spreadBase, d.spreadAds, this.ads) + w.spread * (1 - this.ads * 0.6) + hs * 0.12 + (this.ctrl.onGround ? 0 : 2.5) - this.crouchT * 0.3;
    spread = Math.max(0.05, spread) * THREE.MathUtils.DEG2RAD;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    this.getAimDir(_dir);
    // perturb
    _q.setFromAxisAngle(_right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), Math.sin(a) * r);
    _dir.applyQuaternion(_q);
    _q.setFromAxisAngle(_fwd.set(0, 1, 0), Math.cos(a) * r);
    _dir.applyQuaternion(_q);
    this.getEye(_origin);
    // Hitscan
    const worldHit = this.world.raycast(_origin, _dir, 300);
    const maxD = worldHit ? worldHit.distance : 300;
    const botHit = this.targets?.raycast(_origin, _dir, maxD);
    const end = new THREE.Vector3();
    if (botHit) {
      end.copy(botHit.point);
      const dmg = w.damageAt(botHit.distance) * (botHit.head ? 2 : 1);
      const killed = botHit.bot.damage(dmg, botHit.head, _dir);
      this.shotsHit++;
      this.fx.blood(botHit.point, _dir.clone().negate());
      audio.hit(botHit.head); if (killed) { this.kills++; audio.kill(); }
      this.onHit?.(botHit.head, killed);
    } else if (worldHit) {
      end.copy(worldHit.point);
      this.fx.spark(worldHit.point, worldHit.normal, 6);
    } else end.copy(_origin).addScaledVector(_dir, 300);
    // Tracer from muzzle-ish (offset right/down from eye)
    const from = _origin.clone().addScaledVector(_right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), 0.18 * (1 - this.ads)).add(new THREE.Vector3(0, -0.12 * (1 - this.ads), 0)).addScaledVector(_dir, 0.6);
    this.fx.tracer(from, end);
    this.fx.muzzle(from);
    // Recoil
    const vk = d.recoilV * (1 - this.ads * 0.35) * (0.8 + Math.random() * 0.4) * THREE.MathUtils.DEG2RAD;
    const hk = d.recoilH * (Math.random() - 0.5) * 2 * THREE.MathUtils.DEG2RAD;
    this.pitch += vk; this.recoilPitch += vk; this.yaw += hk; this.recoilYaw += hk;
    this.shake += 0.08;
    this.viewModel?.onFire(d);
    audio.gunshot({ kind: d.kind });
    bus.emit('player:shot', this.ctrl.position);
  }

  getEye(out) { return out.set(this.ctrl.position.x, this.ctrl.position.y + this.eyeHeight - this.crouchT * 0 , this.ctrl.position.z); }
  getAimDir(out) { _euler.set(this.pitch, this.yaw, 0); return out.set(0, 0, -1).applyEuler(_euler); }

  takeDamage(amount, fromPos) {
    if (!this.alive) return;
    this.regenTimer = 0;
    // armor absorbs 60% while it lasts
    if (this.armor > 0) { const a = Math.min(this.armor, amount * 0.6); this.armor -= a; amount -= a; }
    this.hp -= amount;
    this.shake += 0.25;
    audio.damage();
    bus.emit('player:damage', fromPos, this.hp / this.maxHp);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; bus.emit('player:dead'); }
  }

  /** Visual: apply camera transform (call every render frame). */
  applyCamera(dt) {
    const p = this.ctrl.position;
    const eyeY = p.y + this.eyeHeight + this.bobY - this.landBump + (this.sliding > 0 ? -0.1 : 0);
    this.camera.position.set(p.x, eyeY, p.z);
    let roll = 0;
    if (settings.get('shake') && this.shake > 0.001) {
      const s = this.shake * 0.012, t = performance.now() * 0.03;
      this.camera.position.x += Math.sin(t * 1.3) * s; this.camera.position.y += Math.cos(t * 1.7) * s;
      roll = Math.sin(t * 0.9) * s * 0.6;
    }
    // slight lean roll while strafing / sliding
    roll += -input.move.x * 0.012 * (1 - this.ads) + (this.sliding > 0 ? -0.06 : 0);
    _euler.set(this.pitch, this.yaw, roll);
    this.camera.quaternion.setFromEuler(_euler);
    const targetFov = THREE.MathUtils.lerp(this.baseFov, this.weapon.def.adsFov * (this.baseFov / 75), this.ads) + (this.sprinting ? 8 : 0) + this.fovKick;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, dt);
    this.camera.updateProjectionMatrix();
    // Feed viewmodel
    this.viewModel?.update(dt, {
      ads: this.ads, lookDX: this._lookDX || 0, lookDY: this._lookDY || 0,
      moving: Math.min(1, Math.hypot(this.ctrl.velocity.x, this.ctrl.velocity.z) / SPEED.walk),
      sprinting: this.sprinting ? 1 : 0, sliding: this.sliding > 0 ? 1 : 0, onGround: this.ctrl.onGround,
    });
    this._lookDX = 0; this._lookDY = 0;
  }
}

import * as THREE from 'three';

/**
 * First-person weapon rendered in an overlay scene with its own camera (never clips world).
 * Two procedural low-poly guns; animated with sway, bob, ADS lerp, recoil kick, reload dip.
 */
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    const key = new THREE.DirectionalLight(0xffefd5, 2.2); key.position.set(0.6, 1, 0.6);
    const fill = new THREE.HemisphereLight(0xa9bfd6, 0x8a7a5a, 0.9);
    this.scene.add(key, fill);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.guns = { ar: this._buildAR(), smg: this._buildSMG() };
    for (const g of Object.values(this.guns)) { g.visible = false; this.rig.add(g); }
    this.current = 'ar'; this.guns.ar.visible = true;
    // pose targets
    this.hipPos = new THREE.Vector3(0.22, -0.20, -0.42);
    this.adsPos = new THREE.Vector3(0.0, -0.118, -0.30);
    this.hipRot = new THREE.Euler(0.0, 0.05, 0.0);
    this.ads = 0; this.kick = 0; this.kickRot = 0; this.sway = new THREE.Vector2(); this.bobT = 0; this.bob = new THREE.Vector2();
    this.reloadT = 0; this.drawT = 0; this.sprint = 0; this.slide = 0;
    this.muzzle = new THREE.Vector3();
    this.flash = this._buildFlash(); this.rig.add(this.flash); this.flashT = 0;
    this._e = new THREE.Euler();
  }
  _mat(color, metal = 0.6, rough = 0.45) { return new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }); }
  _box(w, h, d, m, x, y, z, parent) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; }
  _cyl(r, l, m, x, y, z, parent, rx = Math.PI / 2) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), m); c.rotation.x = rx; c.position.set(x, y, z); parent.add(c); return c; }

  _buildAR() {
    const g = new THREE.Group();
    const black = this._mat(0x1f2225, 0.5, 0.5), tan = this._mat(0x8b7d5c, 0.2, 0.7), steel = this._mat(0x5a6066, 0.9, 0.35);
    this._box(0.05, 0.075, 0.26, tan, 0, 0, -0.05, g);              // upper receiver
    this._box(0.045, 0.065, 0.16, black, 0, -0.05, 0.0, g);         // lower
    this._box(0.045, 0.05, 0.28, tan, 0, -0.005, -0.32, g);         // handguard
    this._cyl(0.009, 0.24, steel, 0, 0.012, -0.55, g);             // barrel
    this._box(0.02, 0.03, 0.05, black, 0, 0.012, -0.66, g);         // muzzle brake
    this._box(0.03, 0.12, 0.05, black, 0, -0.12, 0.02, g);          // mag
    this._box(0.025, 0.09, 0.035, black, 0, -0.095, 0.09, g).rotation.x = -0.25; // grip
    this._box(0.04, 0.06, 0.2, tan, 0, -0.01, 0.2, g);              // stock
    this._box(0.05, 0.075, 0.03, black, 0, -0.01, 0.31, g);         // buttpad
    // sights: rear ring + front post (line up when ADS)
    this._box(0.012, 0.03, 0.01, black, 0, 0.055, -0.02, g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 14), black); ring.position.set(0, 0.075, -0.02); g.add(ring);
    this._box(0.003, 0.03, 0.006, black, 0, 0.055, -0.44, g);
    this._box(0.003, 0.012, 0.004, this._mat(0xff7a1a, 0, 0.5), 0, 0.078, -0.44, g);
    this._cyl(0.006, 0.05, black, 0.028, -0.005, -0.4, g);         // side rail flashlight
    g.userData.muzzle = new THREE.Vector3(0, 0.012, -0.69);
    return g;
  }
  _buildSMG() {
    const g = new THREE.Group();
    const black = this._mat(0x202326, 0.5, 0.5), olive = this._mat(0x4e5a3c, 0.2, 0.75), steel = this._mat(0x5a6066, 0.9, 0.35);
    this._box(0.05, 0.08, 0.3, black, 0, 0, -0.02, g);
    this._box(0.06, 0.06, 0.14, olive, 0, 0.0, -0.22, g);
    this._cyl(0.008, 0.14, steel, 0, 0.015, -0.36, g);
    this._cyl(0.016, 0.1, black, 0, 0.015, -0.35, g);               // suppressor-ish shroud
    this._box(0.028, 0.16, 0.04, black, 0, -0.12, -0.08, g);        // long mag
    this._box(0.025, 0.09, 0.035, olive, 0, -0.095, 0.08, g).rotation.x = -0.25;
    this._box(0.012, 0.012, 0.22, black, 0, 0.0, 0.25, g);          // wire stock
    this._box(0.05, 0.06, 0.02, black, 0, -0.01, 0.36, g);
    this._box(0.012, 0.03, 0.01, black, 0, 0.058, 0.03, g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 14), black); ring.position.set(0, 0.078, 0.03); g.add(ring);
    this._box(0.003, 0.03, 0.006, black, 0, 0.058, -0.27, g);
    this._box(0.003, 0.012, 0.004, this._mat(0x37c6c0, 0, 0.5), 0, 0.081, -0.27, g);
    g.userData.muzzle = new THREE.Vector3(0, 0.015, -0.44);
    return g;
  }
  _buildFlash() {
    const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.3, 'rgba(255,170,60,0.9)'); r.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthTest: false, transparent: true }));
    s.scale.setScalar(0.16); s.visible = false; return s;
  }

  setWeapon(id) {
    if (this.current === id) return;
    this.guns[this.current].visible = false; this.current = id; this.guns[id].visible = true; this.drawT = 0.35;
  }
  onFire(def) {
    this.kick += def.kick; this.kickRot += 0.09;
    this.flashT = 0.045; this.flash.visible = true;
    this.flash.material.rotation = Math.random() * 6.28; this.flash.scale.setScalar(0.12 + Math.random() * 0.08);
  }
  onReload(t) { this.reloadT = t; this.reloadTotal = t; }

  /**
   * @param dt frame delta
   * @param s { ads:0..1, lookDX, lookDY, moving:0..1, sprinting:0..1, sliding:0..1, onGround, speed }
   */
  update(dt, s) {
    const g = this.guns[this.current];
    this.ads = s.ads;
    // sway from look input (lags behind camera)
    this.sway.x = THREE.MathUtils.damp(this.sway.x, THREE.MathUtils.clamp(-s.lookDX * 6, -0.05, 0.05), 10, dt);
    this.sway.y = THREE.MathUtils.damp(this.sway.y, THREE.MathUtils.clamp(-s.lookDY * 6, -0.05, 0.05), 10, dt);
    // bob
    const freq = s.sprinting > 0.5 ? 12 : 9;
    if (s.moving > 0.05 && s.onGround) this.bobT += dt * freq * (0.6 + 0.4 * s.moving);
    const bobAmp = (s.sprinting > 0.5 ? 0.02 : 0.011) * s.moving * (1 - this.ads * 0.85);
    this.bob.x = Math.sin(this.bobT) * bobAmp; this.bob.y = Math.abs(Math.cos(this.bobT)) * bobAmp * 0.8;
    // recoil recover
    this.kick = THREE.MathUtils.damp(this.kick, 0, 14, dt);
    this.kickRot = THREE.MathUtils.damp(this.kickRot, 0, 12, dt);
    this.sprint = THREE.MathUtils.damp(this.sprint, s.sprinting, 8, dt);
    this.slide = THREE.MathUtils.damp(this.slide, s.sliding, 8, dt);
    if (this.reloadT > 0) this.reloadT -= dt;
    if (this.drawT > 0) this.drawT -= dt;

    // position
    const p = g.position, a = this.ads;
    p.lerpVectors(this.hipPos, this.adsPos, a);
    p.x += this.sway.x * (1 - a * 0.8) + this.bob.x;
    p.y += this.sway.y * (1 - a * 0.8) + this.bob.y;
    p.z += this.kick;
    // sprint pose: gun raised & rotated inward
    p.x += this.sprint * -0.08 * (1 - a); p.y += this.sprint * -0.06 * (1 - a); p.z += this.sprint * 0.06;
    // reload: dip down
    const rl = this.reloadT > 0 ? Math.sin(Math.PI * Math.min(1, 1 - this.reloadT / this.reloadTotal)) : 0;
    p.y -= rl * 0.12; p.x += rl * 0.03;
    // draw: rise from below
    const dr = this.drawT > 0 ? this.drawT / 0.35 : 0; p.y -= dr * 0.3;
    const r = g.rotation;
    r.set(0, 0, 0);
    r.x = -this.kickRot + this.sway.y * 1.5 * (1 - a) - rl * 0.5 + this.sprint * 0.35 * (1 - a) + dr * 0.6;
    r.y = this.hipRot.y * (1 - a) + this.sway.x * 1.2 * (1 - a) + this.sprint * 0.7 * (1 - a) + rl * 0.25;
    r.z = this.bob.x * 2 + this.sprint * 0.25 * (1 - a) - this.slide * 0.3 + rl * 0.35;

    // muzzle flash
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    this.flash.position.copy(g.userData.muzzle).applyMatrix4(g.matrix);
    g.updateMatrix();
    this.flash.position.copy(g.userData.muzzle).applyMatrix4(g.matrix);
    this.camera.fov = THREE.MathUtils.lerp(55, 40, a); this.camera.updateProjectionMatrix();
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  render(renderer) { renderer.clearDepth(); renderer.render(this.scene, this.camera); }
}

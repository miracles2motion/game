import * as THREE from 'three';

/** Pooled tracers (thin additive quads as line segments), impact sparks and muzzle flashes. */
export class Effects {
  constructor(scene, maxParticles = 150) {
    this.scene = scene;
    // ---- tracers ----
    this.maxTracers = 40;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxTracers * 6), 3));
    this.tracerPos = tg.getAttribute('position');
    this.tracerLife = new Float32Array(this.maxTracers);
    this.tracerMesh = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerMesh.frustumCulled = false;
    scene.add(this.tracerMesh);
    this._tracerIdx = 0;

    // ---- particles (points) ----
    this.maxP = maxParticles;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxP * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.maxP * 3), 3));
    this.pPos = pg.getAttribute('position'); this.pCol = pg.getAttribute('color');
    this.pVel = new Float32Array(this.maxP * 3);
    this.pLife = new Float32Array(this.maxP);
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._pIdx = 0;
    for (let i = 0; i < this.maxP; i++) this.pPos.setXYZ(i, 0, -100, 0);

    // ---- muzzle light ----
    this.flashLight = new THREE.PointLight(0xffa040, 0, 12, 2);
    scene.add(this.flashLight);
    this.flashT = 0;

    // ---- blood-ish hit puffs reuse particles with red colour ----
    this._tmp = new THREE.Vector3();
  }

  tracer(from, to) {
    const i = this._tracerIdx; this._tracerIdx = (i + 1) % this.maxTracers;
    this.tracerPos.setXYZ(i * 2, from.x, from.y, from.z);
    this.tracerPos.setXYZ(i * 2 + 1, to.x, to.y, to.z);
    this.tracerLife[i] = 0.07;
    this.tracerPos.needsUpdate = true;
  }
  spark(p, n, count = 6, color = [1.0, 0.75, 0.3]) {
    for (let k = 0; k < count; k++) {
      const i = this._pIdx; this._pIdx = (i + 1) % this.maxP;
      this.pPos.setXYZ(i, p.x, p.y, p.z);
      const s = 2 + Math.random() * 4;
      this.pVel[i * 3] = (n.x + (Math.random() - 0.5) * 1.2) * s;
      this.pVel[i * 3 + 1] = (n.y + (Math.random() - 0.2) * 1.2) * s;
      this.pVel[i * 3 + 2] = (n.z + (Math.random() - 0.5) * 1.2) * s;
      this.pLife[i] = 0.25 + Math.random() * 0.3;
      this.pCol.setXYZ(i, color[0], color[1], color[2]);
    }
    this.pPos.needsUpdate = true; this.pCol.needsUpdate = true;
  }
  blood(p, n) { this.spark(p, n, 8, [0.8, 0.1, 0.05]); }
  dust(p) { this.spark(p, this._tmp.set(0, 1, 0), 5, [0.7, 0.6, 0.45]); }
  muzzle(pos) { this.flashLight.position.copy(pos); this.flashLight.intensity = 30; this.flashT = 0.04; }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.maxTracers; i++) {
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        if (this.tracerLife[i] <= 0) { this.tracerPos.setXYZ(i * 2, 0, -100, 0); this.tracerPos.setXYZ(i * 2 + 1, 0, -100, 0); dirty = true; }
      }
    }
    if (dirty) this.tracerPos.needsUpdate = true;
    let pd = false;
    for (let i = 0; i < this.maxP; i++) {
      if (this.pLife[i] > 0) {
        this.pLife[i] -= dt;
        this.pVel[i * 3 + 1] -= 12 * dt;
        this.pPos.setXYZ(i, this.pPos.getX(i) + this.pVel[i * 3] * dt, this.pPos.getY(i) + this.pVel[i * 3 + 1] * dt, this.pPos.getZ(i) + this.pVel[i * 3 + 2] * dt);
        if (this.pLife[i] <= 0) this.pPos.setXYZ(i, 0, -100, 0);
        pd = true;
      }
    }
    if (pd) this.pPos.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
  }
  dispose() { this.scene.remove(this.tracerMesh, this.points, this.flashLight); }
}

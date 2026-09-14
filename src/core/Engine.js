import * as THREE from 'three';
import { settings } from './Settings.js';
import { bus } from './EventBus.js';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

/**
 * Owns the renderer + main loop. Fixed 60 Hz simulation step with variable render.
 * Anything with `update(dt)` (physics) and `render(alpha, dt)` (visual) can be set as the scene.
 */
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false, alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.clock = new THREE.Clock();
    this.accum = 0;
    this.running = false;
    this.session = null; // {update(dt), render(dt), resize(w,h)}
    this.fps = 0; this._fpsAcc = 0; this._fpsN = 0;
    this._raf = 0;
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    bus.on('settings:change', k => { if (k === 'quality') this.applyQuality(); });
    this.resize();
  }
  applyQuality() {
    const q = settings.qualityPreset;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadowMap > 0;
    this.renderer.shadowMap.needsUpdate = true;
    bus.emit('engine:quality', q);
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.session?.resize?.(w, h);
  }
  setSession(s) {
    this.session?.dispose?.();
    this.session = s;
    this.accum = 0;
    this.clock.getDelta();
    s?.resize?.(window.innerWidth, window.innerHeight);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      let dt = this.clock.getDelta();
      if (dt > 0.25) dt = 0.25; // tab switch guard
      this._fpsAcc += dt; this._fpsN++;
      if (this._fpsAcc >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; bus.emit('engine:fps', this.fps); }
      const s = this.session;
      if (!s) return;
      if (s.update) {
        this.accum += dt;
        let steps = 0;
        while (this.accum >= FIXED_DT && steps < MAX_STEPS) { s.update(FIXED_DT); this.accum -= FIXED_DT; steps++; }
        if (steps === MAX_STEPS) this.accum = 0;
      }
      this.renderer.clear();
      s.render?.(dt);
    };
    loop();
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); }
}

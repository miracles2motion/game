import * as THREE from 'three';
import { buildMap } from './world/Map.js';
import { buildSky } from './world/Sky.js';
import { WorldCollider } from './physics/Collider.js';
import { Effects } from './fx/Effects.js';
import { Player } from './player/Player.js';
import { ViewModel } from './player/ViewModel.js';
import { BotManager } from './ai/BotManager.js';
import { HUD } from './ui/HUD.js';
import { settings } from './core/Settings.js';
import { bus } from './core/EventBus.js';
import { input } from './core/Input.js';
import { audio } from './core/Audio.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3();

/**
 * One loaded level. Can run in 'menu' mode (orbit camera behind the main menu) or 'play' mode.
 * Built once and re-used between matches so returning to menu is instant.
 */
export class Game {
  constructor(engine, uiRoot) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    const q = settings.qualityPreset;
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 600);
    this.sky = buildSky(this.scene, q);
    this.map = buildMap(settings.get('quality'));
    this.scene.add(this.map.group, this.map.collider);
    this.world = new WorldCollider(this.map.collider);
    this.fx = new Effects(this.scene, q.particles);
    this.viewModel = new ViewModel();
    this.player = new Player(this.world, this.camera, this.fx, null);
    this.player.viewModel = this.viewModel;
    this.bots = new BotManager(this.world, this.scene, this.fx, this.map, this.player);
    this.player.targets = this.bots;
    this.hud = new HUD(uiRoot);
    this.player.onHit = (h, k) => this.hud.hit(h, k);
    this.mode = 'menu'; this.paused = false; this.over = false;
    this.menuT = 0;
    this._offs = [
      bus.on('engine:quality', q => { this.sky.setQuality(q); }),
      bus.on('player:dead', () => this._end(false)),
      bus.on('game:win', r => this._end(true, r)),
    ];
    this.onEnd = null;
    this.hintT = 0;
  }

  // ---------- modes ----------
  startMenu() {
    this.mode = 'menu'; this.hud.hide(); this.paused = false; this.over = false;
    this.bots.pool.forEach(b => { b.alive = false; b.state = -1; b.mesh.visible = false; });
    this.bots.beacon.visible = false; this.bots.beaconLight.intensity = 0;
    audio.extractHum(false);
  }
  startMatch() {
    this.mode = 'play'; this.paused = false; this.over = false;
    this.player.spawn(this.map.playerSpawn, this.map.playerSpawnYaw);
    this.camera.fov = settings.get('fov');
    this.bots.start();
    this.hud.show();
    this.matchTime = 0;
  }
  setPaused(p) { this.paused = p; if (p) input.resetHeld(); }
  _end(win, r = {}) {
    if (this.over || this.mode !== 'play') return;
    this.over = true;
    setTimeout(() => this.onEnd?.({ win, kills: this.player.kills, time: this.matchTime, accuracy: this.player.shotsFired ? Math.round(this.player.shotsHit / this.player.shotsFired * 100) : 0 }), win ? 400 : 1200);
  }

  // ---------- loop ----------
  update(dt) {
    if (this.mode !== 'play' || this.paused) return;
    if (this.over && !this.player.alive) { this.player.update(dt); this.bots.update(dt); return; }
    this.matchTime += dt;
    // aim-assist flag for auto fire / red crosshair
    this.player.getEye(_o); this.player.getAimDir(_d);
    const wh = this.world.raycast(_o, _d, 150);
    this.player.aimingAtEnemy = !!this.bots.raycast(_o, _d, wh ? wh.distance : 150);
    this.player.update(dt);
    if (!this.over) this.bots.update(dt);
    // interact hint / extraction
    if (this.bots.phase === 'extract') {
      const d = this.player.position.distanceTo(this.map.extraction);
      this.hud.setHint(d < this.map.extractRadius ? 'Hold position — extracting' : null);
    } else this.hud.setHint(null);
  }
  render(dt) {
    const r = this.engine.renderer;
    if (this.mode === 'menu') {
      this.menuT += dt;
      const a = this.menuT * 0.06, rad = 46;
      this.camera.position.set(Math.cos(a) * rad, 14 + Math.sin(this.menuT * 0.2) * 2, Math.sin(a) * rad);
      this.camera.lookAt(0, 4, 0); this.camera.fov = 60; this.camera.updateProjectionMatrix();
      this.sky.follow(this.camera.position);
      this.fx.update(dt);
      r.render(this.scene, this.camera);
      return;
    }
    if (!this.paused) { this.player.applyCamera(dt); this.fx.update(dt); }
    this.sky.follow(this.player.position);
    r.render(this.scene, this.camera);
    if (this.player.alive) this.viewModel.render(r);
    this.hud.update(dt, this.player, this.camera);
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.viewModel.resize(w, h); }
  dispose() { this._offs.forEach(f => f()); this.hud.dispose(); this.fx.dispose(); }
}

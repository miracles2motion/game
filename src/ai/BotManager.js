import * as THREE from 'three';
import { Bot } from './Bot.js';
import { bus } from '../core/EventBus.js';
import { audio } from '../core/Audio.js';

const WAVES = [
  { count: 4, skill: 0.8, gap: 0.8 },
  { count: 6, skill: 1.0, gap: 0.6 },
  { count: 8, skill: 1.15, gap: 0.45 },
];

/** Wave director + extraction objective. Also exposes `raycast` for player hitscan. */
export class BotManager {
  constructor(world, scene, fx, map, player) {
    this.world = world; this.scene = scene; this.fx = fx; this.map = map; this.player = player;
    this.bounds = map.bounds;
    this.pool = []; for (let i = 0; i < 10; i++) this.pool.push(new Bot(world, scene, this));
    this.wave = 0; this.alive = 0; this.spawnQueue = 0; this.spawnT = 0; this.waveGap = 0;
    this.phase = 'intro';  // intro | wave | between | extract | done
    this.extractT = 0; this.extractOpen = false; this.inZone = false;
    this.totalKills = 0; this.time = 0;
    // Beacon
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 40, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x37c6c0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beacon.position.copy(map.extraction).add(new THREE.Vector3(0, 20, 0)); this.beacon.visible = false; scene.add(this.beacon);
    this.beaconLight = new THREE.PointLight(0x37c6c0, 0, 30, 2); this.beaconLight.position.copy(map.extraction).add(new THREE.Vector3(0, 3, 0)); scene.add(this.beaconLight);
    bus.on('player:shot', pos => this.hearGunfire(pos));
  }
  start() { this.phase = 'intro'; this.waveGap = 4; this.wave = 0; this.totalKills = 0; this.time = 0; this.extractOpen = false; this.beacon.visible = false; this.beaconLight.intensity = 0; this.pool.forEach(b => { b.alive = false; b.state = -1; b.mesh.visible = false; }); bus.emit('obj', { text: 'Clear 3 hostile waves, then reach EXTRACTION', sub: 'Wave 1 incoming…' }); }

  hearGunfire(pos) {
    for (const b of this.pool) if (b.alive && b.ctrl.position.distanceTo(pos) < 35 && b.awareness < 0.6) { b.awareness = 0.6; b.lastSeen.copy(pos); }
  }
  onBotDied() { this.alive--; this.totalKills++; bus.emit('kill', this.totalKills); }

  _spawnOne(skill) {
    const b = this.pool.find(x => !x.alive && x.state === -1) || this.pool.find(x => !x.alive);
    if (!b) return;
    // farthest spawn points from player, random among top 2
    const sp = [...this.map.botSpawns].sort((a, c) => c.distanceTo(this.player.position) - a.distanceTo(this.player.position));
    const pt = sp[Math.floor(Math.random() * 2)].clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
    b.spawn(pt, skill); this.alive++;
    b.awareness = 0.5; b.lastSeen.copy(this.player.position); // they know roughly where you are
  }

  update(dt) {
    this.time += dt;
    for (const b of this.pool) if (b.state !== -1) b.update(dt, this.player);
    switch (this.phase) {
      case 'intro':
        this.waveGap -= dt; if (this.waveGap <= 0) this._startWave();
        break;
      case 'wave':
        if (this.spawnQueue > 0) { this.spawnT -= dt; if (this.spawnT <= 0) { this._spawnOne(this.curSkill); this.spawnQueue--; this.spawnT = WAVES[this.wave - 1].gap; } }
        else if (this.alive <= 0) {
          if (this.wave >= WAVES.length) this._openExtraction();
          else { this.phase = 'between'; this.waveGap = 6; bus.emit('obj', { text: `Wave ${this.wave} cleared`, sub: `Wave ${this.wave + 1} in 6s — reload & reposition` }); audio.uiConfirm(); }
        }
        break;
      case 'between':
        this.waveGap -= dt; if (this.waveGap <= 0) this._startWave();
        break;
      case 'extract': {
        const d = this.player.position.distanceTo(this.map.extraction);
        const inZone = d < this.map.extractRadius && this.player.alive;
        if (inZone !== this.inZone) { this.inZone = inZone; audio.extractHum(inZone); }
        if (inZone) { this.extractT += dt; bus.emit('extract', this.extractT / 5); if (this.extractT >= 5) { this.phase = 'done'; audio.extractHum(false); bus.emit('game:win', { kills: this.totalKills, time: this.time }); } }
        else if (this.extractT > 0) { this.extractT = Math.max(0, this.extractT - dt * 2); bus.emit('extract', this.extractT / 5); }
        // trickle harassment during extraction
        this._harass = (this._harass || 0) - dt;
        if (this._harass <= 0 && this.alive < 3) { this._spawnOne(1.0); this._harass = 9; }
        this.beacon.material.opacity = 0.1 + Math.sin(this.time * 3) * 0.04;
        break;
      }
    }
  }
  _startWave() {
    this.wave++; const w = WAVES[this.wave - 1]; this.phase = 'wave'; this.spawnQueue = w.count; this.spawnT = 0.1; this.curSkill = w.skill;
    bus.emit('wave', this.wave, WAVES.length);
    bus.emit('obj', { text: `WAVE ${this.wave} / ${WAVES.length}`, sub: `${w.count} hostiles inbound` });
    audio.ui();
  }
  _openExtraction() {
    this.phase = 'extract'; this.extractOpen = true; this.extractT = 0;
    this.beacon.visible = true; this.beaconLight.intensity = 6;
    bus.emit('obj', { text: 'EXTRACTION OPEN', sub: 'Reach the teal beacon and hold for 5s' });
    bus.emit('extract:open', this.map.extraction);
    audio.uiConfirm();
  }
  /** Closest bot hit along ray, or null. */
  raycast(origin, dir, maxD) {
    let best = null;
    for (const b of this.pool) { const h = b.raycast(origin, dir, maxD); if (h && (!best || h.distance < best.distance)) best = h; }
    return best;
  }
  /** Is the given ray roughly on an enemy (for touch auto-fire)? */
  aimingAt(origin, dir) { return !!this.raycast(origin, dir, 120); }
  get aliveBots() { return this.pool.filter(b => b.alive); }
}

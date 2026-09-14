import { audio } from '../core/Audio.js';

export const WEAPONS = {
  ar: {
    id: 'ar', name: 'M4-D', kind: 'ar', rpm: 720, dmg: 24, mag: 30, reserve: 120, reload: 2.1,
    spreadBase: 1.4, spreadAds: 0.2, spreadPerShot: 0.18, spreadDecay: 6, spreadMax: 3.0,
    recoilV: 0.55, recoilH: 0.25, recoilRecover: 8, adsFov: 50, adsTime: 0.18, kick: 0.045,
    falloffStart: 30, falloffEnd: 70, falloffMin: 0.6,
  },
  smg: {
    id: 'smg', name: 'V-9', kind: 'smg', rpm: 900, dmg: 17, mag: 35, reserve: 140, reload: 1.8,
    spreadBase: 2.0, spreadAds: 0.5, spreadPerShot: 0.15, spreadDecay: 7, spreadMax: 3.5,
    recoilV: 0.4, recoilH: 0.35, recoilRecover: 9, adsFov: 58, adsTime: 0.14, kick: 0.035,
    falloffStart: 18, falloffEnd: 45, falloffMin: 0.5,
  },
};

/** Per-weapon runtime state: ammo, fire timer, reload progress, spread. */
export class WeaponState {
  constructor(def) {
    this.def = def;
    this.ammo = def.mag;
    this.reserve = def.reserve;
    this.cooldown = 0;
    this.reloading = 0;      // seconds remaining, 0 = not reloading
    this._reloadStage = 0;
    this.spread = 0;         // additional degrees
    this.drawTimer = 0;      // weapon swap delay
  }
  get canFire() { return this.cooldown <= 0 && this.reloading <= 0 && this.drawTimer <= 0 && this.ammo > 0; }
  get shotInterval() { return 60 / this.def.rpm; }

  startReload() {
    if (this.reloading > 0 || this.ammo >= this.def.mag || this.reserve <= 0 || this.drawTimer > 0) return false;
    this.reloading = this.def.reload; this._reloadStage = 0;
    audio.reload(0);
    return true;
  }
  cancelReload() { this.reloading = 0; }
  fire() {
    this.ammo--;
    this.cooldown = this.shotInterval;
    this.spread = Math.min(this.def.spreadMax, this.spread + this.def.spreadPerShot);
  }
  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.drawTimer > 0) this.drawTimer -= dt;
    if (this.spread > 0) this.spread = Math.max(0, this.spread - this.def.spreadDecay * dt);
    if (this.reloading > 0) {
      const before = this.reloading;
      this.reloading -= dt;
      const t = this.def.reload - this.reloading;
      if (this._reloadStage === 0 && t > this.def.reload * 0.45) { this._reloadStage = 1; audio.reload(1); }
      if (this._reloadStage === 1 && t > this.def.reload * 0.8) { this._reloadStage = 2; audio.reload(2); }
      if (before > 0 && this.reloading <= 0) {
        const need = this.def.mag - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take; this.reserve -= take; this.reloading = 0;
      }
    }
  }
  /** Damage after distance falloff. */
  damageAt(dist) {
    const d = this.def;
    if (dist <= d.falloffStart) return d.dmg;
    const t = Math.min(1, (dist - d.falloffStart) / (d.falloffEnd - d.falloffStart));
    return d.dmg * (1 - t * (1 - d.falloffMin));
  }
  refill() { this.ammo = this.def.mag; this.reserve = this.def.reserve; this.reloading = 0; }
}

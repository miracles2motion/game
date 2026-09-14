import { settings } from './Settings.js';
import { bus } from './EventBus.js';

/**
 * All sound is synthesised with WebAudio (no asset files). Gunshots are noise bursts shaped
 * through filters + a low "thump" oscillator, which gives the punchy DF-style report.
 */
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null; this.sfx = null; this.music = null;
    this._noise = null;
    this._drone = null;
    bus.on('settings:change', k => { if (['master', 'sfx', 'music'].includes(k)) this._applyVolumes(); });
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.sfx.connect(comp); this.music.connect(comp); comp.connect(this.master); this.master.connect(this.ctx.destination);
    this._applyVolumes();
    // Pre-render 2 seconds of white noise.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }
  resume() { this.ctx?.resume(); }
  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.get('master');
    this.sfx.gain.value = settings.get('sfx');
    this.music.gain.value = settings.get('music') * 0.35;
  }

  _noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this._noise; s.loop = true; s.loopStart = Math.random(); return s; }
  _env(gainNode, t0, a, peak, d, sustain = 0.0001) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0); g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
  }
  /** Simple stereo pan from -1..1 and distance attenuation. */
  _out(pan = 0, dist = 0, maxDist = 60) {
    const g = this.ctx.createGain();
    const att = Math.max(0, 1 - dist / maxDist);
    g.gain.value = att * att;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }

  gunshot({ kind = 'ar', pan = 0, dist = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const out = this._out(pan, dist, 120);
    // Crack: high-passed noise
    const n = this._noiseSrc();
    const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = kind === 'smg' ? 2600 : 1800; hp.Q.value = 0.7;
    const ng = c.createGain();
    n.connect(hp); hp.connect(ng); ng.connect(out);
    this._env(ng, t, 0.002, kind === 'smg' ? 0.5 : 0.7, 0.09);
    n.start(t); n.stop(t + 0.2);
    // Body: low noise
    const n2 = this._noiseSrc();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const n2g = c.createGain();
    n2.connect(lp); lp.connect(n2g); n2g.connect(out);
    this._env(n2g, t, 0.003, 0.9, 0.16);
    n2.start(t); n2.stop(t + 0.3);
    // Thump
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(kind === 'smg' ? 140 : 110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const og = c.createGain(); o.connect(og); og.connect(out);
    this._env(og, t, 0.002, 0.8, 0.13);
    o.start(t); o.stop(t + 0.2);
    // Distant tail for far shots
    if (dist > 20) {
      const n3 = this._noiseSrc(); const lp3 = c.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 300;
      const g3 = c.createGain(); n3.connect(lp3); lp3.connect(g3); g3.connect(out);
      this._env(g3, t + 0.05, 0.02, 0.4, 0.5); n3.start(t); n3.stop(t + 0.7);
    }
  }
  click() { this._blip(1200, 0.03, 0.15); }
  dryFire() { this._blip(900, 0.02, 0.2, 'square'); }
  hit(head = false) { this._blip(head ? 1900 : 1400, 0.05, 0.25, 'triangle'); }
  kill() { this._blip(700, 0.12, 0.3, 'triangle'); setTimeout(() => this._blip(1050, 0.12, 0.3, 'triangle'), 80); }
  ui() { this._blip(1500, 0.02, 0.1, 'sine'); }
  uiConfirm() { this._blip(880, 0.05, 0.15, 'sine'); setTimeout(() => this._blip(1320, 0.06, 0.15, 'sine'), 60); }
  _blip(freq, dur, vol, type = 'sine') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); o.connect(g); g.connect(this.sfx);
    this._env(g, t, 0.003, vol, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  reload(stage) {
    // stage 0: mag out (click + slide), 1: mag in (thunk), 2: bolt (clack)
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = stage === 1 ? 600 : 2500; f.Q.value = 2;
    const g = c.createGain(); n.connect(f); f.connect(g); g.connect(this.sfx);
    this._env(g, t, 0.004, stage === 1 ? 0.7 : 0.4, stage === 1 ? 0.08 : 0.04);
    n.start(t); n.stop(t + 0.15);
    if (stage !== 0) this._blip(stage === 1 ? 180 : 420, 0.04, 0.25, 'square');
  }
  footstep(sprint = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noiseSrc(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400 + Math.random() * 200;
    const g = c.createGain(); n.connect(f); f.connect(g); g.connect(this.sfx);
    this._env(g, t, 0.005, sprint ? 0.28 : 0.16, 0.07);
    n.start(t); n.stop(t + 0.12);
  }
  damage() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.18);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    const g = c.createGain(); o.connect(f); f.connect(g); g.connect(this.sfx);
    this._env(g, t, 0.005, 0.5, 0.2); o.start(t); o.stop(t + 0.3);
  }
  whizz(pan) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this._noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 8;
    f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    const g = this._out(pan, 0); const gg = c.createGain(); n.connect(f); f.connect(gg); gg.connect(g);
    this._env(gg, t, 0.005, 0.35, 0.12); n.start(t); n.stop(t + 0.2);
  }
  extractHum(on) {
    if (!this.ctx) return;
    if (on && !this._hum) {
      const c = this.ctx; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 110.5;
      const g = c.createGain(); g.gain.value = 0.0001; o.connect(g); o2.connect(g); g.connect(this.sfx);
      g.gain.linearRampToValueAtTime(0.25, c.currentTime + 1); o.start(); o2.start();
      this._hum = { o, o2, g };
    } else if (!on && this._hum) {
      const { o, o2, g } = this._hum; g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);
      setTimeout(() => { o.stop(); o2.stop(); }, 600); this._hum = null;
    }
  }

  /** Ambient wind + tonal drone pad for menus & gameplay. */
  startAmbience() {
    if (!this.ctx || this._drone) return;
    const c = this.ctx;
    const wind = this._noiseSrc();
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 350; wf.Q.value = 0.5;
    const wg = c.createGain(); wg.gain.value = 0.22;
    wind.connect(wf); wf.connect(wg); wg.connect(this.music);
    // Slow LFO on wind filter
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(wf.frequency);
    // Drone pad: detuned low oscillators
    const pad = c.createGain(); pad.gain.value = 0.12; pad.connect(this.music);
    const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 500; pf.connect(pad);
    const oscs = [55, 55.4, 82.4, 110.3].map((f, i) => {
      const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = i < 2 ? 0.5 : 0.25; o.connect(g); g.connect(pf); o.start(); return o;
    });
    wind.start(); lfo.start();
    this._drone = { wind, lfo, oscs };
  }
  stopAmbience() {
    if (!this._drone) return;
    const { wind, lfo, oscs } = this._drone;
    try { wind.stop(); lfo.stop(); oscs.forEach(o => o.stop()); } catch { /* */ }
    this._drone = null;
  }
}

export const audio = new AudioSystem();

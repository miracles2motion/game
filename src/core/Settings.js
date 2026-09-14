import { bus } from './EventBus.js';

const KEY = 'dforce.settings.v1';

// Schema drives both persistence and the settings UI (SettingsPanel builds from this).
export const SCHEMA = {
  controls: {
    label: 'Controls',
    items: {
      inputMode:      { type: 'select', label: 'Input mode', options: ['auto', 'desktop', 'touch'], def: 'auto',
                        hint: 'Auto picks touch on phones/tablets and keyboard + mouse on desktop.' },
      mouseSens:      { type: 'range', label: 'Mouse sensitivity', min: 0.1, max: 3, step: 0.05, def: 1.0, scope: 'desktop' },
      adsSensMult:    { type: 'range', label: 'ADS sensitivity multiplier', min: 0.3, max: 1.5, step: 0.05, def: 0.8 },
      touchSens:      { type: 'range', label: 'Touch look sensitivity', min: 0.2, max: 3, step: 0.05, def: 1.0, scope: 'touch' },
      touchStickSize: { type: 'range', label: 'Joystick size', min: 90, max: 200, step: 5, def: 130, scope: 'touch' },
      touchButtonSize:{ type: 'range', label: 'Button size', min: 44, max: 96, step: 2, def: 64, scope: 'touch' },
      leftHanded:     { type: 'toggle', label: 'Left-handed layout', def: false, scope: 'touch' },
      autoFire:       { type: 'toggle', label: 'Auto-fire when crosshair is on enemy', def: false, scope: 'touch' },
      autoSprint:     { type: 'toggle', label: 'Auto-sprint on full stick push', def: true, scope: 'touch' },
      invertY:        { type: 'toggle', label: 'Invert Y axis', def: false },
      adsToggle:      { type: 'toggle', label: 'Toggle ADS (off = hold)', def: false },
      crouchToggle:   { type: 'toggle', label: 'Toggle crouch (off = hold)', def: true },
      sprintToggle:   { type: 'toggle', label: 'Toggle sprint (off = hold)', def: false, scope: 'desktop' },
    }
  },
  audio: {
    label: 'Audio',
    items: {
      master: { type: 'range', label: 'Master volume', min: 0, max: 1, step: 0.05, def: 0.8 },
      sfx:    { type: 'range', label: 'SFX volume', min: 0, max: 1, step: 0.05, def: 1.0 },
      music:  { type: 'range', label: 'Ambience / music', min: 0, max: 1, step: 0.05, def: 0.5 },
    }
  },
  graphics: {
    label: 'Graphics',
    items: {
      quality:  { type: 'select', label: 'Quality preset', options: ['low', 'medium', 'high'], def: 'auto' },
      fov:      { type: 'range', label: 'Field of view', min: 60, max: 100, step: 1, def: 75 },
      showFps:  { type: 'toggle', label: 'Show FPS counter', def: false },
      shake:    { type: 'toggle', label: 'Camera shake', def: true },
    }
  }
};

export const QUALITY = {
  low:    { shadowMap: 0,    pixelRatio: 1,   fogFar: 140, particles: 60,  anisotropy: 1 },
  medium: { shadowMap: 1024, pixelRatio: 1.5, fogFar: 200, particles: 150, anisotropy: 4 },
  high:   { shadowMap: 2048, pixelRatio: 2,   fogFar: 260, particles: 300, anisotropy: 8 },
};

export function isTouchDevice() {
  return (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) ||
         /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function defaults() {
  const out = {};
  for (const sec of Object.values(SCHEMA))
    for (const [k, it] of Object.entries(sec.items)) out[k] = it.def;
  // Quality auto-detect
  out.quality = isTouchDevice() ? 'medium' : 'high';
  return out;
}

class SettingsStore {
  constructor() {
    this.data = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch { /* ignore */ }
  }
  get(k) { return this.data[k]; }
  set(k, v) {
    if (this.data[k] === v) return;
    this.data[k] = v;
    this.save();
    bus.emit('settings:change', k, v, this.data);
  }
  reset() {
    this.data = defaults();
    this.save();
    bus.emit('settings:reset', this.data);
    for (const k of Object.keys(this.data)) bus.emit('settings:change', k, this.data[k], this.data);
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } }
  /** Effective input mode after resolving 'auto'. */
  get inputMode() {
    const m = this.data.inputMode;
    return m === 'auto' ? (isTouchDevice() ? 'touch' : 'desktop') : m;
  }
  get qualityPreset() { return QUALITY[this.data.quality] || QUALITY.medium; }
}

export const settings = new SettingsStore();

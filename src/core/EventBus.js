// Tiny pub/sub used across systems (settings changes, game events, HUD updates).
export class EventBus {
  constructor() { this._l = new Map(); }
  on(evt, fn) {
    if (!this._l.has(evt)) this._l.set(evt, new Set());
    this._l.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  once(evt, fn) {
    const off = this.on(evt, (...a) => { off(); fn(...a); });
    return off;
  }
  off(evt, fn) { this._l.get(evt)?.delete(fn); }
  emit(evt, ...args) {
    const s = this._l.get(evt);
    if (!s) return;
    for (const fn of [...s]) fn(...args);
  }
}

export const bus = new EventBus();

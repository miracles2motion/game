// Unified action state. Both KeyboardMouse and Touch write into this object; the game reads it.
// Look deltas are accumulated per frame and consumed via consumeLook().
export class InputState {
  constructor() {
    this.move = { x: 0, y: 0 };      // -1..1  (x right, y forward)
    this.lookDX = 0; this.lookDY = 0; // radians accumulated this frame
    this.fire = false;
    this.ads = false;
    this.jump = false;                // edge-triggered: set true by device, cleared by consumer
    this.crouch = false;              // held (device layer handles toggles)
    this.sprint = false;
    this.reload = false;              // edge
    this.swap = false;                // edge
    this.interact = false;            // held
    this.pause = false;               // edge
    this.weaponSlot = 0;              // 0 none, 1/2 edge
    this.adsToggleRequest = false;    // edge: toggle ads (touch/desktop toggle mode)
    this.crouchToggleRequest = false; // edge
    this.sprintToggleRequest = false; // edge
  }
  addLook(dx, dy) { this.lookDX += dx; this.lookDY += dy; }
  consumeLook() { const r = [this.lookDX, this.lookDY]; this.lookDX = 0; this.lookDY = 0; return r; }
  /** Read & clear an edge-triggered flag. */
  take(name) { const v = this[name]; this[name] = false; return v; }
  takeSlot() { const v = this.weaponSlot; this.weaponSlot = 0; return v; }
  resetHeld() {
    this.move.x = 0; this.move.y = 0;
    this.fire = this.ads = this.crouch = this.sprint = this.interact = false;
    this.lookDX = this.lookDY = 0;
  }
}

export const input = new InputState();

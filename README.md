# D-Force

https://miracles2motion.github.io/game/

A browser tactical shooter built on **three.js**, styled on the look and movement feel of
*Delta Force (Mobile)*. Runs on desktop (keyboard + mouse) and phones/tablets (touch).

- **One map** — *Zero Dam Outskirts*, a desert industrial compound generated procedurally in code (no asset downloads).
- **One mode** — *Extraction Skirmish*: clear three waves of hostiles, then hold the extraction pad for 5 s.
- **Screens** — Splash → Main menu → Settings (Controls / Audio / Graphics) → Match (pause, end).
- **Physics** — capsule character controller against a BVH of the merged world mesh (three-mesh-bvh):
  gravity, jump, crouch, sprint, slide, stair glide, ADS, recoil with recentre, spread bloom, hitscan with falloff.
- **Bots** — FSM AI (idle / alert / chase / shoot / cover) with line-of-sight perception, hearing, whisker avoidance.
- **Audio** — every sound is synthesised with WebAudio (gunshots, reloads, footsteps, hit markers, ambience).

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (binds 0.0.0.0)
npm run build      # static output in dist/
npm run preview
node scripts/smoke.mjs   # headless sim test: builds map + BVH, runs 30 s of play, checks gunplay
```

## Controls

| Desktop | | Touch (landscape) | |
|---|---|---|---|
| W A S D | Move | Left half | Floating joystick (full push forward = auto-sprint) |
| Mouse | Look | Right half | Drag to look |
| LMB / RMB | Fire / ADS | FIRE (both sides) | Fire; drag on FIRE to aim while firing |
| Shift | Sprint | RUN | Sprint lock |
| Space | Jump | JUMP / CRCH | Jump / crouch (CRCH while sprinting = slide) |
| C · Ctrl | Crouch · Slide (while sprinting) | ADS | Aim (hold or toggle in settings) |
| R · Q · 1/2 | Reload · Swap · Select | RLD · SWAP | Reload · swap weapon |
| F | Interact | USE | Interact |
| Esc | Pause | ⏸ | Pause |

Input mode is auto-detected and can be forced to Desktop or Touch in Settings → Controls.
Settings persist in `localStorage`.

## Structure

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full brainstorm, tuning tables, map layout and batch plan.

```
src/
  main.js              screen router / input-mode switching
  Game.js              level session: world + player + bots + HUD
  core/                Engine (fixed-step loop), Settings, Input, KeyboardMouse, Touch, Audio, EventBus
  world/               Map (procedural level), Materials (canvas textures), Sky (shader dome + sun)
  physics/             WorldCollider (BVH), CharacterController (capsule)
  player/              Player, Weapon defs/state, ViewModel (first-person gun overlay)
  ai/                  Bot FSM, BotManager (waves + extraction)
  fx/                  Tracers, sparks, muzzle light
  ui/                  Screens, HUD, SettingsPanel
  styles/ui.css
```

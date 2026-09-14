# D-Force — Design & Brainstorm Document

> Working name: **D-Force**. A browser FPS built on three.js, styled on the look and feel of
> *Delta Force (Mobile)*: modern military, tactical, weighty movement, punchy guns, muted
> desert/industrial palette, clean HUD.

This document is the source of truth. Every build batch references a section here.

---

## 1. Scope (hard limits — do not creep)

| In scope                                              | Out of scope (v1)                       |
|-------------------------------------------------------|-----------------------------------------|
| Splash screen                                         | Multiplayer / networking                |
| Main menu                                             | Multiple maps / map select              |
| Settings (mobile + desktop controls, audio, graphics) | Operators / classes / loadout screen    |
| **One map**: "Zero Dam Outskirts" (desert industrial) | Vehicles                                |
| Keyboard + mouse controls                             | Progression / unlocks / shop            |
| Touch controls (dual virtual sticks + buttons)        | Ranked / matchmaking                    |
| Bot enemies (simple AI) so the map has a fight        | Voice / chat                            |
| Physics: gravity, capsule collision, slide, jump, ADS, recoil, bullet drop-free hitscan | Ragdolls, destructible terrain |

Single game mode: **Extraction Skirmish** — survive waves of bots, reach the extraction pad.
Win = extract alive. Lose = HP hits 0. Simple, loopable, complete.

---

## 2. Reference: what "feels like Delta Force Mobile"

### 2.1 Visual language
- **Palette**: sand `#c9b58a`, concrete `#8a8680`, rust `#7a4a2a`, olive `#5b6b3a`,
  sky haze `#d8d2c0` → horizon; accent orange `#ff7a1a` (HUD/interactables), teal `#37c6c0`
  (allies/extraction).
- **Lighting**: strong warm directional sun (low-ish angle, long shadows), hemisphere fill
  (sky blue-grey / ground sand), moderate fog for depth, ACES tone mapping, exposure ≈1.0.
- **Post look**: slight vignette on HUD layer (CSS), no heavy bloom (mobile budget).
- **HUD**: thin sans-serif (system UI stack + Rajdhani-ish weight via CSS letter-spacing),
  semi-transparent dark panels with 1px light borders, orange accents. Bottom-right ammo
  block `30 / 120`, bottom-left HP bar + armor bar, top-center compass strip, centre crosshair
  that expands with spread, hit-marker "X" flash, red directional damage indicator.
- **Weapon view model**: low-poly procedural rifle (boxes/cylinders) rendered in a separate
  overlay scene/camera so it never clips geometry. Sway, bob, ADS lerp to center, recoil kick.

### 2.2 Physics / movement feel (numbers tuned for "weighty but responsive")
| Param                | Value            | Note                                  |
|----------------------|------------------|---------------------------------------|
| Walk speed           | 4.6 m/s          |                                       |
| Sprint speed         | 7.0 m/s          | Cannot fire; FOV +8                   |
| ADS speed            | 2.6 m/s          | FOV 75 → 50                           |
| Crouch speed         | 2.4 m/s          | Capsule height 1.8 → 1.2              |
| Ground accel         | 40 m/s²          | Snappy start                          |
| Ground friction      | 10 /s            | Short stop distance                   |
| Air accel            | 6 m/s²           | Limited air control                   |
| Gravity              | −22 m/s²         | Heavier than earth = less floaty      |
| Jump velocity        | 7.2 m/s          | ~1.2 m jump                           |
| Slide                | sprint + crouch: 9 m/s burst decaying 0.9 s, camera lowers |
| Step height          | 0.4 m            | Walk up stairs/curbs                  |
| Player capsule       | r 0.35, h 1.8    |                                       |
| Head bob             | 0.035 m @ 9 Hz walk, 0.05 m @ 12 Hz sprint |             |

Collision: player capsule vs. static world uses **three-mesh-bvh** (`MeshBVH` + capsule
shapecast) — this is the proven pattern from three.js' own `physics_character` example, robust
and fast on mobile. Bullets are hitscan raycasts against BVH (world) + bot hitboxes.

### 2.3 Gunplay
Weapons (2 in v1, switch with 1/2 or touch button):
| Weapon    | RPM | Dmg | Mag | Reserve | Reload | Spread base/ADS | Recoil V/H (deg) |
|-----------|-----|-----|-----|---------|--------|-----------------|------------------|
| AR "M4-D" | 720 | 24  | 30  | 120     | 2.1 s  | 1.6° / 0.25°    | 0.55 / 0.25      |
| SMG "V-9" | 900 | 17  | 35  | 140     | 1.8 s  | 2.4° / 0.6°     | 0.4 / 0.35       |

- Recoil: per-shot camera pitch kick + weapon model kick; recovers at 8°/s.
- Spread grows per shot (+0.35°) decays 6°/s; movement adds spread; ADS divides by ~5.
- Hitscan with tracer (thin emissive line, 60 ms), muzzle flash sprite (40 ms), impact
  sparks (small particle pool), decal-free (budget).
- Headshot multiplier ×2.0 (bot head sphere).
- Damage falloff: full to 30 m, 60% at 70 m+.

### 2.4 Bots (just enough to make the map fun)
Finite state machine: `IDLE → ALERT → CHASE → SHOOT → (COVER) → DEAD`.
- Perception: FOV 120°, range 45 m, line-of-sight raycast, hearing radius on player gunfire 35 m.
- Movement: direct steer toward player with obstacle avoidance via 3 whisker raycasts; capsule
  collision using the same BVH controller as the player.
- Shooting: burst 3–5 rounds, accuracy 35% @ 30 m scaled by distance, 9 dmg/hit.
- 100 HP, head sphere 2× damage. Death: fall-over tween + fade, respawn per wave.
- Waves: 4 → 6 → 8 bots, spawn from 3 fixed points far from player. After wave 3, extraction
  pad activates (teal beacon); standing 5 s on pad = win.

---

## 3. The single map: "Zero Dam Outskirts"

Built **procedurally in code** (no external assets → zero asset-pipeline risk, tiny repo).
~160 × 160 m playable area, walled perimeter.

Layout (top-down, N up):
```
 +-----------------------------------------------+
 |  Bot spawn A     ridge/berms       Bot spawn B |
 |   ┌───┐   ┌────────────┐   containers          |
 |   │WH │   │  COMPOUND  │   ▭▭ ▭▭  ▭            |
 |   └───┘   │  (2 floors)│   ▭  ▭▭               |
 |   silos   └────────────┘        pipes/berm     |
 |   ◯ ◯      courtyard walls        ┌────┐       |
 |            ▬ ▬  ▬  (low cover)    │ WH2│       |
 |   ▬▬  sandbags     ▬▬             └────┘       |
 |  Player spawn (S)        EXTRACTION PAD (E)    |
 |  Bot spawn C                                   |
 +-----------------------------------------------+
```
Elements (all boxes/cylinders with tuned materials + subtle vertex noise on terrain):
- Terrain: 200×200 plane, height noise (gentle dunes ±1.5 m), sand material w/ procedural
  canvas texture (noise + grain), fog matches horizon.
- Central compound: 2-storey concrete building w/ interior ramp, rooftop parapets, window slots.
- Two warehouses (open ends, roof supported by pillars), shipping containers (stackable),
  concrete barriers, sandbag lines, 2 cylindrical silos, pipe racks, perimeter wall + towers.
- Props share ~6 materials to keep draw calls low (merged geometry via `BufferGeometryUtils.mergeGeometries`
  per material → very few draw calls; single BVH on the merged collider mesh).

---

## 4. Screens & flow

```
Splash (1.8 s logo + "tap/click to continue") → Main Menu
Main Menu: [PLAY] [SETTINGS] [QUIT→back to splash]   background: slowly orbiting camera over map
Settings: tabs Controls | Audio | Graphics    (accessible from menu AND pause)
Game: HUD, pause (Esc / ⏸ button) → Resume | Settings | Main Menu
End: WIN / KIA panel → Retry | Main Menu
```

### 4.1 Settings (persisted in `localStorage` under `dforce.settings.v1`)
**Controls**
- Input mode: `Auto | Desktop | Touch` (auto = touch if `pointer: coarse` or touch events)
- Mouse sensitivity 0.1–3.0, ADS sensitivity multiplier
- Touch look sensitivity, touch stick size, left-handed layout, auto-fire when aiming at enemy (touch only, DF-mobile style), gyro (off — not in v1, listed as "coming soon" is NOT allowed; omit)
- Invert Y, hold/toggle ADS, hold/toggle crouch, hold/toggle sprint
- Keybind list display (fixed; rebinding out of scope)

**Audio**: master, SFX, music (music = a quiet procedural drone pad via WebAudio, no files)
**Graphics**: quality Low/Med/High (shadow map size 0/1024/2048, pixel ratio cap 1/1.5/2,
fog distance, particle count), FOV 60–100, show FPS.

### 4.2 Desktop bindings
WASD move · Mouse look · LMB fire · RMB ADS · Shift sprint · Space jump · C crouch · Ctrl slide
(when sprinting) · R reload · 1/2 weapons · Q swap · Esc pause · F interact (extract).

### 4.3 Touch layout (portrait not supported → show "rotate device" overlay; landscape only)
Left half: floating joystick (appears where thumb lands). Right half: drag to look.
Right-side buttons: FIRE (big, bottom-right), ADS (above fire), JUMP, CROUCH, RELOAD,
weapon swap chip near ammo. Left-side: SPRINT (auto-sprint when stick pushed fully forward,
DF-mobile style) — plus a "sprint lock" button. Second fire button on the left (DF-mobile
has this: left-fire so you can aim while shooting). Pause top-right.

---

## 5. Architecture

```
index.html
src/
  main.js                 bootstrap, screen router
  core/
    Engine.js             renderer, clock, resize, fixed-step loop (60 Hz physics, var render)
    Settings.js           schema + localStorage + change events
    Input.js              unified action state {move:vec2, look:vec2, fire, ads, jump,...}
    KeyboardMouse.js      pointer lock, key map → Input
    Touch.js              virtual sticks / buttons → Input
    Audio.js              WebAudio synth SFX (gunshot, reload, hit, footstep, UI) + drone
    EventBus.js           tiny pub/sub
  world/
    Map.js                builds Zero Dam Outskirts, returns {scene objs, collider mesh, spawns}
    Materials.js          shared material palette + procedural canvas textures
    Sky.js                gradient sky dome + sun
  physics/
    Collider.js           BVH build + capsule cast helpers
    CharacterController.js  shared by player + bots (move & slide, step, ground check)
  player/
    Player.js             state machine (stand/crouch/sprint/slide/ADS), camera rig, head bob
    Weapon.js             weapon defs, fire/reload/recoil/spread logic
    ViewModel.js          procedural gun meshes in overlay scene, animation
  ai/
    Bot.js                FSM, perception, shooting
    BotManager.js         waves, spawns, extraction trigger
  fx/
    Tracers.js, Particles.js, MuzzleFlash.js   pooled effects
  ui/
    Screens.js            splash/menu/settings/pause/end DOM screens
    HUD.js                in-game HUD DOM + crosshair + compass + hitmarker
    SettingsPanel.js      builds settings from schema
  styles/
    ui.css
```
- Vanilla JS ES modules, **Vite** for dev/build, `three` + `three-mesh-bvh` only deps.
- No framework. DOM for UI (crisp text, trivially responsive), WebGL for world.
- Fixed timestep physics (1/60) with accumulator; render interpolation not needed at this fidelity.
- Mobile perf targets: ≤ 150 draw calls, ≤ 250k tris, shadows 1024 on Medium.

---

## 6. Build batches (files written per batch, commit after each)

| Batch | Contents                                                                     |
|-------|------------------------------------------------------------------------------|
| 0     | This doc, `package.json`, `vite.config.js`, `.gitignore`, `index.html`        |
| 1     | core: Engine, EventBus, Settings, Input, KeyboardMouse, Touch, Audio          |
| 2     | world: Materials, Sky, Map + physics: Collider, CharacterController          |
| 3     | player: Player, Weapon, ViewModel + fx: Tracers, Particles, MuzzleFlash       |
| 4     | ai: Bot, BotManager                                                          |
| 5     | ui: styles, Screens, HUD, SettingsPanel; `main.js` router; Game.js glue       |
| 6     | Polish pass: tuning, mobile QA, README, GitHub push                          |

---

## 7. Risks & mitigations
- **Pointer lock on mobile / iframe**: fall back to drag-look when lock unavailable.
- **Audio autoplay**: create AudioContext on first user gesture (splash tap).
- **Mobile GPU**: merged geometry, capped pixel ratio, cheap materials (MeshLambert/Phong on Low).
- **Touch + mouse both present (Surface, phones w/ mouse)**: input mode setting overrides auto.
- **Preview iframe**: bind Vite to 0.0.0.0, allow all hosts.

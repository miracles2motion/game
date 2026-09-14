import { Engine } from './core/Engine.js';
import { settings } from './core/Settings.js';
import { bus } from './core/EventBus.js';
import { input } from './core/Input.js';
import { KeyboardMouse } from './core/KeyboardMouse.js';
import { TouchControls } from './core/Touch.js';
import { audio } from './core/Audio.js';
import { Screens } from './ui/Screens.js';
import { Game } from './Game.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

const engine = new Engine(canvas);
const kbm = new KeyboardMouse(canvas);
const touch = new TouchControls(uiRoot);
let game = null;
let state = 'splash'; // splash | menu | settings | play | pause | end
let settingsFrom = 'menu';

const screens = new Screens(uiRoot, {
  splashDone, play, settings: openSettings, closeSettings, quit, resume, abort, menu: toMenu, captureMouse,
});

// ---------- input mode ----------
function applyInputMode() {
  const m = settings.inputMode;
  document.body.classList.toggle('touch-mode', m === 'touch');
  screens.setMode(m);
  if (state === 'play') {
    if (m === 'touch') { kbm.disable(); touch.enable(); touch.setVisible(true); screens.setClickToPlay(false); }
    else { touch.disable(); kbm.enable(); if (!kbm.locked) screens.setClickToPlay(true); }
  } else { kbm.disable(); touch.disable(); screens.setClickToPlay(false); }
  touch.applyLayout();
}
bus.on('settings:change', k => { if (['inputMode', 'touchStickSize', 'touchButtonSize', 'leftHanded'].includes(k)) applyInputMode(); });
bus.on('input:lock', locked => { if (state === 'play' && settings.inputMode === 'desktop') { screens.setClickToPlay(!locked); if (!locked && !document.hidden) { /* losing lock = pause for safety */ pause(); } } });
function updateOrientation() { document.body.classList.toggle('portrait', window.innerHeight > window.innerWidth); }
window.addEventListener('resize', updateOrientation); updateOrientation();

// ---------- flow ----------
function splashDone() {
  if (state !== 'splash') return;
  audio.init(); audio.startAmbience();
  if (!game) { game = new Game(engine, uiRoot); game.onEnd = onEnd; engine.setSession(game); }
  toMenu();
}
function toMenu() {
  state = 'menu'; game.startMenu(); screens.show('menu'); applyInputMode(); kbm.unlock(); audio.extractHum(false);
}
function play() {
  state = 'play'; screens.hideAll(); game.startMatch(); applyInputMode();
  if (settings.inputMode === 'desktop') kbm.requestLock();
}
function pause() {
  if (state !== 'play') return;
  state = 'pause'; game.setPaused(true); screens.show('pause'); kbm.unlock(); touch.setVisible(false); screens.setClickToPlay(false);
}
function resume() {
  if (state !== 'pause') return;
  state = 'play'; screens.hideAll(); game.setPaused(false); applyInputMode();
  if (settings.inputMode === 'desktop') kbm.requestLock();
}
function abort() { state = 'menu'; game.setPaused(false); toMenu(); }
function openSettings() { settingsFrom = state === 'pause' ? 'pause' : 'menu'; state = 'settings'; screens.show('settingsScreen'); }
function closeSettings() { if (settingsFrom === 'pause') { state = 'pause'; screens.show('pause'); } else toMenu(); }
function quit() { state = 'splash'; game.startMenu(); screens.show('splash'); applyInputMode(); }
function onEnd(r) { state = 'end'; game.setPaused(true); kbm.unlock(); touch.setVisible(false); screens.setClickToPlay(false); screens.showEnd(r); }
function captureMouse() { kbm.requestLock(); }

// Pause key from either device (Esc / touch pause). Polled each frame.
function pollGlobal() {
  requestAnimationFrame(pollGlobal);
  if (input.take('pause')) {
    if (state === 'play') pause();
    else if (state === 'pause') resume();
    else if (state === 'settings' && settingsFrom === 'pause') closeSettings();
  }
}
pollGlobal();
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pause(); });

engine.start();

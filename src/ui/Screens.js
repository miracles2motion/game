import { buildSettingsPanel } from './SettingsPanel.js';
import { audio } from '../core/Audio.js';

/** DOM screens: splash, main menu, settings, pause, end. Pure presentation; router wires actions. */
export class Screens {
  constructor(root, actions) {
    this.root = root; this.a = actions;
    this.splash = this._el('splash', 'screen', `
      <div class="logo">D-<b>FORCE</b></div>
      <div class="tag">Tactical Operations · Zero Dam</div>
      <div class="bar"><i></i></div>
      <div class="press">Tap or click to continue</div>`);
    this.splash.onclick = () => actions.splashDone();
    window.addEventListener('keydown', e => { if (!this.splash.classList.contains('hidden') && (e.code === 'Enter' || e.code === 'Space')) actions.splashDone(); });

    this.menu = this._el('menu', 'screen hidden', `
      <div class="vignette"></div>
      <div class="menu-wrap">
        <div class="menu-top">
          <div class="brand">D-<b>FORCE</b><small>Extraction Skirmish</small></div>
          <div class="map-card"><div class="k">Deployment</div><div class="v">Zero Dam Outskirts</div><div class="d">Clear three hostile waves, then hold the extraction pad for five seconds.</div></div>
        </div>
        <div class="menu-btns">
          <button class="mbtn primary" data-a="play">Deploy<small>Start operation</small></button>
          <button class="mbtn" data-a="settings">Settings<small>Controls · Audio · Graphics</small></button>
          <button class="mbtn" data-a="quit">Quit<small>Back to title</small></button>
        </div>
        <div class="menu-bottom"><span class="chip">Input: <i data-mode></i></span><span>D-Force v0.1 · three.js</span></div>
      </div>`);
    this.menu.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { audio.uiConfirm(); actions[b.dataset.a](); });

    this.settingsScreen = this._el('settings', 'screen dim hidden', '');
    this.settingsPanel = buildSettingsPanel({ onClose: () => actions.closeSettings() });
    this.settingsScreen.appendChild(this.settingsPanel.el);

    this.pause = this._el('pause', 'screen dim hidden', `
      <div class="center-stack">
        <div class="big-title">Paused</div>
        <button class="mbtn primary" data-a="resume">Resume</button>
        <button class="mbtn" data-a="settings">Settings</button>
        <button class="mbtn" data-a="abort">Main menu<small>Abandon operation</small></button>
      </div>`);
    this.pause.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { audio.ui(); actions[b.dataset.a](); });

    this.end = this._el('end', 'screen dim hidden', `
      <div class="center-stack">
        <div class="big-title" data-title></div>
        <div class="stats"><div><div class="n" data-k>0</div><div class="l">Kills</div></div><div><div class="n" data-t>0:00</div><div class="l">Time</div></div><div><div class="n" data-acc>0%</div><div class="l">Accuracy</div></div></div>
        <button class="mbtn primary" data-a="play">Retry</button>
        <button class="mbtn" data-a="menu">Main menu</button>
      </div>`);
    this.end.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { audio.uiConfirm(); actions[b.dataset.a](); });

    this.clickToPlay = this._el('ctp', 'click-to-play hidden', `<div>Click to capture mouse</div>`);
    this.clickToPlay.onclick = () => actions.captureMouse();

    this.rotate = this._el('rotate', '', `<div class="ph"></div><div>Rotate device to landscape</div>`);
  }
  _el(id, cls, html) { const d = document.createElement('div'); d.id = id; d.className = cls; d.innerHTML = html; this.root.appendChild(d); return d; }
  show(name) { for (const n of ['splash', 'menu', 'settingsScreen', 'pause', 'end']) this[n].classList.toggle('hidden', n !== name); if (name === 'settingsScreen') this.settingsPanel.refresh(); }
  hideAll() { this.show(null); }
  setMode(m) { this.menu.querySelector('[data-mode]').textContent = m === 'touch' ? 'Touch' : 'Keyboard + Mouse'; }
  showEnd(r) {
    const t = this.end.querySelector('[data-title]'); t.textContent = r.win ? 'Extracted' : 'K.I.A.'; t.className = 'big-title ' + (r.win ? 'win' : 'lose');
    this.end.querySelector('[data-k]').textContent = r.kills;
    const m = Math.floor(r.time / 60), s = Math.floor(r.time % 60); this.end.querySelector('[data-t]').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    this.end.querySelector('[data-acc]').textContent = `${r.accuracy}%`;
    this.show('end');
  }
  setClickToPlay(v) { this.clickToPlay.classList.toggle('hidden', !v); }
}

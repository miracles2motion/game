import { SCHEMA, settings } from '../core/Settings.js';
import { KEYBINDS } from '../core/KeyboardMouse.js';
import { audio } from '../core/Audio.js';

/** Builds the settings panel from SCHEMA. Returns root element; call `refresh()` when showing. */
export function buildSettingsPanel({ onClose }) {
  const root = document.createElement('div');
  root.className = 'panel';
  root.innerHTML = `
    <div class="panel-head"><h2>Settings</h2><button class="btn" data-close>Back</button></div>
    <div class="tabs"></div>
    <div class="panel-body"></div>
    <div class="panel-foot"><button class="btn danger" data-reset>Reset defaults</button><span class="chip">Mode: <i data-mode></i></span></div>
  `;
  const tabs = root.querySelector('.tabs'), body = root.querySelector('.panel-body');
  const sections = Object.keys(SCHEMA);
  let active = sections[0];
  const rows = [];

  const fmt = (it, v) => it.type === 'range' ? (it.max <= 3 ? (+v).toFixed(2) : Math.round(v)) : v;

  function render() {
    tabs.innerHTML = '';
    for (const s of sections) {
      const b = document.createElement('button'); b.className = 'tab' + (s === active ? ' active' : ''); b.textContent = SCHEMA[s].label;
      b.onclick = () => { active = s; audio.ui(); render(); };
      tabs.appendChild(b);
    }
    body.innerHTML = ''; rows.length = 0;
    const mode = settings.inputMode;
    root.querySelector('[data-mode]').textContent = mode === 'touch' ? 'Touch' : 'Keyboard + Mouse';
    for (const [k, it] of Object.entries(SCHEMA[active].items)) {
      const row = document.createElement('div'); row.className = 'row';
      if (it.scope && it.scope !== mode) row.classList.add('dimmed');
      const lab = document.createElement('label'); lab.textContent = it.label;
      if (it.hint) { const s = document.createElement('small'); s.textContent = it.hint; lab.appendChild(s); }
      else if (it.scope) { const s = document.createElement('small'); s.textContent = it.scope === 'touch' ? 'Touch only' : 'Keyboard + mouse only'; lab.appendChild(s); }
      const ctl = document.createElement('div'); ctl.className = 'ctl';
      const v = settings.get(k);
      if (it.type === 'range') {
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = it.min; inp.max = it.max; inp.step = it.step; inp.value = v;
        const val = document.createElement('span'); val.className = 'val'; val.textContent = fmt(it, v);
        inp.oninput = () => { settings.set(k, +inp.value); val.textContent = fmt(it, inp.value); };
        inp.onchange = () => audio.ui();
        ctl.append(inp, val);
      } else if (it.type === 'toggle') {
        const b = document.createElement('button'); b.className = 'toggle' + (v ? ' on' : ''); b.setAttribute('aria-label', it.label);
        b.onclick = () => { const nv = !settings.get(k); settings.set(k, nv); b.classList.toggle('on', nv); audio.ui(); };
        ctl.append(b);
      } else if (it.type === 'select') {
        const seg = document.createElement('div'); seg.className = 'seg';
        for (const o of it.options) {
          const b = document.createElement('button'); b.textContent = o; b.classList.toggle('on', o === v);
          b.onclick = () => { settings.set(k, o); audio.ui(); render(); };
          seg.appendChild(b);
        }
        ctl.append(seg);
      }
      row.append(lab, ctl); body.appendChild(row);
    }
    if (active === 'controls') {
      const t = document.createElement('div'); t.className = 'section-title'; t.textContent = 'Keyboard & mouse bindings'; body.appendChild(t);
      const keys = document.createElement('div'); keys.className = 'keys';
      for (const [key, act] of KEYBINDS) { const d = document.createElement('div'); d.innerHTML = `<span>${act}</span><kbd>${key}</kbd>`; keys.appendChild(d); }
      body.appendChild(keys);
      const t2 = document.createElement('div'); t2.className = 'section-title'; t2.textContent = 'Touch layout'; body.appendChild(t2);
      const p = document.createElement('div'); p.style.cssText = 'font-size:13px;color:var(--muted);line-height:1.5';
      p.textContent = 'Left half: floating joystick (push fully forward to auto-sprint). Right half: drag to look. Fire buttons on both sides — drag on FIRE to aim while shooting. RUN locks sprint. CRCH while sprinting = slide.';
      body.appendChild(p);
    }
  }
  root.querySelector('[data-close]').onclick = () => { audio.ui(); onClose(); };
  root.querySelector('[data-reset]').onclick = () => { settings.reset(); audio.uiConfirm(); render(); };
  return { el: root, refresh: render };
}

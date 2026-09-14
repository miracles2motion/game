import * as THREE from 'three';

// ---- Procedural canvas textures (no asset files) ----
function canvasTex(size, draw, { repeat = 1, aniso = 4 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(g, size, base, amp, n = 4000, alpha = 0.08) {
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * amp - amp / 2);
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${alpha})`;
    const s = 1 + Math.random() * 3;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

export function makeTextures() {
  const sand = canvasTex(512, (g, s) => {
    noise(g, s, '#c4ad7f', 60, 14000, 0.09);
    // subtle streaks
    g.strokeStyle = 'rgba(120,95,60,0.08)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + 20, s * 0.6, y - 20, s, y + 5); g.stroke(); }
  }, { repeat: 40 });

  const concrete = canvasTex(512, (g, s) => {
    noise(g, s, '#8b877f', 50, 9000, 0.1);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 3;
    // panel seams
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); }
    // stains
    for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(40,30,20,${Math.random() * 0.12})`; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 40, 5 + Math.random() * 20, Math.random() * 3, 0, 6.28); g.fill(); }
  }, { repeat: 2 });

  const metal = canvasTex(512, (g, s) => {
    noise(g, s, '#5f6a70', 40, 6000, 0.08);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 3, s); // corrugation
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(120,60,20,${Math.random() * 0.35})`; g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 20, 2 + Math.random() * 6); }
  }, { repeat: 1 });

  const rust = canvasTex(256, (g, s) => noise(g, s, '#7a4a2a', 70, 5000, 0.12), { repeat: 1 });

  const container = canvasTex(512, (g, s) => {
    noise(g, s, '#3d5a3a', 30, 4000, 0.08);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (let x = 0; x < s; x += 24) g.fillRect(x, 0, 4, s);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = 'bold 48px monospace'; g.fillText('DF-2077', 40, 120);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,60,25,${Math.random() * 0.4})`; g.fillRect(Math.random() * s, Math.random() * s, 4 + Math.random() * 30, 2 + Math.random() * 10); }
  }, { repeat: 1 });

  const sandbag = canvasTex(256, (g, s) => {
    noise(g, s, '#9a8a62', 40, 3000, 0.1);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 4;
    for (let y = 0; y < s; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    for (let y = 0; y < s; y += 32) for (let x = ((y / 32) % 2) * 32; x < s; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
  }, { repeat: 2 });

  const asphalt = canvasTex(512, (g, s) => noise(g, s, '#4a4744', 40, 12000, 0.1), { repeat: 8 });

  return { sand, concrete, metal, rust, container, sandbag, asphalt };
}

/** Shared palette: few materials → geometry merged per material → few draw calls. */
export function makeMaterials(quality = 'high') {
  const T = makeTextures();
  const Mat = quality === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const std = (opts) => {
    const o = { ...opts };
    if (quality === 'low') { delete o.roughness; delete o.metalness; }
    return new Mat(o);
  };
  return {
    sand:      std({ map: T.sand, color: 0xd6c39a, roughness: 1.0, metalness: 0 }),
    concrete:  std({ map: T.concrete, color: 0xa39e94, roughness: 0.92, metalness: 0 }),
    concreteDark: std({ map: T.concrete, color: 0x6f6b64, roughness: 0.95, metalness: 0 }),
    metal:     std({ map: T.metal, color: 0x8d979c, roughness: 0.6, metalness: 0.55 }),
    rust:      std({ map: T.rust, color: 0x9a5a34, roughness: 0.85, metalness: 0.3 }),
    container: std({ map: T.container, color: 0x8fa38a, roughness: 0.7, metalness: 0.4 }),
    containerRed: std({ map: T.container, color: 0xb0553a, roughness: 0.7, metalness: 0.4 }),
    containerBlue: std({ map: T.container, color: 0x4f6d8a, roughness: 0.7, metalness: 0.4 }),
    sandbag:   std({ map: T.sandbag, color: 0xb5a57a, roughness: 1, metalness: 0 }),
    asphalt:   std({ map: T.asphalt, color: 0x5a5753, roughness: 1, metalness: 0 }),
    olive:     std({ color: 0x5b6b3a, roughness: 0.9, metalness: 0.05 }),
    darkMetal: std({ color: 0x2c3033, roughness: 0.5, metalness: 0.7 }),
    orange:    std({ color: 0xff7a1a, roughness: 0.6, metalness: 0.1, emissive: 0x662c00 }),
    teal:      new THREE.MeshBasicMaterial({ color: 0x37c6c0 }),
    glassDark: std({ color: 0x1a222a, roughness: 0.2, metalness: 0.9 }),
    textures: T,
  };
}

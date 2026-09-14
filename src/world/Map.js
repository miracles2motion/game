import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterials } from './Materials.js';

/**
 * "Zero Dam Outskirts" — the single D-Force map, generated procedurally.
 * Everything static is merged per material (few draw calls) and into ONE collider mesh.
 */
const HALF = 80;         // playable half-size (perimeter wall)

// deterministic pseudo random so the map is identical every load
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

class Builder {
  constructor(materials) {
    this.materials = materials;
    this.byMat = new Map();   // material -> geometry[]
    this.colliders = [];      // geometry[] (world-space)
  }
  add(geom, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = null, collide = true } = {}) {
    const g = geom.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    m.compose(new THREE.Vector3(...pos), q, scale ? new THREE.Vector3(...scale) : new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    if (collide) this.colliders.push(g);
    return g;
  }
  box(w, h, d, mat, opts) { return this.add(new THREE.BoxGeometry(w, h, d), mat, opts); }
  cyl(rt, rb, h, seg, mat, opts) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, opts); }
  build() {
    const group = new THREE.Group(); group.name = 'map';
    for (const [mat, geoms] of this.byMat) {
      const merged = mergeGeometries(geoms.map(g => stripToPNU(g)), false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    const colGeom = mergeGeometries(this.colliders.map(g => onlyPosition(g)), false);
    const collider = new THREE.Mesh(colGeom, new THREE.MeshBasicMaterial({ wireframe: true, color: 0x00ff00 }));
    collider.visible = false; collider.name = 'collider';
    return { group, collider };
  }
}
function stripToPNU(g) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  out.setAttribute('normal', g.getAttribute('normal'));
  out.setAttribute('uv', g.getAttribute('uv'));
  out.setIndex(g.getIndex());
  return out.toNonIndexed();
}
function onlyPosition(g) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  out.setIndex(g.getIndex());
  return out.toNonIndexed();
}

// ---------- terrain ----------
function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const edge = THREE.MathUtils.smoothstep(r, 55, 82); // dunes rise toward perimeter
  const n = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.35 + Math.sin(x * 0.031 + z * 0.047) * 0.5
          + Math.sin(x * 0.23 + 1.3) * Math.sin(z * 0.19) * 0.15;
  return n * (0.35 + edge * 1.6) + edge * 1.1;
}
export { terrainHeight };

function buildTerrain(b, M) {
  const size = 240, seg = 120;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, terrainHeight(x, z));
  }
  g.computeVertexNormals();
  b.add(g, M.sand, { collide: true });
  // Road strips (decorative, no collision)
  const road = (x, z, w, l, ry) => b.add(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), M.asphalt, { pos: [x, 0.03, z], rot: [0, ry, 0], collide: false });
  road(-28, -30, 6, 80, 0.6);
  road(0, -45, 6, 70, Math.PI / 2);
  road(38, -20, 6, 60, 0.15);
}

// ---------- structures ----------
function compound(b, M) {
  // 2-storey concrete building at origin. 24 (x) × 16 (z). Floor 0 at y=0.3, floor 1 at y=3.9.
  const W = 24, D = 16, T = 0.4, H = 3.6, cx = 0, cz = 0;
  b.box(W + 2, 0.6, D + 2, M.concreteDark, { pos: [cx, 0.0, cz] });          // slab
  const wall = (x, z, w, d, h, y, mat = M.concrete) => b.box(w, h, d, mat, { pos: [x, y + h / 2, z] });
  // Ground floor walls with openings
  // South wall (z = +D/2) with door in the middle
  wall(cx - W / 2 + 5, cz + D / 2, 10, T, H, 0.3); wall(cx + W / 2 - 5, cz + D / 2, 10, T, H, 0.3);
  wall(cx, cz + D / 2, 4, T, H - 2.3, 0.3 + 2.3); // lintel above door (door 4 wide, 2.3 tall)
  // North wall with two window slots
  wall(cx - W / 2 + 4, cz - D / 2, 8, T, H, 0.3); wall(cx + W / 2 - 4, cz - D / 2, 8, T, H, 0.3);
  wall(cx - 4, cz - D / 2, 8, T, 1.2, 0.3); wall(cx - 4, cz - D / 2, 8, T, H - 2.4, 0.3 + 2.4);  // window: 1.2m sill, 1.2m opening
  wall(cx + 4, cz - D / 2, 8, T, 1.2, 0.3); wall(cx + 4, cz - D / 2, 8, T, H - 2.4, 0.3 + 2.4);
  // East wall with door
  wall(cx + W / 2, cz - D / 2 + 3, T, 6, H, 0.3); wall(cx + W / 2, cz + D / 2 - 3, T, 6, H, 0.3);
  wall(cx + W / 2, cz, T, 4, H - 2.3, 0.3 + 2.3);
  // West wall solid with window
  wall(cx - W / 2, cz - 4, T, 8, H, 0.3);
  wall(cx - W / 2, cz + 4, T, 8, 1.2, 0.3); wall(cx - W / 2, cz + 4, T, 8, H - 2.4, 0.3 + 2.4);
  // Interior partition + pillars
  wall(cx - 4, cz - 2, T, 6, H, 0.3); wall(cx + 6, cz + 3, 6, T, H, 0.3);
  // First floor slab with stair hole (hole at x∈[-11,-7], z∈[-6,0])
  const F1 = 0.3 + H;
  b.box(W, 0.3, 6, M.concreteDark, { pos: [cx, F1 + 0.15, cz + D / 2 - 3] });            // south strip z∈[2,8]
  b.box(W, 0.3, 2, M.concreteDark, { pos: [cx, F1 + 0.15, cz - D / 2 + 1] });            // north strip z∈[-8,-6]
  b.box(W - 4, 0.3, 8, M.concreteDark, { pos: [cx + 2, F1 + 0.15, cz - 2] });            // middle, x∈[-10,12]... leave hole x∈[-12,-8]
  // Stairs up to hole: 12 steps of 0.3 rise along +z→-z in x∈[-12,-8], starting z=+1 going to z=-6
  for (let i = 0; i < 12; i++) {
    const rise = (i + 1) * 0.3, depth = 0.6;
    b.box(4, rise, depth, M.concreteDark, { pos: [cx - 10, 0.3 + rise / 2, cz + 1 - i * depth - depth / 2] });
  }
  // 1st floor walls (shorter, with big windows), parapet roof
  const H2 = 3.0, y2 = F1 + 0.3;
  const win = (x, z, w, d) => { // wall w/ window opening: sill 1.0, top 1.0
    wall(x, z, w, d, 1.0, y2); wall(x, z, w, d, H2 - 2.2, y2 + 2.2);
  };
  wall(cx - W / 2 + 3, cz + D / 2, 6, T, H2, y2); win(cx - 3, cz + D / 2, 6, T); win(cx + 3, cz + D / 2, 6, T); wall(cx + W / 2 - 3, cz + D / 2, 6, T, H2, y2);
  wall(cx - W / 2 + 3, cz - D / 2, 6, T, H2, y2); win(cx - 3, cz - D / 2, 6, T); win(cx + 3, cz - D / 2, 6, T); wall(cx + W / 2 - 3, cz - D / 2, 6, T, H2, y2);
  win(cx - W / 2, cz - 4, T, 8); wall(cx - W / 2, cz + 4, T, 8, H2, y2);
  win(cx + W / 2, cz + 4, T, 8); wall(cx + W / 2, cz - 4, T, 8, H2, y2);
  // Roof slab + parapet
  const RY = y2 + H2;
  b.box(W + 0.4, 0.3, D + 0.4, M.concreteDark, { pos: [cx, RY + 0.15, cz] });
  const par = 1.1;
  b.box(W + 0.4, par, T, M.concrete, { pos: [cx, RY + 0.3 + par / 2, cz + D / 2] });
  b.box(W + 0.4, par, T, M.concrete, { pos: [cx, RY + 0.3 + par / 2, cz - D / 2] });
  b.box(T, par, D + 0.4, M.concrete, { pos: [cx - W / 2, RY + 0.3 + par / 2, cz] });
  b.box(T, par, D + 0.4, M.concrete, { pos: [cx + W / 2, RY + 0.3 + par / 2, cz] });
  // Roof access: hatch stairs are skipped; instead external metal stair on east side to roof
  extStair(b, M, cx + W / 2 + 0.6, cz - 2, RY + 0.3, 1);
  // AC units & water tank on roof
  b.box(1.6, 1.2, 1.6, M.metal, { pos: [cx + 6, RY + 0.9, cz - 4] });
  b.box(1.6, 1.2, 1.6, M.metal, { pos: [cx + 8, RY + 0.9, cz - 4] });
  b.cyl(1.4, 1.4, 2.2, 14, M.rust, { pos: [cx - 7, RY + 1.4, cz + 4] });
  // Courtyard wall 44 × 32 with gaps
  const CW = 44, CD = 32, ch = 2.2;
  b.box(16, ch, 0.35, M.concrete, { pos: [cx - CW / 2 + 8, ch / 2, cz + CD / 2] });
  b.box(16, ch, 0.35, M.concrete, { pos: [cx + CW / 2 - 8, ch / 2, cz + CD / 2] });
  b.box(16, ch, 0.35, M.concrete, { pos: [cx - CW / 2 + 8, ch / 2, cz - CD / 2] });
  b.box(16, ch, 0.35, M.concrete, { pos: [cx + CW / 2 - 8, ch / 2, cz - CD / 2] });
  b.box(0.35, ch, 12, M.concrete, { pos: [cx - CW / 2, ch / 2, cz - CD / 2 + 6] });
  b.box(0.35, ch, 12, M.concrete, { pos: [cx - CW / 2, ch / 2, cz + CD / 2 - 6] });
  b.box(0.35, ch, 12, M.concrete, { pos: [cx + CW / 2, ch / 2, cz - CD / 2 + 6] });
  b.box(0.35, ch, 12, M.concrete, { pos: [cx + CW / 2, ch / 2, cz + CD / 2 - 6] });
  // courtyard cover
  jersey(b, M, cx - 8, cz + 12, 0); jersey(b, M, cx - 5.8, cz + 12, 0); jersey(b, M, cx + 9, cz + 12, 0.3);
  sandbags(b, M, cx + 16, cz - 10, Math.PI / 2, 3);
  sandbags(b, M, cx - 17, cz + 6, Math.PI / 2, 2);
  crate(b, M, cx - 8, cz - 11, 0.4); crate(b, M, cx - 6.6, cz - 11, 0.1); crate(b, M, cx - 7.3, cz - 11, 0, 1.2);
}

function extStair(b, M, x, z, topY, dir) {
  // straight metal stair climbing along +z. Each step 0.28 high 0.5 deep, 1.6 wide
  const n = Math.round(topY / 0.28);
  for (let i = 0; i < n; i++) {
    const y = (i + 1) * 0.28;
    b.box(1.6, 0.12, 0.5, M.darkMetal, { pos: [x + 0.8, y, z + i * 0.5 * dir] });
    // invisible-ish riser for collision smoothness
    b.box(1.6, 0.28, 0.06, M.darkMetal, { pos: [x + 0.8, y - 0.14, z + i * 0.5 * dir - 0.22 * dir] });
  }
  // railing
  b.box(0.06, 1.0, n * 0.5, M.darkMetal, { pos: [x + 1.6, topY / 2 + 0.6, z + (n * 0.5 * dir) / 2 - 0.25 * dir], collide: false });
}

function jersey(b, M, x, z, ry) {
  b.box(2.0, 0.85, 0.6, M.concrete, { pos: [x, 0.425, z], rot: [0, ry, 0] });
  b.box(2.0, 0.25, 0.9, M.concrete, { pos: [x, 0.125, z], rot: [0, ry, 0] });
}
function sandbags(b, M, x, z, ry, n = 3) {
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 1.6;
    b.box(1.6, 1.0, 0.7, M.sandbag, { pos: [x + Math.cos(ry) * off, 0.5, z - Math.sin(ry) * off], rot: [0, ry, 0] });
  }
}
function crate(b, M, x, z, ry, s = 1) {
  b.box(1.2 * s, 1.2 * s, 1.2 * s, M.olive, { pos: [x, 0.6 * s, z], rot: [0, ry, 0] });
}
function container(b, M, x, y, z, ry, mat) {
  b.box(6.0, 2.6, 2.44, mat, { pos: [x, y + 1.3, z], rot: [0, ry, 0] });
}

function warehouse(b, M, cx, cz, W, D, H, ry = 0) {
  // Open-ended shed: two long walls, roof on pillars, concrete floor
  const rot = [0, ry, 0];
  const R = (lx, lz) => [cx + Math.cos(ry) * lx + Math.sin(ry) * lz, cz - Math.sin(ry) * lx + Math.cos(ry) * lz];
  const p = (lx, y, lz) => { const [x, z] = R(lx, lz); return [x, y, z]; };
  b.box(W + 1, 0.4, D + 1, M.concreteDark, { pos: p(0, 0.1, 0), rot });
  b.box(W, H, 0.3, M.metal, { pos: p(0, 0.2 + H / 2, -D / 2), rot });
  b.box(W, H, 0.3, M.metal, { pos: p(0, 0.2 + H / 2, D / 2), rot });
  b.box(W + 1.5, 0.25, D + 1.5, M.rust, { pos: p(0, 0.2 + H + 0.12, 0), rot });
  for (const lx of [-W / 2 + 0.3, W / 2 - 0.3]) for (const lz of [-D / 4, D / 4]) b.box(0.4, H, 0.4, M.darkMetal, { pos: p(lx, 0.2 + H / 2, lz), rot });
  // Roof beams (no collision)
  for (let i = -2; i <= 2; i++) b.box(0.2, 0.4, D, M.darkMetal, { pos: p(i * W / 5, 0.2 + H - 0.25, 0), rot, collide: false });
  // Interior: crates, container, mezzanine
  const [c1x, c1z] = R(-W / 4, D / 6); crate(b, M, c1x, c1z, ry + 0.2); crate(b, M, c1x + 1.3, c1z, ry + 0.1); crate(b, M, c1x + 0.6, c1z, ry, 1); 
  b.box(1.2, 1.2, 1.2, M.olive, { pos: p(-W / 4 + 0.6, 1.8, D / 6), rot });
  const [ctx, ctz] = R(W / 4, -D / 6); container(b, M, ctx, 0.2, ctz, ry + Math.PI / 2, M.containerBlue);
  // Mezzanine platform along back wall with ladder-stair
  b.box(W * 0.5, 0.2, 3, M.darkMetal, { pos: p(-W / 4, 3.0, -D / 2 + 1.7), rot });
  for (let i = 0; i < 10; i++) b.box(1.2, 0.1, 0.5, M.darkMetal, { pos: p(-W / 4 + W * 0.25 + 0.6 + 0.01, 0.3 * (i + 1), -D / 2 + 1.7 + 1.5 - 0.5 * (10 - i) + 0.25), rot });
}

function silos(b, M, x, z) {
  b.cyl(3.2, 3.2, 11, 20, M.metal, { pos: [x, 5.5, z] });
  b.cyl(3.2, 3.2, 11, 20, M.metal, { pos: [x + 7.5, 5.5, z] });
  b.cyl(0.4, 3.2, 1.6, 20, M.rust, { pos: [x, 11.8, z] });
  b.cyl(0.4, 3.2, 1.6, 20, M.rust, { pos: [x + 7.5, 11.8, z] });
  b.box(7.5, 0.3, 1.2, M.darkMetal, { pos: [x + 3.75, 8, z], collide: false });
  b.cyl(3.6, 3.6, 0.5, 20, M.concreteDark, { pos: [x, 0.25, z] });
  b.cyl(3.6, 3.6, 0.5, 20, M.concreteDark, { pos: [x + 7.5, 0.25, z] });
  // pipes out of silo
  b.cyl(0.35, 0.35, 12, 10, M.rust, { pos: [x + 3.75, 1.2, z + 4], rot: [0, 0, Math.PI / 2] });
  b.cyl(0.35, 0.35, 12, 10, M.rust, { pos: [x + 3.75, 1.9, z + 4], rot: [0, 0, Math.PI / 2] });
}

function containerYard(b, M, cx, cz, r) {
  const mats = [M.container, M.containerRed, M.containerBlue];
  const cells = [
    [0, 0, 0], [0, 3, 0], [7, 0, 0.1], [7, 3.2, -0.05], [0, 0, 0, 1], [7, 0, 0.1, 1],
    [3.5, -6, Math.PI / 2], [-6, -3, 1.2], [14, 1.5, Math.PI / 2], [14, 8, Math.PI / 2], [14, 1.5, Math.PI / 2, 1],
    [-4, 8, 0.4], [3, 9, 0.05],
  ];
  cells.forEach((c, i) => container(b, M, cx + c[0], (c[3] || 0) * 2.6, cz + c[1], c[2], mats[i % 3]));
  // ramp made from crates to reach a stacked container top
  for (let i = 0; i < 4; i++) b.box(1.5, 0.65 * (i + 1), 1.5, M.olive, { pos: [cx - 3, 0.325 * (i + 1), cz - 1.5 + i * 1.5 - 1.5] });
  jersey(b, M, cx + 9, cz - 6, 0.2); jersey(b, M, cx - 8, cz + 3, 1.4);
}

function pipeRack(b, M, cx, cz) {
  for (let i = 0; i < 3; i++) {
    const y = 1.0 + i * 0.9;
    b.cyl(0.4, 0.4, 24, 10, i === 1 ? M.rust : M.metal, { pos: [cx, y, cz + i * 0.1], rot: [0, 0, Math.PI / 2] });
  }
  for (const x of [-10, -3, 4, 11]) {
    b.box(0.3, 3.2, 0.3, M.darkMetal, { pos: [cx + x, 1.6, cz - 0.6] });
    b.box(0.3, 3.2, 0.3, M.darkMetal, { pos: [cx + x, 1.6, cz + 0.6] });
    b.box(0.3, 0.2, 1.5, M.darkMetal, { pos: [cx + x, 3.1, cz], collide: false });
  }
  // valve station
  b.cyl(1.2, 1.2, 2.4, 14, M.rust, { pos: [cx + 14, 1.2, cz] });
  b.box(2.5, 1.0, 2.5, M.concreteDark, { pos: [cx - 14, 0.5, cz] });
}

function perimeter(b, M) {
  const h = 5, t = 0.8, L = HALF * 2 + t;
  b.box(L, h, t, M.concrete, { pos: [0, h / 2 - 0.2, -HALF] });
  b.box(L, h, t, M.concrete, { pos: [0, h / 2 - 0.2, HALF] });
  b.box(t, h, L, M.concrete, { pos: [-HALF, h / 2 - 0.2, 0] });
  b.box(t, h, L, M.concrete, { pos: [HALF, h / 2 - 0.2, 0] });
  // corner towers
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    b.box(4, 9, 4, M.concreteDark, { pos: [sx * (HALF - 2), 4.3, sz * (HALF - 2)] });
    b.box(5, 0.3, 5, M.darkMetal, { pos: [sx * (HALF - 2), 9.0, sz * (HALF - 2)] });
    b.box(5, 2.2, 5, M.olive, { pos: [sx * (HALF - 2), 10.2, sz * (HALF - 2)] });
  }
  // invisible ceiling-height blocker to stop jumping out (extra tall thin walls)
  const hh = 30;
  b.add(new THREE.BoxGeometry(L, hh, 0.2), M.concrete, { pos: [0, hh / 2, -HALF - 0.5] });
}

function rocksAndScatter(b, M, rand) {
  const rock = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, r = 20 + rand() * 55;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 24 && Math.abs(z) < 18) continue; // keep compound clear
    const s = 0.4 + rand() * 1.4;
    const y = terrainHeight(x, z);
    b.add(rock, M.concreteDark, { pos: [x, y + s * 0.3, z], rot: [rand() * 3, rand() * 3, rand() * 3], scale: [s, s * 0.6, s * (0.7 + rand() * 0.6)], collide: s > 0.8 });
  }
  // random jerseys / sandbags along roads and open ground
  const spots = [[-30, -50, 0.6], [-22, -38, 0.6], [-14, -26, 0.6], [22, -50, 1.5], [10, -62, 0], [-45, -10, 0.2], [-60, 30, 1.0], [55, 15, 1.2], [30, 55, 0.3], [-20, 55, 0.9], [60, -10, 1.3], [-8, -60, 0.1]];
  spots.forEach(([x, z, r], i) => (i % 2 ? jersey(b, M, x, z, r) : sandbags(b, M, x, z, r, 2 + (i % 3))));
  // berms
  for (const [x, z, ry] of [[0, 62, 0], [-55, 55, 0.7], [58, 58, -0.7], [-62, -45, -0.5], [66, -50, 0.4]]) {
    b.add(new THREE.CylinderGeometry(1.8, 4.5, 2.4, 10).scale(3, 1, 1), M.sand, { pos: [x, 0.9, z], rot: [0, ry, 0] });
  }
  // light poles (decorative, collide via thin pole)
  for (const [x, z] of [[-40, -55], [-15, -20], [25, -35], [40, 20], [-30, 25], [15, 40]]) {
    b.cyl(0.14, 0.18, 8, 8, M.darkMetal, { pos: [x, 4, z] });
    b.box(1.6, 0.25, 0.4, M.darkMetal, { pos: [x + 0.7, 8, z], collide: false });
  }
}

/** Extraction pad: asphalt disc + teal ring; beacon light handled dynamically by BotManager. */
function extractionPad(b, M, x, z) {
  b.cyl(6, 6, 0.3, 28, M.asphalt, { pos: [x, 0.15, z] });
  b.add(new THREE.TorusGeometry(5.4, 0.15, 6, 40).rotateX(Math.PI / 2), M.teal, { pos: [x, 0.36, z], collide: false });
  b.box(1.2, 1.4, 1.2, M.olive, { pos: [x + 6.5, 0.7, z] });
  jersey(b, M, x - 7, z + 2, 1.2); sandbags(b, M, x, z + 8, 0, 3);
}

/** Builds the whole level. Returns visual group, collider mesh, spawn points. */
export function buildMap(qualityName = 'high') {
  const M = makeMaterials(qualityName);
  const b = new Builder(M);
  const rand = rng(1337);

  buildTerrain(b, M);
  compound(b, M);
  warehouse(b, M, -45, 35, 22, 14, 6, 0);
  warehouse(b, M, 48, -28, 16, 12, 5.5, Math.PI / 2);
  silos(b, M, -48, 0);
  containerYard(b, M, 40, 38, rand);
  pipeRack(b, M, 18, -50);
  perimeter(b, M);
  rocksAndScatter(b, M, rand);
  const EXTRACT = new THREE.Vector3(52, 0.3, -62);
  extractionPad(b, M, EXTRACT.x, EXTRACT.z);

  const { group, collider } = b.build();
  return {
    group, collider, materials: M,
    playerSpawn: new THREE.Vector3(-58, 1.5, -62),
    playerSpawnYaw: -Math.PI * 0.25,
    botSpawns: [new THREE.Vector3(-62, 1.5, 66), new THREE.Vector3(64, 1.5, 66), new THREE.Vector3(70, 1.5, 2), new THREE.Vector3(0, 1.5, 70)],
    extraction: EXTRACT,
    extractRadius: 5.2,
    bounds: HALF,
  };
}

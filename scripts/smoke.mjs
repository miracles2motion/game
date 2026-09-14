// Run: node scripts/smoke.mjs — builds the map + BVH and simulates 20 s of play with bots.
import './env.mjs';
import * as THREE from 'three';
import { buildMap } from '../src/world/Map.js';
import { WorldCollider } from '../src/physics/Collider.js';
import { Player } from '../src/player/Player.js';
import { BotManager } from '../src/ai/BotManager.js';
import { input } from '../src/core/Input.js';

let t = performance.now();
const map = buildMap('high');
console.log('map built in', (performance.now() - t) | 0, 'ms; draw meshes:', map.group.children.length, 'collider tris:', map.collider.geometry.attributes.position.count / 3);
t = performance.now();
const world = new WorldCollider(map.collider);
console.log('bvh in', (performance.now() - t) | 0, 'ms');
const fx = { tracer() {}, spark() {}, blood() {}, muzzle() {}, update() {} };
const player = new Player(world, new THREE.PerspectiveCamera(), fx, null);
const bots = new BotManager(world, new THREE.Scene(), fx, map, player);
player.targets = bots;
player.spawn(map.playerSpawn, map.playerSpawnYaw);
bots.start();
input.move.y = 1; input.sprint = true;
const dt = 1 / 60;
t = performance.now();
for (let i = 0; i < 60 * 30; i++) {
  if (i === 300) { input.sprint = false; input.fire = true; }
  if (i === 320) input.crouch = true;
  if (i === 400) input.jump = true;
  if (i % 200 === 0) input.addLook(0.4, 0);
  player.update(dt); bots.update(dt);
  if (i % 300 === 0) console.log('t=', (i / 60).toFixed(0).padStart(2), 'pos', player.position.toArray().map(v => v.toFixed(1)).join(','), 'ground', player.ctrl.onGround, 'hp', player.hp | 0, 'ammo', player.weapon.ammo, 'rld', player.weapon.reloading.toFixed(1), 'bots', bots.alive, bots.phase);
}
console.log('sim 30s in', (performance.now() - t) | 0, 'ms (', ((performance.now() - t) / 1800).toFixed(2), 'ms/step )');
// Direct fire test
input.resetHeld(); input.crouch = false; player.spawn(new THREE.Vector3(-20, 1, -40), 0); for (let i = 0; i < 60; i++) player.update(dt);
const b = bots.pool[0]; b.spawn(player.position.clone().add(new THREE.Vector3(0, 0, -6)), 1); bots.alive++;
input.fire = true; let n = 0;
while (b.alive && n++ < 120) { const dx = b.bodyCenter.x - player.position.x, dz = b.bodyCenter.z - player.position.z; player.yaw = Math.atan2(-dx, -dz); player.update(dt); b.update(dt, player); }
console.log('direct fire: killed', !b.alive, 'in', player.shotsFired, 'shots,', player.shotsHit, 'hits; pitch after recoil', player.pitch.toFixed(3));
if (b.alive) { console.error('FAIL: could not kill bot'); process.exit(1); }
console.log('OK');

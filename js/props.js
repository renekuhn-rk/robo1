// Simple key and treasure-chest models built from basic shapes.
// Three variants of each; pick with keyModel / treasureModel in config.js.
// Open props.html to see them side by side.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xffa000, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.35 });
const wood = new THREE.MeshStandardMaterial({ color: 0x9a5b2e, roughness: 0.8, side: THREE.DoubleSide });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x6e3d1c, roughness: 0.8 });
const ink = new THREE.MeshStandardMaterial({ color: 0x22305c, roughness: 0.5 });
const purple = new THREE.MeshStandardMaterial({ color: 0x9b5cff, roughness: 0.45 });
const lilac = new THREE.MeshStandardMaterial({ color: 0xb98bff, roughness: 0.45 });
const pink = new THREE.MeshStandardMaterial({ color: 0xff4f8b, emissive: 0xff4f8b, emissiveIntensity: 0.3, roughness: 0.25, flatShading: true });
const blue = new THREE.MeshStandardMaterial({ color: 0x4fb4ff, emissive: 0x4fb4ff, emissiveIntensity: 0.3, roughness: 0.25, flatShading: true });

function add(group, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}

// Half a cylinder lying along X, round side up: a chest lid.
const lidGeo = (radius, length) => new THREE.CylinderGeometry(radius, radius, length, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);

// ---------------------------------------------------------------------------
// Keys: about 0.8 tall, standing upright, centred on the origin
// ---------------------------------------------------------------------------

// 1: classic key with a ring, a thin shaft and two teeth
function keyClassic() {
  const g = new THREE.Group();
  add(g, new THREE.TorusGeometry(0.17, 0.05, 10, 24), gold, 0, 0.26, 0);
  add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), gold, 0, -0.13, 0);
  add(g, new THREE.BoxGeometry(0.15, 0.07, 0.06), gold, 0.09, -0.33, 0);
  add(g, new THREE.BoxGeometry(0.1, 0.07, 0.06), gold, 0.07, -0.2, 0);
  return g;
}

// 2: chunky toy key with a fat ring and one big tooth
function keyChunky() {
  const g = new THREE.Group();
  add(g, new THREE.TorusGeometry(0.16, 0.09, 12, 24), gold, 0, 0.22, 0);
  add(g, new RoundedBoxGeometry(0.15, 0.46, 0.15, 3, 0.05), gold, 0, -0.17, 0);
  add(g, new RoundedBoxGeometry(0.2, 0.16, 0.15, 3, 0.05), gold, 0.14, -0.3, 0);
  return g;
}

// 3: ornate key with a three-ring head, a collar and three fine teeth
function keyOrnate() {
  const g = new THREE.Group();
  const ring = new THREE.TorusGeometry(0.09, 0.035, 8, 20);
  add(g, ring, gold, 0, 0.36, 0);
  add(g, ring, gold, -0.11, 0.2, 0);
  add(g, ring, gold, 0.11, 0.2, 0);
  add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), gold, 0, 0.07, 0);
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.46, 10), gold, 0, -0.17, 0);
  add(g, new THREE.SphereGeometry(0.05, 12, 8), gold, 0, -0.4, 0);
  add(g, new THREE.BoxGeometry(0.13, 0.04, 0.05), gold, 0.07, -0.34, 0);
  add(g, new THREE.BoxGeometry(0.08, 0.04, 0.05), gold, 0.05, -0.27, 0);
  add(g, new THREE.BoxGeometry(0.13, 0.04, 0.05), gold, 0.07, -0.2, 0);
  return g;
}

// ---------------------------------------------------------------------------
// Chests: about 0.9 wide, standing on y = 0, front toward +Z.
// Each has a lid hinged at the back and loot inside; see setChestOpen.
// ---------------------------------------------------------------------------

const LID_OPEN = -1.2; // radians the lid swings back

// Gold heap, coins and two gems, filling a chest whose rim is at y = 0.4.
function loot() {
  const g = new THREE.Group();
  const heap = add(g, new THREE.SphereGeometry(0.36, 16, 10), gold, 0, 0.4, 0);
  heap.scale.set(1.1, 0.42, 0.7);
  const coin = new THREE.CylinderGeometry(0.07, 0.07, 0.025, 12);
  add(g, coin, gold, -0.22, 0.53, 0.1).rotation.set(0.5, 0, 0.3);
  add(g, coin, gold, 0.25, 0.52, -0.05).rotation.set(-0.4, 0, -0.5);
  add(g, coin, gold, 0.05, 0.57, 0.14).rotation.set(0.9, 0.3, 0);
  const gem = new THREE.OctahedronGeometry(0.09, 0);
  add(g, gem, pink, -0.1, 0.6, -0.02);
  add(g, gem, blue, 0.17, 0.58, 0.1);
  return g;
}

// Adds the loot and a lid group hinged at the back edge; returns the group
// to put the lid's parts in (its origin is the middle of the chest's rim).
function hingedLid(g, depth) {
  g.userData.loot = loot();
  g.add(g.userData.loot);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.42, -depth / 2);
  const lid = new THREE.Group();
  lid.position.z = depth / 2;
  hinge.add(lid);
  g.add(hinge);
  g.userData.hinge = hinge;
  setChestOpen(g, 0);
  return lid;
}

// 0 = shut, 1 = lid fully back with the loot showing.
export function setChestOpen(chest, amount) {
  const { hinge, loot } = chest.userData;
  if (!hinge) return;
  hinge.rotation.x = LID_OPEN * amount;
  loot.visible = amount > 0;
}

function woodenChest() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.9, 0.4, 0.6), wood, 0, 0.2, 0);
  add(g, new THREE.BoxGeometry(0.93, 0.05, 0.63), darkWood, 0, 0.4, 0);
  for (const x of [-0.28, 0.28]) add(g, new THREE.BoxGeometry(0.09, 0.41, 0.63), gold, x, 0.2, 0);
  const lid = hingedLid(g, 0.6);
  add(lid, lidGeo(0.3, 0.9), wood);
  for (const x of [-0.28, 0.28]) add(lid, lidGeo(0.315, 0.09), gold, x);
  return g;
}

// 1: classic wooden chest with a round lid, gold bands and a lock
function chestClassic() {
  const g = woodenChest();
  add(g, new THREE.BoxGeometry(0.15, 0.19, 0.06), gold, 0, 0.33, 0.31);
  add(g, new THREE.BoxGeometry(0.04, 0.07, 0.07), ink, 0, 0.32, 0.315);
  return g;
}

// 2: chunky toy chest in the treasure colour with a big round lock
function chestToy() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.9, 0.42, 0.62, 3, 0.08), purple, 0, 0.21, 0);
  add(g, new THREE.BoxGeometry(0.96, 0.06, 0.68), gold, 0, 0.42, 0);
  add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20).rotateX(Math.PI / 2), gold, 0, 0.34, 0.34);
  add(g, new THREE.BoxGeometry(0.04, 0.09, 0.09), ink, 0, 0.33, 0.345);
  const lid = hingedLid(g, 0.66);
  add(lid, new RoundedBoxGeometry(0.94, 0.3, 0.66, 3, 0.12), lilac, 0, 0.13, 0);
  for (const x of [-0.4, 0.4]) for (const z of [-0.26, 0.26]) add(lid, new THREE.SphereGeometry(0.05, 10, 8), gold, x, 0.28, z);
  return g;
}

// 3: the wooden chest already open, with gold and gems showing
function chestOpen() {
  const g = woodenChest();
  setChestOpen(g, 1);
  return g;
}

const KEYS = [keyClassic, keyChunky, keyOrnate];
const CHESTS = [chestClassic, chestToy, chestOpen];

// variant is 1, 2 or 3; anything else returns null (the game then uses a plain gem).
export const makeKey = (variant) => KEYS[variant - 1]?.() ?? null;
export const makeChest = (variant) => CHESTS[variant - 1]?.() ?? null;

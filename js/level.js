// Levels live in levels/<name>/: level.json (gameplay data) and an optional
// GLB with the visuals. See LEVELS.md for the format.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from './config.js';

const DEG = Math.PI / 180;
const COL = CONFIG.colors;
const B = CONFIG.blockout;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function loadLevel(name, gltfLoader, maxAnisotropy = 1) {
  const base = `levels/${name}/`;
  const res = await fetch(`${base}level.json`);
  if (!res.ok) throw new Error(`${base}level.json not found (${res.status})`);
  const data = await res.json();
  const b = data.bounds;
  if (!b || !(b.maxX > b.minX) || !(b.maxZ > b.minZ)) throw new Error(`${base}level.json needs "bounds" with minX < maxX and minZ < maxZ`);

  const level = {
    name: data.name ?? name,
    bounds: b,
    width: b.maxX - b.minX,
    depth: b.maxZ - b.minZ,
    centerX: (b.minX + b.maxX) / 2,
    centerZ: (b.minZ + b.maxZ) / 2,
    spawn: { x: 0, z: 0, yaw: 0, ...data.spawn },
    gems: (data.gems ?? []).map((g) => (Array.isArray(g) ? { x: g[0], z: g[1] } : g)),
    // Boxes on the floor, optionally rotated around Y.
    colliders: (data.colliders ?? []).map((c) => {
      const rot = (c.rot ?? 0) * DEG;
      return { x: c.x, z: c.z, hw: c.w / 2, hd: c.d / 2, h: c.h ?? 1, rot, cos: Math.cos(rot), sin: Math.sin(rot), color: c.color };
    }),
    visuals: new THREE.Group(),
  };

  if (data.model) {
    const gltf = await gltfLoader.loadAsync(base + data.model);
    const cast = data.castShadows ?? true; // set false once lighting is baked into the textures
    // Optional atlas for a GLB exported without a material.
    let atlasMat = null;
    if (data.texture) {
      const tex = await new THREE.TextureLoader().loadAsync(base + data.texture);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // glTF UV convention
      tex.anisotropy = maxAnisotropy;
      atlasMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    }
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = cast;
        o.receiveShadow = true;
        if (atlasMat) o.material = atlasMat;
      }
    });
    level.visuals.add(gltf.scene);
  } else {
    buildBlockout(level, maxAnisotropy);
  }
  return level;
}

function playmatTexture(level, maxAnisotropy) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = `#${COL.floorLine.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, size, size);
  g.fillStyle = `#${COL.floor.toString(16).padStart(6, '0')}`;
  g.beginPath();
  g.roundRect(4, 4, size - 8, size - 8, 14);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(level.width / 2, level.depth / 2);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

// Stand-in visuals for a level without a GLB: floor, walls and one block per collider.
function buildBlockout(level, maxAnisotropy) {
  const { bounds: b, width, depth, centerX, centerZ, visuals } = level;
  const wallT = B.wallThickness;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: playmatTexture(level, maxAnisotropy), roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  floor.receiveShadow = true;
  visuals.add(floor);

  const base = new THREE.Mesh(
    new RoundedBoxGeometry(width + wallT * 2 + 0.4, 0.8, depth + wallT * 2 + 0.4, 3, 0.15),
    new THREE.MeshStandardMaterial({ color: COL.base, roughness: 0.7 })
  );
  base.position.set(centerX, -0.42, centerZ);
  base.receiveShadow = true;
  visuals.add(base);

  // Walls: tall at the back and sides, low at the front so they never block the view.
  const wallMat = new THREE.MeshStandardMaterial({ color: COL.wall, roughness: 0.6 });
  const fullW = width + wallT * 2;
  const walls = [
    { x: centerX, z: b.minZ - wallT / 2, w: fullW, d: wallT, h: B.wallHeight },
    { x: centerX, z: b.maxZ + wallT / 2, w: fullW, d: wallT, h: 0.3 },
    { x: b.minX - wallT / 2, z: centerZ, w: wallT, d: depth, h: B.wallHeight },
    { x: b.maxX + wallT / 2, z: centerZ, w: wallT, d: depth, h: B.wallHeight },
  ];
  for (const w of walls) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w.w, w.h, w.d, 2, Math.min(0.12, w.h / 3)), wallMat);
    m.position.set(w.x, w.h / 2, w.z);
    m.castShadow = m.receiveShadow = true;
    visuals.add(m);
  }

  const cycle = ['orange', 'yellow', 'blue'];
  level.colliders.forEach((c, i) => {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(c.hw * 2, c.h, c.hd * 2, 3, 0.1),
      new THREE.MeshStandardMaterial({ color: COL[c.color] ?? COL[cycle[i % cycle.length]], roughness: 0.55 })
    );
    m.position.set(c.x, c.h / 2, c.z);
    m.rotation.y = c.rot;
    m.castShadow = m.receiveShadow = true;
    visuals.add(m);
  });
}

// Pushes a circle (the robot) out of the level's colliders and keeps it inside
// the bounds. vel is a Vector2 (x, y = z); the part pointing into a surface is
// removed so the robot slides along it. Returns the corrected [x, z].
export function collide(px, pz, r, vel, level) {
  const pushOut = (nx, nz, pen) => {
    px += nx * pen;
    pz += nz * pen;
    const vn = vel.x * nx + vel.y * nz;
    if (vn < 0) { vel.x -= nx * vn; vel.y -= nz * vn; }
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const c of level.colliders) {
      // Circle centre in the box's own (unrotated) frame.
      const dx = px - c.x, dz = pz - c.z;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      const ox = lx - clamp(lx, -c.hw, c.hw);
      const oz = lz - clamp(lz, -c.hd, c.hd);
      const d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;

      let nx, nz, pen;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = ox / d; nz = oz / d; pen = r - d;
      } else {
        // Centre is inside the box: push out the nearest side.
        const sides = [
          [lx + c.hw, -1, 0], [c.hw - lx, 1, 0],
          [lz + c.hd, 0, -1], [c.hd - lz, 0, 1],
        ].sort((a, s) => a[0] - s[0]);
        [pen, nx, nz] = sides[0];
        pen += r;
      }
      // Normal back to world space.
      pushOut(nx * c.cos + nz * c.sin, -nx * c.sin + nz * c.cos, pen);
    }
  }

  const b = level.bounds;
  if (px < b.minX + r) { px = b.minX + r; vel.x = Math.max(0, vel.x); }
  if (px > b.maxX - r) { px = b.maxX - r; vel.x = Math.min(0, vel.x); }
  if (pz < b.minZ + r) { pz = b.minZ + r; vel.y = Math.max(0, vel.y); }
  if (pz > b.maxZ - r) { pz = b.maxZ - r; vel.y = Math.min(0, vel.y); }
  return [px, pz];
}

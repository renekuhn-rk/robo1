// Levels live in levels/<name>/: level.json (gameplay data) and optional
// visuals: a GLB, a gaussian splat, or both. A level can also bring a
// collision mesh of its walkable floor. See LEVELS.md for the format.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from './config.js';

const DEG = Math.PI / 180;
const COL = CONFIG.colors;
const B = CONFIG.blockout;
const S = CONFIG.splat;
const G = CONFIG.ground;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// On the local test server, skip the browser cache so a re-exported level
// shows up on the next reload.
const fresh = ['localhost', '127.0.0.1'].includes(location.hostname) ? `?t=${Date.now()}` : '';

export async function loadLevel(name, gltfLoader, renderer) {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const base = `levels/${name}/`;
  const res = await fetch(`${base}level.json${fresh}`);
  if (!res.ok) throw new Error(`${base}level.json not found (${res.status})`);
  const data = await res.json();
  const b = data.bounds;
  if (!b || !(b.maxX > b.minX) || !(b.maxZ > b.minZ)) throw new Error(`${base}level.json needs "bounds" with minX < maxX and minZ < maxZ`);

  // Marker lists are [x, z] pairs or { x, y, z } objects.
  const points = (list) => (list ?? []).map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p));

  const level = {
    name: data.name ?? name,
    bounds: b,
    width: b.maxX - b.minX,
    depth: b.maxZ - b.minZ,
    centerX: (b.minX + b.maxX) / 2,
    centerZ: (b.minZ + b.maxZ) / 2,
    spawn: { x: 0, z: 0, yaw: 0, ...data.spawn },
    gems: points(data.gems),
    keys: points(data.keys),
    treasures: points(data.treasures),
    goal: data.goal ?? null,
    camera: data.camera ?? {},
    ground: null,
    collisionMesh: null,
    // Boxes on the floor, optionally rotated around Y.
    colliders: (data.colliders ?? []).map((c) => {
      const rot = (c.rot ?? 0) * DEG;
      return { x: c.x, z: c.z, hw: c.w / 2, hd: c.d / 2, h: c.h ?? 1, rot, cos: Math.cos(rot), sin: Math.sin(rot), color: c.color };
    }),
    sun: data.sun,
    splat: null,
    visuals: new THREE.Group(),
  };

  if (data.model) {
    const gltf = await gltfLoader.loadAsync(base + data.model + fresh);
    const cast = data.castShadows ?? true; // set false once lighting is baked into the textures
    // Optional atlas for a GLB exported without a material.
    let atlasMat = null;
    if (data.texture) {
      const tex = await new THREE.TextureLoader().loadAsync(base + data.texture + fresh);
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
  }
  if (data.collision) {
    const gltf = await gltfLoader.loadAsync(base + data.collision + fresh);
    level.collisionMesh = gltf.scene;
    level.ground = buildGround(gltf.scene);
  }
  if (data.splat) {
    await addSplat(level, data, base, gltfLoader, renderer);
  } else if (!data.model) {
    buildBlockout(level, maxAnisotropy);
  }
  return level;
}

// Gaussian splat visuals. Spark is only downloaded for levels that use one.
async function addSplat(level, data, base, gltfLoader, renderer) {
  const opt = typeof data.splat === 'string' ? { file: data.splat } : data.splat;
  const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark');

  // All splats are drawn by this one object, sorted back to front, after the
  // solid meshes. They test against the depth buffer but don't write to it:
  // the robot hides splats behind it and splats in front of it cover it.
  // The camera never turns, so sorting by depth along the view direction
  // stays valid while it moves and doesn't need redoing every frame.
  const spark = new SparkRenderer({ renderer, maxStdDev: S.maxStdDev, sortRadial: false, minSortIntervalMs: S.sortInterval });
  spark.renderOrder = -3;
  level.visuals.add(spark);

  const splat = new SplatMesh({ url: base + opt.file + fresh, fileName: opt.file });
  if (opt.position) splat.position.fromArray(opt.position);
  if (opt.rotation) splat.rotation.set(...opt.rotation.map((d) => d * DEG));
  if (opt.scale) splat.scale.setScalar(opt.scale);
  try {
    await splat.initialized;
  } catch (err) {
    throw new Error(`${base}${opt.file} could not be loaded (${err?.message ?? err})`);
  }
  level.visuals.add(splat);
  level.splat = splat;

  let source = null;
  if (data.shadowCatcher) source = (await gltfLoader.loadAsync(base + data.shadowCatcher + fresh)).scene;
  buildShadowCatcher(level, source, data.shadowOpacity ?? S.shadowOpacity);
}

// Splats can't receive shadows, so an invisible mesh that only shows the
// shadows falling on it sits where the splat's surfaces are. `source` is the
// level's catcher GLB; without one the floor and the collider boxes are used.
function buildShadowCatcher(level, source, opacity) {
  if (!source) {
    source = new THREE.Group();
    const pad = S.catcherPad;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(level.width + pad * 2, level.depth + pad * 2));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(level.centerX, 0, level.centerZ);
    source.add(floor);
    for (const c of level.colliders) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.hw * 2, c.h, c.hd * 2));
      m.position.set(c.x, c.h / 2, c.z);
      m.rotation.y = c.rot;
      source.add(m);
    }
  }

  // Two passes, both after the splats. The first only fills the depth buffer,
  // so the catcher hides its own far sides; written before the splats it would
  // cut into them. The second darkens the picture where shadows fall.
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
  const shadowMat = new THREE.ShadowMaterial({ opacity, depthWrite: false });
  const meshes = [];
  source.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    m.material = shadowMat;
    m.castShadow = false;
    m.receiveShadow = true;
    m.renderOrder = -1;
    const depth = new THREE.Mesh(m.geometry, depthMat);
    depth.renderOrder = -2;
    m.add(depth);
  }
  level.visuals.add(source);
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

// ---------------------------------------------------------------------------
// Ground from a collision mesh
// ---------------------------------------------------------------------------

// Turns the upward-facing faces of a collision mesh into two maps on a grid:
// the ground height, and the distance to the edge of the walkable area
// (positive inside, negative outside). Walls in the mesh are ignored; where
// the floor ends is where the robot stops.
function buildGround(object) {
  const cell = G.cell;
  const tris = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const index = o.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      if (n.y < G.minUp) continue;
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      minX = Math.min(minX, a.x, b.x, c.x); maxX = Math.max(maxX, a.x, b.x, c.x);
      minZ = Math.min(minZ, a.z, b.z, c.z); maxZ = Math.max(maxZ, a.z, b.z, c.z);
    }
  });
  if (!tris.length) throw new Error('the collision mesh has no upward-facing floor');

  const pad = 3;
  const x0 = minX - pad * cell, z0 = minZ - pad * cell;
  const w = Math.ceil((maxX - minX) / cell) + pad * 2 + 1;
  const h = Math.ceil((maxZ - minZ) / cell) + pad * 2 + 1;
  const height = new Float32Array(w * h).fill(NaN);

  // Fill in every cell whose centre lies under a floor triangle.
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
    const bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5];
    const cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-9) continue;
    const i0 = Math.floor((Math.min(ax, bx, cx) - x0) / cell), i1 = Math.ceil((Math.max(ax, bx, cx) - x0) / cell);
    const j0 = Math.floor((Math.min(az, bz, cz) - z0) / cell), j1 = Math.ceil((Math.max(az, bz, cz) - z0) / cell);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = x0 + i * cell, z = z0 + j * cell;
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const s = 1 - u - v;
        if (u < -1e-4 || v < -1e-4 || s < -1e-4) continue;
        const y = u * ay + v * by + s * cy;
        const k = j * w + i;
        if (!(height[k] >= y)) height[k] = y; // keep the top one where floors overlap
      }
    }
  }

  // Distance to the edge: cells from the nearest cell on the other side.
  const inside = new Uint8Array(w * h);
  for (let k = 0; k < inside.length; k++) inside[k] = Number.isNaN(height[k]) ? 0 : 1;
  const toOutside = distanceMap(inside, w, h, 0);
  const toInside = distanceMap(inside, w, h, 1);
  const dist = new Float32Array(w * h);
  for (let k = 0; k < dist.length; k++) dist[k] = (inside[k] ? toOutside[k] - 0.5 : 0.5 - toInside[k]) * cell;

  // Spread heights a few cells past the edge so sampling next to it works.
  for (let pass = 0; pass < 4; pass++) {
    const prev = height.slice();
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        if (!Number.isNaN(prev[k])) continue;
        let sum = 0, cnt = 0;
        for (const q of [k - 1, k + 1, k - w, k + w]) if (!Number.isNaN(prev[q])) { sum += prev[q]; cnt++; }
        if (cnt) height[k] = sum / cnt;
      }
    }
  }
  for (let k = 0; k < height.length; k++) if (Number.isNaN(height[k])) height[k] = 0;

  // Value of a map at a world position, blended between the four nearest cells.
  const sample = (map, x, z) => {
    const fx = clamp((x - x0) / cell, 0, w - 1.001), fz = clamp((z - z0) / cell, 0, h - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * w + i;
    return (map[k] * (1 - tx) + map[k + 1] * tx) * (1 - tz) + (map[k + w] * (1 - tx) + map[k + w + 1] * tx) * tz;
  };
  return {
    cell,
    heightAt: (x, z) => sample(height, x, z),
    distAt: (x, z) => sample(dist, x, z),
  };
}

// For every cell, the distance (in cells) to the nearest cell whose mask
// equals `target`. Exact, in two sweeps (Felzenszwalb & Huttenlocher).
function distanceMap(mask, w, h, target) {
  const INF = 1e20;
  const d = new Float64Array(w * h);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] === target ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const sweep = (len) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - f[p] - p * p) / (2 * q - 2 * p);
        if (s > z[k] || k === 0) break;
        k--;
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      out[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) f[j] = d[j * w + i];
    sweep(h);
    for (let j = 0; j < h; j++) d[j * w + i] = out[j];
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) f[i] = d[j * w + i];
    sweep(w);
    for (let i = 0; i < w; i++) d[j * w + i] = Math.sqrt(out[i]);
  }
  return d;
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

  // Collision mesh: stay at least r away from the edge of the walkable floor,
  // moving along the direction in which the distance to the edge grows.
  const ground = level.ground;
  for (let pass = 0; ground && pass < 4; pass++) {
    const d = ground.distAt(px, pz);
    if (d >= r) break;
    const e = ground.cell;
    const gx = ground.distAt(px + e, pz) - ground.distAt(px - e, pz);
    const gz = ground.distAt(px, pz + e) - ground.distAt(px, pz - e);
    const len = Math.hypot(gx, gz);
    if (len < 1e-6) break;
    pushOut(gx / len, gz / len, r - d);
  }

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

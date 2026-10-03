import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from './config.js';
import { Joystick } from './joystick.js';

const DEG = Math.PI / 180;
const R = CONFIG.robot;
const L = CONFIG.level;
const COL = CONFIG.colors;
const DEBUG = new URLSearchParams(location.search).has('debug');

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('game');

// ---------------------------------------------------------------------------
// Renderer, scene, lights
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.sky);

// Soft studio reflections so PBR materials from the GLB don't look flat or black.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9c90, 0.8));

const sun = new THREE.DirectionalLight(0xfff3e0, 2.3);
sun.position.set(-6, 14, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const shadowHalf = Math.max(L.width, L.depth) * 0.72;
Object.assign(sun.shadow.camera, { left: -shadowHalf, right: shadowHalf, top: shadowHalf, bottom: -shadowHalf, near: 1, far: 45 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, CONFIG.stageAspect, 0.1, 200);

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

const halfW = L.width / 2;
const halfD = L.depth / 2;
const wallT = L.wallThickness;
const colliders = []; // axis-aligned boxes on the floor: { minX, maxX, minZ, maxZ }

const levelVisuals = new THREE.Group(); // hidden when a painted background is used
scene.add(levelVisuals);

function playmatTexture() {
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
  tex.repeat.set(L.width / 2, L.depth / 2);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function buildLevel() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(L.width, L.depth),
    new THREE.MeshStandardMaterial({ map: playmatTexture(), roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  levelVisuals.add(floor);

  const base = new THREE.Mesh(
    new RoundedBoxGeometry(L.width + wallT * 2 + 0.4, 0.8, L.depth + wallT * 2 + 0.4, 3, 0.15),
    new THREE.MeshStandardMaterial({ color: COL.base, roughness: 0.7 })
  );
  base.position.y = -0.42;
  base.receiveShadow = true;
  levelVisuals.add(base);

  // Walls: tall at the back and sides, low at the front so they never block the view.
  const wallMat = new THREE.MeshStandardMaterial({ color: COL.wall, roughness: 0.6 });
  const fullW = L.width + wallT * 2;
  const walls = [
    { x: 0, z: -halfD - wallT / 2, w: fullW, d: wallT, h: L.wallHeight },
    { x: 0, z: halfD + wallT / 2, w: fullW, d: wallT, h: 0.3 },
    { x: -halfW - wallT / 2, z: 0, w: wallT, d: L.depth, h: L.wallHeight },
    { x: halfW + wallT / 2, z: 0, w: wallT, d: L.depth, h: L.wallHeight },
  ];
  for (const w of walls) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w.w, w.h, w.d, 2, Math.min(0.12, w.h / 3)), wallMat);
    m.position.set(w.x, w.h / 2, w.z);
    m.castShadow = m.receiveShadow = true;
    levelVisuals.add(m);
  }

  for (const c of L.crates) {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(c.w, c.h, c.d, 3, 0.1),
      new THREE.MeshStandardMaterial({ color: COL[c.color] ?? COL.orange, roughness: 0.55 })
    );
    m.position.set(c.x, c.h / 2, c.z);
    m.castShadow = m.receiveShadow = true;
    levelVisuals.add(m);
    addCollider(c.x, c.z, c.w, c.d, c.h);
  }

  for (const b of L.blockers) addCollider(b.x, b.z, b.w, b.d, b.h ?? 1);
}

function addCollider(x, z, w, d, h = 1) {
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  if (DEBUG) {
    const helper = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true })
    );
    helper.position.set(x, h / 2, z);
    scene.add(helper);
  }
}

// Only receives shadows: lets the robot cast a shadow onto a painted floor.
const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(L.width, L.depth),
  new THREE.ShadowMaterial({ opacity: 0.25 })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = 0.002;
shadowCatcher.receiveShadow = true;
shadowCatcher.visible = false;
scene.add(shadowCatcher);

buildLevel();

if (DEBUG) {
  const grid = new THREE.GridHelper(Math.max(L.width, L.depth), Math.max(L.width, L.depth), 0x22305c, 0x22305c);
  grid.position.y = 0.01;
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);
}

// ---------------------------------------------------------------------------
// Optional painted background + cut-out occluders
// ---------------------------------------------------------------------------

const texLoader = new THREE.TextureLoader();

if (CONFIG.background.url) {
  texLoader.load(
    CONFIG.background.url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
      if (CONFIG.background.hideBlocks) {
        levelVisuals.visible = false;
        shadowCatcher.visible = true;
      }
    },
    undefined,
    () => showToast(`Couldn't load the background image at ${CONFIG.background.url}. Check the path in js/config.js.`)
  );
}

for (const o of CONFIG.occluders) {
  texLoader.load(
    o.url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      // alphaTest (not blending) keeps the depth buffer correct, so the robot
      // is cleanly hidden behind the opaque parts of the cut-out.
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(o.width, o.height),
        new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide })
      );
      m.position.set(o.x, o.height / 2, o.z);
      scene.add(m);
    },
    undefined,
    () => showToast(`Couldn't load the cut-out at ${o.url}.`)
  );
}

// ---------------------------------------------------------------------------
// Camera: fixed three-quarter view, distance chosen so the whole level fits
// ---------------------------------------------------------------------------

function fitCamera() {
  const el = CONFIG.camera.elevation * DEG;
  const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
  const target = new THREE.Vector3(0, 0, 0);
  const ex = halfW + wallT + 0.2;
  const ez = halfD + wallT + 0.2;
  const corners = [];
  for (const x of [-ex, ex]) for (const z of [-ez, ez]) for (const y of [-0.85, L.wallHeight + 0.3]) {
    corners.push(new THREE.Vector3(x, y, z));
  }

  const v = new THREE.Vector3();
  const place = (d) => {
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const fits = () => corners.every((p) => {
    v.copy(p).project(camera);
    return Math.abs(v.x) <= CONFIG.camera.margin && Math.abs(v.y) <= CONFIG.camera.margin;
  });

  let lo = 1, hi = 300;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    place(mid);
    if (fits()) hi = mid; else lo = mid;
  }
  place(hi);

  // Perspective pushes the level off-centre vertically; shift the view to recentre it.
  let minY = Infinity, maxY = -Infinity;
  for (const p of corners) {
    v.copy(p).project(camera);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  const fullW = 1000, fullH = 1000 / CONFIG.stageAspect;
  camera.setViewOffset(fullW, fullH, 0, -((minY + maxY) / 2) * fullH / 2, fullW, fullH);
}

camera.aspect = CONFIG.stageAspect;
camera.updateProjectionMatrix();
fitCamera();

// ---------------------------------------------------------------------------
// Robot: root (position + facing) > hover (bob) > lean (tilt) > holder > model
// ---------------------------------------------------------------------------

const robot = {
  root: new THREE.Group(),
  hover: new THREE.Group(),
  lean: new THREE.Group(),
  holder: new THREE.Group(),
  vel: new THREE.Vector2(),
  yaw: 0,
  targetYaw: 0,
  leanAngle: 0,
  leanVel: 0,
  bank: 0,
  prevFwd: 0,
  accel: 0,
  hoverPhase: 0,
  glow: null,
};
robot.root.add(robot.hover);
robot.hover.add(robot.lean);
robot.lean.add(robot.holder);
scene.add(robot.root);

if (R.thrusterGlow) {
  robot.glow = new THREE.Mesh(
    new THREE.CircleGeometry(R.radius * 0.85, 32),
    new THREE.MeshBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  robot.glow.rotation.x = -Math.PI / 2;
  robot.glow.position.y = 0.015;
  robot.root.add(robot.glow);
}

// Scales any model to R.height, stands it on y=0, centres it, and sets the tilt pivot.
function installModel(object) {
  robot.holder.clear();
  const wrap = new THREE.Group();
  wrap.add(object);
  wrap.rotation.y = R.rotationY * DEG;
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  wrap.scale.setScalar(R.height / (size.y || 1));
  wrap.updateMatrixWorld(true);
  box.setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  wrap.position.set(-center.x, -box.min.y, -center.z);
  robot.holder.add(wrap);

  const pivotY = R.height * R.leanPivot;
  robot.lean.position.y = pivotY;
  robot.holder.position.y = -pivotY;
}

// Stand-in robot so the demo runs before your GLB is in place. Faces +Z.
function makePlaceholderRobot() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.4, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22305c, roughness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x4f6fd1, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x6ff3ff });
  const tip = new THREE.MeshStandardMaterial({ color: COL.gem, emissive: COL.gem, emissiveIntensity: 0.4 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  add(new THREE.CylinderGeometry(0.22, 0.3, 0.16, 24), dark, 0, 0.08, 0);             // thruster
  add(new RoundedBoxGeometry(0.9, 0.62, 0.8, 4, 0.24), shell, 0, 0.47, 0);            // body
  add(new RoundedBoxGeometry(0.95, 0.13, 0.85, 3, 0.06), accent, 0, 0.36, 0);          // belt
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 16), dark, 0, 0.84, 0);              // neck
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.y = 0.9;
  g.add(head);
  const h = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); head.add(m); };
  h(new RoundedBoxGeometry(0.8, 0.52, 0.62, 4, 0.2), shell, 0, 0.26, 0);               // head
  h(new RoundedBoxGeometry(0.62, 0.28, 0.08, 3, 0.1), dark, 0, 0.27, 0.29);             // visor
  h(new THREE.CapsuleGeometry(0.045, 0.08, 4, 12), glow, -0.14, 0.28, 0.34);            // eyes
  h(new THREE.CapsuleGeometry(0.045, 0.08, 4, 12), glow, 0.14, 0.28, 0.34);
  h(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), dark, 0, 0.62, 0);                // antenna
  h(new THREE.SphereGeometry(0.065, 16, 12), tip, 0, 0.75, 0);
  return g;
}

installModel(makePlaceholderRobot());

function resetRobot() {
  robot.root.position.set(L.start.x, 0, L.start.z);
  robot.vel.set(0, 0);
  robot.yaw = robot.targetYaw = 0;
  robot.leanAngle = robot.leanVel = robot.bank = robot.prevFwd = robot.accel = 0;
}
resetRobot();

// Try the real model; keep the placeholder if it isn't there yet.
const loadingEl = $('loading');
const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(draco);
gltfLoader.load(
  R.modelUrl,
  (gltf) => {
    installModel(gltf.scene);
    loadingEl.classList.add('done');
  },
  undefined,
  (err) => {
    console.warn('Robot model not loaded:', err);
    loadingEl.classList.add('done');
    showToast(`Showing the stand-in robot. Add your model as ${R.modelUrl} to drive your own.`, 6000);
  }
);

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------

const gemGeo = new THREE.OctahedronGeometry(0.3, 0);
const gemMat = new THREE.MeshStandardMaterial({
  color: COL.gem, emissive: COL.gem, emissiveIntensity: 0.35, roughness: 0.25, flatShading: true,
});
const burstGeo = new THREE.RingGeometry(0.5, 0.62, 40);

const pickups = L.pickups.map(([x, z], i) => {
  const mesh = new THREE.Mesh(gemGeo, gemMat);
  mesh.castShadow = true;
  mesh.position.set(x, 0.95, z);
  scene.add(mesh);
  return { mesh, x, z, phase: i * 0.8, taken: false };
});
const effects = [];

let collected = 0;
let startTime = performance.now();
let won = false;
const countEl = $('count');
const counterEl = $('counter');
$('total').textContent = pickups.length;

function collect(p) {
  p.taken = true;
  p.mesh.visible = false;
  collected++;
  countEl.textContent = collected;
  counterEl.classList.remove('bump');
  void counterEl.offsetWidth; // restart the CSS animation
  counterEl.classList.add('bump');

  const ring = new THREE.Mesh(
    burstGeo,
    new THREE.MeshBasicMaterial({ color: COL.gem, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.position.copy(p.mesh.position);
  ring.lookAt(camera.position);
  scene.add(ring);
  effects.push({ mesh: ring, age: 0, life: 0.45 });

  if (collected === pickups.length) {
    won = true;
    const secs = ((performance.now() - startTime) / 1000).toFixed(1);
    setTimeout(() => {
      $('win-time').textContent = `${pickups.length} gems in ${secs} seconds`;
      $('win').hidden = false;
      $('again').focus();
    }, 500);
  }
}

$('again').addEventListener('click', () => {
  for (const p of pickups) {
    p.taken = false;
    p.mesh.visible = true;
  }
  collected = 0;
  countEl.textContent = 0;
  won = false;
  startTime = performance.now();
  resetRobot();
  $('win').hidden = true;
});

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const joystick = new Joystick($('stick-zone'), $('stick-base'), $('stick-knob'));

// Keyboard for testing on a desktop: WASD or arrow keys.
const keys = new Set();
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
addEventListener('keydown', (e) => { if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); } });
addEventListener('keyup', (e) => keys.delete(KEYMAP[e.code]));
addEventListener('blur', () => keys.clear());

function readInput() {
  const kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  const ky = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
  if (kx || ky) {
    const l = Math.hypot(kx, ky);
    return { x: kx / l, y: ky / l };
  }
  return { x: joystick.x, y: joystick.y };
}

// ---------------------------------------------------------------------------
// Movement & animation
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

function collide(px, pz) {
  const r = R.radius;
  const v = robot.vel;
  const pushOut = (nx, nz, pen) => {
    px += nx * pen;
    pz += nz * pen;
    const vn = v.x * nx + v.y * nz;
    if (vn < 0) { v.x -= nx * vn; v.y -= nz * vn; } // slide along the surface
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const b of colliders) {
      const cx = clamp(px, b.minX, b.maxX);
      const cz = clamp(pz, b.minZ, b.maxZ);
      const dx = px - cx, dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pushOut(dx / d, dz / d, r - d);
      } else {
        // Centre is inside the box: push out the nearest side.
        const sides = [
          [px - b.minX, -1, 0], [b.maxX - px, 1, 0],
          [pz - b.minZ, 0, -1], [b.maxZ - pz, 0, 1],
        ].sort((a, c) => a[0] - c[0]);
        const [dist, nx, nz] = sides[0];
        pushOut(nx, nz, dist + r);
      }
    }
  }

  // Level bounds
  if (px < -halfW + r) { px = -halfW + r; v.x = Math.max(0, v.x); }
  if (px > halfW - r) { px = halfW - r; v.x = Math.min(0, v.x); }
  if (pz < -halfD + r) { pz = -halfD + r; v.y = Math.max(0, v.y); }
  if (pz > halfD - r) { pz = halfD - r; v.y = Math.min(0, v.y); }
  return [px, pz];
}

function updateRobot(dt) {
  const input = won ? { x: 0, y: 0 } : readInput();
  const mag = Math.min(1, Math.hypot(input.x, input.y));
  const v = robot.vel;

  // Velocity eases toward the stick direction: screen up = into the scene (-Z).
  const k = damp(mag > 0.05 ? R.acceleration : R.deceleration, dt);
  v.x += (input.x * R.maxSpeed - v.x) * k;
  v.y += (input.y * R.maxSpeed - v.y) * k;
  if (mag < 0.05 && v.lengthSq() < 0.0004) v.set(0, 0);

  const [px, pz] = collide(robot.root.position.x + v.x * dt, robot.root.position.z + v.y * dt);
  robot.root.position.x = px;
  robot.root.position.z = pz;

  // Face the stick direction; keep the last heading when stopped.
  if (mag > 0.15) robot.targetYaw = Math.atan2(input.x, input.y);
  const prevYaw = robot.yaw;
  robot.yaw += wrapAngle(robot.targetYaw - robot.yaw) * damp(R.turnSpeed, dt);
  robot.yaw = wrapAngle(robot.yaw);
  robot.root.rotation.y = robot.yaw;
  const yawRate = wrapAngle(robot.yaw - prevYaw) / dt;

  // Forward lean = speed along facing + a bit extra while accelerating
  // (and a small lean back while braking), driven through a spring so it
  // settles upright with a tiny wobble when the robot stops.
  const fwd = v.x * Math.sin(robot.yaw) + v.y * Math.cos(robot.yaw);
  const rawAccel = (fwd - robot.prevFwd) / dt;
  robot.prevFwd = fwd;
  robot.accel += (rawAccel - robot.accel) * damp(10, dt);
  const leanTarget = ((fwd / R.maxSpeed) * R.maxLean + clamp(robot.accel * R.accelTilt, -R.maxAccelTilt, R.maxAccelTilt)) * DEG;
  robot.leanVel += (leanTarget - robot.leanAngle) * R.leanStiffness * dt;
  robot.leanVel *= Math.exp(-R.leanDamping * dt);
  robot.leanAngle += robot.leanVel * dt;

  // Bank into turns, more at speed.
  const speedRatio = Math.min(1, v.length() / R.maxSpeed);
  const bankTarget = clamp(-yawRate * R.bankAmount * speedRatio, -R.maxBank, R.maxBank) * DEG;
  robot.bank += (bankTarget - robot.bank) * damp(8, dt);

  robot.lean.rotation.set(robot.leanAngle, 0, robot.bank);

  // Hover bob, slightly quicker while moving.
  robot.hoverPhase += dt * Math.PI * 2 * R.hoverFrequency * (1 + speedRatio * 0.6);
  const bob = Math.sin(robot.hoverPhase);
  robot.hover.position.y = R.hoverHeight + bob * R.hoverAmplitude;

  if (robot.glow) {
    robot.glow.material.opacity = 0.3 + 0.12 * -bob + speedRatio * 0.1;
    robot.glow.scale.setScalar(1 - bob * 0.06);
  }
}

function updatePickups(dt, t) {
  const { x, z } = robot.root.position;
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y = t * 1.6 + p.phase;
    p.mesh.position.y = 0.95 + Math.sin(t * 2.4 + p.phase) * 0.1;
    if (Math.hypot(p.x - x, p.z - z) < L.pickupRadius) collect(p);
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.age += dt;
    const f = e.age / e.life;
    e.mesh.scale.setScalar(0.5 + f * 1.8);
    e.mesh.material.opacity = 1 - f;
    if (f >= 1) {
      scene.remove(e.mesh);
      e.mesh.material.dispose();
      effects.splice(i, 1);
    }
  }
}

const debugEl = $('debug');
if (DEBUG) debugEl.hidden = false;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (dt <= 0) return; // first frame can have zero elapsed time
  updateRobot(dt);
  updatePickups(dt, t);
  if (DEBUG) {
    const p = robot.root.position;
    debugEl.textContent = `x ${p.x.toFixed(2)}  z ${p.z.toFixed(2)}\n${Math.round(1 / Math.max(dt, 1e-3))} fps`;
  }
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// Layout, fullscreen, messages
// ---------------------------------------------------------------------------

function layout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let w = W;
  let h = W / CONFIG.stageAspect;
  if (h > H) {
    h = H;
    w = H * CONFIG.stageAspect;
  }
  w = Math.floor(w);
  h = Math.floor(h);
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  renderer.setSize(w, h, false);
  joystick.rest();
}
addEventListener('resize', layout);
document.addEventListener('fullscreenchange', layout);
layout();

const fsBtn = $('fullscreen');
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
if (!document.fullscreenEnabled || standalone) fsBtn.hidden = true;
fsBtn.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      try { await screen.orientation.lock('landscape'); } catch { /* not supported everywhere */ }
    } else {
      await document.exitFullscreen();
    }
  } catch (err) {
    console.warn('Fullscreen failed:', err);
  }
});

let toastTimer;
function showToast(text, ms = 4500) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

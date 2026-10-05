import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from './config.js';
import { Joystick } from './joystick.js';
import { loadLevel, collide } from './level.js';

const DEG = Math.PI / 180;
const R = CONFIG.robot;
const C = CONFIG.camera;
const COL = CONFIG.colors;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('game');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

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

const camera = new THREE.PerspectiveCamera(C.fov, CONFIG.stageAspect, 0.1, 200);

// The camera keeps a fixed three-quarter angle and follows the robot.
// `view` is how far the screen reaches across the floor from the look-at point.
const camEl = C.elevation * DEG;
const halfFov = (C.fov / 2) * DEG;
const camDir = new THREE.Vector3(0, Math.sin(camEl), Math.cos(camEl));
const view = {
  halfX: C.distance * Math.tan(halfFov) * CONFIG.stageAspect,
  far: (C.distance * Math.sin(halfFov)) / Math.sin(camEl - halfFov),   // toward the top of the screen
  near: (C.distance * Math.sin(halfFov)) / Math.sin(camEl + halfFov),  // toward the bottom
};

// The sun's shadow area covers what the camera sees and moves along with it.
const sunOffset = new THREE.Vector3(-6, 14, 7);
const sun = new THREE.DirectionalLight(0xfff3e0, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const farHalfX = (C.distance + view.far * Math.cos(camEl)) * Math.tan(halfFov) * CONFIG.stageAspect;
const shadowHalf = Math.max(farHalfX, (view.far + view.near) / 2) + 1.5;
Object.assign(sun.shadow.camera, { left: -shadowHalf, right: shadowHalf, top: shadowHalf, bottom: -shadowHalf, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const sunRot = new THREE.Matrix4();
const sunRotInv = new THREE.Matrix4();
function aimSun() {
  sunRot.lookAt(sunOffset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  sunRotInv.copy(sunRot).invert();
}
aimSun();

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

let toastTimer;
function showToast(text, ms = 4500) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

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
// Layout, fullscreen
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

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

const loadingEl = $('loading');
const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(draco);

let level;
try {
  level = await loadLevel(params.get('level') || CONFIG.startLevel, gltfLoader, renderer);
} catch (err) {
  loadingEl.classList.add('done');
  showToast(`Couldn't load the level: ${err.message}`, 20000);
  throw err;
}
scene.add(level.visuals);

// Splats are soft and costly to fill, so splat levels render at a lower resolution.
if (level.splat) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.splat.maxPixelRatio));
  layout();
}

// A level can point the sun where its baked lighting has it.
if (level.sun) {
  sunOffset.fromArray(level.sun).setLength(17);
  aimSun();
}

if (DEBUG) {
  for (const c of level.colliders) {
    const helper = new THREE.Mesh(
      new THREE.BoxGeometry(c.hw * 2, c.h, c.hd * 2),
      new THREE.MeshBasicMaterial({ color: 0xff0055, wireframe: true })
    );
    helper.position.set(c.x, c.h / 2, c.z);
    helper.rotation.y = c.rot;
    scene.add(helper);
  }
  const gridSize = Math.ceil(Math.max(level.width, level.depth));
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x22305c, 0x22305c);
  grid.position.set(level.centerX, 0.01, level.centerZ);
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);
}

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
  shadow: null,
};
robot.root.add(robot.hover);
robot.hover.add(robot.lean);
robot.lean.add(robot.holder);
scene.add(robot.root);

// Soft dark blob on the floor that grounds the hovering robot.
if (R.contactShadow) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const fade = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.4, 'rgba(0,0,0,0.6)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 128, 128);
  robot.shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(R.radius * 2.8, R.radius * 2.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: R.contactShadow, depthWrite: false })
  );
  robot.shadow.rotation.x = -Math.PI / 2;
  robot.shadow.position.y = 0.015;
  robot.root.add(robot.shadow);
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
  robot.root.position.set(level.spawn.x, 0, level.spawn.z);
  robot.vel.set(0, 0);
  robot.yaw = robot.targetYaw = level.spawn.yaw * DEG;
  robot.root.rotation.y = robot.yaw;
  robot.leanAngle = robot.leanVel = robot.bank = robot.prevFwd = robot.accel = 0;
  updateCamera(0, true);
}

// ---------------------------------------------------------------------------
// Camera: follows the robot, stops at the level edges
// ---------------------------------------------------------------------------

const camTarget = new THREE.Vector3();
const sunCenter = new THREE.Vector3();
// Clamp v to lo..hi; if the level is smaller than the view, centre it instead.
const range = (lo, hi, v) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));

function updateCamera(dt, snap = false) {
  const b = level.bounds;
  const p = robot.root.position;
  const gx = range(b.minX - C.edgePad + view.halfX, b.maxX + C.edgePad - view.halfX, p.x);
  const gz = range(b.minZ - C.edgePad + view.far, b.maxZ + C.edgePad - view.near, p.z);
  const k = snap ? 1 : damp(C.followSpeed, dt);
  camTarget.x += (gx - camTarget.x) * k;
  camTarget.z += (gz - camTarget.z) * k;
  camera.position.copy(camTarget).addScaledVector(camDir, C.distance);
  camera.lookAt(camTarget);

  // Centre the shadow area on the visible floor, snapped to whole shadow
  // texels so shadow edges don't shimmer while the camera moves.
  const texel = (shadowHalf * 2) / sun.shadow.mapSize.x;
  sunCenter.set(camTarget.x, 0, camTarget.z + (view.near - view.far) / 2).applyMatrix4(sunRotInv);
  sunCenter.x = Math.round(sunCenter.x / texel) * texel;
  sunCenter.y = Math.round(sunCenter.y / texel) * texel;
  sunCenter.applyMatrix4(sunRot);
  sun.target.position.copy(sunCenter);
  sun.position.copy(sunCenter).add(sunOffset);
}

resetRobot();

// Try the real model; keep the placeholder if it isn't there yet.
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

const pickups = level.gems.map(({ x, z, y = 0 }, i) => {
  const mesh = new THREE.Mesh(gemGeo, gemMat);
  mesh.castShadow = true;
  mesh.position.set(x, y + 0.95, z);
  scene.add(mesh);
  return { mesh, x, z, baseY: y + 0.95, phase: i * 0.8, taken: false };
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
// Movement & animation
// ---------------------------------------------------------------------------

function updateRobot(dt) {
  const input = won ? { x: 0, y: 0 } : readInput();
  const mag = Math.min(1, Math.hypot(input.x, input.y));
  const v = robot.vel;

  // Velocity eases toward the stick direction: screen up = into the scene (-Z).
  const k = damp(mag > 0.05 ? R.acceleration : R.deceleration, dt);
  v.x += (input.x * R.maxSpeed - v.x) * k;
  v.y += (input.y * R.maxSpeed - v.y) * k;
  if (mag < 0.05 && v.lengthSq() < 0.0004) v.set(0, 0);

  const [px, pz] = collide(robot.root.position.x + v.x * dt, robot.root.position.z + v.y * dt, R.radius, v, level);
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

  // Wider and fainter as the robot bobs up.
  if (robot.shadow) {
    robot.shadow.material.opacity = R.contactShadow * (1 - bob * 0.15);
    robot.shadow.scale.setScalar(1 + bob * 0.06);
  }
}

function updatePickups(dt, t) {
  const { x, z } = robot.root.position;
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y = t * 1.6 + p.phase;
    p.mesh.position.y = p.baseY + Math.sin(t * 2.4 + p.phase) * 0.1;
    if (Math.hypot(p.x - x, p.z - z) < CONFIG.pickupRadius) collect(p);
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
  updateCamera(dt);
  updatePickups(dt, t);
  if (DEBUG) {
    const p = robot.root.position;
    const splats = level.splat ? `\n${level.splat.numSplats.toLocaleString()} splats` : '';
    debugEl.textContent = `x ${p.x.toFixed(2)}  z ${p.z.toFixed(2)}\n${Math.round(1 / Math.max(dt, 1e-3))} fps${splats}`;
  }
  renderer.render(scene, camera);
});

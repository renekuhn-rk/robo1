// Everything you'd want to tweak lives here.
// World units: 1 unit ≈ 1 floor tile half. The level is centred on (0, 0).
// X = left/right on screen, Z = toward the camera (bottom of screen) is +Z.

export const CONFIG = {
  // The game is letterboxed to this aspect. 16/10 matches the Galaxy Tab S6
  // (2560×1600), so it fills the screen exactly there.
  stageAspect: 16 / 10,

  // Caps rendering resolution. 1.75 looks sharp on the S6 and keeps it at 60fps.
  maxPixelRatio: 1.75,

  camera: {
    fov: 32,        // lower = flatter, more "diorama" look
    elevation: 52,  // degrees above the ground; 90 would be top-down
    margin: 0.94,   // how much of the screen the level fills (1 = edge to edge)
  },

  robot: {
    modelUrl: 'assets/robot.glb',
    height: 1.5,          // your model is auto-scaled to this height
    rotationY: 0,         // degrees; change to 180 / 90 / -90 if it drives sideways or backwards
    radius: 0.55,         // collision size

    maxSpeed: 4.5,
    acceleration: 7,      // how quickly it reaches full speed
    deceleration: 5,      // how quickly it glides to a stop
    turnSpeed: 9,         // how quickly it rotates toward the move direction

    hoverHeight: 0.3,     // gap between floor and robot
    hoverAmplitude: 0.07, // bob up/down distance
    hoverFrequency: 0.8,  // bobs per second

    maxLean: 14,          // degrees of forward lean at full speed
    leanPivot: 0.4,       // where it tilts from (0 = bottom, 1 = top of model)
    accelTilt: 0.22,      // extra lean while speeding up / leaning back while braking
    maxAccelTilt: 6,      // degrees
    leanStiffness: 140,   // spring: higher = snappier
    leanDamping: 11,      // spring: lower = more wobble when stopping
    maxBank: 10,          // degrees of sideways tilt into turns
    bankAmount: 3,        // how strongly turns cause banking

    thrusterGlow: true,   // soft glow on the floor under the robot
  },

  level: {
    width: 20,
    depth: 12,
    wallHeight: 0.7,
    wallThickness: 0.5,
    start: { x: 0, z: 2 },

    // Boxes the robot can't pass through (visible blocks).
    // x/z = centre, w = width (x), d = depth (z), h = height.
    crates: [
      { x: -5,   z: -2,  w: 2,   d: 2,   h: 1.2, color: 'orange' },
      { x: -3.5, z: -2.5, w: 1,  d: 1,   h: 0.7, color: 'yellow' },
      { x: 4,    z: 1.5, w: 3,   d: 1.2, h: 1.0, color: 'blue' },
      { x: 0,    z: -4,  w: 1.4, d: 1.4, h: 1.8, color: 'orange' },
      { x: 6.5,  z: -3.5, w: 1.2, d: 1.2, h: 2.4, color: 'blue' },
      { x: -6.5, z: 3,   w: 1.6, d: 1.6, h: 1.0, color: 'yellow' },
      { x: 2,    z: 4,   w: 1,   d: 1,   h: 0.7, color: 'orange' },
    ],

    // Invisible colliders, for blocking areas of a painted background image.
    blockers: [
      // { x: 0, z: 0, w: 2, d: 2 },
    ],

    // Gem positions [x, z]. Two are hidden behind tall crates to test occlusion.
    pickups: [
      [-8, -4.5], [0, -5.3], [6.5, -5.3], [8, 4.5],
      [-8, 4.5], [-2, 1], [3, -1.5], [-4.5, 0.4],
    ],
    pickupRadius: 0.9,
  },

  // ---- Image slot (optional) -------------------------------------------
  // Put a painted 16:10 image (e.g. 2560×1600) in assets/ and set its path.
  // It's shown behind the 3D scene. With hideBlocks: true, the block level is
  // hidden but colliders and pickups still work, and shadows still fall on
  // the "floor". Open the game with ?debug to see colliders and coordinates
  // while you line things up with the painting.
  background: {
    url: null,            // e.g. 'assets/background.jpg'
    hideBlocks: true,
  },

  // Cut-out PNGs (with transparency) standing upright in the scene.
  // The robot disappears behind them when it drives behind (z smaller than theirs).
  // x/z = where the cut-out stands on the floor, width/height in world units.
  occluders: [
    // { url: 'assets/tree.png', x: -3, z: 1, width: 3, height: 4 },
  ],

  colors: {
    sky: 0xbde4ee,
    floor: 0x8fd3c1,
    floorLine: 0x7cc2b0,
    wall: 0x4f6fd1,
    base: 0x34488f,
    gem: 0xff4f8b,
    orange: 0xf5a54a,
    yellow: 0xffd35c,
    blue: 0x6f8de0,
  },
};

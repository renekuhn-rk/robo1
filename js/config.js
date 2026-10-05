// Everything you'd want to tweak lives here.
// Levels themselves live in levels/<name>/ (see LEVELS.md).
// X = left/right on screen, Z = toward the camera (bottom of screen) is +Z.

export const CONFIG = {
  // The game is letterboxed to this aspect. 16/10 matches the Galaxy Tab S6
  // (2560×1600), so it fills the screen exactly there.
  stageAspect: 16 / 10,

  // Caps rendering resolution. 1.75 looks sharp on the S6 and keeps it at 60fps.
  maxPixelRatio: 1.75,

  // Folder name in levels/. Override with ?level=<name> in the address.
  startLevel: 'level1',

  camera: {
    fov: 32,         // lower = flatter, more "diorama" look
    elevation: 52,   // degrees above the ground; 90 would be top-down
    distance: 12,   // how far the camera sits from the robot; smaller = closer
    followSpeed: 4,  // how quickly the camera catches up with the robot
    edgePad: 1.5,    // how far past the level edge the view may reach
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

  pickupRadius: 0.9,

  // Stand-in visuals for levels that have no GLB yet.
  blockout: {
    wallHeight: 0.7,
    wallThickness: 0.5,
  },

  // Levels drawn as a gaussian splat ("splat" in level.json).
  splat: {
    shadowOpacity: 0.4, // darkness of the robot's shadow on the splat
    catcherPad: 2,      // how far the stand-in shadow floor reaches past the bounds
  },

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

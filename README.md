# Robot Run

A small 3D browser game: a hovering robot collects gems in a diorama level.
Built with Three.js, no build step, ready for GitHub Pages.

## Add your robot

Put your model at `assets/robot.glb`. It is scaled and centred automatically.
Until the file is there, a stand-in robot is shown.

If your robot drives sideways or backwards, change `rotationY` in `js/config.js`
to `180`, `90` or `-90`. Size, speed, hover and lean are all tunable there too.

## Test on your computer

Opening `index.html` directly from the folder won't work (browsers block
loading the model from `file://`). Start a tiny local server in this folder:

    python -m http.server 8000

then open http://localhost:8000. Arrow keys or WASD drive on a desktop.

## Put it online with GitHub Pages

1. Create a new repository on GitHub and upload all files in this folder
   (keep the folder structure, including the empty `.nojekyll` file).
2. In the repository: Settings > Pages > Source: "Deploy from a branch",
   branch `main`, folder `/ (root)`. Save.
3. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

On the tablet, open that link in Chrome, then menu > "Add to Home screen".
Launched from the home screen it runs fullscreen in landscape.

## Debug mode

Add `?debug` to the address (e.g. `.../robot-run/?debug`) to see colliders,
a floor grid, the robot's x/z position and the frame rate. Use the position
readout to place gems, crates and blockers in `js/config.js`.

## Painted background (image slot)

1. Put a 16:10 image (e.g. 2560x1600) in `assets/`.
2. In `js/config.js` set `background.url` to its path, e.g. `'assets/background.jpg'`.
3. The block level hides; collisions, gems and the robot's shadow keep working.
   Use `level.blockers` for invisible walls and `occluders` for cut-out PNGs
   the robot can drive behind.

## Files

    index.html            page + HUD
    css/style.css         layout, joystick, counter, messages
    js/config.js          everything tunable
    js/main.js            scene, level, robot motion, gems
    js/joystick.js        floating on-screen joystick
    manifest.webmanifest  home-screen app settings
    assets/               robot.glb, icons, images

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

## Levels

Levels are folders in `levels/` with a `level.json` (colliders, gems, start
position) and an optional `level.glb` for the visuals. `LEVELS.md` describes
the format and the Houdini export. The camera follows the robot, so a level
can be larger than the screen.

Open another level with `?level=<folder>`, e.g. `.../?level=test-big`.

## Debug mode

Add `?debug` to the address (e.g. `.../?level=level1&debug`) to see colliders,
a floor grid, the robot's x/z position and the frame rate.

## Files

    index.html            page + HUD
    css/style.css         layout, joystick, counter, messages
    js/config.js          everything tunable
    js/main.js            scene, camera, robot motion, gems
    js/level.js           level loading, block-out visuals, collision
    levels/               one folder per level (see LEVELS.md)
    js/joystick.js        floating on-screen joystick
    manifest.webmanifest  home-screen app settings
    assets/               robot.glb, icons, images

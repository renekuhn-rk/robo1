# Making levels

Each level is a folder in `levels/`:

    levels/level1/level.json   gameplay data (required)
    levels/level1/level.glb    visuals as a mesh (optional)
    levels/level1/level.spz    visuals as a gaussian splat (optional)

Open a level with `?level=<folder name>`, e.g. `http://localhost:8000/?level=test-big`.
Add `&debug` to see the colliders, a floor grid and the robot's position.
The level that loads without `?level=` is `startLevel` in `js/config.js`.

## level.json

```json
{
  "name": "Level 1",
  "model": "level.glb",
  "castShadows": true,
  "bounds": { "minX": -10, "maxX": 10, "minZ": -6, "maxZ": 6 },
  "spawn": { "x": 0, "z": 2, "yaw": 0 },
  "colliders": [
    { "x": -5, "z": -2, "w": 2, "d": 2, "h": 1.2, "rot": 0 }
  ],
  "gems": [ [-8, -4.5], [0, -5.3] ]
}
```

| Field | Meaning |
|---|---|
| `bounds` | The rectangle the robot can't leave. Also limits the camera. |
| `spawn` | Robot start. `yaw` in degrees; 0 faces the camera (+Z). |
| `colliders` | Boxes the robot can't pass. `x`/`z` = centre, `w` = size along X, `d` = size along Z, `rot` = rotation around Y in degrees (optional), `h` = height (only for the debug view and block-out). |
| `gems` | `[x, z]` pairs, or `{ "x":, "y":, "z": }` to raise one off the floor. |
| `model` | GLB file in the same folder. **Leave it out and the game draws a block-out** (floor, walls, one block per collider), so a level is playable from the JSON alone. |
| `texture` | Image applied to the whole GLB, for exports that carry no material (path relative to the level folder). Leave out if the GLB has its own material. |
| `castShadows` | Set `false` once lighting is baked into the textures. Default `true`. |
| `splat` | Gaussian splat file in the same folder, see below. Can be combined with `model`. |
| `shadowCatcher` | GLB with the surfaces that should show the robot's shadow on a splat level. |
| `shadowOpacity` | Darkness of that shadow, 0–1. Default is `splat.shadowOpacity` in `js/config.js`. |
| `sun` | `[x, y, z]` direction from the level toward the sun, so the robot's shadow matches the baked lighting. Default `[-6, 14, 7]`. |

## level.glb

- Y-up, **1 Houdini unit = 1 game unit**, floor at y = 0, same origin as the JSON. Houdini and the game use the same axes; nothing needs flipping. The camera looks from +Z toward -Z.
- The robot is 1.5 units tall and about 0.9 wide; gaps it should pass need to be wider than 1.1.
- Visuals only: no cameras, lights or collision geometry.
- Budget for the Tab S6: up to roughly 100–150k triangles, one 2048 px texture atlas, as few materials as possible (each material is a draw call; merge geometry that shares one).
- Include normals and UVs. Use a Principled Shader with a base-colour texture; it exports as a standard glTF material.

## Gaussian splat levels

A level can be drawn as a gaussian splat instead of (or on top of) a GLB. The
splat is only the picture: bounds, colliders, gems and spawn still come from
`level.json`. The robot and gems stay meshes and are hidden by splats in front
of them.

```json
"splat": "level.spz",
"shadowCatcher": "catcher.glb",
"sun": [-6, 14, 7]
```

- **Formats:** `.spz`, `.ply` (also compressed), `.splat`, `.ksplat`, `.sog`. Rendering is done by [Spark](https://sparkjs.dev), which is only downloaded for levels that have a splat.
- **A PLY saved by Houdini itself won't load** (big-endian, with Houdini's attribute names). Convert it with `python tools/houdini_ply_to_splat.py levels/<name>/level.ply`, which writes `level.splat` next to it, and point `splat` at that.
- **Alignment:** the splat must be in the same space as the JSON (Y-up, 1 unit = 1 game unit, floor at y = 0). Train it from Houdini renders with the Houdini camera poses, so no rescaling is involved. If a trainer flips or moves it, correct it in the JSON: `"splat": { "file": "level.spz", "position": [0, 0, 0], "rotation": [180, 0, 0], "scale": 1 }` (rotation in degrees).
- **Lighting is baked into the splat.** Set `sun` to the light direction used for the renders.
- **Shadow catcher:** a splat can't receive shadows, so an invisible mesh shows the robot's shadow instead. Export the floor and the tops and sides of obstacles as a low-poly `catcher.glb` (a few hundred triangles; no materials or UVs needed). Without one, the game uses a flat floor plus the collider boxes.
- **Budget for the Tab S6:** not measured yet. Start around 0.5–1 million splats and check the fps with `&debug`, which also shows the splat count.

`levels/splat-test` is a stand-in made by `python tools/make_test_splat.py levels/splat-test` (floor tiles and one block per collider). It only exists to test the renderer.

## Exporting from Houdini

**Visuals:** a `ROP glTF Output` node (in `/out`, or the `rop_gltf` SOP), export type `glb`, pointed at the visual geometry only.

**Gameplay data:** build one point cloud in SOPs with these attributes, then wire it into a **Python SOP** with the script below: input 0 = the marker points, input 1 = the floor (its bounding box is the playable area). `level.json` is written each time the node cooks.

| Point attribute | Type | Used for |
|---|---|---|
| `type` | string | `collider`, `gem` or `spawn` |
| `P` | position | centre of the collider / gem / spawn |
| `size` | vector | collider size (x = width, y = height, z = depth) |
| `rot_y` | float | rotation around Y in degrees (colliders: box rotation, spawn: facing). Not named `rot`, because Houdini treats `rot` as a quaternion. |

Add these parameters to the Python SOP (Edit Parameter Interface). Only `outpath` is required; a parameter that is missing or left empty is left out of the JSON.

| Parameter name | Type | Written as |
|---|---|---|
| `outpath` | Directory | folder the `level.json` goes into |
| `levelname` | String | `name` |
| `model` | String | `model`, e.g. `level.glb`. Empty = no mesh visuals. |
| `texture` | String | `texture`, only for a GLB without its own material |
| `splat` | String | `splat`, e.g. `level.spz` |
| `shadowcatcher` | String | `shadowCatcher`, e.g. `catcher.glb` |
| `shadowopacity` | Float | `shadowOpacity`; 0 = use the game's default |
| `sun` | Float Vector 3 | `sun`, direction toward the light; 0 0 0 = use the game's default |

```python
import hou, json, os

node = hou.pwd()
geo = node.geometry()                  # input 0: the marker points
bb = node.inputs()[1].geometry().boundingBox()   # input 1: the floor

r = lambda v: round(float(v), 3)

def parm(name, default=''):
    # Value of a parameter on this node, or the default if it doesn't exist
    p = node.parm(name)
    return p.eval() if p else default

def attr(pt, name, default):
    # Value of a point attribute, or the default if the attribute doesn't exist
    a = geo.findPointAttrib(name)
    return pt.attribValue(a) if a else default

outdir = parm('outpath')
level = {'name': parm('levelname') or 'Level'}

# File names: only written when the parameter is filled in
for key, name in (('model', 'model'), ('texture', 'texture'),
                  ('splat', 'splat'), ('shadowCatcher', 'shadowcatcher')):
    value = str(parm(name)).strip()
    if value:
        level[key] = value

if parm('shadowopacity', 0) > 0:
    level['shadowOpacity'] = r(parm('shadowopacity'))

sun = node.parmTuple('sun')
if sun and any(sun.eval()):
    level['sun'] = [r(v) for v in sun.eval()]

level.update({
    'bounds': {'minX': r(bb.minvec()[0]), 'maxX': r(bb.maxvec()[0]),
               'minZ': r(bb.minvec()[2]), 'maxZ': r(bb.maxvec()[2])},
    'spawn': {'x': 0, 'z': 0, 'yaw': 0},
    'colliders': [],
    'gems': [],
})
for pt in geo.points():
    kind, p = attr(pt, 'type', ''), pt.position()
    if kind == 'collider':
        s = attr(pt, 'size', (1, 1, 1))
        level['colliders'].append({'x': r(p[0]), 'z': r(p[2]), 'w': r(s[0]), 'd': r(s[2]),
                                   'h': r(s[1]), 'rot': r(attr(pt, 'rot_y', 0))})
    elif kind == 'gem':
        level['gems'].append([r(p[0]), r(p[2])])
    elif kind == 'spawn':
        level['spawn'] = {'x': r(p[0]), 'z': r(p[2]), 'yaw': r(attr(pt, 'rot_y', 0))}

os.makedirs(outdir, exist_ok=True)
with open(os.path.join(outdir, 'level.json'), 'w') as f:
    json.dump(level, f, indent=2)
```

This version of the script has not been run in Houdini yet.

Copy the exported folder into `levels/`, then open `?level=<name>&debug` and check
that the red collider wireframes sit on the geometry.

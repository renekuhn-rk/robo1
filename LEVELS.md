# Making levels

Each level is a folder in `levels/`:

    levels/level1/level.json   gameplay data (required)
    levels/level1/level.glb    visuals (optional)

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

## level.glb

- Y-up, **1 Houdini unit = 1 game unit**, floor at y = 0, same origin as the JSON. Houdini and the game use the same axes; nothing needs flipping. The camera looks from +Z toward -Z.
- The robot is 1.5 units tall and about 0.9 wide; gaps it should pass need to be wider than 1.1.
- Visuals only: no cameras, lights or collision geometry.
- Budget for the Tab S6: up to roughly 100–150k triangles, one 2048 px texture atlas, as few materials as possible (each material is a draw call; merge geometry that shares one).
- Include normals and UVs. Use a Principled Shader with a base-colour texture; it exports as a standard glTF material.

## Exporting from Houdini

**Visuals:** a `ROP glTF Output` node (in `/out`, or the `rop_gltf` SOP), export type `glb`, pointed at the visual geometry only.

**Gameplay data:** build one point cloud in SOPs with these attributes, then run the script below (shelf tool, or the Post-Render Script of the glTF ROP).

| Point attribute | Type | Used for |
|---|---|---|
| `type` | string | `collider`, `gem` or `spawn` |
| `P` | position | centre of the collider / gem / spawn |
| `size` | vector | collider size (x = width, y = height, z = depth) |
| `rot` | float | rotation around Y in degrees (colliders: box rotation, spawn: facing) |

```python
import hou, json

MARKERS = '/obj/level/OUT_gameplay'   # SOP with the marker points
FLOOR   = '/obj/level/OUT_floor'      # SOP whose bounding box is the playable area
OUT     = '$HIP/export/level1/level.json'

r = lambda v: round(float(v), 3)
geo = hou.node(MARKERS).geometry()
bb = hou.node(FLOOR).geometry().boundingBox()

level = {
    'name': 'Level 1',
    'model': 'level.glb',
    'bounds': {'minX': r(bb.minvec()[0]), 'maxX': r(bb.maxvec()[0]),
               'minZ': r(bb.minvec()[2]), 'maxZ': r(bb.maxvec()[2])},
    'spawn': {'x': 0, 'z': 0, 'yaw': 0},
    'colliders': [],
    'gems': [],
}
for pt in geo.points():
    kind, p = pt.attribValue('type'), pt.position()
    if kind == 'collider':
        s = pt.attribValue('size')
        level['colliders'].append({'x': r(p[0]), 'z': r(p[2]), 'w': r(s[0]), 'd': r(s[2]),
                                   'h': r(s[1]), 'rot': r(pt.attribValue('rot'))})
    elif kind == 'gem':
        level['gems'].append([r(p[0]), r(p[2])])
    elif kind == 'spawn':
        level['spawn'] = {'x': r(p[0]), 'z': r(p[2]), 'yaw': r(pt.attribValue('rot'))}

with open(hou.text.expandString(OUT), 'w') as f:
    json.dump(level, f, indent=2)
```

This script has not been run in Houdini yet; adjust the node paths to your setup.

Copy the exported folder into `levels/`, then open `?level=<name>&debug` and check
that the red collider wireframes sit on the geometry.

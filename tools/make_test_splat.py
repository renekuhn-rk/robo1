"""Writes a stand-in gaussian splat for a level, built from its level.json.

    python tools/make_test_splat.py levels/splat-test

The result (level.splat next to the level.json) shows a tiled floor and one
block per collider, in game coordinates. It is only there to test the splat
renderer and the shadow catcher until a real splat comes out of Houdini.
"""
import json, math, os, random, struct, sys

STEP = 0.07    # distance between splats
THIN = 0.004   # splat thickness across the surface
SUN = (-6, 14, 7)  # same direction as the game's sun, for the fake shading

folder = sys.argv[1] if len(sys.argv) > 1 else 'levels/splat-test'
with open(os.path.join(folder, 'level.json')) as f:
    level = json.load(f)
b = level['bounds']
random.seed(1)
sun_len = math.sqrt(sum(v * v for v in SUN))
sun = [v / sun_len for v in SUN]
out = bytearray()


def splat(pos, scale, color, quat=(1, 0, 0, 0)):
    # .splat: position, scale (3 floats each), RGBA, rotation w x y z (bytes)
    out.extend(struct.pack('<3f3f4B4B', *pos, *scale, *color, 255,
                           *[max(0, min(255, round(q * 128 + 128))) for q in quat]))


def shade(rgb, normal):
    light = 0.55 + 0.45 * max(0, sum(n * s for n, s in zip(normal, sun)))
    return [max(0, min(255, round(c * light + random.uniform(-6, 6)))) for c in rgb]


def grid(lo, hi):
    n = max(1, round((hi - lo) / STEP))
    return [lo + (i + 0.5) * (hi - lo) / n for i in range(n)]


# Floor: 2-unit tiles with darker seams
for x in grid(b['minX'], b['maxX']):
    for z in grid(b['minZ'], b['maxZ']):
        seam = min(x % 2, 2 - x % 2, z % 2, 2 - z % 2) < 0.06
        splat((x, 0, z), (STEP * 0.6, THIN, STEP * 0.6), shade((124, 194, 176) if seam else (143, 211, 193), (0, 1, 0)))

# One block per collider
palette = [(245, 165, 74), (255, 211, 92), (111, 141, 224)]
for i, c in enumerate(level.get('colliders', [])):
    rot = math.radians(c.get('rot', 0))
    cos, sin = math.cos(rot), math.sin(rot)
    quat = (math.cos(rot / 2), 0, math.sin(rot / 2), 0)
    hw, hd, h = c['w'] / 2, c['d'] / 2, c.get('h', 1)
    rgb = palette[i % len(palette)]
    world = lambda lx, y, lz: (c['x'] + lx * cos + lz * sin, y, c['z'] - lx * sin + lz * cos)
    turn = lambda nx, nz: (nx * cos + nz * sin, 0, -nx * sin + nz * cos)
    s = STEP * 0.6
    for lx in grid(-hw, hw):
        for lz in grid(-hd, hd):
            splat(world(lx, h, lz), (s, THIN, s), shade(rgb, (0, 1, 0)), quat)
    for y in grid(0, h):
        for lx in grid(-hw, hw):
            for side in (-1, 1):
                splat(world(lx, y, side * hd), (s, s, THIN), shade(rgb, turn(0, side)), quat)
        for lz in grid(-hd, hd):
            for side in (-1, 1):
                splat(world(side * hw, y, lz), (THIN, s, s), shade(rgb, turn(side, 0)), quat)

path = os.path.join(folder, 'level.splat')
with open(path, 'wb') as f:
    f.write(out)
print(f'{path}: {len(out) // 32:,} splats, {len(out) / 1e6:.1f} MB')

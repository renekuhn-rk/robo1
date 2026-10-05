"""Converts a PLY saved by Houdini (GSOPs attributes) into a .splat the game can load.

    python tools/houdini_ply_to_splat.py levels/splat1/level.ply
    python tools/houdini_ply_to_splat.py levels/splat1/level.ply --gamma 1.2

Houdini's own PLY writer is big-endian and names the attributes its own way
(orient, scale, GS_Alpha, red/green/blue), which splat viewers don't read.
Expects linear scale, opacity 0-1 and orient as Houdini stores it (x y z w).
Writes level.splat next to the input.

Houdini keeps colour linear and only converts it for the screen in the
viewport (OCIO). The game shows the stored values as they are, so the colours
are converted to sRGB here. Add --raw to keep them unchanged.

--gamma adjusts the brightness afterwards: above 1 is brighter, below 1 is
darker, 1 (the default) changes nothing. Black and white stay where they are.
"""
import os, sys
import numpy as np

TYPES = {'float': 'f4', 'double': 'f8', 'uchar': 'u1', 'char': 'i1',
         'ushort': 'u2', 'short': 'i2', 'uint': 'u4', 'int': 'i4'}

args = sys.argv[1:]
raw = '--raw' in args
gamma = float(args[args.index('--gamma') + 1]) if '--gamma' in args else 1.0
src = args[0]
with open(src, 'rb') as f:
    data = f.read()
end = data.index(b'end_header') + len(b'end_header\n')
endian, count, fields, in_vertex = '<', 0, [], False
for line in data[:end].decode('ascii').splitlines():
    w = line.split()
    if w[:1] == ['format']:
        endian = '>' if w[1] == 'binary_big_endian' else '<'
    elif w[:1] == ['element']:
        in_vertex = w[1] == 'vertex'
        if in_vertex:
            count = int(w[2])
    elif w[:1] == ['property'] and in_vertex:
        fields.append((w[2], endian + TYPES[w[1]]))
pts = np.frombuffer(data, dtype=np.dtype(fields), count=count, offset=end)
missing = [n for n in ('x', 'red', 'GS_Alpha', 'orient1', 'scale1') if n not in pts.dtype.names]
if missing:
    sys.exit(f'{src}: missing attributes {missing}. Found: {pts.dtype.names}')

col = lambda *names: np.stack([pts[n].astype(np.float32) for n in names], axis=1)
out = np.zeros(count, dtype=[('pos', '<f4', 3), ('scale', '<f4', 3), ('rgba', 'u1', 4), ('rot', 'u1', 4)])
out['pos'] = col('x', 'y', 'z')
out['scale'] = col('scale1', 'scale2', 'scale3')
rgb = col('red', 'green', 'blue') / 255
if not raw:
    rgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1 / 2.4) - 0.055)  # linear -> sRGB
rgb = rgb ** (1 / gamma)
out['rgba'][:, :3] = np.round(rgb * 255)
out['rgba'][:, 3] = np.clip(np.round(pts['GS_Alpha'] * 255), 0, 255)
# .splat stores the rotation as w x y z
out['rot'] = np.clip(np.round(col('orient4', 'orient1', 'orient2', 'orient3') * 128 + 128), 0, 255)

dst = os.path.splitext(src)[0] + '.splat'
out.tofile(dst)
lo, hi = out['pos'].min(axis=0), out['pos'].max(axis=0)
print(f'{dst}: {count:,} splats, {os.path.getsize(dst) / 1e6:.1f} MB')
print('x %.2f to %.2f   y %.2f to %.2f   z %.2f to %.2f' % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))

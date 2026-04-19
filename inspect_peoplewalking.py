import struct, json, pathlib
root = pathlib.Path('assets')
path = root / 'peoplewalking.glb'
with open(path, 'rb') as f:
    header = f.read(12)
    magic, version, length = struct.unpack('<4sII', header)
    chunks = []
    while f.tell() < length:
        chunk_header = f.read(8)
        if len(chunk_header) < 8:
            break
        chunk_len, chunk_type = struct.unpack('<I4s', chunk_header)
        chunk_data = f.read(chunk_len)
        chunks.append((chunk_type, chunk_data))
    js = json.loads([d for t,d in chunks if t==b'JSON'][0].decode('utf-8'))
indices = [153,221,289,357,425,493,561,629,697,765,833,901,969,1037,1105,1173,1241,1309,1377,1445,1513,1581,1649,1717,1785,1853,1921,1989,2057,2125,2193,2261,2329,2397,2465,2533,2601,2669,2737,2805,2873]
for idx in indices:
    node = js['nodes'][idx]
    print(idx, node.get('name', '(unnamed)'), 'children', node.get('children'), 'translation', node.get('translation'), 'rotation', node.get('rotation'), 'scale', node.get('scale'), 'mesh' in node, 'skin' in node)
print('\nAnimation clips:')
for i,a in enumerate(js.get('animations', [])):
    print(i, a.get('name'), 'channels', len(a.get('channels', [])), 'samplers', len(a.get('samplers', [])))

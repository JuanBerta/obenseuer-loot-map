"""In-game icons for the Database pages: items, recipes, furniture and character portraits.
Usage: python icons.py <Obenseuer_Data dir> <site dir>
Writes data/icons/sheets/{items,recipes,furniture,people}.png (48 px cells) and data/icons/sheets/icons.json.
Run tools/build_db.py afterwards so data/db.js picks the icons up.

Where the game keeps them (Assembly-CSharp):
- items and recipes: Resources.Load<Sprite>(Appearance.SpritePath), found through the ResourceManager in globalgamemanagers
- furniture: Furniture.image (ScriptableObject in the .assets files)
- characters: Character.Sprite (ScriptableObject in the .assets files)"""
import sys, os, glob, json, struct, collections
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np, cv2, usf, ser, tex

data_dir, site = os.path.abspath(sys.argv[1]), sys.argv[2]
usf.D = data_dir.rstrip('/\\') + os.sep; ser.M = os.path.join(data_dir, 'Managed') + os.sep
SA = os.path.join(data_dir, 'StreamingAssets')
CELL, COLS = 48, 32
out_dir = os.path.join(site, 'data', 'icons', 'sheets'); os.makedirs(out_dir, exist_ok=True)
problems = collections.Counter(); examples = {}
def problem(kind, what):
    problems[kind] += 1; examples.setdefault(kind, what)

# ---- more texture formats than tex.decode (BC4/5/7 through Pillow, a few raw ones)
_decode = tex.decode
def decode(data, w, h, fmt):
    if fmt in (10, 12, 3, 4): return _decode(data, w, h, fmt)
    if fmt == 5:  return np.frombuffer(data[:w*h*4], np.uint8).reshape(h, w, 4)[:, :, [1, 2, 3, 0]]          # ARGB32
    if fmt == 14: return np.frombuffer(data[:w*h*4], np.uint8).reshape(h, w, 4)[:, :, [2, 1, 0, 3]]          # BGRA32
    if fmt == 1:                                                                                             # Alpha8
        a = np.frombuffer(data[:w*h], np.uint8).reshape(h, w)
        return np.dstack([np.full_like(a, 255)] * 3 + [a])
    if fmt in (25, 26, 27):
        from PIL import Image
        n = {25: 7, 26: 4, 27: 5}[fmt]
        bw, bh = (w + 3) // 4 * 4, (h + 3) // 4 * 4
        size = bw * bh // 16 * (8 if n == 4 else 16)
        img = Image.frombytes('RGBA', (bw, bh), data[:size], 'bcn', n)
        return np.asarray(img.convert('RGBA'))[:h, :w]
    raise ValueError('texture format %d not supported' % fmt)
tex.decode = decode

# UnityPy (pip install UnityPy), when installed, decodes what tex.py can't: sprites packed in atlases,
# crunch-compressed and other texture formats. Our own reader still finds the objects.
try:
    import UnityPy
    UENV = UnityPy.Environment(path=data_dir); _uf = {}
    print('using UnityPy', UnityPy.__version__)
except ImportError:
    UENV = None; print('UnityPy not installed: atlas-packed or crunch-compressed sprites will be skipped (pip install UnityPy)')
def upy_rgba(fn, pid):
    if fn not in _uf: _uf[fn] = UENV.load_file(os.path.join(data_dir, fn), name=fn)
    f = _uf[fn]; f = getattr(f, 'objects', None) and f or next(iter(f.files.values()))
    img = f.objects[pid].read().image
    return np.asarray(img.convert('RGBA'))

def sprite_rgba(sf, fid, pid):
    """Sprite or Texture2D -> RGBA image (top row first)."""
    fn = os.path.basename(sf.path) if fid == 0 else sf.ext[fid - 1]
    if UENV is not None:
        try:
            img = upy_rgba(fn, pid)
            if img.size and img[:, :, 3].max() > 0: return img
        except Exception as e: problem('UnityPy could not read (fell back)', '%s:%s %s' % (fn, pid, e))
    s = usf.load(fn)
    if s is None or pid not in s.objs: raise KeyError('missing object %s:%s' % (fn, pid))
    cid = s.objs[pid][2]
    if cid == 28:                                   # Texture2D
        nm, w, h, fmt, data = tex._tex_data(s, pid)
        img = decode(data, w, h, fmt)[::-1]
    elif cid == 213:                                # Sprite
        nm, img = tex.sprite(sf, ('pptr', fid, pid))
    else: raise KeyError('class %d is not an image' % cid)
    if img.shape[2] == 3: img = np.dstack([img, np.full(img.shape[:2], 255, np.uint8)])
    if img.size == 0: raise ValueError('empty image (sprite in an atlas?)')
    return img

def fit(img):
    """Trim transparent edges, fit into a CELL x CELL square, keep aspect."""
    a = img[:, :, 3]; ys, xs = np.nonzero(a > 8)
    if len(xs): img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = img.shape[:2]; k = (CELL - 2) / max(h, w)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
    cell = np.zeros((CELL, CELL, 4), np.uint8); y0, x0 = (CELL - nh) // 2, (CELL - nw) // 2
    cell[y0:y0 + nh, x0:x0 + nw] = img
    return cell

class Sheet:
    def __init__(s, name): s.name = name; s.cells = []; s.by_src = {}; s.map = {}
    def add(s, key, src, make):
        """key -> cell; src dedupes identical sprites; make() returns an RGBA image."""
        if src not in s.by_src:
            try: s.cells.append(fit(make())); s.by_src[src] = len(s.cells) - 1
            except Exception as e: s.by_src[src] = None; problem(s.name + ': ' + type(e).__name__, '%s (%s)' % (key, e))
        if s.by_src[src] is not None: s.map[str(key)] = s.by_src[src]
    def save(s):
        if not s.cells: return
        rows = (len(s.cells) + COLS - 1) // COLS
        img = np.zeros((rows * CELL, COLS * CELL, 4), np.uint8)
        for i, c in enumerate(s.cells): img[i // COLS * CELL:(i // COLS + 1) * CELL, i % COLS * CELL:(i % COLS + 1) * CELL] = c
        cv2.imwrite(os.path.join(out_dir, s.name + '.png'), cv2.cvtColor(img, cv2.COLOR_RGBA2BGRA), [cv2.IMWRITE_PNG_COMPRESSION, 9])
        print(s.name, len(s.map), 'icons,', len(s.cells), 'cells')

# ---- Resources/ paths (ResourceManager, class 147, in globalgamemanagers)
def resource_paths():
    gg = usf.load('globalgamemanagers'); paths = {}
    for p in gg.of(147):
        r = gg.reader(p); n = r.i32()
        for _ in range(n):
            path = r.str(); fid, pid = r.i32(), r.i64()
            fn = gg.ext[fid - 1] if fid else 'globalgamemanagers'
            s = usf.load(fn); cid = s.objs[pid][2] if s and pid in s.objs else None
            # Resources.Load<Sprite> wants the Sprite; keep the Texture2D only if there is no Sprite
            if cid in (213, 28) and (path not in paths or cid == 213): paths[path] = (gg, fid, pid)
    return paths
RES = resource_paths(); print(len(RES), 'image resources')
def res_image(path):
    k = path.lower().replace('\\', '/')
    if k not in RES: raise KeyError('not in Resources: ' + path)
    return sprite_rgba(*RES[k])

def read_json(name):
    raw = open(os.path.join(SA, name), 'rb').read()
    return json.loads(raw.decode('utf-16') if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else raw.decode('utf-8-sig'))

items, recipes, furn, people = Sheet('items'), Sheet('recipes'), Sheet('furniture'), Sheet('people')
item_path = {}
for it in read_json('Items.json'):
    sp = ((it.get('Appearance') or {}).get('SpritePath') or '').strip()
    if sp: item_path[it['ID']] = sp; items.add(it['ID'], sp, lambda sp=sp: res_image(sp))
    else: problem('items: no SpritePath', it['Title'])
for r in read_json('Recipes.json')['Recipes']:
    ap = r.get('Appearance') or {}; sp = (ap.get('SpritePath') or '').strip()
    show = (ap.get('itemToShow') or {}).get('ID') or 0
    outs = [o['Key']['ID'] for o in r.get('output') or []]
    if sp: recipes.add(r['ID'], sp, lambda sp=sp: res_image(sp))
    if str(r['ID']) not in recipes.map:     # fall back to the item it shows / makes, as the game's recipe list does
        for i in [show] + outs:
            if i in item_path: recipes.add(r['ID'], item_path[i], lambda sp=item_path[i]: res_image(sp)); break

# ---- Furniture.image and Character.Sprite, from the ScriptableObjects in the .assets files
for fn in sorted(os.path.basename(f) for f in glob.glob(usf.D + '*.assets')):
    s = usf.load(fn)
    if s is None: continue
    for p in s.of(114):
        try: r, go, sc, nm = usf.mb_head(s, p); n = usf.script_name(s, sc)
        except Exception: continue
        if not n or n[2] not in ('Furniture', 'FurnitureSurface', 'Character'): continue
        try:
            if n[2] == 'Character':
                _, d, _ = ser.read_mb(s, p, 'Assembly-CSharp', 'Character', upto='Sprite')
                key, pp = ' '.join(x for x in ((d.get('Name') or '').strip(), (d.get('LastName') or '').strip()) if x), d.get('Sprite')
                sheet = people
            else:
                _, d, _ = ser.read_mb(s, p, 'Assembly-CSharp', n[2], upto='image')
                key, pp = (d.get('title') or nm or '').strip(), d.get('image')
                sheet = furn
        except Exception as e: problem(n[2] + ': unreadable', '%s:%s %s' % (fn, p, e)); continue
        if not key or key in sheet.map: continue
        if not pp or not pp[2]: problem(n[2] + ': no image', key); continue
        sheet.add(key, (fn, pp[1], pp[2]), lambda s=s, pp=pp: sprite_rgba(s, pp[1], pp[2]))
    usf._cache.pop(fn, None)

meta = dict(cell=CELL, cols=COLS)
for sh in (items, recipes, furn, people):
    sh.save(); meta[sh.name] = sh.map
json.dump(meta, open(os.path.join(out_dir, 'icons.json'), 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
if problems:
    print('Not extracted:')
    for k, n in problems.most_common(): print('  %5d  %s   e.g. %s' % (n, k, examples[k][:140]))

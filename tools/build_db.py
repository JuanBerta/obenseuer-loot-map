"""Database pages for the site: items, recipes, vendors, tenement, tenants, furniture.
Usage: python build_db.py <Obenseuer_Data dir or StreamingAssets dir> <mod lootmap-data.json> <site dir>
Reads Items.json, Recipes.json, StorageSpawnCategory.json, Characters.json and CharactersRent.json
from StreamingAssets, vendor and furniture data from the mod bundle (tools/build_mod_data.py),
and scene names from data/index.js. Writes data/db.js."""
import sys, os, json, re, collections
src, mod_json, site = sys.argv[1:4]
SA = os.path.join(src, 'StreamingAssets') if os.path.isdir(os.path.join(src, 'StreamingAssets')) else src

def read_text(path):
    raw = open(path, 'rb').read()
    return raw.decode('utf-16') if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else raw.decode('utf-8-sig')
def read_json(name):
    p = os.path.join(SA, name)
    if not os.path.exists(p): print('missing', name); return None
    t = read_text(p).strip()
    try: return json.loads(t)
    except json.JSONDecodeError:
        return json.loads('[' + t.rstrip(',') + ']')   # Characters.json: objects separated by commas, no brackets

notes = []

# What using an item does (base values, before the game scales them by your mood, freshness and quality). Only non-zero stats are kept.
# Same sums as ItemConsumable.GetFood/GetDrink/GetNicotine/GetHygiene: the action's Amount counts as nutrition for Food, thirst for Drink, ...
STAT_ACTIONS = ('Food', 'Drink', 'Medicine', 'Smoke', 'Bandage', 'Hygiene', 'Slaughter')
def stats(it):
    for a in it.get('Actions') or []:
        if not isinstance(a, dict) or a.get('Type') not in STAT_ACTIONS: continue
        t, amt = a['Type'], a.get('Amount', 0) or 0
        v = dict(nut=a.get('Food', 0) + (amt if t == 'Food' else 0), thi=a.get('Drink', 0) + (amt if t == 'Drink' else 0),
                 dep=a.get('Depression', 0), hp=a.get('Health', 0), ble=a.get('Bleeding', 0), tir=a.get('Tiredness', 0),
                 hyg=a.get('Hygiene', 0) + (amt if t == 'Hygiene' else 0), alc=a.get('Intoxication', 0),
                 nic=a.get('Nicotine', 0) + (amt if t == 'Smoke' else 0),
                 high=a.get('High', 0) + a.get('HighOrange', 0) + a.get('HighOrangeBad', 0), smv=a.get('SMV', 0), smvr=a.get('SMVProgressionRate', 0),
                 aal=a.get('AlcoholAddiction', 0), mad=a.get('MushroomAddiction', 0), sad=a.get('SmokingAddiction', 0),
                 fxa=a.get('SpecialEffectAmount', 0))
        out = {k: round(x, 4) for k, x in v.items() if x}
        fx = a.get('SpecialEffectName')
        if fx and fx != 'None': out['fx'] = fx
        return out
    return None

# ---- items
items = {}
for it in read_json('Items.json'):
    eff = [[a['Type'], a.get('Amount', 0)] for a in it.get('Actions') or [] if isinstance(a, dict) and a.get('Type') in ('Food', 'Drink', 'Medicine')]
    grp = []; wall = None
    for m in it.get('Meta') or []:
        t = str(m.get('$type', ''))
        if t.endswith('ItemGroupData'): grp = [g['item']['ID'] for g in m.get('itemGroup') or []]
        if t.endswith('WallpaperData'): wall = m.get('surfaceArea')
    items[it['ID']] = [it['Title'].strip(), it.get('BaseValue', 0), it.get('Categories') or [], (it.get('Description') or '').strip(),
                       it.get('Stackable', 1), eff, grp, wall,
                       sorted({str(m.get('$type', '')).split('.')[-1] for m in it.get('Meta') or [] if isinstance(m, dict)}), stats(it),
                       next((int(m.get('maxAmmo', 0)) for m in it.get('Meta') or [] if isinstance(m, dict) and str(m.get('$type', '')).endswith('ItemAmmodata') and m.get('maxAmmo', 0) > 1 and not (isinstance(m.get('ammoItems'), dict) and m['ammoItems'].get('$content') or isinstance(m.get('ammoItems'), list) and m['ammoItems'] or m.get('ammoItemcategories'))), 0)]   # [10]: uses per item (ink = 50), 0 = single use
# ---- recipes
recipes = []; seen_rid = set()
kv = lambda l: [[x['Key']['ID'], x['Value']] for x in l or []]
for r in read_json('Recipes.json')['Recipes']:
    if r.get('Type') == 'Debug': continue
    rid_ = r['ID']
    if rid_ in seen_rid: rid_ = 1000000 + rid_; notes.append(f'Two recipes share ID {r["ID"]} (“{r.get("Name")}” was given ID {rid_})')   # the game data reuses an ID for Apple mash and Green Orb Mash
    seen_rid.add(rid_)
    rec = [rid_, (r.get('Name') or '').strip(), r.get('Type'), r.get('RelevantSkill'), r.get('MinimumSkill', 0), r.get('FailChance', 0),
           r.get('ProcessTime', 0), kv(r.get('input')), kv(r.get('output')), kv(r.get('outputFail')), r.get('RequiredConditions') or [],
           [t for t in r.get('RecipeTags') or [] if t != 'NONE'], 1 if r.get('RecipeRequired') else 0,
           [r.get('SkillFactor', 1), (r.get('metaSettings') or {}).get('qualityFactor', 1), (r.get('metaSettings') or {}).get('fixedQuality', 0) if (r.get('metaSettings') or {}).get('useFixedQuality') else 0,
            1 if (r.get('metaSettings') or {}).get('useAmmoAsInput') else 0]]   # [13]: skill factor, quality factor, fixed output quality (0 = none), 1 = ammo-type inputs spend one use per unit
    for x in rec[7] + rec[8] + rec[9]:
        if x[0] not in items: notes.append(f'Recipe #{rec[0]} “{rec[1]}” uses unknown item ID {x[0]}')
    recipes.append(rec)
# growing / breeding recipes make a live plant or animal item worth nothing: what they really give is what it yields when harvested (grow.grownItems of its prefab, extract_grow.py)
GROW = {int(k): v for k, v in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grow_yield.json'))).items()}
for rec in recipes:
    for pos in (8, 9):
        out_ = {}
        for oid, n in rec[pos]:
            if oid in GROW:
                for yid, lo, hi in GROW[oid]: out_[yid] = out_.get(yid, 0) + n * (lo + hi) / 2
            else: out_[oid] = out_.get(oid, 0) + n
        rec[pos] = [[k, round(v, 3)] for k, v in out_.items()]
# ---- loot tables (all, not only the ones placed in scenes)
loot = {}
for c in read_json('StorageSpawnCategory.json')['$content']:
    nm = c['Name']                     # keep the game's spelling (some names end in a space): scenes use it as the key
    if not nm.strip():
        if c.get('ItemCommon') or c.get('ItemRare'): nm = f'Unnamed #{c["ID"]}'
        else: notes.append(f'Spawn category {c["ID"]} has no name and no items'); continue
    loot[nm] = [c['ID'], c.get('ItemCommon') or [], c.get('ItemRare') or []]
# ---- scenes, stations
raw_idx = open(os.path.join(site, 'data', 'index.js'), encoding='utf-8').read()
IDX = json.loads(raw_idx[raw_idx.index('{'):raw_idx.rindex('}') + 1])
slug_of = {s['scene']: s['slug'] for s in IDX['scenes']}
scene_cats = {s['slug']: s['cats'] for s in IDX['scenes']}
stations = collections.defaultdict(list)
for st, types in IDX['stationTypes'].items():
    for t in types: stations[t].append(st)
# ---- vendors + furniture from the mod bundle
M = json.load(open(mod_json, encoding='utf-8-sig'))
vendors = []; skipped = collections.Counter()
for scene, sc in M['scenes'].items():
    slug = slug_of.get(scene)
    for v in sc.get('vendors', []):
        if not slug: skipped[scene] += 1; continue
        e = {k: v[k] for k in ('n', 'o', 't', 'i', 'pk', 'b', 'ba', 'bf', 'bs', 'fs', 'fb', 'sm', 'bm', 'fp', 'h', 'rm', 'mk', 'sr', 'br') if k in v}
        e['sc'] = slug; e['x'] = v['x']; e['z'] = v['z']
        same = next((w for w in vendors if w['sc'] == slug and w['n'] == e['n'] and (w['x'] - e['x']) ** 2 + (w['z'] - e['z']) ** 2 < 36), None)
        if same:   # one shop split over several counters / furniture shop components
            for k, val in e.items():
                if k in ('i', 'pk', 'fs', 'ba', 'bf'): same[k] = sorted(set(same.get(k, [])) | set(val), key=str)
                elif k not in same: same[k] = val
            continue
        vendors.append(e)
for scene, n in skipped.items():
    names = ', '.join(sorted({v['n'] for v in M['scenes'][scene]['vendors']}))
    notes.append(f'{n} vendor(s) only exist in “{scene}”, which is not on the map: {names}')
placed_tables = {v['t'] for v in vendors if 't' in v}
for nm in loot:
    if re.search(r'Stall|Shop|Trader|Store', nm) and nm not in placed_tables:
        notes.append(f'Loot table “{nm}” looks like shop stock but no placed shop uses it')
for v in vendors:
    for rule in (v.get('ba') or []) + (v.get('bf') or []):
        if re.match(r'^(_?[Ii]tem_)', rule) and not rule.startswith('_item_'):
            notes.append(f'{v["n"]}: buy rule “{rule}” is not spelled “_item_…”, so it probably never matches in game')
furniture = M.get('furniture', {})
_fa = {}
try:
    _p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build', 'furniture_assets.json')
    for _v in json.load(open(_p)).get('furniture', {}).values():
        _t = (_v.get('title') or '').strip()
        if _t and _t not in _fa: _fa[_t] = _v
except Exception as e: print('furniture details skipped', e)
for _f in furniture.values():   # [6] description from the game, [7] what dismantling it gives: [[itemId, amount]]
    _v = _fa.get(_f[0])
    if not _v: continue
    while len(_f) < 6: _f.append([])
    _f.append(_v.get('details') or ''); _f.append(_v.get('dis') or []); _f.append(_v.get('mods') or []); _f.append([x for x in (_v.get('lbl') or []) if x.lower() != _f[0].lower()])
# ---- tenants
chars = read_json('Characters.json') or []
people = {c['Name']: [c.get('ID'), c.get('GenderString'), c.get('Age'), c.get('Relationship'), c.get('Job')] for c in chars if c.get('ID', -1) >= 0}
tenants = []
for r in read_json('CharactersRent.json') or []:
    tenants.append([r['name'], r['id'], [r.get(f'Income{i}', 0) for i in range(1, 7)], r.get('Method'), r.get('MinCondition'), r.get('MaxCondition'),
                    r.get('Smallest'), r.get('Biggest'), r.get('FloorMin', 0), r.get('FloorMax', 0), r.get('MinBathroom'), r.get('Electricity'),
                    r.get('MinHeating'), r.get('Kitchen'), r.get('Water'), [r[f'Family{i}'] for i in range(1, 5) if r.get(f'Family{i}', 'None') != 'None']])
ids = collections.Counter(t[1] for t in tenants)
for t in tenants:
    p = people.get(t[0])
    if not p: notes.append(f'Tenant {t[0]} has no entry in Characters.json')
    elif p[0] != t[1]: notes.append(f'Tenant {t[0]}: rent table id {t[1]}, character ID {p[0]}')
    for f in t[15]:
        if f not in people: notes.append(f'{t[0]}: family member {f} has no entry in Characters.json')
for i, n in ids.items():
    if n > 1: notes.append(f'Rent table id {i} is used by {n} tenants: ' + ', '.join(t[0] for t in tenants if t[1] == i))
for c in chars:
    a = c.get('Age')
    if c.get('ID', -1) >= 0 and isinstance(a, int) and (a < 0 or a > 120): notes.append(f'Character {c["Name"]} (ID {c["ID"]}) has age {a}')

# ---- in-game icons (tools/icons.py), optional
icons = None
ip = os.path.join(site, 'data', 'icons', 'sheets', 'icons.json')
if os.path.exists(ip):
    raw = open(ip, 'rb').read()
    try: icons = json.loads(raw.decode('utf-8'))
    except UnicodeDecodeError: icons = json.loads(raw.decode('cp1252'))   # written by an older icons.py on Windows
    icons['sheets'] = [k for k in ('items', 'recipes', 'furniture', 'people') if os.path.exists(os.path.join(site, 'data', 'icons', 'sheets', k + '.png'))]
else: print('no icons: run tools/icons.py first to add the in-game icons')
landmark_icons = {l['t']: l['icon'] for l in IDX['landmarks'] if l.get('icon') and not l.get('w')}

db = dict(icons=icons, landmarkIcons=landmark_icons, items={str(k): v for k, v in items.items()}, recipes=recipes, loot=loot, vendors=vendors, furniture=furniture,
          typeSkills=M.get('typeSkills', {}), containers=M.get('containers', []), stations=stations, sceneCats=scene_cats, tenants=tenants, people=people,
          notes=sorted(set(notes)))
# ---- game version and Steam build for the footer (optional: needs the Steam appmanifest next to the game folder)
import glob, datetime
mp = os.path.join(site, 'data', 'meta.json')
meta = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}   # keeps the build number when the Steam manifest can't be reached
try:
    gm = open(os.path.join(src, 'globalgamemanagers'), 'rb').read()
    m = re.search(rb'(?<![\d.])0\.\d{1,2}\.\d{1,3}(?![\d.])', gm)
    if m: meta['version'] = m.group().decode()
except OSError: pass
for acf in glob.glob(os.path.join(os.path.normpath(os.path.join(src, '..', '..', '..')), 'appmanifest_*.acf')):
    t = open(acf, encoding='utf-8', errors='replace').read()
    if re.search(r'"installdir"\s+"Obenseuer"', t):
        b, u = re.search(r'"buildid"\s+"(\d+)"', t), re.search(r'"LastUpdated"\s+"(\d+)"', t)
        if b: meta['build'] = int(b.group(1))
        if u: meta['updated'] = datetime.datetime.fromtimestamp(int(u.group(1)), datetime.timezone.utc).strftime('%Y-%m-%d')
if meta:
    with open(mp, 'w', encoding='utf-8') as f: json.dump(meta, f)
    print('game', meta)
out = os.path.join(site, 'data', 'db.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('window.OBS_DB=' + json.dumps(db, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';\n')
print('icons:', ', '.join(f'{k} {len(icons.get(k, {}))}' for k in icons['sheets']) if icons else 'none')
print(len(items), 'items', len(recipes), 'recipes', len(loot), 'tables', len(vendors), 'vendors', len(furniture), 'furniture',
      len(tenants), 'tenants', len(db['notes']), 'notes', os.path.getsize(out) // 1024, 'KB')

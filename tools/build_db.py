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
                       sorted({str(m.get('$type', '')).split('.')[-1] for m in it.get('Meta') or [] if isinstance(m, dict)})]
# ---- recipes
recipes = []
kv = lambda l: [[x['Key']['ID'], x['Value']] for x in l or []]
for r in read_json('Recipes.json')['Recipes']:
    if r.get('Type') == 'Debug': continue
    rec = [r['ID'], (r.get('Name') or '').strip(), r.get('Type'), r.get('RelevantSkill'), r.get('MinimumSkill', 0), r.get('FailChance', 0),
           r.get('ProcessTime', 0), kv(r.get('input')), kv(r.get('output')), kv(r.get('outputFail')), r.get('RequiredConditions') or [],
           [t for t in r.get('RecipeTags') or [] if t != 'NONE'], 1 if r.get('RecipeRequired') else 0]
    for x in rec[7] + rec[8] + rec[9]:
        if x[0] not in items: notes.append(f'Recipe #{rec[0]} “{rec[1]}” uses unknown item ID {x[0]}')
    recipes.append(rec)
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
        e = {k: v[k] for k in ('n', 'o', 't', 'i', 'b', 'ba', 'bf', 'bs', 'fs', 'fb') if k in v}
        e['sc'] = slug; e['x'] = v['x']; e['z'] = v['z']
        same = next((w for w in vendors if w['sc'] == slug and w['n'] == e['n'] and (w['x'] - e['x']) ** 2 + (w['z'] - e['z']) ** 2 < 36), None)
        if same:   # one shop split over several counters / furniture shop components
            for k, val in e.items():
                if k in ('i', 'fs', 'ba', 'bf'): same[k] = sorted(set(same.get(k, [])) | set(val), key=str)
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

db = dict(items={str(k): v for k, v in items.items()}, recipes=recipes, loot=loot, vendors=vendors, furniture=furniture,
          typeSkills=M.get('typeSkills', {}), stations=stations, sceneCats=scene_cats, tenants=tenants, people=people,
          notes=sorted(set(notes)))
out = os.path.join(site, 'data', 'db.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('window.OBS_DB=' + json.dumps(db, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';\n')
print(len(items), 'items', len(recipes), 'recipes', len(loot), 'tables', len(vendors), 'vendors', len(furniture), 'furniture',
      len(tenants), 'tenants', len(db['notes']), 'notes', os.path.getsize(out) // 1024, 'KB')

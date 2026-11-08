"""Compact data bundle for the in-game mod.
Usage: python build_mod_data.py <Obenseuer_Data dir> <extract out dir> <output json> [site dir with data/index.js for friendly names]"""
import sys, os, json, glob, re, collections
data_dir, ext_dir, out = sys.argv[1:4]
site = sys.argv[4] if len(sys.argv) > 4 else None
SA=os.path.join(data_dir,'StreamingAssets')
scenes=json.load(open(os.path.join(ext_dir,'scenes_index.json')))
items={it['ID']:[it['Title'],it.get('BaseValue',0),it.get('Categories') or [],sorted({str(m.get('$type','')).split('.')[-1] for m in (it.get('Meta') or []) if isinstance(m,dict)})] for it in json.load(open(os.path.join(SA,'Items.json'),encoding='utf-8-sig'))}
loot={c['Name']:[c.get('ItemCommon') or [],c.get('ItemRare') or []] for c in json.load(open(os.path.join(SA,'StorageSpawnCategory.json'),encoding='utf-8-sig'))['$content']}
raw=open(os.path.join(SA,'Recipes.json'),'rb').read()
txt=raw.decode('utf-16') if raw[:2] in (b'\xff\xfe',b'\xfe\xff') else raw.decode('utf-8-sig')
recipes=collections.defaultdict(list); recipe_inputs={}
for r in json.loads(txt)['Recipes']:
    if r.get('Name') and r['Name'] not in recipes[r['Type']]: recipes[r['Type']].append(r['Name'])
    ids=[int(x) for x in re.findall(r"'ID': (\d+)", str(r.get('input') or ''))]
    recipe_inputs[str(r['ID'])]=[r.get('Name') or '', r.get('Type') or '', sorted(set(ids))]
names={}
if site:
    raw_idx=open(os.path.join(site,'data','index.js'),encoding='utf-8').read()
    for sc in json.loads(raw_idx[raw_idx.index('{'):raw_idx.rindex('}')+1])['scenes']: names[sc['scene']]=sc['name']
TRASH={'Dumpster','TrashBin','Trashcan','Trash','Trash Machineshop','Trash Organic','TrashBale','CrateSack','CrateSackMines'}
OWNER_PLACEHOLDER={'','name','default male','default female','player'}
S={}; need=set(); used_stock=set()
for i,name in enumerate(scenes):
    pf=os.path.join(ext_dir,'level%d.json'%i); ff=os.path.join(ext_dir,'level%d_feat.json'%i)
    if not os.path.exists(pf): continue
    pts=json.load(open(pf))['points']; fe=json.load(open(ff)) if os.path.exists(ff) else {'features':[],'map':None}
    P=[]
    for p in pts:
        if not p.get('active'): continue
        cat=p.get('category') if p.get('category') in loot else None
        if p['kind']=='container' and not cat and not p.get('customItems') and not p.get('startItems'): continue
        e=dict(k='p' if p['kind']=='pickup' else 'c',x=p['x'],y=p['y'],z=p['z'])
        if cat: e['t']=cat; need.update(loot[cat][0]); need.update(loot[cat][1])
        nm=p.get('title') or (p.get('type') if p.get('type')!='Custom' else None)
        if nm: e['n']=nm
        if p.get('steal'): e['s']=1
        if p.get('locked'): e['l']=1
        if p.get('guid') and p.get('category') in TRASH: e['g']=p['guid']   # for Scavenger's "searched today"
        ow=(p.get('owner') or '').strip()
        if ow and ow.lower() not in OWNER_PLACEHOLDER and p.get('steal'): e['o']=ow
        fx=(p.get('customItems') or [])+(p.get('startItems') or [])
        if fx: e['f']=fx; need.update(fx)
        P.append(e)
    F=[]
    for f in fe['features']:
        if f['kind']!='station' or not f.get('active') or not f.get('title'): continue
        e=dict(n=f['title'],x=f['x'],y=f['y'],z=f['z'],r=f.get('types') or [])
        if f.get('owned'): e['s']=1
        if f.get('owner'): e['o']=f['owner']
        F.append(e)
    D=[]
    for f in fe['features']:
        if f['kind']!='door' or not f.get('to') or f['to']==name: continue
        if any(d['to']==f['to'] and abs(d['x']-f['x'])<4 and abs(d['z']-f['z'])<4 for d in D): continue
        D.append(dict(to=f['to'],n=names.get(f['to']) or f.get('title') or f['to'],x=f['x'],y=f['y'],z=f['z'],open=1 if f['to'] in scenes else 0))
    V=[]
    for f in fe['features']:
        if f['kind']!='vendor' or not f.get('active'): continue
        e=dict(n=f.get('title') or 'Shop',x=f['x'],y=f['y'],z=f['z'])
        if f.get('owner'): e['o']=f['owner']
        if f.get('stock') in loot: e['t']=f['stock']; used_stock.add(f['stock'])
        if f.get('items'): e['i']=f['items']; need.update(f['items'])
        if f.get('trader'):
            e['b']=1
            if f.get('buyAllow'): e['ba']=f['buyAllow']
            if f.get('buyForbid'): e['bf']=f['buyForbid']
            if f.get('buysStolen'): e['bs']=1
        if 't' in e or 'i' in e or 'b' in e: V.append(e)
    mk=None
    if fe.get('map') and fe['map'].get('sprite'): mk=fe['map']['sprite'][1]
    if P or F or V or D:
        S[name]=dict(name=names.get(name,name),map=mk,points=P,stations=F,doors=D,vendors=V,
                     free=sum(1 for p in P if not p.get('s')),steal=sum(1 for p in P if p.get('s')))
used=set(t for s in S.values() for t in [p.get('t') for p in s['points']] if t)|used_stock
for t in used_stock: need.update(loot[t][0]); need.update(loot[t][1])
for r in recipe_inputs.values(): need.update(r[2])
data=dict(version=4,recipeInputs=recipe_inputs,scenes=S,loot={k:v for k,v in loot.items() if k in used},
          items={str(k):v for k,v in items.items()},recipes=recipes)
os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
json.dump(data,open(out,'w',encoding='utf-8'),separators=(',',':'),ensure_ascii=False)
print(sum(len(s['vendors']) for s in S.values()),'vendors',sum(len(s['doors']) for s in S.values()),'doors;',len(S),'scenes',sum(len(s['points']) for s in S.values()),'points',sum(len(s['stations']) for s in S.values()),'stations',os.path.getsize(out)//1024,'KB')

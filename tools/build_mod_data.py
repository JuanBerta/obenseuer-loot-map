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
recipes=collections.defaultdict(list); recipe_inputs={}; skill_count=collections.defaultdict(collections.Counter)
for r in json.loads(txt)['Recipes']:
    if r.get('Name') and r['Name'] not in recipes[r['Type']]: recipes[r['Type']].append(r['Name'])
    ids=[int(x) for x in re.findall(r"'ID': (\d+)", str(r.get('input') or ''))]
    recipe_inputs[str(r['ID'])]=[r.get('Name') or '', r.get('Type') or '', sorted(set(ids))]
    if r.get('RelevantSkill') and r['RelevantSkill']!='None': skill_count[r['Type']][r['RelevantSkill']]+=1
# recipe type -> skills it trains (main skill, plus others used by several recipes)
type_skills={t:[k for k,n in c.most_common() if n>=2 or k==c.most_common(1)[0][0]] for t,c in skill_count.items()}
# ---- furniture (from tools/scan_furniture.py)
furn_ids={}; furniture={}
fa_path=os.path.join(ext_dir,'furniture_assets.json')
fa=json.load(open(fa_path)) if os.path.exists(fa_path) else {'furniture':{},'lists':{}}
cat_names={}
try:
    sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
    import dotnet, struct
    asm=dotnet.Asm(os.path.join(data_dir,'Managed','Assembly-CSharp.dll'))
    ti=asm.find_type('Category'); consts={}
    for i in range(1,asm.rows[0xb]+1):
        typ,par,val=asm.row(0xb,i)
        if par&3==0: consts[par>>2]=asm.blob(val)
    for j,fl,nm,sg in asm.fields(ti):
        if j in consts: cat_names[struct.unpack('<i',consts[j][:4])[0]]=asm.str(nm)
except Exception as e: print('furniture categories skipped',e)
def fid(key):
    f=fa['furniture'].get(key)
    if not f or not f.get('title'): return None
    t=f['title'].strip()
    if t not in furn_ids:
        furn_ids[t]=len(furn_ids)+1
        furniture[str(furn_ids[t])]=[t, cat_names.get(f.get('cat'), str(f.get('cat'))), f.get('oc') or 0, f.get('rm') or 0, f.get('types') or []]
    return furn_ids[t]

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
    for f in sorted(fe['features'], key=lambda f: bool(f.get('furnShop'))):   # traders first, furniture shops merge into them
        if f['kind']!='vendor' or not f.get('active'): continue
        if f.get('furnShop'):
            if (f.get('title') or '').strip().lower()=='test': continue
            fs=sorted({i for i in (fid(k) for k in f.get('furnSell',[])) if i})
            fb=f.get('furnBuy')
            fb='any' if fb=='any' else 'same' if fb=='same' else sorted({i for i in (fid(k) for k in (fb or [])) if i})
            near=min(V, key=lambda v: (v['x']-f['x'])**2+(v['z']-f['z'])**2, default=None)
            if near and (near['x']-f['x'])**2+(near['z']-f['z'])**2 < 6**2 and not f.get('title'):
                near['fs']=sorted(set(near.get('fs',[]))|set(fs))
                if fb: near['fb']=fb
                continue
            e=dict(n=f.get('title') or names.get(name) or 'Furniture shop',x=f['x'],y=f['y'],z=f['z'])
            if fs: e['fs']=fs
            if fb: e['fb']=fb
            if fs or fb: V.append(e)
            continue
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
data=dict(version=6,furniture=furniture,typeSkills=type_skills,recipeInputs=recipe_inputs,scenes=S,loot={k:v for k,v in loot.items() if k in used},
          items={str(k):v for k,v in items.items()},recipes=recipes)
os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
json.dump(data,open(out,'w',encoding='utf-8'),separators=(',',':'),ensure_ascii=False)
print(len(furniture),'furniture;',sum(1 for s in S.values() for v in s['vendors'] if 'fs' in v or 'fb' in v),'furniture shops;',sum(len(s['vendors']) for s in S.values()),'vendors',sum(len(s['doors']) for s in S.values()),'doors;',len(S),'scenes',sum(len(s['points']) for s in S.values()),'points',sum(len(s['stations']) for s in S.values()),'stations',os.path.getsize(out)//1024,'KB')

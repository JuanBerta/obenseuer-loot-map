"""Compact data bundle for the in-game mod.
Usage: python build_mod_data.py <Obenseuer_Data dir> <extract out dir> <output json> [site dir with data/index.js for friendly names]"""
import sys, os, json, glob, re, collections
data_dir, ext_dir, out = sys.argv[1:4]
site = sys.argv[4] if len(sys.argv) > 4 else None
SA=os.path.join(data_dir,'StreamingAssets')
scenes=json.load(open(os.path.join(ext_dir,'scenes_index.json')))
STAT_ACTIONS=('Food','Drink','Medicine','Smoke','Bandage','Hygiene','Slaughter')
def stats(it):
    for a in it.get('Actions') or []:
        if not isinstance(a,dict) or a.get('Type') not in STAT_ACTIONS: continue
        t,amt=a['Type'],a.get('Amount',0) or 0
        v=dict(nut=a.get('Food',0)+(amt if t=='Food' else 0),thi=a.get('Drink',0)+(amt if t=='Drink' else 0),dep=a.get('Depression',0),hp=a.get('Health',0),
               ble=a.get('Bleeding',0),tir=a.get('Tiredness',0),hyg=a.get('Hygiene',0)+(amt if t=='Hygiene' else 0),alc=a.get('Intoxication',0),
               nic=a.get('Nicotine',0)+(amt if t=='Smoke' else 0))
        return {k:round(x,3) for k,x in v.items() if x} or None
    return None
def grpids(it):
    # members of an item group ("Metal Recycle" counts nails and tin cans): the map search uses them to find a group by name
    out=[g['item']['ID'] for m in (it.get('Meta') or []) if isinstance(m,dict) and str(m.get('$type','')).endswith('ItemGroupData') for g in (m.get('itemGroup') or []) if isinstance(g,dict) and isinstance(g.get('item'),dict)]
    return out or 0
items={it['ID']:[it['Title'],it.get('BaseValue',0),it.get('Categories') or [],sorted({str(m.get('$type','')).split('.')[-1] for m in (it.get('Meta') or []) if isinstance(m,dict)}),stats(it),next((int(m.get('maxAmmo',0)) for m in (it.get('Meta') or []) if isinstance(m,dict) and str(m.get('$type','')).endswith('ItemAmmodata') and m.get('maxAmmo',0)>1 and not (isinstance(m.get('ammoItems'),dict) and m['ammoItems'].get('$content') or isinstance(m.get('ammoItems'),list) and m['ammoItems'] or m.get('ammoItemcategories'))),0),grpids(it)] for it in json.load(open(os.path.join(SA,'Items.json'),encoding='utf-8-sig'))}
loot={c['Name']:[c.get('ItemCommon') or [],c.get('ItemRare') or []] for c in json.load(open(os.path.join(SA,'StorageSpawnCategory.json'),encoding='utf-8-sig'))['$content']}
raw=open(os.path.join(SA,'Recipes.json'),'rb').read()
txt=raw.decode('utf-16') if raw[:2] in (b'\xff\xfe',b'\xfe\xff') else raw.decode('utf-8-sig')
recipes=collections.defaultdict(list); recipe_inputs={}; trade={}; skill_count=collections.defaultdict(collections.Counter)
for r in json.loads(txt)['Recipes']:
    if r.get('Name') and r['Name'] not in recipes[r['Type']]: recipes[r['Type']].append(r['Name'])
    ids=[int(x) for x in re.findall(r"'ID': (\d+)", str(r.get('input') or ''))]
    recipe_inputs[str(r['ID'])]=[r.get('Name') or '', r.get('Type') or '', sorted(set(ids))]
    if r.get('Type')!='Debug' and r.get('output'):   # amounts, outputs, time and fail chance for the Trade panel (profit at real shop prices)
        kv=lambda l:[[x['Key']['ID'],x['Value']] for x in l or []]
        tk=str(r['ID'])
        while tk in trade: tk=str(int(tk)+1000000)   # the game reuses an ID for two recipes
        trade[tk]=[r.get('Name') or '', r.get('Type') or '', r.get('ProcessTime',0), r.get('FailChance',0), kv(r.get('input')), kv(r.get('output')), r.get('RelevantSkill') or 'None', r.get('SkillFactor',1), (r.get('metaSettings') or {}).get('qualityFactor',1), (r.get('metaSettings') or {}).get('fixedQuality',0) if (r.get('metaSettings') or {}).get('useFixedQuality') else 0, 1 if (r.get('metaSettings') or {}).get('useAmmoAsInput') else 0, r.get('MinimumSkill',0), kv(r.get('outputFail'))]
    if r.get('RelevantSkill') and r['RelevantSkill']!='None': skill_count[r['Type']][r['RelevantSkill']]+=1
# growing / breeding recipes make a live plant or animal item worth nothing: swap it for what it yields when harvested (average amount; tools/extract_grow.py)
GROW={int(k):v for k,v in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'grow_yield.json'))).items()}
for t in trade.values():
    for pos in (5,12):
        o={}
        for oid,n in t[pos]:
            if oid in GROW:
                for yid,lo,hi in GROW[oid]: o[yid]=o.get(yid,0)+n*(lo+hi)/2
            else: o[oid]=o.get(oid,0)+n
        t[pos]=[[k,round(v,3)] for k,v in o.items()]
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
        if f.get('power'):   # [5]: power / fuel / equipment quality of each machine in it: [kind(0 electric,1 combustion,2 kinetic), watts used, idle watts (-1 none), needs fuel, fuel categories, liquid fuel, watts made, plugs into grid, upgrade slots, equipment quality]
            furniture[str(furn_ids[t])].append([[e.get('kind',0), e.get('use',0), e.get('idle',-1), 1 if e.get('fuel') else 0, e.get('fuels') or [], 1 if e.get('liquid') else 0, e.get('gen',0), 1 if e.get('grid') else 0, e.get('maxUp') or 0, round(e.get('quality') or 1, 2)] for e in f['power']])
    return furn_ids[t]

names={}
if site:
    raw_idx=open(os.path.join(site,'data','index.js'),encoding='utf-8').read()
    for sc in json.loads(raw_idx[raw_idx.index('{'):raw_idx.rindex('}')+1])['scenes']: names[sc['scene']]=sc['name']
TRASH={'Dumpster','TrashBin','Trashcan','Trash','Trash Machineshop','Trash Organic','TrashBale','CrateSack','CrateSackMines'}
OWNER_PLACEHOLDER={'','name','default male','default female','player'}
S={}; need=set(); used_stock=set()
MARKETS=json.load(open(os.path.join(ext_dir,'markets.json'))) if os.path.exists(os.path.join(ext_dir,'markets.json')) else {}
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
        if p.get('guid'): e['g']=p['guid']   # for Scavenger's "searched today"
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
        e=dict(to=f['to'],n=names.get(f['to']) or f.get('title') or f['to'],x=f['x'],y=f['y'],z=f['z'],open=1 if f['to'] in scenes else 0)
        if f.get('lock'): e['lk']=f['lock']
        if f.get('diff') is not None: e['df']=f['diff']
        D.append(e)
    # doors inside the building (with their lock) and stairs / ladders / elevator stops
    ID=[dict(x=round(f['x'],1),y=round(f['y'],1),z=round(f['z'],1),**({'lk':f['lock']} if f.get('lock') else {}),**({'df':f['diff']} if f.get('diff') is not None else {}))
        for f in fe['features'] if f['kind']=='idoor' and f.get('active') and not (f['x']==0 and f['z']==0)]
    VT=[dict(k=f['sub'][0],x=round(f['x'],1),y=round(f['y'],1),z=round(f['z'],1)) for f in fe['features'] if f['kind']=='vert']
    VT+=[dict(k='w',x=round(f['x'],1),y=round(f['y'],1),z=round(f['z'],1)) for f in fe['features'] if f['kind']=='wood' and f.get('active')]   # tree debris (wood piles)
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
        if f.get('packages'):
            e['pk']=[t for t in f['packages'] if t in loot]
            for t in e['pk']: used_stock.add(t); need.update(loot[t][0]); need.update(loot[t][1])
        if f.get('trader'):
            e['b']=1
            if f.get('hours'): e['h']=f['hours']
            if f.get('sellMult') is not None: e['sm']=f['sellMult']
            if f.get('buyMult') is not None: e['bm']=f['buyMult']
            if f.get('fixedPrices'): e['fp']=1
            if f.get('sellMode')==0: e['sr']=1   # the shop pays you in Real Money (Trade.sellPriceMode = OnlyRM)
            if f.get('buyMode')==0: e['br']=1    # you pay the shop in Real Money (Trade.purchasePriceMode = OnlyRM)
            if f.get('buyAllow'): e['ba']=f['buyAllow']
            if f.get('buyForbid'): e['bf']=f['buyForbid']
            if f.get('buysStolen'): e['bs']=1
        if 't' in e or 'i' in e or 'b' in e or 'pk' in e: V.append(e)
    # self-service markets (take from the shelves, pay at the register): they sell what their shelves can hold, at value x the market's price factor
    for m in MARKETS.get(str(i),{}).get('markets',[]):
        if not m.get('active'): continue
        ids=set()
        for p in P:
            if p.get('s')==1: continue   # a locked / owned stock room, not the shelves
            if p.get('t') in loot: ids.update(loot[p['t']][0]); ids.update(loot[p['t']][1])
            ids.update(p.get('f') or [])
        ids={x for x in ids if x and x>0}   # 0 = an empty shelf slot
        near=next((v for v in V if (v['x']-m['x'])**2+(v['z']-m['z'])**2<15**2 and ('t' in v or 'i' in v or 'b' in v)), None)
        if near and not m.get('currency')==1:   # the market is already a shop of its own (a trader): add what its shelves hold
            if ids: near['i']=sorted(set(near.get('i',[]))|ids); need.update(ids)
            continue
        e=dict(n=m.get('name') or names.get(name,name),x=m['x'],y=m['y'],z=m['z'],bm=m['factor'],mk=1)
        if m.get('currency')==1: e['rm']=1
        if ids: e['i']=sorted(ids); need.update(ids)
        V.append(e)
    mk=None
    if fe.get('map') and fe['map'].get('sprite'): mk=fe['map']['sprite'][1]
    if P or F or V or D:
        S[name]=dict(name=names.get(name,name),map=mk,points=P,stations=F,doors=D,vendors=V,idoors=ID,verts=VT,
                     free=sum(1 for p in P if not p.get('s')),steal=sum(1 for p in P if p.get('s')))
used=set(t for s in S.values() for t in [p.get('t') for p in s['points']] if t)|used_stock
for t in used_stock: need.update(loot[t][0]); need.update(loot[t][1])
for r in recipe_inputs.values(): need.update(r[2])
for r in trade.values(): need.update(x[0] for x in r[4]+r[5])
# containers a liquid can be sold in: [id, liters it holds, liquid value factor, own value]; a filled one is worth its own value + liters x liquid value x factor
containers=[]
for it in json.load(open(os.path.join(SA,'Items.json'),encoding='utf-8-sig')):
    for m in it.get('Meta') or []:
        if isinstance(m,dict) and str(m.get('$type','')).endswith('ItemLiquidData') and m.get('liquidMaxAmount',0)>=1:
            containers.append([it['ID'],m['liquidMaxAmount'],m.get('liquidValueFactor',1),it.get('BaseValue',0)]); need.add(it['ID'])
for _k in fa['furniture']: fid(_k)   # also the pieces no shop sells (hydroponic farms, growing racks, decorations): the website lists every piece
data=dict(version=7,containers=containers,furniture=furniture,typeSkills=type_skills,recipeInputs=recipe_inputs,trade=trade,scenes=S,loot={k:v for k,v in loot.items() if k in used},
          items={str(k):v for k,v in items.items()},recipes=recipes)
os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
json.dump(data,open(out,'w',encoding='utf-8'),separators=(',',':'),ensure_ascii=False)
print(len(furniture),'furniture;',sum(1 for s in S.values() for v in s['vendors'] if 'fs' in v or 'fb' in v),'furniture shops;',sum(len(s['vendors']) for s in S.values()),'vendors',sum(len(s['doors']) for s in S.values()),'doors;',len(S),'scenes',sum(len(s['points']) for s in S.values()),'points',sum(len(s['stations']) for s in S.values()),'stations',os.path.getsize(out)//1024,'KB')

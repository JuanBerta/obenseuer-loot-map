"""Combine extracted scene JSON + navmeshes + loot tables + landmarks into site data/.
Usage: python build_data.py <Obenseuer_Data dir> <extract out dir> <site dir>"""
import sys, os, json, glob, re, shutil, collections
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import nav
data_dir, ext_dir, site = sys.argv[1:4]
SA=os.path.join(data_dir,'StreamingAssets')
dd=os.path.join(site,'data')
for sub in ('scenes','maps','icons'): os.makedirs(os.path.join(dd,sub),exist_ok=True)
slugify=lambda n: re.sub(r'[^a-z0-9]+','-',n.lower()).strip('-')

items={}
for it in json.load(open(os.path.join(SA,'Items.json'),encoding='utf-8-sig')):
    items[it['ID']]=[it['Title'],it.get('BaseValue',0)]
loot={}
for c in json.load(open(os.path.join(SA,'StorageSpawnCategory.json'),encoding='utf-8-sig'))['$content']:
    loot[c['Name']]=dict(id=c['ID'],common=c.get('ItemCommon') or [],rare=c.get('ItemRare') or [])
navs={os.path.splitext(os.path.basename(f))[0]:f for f in glob.glob(os.path.join(SA,'NavigationData','*.nav'))}
scenes_all=json.load(open(os.path.join(ext_dir,'scenes_index.json')))
lv=lambda f:int(re.findall(r'\d+',os.path.basename(f))[0])
levels=sorted([f for f in glob.glob(os.path.join(ext_dir,'level*.json')) if re.fullmatch(r'level\d+\.json',os.path.basename(f))],key=lv)
SKIP=lambda n: n in ('Main Menu','Open Sewer Intro') or n.startswith('Test Map')
feat={lv(f):json.load(open(f)) for f in glob.glob(os.path.join(ext_dir,'level*_feat.json'))}
present={scenes_all[lv(f)] for f in levels if not SKIP(scenes_all[lv(f)])}

# ---- maps (in-game map textures)
maps={}
def map_key(mi):
    if not mi or not mi.get('sprite'): return None
    name=mi['sprite'][1]; key='tenement' if 'tenement' in name else 'mines' if 'mines' in name else slugify(name)
    if key not in maps:
        npy=os.path.join(ext_dir,'map_'+name+'.npy')
        if not os.path.exists(npy): return None
        import numpy as np, cv2
        img=np.load(npy); cv2.imwrite(os.path.join(dd,'maps',key+'.jpg'),cv2.cvtColor(img,cv2.COLOR_RGB2BGR),[cv2.IMWRITE_JPEG_QUALITY,85])
        span=mi['radius']*mi['sx']
        maps[key]=dict(img='data/maps/%s.jpg'%key,x0=round(mi['cx']-span/2,3),z1=round(mi['cz']+span/2,3),span=span,px=img.shape[1])
    return key

# ---- friendly names from door signs
GENERIC={'','door','shack','barrack','house','storage','office','makeshift house','cave','hatch','roof','bazaar','mines','van','tunnel'}
signs=collections.defaultdict(collections.Counter); entr=collections.defaultdict(list)
for i,f in feat.items():
    src=scenes_all[i]
    if SKIP(src): continue
    for d in f['features']:
        if d['kind']!='door': continue
        t=(d.get('title') or '').strip()
        w=3 if src.startswith('Open Sewer') else 1
        if t.lower() not in GENERIC: signs[d['to']][t]+=w
        if src.startswith('Open Sewer') and d['to']!=src: entr[d['to']].append((src,d['x'],d['z']))
OVERRIDE={'Open Sewer Bazaar':'Bazaar streets','Open Sewer Tenement':'Tenement streets','Open Sewer Mines':'Mine tunnels & claims',
          'Open Sewer Metro':'Metro','Under Map':'Underground tunnels','Interior Player Tenement':'Your Tenement',
          'Interior Start':'Border Checkpoint','Interior Tenement Speakeasy':'Speakeasy (Tenement A basement)',
          'Interior City Gates':'City Gates','Interior Tenement Player Canal Saunas':'Canal Saunas',
          'Interior Tenement Deekula Mine Entrance':'Deekula basement / mine entrance','Interior Bazaar Inn':'Sewerview Inn',
          'Interior Bazaar Pontikka Roof':'Pontikka — roof','Interior Bazaar Kino':'Kino',
          'Interior Bazaar Clock Tower':'Clock Tower & maintenance tunnels','Interior Bazaar Chamber of Commerce':'Chamber of Commerce',
          'Interior Bazaar Mine':'Ore Refinery & smelter'}
def suffix(n): return re.sub(r'^(Interior (Tenement |Bazaar |Mines )?|Open Sewer )','',n)
def friendly(n):
    if n in OVERRIDE: return OVERRIDE[n]
    c=signs.get(n)
    if c:
        t=c.most_common(1)[0][0]
        if re.search(r'\d$',suffix(n)) and not re.search(r'\d$',t) and t.lower() in ('shack','barrack','break room','electrical room','office','makeshift house','house'):
            return suffix(n)
        return t
    s=suffix(n)
    s=re.sub(r'LotShack(\d)',r'Lot Shack \1',s); s=re.sub(r'House(\d)',r'House \1',s)
    return s
def group(n,mk):
    if n.startswith('Open Sewer Mines') or 'Mines' in n.split()[:2] or n=='Interior City Gates': return 'Mines'
    if n.startswith('Open Sewer Bazaar') or n.startswith('Interior Bazaar'): return 'Bazaar'
    if n.startswith('Open Sewer Tenement') or n.startswith('Interior Tenement') or n in ('Interior Start','Interior Player Tenement'): return 'Tenement'
    return 'Elsewhere'

# ---- landmarks
lms=[]; icondir=os.path.join(ext_dir,'icons')
if os.path.isdir(icondir):
    for f in os.listdir(icondir): shutil.copy(os.path.join(icondir,f),os.path.join(dd,'icons',f))
for l in json.load(open(os.path.join(ext_dir,'landmarks.json'))) if os.path.exists(os.path.join(ext_dir,'landmarks.json')) else []:
    if l['icon'] in ('invisible.png','transparent.png'): l['icon']=None
    lms.append(dict(t=l['title'],x=l['x'],y=l['y'],z=l['z'],w=l['w'],h=l['h'],icon=('data/icons/'+l['icon']) if l['icon'] else None,
                    map='tenement' if l['y']>-105 else 'mines'))

index=[]; used=set(); need=set(); stypes={}
for f in levels:
    d=json.load(open(f)); name=d['scene']; i=d['level']
    if SKIP(name): continue
    pts=d['points']; slug=slugify(name)
    V={}; verts=[]; tris=[]
    if name in navs:
        for vs,tr in nav.load(navs[name]):
            loc=[]
            for k in range(0,len(vs),3):
                key=(round(vs[k]/100),round(vs[k+1]/100),round(vs[k+2]/100))
                if key not in V: V[key]=len(verts); verts.append(key)
                loc.append(V[key])
            for k in range(0,len(tr),3):
                a,b,c=loc[tr[k]],loc[tr[k+1]],loc[tr[k+2]]
                if a!=b and b!=c and a!=c: tris+=[a,b,c]
    cf=os.path.join(ext_dir,'level%d_col.json'%i)
    col=json.load(open(cf)) if os.path.exists(cf) else []
    def small(c):
        xs=c[2::2]; zs=c[3::2]; w=(max(xs)-min(xs))/10; h=(max(zs)-min(zs))/10
        return not (w>25 and h>25) and w*h<900
    col=[c for c in col if small(c)]
    fe=feat.get(i,{'features':[],'map':None}); mk=map_key(fe['map'])
    feats=[]
    for x in fe['features']:
        if x['x']==0 and x['z']==0: continue
        if x['kind'] not in ('door','station') and any(f['kind']==x['kind'] and abs(f['x']-x['x'])<1.5 and abs(f['z']-x['z'])<1.5 and abs(f['y']-x['y'])<1.5 for f in feats): continue
        if x['kind']=='door':
            if x['to']==name: continue
            x=dict(x,toName=friendly(x['to']) if x['to'] in present else (x.get('title') or suffix(x['to'])),
                   toSlug=slugify(x['to']) if x['to'] in present else None)
        feats.append(x)
    out=dict(scene=name,slug=slug,nav=dict(v=[c for v in verts for c in v],t=tris),col=col,points=pts,features=feats)
    with open(os.path.join(dd,'scenes',slug+'.js'),'w') as fh:
        fh.write('window.__scene('+json.dumps(out,separators=(',',':'))+');')
    cats={}
    for p in pts:
        if p.get('category') and p.get('active'): cats[p['category']]=cats.get(p['category'],0)+1; used.add(p['category'])
        need.update(p.get('customItems',[])); need.update(p.get('startItems',[]))
    ent=entr.get(name,[])
    parent=collections.Counter(e[0] for e in ent).most_common(1)
    stations={}
    for x in feats:
        if x['kind']=='station' and x.get('title') and x.get('active'):
            stations[x['title']]=stations.get(x['title'],0)+1; stypes.setdefault(x['title'],sorted(set(x.get('types') or [])))
    index.append(dict(stations=stations,safe=sum(1 for p in pts if p.get('active') and not p.get('steal') and (p['kind']=='pickup' or p.get('category') in loot)),
        steal=sum(1 for p in pts if p.get('active') and p.get('steal') and (p['kind']=='pickup' or p.get('category') in loot)),scene=name,slug=slug,name=friendly(name),group=group(name,mk),map=mk,outdoor=name.startswith('Open Sewer') or name=='Under Map',
        lootContainers=sum(1 for p in pts if p['kind']=='container' and p.get('category') in loot and p.get('active')),
        lootPickups=sum(1 for p in pts if p['kind']=='pickup' and p.get('active')),
        cats=cats,parent=slugify(parent[0][0]) if parent and not name.startswith('Open Sewer') else None,
        entrances=[[round(e[1],1),round(e[2],1)] for e in ent if parent and e[0]==parent[0][0]][:6]))
for c in used:
    if c in loot: need.update(loot[c]['common']); need.update(loot[c]['rare'])
meta=json.load(open(os.path.join(ext_dir,'meta.json'))) if os.path.exists(os.path.join(ext_dir,'meta.json')) else {}
recipes=collections.defaultdict(list)
try:
    raw=open(os.path.join(SA,'Recipes.json'),'rb').read()
    txt=raw.decode('utf-16') if raw[:2] in (b'\xff\xfe',b'\xfe\xff') else raw.decode('utf-8-sig')
    for r in json.loads(txt)['Recipes']:
        if r.get('Name') and r['Name'] not in recipes[r['Type']]: recipes[r['Type']].append(r['Name'])
except Exception as e: print('recipes skipped',e)
idx=dict(stationTypes=stypes,recipes={k:sorted(v) for k,v in recipes.items()},meta=meta,scenes=index,maps=maps,landmarks=lms,loot=loot,items={i:items[i] for i in need if i in items})
with open(os.path.join(dd,'index.js'),'w') as fh:
    fh.write('window.OBS_INDEX='+json.dumps(idx,separators=(',',':'))+';')
print(len(index),'scenes;',len(lms),'landmarks;',len(maps),'maps;',len(idx['items']),'items')

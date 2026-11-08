"""Extract loot container / pickup spot positions from Obenseuer scene files.
Usage: python extract.py <Obenseuer_Data dir> <out dir> [level indices...]"""
import sys, os, json, math, struct
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import usf, ser, nav

def qmat(q):
    x,y,z,w=q
    return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
            [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
            [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
def compose(parent,t):
    # parent=(M3x3 incl scale, pos); t=(q,p,s)
    PM,PP=parent; q,p,s=t
    R=qmat(q)
    L=[[R[i][j]*s[j] for j in range(3)] for i in range(3)]
    M=[[sum(PM[i][k]*L[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    P=[PP[i]+sum(PM[i][k]*p[k] for k in range(3)) for i in range(3)]
    return M,P
ID=([[1,0,0],[0,1,0],[0,0,1]],[0,0,0])

def scene(sf):
    gos={}; trs={}
    for pid,(o,sz,c) in sf.objs.items():
        if c==1:
            r=sf.reader(pid); n=r.i32(); comps=[r.pptr() for _ in range(n)]
            r.u32(); name=r.str(); r.u16(); act=r.u8()
            gos[pid]=dict(name=name,active=bool(act),comps=[p for f,p in comps if f==0])
        elif c in (4,224):
            r=sf.reader(pid); go=r.pptr(); q=r.fs(4); p=r.fs(3); s=r.fs(3)
            n=r.i32(); [r.pptr() for _ in range(n)]; fa=r.pptr()
            trs[pid]=dict(go=go[1],q=q,p=p,s=s,father=fa[1] if fa[0]==0 else 0)
    go2tr={t['go']:pid for pid,t in trs.items()}
    world={}
    def W(tp):
        if tp in world: return world[tp]
        t=trs[tp]; par=W(t['father']) if t['father'] in trs else ID
        world[tp]=compose(par,(t['q'],t['p'],t['s'])); return world[tp]
    def path_of(gop):
        names=[]; act=True; tp=go2tr.get(gop)
        while tp in trs:
            g=gos.get(trs[tp]['go'])
            if g: names.append(g['name']); act=act and g['active']
            tp=trs[tp]['father']
        return '/'.join(reversed(names)), act
    return gos,trs,go2tr,W,path_of

def own(o):
    x=o.get('StorageOwner') or o.get('owner') or {}
    return x.get('name') or None
def steal(o):
    # Same rule the game uses for its "steal" use-text: an owner ID is set and taking is not permitted.
    x=o.get('StorageOwner') or o.get('owner') or {}
    perm=o.get('PermissionToTake', o.get('permissionToTake', False))
    return (x.get('ID') or 0) > 1 and not perm   # Storage.UpdateUseMessage: owner.ID > 1 && !PermissionToTake

def items_of(lst):
    out=[]
    for it in lst or []:
        if not isinstance(it,dict): continue
        iid=None
        for k in ('itemID','ID','id','itemId','item'):
            if isinstance(it.get(k),int): iid=it[k]; break
        if iid is None:
            for v in it.values():
                if isinstance(v,dict):
                    for k in ('itemID','ID','id'):
                        if isinstance(v.get(k),int): iid=v[k]; break
        if iid is not None: out.append(iid)
    return out

def process(data_dir, idx, scenes):
    sf=usf.load("level%d"%idx)
    gos,trs,go2tr,W,path_of=scene(sf)
    pts=[]; errs=0
    vendor_gos=set()
    for pid,(o,sz,c) in sf.objs.items():
        if c!=114: continue
        r,go,sc,nm=usf.mb_head(sf,pid); sn=usf.script_name(sf,sc)
        if sn and sn[2] in ('Trade','VendingMachine'): vendor_gos.add(go[1])
    for pid,(o,sz,c) in sf.objs.items():
        if c!=114: continue
        r,go,sc,nm=usf.mb_head(sf,pid)
        sn=usf.script_name(sf,sc)
        if not sn or sn[0]!='Assembly-CSharp' or sn[2] not in ('Storage','CollectibleItemSpawner'): continue
        if sn[2]=='Storage' and go[1] in vendor_gos: continue   # a shop's hidden stock, not loot
        try: _,d,left=ser.read_mb(sf,pid,'Assembly-CSharp',sn[2])
        except Exception as e: errs+=1; print('  parse error',e); continue
        if left!=0: errs+=1
        g=gos.get(go[1],{}); tp=go2tr.get(go[1])
        M,P=W(tp) if tp else ID
        path,act=path_of(go[1])
        yaw=math.degrees(math.atan2(M[0][2],M[2][2]))
        e=dict(kind='container' if sn[2]=='Storage' else 'pickup', name=g.get('name',''), path=path, active=act,
               x=round(P[0],2), y=round(P[1],2), z=round(P[2],2), yaw=round(yaw),
               category=d.get('itemSpawnCategory') or None, owner=own(d), steal=steal(d))
        if sn[2]=='Storage':
            lk=d.get('_Lock') or {}
            e.update(type=d.get('StorageSettings') or None, title=d.get('title') or None,
                     fromCategory=bool(d.get('spawnItemsFromCategory')),
                     locked=bool(lk.get('Locked')), lockpickable=bool(lk.get('Lockpickable')),
                     difficulty=lk.get('Difficulty') if lk.get('Locked') else None,
                     respawn=bool((d.get('spawnSettings') or {}).get('respawnEnabled')),
                     common=d.get('spawnChanceForCommonItems'), rare=d.get('spawnChanceForRareItems'),
                     customItems=items_of(d.get('customItemsToSpawn')), startItems=items_of(d.get('startItems')))
            if not e['fromCategory']: e['category']=None
        else:
            e.update(customItems=items_of(d.get('customItemsToSpawn')), rareChance=d.get('rareItemSpawnChance'))
        pts.append({k:v for k,v in e.items() if v not in (None,[],'') and not (k=='steal' and v is False)})
    return pts, errs

_meshbb={}
def mesh_aabb(sf,pp):
    fid,pid=pp
    fname=os.path.basename(sf.path) if fid==0 else sf.ext[fid-1]
    k=(fname,pid)
    if k not in _meshbb:
        f=usf.load(fname); bb=None
        if f and pid in f.objs:
            r=f.reader(pid); r.str(); n=r.i32(); mn=[1e9]*3; mx=[-1e9]*3
            for _ in range(n):
                r.p+=24; c=r.fs(3); e=r.fs(3)
                for i in range(3): mn[i]=min(mn[i],c[i]-e[i]); mx[i]=max(mx[i],c[i]+e[i])
            if n: bb=([(a+b)/2 for a,b in zip(mn,mx)],[(b-a)/2 for a,b in zip(mn,mx)])
        _meshbb[k]=bb
    return _meshbb[k]

def hull(pts):
    pts=sorted(set(pts))
    if len(pts)<3: return pts
    def cr(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[];up=[]
    for p in pts:
        while len(lo)>=2 and cr(lo[-2],lo[-1],p)<=0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up)>=2 and cr(up[-2],up[-1],p)<=0: up.pop()
        up.append(p)
    return lo[:-1]+up[:-1]

def colliders(sf):
    gos,trs,go2tr,W,path_of=scene(sf)
    out=[]
    for pid,(o,sz,c) in sf.objs.items():
        if c not in (65,64): continue
        r=sf.reader(pid); go=r.pptr(); r.pptr(); r.p+=12; trig=r.u8(); r.u8(); r.align(); en=r.u8(); r.align()
        if trig or not en: continue
        if c==65: size=r.fs(3); cen=r.fs(3); ext=[s/2 for s in size]
        else:
            r.u8(); r.align(); r.i32(); mp=r.pptr()
            bb=mesh_aabb(sf,mp)
            if not bb: continue
            cen,ext=bb
        tp=go2tr.get(go[1])
        if tp is None: continue
        path,act=path_of(go[1])
        if not act: continue
        M,P=W(tp)
        pts=[]; ys=[]
        for sx in (-1,1):
            for sy in (-1,1):
                for sz_ in (-1,1):
                    l=[cen[0]+sx*ext[0],cen[1]+sy*ext[1],cen[2]+sz_*ext[2]]
                    w=[P[i]+sum(M[i][k]*l[k] for k in range(3)) for i in range(3)]
                    pts.append((round(w[0]*10),round(w[2]*10))); ys.append(w[1])
        h=hull(pts)
        if len(h)<3: continue
        xs=[p[0] for p in h]; zs=[p[1] for p in h]
        if max(xs)-min(xs)<3 and max(zs)-min(zs)<3: continue
        if max(xs)-min(xs)>4000 or max(zs)-min(zs)>4000: continue
        out.append([round(min(ys)*10),round(max(ys)*10)]+[v for p in h for v in p])
    return out

OUT='.'
FEATURE_SCRIPTS={'DoorChangelevel':'door','Changelevel':'door','Sleep':'bed','Toilet':'toilet','ToiletBucket':'toilet',
                 'VendingMachine':'vending','Phone':'phone','Mailbox':'mailbox',
                 'manufacturing':'station','Generator':'generator','GrowingSpot':'grow','Autofarm':'grow',
                 'AnimalBreeder':'breeder','LiquidStorage':'water','InteractableShower':'shower','SaunaCooling':'sauna',
                 'BottleRecyclingDrop':'recycling','Radio':'radio'}
RECIPE_TYPES={}
PLACEHOLDER_OWNERS={'','name','default male','default female','default owner','none'}
def _recipe_types():
    if not RECIPE_TYPES:
        a=ser.asm('Assembly-CSharp'); ti=a.find_type('RecipeType'); consts={}
        for i in range(1,a.rows[0xb]+1):
            typ,par,val=a.row(0xb,i)
            if par&3==0: consts[par>>2]=a.blob(val)
        for j,f,nm,sig in a.fields(ti):
            if j in consts: RECIPE_TYPES[struct.unpack('<i',consts[j][:4])[0]]=a.str(nm)
    return RECIPE_TYPES
def features(sf):
    gos,trs,go2tr,W,path_of=scene(sf)
    out=[]; mapinfo=None; vend=[]
    for pid,(o,sz,c) in sf.objs.items():
        if c!=114: continue
        r,go,sc,nm=usf.mb_head(sf,pid); sn=usf.script_name(sf,sc)
        if not sn or sn[0]!='Assembly-CSharp': continue
        cls=sn[2]
        if cls=='info_map':
            _,d,_=ser.read_mb(sf,pid,'Assembly-CSharp','info_map')
            M,P=W(go2tr[go[1]]); spn=None; sp=d['mapImage']
            if sp[2]:
                fn=os.path.basename(sf.path) if sp[1]==0 else sf.ext[sp[1]-1]
                f=usf.load(fn)
                if f and sp[2] in f.objs: spn=[fn,f.reader(sp[2]).str()]
            mapinfo=dict(sprite=spn,cx=P[0],cz=P[2],radius=d['mapRadius'],sx=M[0][0],sz=M[2][2])
            continue
        if cls in ('Trade','VendingMachine'):
            vend.append((cls,pid,go)); continue
        if cls not in FEATURE_SCRIPTS: continue
        kind=FEATURE_SCRIPTS[cls]
        upto={'door':'OtherEntrypoint','station':'Recipes','bed':'owner','water':'PermissionToTake'}.get(kind,'m_useMessage')
        try: _,d,_=ser.read_mb(sf,pid,'Assembly-CSharp',cls,upto=upto)
        except Exception:
            if kind=='door': continue
            d={}
        tp=go2tr.get(go[1])
        if tp is None: continue
        path,act=path_of(go[1])
        M,P=W(tp)
        e=dict(kind=kind,title=(d.get('title') or '').strip() or None,
               x=round(P[0],2),y=round(P[1],2),z=round(P[2],2),active=act)
        if kind=='station':
            e['title']=(d.get('ManuName') or d.get('title') or '').strip() or None
            e['types']=[_recipe_types().get(x,str(x)) for x in (d.get('Recipes') or [])]
        if kind=='station':
            try: _,d2,_=ser.read_mb(sf,pid,'Assembly-CSharp',cls,upto='PermissionToTake'); d.update(d2)
            except Exception: pass
        if kind=='bed':
            if d.get('safe'): e['safe']=True
            if d.get('canBeArrested'): e['arrest']=True
        if kind in ('station','bed','water'):
            o=d.get('owner') or d.get('StorageOwner') or {}
            ow=(o.get('name') or '').strip()
            if (o.get('ID') or 0) > 1 and not d.get('PermissionToTake'):
                e['owned']=True
                if ow.lower() not in PLACEHOLDER_OWNERS: e['owner']=ow
        if e['kind']=='door':
            e['to']=d.get('OtherLevel') or None
            if not e['to']: continue
        out.append({k:v for k,v in e.items() if v is not None})
    # vendors: Trade (stock = loot table of the Storage on the same object) and VendingMachine (fixed list)
    stock={}
    for pid,(o,sz,c) in sf.objs.items():
        if c!=114: continue
        r,go,sc,nm=usf.mb_head(sf,pid); sn=usf.script_name(sf,sc)
        if sn and sn[2]=='Storage' and go[1] in {v[2][1] for v in vend}:
            try:
                _,d,_=ser.read_mb(sf,pid,'Assembly-CSharp','Storage')
                if d.get('spawnItemsFromCategory') and d.get('itemSpawnCategory'): stock[go[1]]=d['itemSpawnCategory']
            except Exception: pass
    for cls,pid,go in vend:
        tp=go2tr.get(go[1])
        if tp is None: continue
        path,act=path_of(go[1]); M,P=W(tp)
        e=dict(kind='vendor',x=round(P[0],2),y=round(P[1],2),z=round(P[2],2),active=act)
        try:
            if cls=='Trade':
                _,d,_=ser.read_mb(sf,pid,'Assembly-CSharp','Trade',upto='sharedId')
                e['title']=(d.get('title') or '').strip() or None
                ow=(d.get('owner') or {}).get('name') or ''
                if ow.strip().lower() not in PLACEHOLDER_OWNERS: e['owner']=ow.strip()
                if go[1] in stock: e['stock']=stock[go[1]]
            else:
                _,d,_=ser.read_mb(sf,pid,'Assembly-CSharp','VendingMachine',upto='sellableItems')
                e['title']=(d.get('title') or '').strip() or None
                ow=(d.get('Trader') or {}).get('name') or ''
                if ow.strip().lower() not in PLACEHOLDER_OWNERS: e['owner']=ow.strip()
                items=[]
                for it in d.get('sellableItems') or []:
                    iid=(it.get('item') or {}).get('ID')
                    if iid is not None and iid not in items: items.append(iid)
                e['items']=items
        except Exception as ex:
            continue
        if not e.get('stock') and not e.get('items'): continue
        out.append({k:v for k,v in e.items() if v is not None})
    return out,mapinfo

def landmarks(data_dir):
    import glob
    out=[]
    for f in sorted(glob.glob(os.path.join(data_dir,'*.assets'))):
        fn=os.path.basename(f); s=usf.load(fn)
        for p in s.of(114):
            try:
                r,go,sc,nm=usf.mb_head(s,p); n=usf.script_name(s,sc)
            except Exception: continue
            if n and n[2]=='Landmark':
                _,d,_=ser.read_mb(s,p,'Assembly-CSharp','Landmark')
                pos=d['position']; icon=None
                if d.get('image') and d['image'][2]:
                    try:
                        import tex, cv2, re
                        nm_,img=tex.sprite(s,d['image'])
                        icon=re.sub(r'[^a-z0-9]+','-',nm_.lower()).strip('-')+'.png'
                        os.makedirs(os.path.join(OUT,'icons'),exist_ok=True)
                        cv2.imwrite(os.path.join(OUT,'icons',icon),cv2.cvtColor(img,cv2.COLOR_RGBA2BGRA))
                    except Exception as e: print('  icon failed',d.get('title'),e)
                out.append(dict(icon=icon,id=d.get('id'),title=d.get('title'),x=round(pos[0],2),y=round(pos[1],2),z=round(pos[2],2),
                                w=d.get('width') or 0,h=d.get('height') or 0,priority=d.get('priority')))
        usf._cache.pop(fn,None)
    return out

if __name__=='__main__':
    import datetime
    data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]; os.makedirs(out,exist_ok=True); OUT=out
    usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep
    g=usf.load('globalgamemanagers'); r=g.reader(g.of(141)[0]); n=r.i32()
    scenes=[os.path.splitext(os.path.basename(r.str()))[0] for _ in range(n)]
    json.dump(dict(extracted=datetime.date.today().isoformat(),unity=g.uver),open(os.path.join(out,'meta.json'),'w'))
    idxs=[int(x) for x in sys.argv[3:]] or range(len(scenes))
    for i in idxs:
        pts,errs=process(data_dir,i,scenes)
        json.dump(dict(scene=scenes[i],level=i,points=pts),open(os.path.join(out,'level%d.json'%i),'w'))
        fe,mi=features(usf.load('level%d'%i))
        json.dump(dict(features=fe,map=mi),open(os.path.join(out,'level%d_feat.json'%i),'w'))
        col=colliders(usf.load('level%d'%i))
        json.dump(col,open(os.path.join(out,'level%d_col.json'%i),'w'),separators=(',',':'))
        print('%3d %-45s %5d loot points %6d colliders%s'%(i,scenes[i],len(pts),len(col),'  (%d parse errors)'%errs if errs else ''),flush=True)
        usf._cache.pop('level%d'%i,None)
    if not sys.argv[3:]:
        import subprocess
        subprocess.check_call([sys.executable,os.path.join(HERE,'finish.py'),data_dir,out])

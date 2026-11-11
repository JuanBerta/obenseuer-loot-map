import sys,os,glob,json; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import usf,ser
usf.D=os.path.abspath(sys.argv[1]).rstrip('/\\')+os.sep; ser.M=os.path.join(usf.D,'Managed')+os.sep
furn={}; lists={}; errs=0
files=[os.path.basename(f) for f in sorted(glob.glob(usf.D+'*.assets'))]
for fn in files:
    s=usf.load(fn)
    for p in s.of(114):
        try: r,go,sc,nm=usf.mb_head(s,p); n=usf.script_name(s,sc)
        except Exception: continue
        if not n: continue
        cls=n[2]
        if cls in ('Furniture','FurnitureSurface'):
            try:
                _,d,_=ser.read_mb(s,p,'Assembly-CSharp',cls,upto='priceRM')
                furn[f'{fn}:{p}']=dict(id=d.get('id'),title=d.get('title') or nm,cat=d.get('category'),oc=d.get('priceOC'),rm=d.get('priceRM'),asset=nm)
            except Exception as e: errs+=1
        elif cls=='FurnitureShopItemsList':
            try:
                _,d,_=ser.read_mb(s,p,'Assembly-CSharp',cls,upto='furnitures')
                refs=[]
                for pp in d.get('furnitures') or []:
                    fid,pid=pp[1],pp[2]
                    if not pid: continue
                    rf=fn if fid==0 else s.ext[fid-1]
                    refs.append(f'{rf}:{pid}')
                lists[f'{fn}:{p}']=dict(name=nm,furn=refs)
            except Exception as e: errs+=1; print('list err',nm,e)
    usf._cache.pop(fn,None)
json.dump(dict(furniture=furn,lists=lists),open(os.path.join(sys.argv[2],'furniture_assets.json'),'w'))
print(len(furn),'furniture',len(lists),'lists',errs,'errors')

# ---- which crafting station (recipe types) each furniture prefab contains -------------------------
# Furniture.prefab -> prefab root GameObject; find 'manufacturing' components in that prefab's hierarchy.
types_by_root={}
def recipe_types():
    import dotnet, struct
    a=ser.asm('Assembly-CSharp'); ti=a.find_type('RecipeType'); consts={}
    for i in range(1,a.rows[0xb]+1):
        typ,par,val=a.row(0xb,i)
        if par&3==0: consts[par>>2]=a.blob(val)
    return {struct.unpack('<i',consts[j][:4])[0]:a.str(nm) for j,fl,nm,sg in a.fields(ti) if j in consts}
RT=recipe_types()
prefab_of={}
for key,f in furn.items():
    fn,pid=key.split(':'); s=usf.load(fn)
    try:
        cls='FurnitureSurface' if f.get('surface') else 'Furniture'
        _,d,_=ser.read_mb(s,int(pid),'Assembly-CSharp','Furniture',upto='prefab')
        pp=d.get('prefab')
        if pp and pp[2]: prefab_of[key]=(fn if pp[1]==0 else s.ext[pp[1]-1], pp[2])
    except Exception: pass
need=sorted({fn for fn,_ in prefab_of.values()})
for fn in need:
    s=usf.load(fn)
    # transforms: go -> parent go
    parent={}; go_of_tr={}
    for p,(o,sz,c) in s.objs.items():
        if c in (4,224):
            r=s.reader(p); go=r.pptr(); r.fs(4); r.fs(3); r.fs(3); n=r.i32(); [r.pptr() for _ in range(n)]; fa=r.pptr()
            go_of_tr[p]=go[1]; parent[go[1]]=fa[1] if fa[0]==0 else 0
    tr_go=parent; gtr={v:k for k,v in go_of_tr.items()}
    def root(go):
        seen=0
        while go in parent and parent[go] and seen<64:
            go=go_of_tr.get(parent[go],0) if parent[go] in go_of_tr else 0; seen+=1
            if not go: break
        return go
    for p,(o,sz,c) in s.objs.items():
        if c!=114: continue
        try: r,go,sc,nm=usf.mb_head(s,p); n=usf.script_name(s,sc)
        except Exception: continue
        if not n or n[2]!='manufacturing': continue
        try: _,d,_=ser.read_mb(s,p,'Assembly-CSharp','manufacturing',upto='Recipes')
        except Exception: continue
        g=go[1]
        # walk up to the prefab root
        while True:
            t=gtr.get(g); par=parent.get(g,0)
            if not par: break
            g2=go_of_tr.get(par)
            if not g2: break
            g=g2
        types_by_root.setdefault((fn,g),set()).update(RT.get(x,str(x)) for x in (d.get('Recipes') or []))
    usf._cache.pop(fn,None)
n=0
for key,pf in prefab_of.items():
    t=types_by_root.get(pf)
    if t: furn[key]['types']=sorted(t); n+=1
json.dump(dict(furniture=furn,lists=lists),open(os.path.join(sys.argv[2],'furniture_assets.json'),'w'))
print(n,'furniture pieces with a crafting station')

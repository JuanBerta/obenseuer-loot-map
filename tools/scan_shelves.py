"""Shop shelves: many shops (Alco, ...) show their goods in separate Storage objects owned by the shopkeeper, each holding fixed items
(customItemsToSpawn). Adds those items to the matching trader in build/levelN_feat.json as 'items'.
Usage: python scan_shelves.py <Obenseuer_Data dir> <build dir> [level indices...]"""
import sys,os,json
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import usf, ser, extract
data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]
usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep
scenes=json.load(open(os.path.join(out,'scenes_index.json')))
idxs=[int(x) for x in sys.argv[3:]] or range(len(scenes))
RADIUS=25.0
tot=0
for i in idxs:
    fp=os.path.join(out,'level%d_feat.json'%i)
    if not os.path.exists(fp): continue
    fe=json.load(open(fp,encoding='utf-8-sig'))
    vend=[f for f in fe['features'] if f.get('kind')=='vendor' and f.get('trader') and f.get('owner')]
    if not vend: continue
    sf=usf.load('level%d'%i)
    if sf is None: continue
    gos,trs,go2tr,W,path_of=extract.scene(sf)
    shelves=[]
    for pid,(o,sz,c) in sf.objs.items():
        if c!=114: continue
        try:
            r,go,sc,nm=usf.mb_head(sf,pid); sn=usf.script_name(sf,sc)
            if not (sn and sn[2]=='Storage'): continue
            _,d,_=ser.read_mb(sf,pid,'Assembly-CSharp','Storage')
            own=(d.get('StorageOwner') or {}).get('name') or ''
            ids=[(x.get('itemReference') or {}).get('ID') for x in d.get('customItemsToSpawn') or []]
            ids=[x for x in ids if x]
            tp=go2tr.get(go[1])
            if not own or not ids or tp is None or not d.get('PermissionToTake'): continue
            if not path_of(go[1])[1]: continue
            P=W(tp)[1]; shelves.append((own.strip(),P,ids))
        except Exception: continue
    n=0
    for v in vend:
        items=set(v.get('items') or [])
        for own,P,ids in shelves:
            if own==v['owner'].strip() and (P[0]-v['x'])**2+(P[2]-v['z'])**2<=RADIUS**2: items.update(ids)
        if items!=set(v.get('items') or []): v['items']=sorted(items); n+=1
    if n:
        json.dump(fe,open(fp,'w'))
        print('%3d %-40s %d shop(s) got shelf items'%(i,scenes[i],n),flush=True); tot+=n
print('done',tot)

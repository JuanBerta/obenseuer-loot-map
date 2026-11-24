"""Adds stairs, ladders and elevator stops (kind 'vert') to build/levelN_feat.json, found by the names of the scene objects
(and the game's InteractableLadder script). Nearby pieces of one flight are merged into one marker.
Usage: python extract_vert.py <Obenseuer_Data> <build dir>"""
import sys,os,json,re,math
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import usf,ser,extract
data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]
usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep; extract.OUT=out
BAD=re.compile(r'wall|window|gapseal|rails|counterweight|LOD|phys|plank|light|panel|alarm|button_[0-9]|shaft|examine|not available|stairwell',re.I)
def kind_of(n):
    n=re.sub(r' \(\d+\)$','',n)
    if BAD.search(n) and not re.match(r'elevator_buttons_\d+_call_usable|elevator_door_\d+_usable',n): return None
    if re.match(r'elevator_buttons_\d+_call_usable|elevator_door_\d+_usable',n): return 'elevator'
    if re.search(r'ladder',n,re.I): return 'ladder'
    if re.search(r'stairs?(_|$| )',n,re.I) and not re.match(r'Stairs( [A-Z])?$',n): return 'stairs'
    return None
def merge(items,r):
    res=[]
    for it in items:
        for m in res:
            if m['sub']==it['sub'] and abs(m['y']-it['y'])<1.5 and math.hypot(m['x']-it['x'],m['z']-it['z'])<r:
                m['n']+=1; break
        else: res.append(dict(it,n=1))
    return res
n=len(json.load(open(os.path.join(out,'scenes_index.json')))); total=0
for i in range(n):
    fp=os.path.join(out,'level%d_feat.json'%i)
    if not os.path.exists(fp): continue
    try: sf=usf.load('level%d'%i)
    except Exception: continue
    try:
        gos,trs,go2tr,W,path_of=extract.scene(sf)
        items=[]
        lad=set()
        for pid,(o,sz,c) in sf.objs.items():
            if c!=114: continue
            try:
                r,go,sc,nm=usf.mb_head(sf,pid); sn=usf.script_name(sf,sc)
                if sn and sn[2]=='InteractableLadder': lad.add(go[1])
            except Exception: pass
        for gid,g in gos.items():
            k=kind_of(g['name'])
            if gid in lad: k='ladder'
            tp=go2tr.get(gid)
            if not k or tp is None: continue
            path,act=path_of(gid)
            if not act: continue
            M,P=W(tp)
            if abs(P[0])<0.01 and abs(P[2])<0.01: continue
            items.append(dict(kind='vert',sub=k,x=round(P[0],2),y=round(P[1],2),z=round(P[2],2),active=True))
        vs=[]
        for k,r in (('stairs',3.0),('ladder',1.2),('elevator',2.5)):
            vs+=merge([v for v in items if v['sub']==k],r)
        for v in vs: v.pop('n',None)
        j=json.load(open(fp)); j['features']=[f for f in j['features'] if f['kind']!='vert']+vs
        json.dump(j,open(fp,'w')); total+=len(vs); print(i,len(vs),flush=True)
    except Exception as ex: print(i,'failed',ex)
    usf._cache.pop('level%d'%i,None)
print('verts',total)

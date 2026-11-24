"""Adds tree debris (kind 'wood': the choppable wood piles, trash_wood_pile_*_workable) to build/levelN_feat.json.
Usage: python extract_wood.py <Obenseuer_Data> <build dir>"""
import sys,os,json,re
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import usf,ser,extract
data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]
usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep; extract.OUT=out
PILE=re.compile(r'^trash_wood_pile_\d+_workable(?: \(\d+\))?$')
n=len(json.load(open(os.path.join(out,'scenes_index.json')))); total=0
for i in range(n):
    fp=os.path.join(out,'level%d_feat.json'%i)
    if not os.path.exists(fp): continue
    try: sf=usf.load('level%d'%i)
    except Exception: continue
    try:
        gos,trs,go2tr,W,path_of=extract.scene(sf)
        items=[]
        for gid,g in gos.items():
            if not PILE.match(g['name']): continue
            tp=go2tr.get(gid)
            if tp is None: continue
            path,act=path_of(gid)
            M,P=W(tp)
            if abs(P[0])<0.01 and abs(P[2])<0.01: continue
            items.append(dict(kind='wood',sub='debris',x=round(P[0],2),y=round(P[1],2),z=round(P[2],2),active=bool(act)))
        j=json.load(open(fp)); j['features']=[f for f in j['features'] if f['kind']!='wood']+items
        json.dump(j,open(fp,'w')); total+=len(items)
        if items: print(i,len(items),sum(1 for x in items if x['active']),flush=True)
    except Exception as ex: print(i,'failed',ex)
    usf._cache.pop('level%d'%i,None)
print('wood piles',total)

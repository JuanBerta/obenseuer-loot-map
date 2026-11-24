"""Adds the people placed in each scene (kind 'npc', from the game's NPCInfo script) to build/levelN_feat.json.
The object's name is the person's name. Usage: python extract_npc.py <Obenseuer_Data> <build dir>"""
import sys,os,json,re
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import usf,ser,extract
data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]
usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep; extract.OUT=out
n=len(json.load(open(os.path.join(out,'scenes_index.json')))); total=0
for i in range(n):
    fp=os.path.join(out,'level%d_feat.json'%i)
    if not os.path.exists(fp): continue
    try: sf=usf.load('level%d'%i)
    except Exception: continue
    try:
        gos,trs,go2tr,W,path_of=extract.scene(sf); ppl={}
        for pid,(o,sz,c) in sf.objs.items():
            if c!=114: continue
            try:
                r,go,sc,nm=usf.mb_head(sf,pid); sn=usf.script_name(sf,sc)
                if not sn or sn[2]!='NPCInfo': continue
                tp=go2tr.get(go[1])
                if tp is None: continue
                name=re.sub(r' \(\d+\)$','',gos[go[1]]['name']).strip()
                path,act=path_of(go[1]); M,P=W(tp)
                if abs(P[0])<0.01 and abs(P[2])<0.01: continue
                ppl.setdefault(name,dict(kind='npc',name=name,x=round(P[0],2),y=round(P[1],2),z=round(P[2],2),active=bool(act)))
            except Exception as ex: pass
        j=json.load(open(fp)); j['features']=[f for f in j['features'] if f['kind']!='npc']+list(ppl.values())
        json.dump(j,open(fp,'w')); total+=len(ppl); print(i,len(ppl),flush=True)
    except Exception as ex: print(i,'failed',ex)
    usf._cache.pop('level%d'%i,None)
print('people',total)

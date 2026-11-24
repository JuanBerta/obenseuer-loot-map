"""Adds the doors inside buildings (the game's Door script, with their lock state) to the existing build/levelN_feat.json files.
Usage: python extract_doors.py <Obenseuer_Data> <build dir>"""
import sys,os,json
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import usf,ser,extract
data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]
usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep; extract.OUT=out
n=len(json.load(open(os.path.join(out,'scenes_index.json'))))
total=0
for i in range(n):
    fp=os.path.join(out,'level%d_feat.json'%i)
    if not os.path.exists(fp): continue
    try: sf=usf.load('level%d'%i)
    except Exception: continue
    try: fe,_=extract.features(sf)
    except Exception as ex: print(i,'failed',ex); continue
    doors=[f for f in fe if f['kind']=='idoor']
    j=json.load(open(fp))
    j['features']=[f for f in j['features'] if f['kind']!='idoor']+doors
    json.dump(j,open(fp,'w'))
    total+=len(doors); print(i,len(doors),flush=True)
    usf._cache.pop('level%d'%i,None)
print('doors',total)

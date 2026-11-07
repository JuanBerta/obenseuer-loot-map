"""Global extraction step (landmarks + map textures). Run by extract.py automatically on full runs."""
import sys,os,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import usf,ser,extract,tex,numpy as np
data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]
usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep; extract.OUT=out
lm=extract.landmarks(data_dir); json.dump(lm,open(os.path.join(out,'landmarks.json'),'w')); print('landmarks',len(lm))
sprites=set()
for f in os.listdir(out):
    if f.endswith('_feat.json'):
        mi=json.load(open(os.path.join(out,f)))['map']
        if mi and mi['sprite']: sprites.add(tuple(mi['sprite']))
for fn,name in sprites:
    img=tex.texture(fn,name)
    try: img=np.minimum(img,tex.texture(fn,name+'_drawings'))
    except KeyError: pass
    np.save(os.path.join(out,'map_'+name+'.npy'),img); print('map texture',name)

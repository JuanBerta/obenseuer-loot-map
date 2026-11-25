"""Find the self-service markets (MarketShop: take items from the shelves, pay at the register) in every scene.
Usage: python scan_markets.py <Obenseuer_Data dir> <out dir>   ->  <out dir>/markets.json  {level: [{x,y,z,name,factor,currency,active}]}"""
import sys, os, json
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
import usf, ser, extract

data_dir=os.path.abspath(sys.argv[1]); out=sys.argv[2]
usf.D=data_dir.rstrip('/\\')+os.sep; ser.M=os.path.join(data_dir,'Managed')+os.sep
g=usf.load('globalgamemanagers'); r=g.reader(g.of(141)[0]); n=r.i32()
scenes=[os.path.splitext(os.path.basename(r.str()))[0] for _ in range(n)]
res={}; errs=0
for i in range(len(scenes)):
    try: sf=usf.load('level%d'%i)
    except Exception: continue
    found=[]
    for pid,(o,sz,c) in sf.objs.items():
        if c!=114: continue
        try: r2,go,sc,nm=usf.mb_head(sf,pid); sn=usf.script_name(sf,sc)
        except Exception: continue
        if not sn or sn[2]!='MarketShop': continue
        try:
            gos,trs,go2tr,W,path_of=extract.scene(sf)
            _,d,_=ser.read_mb(sf,pid,'Assembly-CSharp','MarketShop',upto='priceFactor')
            tp=go2tr.get(go[1]); M,P=W(tp) if tp else extract.ID
            path,act=path_of(go[1])
            found.append(dict(x=round(P[0],2),y=round(P[1],2),z=round(P[2],2),name=(d.get('marketName') or '').strip() or None,
                              factor=round(d.get('priceFactor',1.1),3),currency=d.get('currency'),active=act))
        except Exception as e:
            errs+=1; print('  error',scenes[i],e)
    if found: res[i]=dict(scene=scenes[i],markets=found); print(i,scenes[i],found)
    usf._cache.pop('level%d'%i,None)
json.dump(res,open(os.path.join(out,'markets.json'),'w'),indent=1)
print(len(res),'scenes with markets;',errs,'errors')

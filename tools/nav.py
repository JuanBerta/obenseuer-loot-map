import zipfile, struct, json, re
def load(path):
    z=zipfile.ZipFile(path); out=[]
    meta=z.read('meta.json').decode()
    n=int(re.search(r'"graphs":\s*(\d+)',meta).group(1))
    types=re.search(r'"typeNames":\s*\[(.*?)\]',meta).group(1)
    for g in range(n):
        nm='graph%d_extra.binary'%g
        if nm not in z.namelist(): continue
        b=z.read(nm); p=0
        def i32():
            nonlocal p; v=struct.unpack_from('<i',b,p)[0]; p+=4; return v
        tx=i32(); tz=i32()
        for _ in range(tx*tz):
            x=i32()
            if x==-1: continue
            i32(); i32(); i32()
            tc=i32(); tris=struct.unpack_from('<%di'%tc,b,p); p+=4*tc
            vc=i32(); verts=struct.unpack_from('<%di'%(vc*3),b,p); p+=12*vc
            vc2=i32(); p+=12*vc2
            nc=i32(); p+=nc*(4+4+12)
            out.append((verts,tris))
    return out

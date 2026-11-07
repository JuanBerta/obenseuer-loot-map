import struct, os
class R:
    def __init__(s, b, pos=0, le=True): s.b=b; s.p=pos; s.e='<' if le else '>'
    def u8(s): v=s.b[s.p]; s.p+=1; return v
    def i16(s): v=struct.unpack_from(s.e+'h',s.b,s.p)[0]; s.p+=2; return v
    def u16(s): v=struct.unpack_from(s.e+'H',s.b,s.p)[0]; s.p+=2; return v
    def i32(s): v=struct.unpack_from(s.e+'i',s.b,s.p)[0]; s.p+=4; return v
    def u32(s): v=struct.unpack_from(s.e+'I',s.b,s.p)[0]; s.p+=4; return v
    def i64(s): v=struct.unpack_from(s.e+'q',s.b,s.p)[0]; s.p+=8; return v
    def u64(s): v=struct.unpack_from(s.e+'Q',s.b,s.p)[0]; s.p+=8; return v
    def f32(s): v=struct.unpack_from(s.e+'f',s.b,s.p)[0]; s.p+=4; return v
    def fs(s,n): v=struct.unpack_from(s.e+'%df'%n,s.b,s.p); s.p+=4*n; return v
    def align(s): s.p=(s.p+3)&~3
    def cstr(s):
        e=s.b.index(b'\0',s.p); v=s.b[s.p:e].decode('utf8','replace'); s.p=e+1; return v
    def str(s):
        n=s.i32(); v=s.b[s.p:s.p+n].decode('utf8','replace'); s.p+=n; s.align(); return v
    def pptr(s): return (s.i32(), s.i64())

class SF:
    def __init__(s, path):
        s.path=path
        with open(path,'rb') as f: b=f.read()
        s.b=b
        r=R(b,0,False)
        r.u32(); r.u32(); s.ver=r.u32(); r.u32()
        assert s.ver>=22
        le = b[16]==0
        r.p=20; msize=r.u32(); fsize=r.u64(); s.doff=r.u64(); r.u64()
        r=R(b,r.p,le); s.le=le
        s.uver=r.cstr(); s.plat=r.i32(); tt=r.u8(); assert tt==0, 'typetree present'
        n=r.i32(); s.types=[]
        for i in range(n):
            cid=r.i32(); stripped=r.u8(); sidx=r.i16()
            if cid==114: r.p+=16
            r.p+=16
            s.types.append((cid,sidx))
        n=r.i32(); s.objs={}
        for i in range(n):
            r.align(); pid=r.i64(); start=r.u64(); size=r.u32(); ti=r.i32()
            s.objs[pid]=(s.doff+start,size,s.types[ti][0])
        n=r.i32(); s.scripts=[]
        for i in range(n): s.scripts.append((r.i32(), r.i64() if True else 0))
        n=r.i32(); s.ext=[]
        for i in range(n):
            r.cstr(); r.p+=16; r.i32(); s.ext.append(r.cstr())
    def reader(s,pid):
        o,sz,c=s.objs[pid]; return R(s.b,o,s.le)
    def of(s,cid): return [p for p,(o,sz,c) in s.objs.items() if c==cid]

D=''  # set by extract.py
_cache={}
def load(name):
    if name not in _cache:
        _cache[name]=SF(D+name) if os.path.exists(D+name) else None
    return _cache[name]
_scr={}
def script_name(sf, pp):
    fid,pid=pp
    fname = os.path.basename(sf.path) if fid==0 else sf.ext[fid-1]
    k=(fname,pid)
    if k not in _scr:
        f=load(fname)
        if f is None or pid not in f.objs: _scr[k]=None
        else:
            r=f.reader(pid); r.str(); r.i32(); r.p+=16
            cn=r.str(); ns=r.str(); asm=r.str(); _scr[k]=(asm,ns,cn)
    return _scr[k]
def mb_head(sf,pid):
    r=sf.reader(pid); go=r.pptr(); en=r.u8(); r.align(); sc=r.pptr(); nm=r.str()
    return r,go,sc,nm

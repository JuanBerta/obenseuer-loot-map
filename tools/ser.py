import dotnet, os, glob, struct
M=''  # set by extract.py
ASMS={}
def asm(n):
    if n not in ASMS: ASMS[n]=dotnet.Asm(M+n+'.dll') if os.path.exists(M+n+'.dll') else None
    return ASMS[n]
_index=None
def index():
    global _index
    if _index is None:
        _index={}
        for f in glob.glob(M+'*.dll'):
            n=os.path.basename(f)[:-4]
            try: a=asm(n)
            except Exception: continue
            if not a: continue
            for i in range(1,a.rows[2]+1):
                r=a.row(2,i); fn=(a.str(r[2])+'.' if a.str(r[2]) else '')+a.str(r[1])
                _index.setdefault(fn,(n,i))
    return _index
VSTRUCT={'UnityEngine.Vector2':'2f','UnityEngine.Vector3':'3f','UnityEngine.Vector4':'4f','UnityEngine.Quaternion':'4f',
 'UnityEngine.Color':'4f','UnityEngine.Color32':'I','UnityEngine.Rect':'4f','UnityEngine.Bounds':'6f','UnityEngine.Vector2Int':'2i',
 'UnityEngine.Vector3Int':'3i','UnityEngine.Matrix4x4':'16f','UnityEngine.LayerMask':'I'}
PRIM={'bool':('?',1),'byte':('B',1),'sbyte':('b',1),'char':('H',2),'short':('h',2),'ushort':('H',2),'int':('i',4),'uint':('I',4),
 'long':('q',8),'ulong':('Q',8),'float':('f',4),'double':('d',8)}
UOBJ={'UnityEngine.Object','UnityEngine.MonoBehaviour','UnityEngine.ScriptableObject','UnityEngine.Component','UnityEngine.Behaviour'}
class TD:
    def __init__(s,a,i): s.a=a; s.i=i; r=a.row(2,i); s.flags=r[0]; s.name=a.str(r[1]); s.ns=a.str(r[2]); s.ext=r[3]
    @property
    def full(s): return (s.ns+'.' if s.ns else '')+s.name
def resolve_coded(a,coded):
    tag=coded&3; i=coded>>2
    if i==0: return None
    if tag==0: return TD(a,i)
    if tag==1:
        r=a.row(1,i); fn=(a.str(r[2])+'.' if a.str(r[2]) else '')+a.str(r[1])
        x=index().get(fn)
        if x: return TD(asm(x[0]),x[1])
        return ('missing',fn)
    return None
def base_kind(td,depth=0):
    # 'uobj','enum','struct','class'
    cur=td
    for _ in range(20):
        if isinstance(cur,tuple): return 'unknown'
        if cur.full in UOBJ: return 'uobj'
        if cur.full=='System.Enum': return 'enum'
        if cur.full=='System.ValueType': return 'struct'
        if cur.full=='System.Object': return 'class'
        nxt=resolve_coded(cur.a,cur.ext)
        if nxt is None: return 'class'
        if not isinstance(nxt,tuple) and nxt.full=='System.Object' and cur is not td: return 'class'
        cur=nxt
    return 'class'
def parse_sig(a,b,p):
    e=b[p]; p+=1
    prim={2:'bool',3:'char',4:'sbyte',5:'byte',6:'short',7:'ushort',8:'int',9:'uint',0xa:'long',0xb:'ulong',0xc:'float',0xd:'double',0xe:'string',0x1c:'object',0x18:'IntPtr'}
    if e in prim: return ('p',prim[e]),p
    if e in (0x11,0x12): c,p=a.cint(b,p); return ('t',resolve_coded(a,c)),p
    if e==0x1d: t,p=parse_sig(a,b,p); return ('arr',t),p
    if e==0x15:
        g,p=parse_sig(a,b,p); n,p=a.cint(b,p); args=[]
        for _ in range(n): x,p=parse_sig(a,b,p); args.append(x)
        return ('gen',g,args),p
    if e in (0x13,0x1e): n,p=a.cint(b,p); return ('var',n),p
    return ('?',e),p
_layout={}
def fields_of(td):
    k=(id(td.a),td.i)
    if k in _layout: return _layout[k]
    out=[]
    base=resolve_coded(td.a,td.ext)
    if base and not isinstance(base,tuple) and base.full not in UOBJ and base.full not in ('System.Object','System.ValueType'):
        out+=fields_of(base)
    fa=td.a.field_attrs()
    for j,fl,nm,sig in td.a.fields(td.i):
        if fl&0x10 or fl&0x40 or fl&0x80 or fl&0x20: continue
        attrs=fa.get(j,[])
        if 'SerializeReference' in attrs or 'SerializeReferenceAttribute' in attrs:
            out.append((td.a.str(nm),('sref',))); continue
        if (fl&7)!=6 and 'SerializeField' not in attrs and 'SerializeFieldAttribute' not in attrs: continue
        t,_=parse_sig(td.a,td.a.blob(sig),1)
        out.append((td.a.str(nm),t))
    _layout[k]=out; return out
def serializable(t):
    if t[0]=='p': return t[1] not in ('object','IntPtr')
    if t[0]=='t':
        td=t[1]
        if isinstance(td,tuple) or td is None: return False
        if td.full in VSTRUCT: return True
        if td.full.startswith('UnityEngine.') and td.full in ('UnityEngine.AnimationCurve','UnityEngine.Gradient'): return True
        k=base_kind(td)
        if k in ('uobj','enum'): return True
        if k in ('class','struct'): return bool(td.flags&0x2000) and not (td.flags&0x80) and not td.full.startswith('System.')
        return False
    if t[0]=='arr': return t[1][0]!='arr' and serializable(t[1])
    if t[0]=='gen':
        g=t[1][1]
        if not isinstance(g,tuple) and g and g.full=='System.Collections.Generic.List`1': return t[2][0] not in('arr','gen') and serializable(t[2][0])
        return False
    return False
def read(r,t,depth=0):
    if t[0]=='p':
        if t[1]=='string': return r.str()
        f,n=PRIM[t[1]]; v=struct.unpack_from('<'+f,r.b,r.p)[0]; r.p+=n
        if n<4: r.align()
        return v
    if t[0]=='t':
        td=t[1]
        if td.full in VSTRUCT:
            f=VSTRUCT[td.full]; n=struct.calcsize('<'+f); v=struct.unpack_from('<'+f,r.b,r.p); r.p+=n; return v
        if td.full in ('UnityEngine.AnimationCurve','UnityEngine.Gradient'): raise Exception('curve/gradient '+td.full)
        k=base_kind(td)
        if k=='uobj': return ('pptr',)+r.pptr()
        if k=='enum':
            for j,fl,nm,sig in td.a.fields(td.i):
                if td.a.str(nm)=='value__':
                    pt,_=parse_sig(td.a,td.a.blob(sig),1); return read(r,pt)
        if depth>=10: return None
        return read_obj(r,td,depth+1)
    if t[0] in('arr','gen'):
        et=t[1] if t[0]=='arr' else t[2][0]
        n=r.i32()
        if n<0 or n>1000000: raise Exception('bad array len %d'%n)
        if et==('p','byte'):
            v=r.b[r.p:r.p+n]; r.p+=n; r.align(); return v
        out=[read(r,et,depth) for _ in range(n)]
        r.align(); return out
def read_obj(r,td,depth=0,upto=None):
    o={}
    for nm,t in fields_of(td):
        if upto and nm==upto:
            o[nm]=read(r,t,depth) if serializable(t) else None; return o
        if t[0]=='sref': raise Exception('SerializeReference not supported')
        if not serializable(t): continue
        o[nm]=read(r,t,depth)
    return o
def read_mb(sf,pid,asmname,cls,upto=None):
    import usf
    r,go,sc,nm=usf.mb_head(sf,pid)
    a=asm(asmname); ti=index()[cls][1] if cls in index() else a.find_type(cls)
    td=TD(asm(index()[cls][0]),index()[cls][1])
    o=read_obj(r,td,0,upto)
    end=sf.objs[pid][0]+sf.objs[pid][1]
    return go,o,end-r.p

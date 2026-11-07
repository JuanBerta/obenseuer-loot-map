import struct
class Asm:
    def __init__(s,path):
        b=open(path,'rb').read(); s.b=b
        pe=struct.unpack_from('<I',b,0x3c)[0]
        nsec=struct.unpack_from('<H',b,pe+6)[0]; optsz=struct.unpack_from('<H',b,pe+20)[0]
        opt=pe+24; magic=struct.unpack_from('<H',b,opt)[0]
        dd=opt+(96 if magic==0x10b else 112)
        cli_rva=struct.unpack_from('<I',b,dd+14*8)[0]
        s.secs=[]
        so=opt+optsz
        for i in range(nsec):
            vs,va,rs,ra=struct.unpack_from('<IIII',b,so+i*40+8); s.secs.append((va,vs,ra))
        cli=s.off(cli_rva); md=s.off(struct.unpack_from('<I',b,cli+8)[0])
        vl=struct.unpack_from('<I',b,md+12)[0]; p=md+16+vl+2
        n=struct.unpack_from('<H',b,p)[0]; p+=2; s.st={}
        for i in range(n):
            o,sz=struct.unpack_from('<II',b,p); p+=8
            e=b.index(b'\0',p); nm=b[p:e].decode(); p=(e+4)&~3
            s.st[nm]=(md+o,sz)
        s.tables()
    def off(s,rva):
        for va,vs,ra in s.secs:
            if va<=rva<va+max(vs,1): return rva-va+ra
    def tables(s):
        b=s.b; t,_=s.st['#~']
        hs=b[t+6]; valid=struct.unpack_from('<Q',b,t+8)[0]
        s.sbig=hs&1; s.gbig=hs&2; s.bbig=hs&4
        p=t+24; s.rows=[0]*64
        for i in range(64):
            if valid>>i&1: s.rows[i]=struct.unpack_from('<I',b,p)[0]; p+=4
        R=s.rows
        def ci(tabs,bits): return 4 if max(R[x] for x in tabs)>=(1<<(16-bits)) else 2
        S=4 if s.sbig else 2; G=4 if s.gbig else 2; B=4 if s.bbig else 2
        idx=lambda x: 4 if R[x]>=65536 else 2
        TDOR=ci([2,1,0x1b],2); HCA=ci([6,4,1,2,8,9,0xa,0,0xe,0x17,0x14,0x11,0x1a,0x1b,0x20,0x23,0x26,0x27,0x28,0x2a,0x2c,0x2b],5)
        CAT=ci([6,0xa],3); MRP=ci([2,1,0x1a,6,0x1b],3); RS=ci([0,0x1a,0x23,1],2)
        HC=ci([4,8,0x17],2)
        s.sch={
         0:[2,S,G,G,G],1:[RS,S,S],2:[4,S,S,TDOR,idx(4),idx(6)],3:[idx(4)],4:[2,S,B],5:[idx(6)],
         6:[4,2,2,S,B,idx(8)],7:[idx(8)],8:[2,2,S],9:[idx(2),TDOR],0xa:[MRP,S,B],0xb:[2,HC,B],0xc:[HCA,CAT,B]}
        s.tabpos={}
        for i in range(0xd):
            s.tabpos[i]=p; p+=R[i]*sum(s.sch[i])
        s.S,s.B=S,B
    def row(s,t,i):
        p=s.tabpos[t]+(i-1)*sum(s.sch[t]); out=[]
        for w in s.sch[t]:
            out.append(struct.unpack_from('<H' if w==2 else '<I',s.b,p)[0]); p+=w
        return out
    def str(s,i):
        o,_=s.st['#Strings']; e=s.b.index(b'\0',o+i); return s.b[o+i:e].decode()
    def blob(s,i):
        o,_=s.st['#Blob']; p=o+i; c=s.b[p]
        if c&0x80==0: n=c; p+=1
        elif c&0xc0==0x80: n=((c&0x3f)<<8)|s.b[p+1]; p+=2
        else: n=((c&0x1f)<<24)|(s.b[p+1]<<16)|(s.b[p+2]<<8)|s.b[p+3]; p+=4
        return s.b[p:p+n]
    def typename(s,coded):
        tag=coded&3; i=coded>>2
        if i==0: return None
        if tag==0: r=s.row(2,i); return s.str(r[2])+'.'+s.str(r[1]) if s.str(r[2]) else s.str(r[1])
        if tag==1: r=s.row(1,i); return s.str(r[2])+'.'+s.str(r[1]) if s.str(r[2]) else s.str(r[1])
        return 'TypeSpec'
    def find_type(s,name):
        for i in range(1,s.rows[2]+1):
            if s.str(s.row(2,i)[1])==name: return i
    def fields(s,ti):
        r=s.row(2,ti); a=r[4]; e=s.row(2,ti+1)[4] if ti<s.rows[2] else s.rows[4]+1
        return [(j,)+tuple(s.row(4,j)) for j in range(a,e)]
    def field_attrs(s):
        if hasattr(s,'_fa'): return s._fa
        fa={}
        for i in range(1,s.rows[0xc]+1):
            par,typ,val=s.row(0xc,i)
            if par&31!=1: continue
            fi=par>>5
            tag=typ&7; ti=typ>>3
            if tag==3:
                cls=s.row(0xa,ti)[0]
                if cls&7==1: nm=s.str(s.row(1,cls>>3)[1])
                elif cls&7==0: nm=s.str(s.row(2,cls>>3)[1])
                else: nm='?'
            else:
                nm='?'
            fa.setdefault(fi,[]).append(nm)
        s._fa=fa; return fa
    def sigtype(s,b,p=0):
        e=b[p]; p+=1
        prim={1:'void',2:'bool',3:'char',4:'sbyte',5:'byte',6:'short',7:'ushort',8:'int',9:'uint',0xa:'long',0xb:'ulong',0xc:'float',0xd:'double',0xe:'string',0x18:'IntPtr',0x1c:'object'}
        if e in prim: return prim[e],p
        if e in (0x11,0x12):
            c,p=s.cint(b,p); return ('class ' if e==0x12 else 'vt ')+s.typename(c),p
        if e==0x1d: t,p=s.sigtype(b,p); return t+'[]',p
        if e==0x15:
            g,p=s.sigtype(b,p); n,p=s.cint(b,p); args=[]
            for _ in range(n): a,p=s.sigtype(b,p); args.append(a)
            return g+'<'+','.join(args)+'>',p
        if e in (0x13,0x1e): n,p=s.cint(b,p); return '!%d'%n,p
        return 'et%x'%e,p
    def cint(s,b,p):
        c=b[p]
        if c&0x80==0: return c,p+1
        if c&0xc0==0x80: return ((c&0x3f)<<8)|b[p+1],p+2
        return ((c&0x1f)<<24)|(b[p+1]<<16)|(b[p+2]<<8)|b[p+3],p+4
    def describe(s,name):
        ti=s.find_type(name); r=s.row(2,ti)
        print('class',name,'extends',s.typename(r[3]))
        fa=s.field_attrs()
        for j,fl,nm,sig in s.fields(ti):
            t,_=s.sigtype(s.blob(sig),1)
            print('  %04x %-40s %-50s %s'%(fl,s.str(nm),t,','.join(fa.get(j,[]))))

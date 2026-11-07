"""Texture2D / Sprite decoding (RGB24, RGBA32, DXT1, DXT5) with numpy only."""
import usf, os, struct, numpy as np

def _565(c):
    r=((c>>11)&31)*255//31; g=((c>>5)&63)*255//63; b=(c&31)*255//31
    return np.stack([r,g,b],-1).astype(np.int32)

def _bc_color(blocks, dxt1):
    c0=blocks[:,0].astype(np.uint32)|(blocks[:,1].astype(np.uint32)<<8)
    c1=blocks[:,2].astype(np.uint32)|(blocks[:,3].astype(np.uint32)<<8)
    p0=_565(c0); p1=_565(c1)
    four=(c0>c1)|(not dxt1)
    p2=np.where(four[:,None],(2*p0+p1)//3,(p0+p1)//2)
    p3=np.where(four[:,None],(p0+2*p1)//3,0)
    pal=np.stack([p0,p1,p2,p3],1)                       # n,4,3
    idx=blocks[:,4:8].astype(np.uint32)
    bits=idx[:,0]|(idx[:,1]<<8)|(idx[:,2]<<16)|(idx[:,3]<<24)
    sel=np.stack([(bits>>(2*i))&3 for i in range(16)],1) # n,16
    rgb=np.take_along_axis(pal,sel[:,:,None].astype(np.int64).repeat(3,2),1)
    alpha=np.where(dxt1&(~four)[:,None]&(sel==3),0,255) if dxt1 else None
    return rgb,alpha

def _bc_alpha(blocks):
    a0=blocks[:,0].astype(np.int32); a1=blocks[:,1].astype(np.int32)
    pal=[a0,a1]
    for i in range(1,7):
        pal.append(np.where(a0>a1,((7-i)*a0+i*a1)//7,0))
    for i in range(1,5):
        pal[1+i]=np.where(a0>a1,pal[1+i],((5-i)*a0+i*a1)//5)
    pal[6]=np.where(a0>a1,pal[6],0); pal[7]=np.where(a0>a1,pal[7],255)
    pal=np.stack(pal,1)
    bits=np.zeros(len(blocks),np.uint64)
    for i in range(6): bits|=blocks[:,2+i].astype(np.uint64)<<np.uint64(8*i)
    sel=np.stack([(bits>>np.uint64(3*i))&np.uint64(7) for i in range(16)],1).astype(np.int64)
    return np.take_along_axis(pal,sel,1)

def decode(data,w,h,fmt):
    if fmt==3: return np.frombuffer(data[:w*h*3],np.uint8).reshape(h,w,3)
    if fmt==4: return np.frombuffer(data[:w*h*4],np.uint8).reshape(h,w,4)
    bw,bh=(w+3)//4,(h+3)//4
    if fmt==10:
        b=np.frombuffer(data[:bw*bh*8],np.uint8).reshape(-1,8); rgb,a=_bc_color(b,True)
    elif fmt==12:
        b=np.frombuffer(data[:bw*bh*16],np.uint8).reshape(-1,16); rgb,_=_bc_color(b[:,8:],False); a=_bc_alpha(b[:,:8])
    else: raise ValueError('texture format %d not supported'%fmt)
    px=np.concatenate([rgb,a[:,:,None]],2).reshape(bh,bw,4,4,4).transpose(0,2,1,3,4).reshape(bh*4,bw*4,4)
    return px[:h,:w].astype(np.uint8)

def _tex_data(s,p):
    r=s.reader(p); nm=r.str(); o,sz,c=s.objs[p]; blob=s.b[o:o+sz]
    w,h,complete=struct.unpack_from('<2iI',blob,r.p-o+4); fmt=struct.unpack_from('<i',blob,r.p-o+20)[0]
    k=blob.rfind(b'.resS')
    if k!=-1 and k>len(blob)-200:
        j=k
        while j>0 and struct.unpack_from('<i',blob,j-4)[0]!=(k+5-j): j-=1
        path=blob[j:k+5].decode(); size=struct.unpack_from('<I',blob,j-8)[0]; off=struct.unpack_from('<Q',blob,j-16)[0]
        with open(usf.D+os.path.basename(path),'rb') as f: f.seek(off); data=f.read(size)
    else:
        end=len(blob)-16; n=complete; start=end-((n+3)&~3)
        assert struct.unpack_from('<i',blob,start-4)[0]==n
        data=blob[start:start+n]
    return nm,w,h,fmt,data

def texture(fn,name):
    s=usf.load(fn)
    for p in s.of(28):
        if s.reader(p).str()==name:
            nm,w,h,fmt,data=_tex_data(s,p)
            img=decode(data,w,h,fmt)[::-1]
            return img[:,:,:3] if img.shape[2]==4 and fmt==3 else img
    raise KeyError(name)

def sprite(sf,pp):
    """Return RGBA image for a Sprite PPtr ('pptr',fileID,pathID) referenced from file sf."""
    fid,pid=pp[1],pp[2]
    fn=os.path.basename(sf.path) if fid==0 else sf.ext[fid-1]
    s=usf.load(fn); r=s.reader(pid)
    nm=r.str(); rect=r.fs(4); r.fs(2); r.fs(4); r.f32(); r.fs(2); r.u32(); r.u8(); r.align(); r.p+=24
    n=r.i32(); [r.str() for _ in range(n)]; r.pptr(); tx=r.pptr()
    tfn=fn if tx[0]==0 else s.ext[tx[0]-1]; ts=usf.load(tfn)
    tn,w,h,fmt,data=_tex_data(ts,tx[1])
    img=decode(data,w,h,fmt)
    if img.shape[2]==3: img=np.concatenate([img,np.full(img.shape[:2]+(1,),255,np.uint8)],2)
    x,y,rw,rh=[int(round(v)) for v in rect]
    img=img[y:y+rh,x:x+rw][::-1]
    return nm,img

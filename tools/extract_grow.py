"""What a plant / fish / animal item yields when it is harvested (grow.grownItems of its prefab).
Usage: python extract_grow.py <Obenseuer_Data dir> <out json>   ->  {itemId: [[yieldItemId, min, max], ...]}"""
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import usf, ser

data_dir = os.path.abspath(sys.argv[1]); out = sys.argv[2]
usf.D = data_dir.rstrip('/\\') + os.sep; ser.M = os.path.join(data_dir, 'Managed') + os.sep

def read_json(name):
    raw = open(os.path.join(data_dir, 'StreamingAssets', name), 'rb').read().decode('utf-8-sig')
    return json.loads(raw)

gg = usf.load('globalgamemanagers'); RES = {}
for p in gg.of(147):
    r = gg.reader(p); n = r.i32()
    for _ in range(n):
        path = r.str(); fid, pid = r.i32(), r.i64()
        fn = gg.ext[fid - 1] if fid else 'globalgamemanagers'
        RES[path.lower()] = (fn, pid)

def fname(sf, fn, f): return fn if f == 0 else sf.ext[f - 1]

def find_grow(fn, pid, seen=None):
    sf = usf.load(fn)
    if sf is None or pid not in sf.objs or sf.objs[pid][2] != 1: return None
    seen = seen if seen is not None else set()
    if (fn, pid) in seen: return None
    seen.add((fn, pid))
    r = sf.reader(pid); n = r.i32(); comps = [r.pptr() for _ in range(n)]
    for f, cp in comps:
        cfn = fname(sf, fn, f); csf = usf.load(cfn)
        if csf is None or cp not in csf.objs or csf.objs[cp][2] != 114: continue
        try:
            _, go, sc, nm = usf.mb_head(csf, cp); sn = usf.script_name(csf, sc)
        except Exception: continue
        if sn and sn[2] == 'grow':
            _, d, _ = ser.read_mb(csf, cp, 'Assembly-CSharp', 'grow')
            return d
    for f, cp in comps:
        cfn = fname(sf, fn, f); csf = usf.load(cfn)
        if csf is None or cp not in csf.objs or csf.objs[cp][2] not in (4, 224): continue
        r = csf.reader(cp); r.pptr(); r.fs(4); r.fs(3); r.fs(3)
        n = r.i32(); kids = [r.pptr() for _ in range(n)]
        for kf, kp in kids:
            kfn = fname(csf, cfn, kf); ksf = usf.load(kfn)
            if ksf is None or kp not in ksf.objs: continue
            kgo = ksf.reader(kp).pptr()
            g = find_grow(fname(ksf, kfn, kgo[0]), kgo[1], seen)
            if g: return g
    return None

res, miss = {}, []
for it in read_json('Items.json'):
    if not any(m.get('$type', '').endswith('ItemGrowdata') for m in it.get('Meta') or []): continue
    pp = ((it.get('Appearance') or {}).get('PrefabPath') or '').lower()
    ent = RES.get(pp); d = None
    try:
        if ent:
            sf = usf.load(ent[0])
            if sf and ent[1] in sf.objs:
                c = sf.objs[ent[1]][2]
                if c == 1: d = find_grow(*ent)
                elif c in (4, 224):
                    go = sf.reader(ent[1]).pptr(); d = find_grow(fname(sf, ent[0], go[0]), go[1])
    except Exception as e:
        miss.append((it['ID'], it['Title'], 'ERR ' + repr(e)[:80], bool(ent))); continue
    if not d or not d.get('grownItems'):
        miss.append((it['ID'], it['Title'], pp, bool(ent))); continue
    ys = []
    for gi in d['grownItems']:
        iid = (gi.get('item') or {}).get('ID'); a = gi.get('amount') or (1, 1)
        if iid: ys.append([iid, a[0], a[1]] if isinstance(a, (tuple, list)) else [iid, a.get('x', 1), a.get('y', 1)])
    res[it['ID']] = ys
json.dump(res, open(out, 'w'))
print(len(res), 'growing items with a yield;', len(miss), 'without')
for m in miss[:15]: print('  no yield:', m)

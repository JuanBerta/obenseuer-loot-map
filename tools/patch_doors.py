"""Copies the interior doors (kind 'idoor') from build/levelN_feat.json into the already built data/scenes/*.js,
so the doors can be refreshed without running the whole build_data.py. Usage: python patch_doors.py <build dir> <site dir>"""
import sys,os,json,re
ext,site=sys.argv[1:3]
slugify=lambda n: re.sub(r'[^a-z0-9]+','-',n.lower()).strip('-')
scenes=json.load(open(os.path.join(ext,'scenes_index.json')))
done=0; total=0
for i,name in enumerate(scenes):
    fp=os.path.join(ext,'level%d_feat.json'%i); sp=os.path.join(site,'data','scenes',slugify(name)+'.js')
    if not (os.path.exists(fp) and os.path.exists(sp)): continue
    txt=open(sp,encoding='utf-8').read(); pre='window.__scene('
    d=json.loads(txt[len(pre):txt.rindex(')')])
    doors=[x for x in json.load(open(fp))['features'] if x['kind']=='idoor' and not (x['x']==0 and x['z']==0)]
    d['features']=[f for f in d['features'] if f['kind']!='idoor']+doors
    open(sp,'w',encoding='utf-8').write(pre+json.dumps(d,separators=(',',':'))+');')
    done+=1; total+=len(doors)
print(done,'scenes,',total,'doors')

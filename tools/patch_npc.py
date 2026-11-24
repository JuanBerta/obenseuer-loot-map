"""Copies the interior people (kind 'idoor') from build/levelN_feat.json into the already built data/scenes/*.js,
so the people can be refreshed without running the whole build_data.py. Usage: python patch_people.py <build dir> <site dir>"""
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
    people=[x for x in json.load(open(fp))['features'] if x['kind']=='npc']
    d['features']=[f for f in d['features'] if f['kind']!='npc']+people
    open(sp,'w',encoding='utf-8').write(pre+json.dumps(d,separators=(',',':'))+');')
    done+=1; total+=len(people)
print(done,'scenes,',total,'people')

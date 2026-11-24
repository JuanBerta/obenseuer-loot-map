"""Writes data/people.js: for each person, the scenes they are placed in. Usage: python make_people.py <site dir>"""
import sys,os,json,glob
site=sys.argv[1]; out={}
for sp in sorted(glob.glob(os.path.join(site,'data','scenes','*.js'))):
    txt=open(sp,encoding='utf-8').read(); d=json.loads(txt[len('window.__scene('):txt.rindex(')')])
    for f in d['features']:
        if f['kind']=='npc' and f.get('active',True): out.setdefault(f['name'],[]).append(d['slug'])
open(os.path.join(site,'data','people.js'),'w',encoding='utf-8').write('window.OBS_PEOPLE='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';')
print(len(out),'people')

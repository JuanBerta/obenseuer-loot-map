"""Compare two builds of data/db.js and write data/changes.json for the website's "Patch changes" page.

After a game update:
  1. before rebuilding, keep the old data:   copy data\db.js data\db_prev.js   and   copy data\meta.json data\meta_prev.json
  2. rebuild the data as usual (build_data.py, build_mod_data.py, build_db.py)
  3. python tools/build_changes.py data/db_prev.js data/db.js data/changes.json
"""
import json, os, sys

def load(p):
    s = open(p, encoding='utf-8').read()
    return json.loads(s[s.index('=') + 1:].rstrip().rstrip(';'))

def tidy(v):
    if isinstance(v, float) and v == int(v): v = int(v)
    if isinstance(v, list): return ', '.join(str(tidy(x)) for x in v) if len(v) < 8 else '%d entries' % len(v)
    return str(v)

def diff_map(old, new, name, fields):
    added = [[k, name(new[k])] for k in new if k not in old]
    removed = [[k, name(old[k])] for k in old if k not in new]
    changed = []
    for k in new:
        if k not in old: continue
        d = [[lab, tidy(old[k][i]), tidy(new[k][i])] for lab, i in fields if i < len(old[k]) and i < len(new[k]) and old[k][i] != new[k][i]]
        if d: changed.append([k, name(new[k]), d])
    return dict(added=added, removed=removed, changed=changed)

old, new = load(sys.argv[1]), load(sys.argv[2])
def meta(db_path, name):
    p = os.path.join(os.path.dirname(os.path.abspath(db_path)), name)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
out = {'from': meta(sys.argv[1], 'meta_prev.json'), 'to': meta(sys.argv[2], 'meta.json')}
out['items'] = diff_map(old['items'], new['items'], lambda r: r[0], [('Name', 0), ('Value', 1), ('Categories', 2), ('Description', 3), ('Stack', 4)])
ro = {str(r[0]): r for r in old['recipes']}; rn = {str(r[0]): r for r in new['recipes']}
out['recipes'] = diff_map(ro, rn, lambda r: r[1], [('Station', 2), ('Skill', 3), ('Minimum skill', 4), ('Fail chance', 5), ('Time', 6), ('Ingredients', 7), ('Makes', 8), ('Fail products', 9)])
out['furniture'] = diff_map(old['furniture'], new['furniture'], lambda r: r[0], [('Category', 1), ('Price OC', 2), ('Price RM', 3), ('Station types', 4)])
vo = {'%s|%s' % (v.get('n'), v.get('sc')): v for v in old['vendors']}; vn = {'%s|%s' % (v.get('n'), v.get('sc')): v for v in new['vendors']}
out['vendors'] = diff_map(vo, vn, lambda v: '%s (%s)' % (v.get('n'), v.get('sc')), []) if False else dict(
    added=[[k, '%s (%s)' % (v.get('n'), v.get('sc'))] for k, v in vn.items() if k not in vo],
    removed=[[k, '%s (%s)' % (v.get('n'), v.get('sc'))] for k, v in vo.items() if k not in vn],
    changed=[[k, '%s (%s)' % (v.get('n'), v.get('sc')), [['Items sold', str(len(vo[k].get('i') or [])), str(len(v.get('i') or []))]]] for k, v in vn.items() if k in vo and len(vo[k].get('i') or []) != len(v.get('i') or [])])
n = sum(len(o['added']) + len(o['removed']) + len(o['changed']) for o in (out['items'], out['recipes'], out['furniture'], out['vendors']))
if n == 0: out['to'] = {}; out['from'] = {}   # nothing changed: the page says no update has been compared
json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False)
print(n, 'changes')

// Database pages: items, recipes, vendors, tenement, tenants, furniture.
// Routes: #/db, #/db/<section>, #/db/<section>/<key>. Data (data/db.js) loads the first time the database opens.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const IDX = window.OBS_INDEX;
const SCN = Object.fromEntries(IDX.scenes.map(s => [s.slug, s]));
const SECTIONS = [
  ['items', 'Items'], ['recipes', 'Recipes'], ['vendors', 'Vendors'], ['tenement', 'Tenement'],
  ['tenants', 'Tenants'], ['furniture', 'Furniture'], ['notes', 'Data notes'],
];
let DB = null, X = null;                       // raw data, derived indexes
const V = { sec: 'items', key: null, q: '', f: '', sort: 'name', lim: 300 };

// ---------- loading & indexes ----------
function load() {
  if (DB) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'data/db.js?v=3';
    s.onload = () => { DB = window.OBS_DB; index(); res(); }; s.onerror = rej; document.head.appendChild(s);
  });
}
function index() {
  const I = DB.items, R = {}, makes = {}, uses = {}, fails = {}, groupsOf = {}, inTables = {}, tableCount = {}, tableScenes = {};
  const add = (o, k, v) => (o[k] || (o[k] = new Set())).add(v);
  for (const r of DB.recipes) { R[r[0]] = r; r[8].forEach(x => add(makes, x[0], r[0])); r[9].forEach(x => add(fails, x[0], r[0])); r[7].forEach(x => add(uses, x[0], r[0])); }
  for (const [id, it] of Object.entries(I)) it[6].forEach(m => (groupsOf[m] || (groupsOf[m] = [])).push(+id));
  for (const [n, t] of Object.entries(DB.loot)) {
    t[1].forEach(id => add(inTables, id, n + '\u0000c')); t[2].forEach(id => add(inTables, id, n + '\u0000r'));
  }
  for (const [slug, cats] of Object.entries(DB.sceneCats)) for (const [c, k] of Object.entries(cats)) {
    tableCount[c] = (tableCount[c] || 0) + k; (tableScenes[c] || (tableScenes[c] = [])).push([slug, k]);
  }
  for (const a of Object.values(tableScenes)) a.sort((x, y) => y[1] - x[1]);
  DB.vendors.forEach((v, i) => { v.key = v.sc + '~' + i; });
  const VK = Object.fromEntries(DB.vendors.map(v => [v.key, v]));
  const tableItems = {}; for (const [n, t] of Object.entries(DB.loot)) tableItems[n] = new Set([...t[1], ...t[2]]);
  const furnTypes = {}; for (const [id, f] of Object.entries(DB.furniture)) for (const t of f[4] || []) (furnTypes[t] || (furnTypes[t] = [])).push(+id);
  const TEN = new Set(['Tenement Resource', 'Tenement Customization']);
  const tenIds = Object.keys(I).filter(id => I[id][2].some(c => TEN.has(c)) || I[id][7]).map(Number);
  const tenSet = new Set(tenIds);
  const tenRecipes = DB.recipes.filter(r => /furniture/i.test(r[1]) || r[8].some(x => tenSet.has(x[0]))).map(r => r[0]);
  X = { R, makes, uses, fails, groupsOf, inTables, tableCount, tableScenes, VK, tableItems, furnTypes, tenIds, tenSet, tenRecipes,
        itemCats: [...new Set(Object.values(I).flatMap(i => i[2]))].sort(),
        rTypes: [...new Set(DB.recipes.map(r => r[2]))].sort(),
        fCats: [...new Set(Object.values(DB.furniture).map(f => f[1]))].sort() };
}

// ---------- rules (same as the mod's Data.cs) ----------
const sells = (v, id) => (v.i && v.i.includes(id)) || (v.t && X.tableItems[v.t] && X.tableItems[v.t].has(id));
function buys(v, id) {
  const it = DB.items[id]; if (v.b !== 1 || !it) return false;
  const title = it[0].toLowerCase(), cats = it[2].map(c => c.toLowerCase()), metas = it[8].map(m => m.toLowerCase());
  const match = rule => rule.startsWith('_item_') ? rule.slice(6).toLowerCase() === title
    : rule.startsWith('_Meta_') ? metas.some(m => m.endsWith(rule.slice(6).toLowerCase())) : cats.includes(rule.toLowerCase());
  const ok = !v.ba || !v.ba.length || v.ba.some(match);
  return ok && !(v.bf && v.bf.some(match));
}
const furnSells = (v, id) => !!(v.fs && v.fs.includes(id));
const furnBuys = (v, id) => v.fb === 'any' || (v.fb === 'same' && furnSells(v, id)) || (Array.isArray(v.fb) && v.fb.includes(id));

// ---------- icons (in-game sprites from tools/icons.py, place icons from the map's landmarks) ----------
function ico(sheet, key, big) {
  const I = DB.icons, c = I && I.sheets.includes(sheet) && I[sheet] ? I[sheet][key] : null;
  if (c == null) return `<i class="ic none${big ? ' big' : ''}"></i>`;
  return `<i class="ic${big ? ' big' : ''}" style="background-image:url(data/icons/sheets/${sheet}.png?v=${DB.iconsV || 1});--n:${I.cols};--c:${c % I.cols};--r:${Math.floor(c / I.cols)}"></i>`;
}
const imgIco = (src, big) => src ? `<img class="ic${big ? ' big' : ''}" src="${esc(src)}" alt="" loading="lazy">` : `<i class="ic none${big ? ' big' : ''}"></i>`;
function placeIcon(...names) {
  const L = DB.landmarkIcons || {}, keys = Object.keys(L).sort((a, b) => b.length - a.length), ns = names.filter(Boolean).map(n => n.toLowerCase());
  for (const n of ns) { const k = keys.find(k => k.toLowerCase() === n); if (k) return L[k]; }
  for (const n of ns) { const k = keys.find(k => k.length > 4 && n.length > 4 && (n.includes(k.toLowerCase()) || k.toLowerCase().includes(n))); if (k) return L[k]; }
  for (const n of ns) { const w = n.split(/\s+/)[0]; if (w.length < 5) continue; const k = keys.find(k => k.toLowerCase().split(/\s+/)[0] === w); if (k) return L[k]; }   // "Aziz's Hamburger…" ↔ "Aziz's Kebab…"
  return null;
}
const iIco = (id, big) => ico('items', id, big);
const rIco = (id, big) => { const I = DB.icons; if (I && I.recipes && I.recipes[id] != null) return ico('recipes', id, big); const out = ((X.R[id] || [])[8] || [])[0]; return iIco(out ? out[0] : -1, big); };
const fIco = (id, big) => ico('furniture', DB.furniture[id] ? DB.furniture[id][0] : '', big);
// The game has no real portraits: characters that have a Sprite share a silhouette, so it stands in for everyone.
function pIco(name, big) {
  const P = DB.icons && DB.icons.people; if (!P) return ico('people', name, big);
  if (P[name] == null) { const first = String(name).split(' ')[0]; const cells = Object.values(P); if (!cells.length) return ico('people', name, big);
    const mode = cells.sort((a, b) => cells.filter(x => x === b).length - cells.filter(x => x === a).length)[0];
    P[name] = P[first] != null ? P[first] : mode; }
  return ico('people', name, big);
}
function vIco(v, big) {
  const machine = /vending|machine|fountain|cart|counter/i.test(v.n);
  const first = v.i && v.i.length ? v.i[0] : v.t && DB.loot[v.t] && DB.loot[v.t][1].length ? DB.loot[v.t][1][0] : null;
  if (machine && first != null) return iIco(first, big);
  const src = placeIcon(v.n, v.o) || placeIcon(sceneName(v.sc));
  if (src) return imgIco(src, big);
  if (first != null) return iIco(first, big);
  const rule = (v.ba || []).find(r => r.startsWith('_item_'));
  const rid = rule && Object.keys(DB.items).find(id => DB.items[id][0].toLowerCase() === rule.slice(6).toLowerCase());
  if (rid) return iIco(rid, big);
  if (v.fs && v.fs.length) return fIco(v.fs[0], big);
  return imgIco(null, big);
}
function secIcon(k) {
  switch (k) {
    case 'items': { const I = DB.icons && DB.icons.items; return iIco(I && I[35100] == null ? Object.keys(I)[0] : 35100); }
    case 'recipes': return rIco(0);
    case 'vendors': return imgIco(placeIcon('One Stop Shop'));
    case 'tenement': return imgIco(placeIcon('Tenement'));
    case 'tenants': { const t = DB.tenants.find(t => DB.icons && DB.icons.people && DB.icons.people[t[0]] != null); return t ? pIco(t[0]) : imgIco(placeIcon('Open Homes Company')); }
    case 'furniture': return imgIco(placeIcon('Möbelmann Furnitures', 'Commercial Furniture Shop'));
    case 'notes': { const r = Object.keys(DB.items).find(id => DB.items[id][2].includes('Readable')); return r ? iIco(r) : ''; }
  }
  return '';
}

// ---------- helpers ----------
const iname = id => DB.items[id] ? DB.items[id][0] : 'Item #' + id;
const sceneName = slug => SCN[slug] ? SCN[slug].name : slug;
const link = (sec, key, text) => `<a class="dbl" href="#/db/${sec}/${encodeURIComponent(key)}">${esc(text)}</a>`;
const il = id => DB.items[id] ? `<span class="lk">${iIco(id)}${link('items', id, iname(id))}</span>` : `<span class="muted">Item #${id}</span>`;
const rl = id => `<span class="lk">${rIco(id)}${link('recipes', id, X.R[id][1])}</span>` + ` <small class="muted">${esc(X.R[id][2])}</small>`;
const vl = v => `<span class="lk">${vIco(v)}${link('vendors', v.key, v.n)}</span>` + ` <small class="muted">${esc(sceneName(v.sc))}</small>`;
const fl = id => DB.furniture[id] ? `<span class="lk">${fIco(id)}${link('furniture', id, DB.furniture[id][0])}</span>` : 'Furniture #' + id;
const price = f => [f[2] > 0 ? f[2] + ' OC' : '', f[3] > 0 ? f[3] + ' RM' : ''].filter(Boolean).join(' / ') || '—';
const hrs = s => s >= 3600 ? +(s / 3600).toFixed(1) + ' h' : s >= 60 ? Math.round(s / 60) + ' min' : s + ' s';
const num = x => (+x).toLocaleString(undefined, { maximumFractionDigits: 2 });
const mapBtn = (slug, q, text) => `<button class="go" data-map="${esc(slug)}" data-q="${esc(q || '')}">${esc(text || 'Show on the map')}</button>`;
const ul = a => a.length ? '<ul class="items">' + a.map(x => `<li>${x}</li>`).join('') + '</ul>' : '<p class="muted">None.</p>';
const recipesOf = set => set && set.size ? [...set].sort((a, b) => X.R[a][1].localeCompare(X.R[b][1])).map(rl) : [];
const skillsFor = types => [...new Set(types.flatMap(t => DB.typeSkills[t] || []))];

// ---------- lists ----------
function rows() {
  const q = V.q.trim().toLowerCase(), m = s => !q || String(s).toLowerCase().includes(q);
  const I = DB.items;
  const itemRows = ids => {
    let a = ids.filter(id => (m(I[id][0]) || String(id) === q) && (!V.f || I[id][2].includes(V.f)));
    a.sort(V.sort === 'value' ? (x, y) => I[y][1] - I[x][1] : (x, y) => I[x][0].localeCompare(I[y][0]));
    return a.map(id => [id, I[id][0], (X.inTables[id] ? '◆ ' : '') + (X.makes[id] ? '⚒ ' : '') + I[id][1] + ' OC', iIco(id)]);
  };
  switch (V.sec) {
    case 'items': return itemRows(Object.keys(I).map(Number));
    case 'tenement': return itemRows(X.tenIds);
    case 'recipes': return DB.recipes.filter(r => (m(r[1]) || r[8].some(x => m(iname(x[0])))) && (!V.f || r[2] === V.f))
      .sort((a, b) => a[1].localeCompare(b[1])).map(r => [r[0], r[1], r[2], rIco(r[0])]);
    case 'vendors': return DB.vendors.filter(v => m(v.n) || m(v.o || '') || m(sceneName(v.sc)) || (q.length > 2 && (v.t && m(v.t))))
      .filter(v => !V.f || (V.f === 'items' ? (v.t || v.i) : V.f === 'buys' ? v.b : V.f === 'furniture' ? (v.fs || v.fb) : V.f === 'vending' ? /vending|soda fountain/i.test(v.n) : true))
      .sort((a, b) => a.n.localeCompare(b.n) || sceneName(a.sc).localeCompare(sceneName(b.sc)))
      .map(v => [v.key, v.n, sceneName(v.sc), vIco(v)]);
    case 'tenants': return DB.tenants.filter(t => m(t[0]) || m((DB.people[t[0]] || [])[4] || '')).map(t => [t[0], t[0], (DB.people[t[0]] || [])[4] || '', pIco(t[0])]);
    case 'furniture': return Object.entries(DB.furniture).filter(([id, f]) => m(f[0]) && (!V.f || f[1] === V.f))
      .sort(V.sort === 'value' ? (a, b) => (b[1][2] + b[1][3] * 10) - (a[1][2] + a[1][3] * 10) : (a, b) => a[1][0].localeCompare(b[1][0]))
      .map(([id, f]) => [id, f[0], (f[4] && f[4].length ? '⚒ ' : '') + price(f), fIco(id)]);
  }
  return [];
}
function filters() {
  const opt = (list, all) => `<select id="dbF"><option value="">${all}</option>${list.map(c => `<option ${V.f === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  const sort = `<select id="dbSort"><option value="name">A–Z</option><option value="value" ${V.sort === 'value' ? 'selected' : ''}>Price ↓</option></select>`;
  if (V.sec === 'items' || V.sec === 'tenement') return opt(X.itemCats, 'All categories') + sort;
  if (V.sec === 'recipes') return opt(X.rTypes, 'All stations');
  if (V.sec === 'furniture') return opt(X.fCats, 'All categories') + sort;
  if (V.sec === 'vendors') return `<select id="dbF"><option value="">All vendors</option>${[['items', 'Sell items'], ['buys', 'Buy from you'], ['furniture', 'Furniture'], ['vending', 'Vending machines']].map(([k, t]) => `<option value="${k}" ${V.f === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return '';
}
const INTRO = {
  items: 'Every item in the game. ◆ can be found in containers or shops · ⚒ can be crafted.',
  recipes: 'Every recipe with its ingredients, station, skill and time.',
  vendors: 'Shops, traders, stalls and vending machines placed in the world: what they sell and what they buy from you.',
  tenement: 'Building materials and wall coverings for fixing up your tenement, and the recipes that make them.',
  tenants: 'People who can rent a flat from you, what they pay and what the flat needs.',
  furniture: 'Every piece of furniture, its price, the shops that sell and buy it, and what it lets you craft.',
  notes: 'Things in the game data that look wrong or inconsistent. Some may be intentional.',
};
function renderSide() {
  const el = $('#dbSide');
  const head = `<div class="dbnav">${SECTIONS.map(([k, t]) => `<a href="#/db/${k}" class="${V.sec === k ? 'on' : ''}">${secIcon(k)}${t}${k === 'notes' ? ` <b>${DB.notes.length}</b>` : ''}</a>`).join('')}</div>`;
  if (V.sec === 'notes') { el.innerHTML = head + `<p class="dbintro">${INTRO.notes}</p>`; return; }
  el.innerHTML = head + `<p class="dbintro">${INTRO[V.sec]}</p><div class="dbbar"><input id="dbQ" type="search" placeholder="Search ${esc(SECTIONS.find(s => s[0] === V.sec)[1].toLowerCase())}…" value="${esc(V.q)}" autocomplete="off">${filters()}</div><div id="dbList"></div>`;
  const q = $('#dbQ'); q.oninput = () => { V.q = q.value; V.lim = 300; renderList(); };
  const f = $('#dbF'); if (f) f.onchange = () => { V.f = f.value; V.lim = 300; renderList(); };
  const s = $('#dbSort'); if (s) s.onchange = () => { V.sort = s.value; renderList(); };
  renderList();
}
function renderList() {
  const r = rows(), el = $('#dbList'); if (!el) return;
  el.innerHTML = `<div class="dbcount">${r.length} ${r.length === 1 ? 'entry' : 'entries'}</div>` + (r.length ? r.slice(0, V.lim).map(([k, a, b, ic]) =>
    `<a class="row ${String(V.key) === String(k) ? 'on' : ''}" href="#/db/${V.sec}/${encodeURIComponent(k)}">${ic || ''}<span class="nm">${esc(a)}</span><span class="ct">${esc(b)}</span></a>`).join('')
    + (r.length > V.lim ? `<button class="dbmore" id="dbMore">Show ${r.length - V.lim} more</button>` : '') : '<div class="empty">Nothing matches.</div>');
  const mo = $('#dbMore'); if (mo) mo.onclick = () => { V.lim += 600; renderList(); };
}

// ---------- detail cards ----------
function itemCard(id) {
  const it = DB.items[id]; if (!it) return missing();
  const [t, val, cats, desc, stack, eff, grp, wall] = it;
  let h = `<div class="card"><div class="dbhead">${iIco(id, 1)}<div><h2>${esc(t)}</h2><div class="sub">ID ${id} · ${val} OC · stacks to ${stack}</div></div></div>`;
  if (desc) h += `<p>${esc(desc)}</p>`;
  h += `<div class="tags">${cats.map(c => `<a class="tag" href="#/db/items" data-cat="${esc(c)}">${esc(c)}</a>`).join('')}${eff.map(e => `<span class="tag teal">${e[0]} ${e[1]}</span>`).join('')}${wall ? `<span class="tag">${esc(wall)}</span>` : ''}</div>`;
  if (grp.length) h += `<h3>Any of these counts · ${grp.length}</h3>${ul(grp.map(il))}`;
  if (X.groupsOf[id]) h += `<h3>Counts as</h3><p>${X.groupsOf[id].map(il).join(', ')}</p>`;
  // where to find
  const tabs = [...(X.inTables[id] || [])].map(s => s.split('\u0000'));
  const placed = tabs.filter(([n]) => X.tableCount[n]).sort((a, b) => X.tableCount[b[0]] - X.tableCount[a[0]]);
  const shopTables = new Set(DB.vendors.map(v => v.t).filter(Boolean));
  const unplaced = tabs.filter(([n]) => !X.tableCount[n] && !shopTables.has(n));
  const total = placed.reduce((s, [n]) => s + X.tableCount[n], 0);
  h += `<h3>Found in containers · ${total}</h3>`;
  if (placed.length) {
    const best = X.tableScenes[placed[0][0]][0][0];
    const kinds = {}; placed.forEach(([n, k]) => (kinds[n] = kinds[n] || new Set()).add(k));
    h += ul(Object.entries(kinds).map(([n, k]) => `<span>${esc(n.trim())} <em class="${k.has('c') ? '' : 'rare'}">${k.size > 1 ? 'common &amp; rare' : k.has('r') ? 'rare' : 'common'}</em></span><small>${X.tableCount[n]} placed</small>`))
       + mapBtn(best, t, 'Show where on the map');
  } else h += '<p class="muted">Not in any placed container.</p>';
  if (unplaced.length) h += `<p class="muted">Also listed in ${[...new Set(unplaced.map(([n]) => n.trim()))].map(esc).join(', ')}, which ${unplaced.length > 1 ? 'are' : 'is'} not placed in any scene on the map (spawned at runtime, or unused).</p>`;
  const sv = DB.vendors.filter(v => sells(v, +id)), bv = DB.vendors.filter(v => buys(v, +id));
  h += `<h3>Sold by · ${sv.length}</h3>${ul(sv.map(vl))}<h3>Bought by · ${bv.length}</h3>${ul(bv.map(v => vl(v) + (v.bs ? ' <small class="muted">· buys stolen</small>' : '')))}`;
  const via = new Set(); (X.groupsOf[id] || []).forEach(g => (X.uses[g] || []).forEach(r => via.add(r)));
  h += `<h3>Made by · ${(X.makes[id] || []).size || 0}</h3>${ul(recipesOf(X.makes[id]))}`;
  if (X.fails[id]) h += `<h3>Comes out of a failed</h3>${ul(recipesOf(X.fails[id]))}`;
  h += `<h3>Used in · ${(X.uses[id] || []).size || 0}</h3>${ul(recipesOf(X.uses[id]))}`;
  if (via.size) h += `<h3>Used in, as part of a group · ${via.size}</h3>${ul(recipesOf(via))}`;
  return h + '</div>';
}
function recipeCard(id) {
  const r = X.R[id]; if (!r) return missing();
  const [, n, type, skill, minS, fail, time, inp, out, fout, cond, tags, req] = r;
  const io = a => ul(a.map(x => `<span>${il(x[0])}</span><small>× ${num(x[1])}</small>`));
  const st = DB.stations[type] || [], furn = (X.furnTypes[type] || []).map(Number);
  let h = `<div class="card"><div class="dbhead">${rIco(id, 1)}<div><h2>${esc(n)}</h2><div class="sub">Recipe #${id} · ${esc(type)}</div></div></div>
    <h3>Ingredients</h3>${io(inp)}<h3>Makes</h3>${io(out)}${fout.length ? `<h3>If it fails</h3>${io(fout)}` : ''}
    <h3>Details</h3><div class="facts"><span>Skill</span><span>${esc(skill)}${minS ? ' · min ' + minS : ''}</span><span>Fail chance</span><span>${Math.round(fail * 100)}%</span>
    <span>Time</span><span>${hrs(time)}</span><span>Recipe needed</span><span>${req ? 'yes, learn it first' : 'no'}</span>
    ${cond.length ? `<span>Station must be</span><span>${cond.map(esc).join(', ')}</span>` : ''}${tags.length ? `<span>Learned from</span><span>${tags.map(esc).join(', ')}</span>` : ''}</div>`;
  h += `<h3>Where to make it</h3>`;
  h += st.length ? `<p>Workstations on the map: ${st.map(esc).join(', ')}</p>` : '';
  h += furn.length ? `<p>Furniture you can buy: ${furn.sort((a, b) => DB.furniture[a][0].localeCompare(DB.furniture[b][0])).map(fl).join(', ')}</p>` : '';
  if (!st.length && !furn.length) h += '<p class="muted">No workstation or furniture with this station type was found.</p>';
  return h + '</div>';
}
function vendorCard(key) {
  const v = X.VK[key]; if (!v) return missing();
  let h = `<div class="card"><div class="dbhead">${vIco(v, 1)}<div><h2>${esc(v.n)}</h2><div class="sub">${esc(sceneName(v.sc))}${v.o && v.o !== v.n ? ' · run by ' + esc(v.o) : ''}</div></div></div>${mapBtn(v.sc, '', 'Open ' + sceneName(v.sc) + ' on the map')}`;
  if (v.t && DB.loot[v.t]) {
    const t = DB.loot[v.t], li = ids => ul([...new Set(ids)].sort((a, b) => iname(a).localeCompare(iname(b))).map(id => `<span>${il(id)}</span><small>${DB.items[id] ? DB.items[id][1] + ' OC' : ''}</small>`));
    h += `<h3>Stock · usually</h3>${li(t[1])}<h3>Stock · sometimes</h3>${li(t[2])}<p class="muted">Stock list “${esc(v.t)}”.</p>`;
  }
  if (v.i) h += `<h3>Always sells</h3>${ul([...new Set(v.i)].map(id => `<span>${il(id)}</span><small>${DB.items[id] ? DB.items[id][1] + ' OC' : ''}</small>`))}`;
  if (v.b) {
    const rule = r => r.startsWith('_item_') ? il(Object.keys(DB.items).find(id => DB.items[id][0].toLowerCase() === r.slice(6).toLowerCase()) || r.slice(6))
      : esc(r.replace(/^_Meta_/, 'items with ').replace(/^_?[Ii]tem_/, ''));
    h += `<h3>Buys from you</h3>`;
    h += v.ba && v.ba.length ? `<div class="tags">${v.ba.map(r => `<span class="tag">${rule(r)}</span>`).join('')}</div>` : '<p>Almost anything.</p>';
    if (v.bf && v.bf.length) h += `<p class="muted">Except:</p><div class="tags">${v.bf.map(r => `<span class="tag red">${rule(r)}</span>`).join('')}</div>`;
    h += v.bs ? '<p><b>Buys stolen goods.</b></p>' : '<p class="muted">Does not buy stolen goods.</p>';
  }
  if (v.fs) h += `<h3>Furniture for sale · ${v.fs.length}</h3>${ul(v.fs.slice().sort((a, b) => DB.furniture[a][0].localeCompare(DB.furniture[b][0])).map(id => `<span>${fl(id)}</span><small>${price(DB.furniture[id])}</small>`))}`;
  if (v.fb) h += `<h3>Buys furniture</h3><p>${v.fb === 'any' ? 'Any furniture.' : v.fb === 'same' ? 'The pieces it sells.' : v.fb.map(fl).join(', ')}</p>`;
  return h + '</div>';
}
function tenantCard(name) {
  const t = DB.tenants.find(t => t[0] === name); if (!t) return missing();
  const [n, rid, inc, meth, cmin, cmax, small, big, fmin, fmax, bath, el, heat, kit, wat, fam] = t, p = DB.people[n] || [];
  const yn = b => b ? '<b>needed</b>' : '<span class="muted">not needed</span>';
  const who = x => [x[1], x[2] != null && x[2] >= 0 && x[2] < 200 ? x[2] + ' years' : null, x[3], x[4]].filter(Boolean).map(esc).join(' · ');
  let h = `<div class="card"><div class="dbhead">${pIco(n, 1)}<div><h2>${esc(n)}</h2><div class="sub">${who(p) || 'Not in Characters.json'}</div></div></div>
    <h3>Rent they will pay</h3><table class="dbt"><tr>${inc.map((_, i) => `<th>Level ${i + 1}</th>`).join('')}</tr><tr>${inc.map(x => `<td>${x}</td>`).join('')}</tr></table>
    <p class="muted">Income1–6 from the rent table · method ${esc(meth)}${meth === 'OC' ? ' (paid in OC)' : meth === 'RM' ? ' (paid in Real Money)' : ''}.</p>
    <h3>The flat they want</h3><div class="facts"><span>Condition</span><span>${esc(cmin)} to ${esc(cmax)}</span><span>Size</span><span>${esc(small)} to ${esc(big)}</span>
    <span>Floor</span><span>${fmin || fmax ? fmin + '–' + fmax : 'any'}</span><span>Bathroom</span><span>${esc(bath)}</span><span>Heating</span><span>${esc(heat)}</span>
    <span>Electricity</span><span>${yn(el)}</span><span>Kitchen</span><span>${yn(kit)}</span><span>Water</span><span>${yn(wat)}</span></div>`;
  if (fam.length) h += `<h3>Moves in with</h3>${ul(fam.map(f => `<span>${pIco(f)}${esc(f)}</span><small>${who(DB.people[f] || [])}</small>`))}`;
  h += `<p class="muted">Rent table id ${rid}${p[0] != null ? ' · character ID ' + p[0] : ''}</p>${mapBtn('interior-player-tenement', '', 'Open your tenement on the map')}`;
  return h + '</div>';
}
function furnCard(id) {
  const f = DB.furniture[id]; if (!f) return missing();
  const types = f[4] || [], sk = skillsFor(types);
  const sv = DB.vendors.filter(v => furnSells(v, +id)), bv = DB.vendors.filter(v => furnBuys(v, +id));
  let h = `<div class="card"><div class="dbhead">${fIco(id, 1)}<div><h2>${esc(f[0])}</h2><div class="sub">${esc(f[1])} · ${price(f)}</div></div></div>`;
  if (types.length) {
    const rs = DB.recipes.filter(r => types.includes(r[2])).sort((a, b) => a[1].localeCompare(b[1]));
    h += `<p>Workstation: ${types.map(esc).join(', ')}${sk.length ? ' · trains ' + sk.map(esc).join(', ') : ''}</p><h3>Recipes · ${rs.length}</h3>${ul(rs.map(r => rl(r[0])))}`;
  }
  h += `<h3>Sold by · ${sv.length}</h3>${ul(sv.map(vl))}<h3>Bought by · ${bv.length}</h3>${ul(bv.map(vl))}`;
  return h + '</div>';
}
function tenementHome() {
  const recs = X.tenRecipes.slice().sort((a, b) => X.R[a][1].localeCompare(X.R[b][1]));
  return `<div class="card"><div class="dbhead">${imgIco(placeIcon('Tenement'), 1)}<div><h2>Your tenement</h2><div class="sub">${X.tenIds.length} materials · ${recs.length} recipes</div></div></div>
    <p>Pick a material on the left to see where to find it, who sells it and how to make it.</p>${mapBtn('interior-player-tenement', '', 'Open your tenement on the map')}
    <h3>Recipes that make materials or furniture</h3>${ul(recs.map(rl))}</div>`;
}
function notesCard() {
  return `<div class="card"><h2>Data notes</h2><div class="sub">${DB.notes.length} findings</div>${ul(DB.notes.map(esc))}
    <p class="muted">Regenerated by <code>tools/build_db.py</code> after each game patch.</p></div>`;
}
const missing = () => `<div class="card"><h2>Not found</h2><p class="muted">This entry isn't in the current data.</p></div>`;
function renderDetail() {
  const el = $('#dbDetail'), k = V.key;
  const home = { items: 'items', recipes: 'recipes', vendors: 'vendors', tenants: 'tenants', furniture: 'pieces of furniture' };
  if (V.sec === 'notes') el.innerHTML = notesCard();
  else if (k == null) el.innerHTML = V.sec === 'tenement' ? tenementHome() : `<div class="card"><h2>${esc(SECTIONS.find(s => s[0] === V.sec)[1])}</h2><p class="muted">${rows().length} ${home[V.sec]}. Pick one on the left.</p></div>`;
  else el.innerHTML = { items: itemCard, tenement: itemCard, recipes: recipeCard, vendors: vendorCard, tenants: tenantCard, furniture: furnCard }[V.sec](k);
  el.scrollTop = 0;
}

// ---------- routing ----------
const isDb = () => /^#\/db(\/|$)/.test(location.hash);
async function route() {
  if (!isDb()) { document.body.classList.remove('dbmode'); return; }
  document.body.classList.add('dbmode');
  $('#dbBtn').classList.add('on');
  const [, sec, key] = location.hash.slice(2).split('/').map(decodeURIComponent);
  const s = SECTIONS.some(x => x[0] === sec) ? sec : 'items';
  if (!DB) { $('#dbDetail').innerHTML = '<div class="card"><p>Opening the files…</p></div>'; try { await load(); } catch (e) { $('#dbDetail').innerHTML = '<div class="card"><h2>Could not load data/db.js</h2><p class="muted">Run tools/build_db.py.</p></div>'; return; } }
  const changed = s !== V.sec; V.sec = s; V.key = key ?? null;
  if (changed) { V.q = ''; V.f = ''; V.sort = 'name'; V.lim = 300; renderSide(); } else if (!$('#dbList') && s !== 'notes') renderSide(); else renderList();
  if (s === 'notes') renderSide();
  renderDetail();
  const on = $('#dbList .row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  document.title = 'Obenseuer Loot Map · ' + SECTIONS.find(x => x[0] === s)[1];
}
function leave(slug, q) {
  document.body.classList.remove('dbmode'); $('#dbBtn').classList.remove('on'); document.title = 'Obenseuer Loot Map';
  history.pushState(null, '', '#/' + slug);
  window.OBS_MAP && window.OBS_MAP.show(slug, q);
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-map]'); if (m) { e.preventDefault(); leave(m.dataset.map, m.dataset.q); return; }
  const c = e.target.closest('#dbDetail [data-cat]');
  if (c) { e.preventDefault(); V.sec = 'items'; V.q = ''; V.f = c.dataset.cat; V.key = null; history.pushState(null, '', '#/db/items'); renderSide(); renderDetail(); }
});
// Region tabs leave the database and go back to the map.
$('#regionTabs').addEventListener('click', e => { if (isDb() && e.target.closest('[data-region]')) { document.body.classList.remove('dbmode'); $('#dbBtn').classList.remove('on'); history.replaceState(null, '', '#/'); } }, true);
window.addEventListener('hashchange', route);
route();
})();

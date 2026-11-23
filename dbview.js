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
  ['tenants', 'Tenants'], ['furniture', 'Furniture'], ['list', 'Shopping list'], ['notes', 'Data notes'],
];
let DB = null, X = null;                       // raw data, derived indexes
const V = { sec: 'items', key: null, q: '', f: '', e: '', e2: '', min: '', w: '', view: 'list', col: '', dir: 1, sort: 'name', lim: 300, init: false };
// What using an item does (data/db.js item[9], base values). [key, label, text when positive, text when negative, shown first in the filter list]
const STATS = [
  ['nut', 'Nutrition', 'Fills you up', 'Makes you hungrier'], ['thi', 'Thirst', 'Quenches thirst', 'Makes you thirstier'],
  ['dep', 'Depression', 'Raises depression', 'Lowers depression'], ['hp', 'Health', 'Heals', 'Hurts'],
  ['ble', 'Bleeding', 'Causes bleeding', 'Stops bleeding'], ['tir', 'Tiredness', 'Makes you tired', 'Gives you energy'],
  ['hyg', 'Hygiene', 'Cleans you', 'Makes you dirty'], ['alc', 'Alcohol', 'Contains alcohol', null], ['nic', 'Nicotine', 'Contains nicotine', null],
  ['high', 'High', 'Gives a high', null], ['smv', 'SMV', 'Raises SMV', 'Lowers SMV'], ['smvr', 'SMV rate', 'Speeds up SMV', 'Slows down SMV'],
  ['aal', 'Alcohol addiction', 'Feeds alcohol addiction', 'Eases alcohol addiction'], ['mad', 'Mushroom addiction', 'Feeds mushroom addiction', 'Eases mushroom addiction'],
  ['sad', 'Smoking addiction', 'Feeds smoking addiction', 'Eases smoking addiction'],
];
const STAT = Object.fromEntries(STATS.map(s => [s[0], s]));
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + (+Math.abs(v).toFixed(3)).toLocaleString(undefined, { maximumFractionDigits: 3 });
const stat = (id, k) => { const s = DB.items[id] && DB.items[id][9]; return s && s[k] ? s[k] : 0; };

// ---------- loading & indexes ----------
function load() {
  if (DB) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'data/db.js?v=4';
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
  const statCount = {};
  for (const it of Object.values(I)) if (it[9]) for (const [k, v] of Object.entries(it[9])) if (STAT[k] && v) { const key = k + (v < 0 ? '-' : '+'); statCount[key] = (statCount[key] || 0) + 1; }
  X = { statCount, R, makes, uses, fails, groupsOf, inTables, tableCount, tableScenes, VK, tableItems, furnTypes, tenIds, tenSet, tenRecipes,
        itemCats: [...new Set(Object.values(I).flatMap(i => i[2]))].sort(),
        rTypes: [...new Set(DB.recipes.map(r => r[2]))].sort(),
        fCats: [...new Set(Object.values(DB.furniture).map(f => f[1]))].sort() };
  // economics from base values: what a recipe's ingredients are worth against what it makes (a group ingredient counts as its cheapest member)
  const unit = id => { const it = I[id]; if (!it) return 0; const g = it[6].map(m => I[m] ? I[m][1] : Infinity); const lo = Math.min(...g); return g.length && isFinite(lo) ? lo : it[1]; };
  X.unit = unit; X.RC = {}; X.craftCost = {}; X.craftProfit = {};
  for (const r of DB.recipes) {
    const cost = r[7].reduce((a, x) => a + unit(x[0]) * x[1], 0), worth = r[8].reduce((a, x) => a + (I[x[0]] ? I[x[0]][1] : 0) * x[1], 0);
    X.RC[r[0]] = { cost, worth, profit: worth - cost };
    for (const o of r[8]) {
      const per = cost / Math.max(o[1], 1), pr = (I[o[0]] ? I[o[0]][1] : 0) - per;
      if (X.craftCost[o[0]] == null || per < X.craftCost[o[0]]) X.craftCost[o[0]] = per;
      if (X.craftProfit[o[0]] == null || pr > X.craftProfit[o[0]]) X.craftProfit[o[0]] = pr;
    }
  }
  X.sold = new Set(Object.keys(I).map(Number).filter(id => DB.vendors.some(v => sells(v, id))));
  X.placed = new Set(Object.keys(X.inTables).map(Number).filter(id => [...X.inTables[id]].some(k => X.tableCount[k.split('\u0000')[0]])));
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

// ---------- shared helpers: numbers, URL state, shopping list ----------
const fmt = n => String(+(+n).toFixed(1));
const goodStat = (k, v) => k === 'dep' || k === 'ble' || k === 'tir' ? v < 0 : (k === 'nut' || k === 'thi' || k === 'hp' || k === 'hyg') ? v > 0 : null;
const wide = () => !matchMedia('(max-width:820px)').matches;
const tableOn = () => V.sec === 'items' && V.view === 'table' && wide();
const PARAMS = [['c', 'f'], ['e', 'e'], ['e2', 'e2'], ['min', 'min'], ['w', 'w'], ['s', 'sort'], ['q', 'q'], ['v', 'view'], ['col', 'col']];
const DEFAULTS = { f: '', e: '', e2: '', min: '', w: '', sort: 'name', q: '', view: 'list', col: '' };
const FIELDS = ['f', 'e', 'e2', 'min', 'w', 'sort', 'q', 'view', 'col', 'dir'];
const FRESH = { f: '', e: '', e2: '', min: '', w: '', sort: 'name', q: '', view: 'list', col: '', dir: 1 };
let SAVED = {}; try { SAVED = JSON.parse(sessionStorage.getItem('obs-dbstate') || '{}') || {}; } catch (e) {}
function stash() { SAVED[V.sec] = Object.fromEntries(FIELDS.map(f => [f, V[f]])); try { sessionStorage.setItem('obs-dbstate', JSON.stringify(SAVED)); } catch (e) {} }
const filtered = () => !!(V.f || V.e || V.e2 || V.min || V.w || V.q);
function qsOf() { const p = new URLSearchParams(); for (const [k, f] of PARAMS) if (V[f] !== DEFAULTS[f] && V[f] != null) p.set(k, V[f]); if (V.col && V.dir < 0) p.set('dir', 'd'); return p.toString(); }
function applyQs(qs) { const p = new URLSearchParams(qs); for (const [k, f] of PARAMS) V[f] = p.get(k) ?? DEFAULTS[f]; V.dir = p.get('dir') === 'd' ? -1 : 1; V.lim = 300; }
function setReport() {
  const a = $('#report'); if (!a) return;
  a.href = 'https://github.com/JuanBerta/obenseuer-loot-map/issues/new?title=' + encodeURIComponent('Data problem: ' + document.title) + '&body=' + encodeURIComponent('Page: ' + location.href + '\n\nWhat looks wrong?\n');
}
function syncUrl() {
  if (!isDb()) return;
  const qs = qsOf(); stash();
  history.replaceState(null, '', '#/db/' + V.sec + (V.key != null ? '/' + encodeURIComponent(V.key) : '') + (qs ? '?' + qs : ''));
  setReport();
}
const SHOP = 'obs-shop';
let shopMem = null;
const shopGet = () => { if (!shopMem) { try { shopMem = JSON.parse(localStorage.getItem(SHOP) || '{}') || {}; } catch (e) { shopMem = {}; } } return shopMem; };
const shopSave = () => { try { localStorage.setItem(SHOP, JSON.stringify(shopMem)); } catch (e) {} };
const shopCount = () => Object.keys(shopGet()).length;
const shopBadge = () => { const b = $('#shopN'); if (b) b.textContent = shopCount(); };
function shopChange(rid, d) { const L = shopGet(), n = Math.max(0, (L[rid] || 0) + d); if (n) L[rid] = n; else delete L[rid]; shopSave(); shopBadge(); }
let optMem = null;
const shopOpt = () => {
  if (!optMem) { try { optMem = JSON.parse(localStorage.getItem('obs-shop-opt') || 'null'); } catch (e) {} if (!optMem || typeof optMem !== 'object') optMem = {}; }
  if (!['all', 'missing', 'off'].includes(optMem.mode)) optMem.mode = 'all'; if (!optMem.pref || typeof optMem.pref !== 'object') optMem.pref = {};   // pref: item id -> 'craft' or 'buy', overriding the default
  return optMem;
};
const optSave = () => { try { localStorage.setItem('obs-shop-opt', JSON.stringify(optMem)); } catch (e) {} };
// The cheapest recipe that makes an item (by its ingredients' base value), ignoring recipes that need the item itself.
const bestMemo = {};
function bestRecipe(id) {
  if (id in bestMemo) return bestMemo[id];
  let best = null, bc = Infinity;
  for (const rid of X.makes[id] || []) {
    const r = X.R[rid]; if (r[7].some(x => x[0] === +id)) continue;
    const out = r[8].find(x => x[0] === +id), c = X.RC[rid].cost / Math.max(out[1], 1);
    if (c < bc) { bc = c; best = rid; }
  }
  return bestMemo[id] = best;
}
// Break the ingredients down: 'all' crafts everything craftable, 'missing' only what nothing in the world drops or sells, 'off' none. The buttons override this per item.
const wantCraft = (id, opt) => { const p = opt.pref[id]; return opt.mode !== 'off' && (p === 'craft' || (p !== 'buy' && (opt.mode === 'all' || (!X.placed.has(id) && !X.sold.has(id))))); };
function expandNeeds(base, opt) {
  const raw = {}, steps = {}, outs = {}, order = [];
  const visit = (id, n, stack) => {
    id = +id; const it = DB.items[id];
    const rid = wantCraft(id, opt) && !(it && it[6].length) && stack.length < 8 && !stack.includes(id) ? bestRecipe(id) : null;
    if (!rid) { raw[id] = (raw[id] || 0) + n; return; }
    const r = X.R[rid], per = r[8].find(x => x[0] === id)[1], b = n / per;
    r[7].forEach(x => visit(x[0], x[1] * b, stack.concat(id)));
    if (!(rid in steps)) { order.push(rid); outs[rid] = id; }
    steps[rid] = (steps[rid] || 0) + b;
  };
  Object.entries(base).forEach(([id, n]) => visit(id, n, []));
  return { raw, steps, outs, order };
}
const shopCtl = rid => { const n = shopGet()[rid] || 0; return n
  ? `<span class="shopctl"><button type="button" data-shop="${rid}" data-d="-1" aria-label="One less">−</button><span>On the list × ${n}</span><button type="button" data-shop="${rid}" data-d="1" aria-label="One more">+</button><button type="button" class="x" data-shop="${rid}" data-d="-999">Remove</button></span>`
  : `<button type="button" class="shopbtn" data-shop="${rid}" data-d="1">+ Shopping list</button>`; };
const shopBtn = rid => `<span class="shopwrap" data-rid="${rid}">${shopCtl(rid)}</span>`;
const econText = rid => { const e = X.RC[rid]; return `Ingredients ≈ ${fmt(e.cost)} OC · worth ≈ ${fmt(e.worth)} OC · <b class="${e.profit >= 0 ? 'good' : 'bad'}">${e.profit >= 0 ? '+' : '−'}${fmt(Math.abs(e.profit))} OC</b>`; };
const fxLine = id => { const st = DB.items[id] && DB.items[id][9]; if (!st) return ''; const t = STATS.filter(([k]) => st[k]).slice(0, 4).map(([k, l]) => `${l} ${sgn(st[k])}`); return t.length ? `<br><small class="muted">${t.join(' · ')}</small>` : ''; };

// ---------- lists ----------
function rows() {
  const q = V.q.trim().toLowerCase(), m = s => !q || String(s).toLowerCase().includes(q);
  const I = DB.items;
  const itemRows = ids => {
    const ek = V.e ? V.e.slice(0, -1) : '', ed = V.e ? V.e.slice(-1) : '';
    const e2 = V.e2 ? [V.e2.slice(0, -1), V.e2.slice(-1)] : null, min = parseFloat(V.min) || 0, w = V.w;
    const has = (id, k, d) => d === '-' ? stat(id, k) < 0 : stat(id, k) > 0;
    let a = ids.filter(id => (m(I[id][0]) || String(id) === q) && (!V.f || I[id][2].includes(V.f))
      && (!ek || (has(id, ek, ed) && Math.abs(stat(id, ek)) >= min)) && (!e2 || has(id, e2[0], e2[1]))
      && (!w.includes('c') || X.makes[id]) && (!w.includes('f') || X.placed.has(id)) && (!w.includes('s') || X.sold.has(id)));
    if (V.sort === 'cost' || V.sort === 'profit') a = a.filter(id => X.craftCost[id] != null);
    const mag = id => ek ? Math.abs(stat(id, ek)) : 0, per = id => I[id][1] > 0 ? mag(id) / I[id][1] : -1, BIG = 1e12;
    const name = (x, y) => I[x][0].localeCompare(I[y][0]);
    const cmp = { eh: (x, y) => mag(y) - mag(x), el: (x, y) => mag(x) - mag(y), ep: (x, y) => per(y) - per(x), value: (x, y) => I[y][1] - I[x][1],
      cost: (x, y) => (X.craftCost[x] ?? BIG) - (X.craftCost[y] ?? BIG), profit: (x, y) => (X.craftProfit[y] ?? -BIG) - (X.craftProfit[x] ?? -BIG) }[V.sort];
    a.sort(cmp ? (x, y) => cmp(x, y) || name(x, y) : name);
    return a.map(id => {
      const parts = [];
      if (ek) parts.push(sgn(stat(id, ek)) + ' ' + STAT[ek][1].toLowerCase());
      if (V.sort === 'ep' && ek) parts.push(per(id) < 0 ? '–' : +per(id).toFixed(2) + '/OC');
      if (V.sort === 'cost') parts.push('costs ' + fmt(X.craftCost[id]) + ' OC');
      if (V.sort === 'profit') parts.push((X.craftProfit[id] >= 0 ? '+' : '−') + fmt(Math.abs(X.craftProfit[id])) + ' OC');
      if (!parts.length) parts.push((X.inTables[id] ? '◆ ' : '') + (X.makes[id] ? '⚒ ' : '') + I[id][1] + ' OC');
      return [id, I[id][0], parts.join(' · '), iIco(id)];
    });
  };
  switch (V.sec) {
    case 'items': return itemRows(Object.keys(I).map(Number));
    case 'tenement': return itemRows(X.tenIds);
    case 'recipes': return DB.recipes.filter(r => (m(r[1]) || r[8].some(x => m(iname(x[0])))) && (!V.f || r[2] === V.f))
      .sort(V.sort === 'profit' ? (a, b) => X.RC[b[0]].profit - X.RC[a[0]].profit || a[1].localeCompare(b[1])
        : V.sort === 'cost' ? (a, b) => X.RC[a[0]].cost - X.RC[b[0]].cost || a[1].localeCompare(b[1]) : (a, b) => a[1].localeCompare(b[1]))
      .map(r => [r[0], r[1], V.sort === 'profit' ? (X.RC[r[0]].profit >= 0 ? '+' : '−') + fmt(Math.abs(X.RC[r[0]].profit)) + ' OC' : V.sort === 'cost' ? fmt(X.RC[r[0]].cost) + ' OC' : r[2], rIco(r[0])]);
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
  const so = (k, t) => `<option value="${k}" ${V.sort === k ? 'selected' : ''}>${t}</option>`;
  const sort = `<select id="dbSort"><option value="name">A–Z</option>${so('value', 'Price ↓')}${V.sec === 'items' && V.e ? so('eh', 'Strongest effect first') + so('el', 'Weakest effect first') : ''}</select>`;
  if (V.sec === 'items') {
    const effOpts = cur => STATS.flatMap(([k, , up, down]) => [[k + '+', up], [k + '-', down]]).filter(([key, t]) => t && X.statCount[key])
      .map(([key, t]) => `<option value="${key}" ${cur === key ? 'selected' : ''}>${esc(t)} (${X.statCount[key]})</option>`).join('');
    const sortI = `<select id="dbSort" aria-label="Sort"><option value="name">A–Z</option>${so('value', 'Price ↓')}${so('cost', 'Cheapest to make')}${so('profit', 'Best craft profit')}${V.e ? so('eh', 'Strongest effect first') + so('el', 'Weakest effect first') + so('ep', 'Best effect per OC') : ''}</select>`;
    const chips = [['c', 'Craftable'], ['f', 'In containers'], ['s', 'Sold in shops']].map(([k, t]) => `<button type="button" class="tg${V.w.includes(k) ? ' on' : ''}" data-w="${k}" aria-pressed="${V.w.includes(k)}">${t}</button>`).join('')
      + `<button type="button" class="tg deskonly${V.view === 'table' ? ' on' : ''}" id="dbView" aria-pressed="${V.view === 'table'}">Table view</button>`;
    return opt(X.itemCats, 'All categories') + sortI + `<select id="dbE" aria-label="Effect" title="Only items that change one of your stats"><option value="">Any effect</option>${effOpts(V.e)}</select>`
      + (V.e ? `<select id="dbE2" aria-label="Second effect" title="Also require this effect"><option value="">…and also</option>${effOpts(V.e2)}</select><input id="dbMin" type="number" min="0" step="any" inputmode="decimal" placeholder="Min strength" aria-label="Minimum strength" value="${esc(V.min)}">` : '')
      + `<div class="chips">${chips}</div>`;
  }
  if (V.sec === 'tenement') return opt(X.itemCats, 'All categories') + sort;
  if (V.sec === 'recipes') return opt(X.rTypes, 'All stations') + `<select id="dbSort" aria-label="Sort"><option value="name">A–Z</option>${so('profit', 'Best craft profit')}${so('cost', 'Cheapest ingredients')}</select>`;
  if (V.sec === 'furniture') return opt(X.fCats, 'All categories') + sort;
  if (V.sec === 'vendors') return `<select id="dbF"><option value="">All vendors</option>${[['items', 'Sell items'], ['buys', 'Buy from you'], ['furniture', 'Furniture'], ['vending', 'Vending machines']].map(([k, t]) => `<option value="${k}" ${V.f === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return '';
}
const INTRO = {
  items: 'Every item in the game. ◆ can be found in containers or shops · ⚒ can be crafted. Use “Any effect” to find food, drink and medicine by what they do to depression, nutrition, thirst and more.',
  recipes: 'Every recipe with its ingredients, station, skill and time.',
  vendors: 'Shops, traders, stalls and vending machines placed in the world: what they sell and what they buy from you.',
  tenement: 'Building materials and wall coverings for fixing up your tenement, and the recipes that make them.',
  tenants: 'People who can rent a flat from you, what they pay and what the flat needs.',
  furniture: 'Every piece of furniture, its price, the shops that sell and buy it, and what it lets you craft.',
  list: 'Recipes you plan to make, with everything you need and where to find it.',
  notes: 'Things in the game data that look wrong or inconsistent. Some may be intentional.',
};
function renderSide() {
  const el = $('#dbSide');
  const head = `<div class="dbnav">${SECTIONS.map(([k, t]) => `<a href="#/db/${k}" class="${V.sec === k ? 'on' : ''}">${secIcon(k)}${t}${k === 'notes' ? ` <b>${DB.notes.length}</b>` : k === 'list' ? ` <b id="shopN">${shopCount()}</b>` : ''}</a>`).join('')}</div>`;
  if (V.sec === 'notes' || V.sec === 'list') { el.innerHTML = head + `<p class="dbintro">${INTRO[V.sec]}</p>`; return; }
  el.innerHTML = head + `<p class="dbintro">${INTRO[V.sec]}</p><div class="dbbar${V.sec === 'items' ? ' multi' : ''}"><input id="dbQ" type="search" placeholder="Search ${esc(SECTIONS.find(s => s[0] === V.sec)[1].toLowerCase())}…" value="${esc(V.q)}" autocomplete="off">${filters()}</div><div id="dbList"></div>`;
  const q = $('#dbQ'); q.oninput = () => { V.q = q.value; V.lim = 300; renderList(); };
  const f = $('#dbF'); if (f) f.onchange = () => { V.f = f.value; V.lim = 300; renderList(); };
  const s = $('#dbSort'); if (s) s.onchange = () => { V.sort = s.value; renderList(); };
  const e = $('#dbE'); if (e) e.onchange = () => {
    V.e = e.value; V.lim = 300; if (!V.e) { V.e2 = ''; V.min = ''; }
    V.sort = V.e ? 'eh' : (['eh', 'el', 'ep'].includes(V.sort) ? 'name' : V.sort); renderSide();
  };
  const e2 = $('#dbE2'); if (e2) e2.onchange = () => { V.e2 = e2.value; V.lim = 300; renderList(); };
  const mn = $('#dbMin'); if (mn) mn.oninput = () => { V.min = mn.value; V.lim = 300; renderList(); };
  el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
    const k = b.dataset.w; V.w = V.w.includes(k) ? V.w.replace(k, '') : V.w + k; b.classList.toggle('on'); b.setAttribute('aria-pressed', V.w.includes(k)); V.lim = 300; renderList();
  });
  const vw = $('#dbView'); if (vw) vw.onclick = () => { V.view = V.view === 'table' ? 'list' : 'table'; vw.classList.toggle('on', V.view === 'table'); vw.setAttribute('aria-pressed', V.view === 'table'); renderDetail(); syncUrl(); };
  renderList();
}
function renderList() {
  const r = rows(), el = $('#dbList'); if (!el) return;
  el.innerHTML = `<div class="dbcount">${r.length} ${r.length === 1 ? 'entry' : 'entries'}${filtered() ? ' · <button type="button" class="linkbtn" id="dbReset">Reset filters</button>' : ''}</div>` + (r.length ? r.slice(0, V.lim).map(([k, a, b, ic]) =>
    `<a class="row ${String(V.key) === String(k) ? 'on' : ''}" href="#/db/${V.sec}/${encodeURIComponent(k)}">${ic || ''}<span class="nm">${esc(a)}</span><span class="ct">${esc(b)}</span></a>`).join('')
    + (r.length > V.lim ? `<button class="dbmore" id="dbMore">Show ${r.length - V.lim} more</button>` : '') : '<div class="empty">Nothing matches.</div>');
  const rs = $('#dbReset'); if (rs) rs.onclick = () => { Object.assign(V, FRESH, { view: V.view }); V.lim = 300; renderSide(); if (V.key == null) renderDetail(); };
  const mo = $('#dbMore'); if (mo) mo.onclick = () => { V.lim += 600; renderList(); };
  if (tableOn() && V.key == null) renderDetail();
  syncUrl();
}

// ---------- detail cards ----------
function itemCard(id) {
  const it = DB.items[id]; if (!it) return missing();
  const [t, val, cats, desc, stack, eff, grp, wall] = it;
  let h = `<div class="card"><div class="dbhead">${iIco(id, 1)}<div><h2>${esc(t)}</h2><div class="sub">ID ${id} · ${val} OC · stacks to ${stack}${X.craftCost[id] != null ? ' · costs ≈ ' + fmt(X.craftCost[id]) + ' OC to make' : ''}</div></div></div>`;
  if (desc) h += `<p>${esc(desc)}</p>`;
  h += `<div class="tags">${cats.map(c => `<a class="tag" href="#/db/items" data-cat="${esc(c)}">${esc(c)}</a>`).join('')}${eff.map(e => `<span class="tag teal">${e[0]} ${e[1]}</span>`).join('')}${wall ? `<span class="tag">${esc(wall)}</span>` : ''}</div>`;
  const st = it[9];
  if (st) {
    const rows = STATS.filter(([k]) => st[k]).map(([k, lab, up, down]) => { const v = st[k], good = k === 'dep' || k === 'ble' ? v < 0 : k === 'tir' ? v < 0 : (k === 'nut' || k === 'thi' || k === 'hp' || k === 'hyg') ? v > 0 : null;
      return `<span>${esc(lab)}</span><span class="${good == null ? '' : good ? 'good' : 'bad'}">${sgn(v)} <small class="muted">${esc((v > 0 ? up : down) || '')}</small></span>`; });
    if (st.fx) rows.push(`<span>Special effect</span><span>${esc(st.fx)}${st.fxa ? ' ' + sgn(st.fxa) : ''}</span>`);
    h += `<h3>When used</h3><div class="facts">${rows.join('')}</div><p class="muted">Base values. The game scales depression by your mood, and everything by freshness and quality.</p>`;
  }
  const mk = [...(X.makes[id] || [])].sort((a, b) => X.R[a][1].localeCompare(X.R[b][1]));
  if (mk.length) h += `<h3>How to craft · ${mk.length}</h3>${mk.map(r => craftBlock(r, id)).join('')}`;
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
  if (X.fails[id]) h += `<h3>Comes out of a failed</h3>${ul(recipesOf(X.fails[id]))}`;
  h += `<h3>Used in · ${(X.uses[id] || []).size || 0}</h3>${ul(recipesOf(X.uses[id]))}`;
  if (via.size) h += `<h3>Used in, as part of a group · ${via.size}</h3>${ul(recipesOf(via))}`;
  return h + '</div>';
}
// A recipe as a short block: name and station, what goes in, what it takes.
function craftBlock(rid, forItem) {
  const r = X.R[rid], [, n, type, skill, minS, fail, time, inp, out] = r;
  const mk = out.find(x => x[0] === +forItem), more = mk && mk[1] > 1 ? ` <small class="muted">makes ${num(mk[1])}</small>` : '';
  return `<div class="craft"><div class="ch">${rl(rid)}${more}</div><div class="ci">${inp.map(x => `<span>${il(x[0])} <small class="muted">× ${num(x[1])}</small></span>`).join('')}</div>
    <div class="cm muted">${esc(skill)}${minS ? ' ' + minS + '+' : ''} · ${hrs(time)} · ${Math.round(fail * 100)}% fail</div>
    <div class="cm">${econText(rid)}</div>${shopBtn(rid)}</div>`;
}
function recipeCard(id) {
  const r = X.R[id]; if (!r) return missing();
  const [, n, type, skill, minS, fail, time, inp, out, fout, cond, tags, req] = r;
  const io = a => ul(a.map(x => `<span>${il(x[0])}</span><small>× ${num(x[1])}</small>`));
  const ioOut = a => ul(a.map(x => `<span>${il(x[0])}${fxLine(x[0])}</span><small>× ${num(x[1])}</small>`));
  const st = DB.stations[type] || [], furn = (X.furnTypes[type] || []).map(Number);
  let h = `<div class="card"><div class="dbhead">${rIco(id, 1)}<div><h2>${esc(n)}</h2><div class="sub">Recipe #${id} · ${esc(type)}</div></div></div>${shopBtn(id)}
    <h3>Ingredients</h3>${io(inp)}<h3>Makes</h3>${ioOut(out)}${fout.length ? `<h3>If it fails</h3>${io(fout)}` : ''}
    <h3>Details</h3><div class="facts"><span>Skill</span><span>${esc(skill)}${minS ? ' · min ' + minS : ''}</span><span>Fail chance</span><span>${Math.round(fail * 100)}%</span>
    <span>Time</span><span>${hrs(time)}</span><span>Recipe needed</span><span>${req ? 'yes, learn it first' : 'no'}</span><span>Value</span><span>${econText(id)}</span>
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
const foundCount = id => [...new Set([...(X.inTables[id] || [])].map(k => k.split('\u0000')[0]))].reduce((a, n) => a + (X.tableCount[n] || 0), 0);
const COLS = [
  ['name', 'Name', id => DB.items[id][0]], ['val', 'Value', id => DB.items[id][1] || null], ['nut', 'Nutrition', id => stat(id, 'nut') || null],
  ['thi', 'Thirst', id => stat(id, 'thi') || null], ['dep', 'Depression', id => stat(id, 'dep') || null], ['hp', 'Health', id => stat(id, 'hp') || null],
  ['cost', 'Cost to make', id => X.craftCost[id] ?? null], ['made', 'Made by', id => (X.makes[id] || { size: 0 }).size || null],
  ['used', 'Used in', id => (X.uses[id] || { size: 0 }).size || null], ['found', 'Found in', id => foundCount(id) || null],
];
const STATCOL = new Set(['nut', 'thi', 'dep', 'hp']);
function tableCard() {
  let ids = rows().map(r => r[0]);
  const c = COLS.find(c => c[0] === V.col);
  if (c) ids.sort((x, y) => { const a = c[2](x), b = c[2](y); if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; return (typeof a === 'string' ? a.localeCompare(b) : a - b) * V.dir; });
  const head = COLS.map(([k, t]) => `<th scope="col"><button type="button" class="sortb${V.col === k ? ' on' : ''}" data-col="${k}">${t}${V.col === k ? (V.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const body = ids.slice(0, V.lim).map(id => `<tr data-go="${id}"><td>${iIco(id)}${link('items', id, iname(id))}</td>${COLS.slice(1).map(([k, , g]) => {
    const v = g(id); if (v == null) return '<td class="muted">–</td>';
    if (STATCOL.has(k)) { const good = goodStat(k, v); return `<td class="${good == null ? '' : good ? 'good' : 'bad'}">${sgn(v)}</td>`; }
    return `<td>${fmt(v)}</td>`; }).join('')}</tr>`).join('');
  return `<div class="card wide"><div class="dbhead"><div><h2>Items</h2><div class="sub">${ids.length} match · click a column to sort, a row to open it</div></div></div>
    <div class="tblwrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
    ${ids.length > V.lim ? `<button type="button" class="dbmore" id="tblMore">Show ${Math.min(600, ids.length - V.lim)} more</button>` : ''}
    <p class="muted">Base values. Nutrition, thirst, depression and health are what the item does when used.</p></div>`;
}
function whereIs(id) {
  const it = DB.items[id], parts = []; let btn = '';
  if (it && it[6].length) return { parts: ['any of ' + it[6].length + ' items'], btn };
  const tabs = [...new Set([...(X.inTables[id] || [])].map(k => k.split('\u0000')[0]).filter(n => X.tableCount[n]))].sort((a, b) => X.tableCount[b] - X.tableCount[a]);
  if (tabs.length) { parts.push('in ' + tabs.reduce((a, n) => a + X.tableCount[n], 0) + ' containers'); btn = mapBtn(X.tableScenes[tabs[0]][0][0], iname(id), 'Find on the map'); }
  const sv = DB.vendors.filter(v => sells(v, +id)); if (sv.length) parts.push('sold by ' + sv.length + ' shop' + (sv.length > 1 ? 's' : ''));
  if (X.makes[id]) parts.push('craftable');
  if (!parts.length) parts.push('not found in the world data');
  return { parts, btn };
}
function listCard() {
  const L = shopGet(), o = shopOpt(), up = n => Math.ceil(n - 1e-9);
  const rids = Object.keys(L).filter(id => X.R[id]).sort((a, b) => X.R[a][1].localeCompare(X.R[b][1]));
  if (!rids.length) return `<div class="card"><h2>Shopping list</h2><p class="muted">Nothing here yet. Open a recipe, or the “How to craft” box on an item, and press “+ Shopping list”. The list adds up every ingredient, including what it takes to craft the ingredients, and tells you where to find it. It is saved in this browser only.</p></div>`;
  const need = {}, make = {}; let cost = 0, worth = 0;
  for (const rid of rids) { const n = L[rid], r = X.R[rid]; r[7].forEach(x => { need[x[0]] = (need[x[0]] || 0) + x[1] * n; }); r[8].forEach(x => { make[x[0]] = (make[x[0]] || 0) + x[1] * n; }); cost += X.RC[rid].cost * n; worth += X.RC[rid].worth * n; }
  for (const id of Object.keys(need)) { if (make[id]) need[id] = Math.max(0, need[id] - make[id]); if (!need[id]) delete need[id]; }   // a recipe on the list may already make what another needs
  const E = expandNeeds(need, o), byName = a => a.sort((x, y) => iname(x[0]).localeCompare(iname(y[0])));
  const rawCost = Object.entries(E.raw).reduce((a, [id, n]) => a + X.unit(id) * up(n), 0);
  const crafted = E.order.length;
  return `<div class="card"><h2>Shopping list</h2><div class="sub">${rids.length} recipe${rids.length > 1 ? 's' : ''} · ${o.mode !== 'off' ? 'raw materials' : 'ingredients'} ≈ ${fmt(o.mode !== 'off' ? rawCost : cost)} OC · worth ≈ ${fmt(worth)} OC</div>
    <label class="shopopt">Ingredients <select data-shopmode aria-label="How far to break ingredients down"><option value="all" ${o.mode === 'all' ? 'selected' : ''}>Break down everything craftable</option><option value="missing" ${o.mode === 'missing' ? 'selected' : ''}>Only what can't be found or bought</option><option value="off" ${o.mode === 'off' ? 'selected' : ''}>Don't break down</option></select></label>
    <h3>Recipes</h3>${rids.map(rid => `<div class="shoprow"><span>${rl(rid)}</span><span class="qty"><button type="button" data-shop="${rid}" data-d="-1" aria-label="One less">−</button><b>× ${L[rid]}</b><button type="button" data-shop="${rid}" data-d="1" aria-label="One more">+</button><button type="button" class="x" data-shop="${rid}" data-d="-999" aria-label="Remove from the list">✕</button></span></div>`).join('')}
    ${crafted ? `<h3>Craft these first · ${crafted}</h3>${ul(E.order.map(rid => { const out = E.outs[rid], per = X.R[rid][8].find(x => x[0] === out)[1], b = up(E.steps[rid]);
      return `<span>${rl(rid)} <small class="muted">× ${b} → ${num(per * b)} ${esc(iname(out))}</small></span><button type="button" class="shopbtn mini" data-pref="${out}:buy" title="Find or buy it instead of crafting it">Find or buy instead</button>`; }))}` : ''}
    <h3>${o.mode !== 'off' ? 'Get these' : 'You will need'}</h3>${ul(byName(Object.entries(E.raw)).map(([id, n]) => { const w = whereIs(id), back = o.mode !== 'off' && bestRecipe(+id) && !(DB.items[id] && DB.items[id][6].length);
      return `<span>${il(id)} <small class="muted">× ${num(up(n))}</small><br><small class="muted">${w.parts.join(' · ')}</small></span>${w.btn}${back ? `<button type="button" class="shopbtn mini" data-pref="${id}:craft">Craft it instead</button>` : ''}`; }))}
    <h3>You will make</h3>${ul(byName(Object.entries(make)).map(([id, n]) => `<span>${il(id)}</span><small>× ${num(n)}</small>`))}
    <button type="button" class="dbmore" data-shop="clear">Clear the list</button></div>`;
}
function notesCard() {
  return `<div class="card"><h2>Data notes</h2><div class="sub">${DB.notes.length} findings</div>${ul(DB.notes.map(esc))}
    <p class="muted">Regenerated by <code>tools/build_db.py</code> after each game patch.</p></div>`;
}
const missing = () => `<div class="card"><h2>Not found</h2><p class="muted">This entry isn't in the current data.</p></div>`;
function renderDetail() {
  const el = $('#dbDetail'), k = V.key, bare = V.sec === 'notes' || V.sec === 'list', tbl = tableOn();
  const back = `<a class="dbback${tbl && V.sec === 'items' ? ' show' : ''}" href="#/db/${bare ? 'items' : V.sec}">${tbl && V.sec === 'items' ? '← Back to the table' : '← Back to the list'}</a>`;
  const home = { items: 'items', recipes: 'recipes', vendors: 'vendors', tenants: 'tenants', furniture: 'pieces of furniture' };
  if (V.sec === 'notes') el.innerHTML = notesCard();
  else if (V.sec === 'list') el.innerHTML = listCard();
  else if (k == null && tbl) el.innerHTML = tableCard();
  else if (k == null) el.innerHTML = V.sec === 'tenement' ? tenementHome() : `<div class="card"><h2>${esc(SECTIONS.find(s => s[0] === V.sec)[1])}</h2><p class="muted">${rows().length} ${home[V.sec]}. Pick one on the left.</p></div>`;
  else el.innerHTML = { items: itemCard, tenement: itemCard, recipes: recipeCard, vendors: vendorCard, tenants: tenantCard, furniture: furnCard }[V.sec](k);
  if (k != null || bare) el.insertAdjacentHTML('afterbegin', back);
  const more = $('#tblMore'); if (more) more.onclick = () => { V.lim += 600; renderDetail(); };
  el.scrollTop = 0;
}

// ---------- routing ----------
const isDb = () => /^#\/db(\/|$)/.test(location.hash);
async function route() {
  if (!isDb()) { document.body.classList.remove('dbmode'); return; }
  document.body.classList.add('dbmode');
  $('#dbBtn').classList.add('on');
  const raw = location.hash.slice(2), qi = raw.indexOf('?'), qs = qi < 0 ? '' : raw.slice(qi + 1);
  const [, sec, key] = (qi < 0 ? raw : raw.slice(0, qi)).split('/').map(decodeURIComponent);
  const s = SECTIONS.some(x => x[0] === sec) ? sec : 'items';
  if (!DB) { $('#dbDetail').innerHTML = '<div class="card"><p>Opening the files…</p></div>'; try { await load(); } catch (e) { $('#dbDetail').innerHTML = '<div class="card"><h2>Could not load data/db.js</h2><p class="muted">Run tools/build_db.py.</p></div>'; return; } }
  const changed = s !== V.sec || !V.init, bare = s === 'notes' || s === 'list';
  V.sec = s; V.key = key ?? null;
  document.body.classList.toggle('dbpick', V.key != null || bare);   // phones: show the list or the entry, not both
  if (changed) { Object.assign(V, FRESH, SAVED[s] || {}); V.lim = 300; }
  const applied = !!qs && (changed || qs !== qsOf()); if (applied) applyQs(qs);
  V.init = true;
  if (bare || changed || applied || !$('#dbList')) renderSide(); else renderList();
  renderDetail();
  const on = $('#dbList .row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  document.title = 'Obenseuer Loot Map · ' + SECTIONS.find(x => x[0] === s)[1];
  syncUrl();
}
function leave(slug, q) {
  document.body.classList.remove('dbmode'); $('#dbBtn').classList.remove('on'); document.title = 'Obenseuer Loot Map';
  history.pushState(null, '', '#/' + slug);
  window.OBS_MAP && window.OBS_MAP.show(slug, q);
}
document.addEventListener('click', e => {
  const sb = e.target.closest('[data-shop]');
  if (sb) {
    e.preventDefault(); const v = sb.dataset.shop;
    if (v === 'clear') { shopMem = {}; shopSave(); shopBadge(); } else shopChange(v, +sb.dataset.d || 1);
    if (V.sec === 'list') renderDetail(); else document.querySelectorAll('.shopwrap').forEach(w => { if (w.dataset.rid === v) w.innerHTML = shopCtl(v); });
    return;
  }
  const ko = e.target.closest('[data-pref]');
  if (ko) { const [id, how] = ko.dataset.pref.split(':'); shopOpt().pref[id] = how; optSave(); renderDetail(); return; }
  const sc = e.target.closest('[data-col]');
  if (sc) { const k = sc.dataset.col; if (V.col === k) V.dir = -V.dir; else { V.col = k; V.dir = k === 'name' ? 1 : -1; } renderDetail(); syncUrl(); return; }
  const tr = e.target.closest('tr[data-go]');
  if (tr && !e.target.closest('a')) { location.hash = '#/db/items/' + tr.dataset.go; return; }
  const m = e.target.closest('[data-map]'); if (m) { e.preventDefault(); leave(m.dataset.map, m.dataset.q); return; }
  const c = e.target.closest('#dbDetail [data-cat]');
  if (c) { e.preventDefault(); V.sec = 'items'; V.q = ''; V.f = c.dataset.cat; V.e = ''; V.e2 = ''; V.min = ''; if (['eh', 'el', 'ep'].includes(V.sort)) V.sort = 'name'; V.key = null; history.pushState(null, '', '#/db/items'); renderSide(); renderDetail(); }
});
// Region tabs leave the database and go back to the map.
$('#regionTabs').addEventListener('click', e => { if (isDb() && e.target.closest('[data-region]')) { document.body.classList.remove('dbmode'); $('#dbBtn').classList.remove('on'); history.replaceState(null, '', '#/'); } }, true);
document.addEventListener('change', e => { const m = e.target.closest('[data-shopmode]'); if (m) { shopOpt().mode = m.value; optSave(); renderDetail(); } });
window.addEventListener('hashchange', () => { route(); setReport(); });
// footer: game version, theme switch
fetch('data/meta.json?v=1').then(r => r.json()).then(m => {
  const g = $('#gver'); if (g && m.version) g.textContent = ' · Game version ' + m.version + (m.build ? ' (Steam build ' + m.build + (m.updated ? ', ' + m.updated : '') + ')' : '');
}).catch(() => {});
const themeBtn = $('#themeBtn');
function paintTheme() { const l = document.documentElement.dataset.theme === 'light'; if (themeBtn) { themeBtn.textContent = l ? 'Dark theme' : 'Light theme'; themeBtn.setAttribute('aria-pressed', l); } }
if (themeBtn) themeBtn.onclick = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; try { localStorage.setItem('obs-theme', t); } catch (e) {} paintTheme(); };
paintTheme(); setReport();
route();
})();

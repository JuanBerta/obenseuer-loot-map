(() => {
'use strict';
const IDX = window.OBS_INDEX;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VIEWER = 'https://obenseuer-viewer.pages.dev/#/spawn/';
const REGIONS = [
  { id: 'Tenement', label: 'Tenement', home: 'open-sewer-tenement' },
  { id: 'Bazaar', label: 'Bazaar', home: 'open-sewer-bazaar' },
  { id: 'Mines', label: 'Mines', home: 'open-sewer-mines' },
  { id: 'Elsewhere', label: 'Elsewhere', home: 'open-sewer-metro' },
];
const SC = Object.fromEntries(IDX.scenes.map(s => [s.slug, s]));
const LOOT = IDX.loot, ITEMS = IDX.items;
const itemName = id => (ITEMS[id] ? ITEMS[id][0] : 'Item #' + id);
const hasTable = c => !!(c && LOOT[c]);
const tableText = {};
const GROUPS = IDX.groups || {};   // item groups: Metal Recycle is found through the nails and tin cans that count as one
const nameWithGroups = id => itemName(id) + (GROUPS[id] ? '\n' + GROUPS[id].join('\n') : '');
for (const [n, t] of Object.entries(LOOT)) tableText[n] = (n + '\n' + [...t.common, ...t.rare].map(nameWithGroups).join('\n')).toLowerCase();
const TOTALS = {};
for (const s of IDX.scenes) for (const [c, k] of Object.entries(s.cats)) TOTALS[c] = (TOTALS[c] || 0) + k;
const IMG = {};
const DOOR = { open: ['#2b2a27', 'open'], pick: ['#6b3fa0', 'locked · lockpick it'], key: ['#2c6fa6', 'locked · needs a key'], locked: ['#b0651a', 'locked · opens another way'], blocked: ['#8c8577', 'not accessible'], closed: ['#8c8577', 'not open in this version of the game'] };
const tenantOf = n => ((window.OBS_RENTERS || {}).r || []).find(r => r.n === n);
const VERT = { stairs: 'Stairs', ladder: 'Ladder', elevator: 'Elevator' };
const doorState = f => f.kind === 'idoor' ? (f.lock || 'open') : !f.toSlug ? 'closed' : (f.lock || 'open');
function img(src) {
  if (!IMG[src]) { const i = new Image(); i.onload = () => draw(); i.src = src; IMG[src] = i; }
  return IMG[src].complete && IMG[src].naturalWidth ? IMG[src] : null;
}
const LM_GROUPS = (() => {
  const g = new Map();
  for (const l of IDX.landmarks) {
    const k = l.map + ':' + Math.round(l.x) + ':' + Math.round(l.z) + ':' + (l.w > 0 ? 'a' + l.t : 'p');
    if (!g.has(k)) g.set(k, Object.assign({}, l, { titles: [] }));
    g.get(k).titles.push(l.t);
  }
  return [...g.values()];
})();
const S = { scene: null, data: null, q: '', cat: null, sel: null, floor: -1, floors: [], region: 'Bazaar',
  view: { cx: 0, cz: 0, s: 4 }, layers: {}, hover: null, autoFit: true, userPlan: null, own: 'all', selF: null };
const RECIPES = IDX.recipes || {}, STYPES = IDX.stationTypes || {};
function stationText(title) { const t = STYPES[title] || []; return (title + '\n' + t.join('\n') + '\n' + t.flatMap(x => RECIPES[x] || []).join('\n')).toLowerCase(); }
const STEXT = {}; for (const t of Object.keys(STYPES)) STEXT[t] = stationText(t);
const stationMatches = f => !S.cat && qTerm() && (f.kind === 'vendor' ? ((f.title || '').toLowerCase().has(qTerm()) || (f.items || []).some(id => itemName(id).toLowerCase().has(qTerm())))
  : f.kind === 'station' && f.title && ((STEXT[f.title] || f.title.toLowerCase()).has(qTerm()) || furnAlias().has(f.title)));
const cache = {};
// The furniture shops sell (“Metalworking Lathe”) is placed on the map under a shorter workstation name (“Lathe”): a search for the furniture lights up those stations too.
let aliasQ = null, aliasSet = new Set();
function furnAlias() {
  const q = S.cat ? '' : qTerm(); if (q === aliasQ && (FDB || !q)) return aliasSet;
  aliasQ = q; aliasSet = new Set(); const D = q.length > 1 ? furnDb() : null; if (!D) { if (q.length > 1) aliasQ = null; return aliasSet; }
  const names = Object.values(D.furniture).map(f => f[0].toLowerCase()).filter(n => n.has(q));
  for (const t of Object.keys(STYPES)) { const tl = t.toLowerCase(); if (tl.length >= 4 && names.some(n => n.includes(tl))) aliasSet.add(t); }
  return aliasSet;
}

// ---------- search ----------
const qTerm = () => S.q.trim().toLowerCase();
// Several searches at once: "duct tape | rope" matches either (used by "find the ingredients on the map").
String.prototype.has = function (q) { if (!q) return true; return q.split('|').some(t => { t = t.trim(); return t && this.includes(t); }); };
const searching = () => !!(S.cat || qTerm());
function tableMatches(c) { if (S.cat) return c === S.cat; const q = qTerm(); return !q || !!(tableText[c] && tableText[c].has(q)); }
function pointMatches(p) {
  if (S.cat) return p.category === S.cat;
  const q = qTerm(); if (!q) return true;
  if (hasTable(p.category) && tableMatches(p.category)) return true;
  if ([p.category, p.type, p.title, p.name, p.owner].filter(Boolean).join('\n').toLowerCase().has(q)) return true;
  return [...(p.customItems || []), ...(p.startItems || [])].some(id => itemName(id).toLowerCase().has(q));
}
function sceneHits(sc) { let n = 0; for (const [c, k] of Object.entries(sc.cats)) if (hasTable(c) && tableMatches(c)) n += k; return n; }

// ---------- tabs & side ----------
function renderTabs() {
  $('#regionTabs').innerHTML = REGIONS.map(r => `<button class="tab ${S.region === r.id ? 'on' : ''}" data-region="${r.id}" aria-pressed="${S.region === r.id}">${r.label}</button>`).join('');
}
$('#regionTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-region]'); if (!b) return;
  S.region = b.dataset.region;
  if (searching()) { S.q = ''; $('#q').value = ''; S.cat = null; $('#catChip').classList.add('hidden'); }
  renderTabs(); renderSide();
  const r = REGIONS.find(r => r.id === S.region); if (SC[r.home]) openScene(r.home);
});
function placeIcon(sc) {
  const l = IDX.landmarks.find(l => l.icon && l.w === 0 && sc.name.toLowerCase().includes(l.t.toLowerCase()));
  return l ? `<img class="ico" src="${l.icon}" alt="">` : '<span class="ico blank"></span>';
}
const shortName = n => n.replace(/ — .*/, '');
function row(sc, count, extraCls) {
  const sub = sc.outdoor ? 'Streets & outdoor areas' : (sc.parent && SC[sc.parent] ? 'in ' + shortName(SC[sc.parent].name) : '');
  return `<div class="row ${extraCls || ''} ${S.scene === sc.slug ? 'on' : ''} ${sc.outdoor ? 'out' : ''}" data-slug="${sc.slug}" title="${esc(sc.scene)}">
    ${placeIcon(sc)}<span class="nm">${esc(sc.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="ct">${count}</span></div>`;
}
// Furniture you can buy (a Drill, a Lathe…): found through the database file, which loads the first time a search needs it.
let FDB = null, fdbBusy = false;
function furnDb() {
  if (FDB || fdbBusy) return FDB;
  fdbBusy = true; const sc = document.createElement('script'); sc.src = 'data/db.js?v=16';
  sc.onload = () => { FDB = window.OBS_DB; aliasQ = null; if (searching()) { renderSide(); draw(); if (S.data && S.sel == null && !S.selF) focusFirstMatch(); } }; sc.onerror = () => { fdbBusy = false; }; document.head.appendChild(sc);
  return null;
}
function furnSection(q) {
  const D = furnDb(); if (!D || q.length < 2) return '';
  const hits = Object.entries(D.furniture).filter(([, f]) => f[0].toLowerCase().has(q) || (f[4] || []).some(t => t.toLowerCase().has(q)) || (f[4] || []).length && f[1].toLowerCase().has(q) && q.length > 3)
    .sort((a, b) => a[1][0].localeCompare(b[1][0])).slice(0, 8);
  if (!hits.length) return '';
  const price = f => [f[2] ? f[2] + ' OC' : '', f[3] ? f[3] + ' RM' : ''].filter(Boolean).join(' + ') || 'free';
  const rows = hits.map(([id, f]) => {
    const vs = D.vendors.filter(v => (v.fs || []).includes(+id) && SC[v.sc]);
    return vs.length ? vs.map(v => `<div class="row" data-vsc="${esc(v.sc)}" data-vn="${esc(v.n)}" data-vq="${esc(f[0])}"><span class="ico blank"></span><span class="nm">${esc(f[0])}<small>Sold by ${esc(v.n)} · ${esc(SC[v.sc].name)} · ${price(f)}</small></span><span class="ct">buy</span></div>`).join('')
      : `<div class="row" data-fdb="${id}"><span class="ico blank"></span><span class="nm">${esc(f[0])}<small>Not sold in any shop on the map · ${price(f)}</small></span><span class="ct">info</span></div>`;
  }).join('');
  return '<div class="sec">Furniture for sale</div>' + rows;
}
function renderSide() {
  const q = qTerm();
  if (searching()) {
    const label = S.cat ? `“${S.cat}” containers` : `“${S.q.trim()}”`;
    const ranked = IDX.scenes.map(s => [s, sceneHits(s)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    const placeHits = q && !S.cat ? IDX.scenes.filter(s => s.name.toLowerCase().has(q)) : [];
    const lmHits = q && !S.cat ? LM_GROUPS.filter(l => l.titles.join(' ').toLowerCase().has(q)) : [];
    let tables = '';
    if (!S.cat && q) {
      const hits = Object.keys(LOOT).filter(c => tableText[c].has(q) && TOTALS[c]).sort((a, b) => TOTALS[b] - TOTALS[a]).slice(0, 10);
      tables = hits.length ? '<div class="sec">Containers that can drop it</div>' + hits.map(c => {
        const t = LOOT[c], m = id => nameWithGroups(id).toLowerCase().has(q);
        const r = t.rare.some(m), cm = t.common.some(m);
        const how = c.toLowerCase().has(q) ? 'container type' : cm && r ? 'common & rare drop' : cm ? 'common drop' : 'rare drop';
        return `<div class="row" data-cat="${esc(c)}"><span class="ico blank"></span><span class="nm">${esc(c)}<small>${how}</small></span><span class="ct">${TOTALS[c]}</span></div>`;
      }).join('') : '';
    }
    let wsec = '';
    if (!S.cat && q) {
      const al = furnAlias(), titles = Object.keys(STYPES).filter(t => STEXT[t].has(q) || al.has(t));
      const rows = IDX.scenes.map(s => [s, titles.reduce((a, t) => a + ((s.stations || {})[t] || 0), 0), titles.filter(t => (s.stations || {})[t])]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
      if (rows.length) wsec = '<div class="sec">Workstations that match</div>' + rows.slice(0, 25).map(([s, k, ts]) =>
        `<div class="row" data-slug="${s.slug}"><span class="ico blank"></span><span class="nm">${esc(ts.slice(0, 3).join(', '))}<small>in ${esc(s.name)}</small></span><span class="ct">${k}</span></div>`).join('');
    }
    const n = ranked.reduce((a, x) => a + x[1], 0);
    $('#sideHead').innerHTML = `<h2>Search results</h2><p>${n ? `${n} containers for ${esc(label)} in ${ranked.length} places` : esc(label)}</p>`;
    $('#sideBody').innerHTML =
      (placeHits.length ? '<div class="sec">Places</div>' + placeHits.map(s => row(s, s.lootContainers)).join('') : '') +
      (lmHits.length ? '<div class="sec">On the in-game map</div>' + lmHits.map(l => `<div class="row" data-lm="${LM_GROUPS.indexOf(l)}">${l.icon ? `<img class="ico" src="${l.icon}" alt="">` : '<span class="ico blank"></span>'}<span class="nm">${esc(l.titles.join(', '))}<small>${l.map === 'mines' ? 'Mines map' : 'Tenement & Bazaar map'}</small></span></div>`).join('') : '') +
      tables + wsec + (!S.cat && q ? furnSection(q) : '') +
      (ranked.length ? '<div class="sec">Best places to look</div>' + ranked.slice(0, 60).map(([s, k]) => row(s, k, 'hit')).join('') :
        (!placeHits.length && !lmHits.length && !wsec && !furnSection(q) ? `<p class="empty">Nothing matches ${esc(label)}. Try a shorter word, like “tape” or “battery”.</p>` : ''));
    return;
  }
  const reg = REGIONS.find(r => r.id === S.region);
  const list = IDX.scenes.filter(s => s.group === S.region);
  const out = list.filter(s => s.outdoor), ins = list.filter(s => !s.outdoor).sort((a, b) => a.name.localeCompare(b.name));
  $('#sideHead').innerHTML = `<h2>${reg.label}</h2><p>${list.length} places · ${list.reduce((a, s) => a + s.lootContainers, 0)} loot containers</p>`;
  $('#sideBody').innerHTML = (out.length ? '<div class="sec">Outdoors</div>' + out.map(s => row(s, s.lootContainers)).join('') : '') +
    '<div class="sec">Buildings & rooms</div>' + ins.map(s => row(s, s.lootContainers)).join('');
}
$('#sideBody').addEventListener('click', e => {
  const r = e.target.closest('.row'); if (!r) return;
  if (r.dataset.slug) openScene(r.dataset.slug);
  else if (r.dataset.vsc) window.OBS_MAP.show(r.dataset.vsc, r.dataset.vq, r.dataset.vn);
  else if (r.dataset.fdb) location.hash = '#/db/furniture/' + r.dataset.fdb;
  else if (r.dataset.cat) setCat(r.dataset.cat);
  else if (r.dataset.lm) {
    const l = LM_GROUPS[+r.dataset.lm];
    const home = l.map === 'mines' ? 'open-sewer-mines' : (l.z < -10 || l.x < -20 ? 'open-sewer-bazaar' : 'open-sewer-tenement');
    S.pendingFocus = { x: l.x, z: l.z }; openScene(home);
  }
  $('#side').classList.remove('open');
});

// ---------- scenes ----------
// Every scene file calls window.__scene(data) when it loads. Several can be loading at once (tapping a tab while the map is
// still opening), so the data is filed by its own slug instead of by whichever request was made last.
const loading = {};
window.__scene = d => { const slug = d.slug, w = loading[slug]; cache[slug] = prep(d); delete loading[slug]; if (w) w.res(cache[slug]); };
function loadScene(slug) {
  if (cache[slug]) return Promise.resolve(cache[slug]);
  if (loading[slug]) return loading[slug].p;
  const w = loading[slug] = {};
  w.p = new Promise((res, rej) => { w.res = res; w.rej = rej; });
  const s = document.createElement('script'); s.src = `data/scenes/${slug}.js?v=5`;
  s.onerror = () => { delete loading[slug]; s.remove(); w.rej(new Error('scene ' + slug)); };
  document.head.appendChild(s);
  return w.p;
}
function prep(d) {
  const v = d.nav.v, t = d.nav.t; d.tri = [];
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    d.tri.push([v[a], v[a + 2], v[b], v[b + 2], v[c], v[c + 2], (v[a + 1] + v[b + 1] + v[c + 1]) / 30]);
  }
  d.points.forEach((p, i) => { p.i = i; p.loot = p.kind === 'container' ? hasTable(p.category) : true; });
  const doors = [];
  for (const f of d.features.filter(f => f.kind === 'door'))
    if (!doors.find(g => g.to === f.to && Math.hypot(g.x - f.x, g.z - f.z) < 4)) doors.push(f);
  d.doors = doors; d.idoors = d.features.filter(f => f.kind === 'idoor'); d.verts = d.features.filter(f => f.kind === 'vert'); d.people = d.features.filter(f => f.kind === 'npc'); d.wood = d.features.filter(f => f.kind === 'wood'); d.services = d.features.filter(f => f.kind !== 'door' && f.kind !== 'idoor' && f.kind !== 'vert' && f.kind !== 'npc' && f.kind !== 'wood');
  return d;
}
function computeFloors(d) {
  if (SC[d.slug] && SC[d.slug].outdoor) return [];
  if (d.tri.length) {
    const bins = new Map(); let total = 0;
    for (const t of d.tri) {
      const area = Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 200;
      const k = Math.round(t[6] * 2); bins.set(k, (bins.get(k) || 0) + area); total += area;
    }
    const keys = [...bins.keys()].sort((a, b) => a - b).filter(k => bins.get(k) > total * 0.03);
    const lv = [];
    for (const k of keys) { const y = k / 2, l = lv[lv.length - 1]; if (l && y - l.y < 2.2) { if (bins.get(k) > l.a) { l.y = y; l.a = bins.get(k); } } else lv.push({ y, a: bins.get(k) }); }
    if (lv.length >= 2 && lv.length <= 12) return lv.map((l, i) => ({ lo: i ? l.y - 0.6 : -1e9, hi: i < lv.length - 1 ? lv[i + 1].y - 0.6 : 1e9, y: l.y }));
  }
  return [];
}
let openSeq = 0;
async function openScene(slug, keepView) {
  const my = ++openSeq;
  const meta = SC[slug] || SC['open-sewer-bazaar'];
  if (S.scene !== meta.slug) S.selF = null;
  const fresh = S.scene !== meta.slug && !keepView;
  if (fresh) { S.sel = null; S.floor = -1; }
  S.scene = meta.slug;
  if (!searching()) { S.region = meta.group; renderTabs(); }
  S.data = null; paths = null; S.floors = []; renderFloors();   // nothing of the previous place is drawn under the new name
  renderSide(); renderCrumb(meta); renderDetail(); draw();
  $('#loading').textContent = 'Unfolding the map…'; $('#loading').classList.remove('hidden');
  let data;
  try { data = await loadScene(meta.slug); }
  catch (e) { if (my === openSeq) $('#loading').textContent = 'Could not load this place. Tap it again to retry.'; return; }
  if (my !== openSeq || S.scene !== meta.slug) return;   // a newer tap took over; it will finish the job
  $('#loading').classList.add('hidden'); S.data = data;
  S.floors = computeFloors(S.data); if (S.floor >= S.floors.length) S.floor = -1;
  if (fresh && S.floors.length > 1 && S.floor < 0) {   // a building opens on its busiest floor, not on all of them stacked together
    const n = S.floors.map(fl => S.data.points.filter(p => p.active && p.y >= fl.lo && p.y <= fl.hi).length);
    S.floor = n.indexOf(Math.max(...n));
  }
  S.layers.plan = S.userPlan ?? !(meta.outdoor && meta.map); $('#lyPlan').checked = S.layers.plan;
  buildPaths(); renderFloors();
  if (S.pendingShop) { const t = S.pendingShop; S.pendingShop = null; const f = S.data.services.find(x => x.kind === 'vendor' && x.title === t) || (S.data.people || []).find(x => x.name === t); if (f) { S.selF = f; S.pendingFocus = f; } }
  if (S.pendingFocus) { const f = S.pendingFocus; S.pendingFocus = null; S.view = { cx: f.x, cz: f.z, s: 9 }; S.autoFit = false; }
  else if (!keepView) fit();
  renderDetail(); draw(); saveHash();
  if (searching() && S.sel == null && !S.selF) focusFirstMatch();
}
function renderCrumb(meta) {
  const parent = meta.parent && SC[meta.parent], reg = REGIONS.find(r => r.id === meta.group);
  $('#crumb').innerHTML = `<div class="path">${esc(reg ? reg.label : '')}${parent ? ' › ' + esc(shortName(parent.name)) : ''}</div>
    <h1>${esc(meta.name)}</h1><div class="meta">${meta.lootContainers} loot containers · ${meta.lootPickups} pickup spots</div>
    ${parent ? `<button id="exitBtn">↩ Back outside to ${esc(shortName(parent.name))}</button>` : ''}`;
  const b = $('#exitBtn');
  if (b) b.onclick = () => { const e = meta.entrances[0]; if (e) S.pendingFocus = { x: e[0], z: e[1] }; openScene(parent.slug); };
}

// ---------- floor plan ----------
let paths = null, bg = null;
function inFloor(y0, y1) { if (S.floor < 0) return true; const f = S.floors[S.floor]; return y1 >= f.lo && y0 <= f.hi; }
function buildPaths() {
  const d = S.data, nav = new Path2D(), flat = new Path2D(), solid = new Path2D();
  for (const t of d.tri) { if (!inFloor(t[6], t[6])) continue; nav.moveTo(t[0], -t[1]); nav.lineTo(t[2], -t[3]); nav.lineTo(t[4], -t[5]); nav.closePath(); }
  for (const c of d.col) {
    const y0 = c[0] / 10, y1 = c[1] / 10;
    if (!inFloor(y0, y1) || (S.floor >= 0 && y1 - y0 > 6)) continue;
    const p = (y1 - y0) < 0.5 ? flat : solid;
    p.moveTo(c[2], -c[3]); for (let i = 4; i < c.length; i += 2) p.lineTo(c[i], -c[i + 1]); p.closePath();
  }
  paths = { nav, flat, solid, heavy: d.tri.length + d.col.length > 6000 };
  bg = null;
  if (paths.heavy) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const add = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    d.points.forEach(p => add(p.x, p.z)); for (const t of d.tri) add(t[0] / 10, t[1] / 10);
    x0 -= 25; x1 += 25; z0 -= 25; z1 += 25;
    const ppm = Math.min(24, 4096 / (x1 - x0), 4096 / (z1 - z0));
    const c = document.createElement('canvas'); c.width = Math.ceil((x1 - x0) * ppm); c.height = Math.ceil((z1 - z0) * ppm);
    const g = c.getContext('2d'); g.setTransform(ppm * 0.1, 0, 0, ppm * 0.1, -x0 * ppm, z1 * ppm); paintPlan(g, ppm);
    bg = { c, x0, z1, ppm };
  }
}
function paintPlan(g, s) {
  g.fillStyle = 'rgba(244,237,221,0.94)'; g.fill(paths.nav);
  g.lineWidth = 10 / s;
  g.fillStyle = 'rgba(80,62,40,0.10)'; g.fill(paths.flat);
  g.fillStyle = 'rgba(70,54,34,0.42)'; g.strokeStyle = 'rgba(45,34,20,0.55)'; g.fill(paths.solid); g.stroke(paths.solid);
}
function visiblePoints() {
  const L = S.layers, d = S.data; if (!d) return [];
  return d.points.filter(p => {
    if (!p.active && !L.inactive) return false;
    if (p.kind === 'pickup' ? !L.pickups : (p.loot ? !L.loot : !L.noloot)) return false;
    if (S.own === 'safe' && p.steal) return false;
    if (S.own === 'steal' && !p.steal) return false;
    if (S.floor >= 0) { const f = S.floors[S.floor]; if (p.y < f.lo || p.y > f.hi) return false; }
    return true;
  });
}
const onFloor = f => S.floor < 0 || (f.y >= S.floors[S.floor].lo && f.y <= S.floors[S.floor].hi);

// ---------- canvas ----------
const cv = $('#map'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
function resize() {
  const r = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
  W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (S.autoFit) fit(); else draw();
}
const toScreen = (x, z) => [(x - S.view.cx) * S.view.s + W / 2, (S.view.cz - z) * S.view.s + H / 2];
const toWorld = (sx, sy) => [(sx - W / 2) / S.view.s + S.view.cx, S.view.cz - (sy - H / 2) / S.view.s];
function fit() {
  const d = S.data; if (!d) return;
  S.autoFit = true; if (W < 10 || H < 10) return;
  let pts = visiblePoints(); if (!pts.length) pts = d.points;
  pts = pts.filter(p => p.active);
  const xs = pts.map(p => p.x).sort((a, b) => a - b), zs = pts.map(p => p.z).sort((a, b) => a - b);
  const trim = xs.length > 30 ? Math.floor(xs.length * 0.02) : 0;
  let x0 = xs[trim], x1 = xs[xs.length - 1 - trim], z0 = zs[trim], z1 = zs[zs.length - 1 - trim];
  if (!xs.length) { x0 = -10; x1 = 10; z0 = -10; z1 = 10; }
  const pad = SC[S.scene].outdoor ? 4 : 6; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  S.view.cx = (x0 + x1) / 2; S.view.cz = (z0 + z1) / 2;
  S.view.s = Math.max(0.3, Math.min(60, Math.min((W - 40) / (x1 - x0), (H - 40) / (z1 - z0))));
  draw();
}
let raf = 0;
function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawNow(); }); }
function label(text, x, y, o = {}) {
  ctx.font = (o.font || '13px "IBM Plex Sans", sans-serif').replace(/(\d+(?:\.\d+)?)px/, (m, n) => (+n * (PREF.markers ? 1.2 : 1)) + 'px');
  const w = ctx.measureText(text).width, h = o.h || 16, bx = o.center ? x - w / 2 - 4 : x;
  ctx.fillStyle = o.bg || 'rgba(27,25,22,0.88)'; ctx.fillRect(bx, y - h / 2, w + 8, h);
  ctx.fillStyle = o.color || '#ece4d4'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 4, y + 0.5);
}
const SVC = { bed: ['Bed', 'Bed — you can sleep here'], toilet: ['WC', 'Toilet'], vending: ['$', 'Shop counter'], vendor: ['$', 'Shop'], phone: ['☎', 'Phone'], mailbox: ['✉', 'Mailbox'],
  station: ['⚒', 'Workstation'], grow: ['✿', 'Planter / growing spot'], water: ['≈', 'Water source'], shower: ['Sh', 'Shower'], sauna: ['Sa', 'Sauna stove'],
  generator: ['⚡', 'Generator'], breeder: ['Br', 'Animal breeder'], recycling: ['♻', 'Bottle recycling drop'], radio: ['♪', 'Radio'] };
const svcOf = k => SVC[k] || ['•', k];
const FURN = new Set(['station', 'grow', 'water', 'shower', 'sauna', 'generator', 'breeder', 'recycling', 'radio']);
function drawNow() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#d8cfb9'; ctx.fillRect(0, 0, W, H);
  const d = S.data; if (!d || !paths) return;
  const meta = SC[S.scene], s = S.view.s, L = S.layers;
  const mp = meta.map && IDX.maps[meta.map];
  if (mp && L.art) {
    const im = img(mp.img);
    if (im) {
      const [bx, by] = toScreen(mp.x0, mp.z1);
      ctx.globalAlpha = meta.outdoor ? 1 : (L.plan ? 0.5 : 0.95);
      ctx.drawImage(im, bx, by, mp.span * s, mp.span * s); ctx.globalAlpha = 1;
    }
  }
  if (L.plan) {
    if (bg && (S.busy || s <= bg.ppm * 1.3)) {
      const [bx, by] = toScreen(bg.x0, bg.z1); ctx.drawImage(bg.c, bx, by, bg.c.width / bg.ppm * s, bg.c.height / bg.ppm * s);
    } else {
      ctx.setTransform(s * 0.1 * dpr, 0, 0, s * 0.1 * dpr, (W / 2 - S.view.cx * s) * dpr, (H / 2 + S.view.cz * s) * dpr);
      paintPlan(ctx, s); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (bg && S.busy) { clearTimeout(S._sharp); S._sharp = setTimeout(() => { S.busy = false; draw(); }, 180); }
  }
  const showLm = L.landmarks && mp && (meta.outdoor || !L.plan);
  const lms = showLm ? LM_GROUPS.filter(l => l.map === meta.map) : [];
  for (const l of lms) {
    if (!(l.w > 0) || !l.icon) continue;
    const im = img(l.icon); if (!im) continue;
    const wm = l.w * mp.span / 1024 * s, hm = l.h * mp.span / 1024 * s, [x, y] = toScreen(l.x, l.z);
    ctx.drawImage(im, x - wm / 2, y - hm / 2, wm, hm);
  }
  const m = [1, 2, 5, 10, 20, 50, 100, 200].find(v => v * s > 60) || 200;
  ctx.fillStyle = '#241d14'; ctx.fillRect(W - 24 - m * s, H - 22, m * s, 4);
  ctx.font = '600 14px "IBM Plex Sans", sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillText(m + ' m', W - 24, H - 28); ctx.textAlign = 'left';
  S._hits = [];
  for (const f of d.services) {
    const furn = FURN.has(f.kind);
    if (!f.active || !onFloor(f) || (furn ? !L.furniture : !L.services)) continue;
    const [x, y] = toScreen(f.x, f.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const g = svcOf(f.kind)[0];
    ctx.font = '600 9.5px "IBM Plex Sans", sans-serif'; const w = Math.max(15, ctx.measureText(g).width + 7);
    const sm = stationMatches(f), dim = searching() && !sm;
    ctx.globalAlpha = dim ? 0.35 : 1;
    if (sm) { ctx.fillStyle = 'rgba(47,93,58,0.35)'; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill(); }
    ctx.fillStyle = furn ? '#2f5d3a' : '#fffaf0'; ctx.strokeStyle = f.owned ? '#b3261e' : (furn ? '#fffaf0' : '#241d14'); ctx.lineWidth = f.owned ? 2 : 1.2;
    if (furn) { ctx.beginPath(); ctx.roundRect(x - w / 2, y - 7.5, w, 15, 3); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.roundRect(x - w / 2, y - 7.5, w, 15, 7.5); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = furn ? '#fffaf0' : '#241d14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, x, y + 0.5); ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    if ((f.kind === 'station' || f.kind === 'vendor') && f.title && (sm || s > 16 || (S.hover && S.hover.f === f))) label(f.title, x + w / 2 + 3, y, { font: '600 11px "IBM Plex Sans", sans-serif', bg: 'rgba(47,93,58,0.92)' });
    S._hits.push({ x, y, r: 10, f });
  }
  if (L.doors) for (const f of d.doors) {
    if (!onFloor(f)) continue;
    const [x, y] = toScreen(f.x, f.z); if (x < -40 || y < -20 || x > W + 40 || y > H + 20) continue;
    const st = doorState(f), ok = !!f.toSlug, hov = S.hover && S.hover.f === f;
    ctx.fillStyle = DOOR[st][0]; ctx.strokeStyle = '#f4eddd'; ctx.lineWidth = 1.5;
    const ds = s < 5 ? 4.5 : 6.5;
    ctx.beginPath(); ctx.roundRect(x - ds, y - ds, ds * 2, ds * 2, 2); ctx.fill(); ctx.stroke();
    if (st === 'open' || st === 'closed') { if (ds > 5) { ctx.fillStyle = '#f4eddd'; ctx.fillRect(x - 2, y - 3.5, 4.5, 7.5); } }
    else { ctx.fillStyle = ctx.strokeStyle = '#f4eddd'; ctx.lineWidth = 1.3; const k = ds > 5 ? 1 : 0.7;   // padlock
      ctx.fillRect(x - 3 * k, y - 0.5 * k, 6 * k, 4.5 * k); ctx.beginPath(); ctx.arc(x, y - 0.5 * k, 2.2 * k, Math.PI, 0); ctx.stroke();
      if (st === 'blocked') { ctx.strokeStyle = '#c81e18'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - ds, y - ds); ctx.lineTo(x + ds, y + ds); ctx.stroke(); } }
    if (hov || s > (meta.outdoor ? 7 : 13)) label(f.toName + (st === 'open' ? '' : st === 'closed' ? ' (closed)' : st === 'pick' ? ' (lockpick)' : st === 'key' ? ' (key)' : st === 'blocked' ? ' (blocked)' : ' (locked)'), x + 10, y, { font: '600 11.5px "IBM Plex Sans", sans-serif' });
    S._hits.push({ x, y, r: 11, f });
  }
  if (L.doors) for (const f of d.idoors || []) {   // doors inside the building, with their lock
    if (!onFloor(f) || (!f.active && !L.inactive)) continue;
    const [x, y] = toScreen(f.x, f.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const st = doorState(f), open = st === 'open', hov = S.hover && S.hover.f === f;
    const ds = s < 5 ? 3 : s < 13 ? 4.2 : 5.6;
    ctx.globalAlpha = f.active ? 1 : 0.5;
    ctx.fillStyle = DOOR[st][0]; ctx.strokeStyle = '#f4eddd'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(x - ds, y - ds, ds * 2, ds * 2, 1.5); ctx.fill(); ctx.stroke();
    if (!open && ds > 4) { ctx.fillStyle = ctx.strokeStyle = '#f4eddd'; ctx.lineWidth = 1.1; const k = ds > 5 ? 0.9 : 0.65;   // padlock
      ctx.fillRect(x - 3 * k, y - 0.3 * k, 6 * k, 4.2 * k); ctx.beginPath(); ctx.arc(x, y - 0.3 * k, 2 * k, Math.PI, 0); ctx.stroke();
      if (st === 'blocked') { ctx.strokeStyle = '#c81e18'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - ds, y - ds); ctx.lineTo(x + ds, y + ds); ctx.stroke(); } }
    ctx.globalAlpha = 1;
    if (hov || (!open && s > (meta.outdoor ? 14 : 18))) label('Door' + (st === 'pick' ? ' (lockpick)' : st === 'key' ? ' (key)' : st === 'blocked' ? ' (blocked)' : st === 'locked' ? ' (locked)' : ''), x + 9, y, { font: '600 11px "IBM Plex Sans", sans-serif' });
    S._hits.push({ x, y, r: 9, f });
  }
  if (L.doors) for (const f of d.verts || []) {   // stairs, ladders and elevators, shown on the floor where they start
    if (!onFloor(f)) continue;
    const [x, y] = toScreen(f.x, f.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const hov = S.hover && S.hover.f === f, ds = s < 5 ? 3.2 : s < 13 ? 4.4 : 5.8, k = ds / 5.8;
    ctx.fillStyle = '#2e7a68'; ctx.strokeStyle = '#f4eddd'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, ds + 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (ds > 3.5) { ctx.strokeStyle = ctx.fillStyle = '#f4eddd'; ctx.lineWidth = 1.2;
      if (f.sub === 'stairs') { ctx.beginPath(); ctx.moveTo(x - 3.6 * k, y + 3 * k); ctx.lineTo(x - 3.6 * k, y + 1 * k); ctx.lineTo(x - 1.2 * k, y + 1 * k); ctx.lineTo(x - 1.2 * k, y - 1.2 * k); ctx.lineTo(x + 1.2 * k, y - 1.2 * k); ctx.lineTo(x + 1.2 * k, y - 3.2 * k); ctx.lineTo(x + 3.6 * k, y - 3.2 * k); ctx.stroke(); }
      else if (f.sub === 'ladder') { ctx.beginPath(); ctx.moveTo(x - 2 * k, y - 3.4 * k); ctx.lineTo(x - 2 * k, y + 3.4 * k); ctx.moveTo(x + 2 * k, y - 3.4 * k); ctx.lineTo(x + 2 * k, y + 3.4 * k);
        for (const r of [-2, 0, 2]) { ctx.moveTo(x - 2 * k, y + r * k); ctx.lineTo(x + 2 * k, y + r * k); } ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x, y - 3.6 * k); ctx.lineTo(x + 2.6 * k, y - 0.8 * k); ctx.lineTo(x - 2.6 * k, y - 0.8 * k); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y + 3.6 * k); ctx.lineTo(x + 2.6 * k, y + 0.8 * k); ctx.lineTo(x - 2.6 * k, y + 0.8 * k); ctx.closePath(); ctx.fill(); } }
    if (hov) label(VERT[f.sub], x + 9, y, { font: '600 11px "IBM Plex Sans", sans-serif' });
    S._hits.push({ x, y, r: 9, f });
  }
  if (L.wood) for (const f of d.wood || []) {   // tree debris: wood piles you can chop with an axe
    if (!onFloor(f) || (!f.active && !L.inactive)) continue;
    const [x, y] = toScreen(f.x, f.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const hov = S.hover && S.hover.f === f, ds = s < 5 ? 3.2 : s < 13 ? 4.4 : 5.8, k = ds / 5.8;
    ctx.globalAlpha = f.active ? 1 : 0.55;
    ctx.fillStyle = '#8a5a2b'; ctx.strokeStyle = '#f4eddd'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y - ds - 1); ctx.lineTo(x + ds + 1, y); ctx.lineTo(x, y + ds + 1); ctx.lineTo(x - ds - 1, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (ds > 3.5) { ctx.strokeStyle = '#f4eddd'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x - 3 * k, y - 1.4 * k); ctx.lineTo(x + 3 * k, y - 1.4 * k); ctx.moveTo(x - 3 * k, y + 1.4 * k); ctx.lineTo(x + 3 * k, y + 1.4 * k); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (hov) label('Tree debris', x + 9, y, { font: '600 11px "IBM Plex Sans", sans-serif' });
    S._hits.push({ x, y, r: 9, f });
  }
  for (const l of lms) {
    if (l.w > 0) continue;
    const [x, y] = toScreen(l.x, l.z); if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    const im = l.icon && img(l.icon), sz = s > 6 ? 32 : 24;
    if (im) ctx.drawImage(im, x - sz / 2, y - sz / 2, sz, sz);
    else { ctx.fillStyle = '#b3261e'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }
    if (s > 5.5) label(l.titles[0] + (l.titles.length > 1 ? ' +' + (l.titles.length - 1) : ''), x, y + sz / 2 + 9,
      { center: true, font: '13px "Special Elite", monospace', bg: 'rgba(240,234,220,0.92)', color: '#8f1d16', h: 16 });
    S._hits.push({ x, y, r: sz / 2, l });
  }
  const on = searching(), pts = visiblePoints(), r = (PREF.markers ? 1.55 : 1.15) * Math.max(3.5, Math.min(7, s * 0.3));
  const ordered = on ? pts.slice().sort((a, b) => pointMatches(a) - pointMatches(b)) : pts;
  for (const p of ordered) {
    const [x, y] = toScreen(p.x, p.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const hit = !on || pointMatches(p); ctx.globalAlpha = hit ? 1 : 0.22;
    const rr = on && hit ? r + 2 : r;
    if (on && hit) { ctx.fillStyle = 'rgba(217,142,4,0.38)'; ctx.beginPath(); ctx.arc(x, y, rr * 2.4, 0, 7); ctx.fill(); }
    ctx.lineWidth = 1.6; ctx.strokeStyle = p.kind === 'pickup' ? '#fff' : '#241d14';
    ctx.fillStyle = p.kind === 'pickup' ? '#1f7a8c' : p.loot ? '#d98e04' : '#8c8577';
    if (p.kind === 'pickup') { ctx.beginPath(); ctx.arc(x, y, rr * 0.9, 0, 7); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); ctx.strokeRect(x - rr, y - rr, rr * 2, rr * 2); }
    if (p.steal && p.loot) {
      ctx.fillStyle = '#b3261e';
      if (p.kind === 'pickup') { ctx.beginPath(); ctx.arc(x + rr * 0.7, y - rr * 0.7, Math.max(2.5, rr * 0.45), 0, 7); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(x - rr * 0.1, y - rr); ctx.lineTo(x + rr, y - rr); ctx.lineTo(x + rr, y + rr * 0.1); ctx.closePath(); ctx.fill(); }
    }
    if (p.locked) { ctx.strokeStyle = '#6b3fa0'; ctx.lineWidth = 2.2; ctx.strokeRect(x - rr - 2.5, y - rr - 2.5, rr * 2 + 5, rr * 2 + 5); }
    if (!p.active) { ctx.setLineDash([2, 2]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x - rr, y - rr, rr * 2, rr * 2); ctx.setLineDash([]); }
  }
  ctx.globalAlpha = 1;
  if (s > 24) for (const p of pts) {
    if ((on && !pointMatches(p)) || (p.kind === 'container' && !p.loot)) continue;
    const [x, y] = toScreen(p.x, p.z); if (x < 0 || y < 0 || x > W || y > H) continue;
    label(hasTable(p.category) ? p.category : (p.title || p.type || p.name), x + r + 4, y, { font: '13px "IBM Plex Sans", sans-serif' });
  }
  if (L.people) for (const f of d.people || []) {   // people placed in the scene; tenants you can rent to get a gold ring
    if (!onFloor(f) || (!f.active && !L.inactive)) continue;
    const [x, y] = toScreen(f.x, f.z); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const t = tenantOf(f.name), hov = S.hover && S.hover.f === f, r = s < 5 ? 5 : s < 13 ? 6.5 : 8;
    ctx.globalAlpha = f.active ? 1 : 0.5;
    ctx.fillStyle = '#6d4c8f'; ctx.strokeStyle = t ? '#f2b630' : '#f4eddd'; ctx.lineWidth = t ? 2.2 : 1.3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4eddd'; ctx.beginPath(); ctx.arc(x, y - r * 0.28, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + r * 0.62, r * 0.46, Math.PI, 0); ctx.fill();
    ctx.globalAlpha = 1;
    if (hov || s > (meta.outdoor ? 12 : 16)) label(f.name + (t ? ' (tenant)' : ''), x + r + 3, y, { font: '600 11px "IBM Plex Sans", sans-serif', bg: 'rgba(80,52,110,0.92)' });
    S._hits.push({ x, y, r: r + 3, f });
  }
  for (const [p, c] of [[S.hover && S.hover.p, '#241d14'], [S.sel != null ? d.points[S.sel] : null, '#b3261e']]) {
    if (!p) continue; const [x, y] = toScreen(p.x, p.z);
    ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 8, 0, 7); ctx.stroke();
  }
}

// ---------- interaction ----------
const ptrs = new Map(); let drag = null, moved = false;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); moved = false;
  if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: S.view.cx, cz: S.view.cz };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), s: S.view.s, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cx: S.view.cx, cz: S.view.cz }; }
  cv.classList.add('drag');
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) { hoverAt(e.offsetX, e.offsetY); return; }
  ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); if (!drag) return;
  if (drag.pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const ns = Math.max(0.3, Math.min(200, drag.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / drag.pinch));
    S.view = { cx: drag.cx, cz: drag.cz, s: drag.s }; const [wx, wz] = toWorld(...drag.mid);
    S.view.s = ns; const [nx, nz] = toWorld(...drag.mid); S.view.cx += wx - nx; S.view.cz += wz - nz; moved = true;
  } else if (!drag.pinch) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    S.view.cx = drag.cx - dx / S.view.s; S.view.cz = drag.cz + dy / S.view.s;
  }
  if (moved) S.autoFit = false;
  $('#tip').classList.add('hidden'); S.busy = true; draw();
});
function endPtr(e) {
  const wasDrag = moved; ptrs.delete(e.pointerId);
  if (ptrs.size === 0) { cv.classList.remove('drag'); if (!wasDrag && drag && !drag.pinch) clickAt(e.offsetX, e.offsetY); drag = null; }
  else if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: p[0], y: p[1], cx: S.view.cx, cz: S.view.cz }; }
  saveHash();
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', () => { S.hover = null; $('#tip').classList.add('hidden'); draw(); });
cv.addEventListener('wheel', e => {
  e.preventDefault(); S.autoFit = false; S.busy = true;
  const [wx, wz] = toWorld(e.offsetX, e.offsetY);
  S.view.s = Math.max(0.3, Math.min(200, S.view.s * Math.exp(-e.deltaY * 0.0015)));
  const [nx, nz] = toWorld(e.offsetX, e.offsetY); S.view.cx += wx - nx; S.view.cz += wz - nz;
  draw(); clearTimeout(S._wt); S._wt = setTimeout(saveHash, 300);
}, { passive: false });
function pick(sx, sy) {
  let best = null, bd = 13 * 13; const on = searching();
  for (const p of visiblePoints()) {
    const [x, y] = toScreen(p.x, p.z), dd = (x - sx) ** 2 + (y - sy) ** 2 + (on && !pointMatches(p) ? 60 : 0);
    if (dd < bd) { bd = dd; best = { p }; }
  }
  if (best) return best;
  for (const h of S._hits || []) { const dd = (h.x - sx) ** 2 + (h.y - sy) ** 2; if (dd < h.r * h.r && dd < bd) { bd = dd; best = h; } }
  return best;
}
function hoverAt(x, y) {
  const h = pick(x, y), cur = S.hover;
  if (!(cur && h && cur.p === h.p && cur.f === h.f && cur.l === h.l) && !(!cur && !h)) { S.hover = h; draw(); }
  cv.classList.toggle('pointer', !!h);
  const tip = $('#tip'); if (!h) { tip.classList.add('hidden'); return; }
  let html;
  if (h.p) { const p = h.p; html = `<b>${esc(hasTable(p.category) ? p.category : (p.title || p.type || p.name))}</b><br><small>${p.kind === 'pickup' ? 'Pickup spot' : esc(p.title || p.type || 'Container')}${p.locked ? ' · locked' : ''}${p.owner ? ' · owned by ' + esc(p.owner) : ''} — click for loot</small>`; }
  else if (h.f && h.f.kind === 'door') { const f = h.f, st = doorState(f), note = st === 'pick' && f.diff != null ? ` · difficulty ${f.diff < 0.25 ? 'easy' : f.diff < 0.5 ? 'moderate' : f.diff < 1 ? 'challenging' : 'difficult'}` : '';
    html = f.toSlug ? `<b>Door → ${esc(f.toName)}</b><br><small>${DOOR[st][1]}${note} · ${SC[f.toSlug].lootContainers} loot containers inside · click to enter</small>` : `<b>${esc(f.toName)}</b><br><small>${DOOR[st][1]}</small>`; }
  else if (h.f && h.f.kind === 'idoor') { const f = h.f, st = doorState(f), note = st === 'pick' && f.diff != null ? ` · difficulty ${f.diff < 0.25 ? 'easy' : f.diff < 0.5 ? 'moderate' : f.diff < 1 ? 'challenging' : 'difficult'}` : '';
    html = `<b>Door</b><br><small>${DOOR[st][1]}${note}${f.active ? '' : ' · appears after an event'}</small>`; }
  else if (h.f && h.f.kind === 'npc') { const t = tenantOf(h.f.name); html = `<b>${esc(h.f.name)}</b><br><small>${t ? 'Tenant you can rent to · ' : 'Person · '}${h.f.active ? 'where they stand at the start' : 'appears after an event'} — click for details</small>`; }
  else if (h.f && h.f.kind === 'wood') html = `<b>Tree debris</b><br><small>Wood pile you can chop with an axe for wood${h.f.active ? '' : ' · appears after an event'}</small>`;
  else if (h.f && h.f.kind === 'vert') html = `<b>${VERT[h.f.sub]}</b><br><small>${h.f.sub === 'elevator' ? 'Elevator stop on this floor' : h.f.sub === 'ladder' ? 'Ladder — goes up or down from here' : 'Stairs — go up or down from here'}</small>`;
  else if (h.f) {
    const f = h.f, own = f.owned ? `<br><small style="color:#f39a88">Owned${f.owner ? ' by ' + esc(f.owner) : ''} — taking its items counts as stealing</small>` : '';
    const extra = f.kind === 'station' ? esc((f.types || []).join(', ')) + ' · click for recipes' : f.kind === 'bed' ? (f.safe ? 'Safe place to sleep' : 'You can sleep here') + (f.arrest ? ' · you can be arrested here' : '') : svcOf(f.kind)[1];
    html = `<b>${esc(f.title || svcOf(f.kind)[1])}</b><br><small>${extra}</small>${own}`;
  }
  else html = `<b>${esc(h.l.titles.join(', '))}</b><br><small>Landmark on the in-game map</small>`;
  tip.innerHTML = html; tip.style.left = Math.min(x + 16, W - 290) + 'px'; tip.style.top = Math.min(y + 16, H - 60) + 'px'; tip.classList.remove('hidden');
}
function clickAt(x, y) {
  const h = pick(x, y);
  if (h && h.f && h.f.kind === 'door') { if (h.f.toSlug) openScene(h.f.toSlug); return; }
  if (h && h.f && (h.f.kind === 'idoor' || h.f.kind === 'vert' || h.f.kind === 'wood')) return;
  if (h && h.f) { S.sel = null; S.selF = h.f; renderDetail(); draw(); $('#detail').classList.add('open'); return; }
  if (h && h.l) { S.view.cx = h.l.x; S.view.cz = h.l.z; S.view.s = Math.max(S.view.s * 1.6, 9); S.autoFit = false; draw(); saveHash(); return; }
  S.selF = null; S.sel = h && h.p ? h.p.i : null; renderDetail(); draw(); saveHash();
  if (h && h.p) $('#detail').classList.add('open');
}

// ---------- detail ----------
function lootList(ids, label, q) {
  const cnt = new Map(); ids.forEach(id => cnt.set(id, (cnt.get(id) || 0) + 1));
  const rows = [...cnt.entries()].sort((a, b) => itemName(a[0]).localeCompare(itemName(b[0])));
  return `<h3>${label} · ${rows.length}</h3><ul class="items">` + rows.map(([id, n]) => {
    const nm = itemName(id), hit = q && nm.toLowerCase().has(q);
    return `<li class="${hit ? 'hit' : ''}"><span>${esc(nm)}${n > 1 ? `<em>×${n}</em>` : ''}</span><small>${ITEMS[id] ? ITEMS[id][1] + ' OC' : ''}</small></li>`;
  }).join('') + '</ul>';
}
function renderDetail() {
  const el = $('#detail'), d = S.data; if (!d) { el.innerHTML = ''; return; }
  const meta = SC[S.scene], q = S.cat ? '' : qTerm();
  if (S.selF && (d.people || []).includes(S.selF)) {
    const f = S.selF, t = tenantOf(f.name), rl = r => r.oc || r.rm ? [r.oc ? r.oc + ' OC' : '', r.rm ? r.rm + ' RM' : ''].filter(Boolean).join(' + ') : 'no rent';
    let h = `<button class="back" id="backBtn">← ${esc(meta.name)}</button><div class="card"><h2>${esc(f.name)}</h2><div class="sub">${t ? 'Tenant' : 'Person'} · ${esc(meta.name)}</div>`;
    h += `<p>${f.active ? 'Placed here when the scene loads. People walk around, so this is where they start, not where they always are.' : 'Appears here after an event.'}</p>`;
    if (t) h += `<h3>Moves into your apartments</h3><div class="facts"><span>Base rent</span><span>${rl(t)}</span><span>Apartment sizes</span><span>${t.sz.join(', ')}</span><span>Household</span><span>${t.w.length ? 'with ' + t.w.map(esc).join(', ') : 'lives alone'}</span></div>`;
    h += `<p><a class="dbl" href="#/db/tenants/${encodeURIComponent(f.name)}">${t ? 'Open the tenant page' : ''}</a></p>`;
    el.innerHTML = h + '</div>';
    $('#backBtn').onclick = () => { S.selF = null; renderDetail(); draw(); };
    return;
  }
  if (S.selF && d.services.includes(S.selF)) {
    const f = S.selF, types = f.types || [];
    let h = `<button class="back" id="backBtn">← ${esc(meta.name)}</button><div class="card"><h2>${esc(f.title || svcOf(f.kind)[1])}</h2><div class="sub">${esc(svcOf(f.kind)[1])} · ${esc(meta.name)}</div>`;
    h += f.owned ? `<div class="own steal">Owned${f.owner ? ' by ' + esc(f.owner) : ''}<small>Taking items out of it counts as stealing.</small></div>`
                 : (f.kind === 'station' || f.kind === 'water' || f.kind === 'bed' ? `<div class="own safe">Free to use<small>Not owned by anyone.</small></div>` : '');
    if (f.kind === 'bed') h += `<p>${f.safe ? 'A safe place to sleep.' : 'You can sleep here.'}${f.arrest ? ' You can be arrested if caught sleeping here.' : ''}</p>`;
    if (f.kind === 'vendor' && f.items && f.items.length) h += lootList(f.items, 'Sells', q);
    if (f.kind === 'station') {
      for (const t of types) {
        const r = RECIPES[t] || [];
        h += `<h3>${esc(t)} · ${r.length} recipes</h3>` + (r.length ? `<ul class="recipes">${r.map(n => `<li${q && n.toLowerCase().has(q) ? ' style="background:#f0cf86"' : ''}>${esc(n)}</li>`).join('')}</ul>` : '<p class="muted">No recipes listed.</p>');
      }
    }
    el.innerHTML = h + '</div>';
    $('#backBtn').onclick = () => { S.selF = null; renderDetail(); draw(); };
    return;
  }
  if (S.sel != null && d.points[S.sel]) {
    const p = d.points[S.sel], t = LOOT[p.category];
    const title = p.title || (p.type !== 'Custom' && p.type) || p.name;
    let h = `<button class="back" id="backBtn">← ${esc(meta.name)}</button><div class="card"><h2>${esc(title)}</h2>
      <div class="sub">${p.kind === 'pickup' ? 'Item pickup spot' : 'Container'} · ${esc(meta.name)}</div><div class="tags">`;
    if (t) h += `<span class="tag loot" data-cat="${esc(p.category)}" title="Highlight every ${esc(p.category)}">${esc(p.category)}</span>`;
    else if (p.kind === 'container') h += `<span class="tag">No random loot</span>`;
    if (p.locked) h += `<span class="tag red">Locked${p.lockpickable ? ' · lockpick ' + (p.difficulty ?? '') : ' · needs a key'}</span>`;

    if (p.respawn) h += `<span class="tag teal">Restocks</span>`;
    if (!p.active) h += `<span class="tag">Appears after an event</span>`;
    h += '</div>';
    if (p.loot) h += p.steal ? `<div class="own steal">Taking from it counts as stealing<small>Owned by ${esc(p.owner && !/^(name|default (male|female))$/i.test(p.owner) ? p.owner : 'a local resident')}. If someone sees you, it's a crime.</small></div>`
                             : `<div class="own safe">Free to take<small>Nobody owns it, so it isn't stealing.</small></div>`;
    h += '<div class="facts">';
    if (t && p.common != null) h += `<span>Common roll</span><span>${p.common}%</span>`;
    if (t && p.rare != null) h += `<span>Rare roll</span><span>${p.rare}%</span>`;
    if (S.floors.length) { const fi = S.floors.findIndex(f => p.y >= f.lo && p.y <= f.hi); if (fi >= 0) h += `<span>Floor</span><span>${fi + 1} of ${S.floors.length}</span>`; }
    h += '</div>';
    if (t) h += lootList(t.common, 'Common drops', q) + lootList(t.rare, 'Rare drops', q) + `<p><a href="${VIEWER}${t.id}" target="_blank" rel="noopener">“${esc(p.category)}” in the Obenseuer viewer ↗</a></p>`;
    const fixed = [...(p.customItems || []), ...(p.startItems || [])];
    if (fixed.length) h += lootList(fixed, 'Always contains', q);
    el.innerHTML = h + '</div>';
    $('#backBtn').onclick = () => { S.sel = null; renderDetail(); draw(); saveHash(); };
    return;
  }
  const pts = d.points.filter(p => p.active);
  const cats = {}; for (const p of pts) if (p.kind === 'container' && hasTable(p.category)) cats[p.category] = (cats[p.category] || 0) + 1;
  const pk = {}; for (const p of pts) if (p.kind === 'pickup') { const k = hasTable(p.category) ? p.category : 'Fixed items'; pk[k] = (pk[k] || 0) + 1; }
  const list = o => '<ul class="list">' + Object.entries(o).sort((a, b) => b[1] - a[1]).map(([c, n]) =>
    `<li class="${S.cat === c ? 'on' : ''}${!S.cat && qTerm() && hasTable(c) && !tableMatches(c) ? ' dim' : ''}" data-cat="${esc(c)}"><span>${esc(c)}</span><b>${n}</b></li>`).join('') + '</ul>';
  const inside = [...new Map(d.doors.filter(f => f.toSlug && !SC[f.toSlug].outdoor).map(f => [f.toSlug, f])).values()].sort((a, b) => a.toName.localeCompare(b.toName));
  const svc = d.services.filter(f => f.active && !FURN.has(f.kind)), n = k => svc.filter(f => f.kind === k).length;
  const fac = [['bed', 'beds'], ['toilet', 'toilets'], ['vending', 'shop counters'], ['vendor', 'shops'], ['phone', 'phones'], ['mailbox', 'mailboxes']].filter(([k]) => n(k)).map(([k, w]) => n(k) + ' ' + w).join(' · ');
  const dc = {}; for (const f of d.idoors || []) if (f.active) { const k = doorState(f); dc[k] = (dc[k] || 0) + 1; }
  const dn = Object.values(dc).reduce((a, b) => a + b, 0), dsum = [['open', 'open'], ['pick', 'lockpick'], ['key', 'need a key'], ['locked', 'locked another way'], ['blocked', 'blocked']].filter(([k]) => dc[k]).map(([k, w]) => dc[k] + ' ' + w).join(' · ');
  const vc = {}; for (const f of d.verts || []) vc[f.sub] = (vc[f.sub] || 0) + 1;
  const vn = Object.values(vc).reduce((a, b) => a + b, 0), vsum = [['stairs', 'stairs'], ['ladder', 'ladders'], ['elevator', 'elevator stops']].filter(([k]) => vc[k]).map(([k, w]) => vc[k] + ' ' + w).join(' · ');
  el.innerHTML = `<div class="card"><h2>${esc(meta.name)}</h2><div class="sub">${esc(meta.scene)}</div>
    <p class="muted">Click a container type to light it up on the map, or click any box on the map for its loot.</p>
    <div class="split"><span class="a"><b>${meta.safe}</b>free to take</span><span class="b"><b>${meta.steal}</b>stealing</span></div>
    <h3>Containers</h3>${Object.keys(cats).length ? list(cats) : '<p class="muted">No loot containers here.</p>'}
    <h3>Pickup spots</h3>${Object.keys(pk).length ? list(pk) : '<p class="muted">None.</p>'}
    ${fac ? `<h3>Facilities</h3><p>${fac}</p>` : ''}
    ${vn ? `<h3>Ways up and down · ${vn}</h3><p>${vsum}</p>` : ''}
    ${(d.wood || []).length ? `<h3>Tree debris · ${d.wood.length}</h3><p>Wood piles you can chop with an axe${d.wood.some(f => !f.active) ? ' (some appear after an event)' : ''}.</p>` : ''}
    ${dn ? `<h3>Doors inside · ${dn}</h3><p>${dsum}</p>` : ''}
    ${Object.keys(meta.stations || {}).length ? `<h3>Workstations</h3><ul class="list">${Object.entries(meta.stations).sort((a, b) => a[0].localeCompare(b[0])).map(([t, n]) => `<li data-station="${esc(t)}"><span>${esc(t)}</span><b>${n}</b></li>`).join('')}</ul>` : ''}
    ${inside.length ? `<h3>Go inside</h3><ul class="list">${inside.map(f => `<li data-slug="${f.toSlug}"><span>${esc(f.toName)}</span><b>${SC[f.toSlug].lootContainers}</b></li>`).join('')}</ul>` : ''}
  </div>`;
}
$('#detail').addEventListener('click', e => {
  const s = e.target.closest('[data-slug]'); if (s) { openScene(s.dataset.slug); $('#detail').classList.remove('open'); return; }
  const st = e.target.closest('[data-station]');
  if (st) { const f = S.data.services.find(f => f.title === st.dataset.station); if (f) { S.selF = f; S.view.cx = f.x; S.view.cz = f.z; S.view.s = Math.max(S.view.s, 14); S.autoFit = false; renderDetail(); draw(); } return; }
  const c = e.target.closest('[data-cat]');
  if (c && hasTable(c.dataset.cat)) { S.sel = null; setCat(S.cat === c.dataset.cat ? null : c.dataset.cat); }
});

// ---------- floors ----------
function renderFloors() {
  const el = $('#floors'); if (!S.floors.length) { el.innerHTML = ''; return; }
  el.innerHTML = S.floors.map((f, i) => `<button data-f="${i}" class="${S.floor === i ? 'on' : ''}">Floor ${i + 1}</button>`).reverse().join('') +
    `<button data-f="-1" class="${S.floor < 0 ? 'on' : ''}">All floors</button>`;
}
$('#floors').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.floor = +b.dataset.f; buildPaths(); renderFloors(); draw(); saveHash(); });

// ---------- search & layers ----------
function setCat(c) {
  S.cat = c || null;
  const chip = $('#catChip'); if (S.cat) { chip.textContent = S.cat; chip.classList.remove('hidden'); } else chip.classList.add('hidden');
  refresh(); if (S.cat) focusFirstMatch();
}
// Searching inside a place: jump to the nearest match, on its floor, and select it.
function focusFirstMatch() {
  const d = S.data; if (!d || !searching() || S.pendingFocus) return false;
  const c = d.points.filter(p => p.active && pointMatches(p)).concat((d.services || []).filter(f => f.active !== false && stationMatches(f)));
  if (!c.length) return false;
  const dist = t => Math.hypot(t.x - S.view.cx, t.z - S.view.cz);
  const t = c.reduce((a, b) => dist(b) < dist(a) ? b : a);
  const fi = S.floors.findIndex(fl => t.y >= fl.lo && t.y <= fl.hi);
  if (S.floors.length > 1 && fi >= 0 && S.floor !== fi) { S.floor = fi; buildPaths(); renderFloors(); }
  S.view = { cx: t.x, cz: t.z, s: Math.max(S.view.s, 12) }; S.autoFit = false;
  if (t.i != null && d.points[t.i] === t) { S.sel = t.i; S.selF = null; } else { S.sel = null; S.selF = t; }
  renderDetail(); draw(); saveHash(); return true;
}
function refresh() { renderSide(); renderDetail(); draw(); saveHash(); }
let qt; $('#q').addEventListener('input', e => { S.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => { if (S.cat) setCat(null); else { refresh(); if (qTerm().length > 1) focusFirstMatch(); } }, 120); });
$('#catChip').onclick = () => setCat(null);
document.querySelectorAll('input[name=own]').forEach(r => r.addEventListener('change', () => { S.own = r.value; refresh(); }));
const LAYERS = { furniture: 'lyFurniture', loot: 'lyLoot', pickups: 'lyPickups', noloot: 'lyNoLoot', inactive: 'lyInactive', landmarks: 'lyLandmarks', doors: 'lyDoors', wood: 'lyWood', people: 'lyPeople', services: 'lyServices', art: 'lyArt', plan: 'lyPlan' };
for (const [k, id] of Object.entries(LAYERS)) {
  const el = document.getElementById(id); S.layers[k] = el.checked;
  el.addEventListener('change', () => { S.layers[k] = el.checked; if (k === 'plan') S.userPlan = el.checked; draw(); });
}
$('#layersBtn').onclick = () => { const p = $('#layers'); p.classList.toggle('hidden'); $('#layersBtn').setAttribute('aria-expanded', String(!p.classList.contains('hidden'))); };
document.addEventListener('click', e => { if (!e.target.closest('.tools')) $('#layers').classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#layers').classList.contains('hidden')) { $('#layers').classList.add('hidden'); $('#layersBtn').setAttribute('aria-expanded', 'false'); $('#layersBtn').focus(); } });
// reading preferences, kept in this browser
const PREF = { text: false, markers: false, contrast: false };
try { Object.assign(PREF, JSON.parse(localStorage.getItem('obs-pref') || '{}')); } catch (e) {}
function applyPref() {
  document.documentElement.classList.toggle('big-text', !!PREF.text);
  document.documentElement.classList.toggle('hc', !!PREF.contrast);
  $('#pfText').checked = !!PREF.text; $('#pfMarkers').checked = !!PREF.markers; $('#pfContrast').checked = !!PREF.contrast;
  try { localStorage.setItem('obs-pref', JSON.stringify(PREF)); } catch (e) {}
  resize(); draw();
}
for (const [k, id] of [['text', 'pfText'], ['markers', 'pfMarkers'], ['contrast', 'pfContrast']]) $('#' + id).addEventListener('change', e => { PREF[k] = e.target.checked; applyPref(); });
$('#fitBtn').onclick = fit;
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
$('#infoBtn').onclick = () => $('#detail').classList.toggle('open');
try { if (!localStorage.getItem('obs-hint')) $('#hint').classList.remove('hidden'); } catch (e) { $('#hint').classList.remove('hidden'); }
$('#hintClose').onclick = () => { $('#hint').classList.add('hidden'); try { localStorage.setItem('obs-hint', '1'); } catch (e) {} };

// ---------- URL ----------
function saveHash() {
  if (!S.scene || /^#\/db(\/|$)/.test(location.hash)) return;   // the database pages own the URL
  const p = new URLSearchParams();
  if (S.cat) p.set('table', S.cat); else if (S.q.trim()) p.set('q', S.q.trim());
  if (S.sel != null) p.set('sel', S.sel);
  if (S.floor >= 0) p.set('floor', S.floor);
  p.set('v', [S.view.cx, S.view.cz, S.view.s].map(n => +n.toFixed(2)).join(','));
  history.replaceState(null, '', '#/' + S.scene + '?' + p.toString());
}
function readHash() {
  if (/^#\/db(\/|$)/.test(location.hash)) return null;
  const m = location.hash.match(/^#\/([^?]+)\??(.*)$/); if (!m) return null;
  const p = new URLSearchParams(m[2]);
  S.q = p.get('q') || ''; $('#q').value = S.q;
  if (p.get('table')) { S.cat = p.get('table'); $('#catChip').textContent = S.cat; $('#catChip').classList.remove('hidden'); }
  S.sel = p.has('sel') ? +p.get('sel') : null; S.floor = p.has('floor') ? +p.get('floor') : -1;
  if (p.get('v')) { const [cx, cz, s] = p.get('v').split(',').map(Number); if (s) { S.view = { cx, cz, s }; S.autoFit = false; } }
  return m[1];
}

// ---------- boot ----------
$('#ver').textContent = IDX.meta && IDX.meta.extracted ? ` (extracted ${IDX.meta.extracted})` : '';
new ResizeObserver(resize).observe($('#mapWrap'));
if (document.fonts) document.fonts.ready.then(draw);
const start = readHash();
const first = start && SC[start] ? start : 'open-sewer-bazaar';
S.region = SC[first].group; renderTabs(); applyPref();
openScene(first, !!start && !S.autoFit);
window.addEventListener('hashchange', () => { const s = readHash(); if (s && s !== S.scene) openScene(s, true); });
// Used by the database pages (dbview.js) to jump to a scene, optionally with a search.
window.OBS_MAP = { show(slug, q, focus) {
  S.pendingShop = focus || null;
  S.cat = null; $('#catChip').classList.add('hidden'); S.q = q || ''; $('#q').value = S.q; S.sel = null; S.selF = null;
  if (SC[slug]) S.region = SC[slug].group; renderTabs(); resize();
  if (S.scene === slug && S.data) {
    fit(); refresh(); if (!S.pendingShop && searching()) focusFirstMatch();
    if (S.pendingShop) { const f = S.data.services.find(x => x.kind === 'vendor' && x.title === S.pendingShop) || (S.data.people || []).find(x => x.name === S.pendingShop); S.pendingShop = null; if (f) { S.selF = f; S.view = { cx: f.x, cz: f.z, s: 9 }; S.autoFit = false; renderDetail(); draw(); $('#detail').classList.add('open'); } }
  } else openScene(slug);
} };
})();

// Database pages: items, recipes, vendors, tenement, tenants, furniture.
// Routes: #/db, #/db/<section>, #/db/<section>/<key>. Data (data/db.js) loads the first time the database opens.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const IDX = window.OBS_INDEX;
const SCN = Object.fromEntries(IDX.scenes.map(s => [s.slug, s]));
const SECTIONS = [
  ['items', 'Items'], ['recipes', 'Recipes'], ['vendors', 'Vendors'], ['tenement', 'Tenement'], ['upgrades', 'Upgrades'],
  ['tenants', 'Tenants'], ['furniture', 'Furniture'], ['best', 'What to craft'], ['now', 'What can I craft now'], ['level', 'Levelling guide'], ['tcalc', 'Tenement cost'], ['loot', 'Loot ranking'], ['power', 'Power planner'], ['diff', 'Patch changes'], ['skills', 'Your skills'], ['list', 'Shopping list'], ['notes', 'Data notes'],
];
let DB = null, X = null;                       // raw data, derived indexes
const V = { sec: 'items', key: null, q: '', f: '', e: '', e2: '', min: '', w: '', sk: '', lv: '', view: 'list', col: '', dir: 1, sort: 'name', lim: 300, init: false };
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
    const s = document.createElement('script'); s.src = 'data/db.js?v=18';
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
  // multi-use items (a bottle of ink is 50 uses): a recipe that spends ammo takes one use per unit, not the whole item
  X.div = (r, id) => { const it = I[id]; return r[13] && r[13][3] && it && it[10] > 1 ? it[10] : 1; };
  X.unit = unit; X.RC = {}; X.craftCost = {}; X.craftProfit0 = {};
  for (const r of DB.recipes) {
    const cost = r[7].reduce((a, x) => a + unit(x[0]) * x[1] / X.div(r, x[0]), 0), worth = r[8].reduce((a, x) => a + (I[x[0]] ? I[x[0]][1] : 0) * x[1], 0);
    X.RC[r[0]] = { cost, worth, profit: worth - cost };
    for (const o of r[8]) {
      const per = cost / Math.max(o[1], 1), pr = (I[o[0]] ? I[o[0]][1] : 0) - per;
      if (X.craftCost[o[0]] == null || per < X.craftCost[o[0]]) X.craftCost[o[0]] = per;
      if (X.craftProfit0[o[0]] == null || pr > X.craftProfit0[o[0]]) X.craftProfit0[o[0]] = pr;
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

// ---------- real shop prices (the game's formula: base value × the shop's multiplier, at least 1 OC) ----------
const payAt = (v, id) => Math.max(1, Math.round(DB.items[id][1] * (v.bm != null ? v.bm : 1.1)));   // what you pay the shop
const getAt = (v, id) => Math.max(1, Math.round(DB.items[id][1] * (v.sm != null ? v.sm : 0.9)));   // what the shop pays you
const sellersMemo = {}, buyersMemo = {};
// Some shops deal in Real Money: you pay them in RM (v.rm / v.br) or they pay you in RM (v.sr). 1 OC = 0.1 RM (Money.OCtoRM), so prices stay comparable in OC.
const RMX = 0.1;
const isRm = (v, buying) => buying ? !!(v.rm || v.br) : !!v.sr;
// A total split by currency: tot is in OC value, rm is the part of it paid in Real Money
const rmf = oc => +(oc * RMX).toFixed(2);
const mixTxt = (tot, rm) => { rm = rm || 0; const oc = tot - rm; if (rm <= 0.0005) return `${fmt(tot)} OC (${rmf(tot)} RM)`; if (oc <= 0.0005) return `${rmf(rm)} RM (${fmt(rm)} OC)`; return `${fmt(oc)} OC + ${rmf(rm)} RM (≈ ${fmt(tot)} OC / ${rmf(tot)} RM)`; };
const netMix = (oc, rm) => [Math.abs(oc) > 0.0005 && (oc > 0 ? '+' : '-') + fmt(Math.abs(oc)) + ' OC', Math.abs(rm) > 0.0005 && (rm > 0 ? '+' : '-') + +(Math.abs(rm) * RMX).toFixed(2) + ' RM'].filter(Boolean).join(' and ') || '0';
// When an OC shop and an RM shop pay the same for an item, show both: the best buyer in the other currency at the same price
const altBuyer = id => { const bl = buyersOf(id), b0 = bl[0]; return b0 ? bl.find(x => isRm(x.v) !== isRm(b0.v) && x.p >= b0.p) : null; };
const pxt = (v, p, buying) => isRm(v, buying) ? `${rmf(p)} RM (${fmt(p)} OC)` : `${fmt(p)} OC (${rmf(p)} RM)`;
const sellersOf = id => sellersMemo[id] || (sellersMemo[id] = DB.items[id] ? DB.vendors.filter(v => sells(v, +id)).map(v => ({ v, p: payAt(v, id) })).sort((a, b) => a.p - b.p || a.v.n.localeCompare(b.v.n)) : []);
const buyersOf = id => buyersMemo[id] || (buyersMemo[id] = DB.items[id] ? DB.vendors.filter(v => buys(v, +id)).map(v => ({ v, p: getAt(v, id) })).sort((a, b) => b.p - a.p || a.v.n.localeCompare(b.v.n)) : []);
// The cheapest way to pay for one of an ingredient: a group counts as its cheapest member; nothing sells it → its base value, marked as an estimate.
// How reliably a shop has an item: 3 = a fixed list (always there), 2 = in its stock list 'usually', 1 = 'sometimes'. A rarer item is worth less to a trade run, so its price counts for more.
// Opening hours: v.h = 7 days (Monday first) of [opens, closes]; the same hour means closed, a later closing hour than opening wraps past midnight. Shops without hours are always open.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const openAt = (v, d, h) => { if (!v.h || v.h.length < 7 || d < 0) return true; const o = v.h[d][0], c = v.h[d][1]; if (o === c) return false; return o > c ? (h >= o || h < c) : (h >= o && h < c); };
const hoursTxt = v => { if (!v.h || v.h.length < 7) return ''; const all = v.h.map(x => x[0] === x[1] ? 'closed' : x[0] + ':00-' + x[1] + ':00'); if (all.every(x => x === all[0])) return 'Every day ' + all[0]; const out = []; let i = 0; while (i < 7) { let j = i; while (j + 1 < 7 && all[j + 1] === all[i]) j++; out.push((i === j ? DAYS[i].slice(0, 3) : DAYS[i].slice(0, 3) + '-' + DAYS[j].slice(0, 3)) + ' ' + all[i]); i = j + 1; } return out.join(', '); };
const hoursNote = (v, o) => { const t = hoursTxt(v); if (!t) return ''; const cl = o && o.day >= 0 && !openAt(v, o.day, o.hour); return `<br><small class="${cl ? 'bad' : 'muted'}">${cl ? 'Closed then. ' : ''}${esc(t)}</small>`; };
const ordHrs = (t, o) => o && o.day >= 0 ? [...t.filter(v => openAt(v, o.day, o.hour)), ...t.filter(v => !openAt(v, o.day, o.hour))] : t;
const STOCK_W = { 3: 1, 2: 0.8, 1: 0.5 };
const stockTier = (v, id) => { if (v.i && v.i.includes(+id)) return 3; const t = v.t && DB.loot[v.t]; if (!t) return 2; return t[1].includes(+id) ? 2 : 1; };
const stockTxt = t => t === 3 ? 'always stocked' : t === 2 ? 'usually stocked' : 'sometimes stocked';
function buyCost(id, worst, mode) {   // worst: the dearest shop instead of the cheapest (for the profit range)
  const it = DB.items[id]; if (!it) return { p: 0, shop: false };
  let best = null;
  if (mode && mode !== 'cheap' && !worst) {   // 'balanced': price divided by how reliably it is stocked; 'reliable': the most reliable shop first, then the price
    for (const m of (it[6].length ? it[6] : [+id])) for (const s of sellersOf(m)) { const tr = stockTier(s.v, m), sc = mode === 'reliable' ? (4 - tr) * 1e6 + s.p : s.p / STOCK_W[tr]; if (!best || sc < best.sc) best = { p: s.p, shop: true, v: s.v, id: m, tier: tr, sc }; }
    return best || { p: X.unit(id), shop: false, id: +id };
  }
  for (const m of (it[6].length ? it[6] : [+id])) { const sl = sellersOf(m), s0 = worst ? sl[sl.length - 1] : sl[0]; if (s0 && (!best || (worst ? s0.p > best.p : s0.p < best.p))) best = { p: s0.p, shop: true, v: s0.v, id: m }; }
  return best || { p: X.unit(id), shop: false, id: +id };
}
// Quality of what you craft (the game's formula, averaged): skill × 0.2 × the recipe's skill factor × (1 − fail chance) × the recipe's quality factor, from 0.05 to 2; the sale price scales with it.
let skillLv = {}; try { skillLv = JSON.parse(localStorage.getItem('obs-skills') || '{}') || {}; } catch (e) { skillLv = {}; }
const lvlOf = sk => { const v = skillLv[sk]; return typeof v === 'number' && v >= 0 ? Math.min(10, v) : 5; };   // an older saved level above 10 counts as 10
// The workstation you craft at sets an equipment quality (a lathe 5, a table stove 0.5) that multiplies quality and cuts the fail chance. Pick yours on a recipe; the best one is assumed until you do.
let stationPick = {}; try { stationPick = JSON.parse(localStorage.getItem('obs-stations') || '{}') || {}; } catch (e) { stationPick = {}; }
const stMemo = {};
// Which workstations can make a recipe: the right station type, every modifier the recipe requires (r[10]) and none it excludes (r[14]). A station's modifiers are furniture[8].
const stKey = r => r[2] + '|' + (r[10] || []).join(',') + '|' + (r[14] || []).join(',');
const stationsOf = r => {
  const k = stKey(r); if (stMemo[k]) return stMemo[k];
  const all = Object.entries(DB.furniture).filter(([, f]) => (f[4] || []).includes(r[2]) && f[5] && f[5].length)
    .map(([id, f]) => ({ id, n: f[0], q: Math.max(...f[5].map(x => x[9] || 1)), mods: f[8] || [] }));
  const req = r[10] || [], ex = r[14] || [];
  let l = all.filter(x => req.every(c => x.mods.includes(c)) && !ex.some(c => x.mods.includes(c)));
  const loose = !l.length && all.length > 0; if (loose) l = all;   // no station matches the tags in the data: show them all
  return stMemo[k] = l.map(x => Object.assign({ loose }, x)).sort((a, b) => b.q - a.q || a.n.localeCompare(b.n));
};
let stationRec = {}; try { stationRec = JSON.parse(localStorage.getItem('obs-stations-r') || '{}') || {}; } catch (e) { stationRec = {}; }
let eqTmp = null;   // while comparing stations: { rid, id } = the station being priced
const stationFor = r => { const l = stationsOf(r); if (!l.length) return null;
  if (eqTmp && eqTmp.rid === r[0]) { const t = l.find(x => x.id === eqTmp.id); if (t) return t; }
  return l.find(x => x.id === String(stationRec[r[0]])) || l.find(x => x.id === String(stationPick[r[2]])) || l[0]; };
const eqOf = r => { const s = stationFor(r); return s ? s.q : 1; };
const stInfo = x => `quality ${+x.q.toFixed(2)}${x.mods.length ? ' \u00b7 ' + x.mods.join(', ') : ''}`;
const stationSelect = r => { const l = stationsOf(r); if (!l.length) return ''; const cur = stationFor(r).id;
  if (l.length < 2) return `${esc(l[0].n)} <small class="muted">(${esc(stInfo(l[0]))})</small>`;
  return `<select data-station="${r[0]}" aria-label="Workstation for ${esc(r[1])}" title="The workstation sets an equipment quality that multiplies the quality you craft at and changes the fail chance">${l.map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.n)} \u00b7 ${esc(stInfo(x))}</option>`).join('')}</select>`; };
function setStation(rid, id) { stationRec[rid] = id; try { localStorage.setItem('obs-stations-r', JSON.stringify(stationRec)); } catch (e) {} clearRP(); if (V.sec === 'recipes' || V.sec === 'items') renderList(); renderDetail(); }
const qualityOf = r => { const x = r[13] || [1, 1, 0]; if (x[2] > 0) return x[2]; if (!r[3] || r[3] === 'None') return 1; return Math.max(0.05, Math.min(2, lvlOf(r[3]) * 0.2 * x[0] * (1 - (r[5] || 0)) * eqOf(r) * x[1])); };
// The chance a craft fails at your level (the game's formula): the recipe's fail chance drops 3 points per skill level above its minimum, times the recipe's skill factor; below the minimum it gets much worse.
const failNow = r => {
  const f = r[5] || 0; if (f >= 1) return 1; if (f === 0 || !r[3] || r[3] === 'None') return f;
  const lv = lvlOf(r[3]), mn = r[4] || 0, sf = (r[13] || [1])[0] || 1, num = Math.max(0, lv - mn);
  let eq = eqOf(r); if (mn > 0 && mn > lv) eq /= 0.5 * (mn - lv) + 1;
  let n2 = 1 - ((1 - f / (eq > 1 ? eq : 1)) * (eq < 1 ? eq : 1) + 0.03 * num * sf);
  if (mn > 0 && mn > lv) n2 *= Math.pow(1 + n2, mn - lv);
  return Math.max(0, Math.min(1, n2));
};
const qualityValue = q => q > 1 ? q * q : 0.5 * q * q + 0.25 * q + 0.25;
const hasQuality = id => !!(DB.items[id] && DB.items[id][8].includes('ItemQualityData'));
const skillSelect = sk => `<select data-skill="${esc(sk)}" aria-label="Your ${esc(sk)} level" title="Your ${esc(sk)} level: sets the quality of what you craft, which sets what shops pay">${Array.from({ length: 11 }, (_, i) => `<option value="${i}" ${i === lvlOf(sk) ? 'selected' : ''}>${esc(sk)} ${i}</option>`).join('')}</select>`;
function setSkill(sk, v) { skillLv[sk] = v; try { localStorage.setItem('obs-skills', JSON.stringify(skillLv)); } catch (e) {} clearRP(); if (V.sec === 'recipes') renderList(); renderDetail(); }
// ---------- skills from a save (Globals.tnmt: the game's skills; mod skills keep their XP in their own save entries; Woodcutting in woodcutting.json) ----------
const MODSK = [['Scavenging', 'ScavengeTimer_Stash_001'], ['Haggling', 'JuanBerta_Haggling_Save_001'], ['Stealth', 'JuanBerta_Stealth_Save_001'], ['Fraud', 'JuanBerta_ScamArtist_Save_001']];
const modLevel = xp => xp > 0 ? Math.floor(Math.min(10, 1 + xp / 1000)) : 0;   // the Skills Pack: learned at the first XP, 1000 XP per level, up to 10
let saveInfo = null; try { saveInfo = JSON.parse(localStorage.getItem('obs-saveinfo') || 'null'); } catch (e) {}
let saveMsg = '';
async function loadSaves(files) {
  const info = { name: '', game: {}, mods: [], at: new Date().toLocaleString() }; const notes = [];
  for (const f of files) {
    let j; try { j = JSON.parse((await f.text()).replace(/^\uFEFF/, '')); } catch (e) { notes.push(f.name + ' could not be read.'); continue; }
    if (j && Array.isArray(j.Data)) {
      info.name = [j.CharacterName, j.SaveName].filter(Boolean).join(' · ');
      const by = {}; j.Data.forEach(x => { if (x && x.GUID) by[x.GUID] = x.Data || {}; });
      const sk = by.PlayerStats && by.PlayerStats.Skills;
      if (Array.isArray(sk)) sk.forEach(x => { if (x && x.Type && x.Type !== 'None') info.game[x.Type] = Math.floor(x.Skill || 0); }); else notes.push(f.name + ' has no player skills.');
      for (const [n, g] of MODSK) if (by[g] && typeof by[g].skillXp === 'number') info.mods.push({ n, xp: by[g].skillXp, lvl: modLevel(by[g].skillXp) });
    } else if (j && typeof j.xp === 'number' && 'level' in j) info.mods.push({ n: 'Woodcutting', xp: j.xp, lvl: Math.max(0, j.level | 0) });
    else notes.push(f.name + ' is not a save file (pick Globals.tnmt, and woodcutting.json if you use Woodcutting).');
  }
  const old = saveInfo && saveInfo.mods || [];   // keep mod skills from an earlier pick when this pick has none of that skill
  info.mods = info.mods.concat(old.filter(o => !info.mods.some(m => m.n === o.n)));
  if (!Object.keys(info.game).length && saveInfo) { info.game = saveInfo.game; info.name = info.name || saveInfo.name; }
  const used = new Set(DB.recipes.map(r => r[3]));
  let n = 0; for (const [k, v] of Object.entries(info.game)) if (used.has(k)) { skillLv[k] = Math.max(0, Math.min(10, v)); n++; }
  try { localStorage.setItem('obs-skills', JSON.stringify(skillLv)); localStorage.setItem('obs-saveinfo', JSON.stringify(info)); } catch (e) {}
  saveInfo = info; clearRP();
  saveMsg = (n ? n + ' crafting skill levels loaded from your save. ' : '') + notes.join(' ');
  renderDetail();
}
function skillsCard() {
  const names = [...new Set(DB.recipes.map(r => r[3]).filter(x => x && x !== 'None'))].sort();
  const cnt = sk => DB.recipes.filter(r => r[3] === sk).length;
  return `<div class="card"><h2>Your skills</h2><div class="sub">${names.length} crafting skills</div>
    <p>Enter your level in each skill. The quality of what you craft depends on it, and shops pay more for higher quality, so the profit shown on recipes uses these levels (a skill left alone counts as level 5). Quality ≈ level × 0.2 × the recipe's skill factor × (1 − fail chance), between 0.05 and 2.</p>
    <div class="facts">${names.map(sk => `<span>${esc(sk)} <small class="muted">${cnt(sk)} recipes</small></span><span><input type="number" min="0" max="10" step="1" inputmode="numeric" data-skillin="${esc(sk)}" value="${lvlOf(sk)}" aria-label="${esc(sk)} level" style="width:5em"></span>`).join('')}</div>
    <button type="button" class="dbmore" data-skillreset>Reset all to 5</button>
    <h3>Load from a save</h3>
    <p>Pick <b>Globals.tnmt</b> from a save slot (and <b>woodcutting.json</b> from the character's folder if you use Woodcutting). Everything is read here in your browser and never uploaded. Your saves are in <code>C:\Users\&lt;you&gt;\AppData\LocalLow\Loiste Interactive\Obenseuer\Saves\&lt;character&gt;\&lt;slot&gt;</code>.</p>
    <label class="dbmore" style="display:inline-block;cursor:pointer">Choose save files…<input type="file" data-saveinput multiple accept=".tnmt,.json,application/json" hidden></label>
    ${saveMsg ? `<p class="good">${esc(saveMsg)}</p>` : ''}
    ${saveInfo ? `<p class="muted">Loaded ${esc(saveInfo.name || 'a save')} · ${esc(saveInfo.at)}</p>
      ${saveInfo.mods.length ? `<h3>Skills from mods</h3><div class="facts">${saveInfo.mods.map(m => `<span>${esc(m.n)} <small class="muted">mod</small></span><span><b>Level ${m.lvl}</b> <small class="muted">${m.n === 'Woodcutting' ? '' : fmt(m.xp) + ' XP'}</small></span>`).join('')}</div><p class="muted">Mod skills do not change recipe quality; they are shown for reference (Scavenging, Haggling, Stealth, Fraud and Woodcutting come from the Skills Pack).</p>` : ''}
      ${Object.keys(saveInfo.game).length ? `<h3>Other game skills</h3><div class="facts">${Object.entries(saveInfo.game).filter(([k]) => !names.includes(k)).sort().map(([k, v]) => `<span>${esc(k)}</span><span>Level ${v}</span>`).join('')}</div>` : ''}` : ''}
    <p class="muted">The game caps skills at 10. Your levels are kept in this browser only.</p></div>`;
}
// the container liquids are sold in: its liquid value factor multiplies what a shop pays for the liquid (a filled container is worth its own value + liters × liquid value × factor)
let contPick = 'best'; try { contPick = localStorage.getItem('obs-cont') || 'best'; } catch (e) {}
const contList = () => (DB.containers || []).slice().sort((a, b) => b[2] - a[2] || b[1] - a[1]);
const saleCont = () => { const l = contList(); return !l.length || contPick === 'none' ? null : l.find(c => String(c[0]) === contPick) || l[0]; };
const isLiquid = id => !!(DB.items[id] && DB.items[id][2].includes('Liquid'));
const saleF = id => { const c = isLiquid(id) && saleCont(); return c ? c[2] : 1; };
const RPmemo = {}, CPmemo = {};
const clearRP = () => { for (const k in RPmemo) delete RPmemo[k]; for (const k in CPmemo) delete CPmemo[k]; };
// Profit per unit of an item when you craft it: at real shop prices, your skill and quality when a shop buys it, base values otherwise (so the sign matches the recipe's own numbers).
const craftProfitOf = id => { if (id in CPmemo) return CPmemo[id]; let best = null; for (const rid of X.makes[id] || []) { const p = realProfit(rid), o = X.R[rid][8].find(x => x[0] === +id), n = Math.max(o ? o[1] : 1, 1), v = p.sellable ? p.profit / n : X.craftProfit0[id]; if (best == null || v > best) best = v; } return CPmemo[id] = best; };
const recipeProfit = rid => { const p = realProfit(rid); return p.sellable ? p.profit : X.RC[rid].profit; };
function realProfit(rid, qo, mode) {   // mode 'best' / 'worst': the best or worst shops for buying and selling (a profit range)
  if (qo == null && !mode && !eqTmp && RPmemo[rid]) return RPmemo[rid];
  const W = mode === 'worst', bestBuyer = id => { const bl = buyersOf(id); return W ? bl[bl.length - 1] : bl[0]; };
  const r = X.R[rid], ing = r[7].map(x => Object.assign({ id: x[0], n: x[1], div: X.div(r, x[0]) }, buyCost(x[0], W)));
  const q = qo != null ? qo : qualityOf(r), outs = r[8].map(x => { const b = bestBuyer(x[0]), qv = hasQuality(x[0]) ? qualityValue(q) : 1; return { id: x[0], n: x[1], p: b ? Math.max(1, Math.round(b.p * qv * saleF(x[0]))) : 0, v: b ? b.v : null, q: qv !== 1 || hasQuality(x[0]) ? q : null }; });
  const fail = failNow(r), failOuts = (r[9] || []).map(x => { const b = bestBuyer(x[0]), qv = hasQuality(x[0]) ? qualityValue(q * 0.5) : 1; return { id: x[0], n: x[1], p: b ? Math.max(1, Math.round(b.p * qv * saleF(x[0]))) : 0, v: b ? b.v : null }; });
  const cost = ing.reduce((a, x) => a + x.p * x.n / x.div, 0), rev = outs.reduce((a, x) => a + x.p * x.n, 0) * (1 - fail) + failOuts.reduce((a, x) => a + x.p * x.n, 0) * fail, profit = rev - cost;
  const costRM = ing.reduce((a, x) => a + (x.shop && isRm(x.v, true) ? x.p * x.n / x.div : 0), 0);
  const revRM = outs.reduce((a, x) => a + (x.v && isRm(x.v) ? x.p * x.n : 0), 0) * (1 - fail) + failOuts.reduce((a, x) => a + (x.v && isRm(x.v) ? x.p * x.n : 0), 0) * fail;
  const res = { costRM, revRM, q, fail, failOuts, ing, outs, cost, rev, profit, hour: r[6] > 0 ? profit * 3600 / r[6] : null, sellable: outs.some(o => o.v), estimated: ing.some(x => !x.shop) };
  if (qo == null && !mode && !eqTmp) RPmemo[rid] = res;
  return res;
}
const profitTxt = n => { const sg = n >= 0 ? '+' : '-', a = Math.abs(n); return `${sg}${fmt(a)} OC / ${sg}${rmf(a)} RM`; };
const realText = rid => { const p = realProfit(rid); if (!p.sellable) return '<span class="muted">No shop buys what this makes.</span>';
  const lq = realProfit(rid).outs.some(o => o.v && isLiquid(o.id)) && saleCont(); return `${lq ? `<span class="muted">Liquid sold in a ${esc(iname(lq[0]))} (${lq[1]} L, ×${lq[2]}). </span>` : ''}At shops: pay ≈ ${mixTxt(p.cost, p.costRM)}${p.estimated ? '*' : ''} · get ≈ ${mixTxt(p.rev, p.revRM)} · <b class="${p.profit >= 0 ? 'good' : 'bad'}">${profitTxt(p.profit)}</b>${p.costRM || p.revRM ? ` <small class="muted">(in OC value: ${netMix((p.rev - p.revRM) - (p.cost - p.costRM), p.revRM - p.costRM)})</small>` : ''}${p.hour != null ? ` · ${profitTxt(p.hour)}/h` : ''}`; };
// What the same craft earns at other qualities (price scales with quality; only for outputs that can have a quality).
const QTIERS = [0.5, 1, 1.5, 2];
function qualityRows(rid) {
  const r = X.R[rid]; if (!r[8].some(x => hasQuality(x[0]))) return '';
  const cur = realProfit(rid).q, tiers = [...new Set([...QTIERS, +cur.toFixed(2)])].sort((a, b) => a - b);
  const rows = tiers.map(t => { const p = realProfit(rid, t), mine = Math.abs(t - cur) < 0.006; return `<span>Quality ${t}${mine ? ' <small class="muted">(yours)</small>' : ''}</span><span>${p.sellable ? `get ${fmt(p.rev)} OC · <b class="${p.profit >= 0 ? 'good' : 'bad'}">${profitTxt(p.profit)}</b>${p.hour != null ? ` · ${profitTxt(p.hour)}/h` : ''}` : '<small class="muted">no shop buys it</small>'}</span>`; });
  return `<h3>Profit by quality</h3><div class="facts">${rows.join('')}</div><p class="muted">Same recipe, same fail chance, other quality. Higher skill and a better workstation raise it.</p>`;
}
// The lowest and highest profit this recipe can give: at your quality across the shops, and across every quality the game allows (0.05 to 2) and every shop.
function rangeRows(rid) {
  const p = realProfit(rid); if (!p.sellable) return '';
  const mk = (q, m) => realProfit(rid, q, m).profit, qa = +p.q.toFixed(2);
  const rows = [[`At your quality (${qa}), by shop`, mk(p.q, 'worst'), mk(p.q, 'best')], ['Any quality, by shop', mk(0.05, 'worst'), mk(2, 'best')]];
  return `<h3>Lowest and highest profit</h3><div class="facts">${rows.map(([l, lo, hi]) => `<span>${l}</span><span><b class="${lo >= 0 ? 'good' : 'bad'}">${profitTxt(lo)}</b> to <b class="${hi >= 0 ? 'good' : 'bad'}">${profitTxt(hi)}</b></span>`).join('')}</div><p class="muted">Worst: the dearest shop for the ingredients, the lowest-paying shop for what it makes. Best: the cheapest shop and the best buyer. Quality goes from 0.05 to 2 in the game.</p>`;
}
function tradeBlock(rid) {
  const p = realProfit(rid), r = X.R[rid];
  const buy = p.ing.map(x => `<span>${il(x.id)} <small class="muted">× ${num(x.n)}${x.div > 1 ? ` use${x.n === 1 ? '' : 's'} of ${x.div}` : ''}</small></span><small>${x.shop ? `${pxt(x.v, x.p, true)} ${x.div > 1 ? `per item (≈ ${fmt(x.p / x.div)} OC per use)` : 'each'} at ${esc(x.v.n)} · ${esc(sceneName(x.v.sc))}` : `not sold · ≈ ${fmt(x.p)} OC`}</small>`);
  const sell = p.outs.map(x => `<span>${il(x.id)} <small class="muted">× ${num(x.n)}</small></span><small>${x.v ? `${pxt(x.v, x.p)} each at ${esc(x.v.n)} · ${esc(sceneName(x.v.sc))}${(() => { const a = x.v && altBuyer(x.id); return a ? ` <small class="muted">or ${pxt(a.v, Math.max(1, Math.round(a.p * (x.p / Math.max(1, buyersOf(x.id)[0].p)))))} each at ${esc(a.v.n)} · ${esc(sceneName(a.v.sc))}</small>` : ''; })()}` : 'no shop buys it'}</small>`);
  return `<h3>Trade at shops</h3><p>${realText(rid)}</p>${qualityRows(rid)}${rangeRows(rid)}<h3>Buy the ingredients</h3>${ul(buy)}<h3>Sell what it makes</h3>${ul(sell)}
    <p class="muted">Shops that deal in Real Money show RM (1 RM = 10 OC); the profit counts them at their OC value. Real shop prices: base value × the shop's multiplier. ${p.estimated ? '* Ingredients no shop sells are counted at base value. ' : ''}${r[3] && r[3] !== 'None' && r[4] > lvlOf(r[3]) ? `<b class="bad">Your ${esc(r[3])} (${lvlOf(r[3])}) is below this recipe's minimum (${r[4]}): it almost always fails.</b> ` : ''}Counts the ${Math.round(p.fail * 100)}% fail chance at your level${p.failOuts.some(o => o.v) ? ' (and what a failed craft sells for)' : ''} and the quality of what you make (${p.outs.some(o => o.q != null) ? 'quality ≈ ' + (+p.q.toFixed(2)) : 'these items have no quality'}, at ${skillSelect(r[3])}, crafted at ${stationSelect(r) || 'any workstation'}). Ignores the quality of bought ingredients and what the shop stocks that day.</p>`;
}
// A trade run: what to buy where, then what to sell where, with the stops of each part in a sensible walking order (same area together, nearest next).
function tripOrder(vs) {
  const by = new Map(); vs.forEach(v => { if (!by.has(v.sc)) by.set(v.sc, []); by.get(v.sc).push(v); });
  const out = []; let at = null;
  for (const [, g] of [...by].sort((a, b) => b[1].length - a[1].length || sceneName(a[0]).localeCompare(sceneName(b[0])))) {
    let cur = at && at.sc === g[0].sc ? at : g[0]; const left = g.slice();
    while (left.length) { left.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z)); cur = left.shift(); out.push(cur); }
    at = cur;
  }
  return out;
}
function tradeRun(raw, make, o) {
  const buy = new Map(), sell = new Map(), find = [], nosell = []; let bt = 0, st = 0, bRm = 0, sRm = 0; const alts = [];
  const add = (m, v, l) => { if (!m.has(v)) m.set(v, []); m.get(v).push(l); };
  for (const [id, n0] of Object.entries(raw)) { const n = Math.ceil(n0 - 1e-9), c = buyCost(id, false, o && o.shop); if (!c.shop || (o && o.pref[id] === 'find')) { find.push([+id, n]); continue; } add(buy, c.v, { id: c.id, n, p: c.p, tier: c.tier || stockTier(c.v, c.id) }); bt += c.p * n; if (isRm(c.v, true)) bRm += c.p * n; }
  for (const [id, n] of Object.entries(make)) { const b = buyersOf(+id)[0]; if (!b) { nosell.push(+id); continue; } add(sell, b.v, { id: +id, n, p: b.p }); st += b.p * n; if (isRm(b.v)) sRm += b.p * n; const a = altBuyer(+id); if (a) alts.push([+id, a]); }
  if (!buy.size && !sell.size) return '';
  const stop = (v, ls, k, buying) => `<span>${vl(v)}${hoursNote(v, o)}<br>${ls.map(l => `<small class="muted">${il(l.id)} × ${num(l.n)} · ${pxt(v, l.p, buying)} each = ${pxt(v, l.p * l.n, buying)}${buying && l.tier ? ' - ' + stockTxt(l.tier) : ''}</small>`).join('<br>')}</span>${mapBtn(v.sc, iname(ls[0].id), k, v.n)}`;
  let h = `<h3>Trade run</h3><label class="shopopt">Choose shops by <select data-shopbuy aria-label="How to choose the shop for each ingredient">${[['balanced', 'Price and availability'], ['cheap', 'Lowest price only'], ['reliable', 'Most reliable stock']].map(([k, t]) => `<option value="${k}" ${((o && o.shop) || 'balanced') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="shopopt">Shopping on <select data-shopday aria-label="Day you will shop"><option value="-1">any day (ignore opening hours)</option>${DAYS.map((d, i) => `<option value="${i}" ${o && o.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select> at <select data-shophour aria-label="Hour you will shop">${[...Array(24).keys()].map(n => `<option value="${n}" ${o && o.hour === n ? 'selected' : ''}>${n}:00</option>`).join('')}</select></label><p>Buy ≈ ${mixTxt(bt, bRm)} · sell ≈ ${mixTxt(st, sRm)} · <b class="${st - bt >= 0 ? 'good' : 'bad'}">${profitTxt(st - bt)}</b>${bRm || sRm ? ` <small class="muted">(in OC value: ${netMix((st - sRm) - (bt - bRm), sRm - bRm)})</small>` : ''}</p>`;
  if (buy.size) h += `<p class="muted">1. Buy, in this order:</p>${ul(ordHrs(tripOrder([...buy.keys()]), o).map(v => stop(v, buy.get(v), 'Show the shop', true)))}`;
  if (sell.size) h += `<p class="muted">2. Sell, in this order:</p>${ul(ordHrs(tripOrder([...sell.keys()]), o).map(v => stop(v, sell.get(v), 'Show the shop')))}`;
  if (find.length) h += `<p class="muted">To find, not buy (left out of the cost and the route): ${find.map(([id, n]) => `${il(id)} × ${num(n)}`).join(', ')}</p>`;
  if (alts.length) h += `<p class="muted">Same price in the other currency: ${alts.map(([id, a]) => `${il(id)} at ${esc(a.v.n)} (${esc(sceneName(a.v.sc))}) for ${pxt(a.v, a.p)}`).join(', ')}</p>`;
  if (nosell.length) h += `<p class="muted">No shop buys: ${nosell.map(il).join(', ')}</p>`;
  return h + `<p class="muted">Shops are picked as set above: a shop with a fixed list always has the item, one with a stock list only usually or sometimes does. Best price for each product. Item quality, stolen goods and the exact daily stock are ignored.</p>`;
}

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
    case 'tenement': case 'upgrades': return imgIco(placeIcon('Tenement'));
    case 'tenants': { const t = DB.tenants.find(t => DB.icons && DB.icons.people && DB.icons.people[t[0]] != null); return t ? pIco(t[0]) : imgIco(placeIcon('Open Homes Company')); }
    case 'furniture': return imgIco(placeIcon('Möbelmann Furnitures', 'Commercial Furniture Shop'));
    case 'notes': { const r = Object.keys(DB.items).find(id => DB.items[id][2].includes('Readable')); return r ? iIco(r) : ''; }
  }
  return '';
}

// ---------- helpers ----------
const unit = id => DB.items[id] && DB.items[id][2].includes('Liquid') ? ' liters' : '';   // a liquid is counted in liters held in bottles
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
const mapBtn = (slug, q, text, focus) => `<button class="go" data-map="${esc(slug)}" data-q="${esc(q || '')}"${focus ? ` data-focus="${esc(focus)}"` : ''}>${esc(text || 'Show on the map')}</button>`;
const ul = a => a.length ? '<ul class="items">' + a.map(x => `<li>${x}</li>`).join('') + '</ul>' : '<p class="muted">None.</p>';
const recipesOf = set => set && set.size ? [...set].sort((a, b) => X.R[a][1].localeCompare(X.R[b][1])).map(rl) : [];
const skillsFor = types => [...new Set(types.flatMap(t => DB.typeSkills[t] || []))];

// ---------- shared helpers: numbers, URL state, shopping list ----------
const fmt = n => String(+(+n).toFixed(1));
const goodStat = (k, v) => k === 'dep' || k === 'ble' || k === 'tir' ? v < 0 : (k === 'nut' || k === 'thi' || k === 'hp' || k === 'hyg') ? v > 0 : null;
const wide = () => !matchMedia('(max-width:820px)').matches;
const tableOn = () => V.sec === 'items' && V.view === 'table' && wide();
const PARAMS = [['c', 'f'], ['e', 'e'], ['e2', 'e2'], ['min', 'min'], ['w', 'w'], ['s', 'sort'], ['q', 'q'], ['v', 'view'], ['col', 'col'], ['sk', 'sk'], ['lv', 'lv']];
const DEFAULTS = { f: '', e: '', e2: '', min: '', w: '', sk: '', lv: '', sort: 'name', q: '', view: 'list', col: '' };
const FIELDS = ['f', 'e', 'e2', 'min', 'w', 'sort', 'q', 'view', 'col', 'dir'];
const FRESH = { f: '', e: '', e2: '', min: '', w: '', sk: '', lv: '', sort: 'name', q: '', view: 'list', col: '', dir: 1 };
let SAVED = {}; try { SAVED = JSON.parse(sessionStorage.getItem('obs-dbstate') || '{}') || {}; } catch (e) {}
function stash() { SAVED[V.sec] = Object.fromEntries(FIELDS.map(f => [f, V[f]])); try { sessionStorage.setItem('obs-dbstate', JSON.stringify(SAVED)); } catch (e) {} }
const filtered = () => !!(V.f || V.e || V.e2 || V.min || V.w || V.q || V.sk || V.lv);
function qsOf() { const p = new URLSearchParams(); for (const [k, f] of PARAMS) if (V[f] !== DEFAULTS[f] && V[f] != null) p.set(k, V[f]); if (V.col && V.dir < 0) p.set('dir', 'd'); return p.toString(); }
function applyQs(qs) { const p = new URLSearchParams(qs); if (p.get('l')) { try { importShare(p.get('l'), p.get('n')); history.replaceState(null, '', location.pathname + location.search + '#/db/list'); p.delete('l'); p.delete('n'); } catch (e) {} } for (const [k, f] of PARAMS) V[f] = p.get(k) ?? DEFAULTS[f]; V.dir = p.get('dir') === 'd' ? -1 : 1; V.lim = 300; }
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
// Several named shopping lists, kept in this browser. 'obs-shop' still holds the active one.
let listsMem = null;
const listsLoad = () => {
  if (listsMem) return listsMem;
  try { listsMem = JSON.parse(localStorage.getItem('obs-shop-lists') || 'null'); } catch (e) { listsMem = null; }
  if (!listsMem || typeof listsMem !== 'object' || !listsMem.lists || typeof listsMem.lists !== 'object') { let old = {}; try { old = JSON.parse(localStorage.getItem(SHOP) || '{}') || {}; } catch (e) {} listsMem = { active: 'My list', lists: { 'My list': old } }; }
  if (!listsMem.lists[listsMem.active]) { const k = Object.keys(listsMem.lists); if (k.length) listsMem.active = k[0]; else { listsMem.active = 'My list'; listsMem.lists['My list'] = {}; } }
  return listsMem;
};
const shopGet = () => { if (!shopMem) { const L = listsLoad(); shopMem = L.lists[L.active]; } return shopMem; };
const shopSave = () => { try { const L = listsLoad(); L.lists[L.active] = shopGet(); localStorage.setItem('obs-shop-lists', JSON.stringify(L)); localStorage.setItem(SHOP, JSON.stringify(shopGet())); } catch (e) {} };
const listSwitch = name => { const L = listsLoad(); if (!L.lists[name]) return; L.active = name; shopMem = null; shopSave(); shopBadge(); };
const listNew = (name, map) => { const L = listsLoad(); name = String(name || '').trim().slice(0, 40); if (!name) return; if (L.lists[name]) { if (!map) { listSwitch(name); return; } name += ' (2)'; } L.lists[name] = map || {}; listSwitch(name); };
// Items you ticked off as bought, per list
let doneMem = null;
const doneAll = () => { if (!doneMem) { try { doneMem = JSON.parse(localStorage.getItem('obs-shop-done') || '{}') || {}; } catch (e) { doneMem = {}; } } return doneMem; };
const isDone = id => !!doneAll()[listsLoad().active + ':' + id];
const setDone = (id, on) => { const d = doneAll(), k = listsLoad().active + ':' + id; if (on) d[k] = 1; else delete d[k]; try { localStorage.setItem('obs-shop-done', JSON.stringify(d)); } catch (e) {} };
const doneClear = () => { const d = doneAll(), p = listsLoad().active + ':'; Object.keys(d).forEach(k => { if (k.startsWith(p)) delete d[k]; }); try { localStorage.setItem('obs-shop-done', JSON.stringify(d)); } catch (e) {} };
// A shared list comes in as a new list of its own, so nothing you have is overwritten
function importShare(s, n) { const m = {}; String(s).split(',').forEach(x => { const [r, q] = x.split(':'); if (X.R[r] && +q > 0) m[r] = Math.min(9999, Math.floor(+q)); }); if (!Object.keys(m).length) return; listNew(n || 'Shared list', m); }
const shareLink = () => location.href.split('#')[0] + '#/db/list?l=' + encodeURIComponent(Object.entries(shopGet()).map(([r, q]) => r + ':' + q).join(',')) + '&n=' + encodeURIComponent(listsLoad().active);
const listBar = () => `<div class="shopopt"><select data-listpick aria-label="Shopping list">${Object.keys(listsLoad().lists).map(k => `<option ${k === listsLoad().active ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select> <button type="button" class="dbmore" data-listnew>New list</button> <button type="button" class="dbmore" data-listren>Rename</button> <button type="button" class="dbmore" data-listdel>Delete</button></div>`;
const shopCount = () => Object.keys(shopGet()).length;
const shopBadge = () => { const b = $('#shopN'); if (b) b.textContent = shopCount(); };
function shopSet(rid, n) { const L = shopGet(); n = Math.max(0, Math.min(9999, Math.floor(+n) || 0)); if (n) L[rid] = n; else delete L[rid]; shopSave(); shopBadge(); }
const qtyBtn = (rid, d) => `<button type="button" data-shop="${rid}" data-d="${d}" aria-label="${d > 0 ? 'Add ' + d : 'Remove ' + -d}">${d > 0 ? '+' + d : '−' + -d}</button>`;
const qtyCtl = (rid, n) => `<span class="qty">${[-100, -10, -1].map(d => qtyBtn(rid, d)).join('')}<input type="number" class="qin" min="0" max="9999" step="1" inputmode="numeric" value="${n}" data-shopset="${rid}" aria-label="Quantity">${[1, 5, 10, 100].map(d => qtyBtn(rid, d)).join('')}<button type="button" class="x" data-shop="${rid}" data-d="-99999" aria-label="Remove from the list">✕</button></span>`;
function shopChange(rid, d) { const L = shopGet(), n = Math.max(0, (L[rid] || 0) + d); if (n) L[rid] = n; else delete L[rid]; shopSave(); shopBadge(); }
let optMem = null;
const shopOpt = () => {
  if (!optMem) { try { optMem = JSON.parse(localStorage.getItem('obs-shop-opt') || 'null'); } catch (e) {} if (!optMem || typeof optMem !== 'object') optMem = {}; }
  if (!['all', 'missing', 'off'].includes(optMem.mode)) optMem.mode = 'all'; if (!['balanced', 'cheap', 'reliable'].includes(optMem.shop)) optMem.shop = 'balanced'; if (typeof optMem.day !== 'number') optMem.day = -1; if (typeof optMem.hour !== 'number') optMem.hour = 12; if (!optMem.pref || typeof optMem.pref !== 'object') optMem.pref = {}; if (!optMem.rec || typeof optMem.rec !== 'object') optMem.rec = {};   // pref: item id -> 'craft', 'buy' or 'find' (you will find it, not buy it), overriding the default
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
// Every recipe that makes an item (not counting ones that need the item itself), cheapest first, and the one the shopping list uses: your pick, else the cheapest.
const recipeOpts = id => [...(X.makes[id] || [])].filter(rid => !X.R[rid][7].some(x => x[0] === +id))
  .sort((a, b) => X.RC[a].cost / Math.max(X.R[a][8].find(x => x[0] === +id)[1], 1) - X.RC[b].cost / Math.max(X.R[b][8].find(x => x[0] === +id)[1], 1));
const pickRecipe = (id, opt) => { const c = opt.rec && opt.rec[id]; const ok = c != null && recipeOpts(id).some(r => String(r) === String(c)); return ok ? +c : bestRecipe(id); };
const recPick = (out, cur) => { const ro = recipeOpts(out); if (ro.length < 2) return ''; return `<label class="shopopt">Recipe <select data-recpick="${out}" aria-label="Recipe that makes ${esc(iname(out))}">${ro.map(r => `<option value="${r}" ${String(r) === String(cur) ? 'selected' : ''}>${esc(X.R[r][1])} (${esc(X.R[r][2])}): ${esc(X.R[r][7].slice(0, 3).map(x => iname(x[0])).join(', '))}${X.R[r][7].length > 3 ? '...' : ''} - ${fmt(X.RC[r].cost / Math.max(X.R[r][8].find(x => x[0] === +out)[1], 1))} OC each</option>`).join('')}</select></label>`; };
// Break the ingredients down: 'all' crafts everything craftable, 'missing' only what nothing in the world drops or sells, 'off' none. The buttons override this per item.
const wantCraft = (id, opt) => { const p = opt.pref[id]; return p === 'craft' || (opt.mode !== 'off' && p !== 'buy' && p !== 'find' && (opt.mode === 'all' || (!X.placed.has(id) && !X.sold.has(id)))); };
function expandNeeds(base, opt) {
  const raw = {}, steps = {}, outs = {}, order = [];
  const visit = (id, n, stack) => {
    id = +id; const it = DB.items[id];
    const rid = wantCraft(id, opt) && !(it && it[6].length) && stack.length < 8 && !stack.includes(id) ? pickRecipe(id, opt) : null;
    if (rid == null) { raw[id] = (raw[id] || 0) + n; return; }
    const r = X.R[rid], per = r[8].find(x => x[0] === id)[1], b = n / per;
    r[7].forEach(x => visit(x[0], x[1] * b / X.div(r, x[0]), stack.concat(id)));
    if (!(rid in steps)) { order.push(rid); outs[rid] = id; }
    steps[rid] = (steps[rid] || 0) + b;
  };
  Object.entries(base).forEach(([id, n]) => visit(id, n, []));
  return { raw, steps, outs, order };
}
const shopCtl = rid => { const n = shopGet()[rid] || 0; return n
  ? `<span class="shopctl"><span>On the list</span>${qtyCtl(rid, n)}</span>`
  : `<button type="button" class="shopbtn" data-shop="${rid}" data-d="1">+ Shopping list</button>`; };
const shopBtn = rid => `<span class="shopwrap" data-rid="${rid}">${shopCtl(rid)}</span>`;
const econText = rid => { if (realProfit(rid).sellable) return realText(rid); const e = X.RC[rid]; return `Ingredients ≈ ${fmt(e.cost)} OC · worth ≈ ${fmt(e.worth)} OC · <b class="${e.profit >= 0 ? 'good' : 'bad'}">${e.profit >= 0 ? '+' : '−'}${fmt(Math.abs(e.profit))} OC</b>`; };
const fxLine = id => { const st = DB.items[id] && DB.items[id][9]; if (!st) return ''; const t = STATS.filter(([k]) => st[k]).slice(0, 4).map(([k, l]) => `${l} ${sgn(st[k])}`); return t.length ? `<br><small class="muted">${t.join(' · ')}</small>` : ''; };

// Recipe filter by skill level: up to level N, or the levels you set on the Your skills page
const lvOk = r => { if (!V.lv) return true; const need = r[4] || 0; return V.lv === 'me' ? need <= lvlOf(r[3]) : need <= +V.lv; };
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
      cost: (x, y) => (X.craftCost[x] ?? BIG) - (X.craftCost[y] ?? BIG), profit: (x, y) => (craftProfitOf(y) ?? -BIG) - (craftProfitOf(x) ?? -BIG) }[V.sort];
    a.sort(cmp ? (x, y) => cmp(x, y) || name(x, y) : name);
    return a.map(id => {
      const parts = [];
      if (ek) parts.push(sgn(stat(id, ek)) + ' ' + STAT[ek][1].toLowerCase());
      if (V.sort === 'ep' && ek) parts.push(per(id) < 0 ? '–' : +per(id).toFixed(2) + '/OC');
      if (V.sort === 'cost') parts.push('costs ' + fmt(X.craftCost[id]) + ' OC');
      if (V.sort === 'profit') { const cp = craftProfitOf(id); parts.push((cp >= 0 ? '+' : '−') + fmt(Math.abs(cp)) + ' OC'); }
      if (!parts.length) parts.push((X.inTables[id] ? '◆ ' : '') + (X.makes[id] ? '⚒ ' : '') + I[id][1] + ' OC');
      return [id, I[id][0], parts.join(' · '), iIco(id)];
    });
  };
  switch (V.sec) {
    case 'items': return itemRows(Object.keys(I).map(Number));
    case 'tenement': return itemRows(X.tenIds);
    case 'upgrades': return TU.cats.map((c, i) => [i, c[1], c[0] + ' · ' + (c[3].length - 1) + ' tiers', '']).filter(r => m(r[1]) || m(r[2]));
    case 'recipes': return DB.recipes.filter(r => (m(r[1]) || r[8].some(x => m(iname(x[0])))) && (!V.f || r[2] === V.f) && (!V.sk || r[3] === V.sk) && lvOk(r) && (V.sort !== 'rprofit' && V.sort !== 'rhour' || realProfit(r[0]).sellable))
      .sort(V.sort === 'rprofit' ? (a, b) => realProfit(b[0]).profit - realProfit(a[0]).profit || a[1].localeCompare(b[1])
        : V.sort === 'rhour' ? (a, b) => (realProfit(b[0]).hour ?? -1e12) - (realProfit(a[0]).hour ?? -1e12) || a[1].localeCompare(b[1])
        : V.sort === 'profit' ? (a, b) => recipeProfit(b[0]) - recipeProfit(a[0]) || a[1].localeCompare(b[1])
        : V.sort === 'lvhi' ? (a, b) => (b[4] || 0) - (a[4] || 0) || a[1].localeCompare(b[1])
        : V.sort === 'lvlo' ? (a, b) => (a[4] || 0) - (b[4] || 0) || a[1].localeCompare(b[1])
      : V.sort === 'faillo' ? (a, b) => Math.min(1, a[5] || 0) - Math.min(1, b[5] || 0) || a[1].localeCompare(b[1])
      : V.sort === 'failhi' ? (a, b) => Math.min(1, b[5] || 0) - Math.min(1, a[5] || 0) || a[1].localeCompare(b[1])
      : V.sort === 'skill' ? (a, b) => ((a[3] && a[3] !== 'None') ? 0 : 1) - ((b[3] && b[3] !== 'None') ? 0 : 1) || String(a[3]).localeCompare(String(b[3])) || (b[4] || 0) - (a[4] || 0) || a[1].localeCompare(b[1])
      : V.sort === 'station' ? (a, b) => String(a[2]).localeCompare(String(b[2])) || a[1].localeCompare(b[1])
        : V.sort === 'cost' ? (a, b) => X.RC[a[0]].cost - X.RC[b[0]].cost || a[1].localeCompare(b[1]) : (a, b) => a[1].localeCompare(b[1]))
      .map(r => [r[0], r[1], V.sort === 'rprofit' ? profitTxt(realProfit(r[0]).profit) : V.sort === 'rhour' ? (realProfit(r[0]).hour == null ? '–' : profitTxt(realProfit(r[0]).hour) + '/h') : V.sort === 'profit' ? (recipeProfit(r[0]) >= 0 ? '+' : '−') + fmt(Math.abs(recipeProfit(r[0]))) + ' OC' : V.sort === 'cost' ? fmt(X.RC[r[0]].cost) + ' OC' : (V.sort === 'lvhi' || V.sort === 'lvlo' || V.sort === 'skill') ? (r[3] && r[3] !== 'None' ? r[3] + ' ' : '') + 'lv ' + (r[4] || 0) : (V.sort === 'faillo' || V.sort === 'failhi') ? Math.round(Math.min(1, r[5] || 0) * 100) + '% fail' : r[2], rIco(r[0])]);
    case 'vendors': return DB.vendors.filter(v => m(v.n) || m(v.o || '') || m(sceneName(v.sc)) || (q.length > 2 && (v.t && m(v.t))))
      .filter(v => !V.f || (V.f === 'items' ? (v.t || v.i) : V.f === 'buys' ? v.b : V.f === 'furniture' ? (v.fs || v.fb) : V.f === 'vending' ? /vending|soda fountain/i.test(v.n) : true))
      .sort((a, b) => a.n.localeCompare(b.n) || sceneName(a.sc).localeCompare(sceneName(b.sc)))
      .map(v => [v.key, v.n, sceneName(v.sc), vIco(v)]);
    case 'tenants': return RT.r.filter(r => (m(r.n) || r.w.some(m) || r.at.some(m)) && (!V.f || (V.f === 'OC' ? r.oc : V.f === 'RM' ? r.rm : r.sz.includes(V.f))))
      .sort((a, b) => a.n.localeCompare(b.n)).map(r => [r.n, r.n, rentLine(r), pIco(r.n)]);
    case 'furniture': return Object.entries(DB.furniture).filter(([id, f]) => (m(f[0]) || (f[9] || []).some(m)) && (!V.f || f[1] === V.f))
      .sort(V.sort === 'value' ? (a, b) => (b[1][2] + b[1][3] * 10) - (a[1][2] + a[1][3] * 10) : (a, b) => a[1][0].localeCompare(b[1][0]))
      .map(([id, f]) => [id, f[0], (f[4] && f[4].length ? '⚒ ' : '') + price(f), fIco(id)]);
  }
  return [];
}
function filters() {
  const recSkillSel = () => { const sks = [...new Set(DB.recipes.map(r => r[3]).filter(s => s && s !== 'None'))].sort(); return `<select id="dbSk" aria-label="Filter by skill"><option value="">All skills</option>${sks.map(s => `<option ${V.sk === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><select id="dbLv" aria-label="Filter by the skill level a recipe needs"><option value="">Any level needed</option>${[...Array(11).keys()].map(n => `<option value="${n}" ${V.lv === String(n) ? 'selected' : ''}>${n ? 'Up to level ' + n : 'No level needed'}</option>`).join('')}<option value="me" ${V.lv === 'me' ? 'selected' : ''}>At my skill levels</option></select>`; };
const opt = (list, all) => `<select id="dbF" aria-label="Filter: ${esc(all)}"><option value="">${all}</option>${list.map(c => `<option ${V.f === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  const so = (k, t) => `<option value="${k}" ${V.sort === k ? 'selected' : ''}>${t}</option>`;
  const contSel = () => { const l = contList(); if (!l.length) return ''; const c = saleCont(), nm = c => `${iname(c[0])} (${c[1]} L, ×${c[2]})`;
  return ` <select id="dbCont" aria-label="Sell liquids in" title="Liquids sell for more or less depending on the container. A shop pays for the whole filled container."><option value="best"${contPick === 'best' ? ' selected' : ''}>Liquids in: best container</option>${l.map(x => `<option value="${x[0]}"${contPick === String(x[0]) ? ' selected' : ''}>Liquids in: ${esc(nm(x))}</option>`).join('')}<option value="none"${contPick === 'none' ? ' selected' : ''}>Liquids in: plain liters</option></select>`; };
const sort = `<select id="dbSort" aria-label="Sort"><option value="name">A–Z</option>${so('value', 'Price ↓')}${V.sec === 'items' && V.e ? so('eh', 'Strongest effect first') + so('el', 'Weakest effect first') : ''}</select>`;
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
  if (V.sec === 'upgrades') return '';
  if (V.sec === 'tenement') return opt(X.itemCats, 'All categories') + sort;
  if (V.sec === 'recipes') return opt(X.rTypes, 'All stations') + recSkillSel() + `<select id="dbSort" aria-label="Sort"><option value="name">A–Z</option>${so('rprofit', 'Best profit at shops')}${so('rhour', 'Best profit per hour')}${so('profit', 'Best craft profit (base values)')}${so('cost', 'Cheapest ingredients')}${so('lvhi', 'Highest skill level needed')}${so('lvlo', 'Lowest skill level needed')}${so('skill', 'Skill (then highest level)')}${so('station', 'Station')}${so('faillo', 'Lowest fail chance')}${so('failhi', 'Highest fail chance')}</select>` + contSel();
  if (V.sec === 'tenants') return `<select id="dbF" aria-label="Filter tenants"><option value="">All tenants</option>${[['Small', 'Accept a small apartment'], ['Medium', 'Accept a medium apartment'], ['Large', 'Accept a large apartment'], ['OC', 'Pay OC'], ['RM', 'Pay RM']].map(([k, t]) => `<option value="${k}" ${V.f === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  if (V.sec === 'furniture') return opt(X.fCats, 'All categories') + sort;
  if (V.sec === 'vendors') return `<select id="dbF" aria-label="Filter vendors"><option value="">All vendors</option>${[['items', 'Sell items'], ['buys', 'Buy from you'], ['furniture', 'Furniture'], ['vending', 'Vending machines']].map(([k, t]) => `<option value="${k}" ${V.f === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return '';
}
const BARE = new Set(['notes', 'list', 'skills', 'best', 'now', 'level', 'tcalc', 'loot', 'power', 'diff']);
const INTRO = {
  now: 'Paste your inventory from the mod and see which recipes you can make right now, and which are one ingredient away.',
  level: 'The fastest and cheapest recipes to raise each crafting skill.',
  tcalc: 'Pick the tenement upgrades you want and see the money, materials and build time they cost.',
  loot: 'Which places hold the most loot, and what a place holds.',
  power: 'Add the machines you plan to run and see their electricity draw and how many generators you need.',
  diff: 'What changed in the last game update: items, recipes, furniture and shops.',
  best: 'What to craft for money with the skills you have: the best recipes by profit and by profit per hour at real shop prices, and which skill levels would unlock better ones.',
  skills: 'Your level in each crafting skill, so recipes can show the quality (and the price) of what you would make.',
  items: 'Every item in the game. ◆ can be found in containers or shops · ⚒ can be crafted. Use “Any effect” to find food, drink and medicine by what they do to depression, nutrition, thirst and more.',
  recipes: 'Every recipe with its ingredients, station, skill and time.',
  vendors: 'Shops, traders, stalls and vending machines placed in the world: what they sell and what they buy from you.',
  tenement: 'Building materials and wall coverings for fixing up your tenement, and the recipes that make them.',
  upgrades: 'Everything you can build in the tenement: one ladder of tiers per category, with money, materials, build time, requirements and the contractors who can build it.',
  tenants: 'The tenants the game can offer for your apartments: who moves in with them, which apartment sizes they accept, their base rent per rent period and what they demand before moving in.',
  furniture: 'Every piece of furniture, its price, the shops that sell and buy it, and what it lets you craft.',
  list: 'Recipes you plan to make, with everything you need and where to find it.',
  notes: 'Things in the game data that look wrong or inconsistent. Some may be intentional.',
};
function renderSide() {
  const el = $('#dbSide');
  const head = `<div class="dbnav">${SECTIONS.map(([k, t]) => `<a href="#/db/${k}" class="${V.sec === k ? 'on' : ''}">${secIcon(k)}${t}${k === 'notes' ? ` <b>${DB.notes.length}</b>` : k === 'list' ? ` <b id="shopN">${shopCount()}</b>` : ''}</a>`).join('')}</div>`;
  if (BARE.has(V.sec)) { el.innerHTML = head + `<p class="dbintro">${INTRO[V.sec]}</p>`; return; }
  el.innerHTML = head + `<p class="dbintro">${INTRO[V.sec]}</p><div class="dbbar multi"><input id="dbQ" type="search" placeholder="Search ${esc(SECTIONS.find(s => s[0] === V.sec)[1].toLowerCase())}…" value="${esc(V.q)}" autocomplete="off">${filters()}</div><div id="dbList"></div>`;
  const q = $('#dbQ'); q.oninput = () => { V.q = q.value; V.lim = 300; renderList(); };
  const f = $('#dbF'); if (f) f.onchange = () => { V.f = f.value; V.lim = 300; renderList(); };
  const s = $('#dbSort'); if (s) s.onchange = () => { V.sort = s.value; renderList(); };
  const sk = $('#dbSk'); if (sk) sk.onchange = () => { V.sk = sk.value; V.lim = 300; renderList(); };
  const lv = $('#dbLv'); if (lv) lv.onchange = () => { V.lv = lv.value; V.lim = 300; renderList(); };
  const sc = $('#dbCont'); if (sc) sc.onchange = () => { contPick = sc.value; try { localStorage.setItem('obs-cont', contPick); } catch (e) {} clearRP(); renderList(); renderDetail(); };
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
  let h = `<div class="card"><div class="dbhead">${iIco(id, 1)}<div><h2>${esc(t)}</h2><div class="sub">ID ${id} · ${val} OC · stacks to ${stack}${X.craftCost[id] != null ? ' · costs ≈ ' + fmt(X.craftCost[id]) + ' OC to make' : ''}${sellersOf(+id)[0] ? ' · buy from ' + pxt(sellersOf(+id)[0].v, sellersOf(+id)[0].p, true) : ''}${buyersOf(+id)[0] ? ' · sell up to ' + pxt(buyersOf(+id)[0].v, buyersOf(+id)[0].p) : ''}</div></div></div>`;
  if (desc) h += `<p>${esc(desc)}</p>`;
  h += `<div class="tags">${cats.map(c => `<a class="tag" href="#/db/items" data-cat="${esc(c)}">${esc(c)}</a>`).join('')}${eff.map(e => `<span class="tag teal">${e[0]} ${e[1]}</span>`).join('')}${wall ? `<span class="tag">${esc(wall)}</span>` : ''}</div>`;
  h += waysBox(id);
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
    const per = {}; for (const [n] of placed) for (const [slug, k] of X.tableScenes[n]) per[slug] = (per[slug] || 0) + k;
    const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 8);
    h += `<p class="muted">Best places to look:</p><div class="tags">${top.map(([slug, k]) => mapBtn(slug, t, sceneName(slug) + ' · ' + k)).join('')}</div>`;
    h += ul(Object.entries(kinds).map(([n, k]) => `<span>${esc(n.trim())} <em class="${k.has('c') ? '' : 'rare'}">${k.size > 1 ? 'common &amp; rare' : k.has('r') ? 'rare' : 'common'}</em></span><small>${X.tableCount[n]} placed</small>`))
       + mapBtn(best, t, 'Show where on the map');
  } else h += '<p class="muted">Not in any placed container.</p>';
  if (unplaced.length) h += `<p class="muted">Also listed in ${[...new Set(unplaced.map(([n]) => n.trim()))].map(esc).join(', ')}, which ${unplaced.length > 1 ? 'are' : 'is'} not placed in any scene on the map (spawned at runtime, or unused).</p>`;
  const sv = sellersOf(+id), bv = buyersOf(+id);
  h += `<h3>Where to buy · ${sv.length}</h3>${sv.length ? `<p class="muted">Cheapest first. The shop's price is the base value × its multiplier.</p>` : ''}${ul(sv.map((x, i) => vl(x.v) + ` <small class="${i ? 'muted' : 'good'}">· ${pxt(x.v, x.p, true)}</small>`))}${sv.length ? mapBtn(sv[0].v.sc, t, 'Show the cheapest shop', sv[0].v.n) : ''}`;
  // An item group (Metal Recycle counts nails and tin cans): where each member is sold. Shops that sell packages (a Trash Bale) fill them at random from a loot table when you buy one.
  const members = DB.items[id][6] || [], baleIds = members.length ? members : [+id];
  if (members.length) h += `<h3>Where to buy the items in this group</h3><p class="muted">Any one of them counts.</p>${ul(members.map(m => { const s0 = sellersOf(m)[0]; return `<span>${il(m)}</span><small>${s0 ? `${pxt(s0.v, s0.p, true)} at ${esc(s0.v.n)} - ${esc(sceneName(s0.v.sc))}` : 'no shop sells it'}</small>`; }))}`;
  const bales = DB.vendors.filter(v => v.pk && baleIds.some(i => v.pk.some(tb => X.tableItems[tb] && X.tableItems[tb].has(i))));
  if (bales.length) h += `<h3>Inside packages bought from a shop - ${bales.length}</h3><p class="muted">These shops sell packages (like a Trash Bale) that are filled at random when you buy one. ${members.length ? 'Some of the items in this group' : 'This item'} can be inside.</p>${ul(bales.map(v => vl(v)))}${mapBtn(bales[0].sc, t, 'Show the shop', bales[0].n)}`;
  if (hasQuality(+id) && bv.length) { const sf = saleF(+id); h += `<h3>Price by quality</h3><div class="facts">${[0.25, 0.5, 0.75, 1, 1.5, 2].map(t => `<span>Quality ${t}</span><span>${fmt(Math.max(1, Math.round(bv[0].p * qualityValue(t) * sf)))} OC <small class="muted">at ${esc(bv[0].v.n)}</small></span>`).join('')}</div><p class="muted">What the best shop pays for one, by quality. Quality comes from your skill and workstation when you craft it.</p>`; }
    h += `<h3>Where to sell · ${bv.length}</h3>${bv.length ? `<p class="muted">Best price first.</p>` : ''}${ul(bv.map((x, i) => vl(x.v) + ` <small class="${i ? 'muted' : 'good'}">· ${pxt(x.v, x.p)}</small>` + (x.v.bs ? ' <small class="muted">· buys stolen</small>' : '')))}${bv.length ? mapBtn(bv[0].v.sc, t, 'Show the best buyer', bv[0].v.n) : ''}`;
  const via = new Set(); (X.groupsOf[id] || []).forEach(g => (X.uses[g] || []).forEach(r => via.add(r)));
  if (X.fails[id]) h += `<h3>Comes out of a failed</h3>${ul(recipesOf(X.fails[id]))}`;
  h += `<h3>Used in · ${(X.uses[id] || []).size || 0}</h3>${ul(recipesOf(X.uses[id]))}`;
  if (via.size) h += `<h3>Used in, as part of a group · ${via.size}</h3>${ul(recipesOf(via))}`;
  return h + '</div>';
}
// "Every way to get this": one line per source, so you do not have to read the whole page to compare buying, crafting and looting.
function waysBox(id) {
  const it = DB.items[id], rows = [];
  const sv = sellersOf(+id), mk = [...(X.makes[id] || [])];
  if (sv.length) rows.push(['Buy', `${pxt(sv[0].v, sv[0].p, true)} at ${esc(sv[0].v.n)} - ${esc(sceneName(sv[0].v.sc))}${sv.length > 1 ? ` <small class="muted">and ${sv.length - 1} more shop${sv.length > 2 ? 's' : ''}</small>` : ''}`]);
  if (mk.length) rows.push(['Craft', `${mk.length} recipe${mk.length > 1 ? 's' : ''}${X.craftCost[id] != null ? ', about ' + fmt(X.craftCost[id]) + ' OC of ingredients' : ''} <small class="muted">${mk.slice(0, 3).map(r => esc(X.R[r][1])).join(', ')}${mk.length > 3 ? '...' : ''}</small>`]);
  const tabs = [...(X.inTables[id] || [])].map(x => x.split('\u0000')).filter(([n]) => X.tableCount[n]);
  if (tabs.length) {
    const per = {}; for (const [n] of tabs) for (const [slug, k] of X.tableScenes[n]) per[slug] = (per[slug] || 0) + k;
    const top = Object.entries(per).sort((a, b) => b[1] - a[1])[0], total = tabs.reduce((a, [n]) => a + X.tableCount[n], 0);
    rows.push(['Loot', `${total} container${total > 1 ? 's' : ''}, most in ${esc(sceneName(top[0]))} <small class="muted">(${top[1]})</small>`]);
  }
  const members = it[6] || [], baleIds = members.length ? members : [+id];
  const bales = DB.vendors.filter(v => v.pk && baleIds.some(i => v.pk.some(tb => X.tableItems[tb] && X.tableItems[tb].has(i))));
  if (bales.length) rows.push(['In a package', `bought from ${esc(bales[0].n)}${bales.length > 1 ? ' and ' + (bales.length - 1) + ' more' : ''}, filled at random`]);
  if (X.fails[id]) rows.push(['Failed craft', `${X.fails[id].size} recipe${X.fails[id].size > 1 ? 's' : ''} can leave it behind when they fail`]);
  if (X.groupsOf[id]) rows.push(['As a group item', `counts as ${X.groupsOf[id].map(g => esc(DB.items[g] ? DB.items[g][0] : g)).join(', ')}, so recipes that ask for the group accept it`]);
  if (!rows.length) return '<div class="ways"><h3>Every way to get this</h3><p class="muted">Nothing in the game data produces it: no shop, recipe or placed container.</p></div>';
  return `<div class="ways"><h3>Every way to get this</h3><div class="facts">${rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div></div>`;
}
// A recipe as a short block: name and station, what goes in, what it takes.
function craftBlock(rid, forItem) {
  const r = X.R[rid], [, n, type, skill, minS, fail, time, inp, out] = r;
  const mk = out.find(x => x[0] === +forItem), more = mk && mk[1] > 1 ? ` <small class="muted">makes ${num(mk[1])}</small>` : '';
  return `<div class="craft"><div class="ch">${rl(rid)}${more}</div><div class="fl">${inp.map(chipOf).join('')}</div>
    <div class="cm muted">${esc(skill)}${minS ? ' ' + minS + '+' : ''} · ${hrs(time)} · ${Math.round(fail * 100)}% fail</div>
    <div class="cm">${econText(rid)}</div>${shopBtn(rid)}</div>`;
}
const chipOf = (x, k) => `<span class="chip2 ${k || ''}"><b>${num(x[1])}×</b> ${il(x[0])}</span>`;
// The scene with the most containers that can drop any of these items.
function bestSceneFor(ids) {
  const per = {};
  for (const id of ids) for (const k of (X.inTables[id] || [])) { const n = k.split('\u0000')[0]; for (const [slug, c] of (X.tableScenes[n] || [])) per[slug] = (per[slug] || 0) + c; }
  const best = Object.entries(per).sort((a, b) => b[1] - a[1])[0]; return best ? best[0] : null;
}
function recipeCard(id) {
  const r = X.R[id]; if (!r) return missing();
  const [, n, type, skill, minS, fail, time, inp, out, fout, cond, tags, req] = r;
  const io = a => ul(a.map(x => `<span>${il(x[0])}</span><small>× ${num(x[1])}</small>`));
  const ioOut = a => ul(a.map(x => `<span>${il(x[0])}${fxLine(x[0])}</span><small>× ${num(x[1])}</small>`));
  const st = DB.stations[type] || [], furn = (X.furnTypes[type] || []).map(Number);
  let h = `<div class="card"><div class="dbhead">${rIco(id, 1)}<div><h2>${esc(n)}</h2><div class="sub">Recipe #${id} · ${esc(type)}</div></div></div>${shopBtn(id)}
    <div class="flow"><div class="fl">${inp.map(chipOf).join('')}</div><span class="arrow" aria-hidden="true">→</span><div class="fl res">${out.map(x => chipOf(x, 'ok')).join('')}</div></div>
    ${fout.length ? `<div class="flow"><span class="failtag">On fail ${Math.round(fail * 100)}%</span><div class="fl">${fout.map(x => chipOf(x, 'bad')).join('')}</div></div>` : ''}
    ${out.some(x => fxLine(x[0])) ? `<ul class="items">${out.filter(x => fxLine(x[0])).map(x => `<li><span>${iname(x[0])}${fxLine(x[0])}</span></li>`).join('')}</ul>` : ''}
    <h3>Details</h3><div class="facts"><span>Skill</span><span>${esc(skill)}${minS ? ' · min ' + minS : ''}</span><span>Fail chance</span><span>${Math.round(fail * 100)}% base, ${Math.round(failNow(r) * 100)}% for you${stationFor(r) ? ' at the ' + esc(stationFor(r).n) : ''}</span>
    <span>Time</span><span>${hrs(time)}</span><span>Recipe needed</span><span>${req ? 'yes, learn it first' : 'no'}</span><span>Value</span><span>${econText(id)}</span>
    ${cond.length ? `<span>Station must be</span><span>${cond.map(esc).join(', ')}</span>` : ''}${tags.length ? `<span>Learned from</span><span>${tags.map(esc).join(', ')}</span>` : ''}</div>`;
  h += tradeBlock(id);
  if (inp.length) { const sl = bestSceneFor(inp.map(x => x[0]));
    h += `<h3>Where to find the ingredients</h3>${sl ? mapBtn(sl, inp.map(x => iname(x[0])).join(' | '), 'Find the ingredients on the map') : '<p class="muted">None of them is in a placed container.</p>'}<p class="muted">Lights up every container, shop and workstation that has any of ${inp.length > 1 ? 'these ' + inp.length + ' ingredients' : 'this ingredient'}, starting in the place with the most.</p>`; }
  h += `<h3>Where to make it</h3>` + stationRows(id);
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
  if (hoursTxt(v)) h += `<p>Opening hours: ${esc(hoursTxt(v))}</p>`;
  if (v.fs) h += `<h3>Furniture for sale · ${v.fs.length}</h3>${ul(v.fs.slice().sort((a, b) => DB.furniture[a][0].localeCompare(DB.furniture[b][0])).map(id => `<span>${fl(id)}</span><small>${price(DB.furniture[id])}</small>`))}`;
  if (v.fb) h += `<h3>Buys furniture</h3><p>${v.fb === 'any' ? 'Any furniture.' : v.fb === 'same' ? 'The pieces it sells.' : v.fb.map(fl).join(', ')}</p>`;
  return h + '</div>';
}
const RT = window.OBS_RENTERS || { cats: [], r: [] };
const money = (v, c) => v ? `${fmt(v)} ${c}` : '–';
const rentLine = r => r.oc || r.rm ? [r.oc ? fmt(r.oc) + ' OC' : '', r.rm ? fmt(r.rm) + ' RM' : ''].filter(Boolean).join(' + ') : 'no rent';
const needName = ([c, t]) => { const k = RT.cats[c]; return k ? `${k[0]}: ${k[1][t] || t}` : ''; };
function tenantCard(name) {
  const r = RT.r.find(x => x.n === name); if (!r) return missing();
  const p = DB.people[name] || [], who = [p[1], p[2] != null && p[2] >= 0 && p[2] < 200 ? p[2] + ' years' : null, p[3], p[4]].filter(Boolean).map(esc).join(' · ');
  const building = r.needs.filter(n => n[0] < 14), flat = r.needs.filter(n => n[0] >= 14);
  const where = r.at.length ? r.at.map(esc).join(', ') : r.start ? 'Starts in apartment ' + r.start : r.relay ? 'Moved into apartment ' + r.relay + ' by a scene relay' : '';
  let h = `<div class="card"><div class="dbhead">${pIco(name, 1)}<div><h2>${esc(name)}</h2><div class="sub">${who || 'Tenant'}</div></div></div>
    <h3>Base rent per rent period</h3><div class="facts"><span>Obenseuer Coins</span><span><b>${money(r.oc, 'OC')}</b>${r.oc ? '' : ' <small class="muted">never pays OC</small>'}</span><span>Real Money</span><span><b>${money(r.rm, 'RM')}</b>${r.rm ? '' : ' <small class="muted">never pays RM</small>'}</span></div>
    <p class="muted">${r.oc || r.rm ? 'The apartment’s value adds to this base rent.' : 'Pays no rent.'}</p>
    <h3>Moves in</h3><div class="facts"><span>Apartment sizes</span><span>${r.sz.join(', ')}</span><span>Household</span><span>${r.w.length ? 'with ' + r.w.map(esc).join(', ') + ' (' + (r.w.length + 1) + ' people)' : 'lives alone'}</span>${where ? `<span>Found at</span><span>${where}</span>` : ''}</div>`;
  if (flat.length) h += `<h3>Demands in the apartment</h3>${ul(flat.map(n => `<span>${esc(needName(n))}</span>`))}`;
  if (building.length) h += `<h3>Demands of the building</h3>${ul(building.map(n => `<span>${esc(needName(n))}</span>`))}`;
  if (!r.needs.length) h += `<p class="muted">Makes no demands.</p>`;
  h += `<p class="muted">Rented through their own conversation once you hold the “Tenement blueprint” task item. Data checked against the <a href="https://obenseuer-viewer.pages.dev/#/renters" target="_blank" rel="noopener">Obenseuer viewer</a>.</p>${(window.OBS_PEOPLE || {})[name] ? mapBtn(window.OBS_PEOPLE[name][0], '', 'Find ' + name + ' on the map', name) : ''}${mapBtn('interior-player-tenement', '', 'Open your tenement on the map')}`;
  return h + '</div>';
}
const KINDS = ['Electricity', 'Combustion', 'Kinetic'];
function powerBlock(list) {
  const w = n => n >= 1000 ? +(n / 1000).toFixed(2) + ' kW' : n + ' W';
  const rows = list.flatMap((e, i) => {
    const [kind, use, idle, fuel, fuels, liquid, gen, grid, up, q] = e; let t = list.length > 1 ? ` <small class="muted">(part ${i + 1})</small>` : '';
    const r = [['Power type', KINDS[kind] || '?']];
    if (gen > 0) r.push(['Makes', w(gen)]); else if (gen < 0) r.push(['Needs', w(-gen) + ' of supply']);
    if (use > 0 && gen <= 0) r.push([kind === 0 ? 'Electricity use' : 'Power use', w(use) + (idle >= 0 ? ` · ${w(idle)} idle` : '')]);
    if (fuel || fuels.length) r.push(['Fuel', (fuel ? 'burns ' : 'accepts ') + (fuels.join(', ') || 'fuel') + (liquid ? ' (liquid)' : '')]);
    if (kind === 0 && !grid) r.push(['Grid', 'not connected to the building grid']);
    r.push(['Equipment quality', String(q)]); if (up) r.push(['Upgrade slots', String(up)]);
    return r.map(([a, b]) => { const o = [a + t, b]; t = ''; return o; });
  });
  return `<h3>Stats</h3><div class="facts">${rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div><p class="muted">Read from the game's files. Equipment quality multiplies the quality of what you craft and lowers the fail chance.</p>`;
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
  if (f[6]) h += `<p>${esc(f[6])}</p>`;
  if (f[7] && f[7].length) h += `<h3>Dismantling it gives</h3>${ul(f[7].map(x => `<span>${il(x[0])} <small class="muted">x ${x[1]}</small></span>`))}`;
  if (f[9] && f[9].length) h += `<p>Shown in game as: ${f[9].map(x => '"' + esc(x) + '"').join(', ')}</p>`;
  if (f[8] && f[8].length) h += `<p>Modifiers: ${f[8].map(esc).join(', ')} <small class="muted">(what its crafting station offers; recipes that say the station must be one of these need it)</small></p>`;
  if (f[5] && f[5].length) h += powerBlock(f[5]);
  h += `<h3>Sold by · ${sv.length}</h3>${sv.length ? ul(sv.map(vl)) : '<p class="muted">No shop sells this piece in the game data. You get it some other way (a reward, found in the world or crafted); the data does not say how.</p>'}<h3>Bought by · ${bv.length}</h3>${ul(bv.map(vl))}`;
  return h + '</div>';
}

// ---------- tenement upgrades (data/tenup.js, from the viewer's tenement.json) ----------
const TU = window.OBS_TUP || window.OBS_TENUP || { cats: [], up: [], con: [], max: [] };
const bhrs = h => !h ? '–' : h % 24 === 0 && h >= 48 ? (h / 24) + ' days' : h + ' h';
const reqName = r => r.replace(/-(\d)-/, ' · ').replace(/-/g, ' ');
const upBy = ci => TU.up.filter(u => u[0] === ci).sort((a, b) => a[1] - b[1]);
const coinBox = (v, c) => `<span class="coin"><i>${c}</i>${num(v)}</span>`;
function upgradesHome() {
  const mats = new Set(); let oc = 0, rm = 0, free = 0;
  TU.up.forEach(u => { oc += u[4]; rm += u[5]; u[6].forEach(x => mats.add(x[0])); if (!u[8].length && u[1] > 0) free++; });
  const sum = [['Categories', TU.cats.length], ['Upgrades', TU.up.filter(u => u[1] > 0).length + (free ? ` <small class="muted">(${free} that no contractor builds)</small>` : '')], ['Contractors', TU.con.length], ['Distinct materials', mats.size], ['Everything buildable', coinBox(oc, 'OC') + ' ' + coinBox(rm, 'RM')]];
  let groups = [...new Set(TU.cats.map(c => c[0]))], body = '';
  groups.forEach(g => {
    body += `<tr class="grp"><th colspan="${TU.con.length + 1}">${esc(g)}</th></tr>`;
    TU.cats.forEach((c, i) => { if (c[0] !== g) return;
      body += `<tr data-go="${i}"><td>${link('upgrades', i, c[1])}</td>${TU.con.map((_, k) => { const m = TU.max[k][i]; return m ? `<td>${esc(c[3][m])} <small class="muted">${m}</small></td>` : '<td class="muted">–</td>'; }).join('')}</tr>`; });
  });
  return `<div class="card wide"><h2>Tenement upgrades</h2><p class="muted">${esc(INTRO.upgrades)} Pick a category from the list.</p>
    <h3>Summary</h3><dl class="kv">${sum.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <h3>Contractors</h3><p class="muted">Highest tier each contractor builds, per category. A dash means that contractor cannot build any tier of it.</p>
    <div class="tblwrap"><table class="tbl up"><thead><tr><th>Category</th>${TU.con.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}
function upgradeCard(key) {
  const ci = +key, c = TU.cats[ci]; if (!c) return missing();
  const tiers = upBy(ci).filter(u => u[1] > 0);
  const tot = tiers.reduce((a, u) => [a[0] + u[4], a[1] + u[5]], [0, 0]);
  const mat = {}; tiers.forEach(u => u[6].forEach(x => { mat[x[0]] = (mat[x[0]] || 0) + x[1]; }));
  return `<div class="card"><div class="dbhead"><div><h2>${esc(c[1])}</h2><div class="sub">${esc(c[0])} · ${tiers.length} tiers${c[2] ? ' · raises rent' : ''}</div></div></div>
    <p>All tiers together: ${coinBox(tot[0], 'OC')} ${coinBox(tot[1], 'RM')}</p>
    ${tiers.map(u => `<div class="tier"><div class="tierhead"><b>${esc(u[2])}</b> <small class="muted">tier ${u[1]}</small><span class="grow"></span>${u[4] ? coinBox(u[4], 'OC') : ''} ${u[5] ? coinBox(u[5], 'RM') : ''}</div>
      <div class="tiermeta">Build time ${bhrs(u[3])}${u[7].length ? ' · needs ' + u[7].map(r => esc(reqName(r))).join(', ') : ''}</div>
      ${u[6].length ? `<div class="flow">${u[6].map(x => chipOf(x)).join('')}</div>` : ''}
      <div class="tiermeta">${u[8].length ? 'Built by ' + u[8].map(k => esc(TU.con[k])).join(', ') : '<span class="failtag">No contractor builds this</span>'}</div></div>`).join('')}
    <h3>Materials for every tier</h3><div class="flow">${Object.entries(mat).sort((a, b) => iname(a[0]).localeCompare(iname(b[0]))).map(x => chipOf(x)).join('')}</div></div>`;
}
// ---------- vendors summary ----------
function vendorsHome() {
  const V0 = DB.vendors, sc = new Set(V0.map(v => v.sc)), sold = new Set();
  V0.forEach(v => { (v.i || []).forEach(i => sold.add(i)); if (v.t && DB.loot[v.t]) { DB.loot[v.t][1].concat(DB.loot[v.t][2]).forEach(i => sold.add(i)); } });
  const n = f => V0.filter(f).length, tables = Object.keys(DB.loot).length;
  const sum = [['Vendors', V0.length], ['Sell from a stock list', n(v => v.t)], ['Sell a fixed list', n(v => v.i)], ['Buy from you', n(v => v.b)], ['Buy stolen goods', n(v => v.bs)], ['Sell furniture', n(v => v.fs)], ['Places with a vendor', sc.size], ['Stock lists and loot tables', tables], ['Distinct items on sale', sold.size]];
  return `<div class="card"><h2>Vendors</h2><p class="muted">${esc(INTRO.vendors)} A vendor either rolls its wares from a stock list on every restock or sells a fixed list. Pick one on the left.</p>
    <h3>Summary</h3><dl class="kv">${sum.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`;
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
  const sv = DB.vendors.filter(v => sells(v, +id));
  if (sv.length) { parts.push('sold by ' + sv.slice(0, 3).map(v => `<span class="lk">${link('vendors', v.key, v.n)}</span> <small>(${esc(sceneName(v.sc))})</small>`).join(', ') + (sv.length > 3 ? ' and ' + (sv.length - 3) + ' more' : ''));
    btn += mapBtn(sv[0].sc, iname(id), 'Find the shop', sv[0].n); }
  if (X.makes[id]) parts.push('craftable');
  if (!parts.length) parts.push('no recipe makes it, and nothing drops or sells it in this version of the game');
  return { parts, btn };
}
let modCode = '';
function listCard() {
  const L = shopGet(), o = shopOpt(), up = n => Math.ceil(n - 1e-9);
  const rids = Object.keys(L).filter(id => X.R[id]).sort((a, b) => X.R[a][1].localeCompare(X.R[b][1]));
  if (!rids.length) return `<div class="card"><h2>Shopping list</h2>${listBar()}<p class="muted">Nothing here yet. Open a recipe, or the “How to craft” box on an item, and press “+ Shopping list”. The list adds up every ingredient, including what it takes to craft the ingredients, and tells you where to find it. It is saved in this browser only.</p></div>`;
  const need = {}, make = {}; let cost = 0, worth = 0;
  for (const rid of rids) { const n = L[rid], r = X.R[rid]; r[7].forEach(x => { need[x[0]] = (need[x[0]] || 0) + x[1] * n / X.div(r, x[0]); }); r[8].forEach(x => { make[x[0]] = (make[x[0]] || 0) + x[1] * n; }); cost += X.RC[rid].cost * n; worth += X.RC[rid].worth * n; }
  for (const id of Object.keys(need)) { if (make[id]) need[id] = Math.max(0, need[id] - make[id]); if (!need[id]) delete need[id]; }   // a recipe on the list may already make what another needs
  const E = expandNeeds(need, o), byName = a => a.sort((x, y) => iname(x[0]).localeCompare(iname(y[0])));
  const rawCost = Object.entries(E.raw).reduce((a, [id, n]) => a + (o.pref[id] === 'find' ? 0 : X.unit(id) * up(n)), 0);
  const crafted = E.order.length;
  modCode = 'OBSLIST:' + JSON.stringify({ v: 1, recipes: rids.map(r => [X.R[r][1], L[r]]), steps: E.order.map(r => [X.R[r][1], up(E.steps[r]), E.outs[r]]), raw: Object.entries(E.raw).map(([id, n]) => [+id, up(n)]) });
  return `<div class="card"><h2>Shopping list</h2><div class="sub">${rids.length} recipe${rids.length > 1 ? 's' : ''} · ${o.mode !== 'off' || crafted ? 'raw materials' : 'ingredients'} ≈ ${fmt(o.mode !== 'off' || crafted ? rawCost : cost)} OC · worth ≈ ${fmt(worth)} OC</div>
    ${listBar()}<label class="shopopt">Ingredients <select data-shopmode aria-label="How far to break ingredients down"><option value="all" ${o.mode === 'all' ? 'selected' : ''}>Break down everything craftable</option><option value="missing" ${o.mode === 'missing' ? 'selected' : ''}>Only what can't be found or bought</option><option value="off" ${o.mode === 'off' ? 'selected' : ''}>Don't break down</option></select></label>
    <h3>Recipes</h3>${rids.map(rid => `<div class="shoprow"><span class="rn">${rl(rid)}</span>${qtyCtl(rid, L[rid])}</div>${shopStation(rid)}`).join('')}
    ${crafted ? `<h3>Craft these first · ${crafted}</h3>${ul(E.order.map(rid => { const out = E.outs[rid], per = X.R[rid][8].find(x => x[0] === out)[1], b = up(E.steps[rid]);
      return `<span>${rl(rid)} <small class="muted">× ${b} → ${num(per * b)} ${esc(iname(out))}</small></span>${recPick(out, rid)}<button type="button" class="shopbtn mini" data-pref="${out}:buy" title="Find or buy it instead of crafting it">Find or buy instead</button>`; }))}` : ''}
    <h3>${o.mode !== 'off' || crafted ? 'Get these' : 'You will need'}</h3>${ul(byName(Object.entries(E.raw)).map(([id, n]) => { const w = whereIs(id), back = bestRecipe(+id) != null && !(DB.items[id] && DB.items[id][6].length);
      return `<span class="${isDone(id) ? 'done' : ''}"><input type="checkbox" data-done="${id}" ${isDone(id) ? 'checked' : ''} aria-label="Got it"> ${il(id)} <small class="muted">× ${num(up(n))}${unit(id)}</small><br><small class="muted">${w.parts.join(' · ')}</small></span>${w.btn}${back ? `<button type="button" class="shopbtn mini" data-pref="${id}:craft">Craft it instead</button>` : ''}${o.pref[id] === 'find' ? `<button type="button" class="shopbtn mini" data-pref="${id}:buy" title="Count it as bought again">Buy it instead</button>` : `<button type="button" class="shopbtn mini" data-pref="${id}:find" title="You will find it, not buy it: it stays out of the cost and the shopping route">Find it instead</button>`}`; }))}
    <h3>You will make</h3>${ul(byName(Object.entries(make)).map(([id, n]) => `<span>${il(id)}</span><small>× ${num(n)}${unit(id)}</small>`))}
    ${tradeRun(E.raw, make, o)}
    <button type="button" class="dbmore" data-copylink>Copy share link</button> <button type="button" class="dbmore" data-print>Print</button> <button type="button" class="dbmore" data-copymod>Copy list for the mod</button> <button type="button" class="dbmore" data-shop="clear">Clear the list</button>
    <p class="muted">In the game, open the Loot Map panel and press “Paste list from the website”: the mod shows what you still need and where to find it.</p></div>`;
}
function notesCard() {
  return `<div class="card"><h2>Data notes</h2><div class="sub">${DB.notes.length} findings</div>${ul(DB.notes.map(esc))}
    <p class="muted">Regenerated by <code>tools/build_db.py</code> after each game patch.</p></div>`;
}
// ---------- Stations of a recipe: what each one gives you (real success chance, profit, profit per hour) ----------
const atStation = (rid, id) => { const r = X.R[rid]; eqTmp = { rid: r[0], id }; try { return { f: failNow(r), p: realProfit(rid) }; } finally { eqTmp = null; } };
const succTxt = f => +(100 * (1 - f)).toFixed(1) + '% success';
const sellersOfFurn = id => DB.vendors.filter(v => v.fs && v.fs.includes(+id)).map(v => v.n);
function stationRows(rid) {
  const r = X.R[rid], l = stationsOf(r); if (!l.length) return '';
  const cur = stationFor(r).id, req = r[10] || [], ex = r[14] || [];
  const rows = l.map(x => { const a = atStation(rid, x.id), sh = sellersOfFurn(x.id), f = DB.furniture[x.id];
    const gain = a.p.sellable ? ` \u00b7 <b class="${a.p.profit >= 0 ? 'good' : 'bad'}">${profitTxt(a.p.profit)}</b>${a.p.hour != null ? ` \u00b7 ${profitTxt(a.p.hour)}/h` : ''}` : '';
    return `<label class="stn"><input type="radio" name="st${rid}" data-station="${rid}" value="${x.id}" ${x.id === cur ? 'checked' : ''}> ${fl(+x.id)} <small class="muted">${esc(stInfo(x))}</small><br><small>${succTxt(a.f)}${gain}</small><br><small class="muted">${f && (f[2] || f[3]) ? price(f) + ' \u00b7 ' : ''}${sh.length ? 'sold by ' + esc(sh.slice(0, 2).join(', ')) : 'not sold in shops'}</small></label>`; });
  return `<p class="muted">Station type ${esc(r[2])}${req.length ? '; needs the modifier ' + req.map(esc).join(', ') : ''}${ex.length ? '; not ' + ex.map(esc).join(', ') : ''}. ${l[0].loose ? 'No station in the data has these modifiers, so every station of the type is listed. ' : ''}Pick the one you use: the success chance and profit follow it.</p>${rows.join('')}`;
}
function shopStation(rid) {
  const r = X.R[rid], l = stationsOf(r); if (!l.length) return '';
  const a = atStation(rid, stationFor(r).id);
  return `<div class="shopst muted">${stationSelect(r)} \u00b7 ${succTxt(a.f)}${a.p.sellable ? ` \u00b7 ${profitTxt(a.p.profit)}${a.p.hour != null ? ` \u00b7 ${profitTxt(a.p.hour)}/h` : ''}` : ''}</div>`;
}
// ---------- What to craft: the best recipes for the skills you have ----------
let bestSk = '', bestEst = false;
const tmTxt = sec => sec >= 3600 ? +(sec / 3600).toFixed(1) + ' h' : sec >= 60 ? Math.round(sec / 60) + ' min' : Math.round(sec) + ' s';
function bestCard() {
  const names = [...new Set(DB.recipes.map(r => r[3]).filter(x => x && x !== 'None'))].sort();
  const pool = DB.recipes.filter(r => r[8].length && (r[5] || 0) < 1 && (!bestSk || r[3] === bestSk));
  const mine = [];
  for (const r of pool) { if ((r[4] || 0) > (r[3] && r[3] !== 'None' ? lvlOf(r[3]) : 99)) continue; const p = realProfit(r[0]); if (p.sellable && p.profit > 0 && (bestEst || !p.estimated)) mine.push({ r, p }); }
  const byProfit = [...mine].sort((a, b) => b.p.profit - a.p.profit).slice(0, 10);
  const byHour = mine.filter(x => x.p.hour != null && x.r[6] >= 60).sort((a, b) => b.p.hour - a.p.hour).slice(0, 10);
  const bestNow = {}; for (const x of mine) if (x.p.hour != null && x.r[6] >= 60) { const k = x.r[3] || 'None'; if (!(k in bestNow) || x.p.hour > bestNow[k]) bestNow[k] = x.p.hour; }
  // locked recipes (up to 3 levels above yours), priced at the level that unlocks them
  const saved = { ...skillLv }, locked = [];
  clearRP();
  for (const r of pool) { const sk = r[3]; if (!sk || sk === 'None') continue; const need = r[4] || 0, have = lvlOf(sk); if (need <= have || need > have + 3) continue;
    skillLv[sk] = need; const p = realProfit(r[0]); skillLv[sk] = saved[sk]; if (saved[sk] === undefined) delete skillLv[sk];
    if (p.sellable && p.hour != null && p.hour > 0 && r[6] >= 60 && (bestEst || !p.estimated)) locked.push({ r, p, have, gain: p.hour - (bestNow[sk] ?? 0) }); }
  skillLv = saved; clearRP();
  const unlock = locked.filter(x => x.gain > 0).sort((a, b) => b.p.hour - a.p.hour).slice(0, 8);
  const row = (x, hr) => { const r = x.r, p = x.p, fl = Math.round(failNow(r) * 100); return `<span>${rIco(r[0])}${link('recipes', r[0], r[1])}${p.estimated ? ' <small class="muted" title="An ingredient is not sold in any shop; its base value is used">~</small>' : ''}<br><small class="muted">${esc((stationFor(r) || { n: r[2] }).n)}${r[3] && r[3] !== 'None' ? ' · ' + esc(r[3]) + (r[4] ? ' lv ' + r[4] : '') : ''} · ${tmTxt(r[6])} · ${100 - fl}% success</small></span><span><b class="good">${hr ? profitTxt(p.hour) + '/h' : profitTxt(p.profit)}</b><br><small class="muted">${hr ? profitTxt(p.profit) + ' per craft' : (p.hour != null ? profitTxt(p.hour) + '/h' : '')}</small></span>`; };
  const list = (arr, hr) => arr.length ? `<div class="facts">${arr.map(x => row(x, hr)).join('')}</div>` : '<p class="muted">Nothing profitable at your levels' + (bestSk ? ' for this skill' : '') + '. Raise a skill on the Your skills page, or load a save there.</p>';
  const lockRows = unlock.length ? `<div class="facts">${unlock.map(x => `<span>${rIco(x.r[0])}${link('recipes', x.r[0], x.r[1])}<br><small class="muted">needs ${esc(x.r[3])} ${x.r[4]} (you have ${x.have}) · ${tmTxt(x.r[6])} · ${esc(x.r[2])}</small></span><span><b class="good">${profitTxt(x.p.hour)}/h</b><br><small class="muted">${bestNow[x.r[3]] != null ? '+' + fmt(x.gain) + ' OC/h over your best ' + esc(x.r[3]) + ' recipe' : 'you have no profitable ' + esc(x.r[3]) + ' recipe yet'}</small></span>`).join('')}</div>` : '<p class="muted">Nothing within three levels beats what you can already make.</p>';
  return `<div class="card"><h2>What to craft</h2><div class="sub">Using your skill levels (a skill left alone counts as level 5) and real shop prices</div>
    <p><select id="bestSk" aria-label="Only this skill"><option value="">All skills</option>${names.map(n => `<option ${bestSk === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select> <label><input type="checkbox" id="bestEst" ${bestEst ? 'checked' : ''}> Include recipes with an ingredient no shop sells</label> <a href="#/db/skills">Set your levels</a></p>
    <h3>Best profit per hour</h3>${list(byHour, true)}
    <h3>Best profit per craft</h3>${list(byProfit, false)}
    <h3>Worth levelling for</h3><p class="muted">Recipes up to three levels above yours that would pay more per hour than your best now, priced at the level that unlocks them.</p>${lockRows}
    <p class="muted">Profit is after the fail chance and what shops pay for the quality your skill gives. ~ means an ingredient is not sold in any shop (its base value is used). Recipes under a minute are left out of the per-hour lists. Shops pay a fixed price, so selling many of one item at once is not modelled; check the recipe for the shops that buy it.</p></div>`;
}
// Recently viewed items and recipes (kept in this browser only).
function recentList() { try { return JSON.parse(localStorage.getItem('obs-recent') || '[]').filter(x => x && x.s && x.k != null); } catch (_) { return []; } }
function recentAdd(sec, key) {
  if (sec !== 'items' && sec !== 'recipes') return;
  const e = sec === 'items' ? DB.items[key] : X.R[key]; if (!e) return;
  const l = recentList().filter(x => !(x.s === sec && String(x.k) === String(key))); l.unshift({ s: sec, k: key, n: sec === 'items' ? e[0] : e[1] });
  try { localStorage.setItem('obs-recent', JSON.stringify(l.slice(0, 12))); } catch (_) {}
}
function recentRows() { const l = recentList(); return l.length ? `<div class="recent"><b>Recently viewed</b> ${l.map(x => link(x.s, x.k, x.n)).join(' \u00b7 ')}</div>` : ''; }
const missing = () => `<div class="card"><h2>Not found</h2><p class="muted">This entry isn't in the current data.</p></div>`;
function renderDetail() {
  const el = $('#dbDetail'), k = V.key, bare = BARE.has(V.sec), tbl = tableOn();
  const back = `<a class="dbback${tbl && V.sec === 'items' ? ' show' : ''}" href="#/db/${bare ? 'items' : V.sec}">${tbl && V.sec === 'items' ? '← Back to the table' : '← Back to the list'}</a>`;
  const home = { upgrades: 'categories', items: 'items', recipes: 'recipes', vendors: 'vendors', tenants: 'tenants', furniture: 'pieces of furniture' };
  if (V.sec === 'notes') el.innerHTML = notesCard();
  else if (V.sec === 'list') el.innerHTML = listCard();
  else if (V.sec === 'skills') el.innerHTML = skillsCard();
  else if (V.sec === 'best') el.innerHTML = bestCard();
  else if (EXTRA[V.sec]) el.innerHTML = EXTRA[V.sec]();
  else if (k == null && tbl) el.innerHTML = tableCard();
  else if (k == null) el.innerHTML = V.sec === 'tenement' ? tenementHome() : V.sec === 'upgrades' ? upgradesHome() : V.sec === 'vendors' ? vendorsHome() : `<div class="card"><h2>${esc(SECTIONS.find(s => s[0] === V.sec)[1])}</h2><p class="muted">${rows().length} ${home[V.sec]}. Pick one on the left.</p></div>`;
  else el.innerHTML = { upgrades: upgradeCard, items: itemCard, tenement: itemCard, recipes: recipeCard, vendors: vendorCard, tenants: tenantCard, furniture: furnCard }[V.sec](k);
  if (k != null || bare) el.insertAdjacentHTML('afterbegin', back);
  if (k != null && !bare) { recentAdd(V.sec, k); const c = el.querySelector('.card .dbhead, .card h2'); if (c) c.insertAdjacentHTML('beforeend', '<button type="button" class="copypage" data-copypage title="Copy a link to this page">Copy link</button>'); }
  else if (k == null && !bare && (V.sec === 'items' || V.sec === 'recipes')) { const rc = recentRows(); if (rc) el.insertAdjacentHTML('afterbegin', rc); }
  const more = $('#tblMore'); if (more) more.onclick = () => { V.lim += 600; renderDetail(); };
  el.scrollTop = 0;
}

// ---------- more tools: what can I craft now, levelling guide, tenement cost, loot ranking, power planner, patch changes ----------
const EXTRA = {};
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
const skillNames = () => [...new Set(DB.recipes.map(r => r[3]).filter(x => x && x !== 'None'))].sort();

// --- What can I craft now: your inventory, pasted from the mod's "Copy inventory for the website" button ---
let invData = lsGet('obs-inv', null), invMsg = '', invOnlyMine = true;
function parseInv(text) {
  const m = /OBS-INV1:([0-9=,.\-]*)/.exec(text || ''); if (!m) return null;
  const items = {}; m[1].split(',').forEach(p => { const [a, b] = p.split('='); if (a && +b > 0) items[+a] = +b; });
  return { at: new Date().toLocaleString(), items };
}
const invHave = (id, inv) => { const g = DB.items[id] && DB.items[id][6]; let n = inv[id] || 0; if (g && g.length) g.forEach(m => { n += inv[m] || 0; }); return n; };
EXTRA.now = function () {
  const head = `<div class="card"><h2>What can I craft now</h2><div class="sub">Recipes you can make with what you carry</div>
    <p>In the game, open the Loot Map window and press <b>Copy inventory for the website</b>, then paste it here. It stays in this browser and is never uploaded.</p>
    <textarea id="invText" rows="3" style="width:100%" placeholder="Paste the inventory here (it starts with OBS-INV1:)"></textarea>
    <p><button type="button" class="dbmore" data-invload>Load inventory</button> ${invData ? `<button type="button" class="dbmore" data-invclear>Forget it</button>` : ''} ${invMsg ? `<span class="good">${esc(invMsg)}</span>` : ''}</p>`;
  if (!invData) return head + '<p class="muted">No inventory loaded yet.</p></div>';
  const inv = invData.items, rows = [], near = [];
  for (const r of DB.recipes) {
    if (!r[7].length || !r[8].length) continue;
    if (invOnlyMine && r[3] && r[3] !== 'None' && (r[4] || 0) > lvlOf(r[3])) continue;
    let n = Infinity, miss = [];
    for (const [id, a] of r[7]) { const need = Math.max(a / X.div(r, id), 0.0001), have = invHave(id, inv); const k = Math.floor(have / need + 1e-9); if (k < 1) miss.push([id, Math.max(0, need - have)]); n = Math.min(n, k); }
    if (!miss.length) rows.push({ r, n }); else if (miss.length === 1) near.push({ r, miss: miss[0] });
  }
  const pf = x => { const p = realProfit(x.r[0]); return p.sellable ? p.profit : X.RC[x.r[0]].profit; };
  rows.forEach(x => { x.p = pf(x); }); rows.sort((a, b) => b.p - a.p);
  near.forEach(x => { x.p = pf(x); }); near.sort((a, b) => b.p - a.p);
  const have = Object.keys(inv).length;
  return head + `<p class="muted">Loaded ${esc(invData.at)} - ${have} kinds of item. <label><input type="checkbox" id="invMine" ${invOnlyMine ? 'checked' : ''}> Only recipes at my skill levels</label></p>
    <h3>You can make now - ${rows.length}</h3>${rows.length ? `<div class="facts">${rows.slice(0, 60).map(x => `<span>${rIco(x.r[0])}${link('recipes', x.r[0], x.r[1])}<br><small class="muted">up to ${x.n >= 1e6 ? 'any number' : x.n} craft${x.n === 1 ? '' : 's'} - ${esc(x.r[2])}</small></span><span class="${x.p > 0 ? 'good' : 'bad'}">${x.p >= 0 ? '+' : ''}${fmt(x.p)} OC<br><small class="muted">per craft</small></span>`).join('')}</div>${rows.length > 60 ? `<p class="muted">Showing the 60 with the best profit.</p>` : ''}` : '<p class="muted">Nothing yet.</p>'}
    <h3>One ingredient short - ${near.length}</h3>${near.length ? `<div class="facts">${near.slice(0, 40).map(x => `<span>${rIco(x.r[0])}${link('recipes', x.r[0], x.r[1])}</span><span><small class="muted">needs ${num(x.miss[1])} more</small> ${il(x.miss[0])}</span>`).join('')}</div>` : '<p class="muted">None.</p>'}</div>`;
};

// --- Skill levelling guide ---
let lvSk = lsGet('obs-lvsk', '');
// Levels gained by one craft (the game: the station adds 0.1 x gain x fail, the craft roll adds time/1800 x gain x 0.1 on success or 0.05 on failure, all times the fail chance, at least 1%).
const gainPerCraft = r => {
  const f = failNow(r), sg = (r[15] == null ? 1 : r[15]), v = Math.max(0.05, Math.min(5, (r[6] || 0) / 1800));
  return sg * Math.max(f, 0.01) * (0.1 + v * ((1 - f) * 0.1 + f * 0.05));
};
EXTRA.level = function () {
  const names = skillNames(); if (!lvSk || !names.includes(lvSk)) lvSk = names[0];
  const L = lvlOf(lvSk);
  const head = `<div class="card"><h2>Skill levelling guide</h2><div class="sub">The fastest and cheapest ways to raise a crafting skill</div>
    <p><select id="lvSk" aria-label="Skill">${names.map(n => `<option ${n === lvSk ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select> You are level <b>${L}</b> (<a href="#/db/skills">change</a>). The game caps skills at 10.</p>`;
  if (L >= 10) return head + '<p class="good">This skill is at the maximum.</p></div>';
  const rows = [];
  for (const r of DB.recipes) {
    if (r[3] !== lvSk || !r[8].length || (r[4] || 0) > L || (r[5] || 0) >= 1) continue;
    const f = failNow(r); if (f >= 0.98) continue;
    const g = gainPerCraft(r), crafts = 1 / g, p = realProfit(r[0]), prof = p.sellable ? p.profit : X.RC[r[0]].profit;
    rows.push({ r, f, g, crafts, secs: crafts * (r[6] || 0), net: crafts * prof, prof });
  }
  const row = (x, k) => `<span>${rIco(x.r[0])}${link('recipes', x.r[0], x.r[1])}${x.r[12] ? ' <small class="muted" title="You need to have learned this recipe from a book">book</small>' : ''}<br><small class="muted">${Math.round(x.f * 100)}% fail - ${x.crafts < 10 ? fmt(x.crafts) : Math.round(x.crafts)} crafts per level - ${esc(x.r[2])}</small></span><span>${k === 'time' ? tmTxt(x.secs) : (x.net >= 0 ? '+' : '') + fmt(x.net) + ' OC'}<br><small class="muted">${k === 'time' ? (x.net >= 0 ? '+' : '') + fmt(x.net) + ' OC' : tmTxt(x.secs)} per level</small></span>`;
  const fast = [...rows].filter(x => x.secs > 0).sort((a, b) => a.secs - b.secs).slice(0, 10);
  const cheap = [...rows].sort((a, b) => b.net - a.net).slice(0, 10);
  return head + `<p class="muted">Each craft trains the skill by an amount that grows with the recipe's fail chance and its craft time, so recipes near your minimum level train fastest and recipes that never fail train almost nothing. Counted for ${rows.length} recipes you can make at level ${L}. The game does not show the exact gain of a station upgrade, which is not counted.</p>
    <h3>Fastest to the next level</h3>${fast.length ? `<div class="facts">${fast.map(x => row(x, 'time')).join('')}</div>` : '<p class="muted">No recipes.</p>'}
    <h3>Cheapest (or most profitable) to the next level</h3>${cheap.length ? `<div class="facts">${cheap.map(x => row(x, 'net')).join('')}</div>` : '<p class="muted">No recipes.</p>'}</div>`;
};

// --- Tenement cost calculator ---
// Costs per tier from the game's data. Load your save (Globals.tnmt) to fill in what you already have; the plan is then grouped
// by contractor with the items to bring to each one.
let tcSel = lsGet('obs-tc', {});
let tcSave = lsGet('obs-tcsave', null), tcMsg = '';
const PPL = window.OBS_PEOPLE || {};
const tcTier = (c, u) => c[3][u[1]] || u[2];
const tcInst = (c, i) => tcSave ? (tcSave.inst[c[1]] && tcSave.inst[c[1]].length ? tcSave.inst[c[1]] : [0]) : [(tcSel[i] || [0, 0])[0] || 0];
const tcHave = (c, i) => { const a = tcInst(c, i); if (a.length === 1) return c[3][a[0]] || ('tier ' + a[0]); const n = {}; a.forEach(t => { n[t] = (n[t] || 0) + 1; });
  return a.length + ' places: ' + Object.keys(n).sort((x, y) => x - y).map(t => `${esc(c[3][t] || 'tier ' + t)} x${n[t]}`).join(', '); };
function tcPlan() {
  const steps = []; let oc = 0, rm = 0, hrs = 0; const mat = {};
  TU.cats.forEach((c, i) => {
    const b = (tcSel[i] || [0, 0])[1] || 0, inst = tcInst(c, i);
    upBy(i).filter(u => u[1] > 0 && u[1] <= b).forEach(u => {
      const n = inst.filter(a => a < u[1]).length; if (!n) return;
      steps.push({ i, c, u, n }); oc += u[4] * n; rm += u[5] * n; hrs += (u[3] || 0) * n;
      u[6].forEach(x => { mat[x[0]] = (mat[x[0]] || 0) + x[1] * n; });
    });
  });
  // Pick one contractor per step: keep a category with the same contractor, otherwise the one who can build the most of the plan.
  const cover = TU.con.map((_, k) => steps.filter(s => s.u[8].includes(k)).length), last = {};
  steps.forEach(s => {
    if (!s.u[8].length) { s.k = -1; return; }
    s.k = s.u[8].includes(last[s.i]) ? last[s.i] : s.u[8].reduce((p, q) => cover[q] > cover[p] ? q : p, s.u[8][0]);
    last[s.i] = s.k;
  });
  return { steps, oc, rm, hrs, mat };
}
const tcPrice = (id, n) => { const s = sellersOf(+id)[0]; return s ? ` <small class="muted">${fmt(s.p * n)} OC at ${esc(s.v.n)}</small>` : ' <small class="muted">no shop sells it</small>'; };
EXTRA.tcalc = function () {
  const P = tcPlan(), cats = TU.cats.map((c, i) => ({ c, i, t: upBy(i).filter(u => u[1] > 0) })).filter(x => x.t.length);
  const rowsH = cats.map(({ c, i, t }) => {
    const [a, b] = tcSel[i] || [0, 0], mine = P.steps.filter(s => s.i === i);
    const o = mine.reduce((z, s) => z + s.u[4] * s.n, 0), r = mine.reduce((z, s) => z + s.u[5] * s.n, 0);
    const opt = v => t.map(u => `<option value="${u[1]}" ${u[1] === v ? 'selected' : ''}>${esc(tcTier(c, u))} (${u[1]})</option>`).join('');
    const haveCell = tcSave ? tcHave(c, i) : `<select data-tc="${i}" data-w="0" aria-label="Current tier of ${esc(c[1])}"><option value="0" ${!a ? 'selected' : ''}>none</option>${opt(a)}</select>`;
    const who = [...new Set(mine.map(s => s.k))].map(k => k < 0 ? '<span class="failtag">nobody</span>' : esc(TU.con[k])).join(', ');
    return `<tr><td>${link('upgrades', i, c[1])}${c[2] ? ' <small class="muted">raises rent</small>' : ''}</td><td>${haveCell}</td>
      <td><select data-tc="${i}" data-w="1" aria-label="Target tier of ${esc(c[1])}"><option value="0" ${!b ? 'selected' : ''}>no change</option>${opt(b)}</select></td>
      <td>${o ? coinBox(o, 'OC') : ''} ${r ? coinBox(r, 'RM') : ''}${mine.length ? `<br><small class="muted">${mine.length} step${mine.length > 1 ? 's' : ''}${mine.some(s => s.n > 1) ? ', several places' : ''}</small>` : ''}</td><td>${who || '<span class="muted">-</span>'}</td></tr>`;
  });
  // one card per contractor: what they build, and the items to bring them
  let bringOC = 0, noShop = 0, bringKinds = 0;
  const conCards = TU.con.map((name, k) => ({ k, name, steps: P.steps.filter(s => s.k === k) })).filter(x => x.steps.length).map(x => {
    const need = {}; x.steps.forEach(s => s.u[6].forEach(m => { need[m[0]] = (need[m[0]] || 0) + m[1] * s.n; }));
    const have = (tcSave && tcSave.stored && tcSave.stored[x.name]) || {};
    const rows = Object.entries(need).sort((p, q) => iname(p[0]).localeCompare(iname(q[0]))).map(([id, n]) => {
      const h = Math.min(n, have[id] || 0), br = n - h;
      if (br > 0) { bringKinds++; const s = sellersOf(+id)[0]; if (s) bringOC += s.p * br; else noShop++; }
      return `<span>${il(+id)}</span><span>need ${num(n)}${tcSave ? `, they hold ${num(h)}, <b>bring ${num(br)}</b>` : ''}${br > 0 ? tcPrice(id, br) : ' <small class="muted">nothing to bring</small>'}</span>`;
    });
    const o = x.steps.reduce((z, s) => z + s.u[4] * s.n, 0), r = x.steps.reduce((z, s) => z + s.u[5] * s.n, 0), slug = (PPL[x.name] || [])[0];
    return `<div class="tier"><div class="tierhead"><b>${esc(x.name)}</b> ${slug ? mapBtn(slug, '', 'Find on the map: ' + sceneName(slug)) : ''}<span class="grow"></span>${o ? coinBox(o, 'OC') : ''} ${r ? coinBox(r, 'RM') : ''}</div>
      <div class="tiermeta">${x.steps.map(s => `${esc(s.c[1])}: ${esc(tcTier(s.c, s.u))}${s.n > 1 ? ' x' + s.n : ''} <small class="muted">(${bhrs(s.u[3])}${s.u[7].length ? ', needs ' + s.u[7].map(q => esc(reqName(q))).join(', ') : ''})</small>`).join('<br>')}</div>
      <div class="facts">${rows.join('')}</div></div>`;
  });
  const orphans = P.steps.filter(s => s.k < 0);
  const saveBox = tcSave
    ? `<p><b>Loaded:</b> ${esc(tcSave.character)} / ${esc(tcSave.slot)}${tcSave.date ? ', saved ' + esc(new Date(tcSave.date).toLocaleString()) : ''}${tcSave.version ? ' (game ' + esc(tcSave.version) + ')' : ''}. "You have" comes from the save; apartments are counted one by one. <button type="button" class="dbmore" data-tcclear>Forget the save</button></p>`
    : `<p>Load your save to fill in what you already have and what each contractor is holding for you. Choose <b>Globals.tnmt</b> from your save folder. The file is read in your browser and never uploaded.</p>
       <p class="muted">Usually <code>C:\\Users\\&lt;you&gt;\\AppData\\LocalLow\\Loiste Interactive\\Obenseuer\\Saves\\&lt;character&gt;\\&lt;slot&gt;\\Globals.tnmt</code></p>`;
  return `<div class="card wide"><h2>Tenement cost calculator</h2><div class="sub">What it costs to take each category from one tier to another, who builds it and what to bring</div>
    <div class="tcsave">${saveBox}<p><input type="file" id="tcFile" accept=".tnmt,.json,.txt" aria-label="Load Globals.tnmt">${tcMsg ? ` <span class="muted">${esc(tcMsg)}</span>` : ''}</p></div>
    <p class="muted">Pick the tier you want for each category. Costs are the game's, per tier, and materials are priced at the cheapest shop that sells them.</p>
    <div class="tblwrap"><table class="tbl up"><thead><tr><th>Category</th><th>You have</th><th>You want</th><th>Cost</th><th>Contractor</th></tr></thead><tbody>${rowsH.join('')}</tbody></table></div>
    <h3>Total</h3><dl class="kv"><dt>Money</dt><dd>${coinBox(P.oc, 'OC')} ${coinBox(P.rm, 'RM')}</dd><dt>Build time</dt><dd>${bhrs(Math.round(P.hrs))} <small class="muted">if built one after another</small></dd>
    <dt>Items to bring</dt><dd>${bringKinds} kinds, about ${fmt(bringOC)} OC to buy${noShop ? ` <small class="muted">(${noShop} not sold in shops)</small>` : ''}</dd><dt>All together</dt><dd>${coinBox(P.oc + bringOC, 'OC')} ${P.rm ? coinBox(P.rm, 'RM') : ''}</dd></dl>
    ${conCards.length ? `<h3>Who to go to</h3><p class="muted">Each upgrade goes to one contractor, chosen to keep the number of visits low. Bring them the items listed; the game takes the money when you start the upgrade.</p>${conCards.join('')}` : ''}
    ${orphans.length ? `<p><span class="failtag">No contractor builds:</span> ${orphans.map(s => esc(s.c[1] + ' ' + tcTier(s.c, s.u))).join(', ')}</p>` : ''}
    <p><button type="button" class="dbmore" data-tcmax>Set every target to the top tier</button> <button type="button" class="dbmore" data-tcreset>Reset</button></p></div>`;
};

// --- Loot ranking: which places hold the most, from how many placed containers can drop each item ---
let lootSc = lsGet('obs-lootsc', ''), lootBy = 'count';
const lootTables = () => {
  if (X.sceneTables) return X.sceneTables;
  const m = {}; for (const [n, sc] of Object.entries(X.tableScenes)) for (const [slug, k] of sc) (m[slug] = m[slug] || []).push([n, k]);
  return X.sceneTables = m;
};
const tableAvg = n => { const t = DB.loot[n]; if (!t) return 0; const ids = (t[1] || []).concat(t[2] || []).filter(i => DB.items[i]); return ids.length ? ids.reduce((s, i) => s + DB.items[i][1], 0) / ids.length : 0; };
EXTRA.loot = function () {
  const T = lootTables(), scenes = Object.keys(T).map(slug => { const l = T[slug]; const cnt = l.reduce((s, [, k]) => s + k, 0), val = l.reduce((s, [n, k]) => s + k * tableAvg(n), 0); return { slug, cnt, val, per: cnt ? val / cnt : 0 }; }).filter(x => x.cnt >= 3);
  const top = [...scenes].sort((a, b) => b.val - a.val).slice(0, 15);
  const head = `<div class="card wide"><h2>Loot ranking</h2><div class="sub">Where the most and the best loot is</div>
    <p class="muted">Counts come from the containers placed in each scene. A scene's loot value adds up, for every container, the average base value of the items its loot table can drop. It is a guide, not a drop chance: the game's per-item weights are not in the data.</p>
    <h3>Richest places</h3><div class="facts">${top.map(x => `<span>${mapBtn(x.slug, '', sceneName(x.slug))}</span><span>${num(x.cnt)} containers<br><small class="muted">about ${fmt(x.per)} OC each, ${num(Math.round(x.val))} OC in all</small></span>`).join('')}</div>`;
  const opts = scenes.sort((a, b) => sceneName(a.slug).localeCompare(sceneName(b.slug)));
  let body = '';
  if (lootSc && T[lootSc]) {
    const per = {}; for (const [n, k] of T[lootSc]) { const t = DB.loot[n]; if (!t) continue; for (const [i, rare] of (t[1] || []).map(i => [i, 0]).concat((t[2] || []).map(i => [i, 1]))) { if (!DB.items[i]) continue; const o = per[i] = per[i] || { c: 0, r: 0 }; o.c += k; if (rare) o.r += k; } }
    const list = Object.entries(per).map(([i, o]) => ({ i, c: o.c, v: DB.items[i][1], rare: o.r === o.c })).sort((a, b) => lootBy === 'value' ? b.v - a.v || b.c - a.c : b.c - a.c || b.v - a.v).slice(0, 40);
    body = `<h3>Items in ${esc(sceneName(lootSc))}</h3><p class="muted">Sorted by <select id="lootBy"><option value="count" ${lootBy === 'count' ? 'selected' : ''}>how many containers can hold it</option><option value="value" ${lootBy === 'value' ? 'selected' : ''}>its value</option></select></p>
      <div class="facts">${list.map(x => `<span>${il(+x.i)}${x.rare ? ' <small class="muted">rare</small>' : ''}</span><span>${x.c} container${x.c > 1 ? 's' : ''}<br><small class="muted">${fmt(x.v)} OC each</small></span>`).join('')}</div>${mapBtn(lootSc, '', 'Open this place on the map')}`;
  }
  return head + `<h3>Look inside a place</h3><p><select id="lootSc" aria-label="Place"><option value="">Choose a place...</option>${opts.map(x => `<option value="${esc(x.slug)}" ${x.slug === lootSc ? 'selected' : ''}>${esc(sceneName(x.slug))} (${x.cnt})</option>`).join('')}</select></p>${body}</div>`;
};

// --- Power planner ---
let pwRows = lsGet('obs-power', []);
const wTxt = n => n >= 1000 ? +(n / 1000).toFixed(2) + ' kW' : Math.round(n) + ' W';
const powerOf = f => (f[5] || []).filter(e => e[1] > 0 && e[6] <= 0 && !(e[1] === 30 && e[2] < 0));   // exactly 30 W with no idle value is the game's default, not a real figure
EXTRA.power = function () {
  const users = Object.entries(DB.furniture).filter(([, f]) => powerOf(f).length).sort((a, b) => a[1][0].localeCompare(b[1][0]));
  const gens = Object.entries(DB.furniture).filter(([, f]) => (f[5] || []).some(e => e[6] > 0)).sort((a, b) => a[1][0].localeCompare(b[1][0]));
  let use = 0, idle = 0, kwh = 0; const rows = pwRows.filter(p => DB.furniture[p.id]).map((p, i) => {
    const f = DB.furniture[p.id], e = powerOf(f).filter(x => x[0] === 0)[0] || powerOf(f)[0], u = e[1] * p.q, id_ = (e[2] >= 0 ? e[2] : 0) * p.q;
    use += u; idle += id_; kwh += (u * p.h + id_ * (24 - p.h)) / 1000;
    return `<tr><td>${link('furniture', p.id, f[0])}<br><small class="muted">${e[0] === 0 ? 'electric' : 'power'} ${wTxt(e[1])}${e[2] >= 0 ? ', ' + wTxt(e[2]) + ' idle' : ''}</small></td>
      <td><input type="number" min="1" max="99" value="${p.q}" data-pwq="${i}" style="width:4.5em" aria-label="How many"></td>
      <td><input type="number" min="0" max="24" step="0.5" value="${p.h}" data-pwh="${i}" style="width:4.5em" aria-label="Hours running per day"></td>
      <td>${wTxt(u)}</td><td><button type="button" class="dbmore" data-pwdel="${i}" aria-label="Remove">x</button></td></tr>`;
  });
  const gl = gens.map(([id, f]) => { const g = f[5].filter(e => e[6] > 0).reduce((s, e) => s + e[6], 0), e = f[5].find(x => x[6] > 0); return { id, f, g, e }; }).filter(x => x.g > 0);
  const need = use;
  const genRows = gl.map(x => `<span>${link('furniture', x.id, x.f[0])}<br><small class="muted">${KINDS[x.e[0]] || ''} - makes ${wTxt(x.g)}${x.e[3] || (x.e[4] || []).length ? ' - fuel: ' + esc((x.e[4] || []).join(', ') || 'fuel') : ''}</small></span><span>${need > 0 ? Math.ceil(need / x.g) + ' needed' : '-'}</span>`).join('');
  return `<div class="card wide"><h2>Power planner</h2><div class="sub">How much electricity your machines draw and how many generators you need</div>
    <p class="muted">Add the machines you plan to run. Numbers are the game's own use per machine (machines that only carry the game's default 30 W are left out); the in-game price of electricity is not in the game files, so cost is shown as energy only.</p>
    <p><select id="pwAdd" aria-label="Add a machine"><option value="">Add a machine...</option>${users.map(([id, f]) => `<option value="${id}">${esc(f[0])} (${wTxt(powerOf(f)[0][1])})</option>`).join('')}</select></p>
    ${rows.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Machine</th><th>How many</th><th>Hours a day</th><th>Draw</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <dl class="kv"><dt>Total draw</dt><dd><b>${wTxt(use)}</b> when everything runs</dd><dt>Idle draw</dt><dd>${wTxt(idle)} when they stand by</dd><dt>Energy per day</dt><dd>${fmt(kwh)} kWh</dd></dl>
    <h3>Generators</h3><div class="facts">${genRows}</div><p class="muted">Counts how many of each generator it takes to cover the total draw.</p>` : '<p class="muted">Nothing added yet.</p>'}</div>`;
};

// --- Patch changes: what changed between two game versions (data/changes.json, written by tools/build_changes.py) ---
let chData;
EXTRA.diff = function () {
  if (chData === undefined) { chData = null; fetch('data/changes.json?v=1').then(r => r.ok ? r.json() : null).then(j => { chData = j || {}; if (V.sec === 'diff') renderDetail(); }).catch(() => { chData = {}; if (V.sec === 'diff') renderDetail(); }); }
  const c = chData;
  if (!c) return '<div class="card"><h2>Patch changes</h2><p class="muted">Loading...</p></div>';
  if (!c.to) return `<div class="card"><h2>Patch changes</h2><p>No game update has been compared yet.</p><p class="muted">When the game updates, the data is rebuilt and compared with the old version, and what was added, removed or changed (items, recipes, shop prices) is listed here.</p></div>`;
  const sec = (title, o) => !o || !(o.added.length + o.removed.length + o.changed.length) ? '' : `<h3>${title}</h3>
    ${o.added.length ? `<p><b>Added - ${o.added.length}</b></p><div class="tags">${o.added.map(a => `<span class="tag">${esc(a[1])}</span>`).join('')}</div>` : ''}
    ${o.removed.length ? `<p><b>Removed - ${o.removed.length}</b></p><div class="tags">${o.removed.map(a => `<span class="tag">${esc(a[1])}</span>`).join('')}</div>` : ''}
    ${o.changed.length ? `<p><b>Changed - ${o.changed.length}</b></p><div class="facts">${o.changed.slice(0, 200).map(x => `<span>${esc(x[1])}</span><span>${x[2].map(d => `<small class="muted">${esc(d[0])}</small> ${esc(d[1])} &rarr; ${esc(d[2])}`).join('<br>')}</span>`).join('')}</div>` : ''}`;
  return `<div class="card wide"><h2>Patch changes</h2><div class="sub">Version ${esc(c.from.version || '?')} to ${esc(c.to.version || '?')}${c.to.updated ? ' - ' + esc(c.to.updated) : ''}</div>${sec('Items', c.items)}${sec('Recipes', c.recipes)}${sec('Furniture', c.furniture)}${sec('Shops', c.vendors)}</div>`;
};
// events for the new pages
document.addEventListener('click', e => {
  if (e.target.closest('[data-invload]')) { const inv = parseInv(($('#invText') || {}).value); if (inv) { invData = inv; lsSet('obs-inv', inv); invMsg = 'Inventory loaded.'; } else invMsg = 'That is not an inventory from the mod.'; renderDetail(); return; }
  if (e.target.closest('[data-invclear]')) { invData = null; invMsg = ''; try { localStorage.removeItem('obs-inv'); } catch (_) {} renderDetail(); return; }
  if (e.target.closest('[data-tcreset]')) { tcSel = {}; lsSet('obs-tc', tcSel); renderDetail(); return; }
  if (e.target.closest('[data-tcclear]')) { tcSave = null; tcMsg = ''; try { localStorage.removeItem('obs-tcsave'); } catch (_) {} renderDetail(); return; }
  if (e.target.closest('[data-tcmax]')) { TU.cats.forEach((c, i) => { const t = upBy(i).filter(u => u[1] > 0); if (t.length) tcSel[i] = [(tcSel[i] || [0, 0])[0], t[t.length - 1][1]]; }); lsSet('obs-tc', tcSel); renderDetail(); return; }
  const d = e.target.closest('[data-pwdel]'); if (d) { pwRows.splice(+d.dataset.pwdel, 1); lsSet('obs-power', pwRows); renderDetail(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'invMine') { invOnlyMine = t.checked; renderDetail(); }
  else if (t.id === 'lvSk') { lvSk = t.value; lsSet('obs-lvsk', lvSk); renderDetail(); }
  else if (t.dataset && t.dataset.tc != null) { const i = t.dataset.tc, cur = tcSel[i] || [0, 0]; cur[+t.dataset.w] = +t.value; tcSel[i] = cur; lsSet('obs-tc', tcSel); renderDetail(); }
  else if (t.id === 'tcFile') {
    const f = t.files && t.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { if (!window.TenSave) throw new Error('The save reader did not load. Reload the page.'); tcSave = window.TenSave.parse(rd.result); lsSet('obs-tcsave', tcSave); tcMsg = 'Save loaded.'; } catch (err) { tcMsg = 'Could not read that file: ' + (err && err.message ? err.message : err); } renderDetail(); };
    rd.onerror = () => { tcMsg = 'Could not read that file.'; renderDetail(); };
    rd.readAsText(f);
  }
  else if (t.id === 'lootSc') { lootSc = t.value; lsSet('obs-lootsc', lootSc); renderDetail(); }
  else if (t.id === 'lootBy') { lootBy = t.value; renderDetail(); }
  else if (t.id === 'pwAdd') { if (t.value) { pwRows.push({ id: t.value, q: 1, h: 8 }); lsSet('obs-power', pwRows); renderDetail(); } }
  else if (t.dataset && t.dataset.pwq != null) { pwRows[+t.dataset.pwq].q = Math.max(1, Math.min(99, Math.round(+t.value || 1))); lsSet('obs-power', pwRows); renderDetail(); }
  else if (t.dataset && t.dataset.pwh != null) { pwRows[+t.dataset.pwh].h = Math.max(0, Math.min(24, +t.value || 0)); lsSet('obs-power', pwRows); renderDetail(); }
});

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
  const changed = s !== V.sec || !V.init, bare = BARE.has(s);
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
function leave(slug, q, focus) {
  document.body.classList.remove('dbmode'); $('#dbBtn').classList.remove('on'); document.title = 'Obenseuer Loot Map';
  history.pushState(null, '', '#/' + slug);
  window.OBS_MAP && window.OBS_MAP.show(slug, q, focus);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-skillreset]')) { skillLv = {}; try { localStorage.removeItem('obs-skills'); } catch (_) {} clearRP(); renderDetail(); return; }
  const cp = e.target.closest('[data-copypage]');
  if (cp) { const u = location.href, done = () => { cp.textContent = 'Link copied'; setTimeout(() => { cp.textContent = 'Copy link'; }, 1800); };
    try { navigator.clipboard.writeText(u).then(done, () => fallbackCopy(u, done)); } catch (_) { fallbackCopy(u, done); } return; }
  const cl = e.target.closest('[data-copylink]');
  if (cl) { const link = shareLink(), done = () => { cl.textContent = 'Link copied'; setTimeout(() => { cl.textContent = 'Copy share link'; }, 1800); };
    try { navigator.clipboard.writeText(link).then(done, () => fallbackCopy(link, done)); } catch (_) { fallbackCopy(link, done); } return; }
  if (e.target.closest('[data-print]')) { window.print(); return; }
  if (e.target.closest('[data-listnew]')) { const n = prompt('Name of the new list'); if (n && n.trim()) { listNew(n); renderDetail(); } return; }
  if (e.target.closest('[data-listren]')) { const L = listsLoad(), n = prompt('New name for this list', L.active), nn = (n || '').trim().slice(0, 40); if (nn && nn !== L.active && !L.lists[nn]) { L.lists[nn] = shopGet(); delete L.lists[L.active]; L.active = nn; shopMem = null; shopSave(); renderDetail(); } return; }
  if (e.target.closest('[data-listdel]')) { const L = listsLoad(); if (confirm('Delete the list "' + L.active + '"?')) { doneClear(); delete L.lists[L.active]; if (!Object.keys(L.lists).length) L.lists['My list'] = {}; L.active = Object.keys(L.lists)[0]; shopMem = null; shopSave(); shopBadge(); renderDetail(); } return; }
  const cm = e.target.closest('[data-copymod]');
  if (cm) { const done = () => { cm.textContent = 'Copied ✓'; setTimeout(() => { cm.textContent = 'Copy list for the mod'; }, 1800); };
    try { navigator.clipboard.writeText(modCode).then(done, () => fallbackCopy(modCode, done)); } catch (_) { fallbackCopy(modCode, done); } return; }
  const sb = e.target.closest('[data-shop]');
  if (sb) {
    e.preventDefault(); const v = sb.dataset.shop;
    if (v === 'clear') { doneClear(); shopMem = {}; shopSave(); shopBadge(); } else shopChange(v, +sb.dataset.d || 1);
    if (V.sec === 'list') renderDetail(); else document.querySelectorAll('.shopwrap').forEach(w => { if (w.dataset.rid === v) w.innerHTML = shopCtl(v); });
    return;
  }
  const ko = e.target.closest('[data-pref]');
  if (ko) { const [id, how] = ko.dataset.pref.split(':'); shopOpt().pref[id] = how; optSave(); renderDetail(); return; }
  const sc = e.target.closest('[data-col]');
  if (sc) { const k = sc.dataset.col; if (V.col === k) V.dir = -V.dir; else { V.col = k; V.dir = k === 'name' ? 1 : -1; } renderDetail(); syncUrl(); return; }
  const tr = e.target.closest('tr[data-go]');
  if (tr && !e.target.closest('a')) { location.hash = '#/db/items/' + tr.dataset.go; return; }
  const m = e.target.closest('[data-map]'); if (m) { e.preventDefault(); leave(m.dataset.map, m.dataset.q, m.dataset.focus); return; }
  const c = e.target.closest('#dbDetail [data-cat]');
  if (c) { e.preventDefault(); V.sec = 'items'; V.q = ''; V.f = c.dataset.cat; V.e = ''; V.e2 = ''; V.min = ''; if (['eh', 'el', 'ep'].includes(V.sort)) V.sort = 'name'; V.key = null; history.pushState(null, '', '#/db/items'); renderSide(); renderDetail(); }
});
// Region tabs leave the database and go back to the map.
$('#regionTabs').addEventListener('click', e => { if (isDb() && e.target.closest('[data-region]')) { document.body.classList.remove('dbmode'); $('#dbBtn').classList.remove('on'); history.replaceState(null, '', '#/'); } }, true);
function fallbackCopy(t, ok) { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch (_) { } a.remove(); }
document.addEventListener('change', e => { const q = e.target.closest('[data-shopset]'); if (q) { shopSet(q.dataset.shopset, q.value); if (V.sec === 'list') renderDetail(); else document.querySelectorAll('.shopwrap').forEach(w => { if (w.dataset.rid === q.dataset.shopset) w.innerHTML = shopCtl(q.dataset.shopset); }); return; }
  const bsk = e.target.closest('#bestSk'); if (bsk) { bestSk = bsk.value; renderDetail(); return; }
  const bse = e.target.closest('#bestEst'); if (bse) { bestEst = bse.checked; renderDetail(); return; }
  const sk = e.target.closest('[data-skill]'); if (sk) { setSkill(sk.dataset.skill, +sk.value); return; }
  const stn = e.target.closest('[data-station]'); if (stn) { setStation(stn.dataset.station, stn.value); return; }
  const si = e.target.closest('[data-skillin]'); if (si) { setSkill(si.dataset.skillin, Math.max(0, Math.min(10, Math.round(+si.value || 0)))); return; }
  const sf = e.target.closest('[data-saveinput]'); if (sf) { if (sf.files.length) loadSaves([...sf.files]); return; }
  const lp = e.target.closest('[data-listpick]'); if (lp) { listSwitch(lp.value); renderDetail(); return; } const dn = e.target.closest('[data-done]'); if (dn) { setDone(dn.dataset.done, dn.checked); renderDetail(); return; } const sd = e.target.closest('[data-shopday]'); if (sd) { shopOpt().day = +sd.value; optSave(); renderDetail(); return; } const sh = e.target.closest('[data-shophour]'); if (sh) { shopOpt().hour = +sh.value; optSave(); renderDetail(); return; } const sb = e.target.closest('[data-shopbuy]'); if (sb) { shopOpt().shop = sb.value; optSave(); renderDetail(); return; } const rp = e.target.closest('[data-recpick]'); if (rp) { shopOpt().rec[rp.dataset.recpick] = rp.value; optSave(); renderDetail(); return; } const m = e.target.closest('[data-shopmode]'); if (m) { shopOpt().mode = m.value; optSave(); renderDetail(); } });
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

// Press / to jump to the search box (like most sites), unless you are already typing.
document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  const q = (/^#\/db(\/|$)/.test(location.hash) && document.getElementById('dbQ')) || document.getElementById('q'); if (!q || q.offsetParent === null) return;
  e.preventDefault(); q.focus(); q.select();
});

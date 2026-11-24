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
  ['tenants', 'Tenants'], ['furniture', 'Furniture'], ['skills', 'Your skills'], ['list', 'Shopping list'], ['notes', 'Data notes'],
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
    const s = document.createElement('script'); s.src = 'data/db.js?v=6';
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

// ---------- real shop prices (the game's formula: base value × the shop's multiplier, at least 1 OC) ----------
const payAt = (v, id) => Math.max(1, Math.round(DB.items[id][1] * (v.bm != null ? v.bm : 1.1)));   // what you pay the shop
const getAt = (v, id) => Math.max(1, Math.round(DB.items[id][1] * (v.sm != null ? v.sm : 0.9)));   // what the shop pays you
const sellersMemo = {}, buyersMemo = {};
const sellersOf = id => sellersMemo[id] || (sellersMemo[id] = DB.items[id] ? DB.vendors.filter(v => sells(v, +id)).map(v => ({ v, p: payAt(v, id) })).sort((a, b) => a.p - b.p || a.v.n.localeCompare(b.v.n)) : []);
const buyersOf = id => buyersMemo[id] || (buyersMemo[id] = DB.items[id] ? DB.vendors.filter(v => buys(v, +id)).map(v => ({ v, p: getAt(v, id) })).sort((a, b) => b.p - a.p || a.v.n.localeCompare(b.v.n)) : []);
// The cheapest way to pay for one of an ingredient: a group counts as its cheapest member; nothing sells it → its base value, marked as an estimate.
function buyCost(id) {
  const it = DB.items[id]; if (!it) return { p: 0, shop: false };
  let best = null;
  for (const m of (it[6].length ? it[6] : [+id])) { const s0 = sellersOf(m)[0]; if (s0 && (!best || s0.p < best.p)) best = { p: s0.p, shop: true, v: s0.v, id: m }; }
  return best || { p: X.unit(id), shop: false, id: +id };
}
// Quality of what you craft (the game's formula, averaged): skill × 0.2 × the recipe's skill factor × (1 − fail chance) × the recipe's quality factor, from 0.05 to 2; the sale price scales with it.
let skillLv = {}; try { skillLv = JSON.parse(localStorage.getItem('obs-skills') || '{}') || {}; } catch (e) { skillLv = {}; }
const lvlOf = sk => { const v = skillLv[sk]; return typeof v === 'number' && v >= 0 && v <= 15 ? v : 5; };
const qualityOf = r => { const x = r[13] || [1, 1, 0]; if (x[2] > 0) return x[2]; if (!r[3] || r[3] === 'None') return 1; return Math.max(0.05, Math.min(2, lvlOf(r[3]) * 0.2 * x[0] * (1 - (r[5] || 0)) * x[1])); };
const qualityValue = q => q > 1 ? q * q : 0.5 * q * q + 0.25 * q + 0.25;
const hasQuality = id => !!(DB.items[id] && DB.items[id][8].includes('ItemQualityData'));
const skillSelect = sk => `<select data-skill="${esc(sk)}" aria-label="Your ${esc(sk)} level" title="Your ${esc(sk)} level: sets the quality of what you craft, which sets what shops pay">${Array.from({ length: 16 }, (_, i) => `<option value="${i}" ${i === lvlOf(sk) ? 'selected' : ''}>${esc(sk)} ${i}</option>`).join('')}</select>`;
function setSkill(sk, v) { skillLv[sk] = v; try { localStorage.setItem('obs-skills', JSON.stringify(skillLv)); } catch (e) {} for (const k in RPmemo) delete RPmemo[k]; if (V.sec === 'recipes') renderList(); renderDetail(); }
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
  let n = 0; for (const [k, v] of Object.entries(info.game)) if (used.has(k)) { skillLv[k] = Math.max(0, Math.min(15, v)); n++; }
  try { localStorage.setItem('obs-skills', JSON.stringify(skillLv)); localStorage.setItem('obs-saveinfo', JSON.stringify(info)); } catch (e) {}
  saveInfo = info; for (const k in RPmemo) delete RPmemo[k];
  saveMsg = (n ? n + ' crafting skill levels loaded from your save. ' : '') + notes.join(' ');
  renderDetail();
}
function skillsCard() {
  const names = [...new Set(DB.recipes.map(r => r[3]).filter(x => x && x !== 'None'))].sort();
  const cnt = sk => DB.recipes.filter(r => r[3] === sk).length;
  return `<div class="card"><h2>Your skills</h2><div class="sub">${names.length} crafting skills</div>
    <p>Enter your level in each skill. The quality of what you craft depends on it, and shops pay more for higher quality, so the profit shown on recipes uses these levels (a skill left alone counts as level 5). Quality ≈ level × 0.2 × the recipe's skill factor × (1 − fail chance), between 0.05 and 2.</p>
    <div class="facts">${names.map(sk => `<span>${esc(sk)} <small class="muted">${cnt(sk)} recipes</small></span><span><input type="number" min="0" max="15" step="1" inputmode="numeric" data-skillin="${esc(sk)}" value="${lvlOf(sk)}" aria-label="${esc(sk)} level" style="width:5em"></span>`).join('')}</div>
    <button type="button" class="dbmore" data-skillreset>Reset all to 5</button>
    <h3>Load from a save</h3>
    <p>Pick <b>Globals.tnmt</b> from a save slot (and <b>woodcutting.json</b> from the character's folder if you use Woodcutting). Everything is read here in your browser and never uploaded. Your saves are in <code>C:\Users\&lt;you&gt;\AppData\LocalLow\Loiste Interactive\Obenseuer\Saves\&lt;character&gt;\&lt;slot&gt;</code>.</p>
    <label class="dbmore" style="display:inline-block;cursor:pointer">Choose save files…<input type="file" data-saveinput multiple accept=".tnmt,.json,application/json" hidden></label>
    ${saveMsg ? `<p class="good">${esc(saveMsg)}</p>` : ''}
    ${saveInfo ? `<p class="muted">Loaded ${esc(saveInfo.name || 'a save')} · ${esc(saveInfo.at)}</p>
      ${saveInfo.mods.length ? `<h3>Skills from mods</h3><div class="facts">${saveInfo.mods.map(m => `<span>${esc(m.n)} <small class="muted">mod</small></span><span><b>Level ${m.lvl}</b> <small class="muted">${m.n === 'Woodcutting' ? '' : fmt(m.xp) + ' XP'}</small></span>`).join('')}</div><p class="muted">Mod skills do not change recipe quality; they are shown for reference (Scavenging, Haggling, Stealth, Fraud and Woodcutting come from the Skills Pack).</p>` : ''}
      ${Object.keys(saveInfo.game).length ? `<h3>Other game skills</h3><div class="facts">${Object.entries(saveInfo.game).filter(([k]) => !names.includes(k)).sort().map(([k, v]) => `<span>${esc(k)}</span><span>Level ${v}</span>`).join('')}</div>` : ''}` : ''}
    <p class="muted">The game caps skills at 15. Your levels are kept in this browser only.</p></div>`;
}
const RPmemo = {};
function realProfit(rid) {
  if (RPmemo[rid]) return RPmemo[rid];
  const r = X.R[rid], ing = r[7].map(x => Object.assign({ id: x[0], n: x[1] }, buyCost(x[0], x[1])));
  const q = qualityOf(r), outs = r[8].map(x => { const b = buyersOf(x[0])[0], qv = hasQuality(x[0]) ? qualityValue(q) : 1; return { id: x[0], n: x[1], p: b ? Math.max(1, Math.round(b.p * qv)) : 0, v: b ? b.v : null, q: qv !== 1 || hasQuality(x[0]) ? q : null }; });
  const cost = ing.reduce((a, x) => a + x.p * x.n, 0), rev = outs.reduce((a, x) => a + x.p * x.n, 0) * (1 - (r[5] || 0)), profit = rev - cost;
  return RPmemo[rid] = { q, ing, outs, cost, rev, profit, hour: r[6] > 0 ? profit * 3600 / r[6] : null, sellable: outs.some(o => o.v), estimated: ing.some(x => !x.shop) };
}
const profitTxt = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n)) + ' OC';
const realText = rid => { const p = realProfit(rid); if (!p.sellable) return '<span class="muted">No shop buys what this makes.</span>';
  return `At shops: pay ≈ ${fmt(p.cost)} OC${p.estimated ? '*' : ''} · get ≈ ${fmt(p.rev)} OC · <b class="${p.profit >= 0 ? 'good' : 'bad'}">${profitTxt(p.profit)}</b>${p.hour != null ? ` · ${profitTxt(p.hour)}/h` : ''}`; };
function tradeBlock(rid) {
  const p = realProfit(rid), r = X.R[rid];
  const buy = p.ing.map(x => `<span>${il(x.id)} <small class="muted">× ${num(x.n)}</small></span><small>${x.shop ? `${fmt(x.p)} OC each at ${esc(x.v.n)} · ${esc(sceneName(x.v.sc))}` : `not sold · ≈ ${fmt(x.p)} OC`}</small>`);
  const sell = p.outs.map(x => `<span>${il(x.id)} <small class="muted">× ${num(x.n)}</small></span><small>${x.v ? `${fmt(x.p)} OC each at ${esc(x.v.n)} · ${esc(sceneName(x.v.sc))}` : 'no shop buys it'}</small>`);
  return `<h3>Trade at shops</h3><p>${realText(rid)}</p><h3>Buy the ingredients</h3>${ul(buy)}<h3>Sell what it makes</h3>${ul(sell)}
    <p class="muted">Real shop prices: base value × the shop's multiplier. ${p.estimated ? '* Ingredients no shop sells are counted at base value. ' : ''}Counts the ${Math.round((r[5] || 0) * 100)}% fail chance and the quality of what you make (${p.outs.some(o => o.q != null) ? 'quality ≈ ' + (+p.q.toFixed(2)) : 'these items have no quality'}, at ${skillSelect(r[3])}). Ignores the quality of bought ingredients and what the shop stocks that day.</p>`;
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
  const buy = new Map(), sell = new Map(), find = [], nosell = []; let bt = 0, st = 0;
  const add = (m, v, l) => { if (!m.has(v)) m.set(v, []); m.get(v).push(l); };
  for (const [id, n0] of Object.entries(raw)) { const n = Math.ceil(n0 - 1e-9), c = buyCost(id); if (!c.shop || (o && o.pref[id] === 'find')) { find.push([+id, n]); continue; } add(buy, c.v, { id: c.id, n, p: c.p }); bt += c.p * n; }
  for (const [id, n] of Object.entries(make)) { const b = buyersOf(+id)[0]; if (!b) { nosell.push(+id); continue; } add(sell, b.v, { id: +id, n, p: b.p }); st += b.p * n; }
  if (!buy.size && !sell.size) return '';
  const stop = (v, ls, k) => `<span>${vl(v)}<br>${ls.map(l => `<small class="muted">${il(l.id)} × ${num(l.n)} · ${fmt(l.p)} OC each = ${fmt(l.p * l.n)} OC</small>`).join('<br>')}</span>${mapBtn(v.sc, iname(ls[0].id), k, v.n)}`;
  let h = `<h3>Trade run</h3><p>Buy ≈ ${fmt(bt)} OC · sell ≈ ${fmt(st)} OC · <b class="${st - bt >= 0 ? 'good' : 'bad'}">${profitTxt(st - bt)}</b></p>`;
  if (buy.size) h += `<p class="muted">1. Buy, in this order:</p>${ul(tripOrder([...buy.keys()]).map(v => stop(v, buy.get(v), 'Show the shop')))}`;
  if (sell.size) h += `<p class="muted">2. Sell, in this order:</p>${ul(tripOrder([...sell.keys()]).map(v => stop(v, sell.get(v), 'Show the shop')))}`;
  if (find.length) h += `<p class="muted">To find, not buy (left out of the cost and the route): ${find.map(([id, n]) => `${il(id)} × ${num(n)}`).join(', ')}</p>`;
  if (nosell.length) h += `<p class="muted">No shop buys: ${nosell.map(il).join(', ')}</p>`;
  return h + `<p class="muted">Cheapest shop for each ingredient, best price for each product. Item quality, stolen goods and daily stock are ignored.</p>`;
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
function shopSet(rid, n) { const L = shopGet(); n = Math.max(0, Math.min(9999, Math.floor(+n) || 0)); if (n) L[rid] = n; else delete L[rid]; shopSave(); shopBadge(); }
const qtyBtn = (rid, d) => `<button type="button" data-shop="${rid}" data-d="${d}" aria-label="${d > 0 ? 'Add ' + d : 'Remove ' + -d}">${d > 0 ? '+' + d : '−' + -d}</button>`;
const qtyCtl = (rid, n) => `<span class="qty">${[-100, -10, -1].map(d => qtyBtn(rid, d)).join('')}<input type="number" class="qin" min="0" max="9999" step="1" inputmode="numeric" value="${n}" data-shopset="${rid}" aria-label="Quantity">${[1, 5, 10, 100].map(d => qtyBtn(rid, d)).join('')}<button type="button" class="x" data-shop="${rid}" data-d="-99999" aria-label="Remove from the list">✕</button></span>`;
function shopChange(rid, d) { const L = shopGet(), n = Math.max(0, (L[rid] || 0) + d); if (n) L[rid] = n; else delete L[rid]; shopSave(); shopBadge(); }
let optMem = null;
const shopOpt = () => {
  if (!optMem) { try { optMem = JSON.parse(localStorage.getItem('obs-shop-opt') || 'null'); } catch (e) {} if (!optMem || typeof optMem !== 'object') optMem = {}; }
  if (!['all', 'missing', 'off'].includes(optMem.mode)) optMem.mode = 'all'; if (!optMem.pref || typeof optMem.pref !== 'object') optMem.pref = {};   // pref: item id -> 'craft', 'buy' or 'find' (you will find it, not buy it), overriding the default
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
const wantCraft = (id, opt) => { const p = opt.pref[id]; return p === 'craft' || (opt.mode !== 'off' && p !== 'buy' && p !== 'find' && (opt.mode === 'all' || (!X.placed.has(id) && !X.sold.has(id)))); };
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
  ? `<span class="shopctl"><span>On the list</span>${qtyCtl(rid, n)}</span>`
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
    case 'upgrades': return TU.cats.map((c, i) => [i, c[1], c[0] + ' · ' + (c[3].length - 1) + ' tiers', '']).filter(r => m(r[1]) || m(r[2]));
    case 'recipes': return DB.recipes.filter(r => (m(r[1]) || r[8].some(x => m(iname(x[0])))) && (!V.f || r[2] === V.f) && (V.sort !== 'rprofit' && V.sort !== 'rhour' || realProfit(r[0]).sellable))
      .sort(V.sort === 'rprofit' ? (a, b) => realProfit(b[0]).profit - realProfit(a[0]).profit || a[1].localeCompare(b[1])
        : V.sort === 'rhour' ? (a, b) => (realProfit(b[0]).hour ?? -1e12) - (realProfit(a[0]).hour ?? -1e12) || a[1].localeCompare(b[1])
        : V.sort === 'profit' ? (a, b) => X.RC[b[0]].profit - X.RC[a[0]].profit || a[1].localeCompare(b[1])
        : V.sort === 'cost' ? (a, b) => X.RC[a[0]].cost - X.RC[b[0]].cost || a[1].localeCompare(b[1]) : (a, b) => a[1].localeCompare(b[1]))
      .map(r => [r[0], r[1], V.sort === 'rprofit' ? profitTxt(realProfit(r[0]).profit) : V.sort === 'rhour' ? (realProfit(r[0]).hour == null ? '–' : profitTxt(realProfit(r[0]).hour) + '/h') : V.sort === 'profit' ? (X.RC[r[0]].profit >= 0 ? '+' : '−') + fmt(Math.abs(X.RC[r[0]].profit)) + ' OC' : V.sort === 'cost' ? fmt(X.RC[r[0]].cost) + ' OC' : r[2], rIco(r[0])]);
    case 'vendors': return DB.vendors.filter(v => m(v.n) || m(v.o || '') || m(sceneName(v.sc)) || (q.length > 2 && (v.t && m(v.t))))
      .filter(v => !V.f || (V.f === 'items' ? (v.t || v.i) : V.f === 'buys' ? v.b : V.f === 'furniture' ? (v.fs || v.fb) : V.f === 'vending' ? /vending|soda fountain/i.test(v.n) : true))
      .sort((a, b) => a.n.localeCompare(b.n) || sceneName(a.sc).localeCompare(sceneName(b.sc)))
      .map(v => [v.key, v.n, sceneName(v.sc), vIco(v)]);
    case 'tenants': return RT.r.filter(r => (m(r.n) || r.w.some(m) || r.at.some(m)) && (!V.f || (V.f === 'OC' ? r.oc : V.f === 'RM' ? r.rm : r.sz.includes(V.f))))
      .sort((a, b) => a.n.localeCompare(b.n)).map(r => [r.n, r.n, rentLine(r), pIco(r.n)]);
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
  if (V.sec === 'upgrades') return '';
  if (V.sec === 'tenement') return opt(X.itemCats, 'All categories') + sort;
  if (V.sec === 'recipes') return opt(X.rTypes, 'All stations') + `<select id="dbSort" aria-label="Sort"><option value="name">A–Z</option>${so('rprofit', 'Best profit at shops')}${so('rhour', 'Best profit per hour')}${so('profit', 'Best craft profit (base values)')}${so('cost', 'Cheapest ingredients')}</select>`;
  if (V.sec === 'tenants') return `<select id="dbF" aria-label="Filter tenants"><option value="">All tenants</option>${[['Small', 'Accept a small apartment'], ['Medium', 'Accept a medium apartment'], ['Large', 'Accept a large apartment'], ['OC', 'Pay OC'], ['RM', 'Pay RM']].map(([k, t]) => `<option value="${k}" ${V.f === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  if (V.sec === 'furniture') return opt(X.fCats, 'All categories') + sort;
  if (V.sec === 'vendors') return `<select id="dbF"><option value="">All vendors</option>${[['items', 'Sell items'], ['buys', 'Buy from you'], ['furniture', 'Furniture'], ['vending', 'Vending machines']].map(([k, t]) => `<option value="${k}" ${V.f === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return '';
}
const INTRO = {
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
  if (V.sec === 'notes' || V.sec === 'list' || V.sec === 'skills') { el.innerHTML = head + `<p class="dbintro">${INTRO[V.sec]}</p>`; return; }
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
  let h = `<div class="card"><div class="dbhead">${iIco(id, 1)}<div><h2>${esc(t)}</h2><div class="sub">ID ${id} · ${val} OC · stacks to ${stack}${X.craftCost[id] != null ? ' · costs ≈ ' + fmt(X.craftCost[id]) + ' OC to make' : ''}${sellersOf(+id)[0] ? ' · buy from ' + fmt(sellersOf(+id)[0].p) + ' OC' : ''}${buyersOf(+id)[0] ? ' · sell up to ' + fmt(buyersOf(+id)[0].p) + ' OC' : ''}</div></div></div>`;
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
    const per = {}; for (const [n] of placed) for (const [slug, k] of X.tableScenes[n]) per[slug] = (per[slug] || 0) + k;
    const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 8);
    h += `<p class="muted">Best places to look:</p><div class="tags">${top.map(([slug, k]) => mapBtn(slug, t, sceneName(slug) + ' · ' + k)).join('')}</div>`;
    h += ul(Object.entries(kinds).map(([n, k]) => `<span>${esc(n.trim())} <em class="${k.has('c') ? '' : 'rare'}">${k.size > 1 ? 'common &amp; rare' : k.has('r') ? 'rare' : 'common'}</em></span><small>${X.tableCount[n]} placed</small>`))
       + mapBtn(best, t, 'Show where on the map');
  } else h += '<p class="muted">Not in any placed container.</p>';
  if (unplaced.length) h += `<p class="muted">Also listed in ${[...new Set(unplaced.map(([n]) => n.trim()))].map(esc).join(', ')}, which ${unplaced.length > 1 ? 'are' : 'is'} not placed in any scene on the map (spawned at runtime, or unused).</p>`;
  const sv = sellersOf(+id), bv = buyersOf(+id);
  h += `<h3>Where to buy · ${sv.length}</h3>${sv.length ? `<p class="muted">Cheapest first. The shop's price is the base value × its multiplier.</p>` : ''}${ul(sv.map((x, i) => vl(x.v) + ` <small class="${i ? 'muted' : 'good'}">· ${fmt(x.p)} OC</small>`))}${sv.length ? mapBtn(sv[0].v.sc, t, 'Show the cheapest shop', sv[0].v.n) : ''}`;
  h += `<h3>Where to sell · ${bv.length}</h3>${bv.length ? `<p class="muted">Best price first.</p>` : ''}${ul(bv.map((x, i) => vl(x.v) + ` <small class="${i ? 'muted' : 'good'}">· ${fmt(x.p)} OC</small>` + (x.v.bs ? ' <small class="muted">· buys stolen</small>' : '')))}${bv.length ? mapBtn(bv[0].v.sc, t, 'Show the best buyer', bv[0].v.n) : ''}`;
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
  return `<div class="craft"><div class="ch">${rl(rid)}${more}</div><div class="fl">${inp.map(chipOf).join('')}</div>
    <div class="cm muted">${esc(skill)}${minS ? ' ' + minS + '+' : ''} · ${hrs(time)} · ${Math.round(fail * 100)}% fail</div>
    <div class="cm">${econText(rid)}</div><div class="cm">${realText(rid)}</div>${shopBtn(rid)}</div>`;
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
    <h3>Details</h3><div class="facts"><span>Skill</span><span>${esc(skill)}${minS ? ' · min ' + minS : ''}</span><span>Fail chance</span><span>${Math.round(fail * 100)}%</span>
    <span>Time</span><span>${hrs(time)}</span><span>Recipe needed</span><span>${req ? 'yes, learn it first' : 'no'}</span><span>Value</span><span>${econText(id)}</span>
    ${cond.length ? `<span>Station must be</span><span>${cond.map(esc).join(', ')}</span>` : ''}${tags.length ? `<span>Learned from</span><span>${tags.map(esc).join(', ')}</span>` : ''}</div>`;
  h += tradeBlock(id);
  if (inp.length) { const sl = bestSceneFor(inp.map(x => x[0]));
    h += `<h3>Where to find the ingredients</h3>${sl ? mapBtn(sl, inp.map(x => iname(x[0])).join(' | '), 'Find the ingredients on the map') : '<p class="muted">None of them is in a placed container.</p>'}<p class="muted">Lights up every container, shop and workstation that has any of ${inp.length > 1 ? 'these ' + inp.length + ' ingredients' : 'this ingredient'}, starting in the place with the most.</p>`; }
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
  if (!parts.length) parts.push('not found in the world data');
  return { parts, btn };
}
let modCode = '';
function listCard() {
  const L = shopGet(), o = shopOpt(), up = n => Math.ceil(n - 1e-9);
  const rids = Object.keys(L).filter(id => X.R[id]).sort((a, b) => X.R[a][1].localeCompare(X.R[b][1]));
  if (!rids.length) return `<div class="card"><h2>Shopping list</h2><p class="muted">Nothing here yet. Open a recipe, or the “How to craft” box on an item, and press “+ Shopping list”. The list adds up every ingredient, including what it takes to craft the ingredients, and tells you where to find it. It is saved in this browser only.</p></div>`;
  const need = {}, make = {}; let cost = 0, worth = 0;
  for (const rid of rids) { const n = L[rid], r = X.R[rid]; r[7].forEach(x => { need[x[0]] = (need[x[0]] || 0) + x[1] * n; }); r[8].forEach(x => { make[x[0]] = (make[x[0]] || 0) + x[1] * n; }); cost += X.RC[rid].cost * n; worth += X.RC[rid].worth * n; }
  for (const id of Object.keys(need)) { if (make[id]) need[id] = Math.max(0, need[id] - make[id]); if (!need[id]) delete need[id]; }   // a recipe on the list may already make what another needs
  const E = expandNeeds(need, o), byName = a => a.sort((x, y) => iname(x[0]).localeCompare(iname(y[0])));
  const rawCost = Object.entries(E.raw).reduce((a, [id, n]) => a + (o.pref[id] === 'find' ? 0 : X.unit(id) * up(n)), 0);
  const crafted = E.order.length;
  modCode = 'OBSLIST:' + JSON.stringify({ v: 1, recipes: rids.map(r => [X.R[r][1], L[r]]), steps: E.order.map(r => [X.R[r][1], up(E.steps[r]), E.outs[r]]), raw: Object.entries(E.raw).map(([id, n]) => [+id, up(n)]) });
  return `<div class="card"><h2>Shopping list</h2><div class="sub">${rids.length} recipe${rids.length > 1 ? 's' : ''} · ${o.mode !== 'off' || crafted ? 'raw materials' : 'ingredients'} ≈ ${fmt(o.mode !== 'off' || crafted ? rawCost : cost)} OC · worth ≈ ${fmt(worth)} OC</div>
    <label class="shopopt">Ingredients <select data-shopmode aria-label="How far to break ingredients down"><option value="all" ${o.mode === 'all' ? 'selected' : ''}>Break down everything craftable</option><option value="missing" ${o.mode === 'missing' ? 'selected' : ''}>Only what can't be found or bought</option><option value="off" ${o.mode === 'off' ? 'selected' : ''}>Don't break down</option></select></label>
    <h3>Recipes</h3>${rids.map(rid => `<div class="shoprow"><span class="rn">${rl(rid)}</span>${qtyCtl(rid, L[rid])}</div>`).join('')}
    ${crafted ? `<h3>Craft these first · ${crafted}</h3>${ul(E.order.map(rid => { const out = E.outs[rid], per = X.R[rid][8].find(x => x[0] === out)[1], b = up(E.steps[rid]);
      return `<span>${rl(rid)} <small class="muted">× ${b} → ${num(per * b)} ${esc(iname(out))}</small></span><button type="button" class="shopbtn mini" data-pref="${out}:buy" title="Find or buy it instead of crafting it">Find or buy instead</button>`; }))}` : ''}
    <h3>${o.mode !== 'off' || crafted ? 'Get these' : 'You will need'}</h3>${ul(byName(Object.entries(E.raw)).map(([id, n]) => { const w = whereIs(id), back = bestRecipe(+id) && !(DB.items[id] && DB.items[id][6].length);
      return `<span>${il(id)} <small class="muted">× ${num(up(n))}</small><br><small class="muted">${w.parts.join(' · ')}</small></span>${w.btn}${back ? `<button type="button" class="shopbtn mini" data-pref="${id}:craft">Craft it instead</button>` : ''}${o.pref[id] === 'find' ? `<button type="button" class="shopbtn mini" data-pref="${id}:buy" title="Count it as bought again">Buy it instead</button>` : `<button type="button" class="shopbtn mini" data-pref="${id}:find" title="You will find it, not buy it: it stays out of the cost and the shopping route">Find it instead</button>`}`; }))}
    <h3>You will make</h3>${ul(byName(Object.entries(make)).map(([id, n]) => `<span>${il(id)}</span><small>× ${num(n)}</small>`))}
    ${tradeRun(E.raw, make, o)}
    <button type="button" class="dbmore" data-copymod>Copy list for the mod</button> <button type="button" class="dbmore" data-shop="clear">Clear the list</button>
    <p class="muted">In the game, open the Loot Map panel and press “Paste list from the website”: the mod shows what you still need and where to find it.</p></div>`;
}
function notesCard() {
  return `<div class="card"><h2>Data notes</h2><div class="sub">${DB.notes.length} findings</div>${ul(DB.notes.map(esc))}
    <p class="muted">Regenerated by <code>tools/build_db.py</code> after each game patch.</p></div>`;
}
const missing = () => `<div class="card"><h2>Not found</h2><p class="muted">This entry isn't in the current data.</p></div>`;
function renderDetail() {
  const el = $('#dbDetail'), k = V.key, bare = V.sec === 'notes' || V.sec === 'list' || V.sec === 'skills', tbl = tableOn();
  const back = `<a class="dbback${tbl && V.sec === 'items' ? ' show' : ''}" href="#/db/${bare ? 'items' : V.sec}">${tbl && V.sec === 'items' ? '← Back to the table' : '← Back to the list'}</a>`;
  const home = { upgrades: 'categories', items: 'items', recipes: 'recipes', vendors: 'vendors', tenants: 'tenants', furniture: 'pieces of furniture' };
  if (V.sec === 'notes') el.innerHTML = notesCard();
  else if (V.sec === 'list') el.innerHTML = listCard();
  else if (V.sec === 'skills') el.innerHTML = skillsCard();
  else if (k == null && tbl) el.innerHTML = tableCard();
  else if (k == null) el.innerHTML = V.sec === 'tenement' ? tenementHome() : V.sec === 'upgrades' ? upgradesHome() : V.sec === 'vendors' ? vendorsHome() : `<div class="card"><h2>${esc(SECTIONS.find(s => s[0] === V.sec)[1])}</h2><p class="muted">${rows().length} ${home[V.sec]}. Pick one on the left.</p></div>`;
  else el.innerHTML = { upgrades: upgradeCard, items: itemCard, tenement: itemCard, recipes: recipeCard, vendors: vendorCard, tenants: tenantCard, furniture: furnCard }[V.sec](k);
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
  const changed = s !== V.sec || !V.init, bare = s === 'notes' || s === 'list' || s === 'skills';
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
  if (e.target.closest('[data-skillreset]')) { skillLv = {}; try { localStorage.removeItem('obs-skills'); } catch (_) {} for (const k in RPmemo) delete RPmemo[k]; renderDetail(); return; }
  const cm = e.target.closest('[data-copymod]');
  if (cm) { const done = () => { cm.textContent = 'Copied ✓'; setTimeout(() => { cm.textContent = 'Copy list for the mod'; }, 1800); };
    try { navigator.clipboard.writeText(modCode).then(done, () => fallbackCopy(modCode, done)); } catch (_) { fallbackCopy(modCode, done); } return; }
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
  const m = e.target.closest('[data-map]'); if (m) { e.preventDefault(); leave(m.dataset.map, m.dataset.q, m.dataset.focus); return; }
  const c = e.target.closest('#dbDetail [data-cat]');
  if (c) { e.preventDefault(); V.sec = 'items'; V.q = ''; V.f = c.dataset.cat; V.e = ''; V.e2 = ''; V.min = ''; if (['eh', 'el', 'ep'].includes(V.sort)) V.sort = 'name'; V.key = null; history.pushState(null, '', '#/db/items'); renderSide(); renderDetail(); }
});
// Region tabs leave the database and go back to the map.
$('#regionTabs').addEventListener('click', e => { if (isDb() && e.target.closest('[data-region]')) { document.body.classList.remove('dbmode'); $('#dbBtn').classList.remove('on'); history.replaceState(null, '', '#/'); } }, true);
function fallbackCopy(t, ok) { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); ok(); } catch (_) { } a.remove(); }
document.addEventListener('change', e => { const q = e.target.closest('[data-shopset]'); if (q) { shopSet(q.dataset.shopset, q.value); if (V.sec === 'list') renderDetail(); else document.querySelectorAll('.shopwrap').forEach(w => { if (w.dataset.rid === q.dataset.shopset) w.innerHTML = shopCtl(q.dataset.shopset); }); return; }
  const sk = e.target.closest('[data-skill]'); if (sk) { setSkill(sk.dataset.skill, +sk.value); return; }
  const si = e.target.closest('[data-skillin]'); if (si) { setSkill(si.dataset.skillin, Math.max(0, Math.min(15, Math.round(+si.value || 0)))); return; }
  const sf = e.target.closest('[data-saveinput]'); if (sf) { if (sf.files.length) loadSaves([...sf.files]); return; }
  const m = e.target.closest('[data-shopmode]'); if (m) { shopOpt().mode = m.value; optSave(); renderDetail(); } });
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

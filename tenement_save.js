// Reads the tenement part of an Obenseuer save (Globals.tnmt, plain JSON) for the tenement cost calculator.
// Works in the browser (window.TenSave) and in node (module.exports) so it can be tested against a real save.
(function (root) {
  // Folder of the upgrade asset -> the calculator's category name.
  const GEN = { 'Basement': 'Basement', 'Sauna': 'Basement sauna', 'Shrooms': 'Basement mushroom farm', 'Courtyard': 'Courtyard', 'Elevator': 'Elevator', 'Facade': 'Facade',
    'Mines': 'Mine', 'Greenhouse': 'Rooftop greenhouse', 'Sauna and pier': 'Sauna and pier', 'Stairwell': 'Stairwell', 'Electricity': 'Tenement electricity',
    'Heating': 'Tenement heating room', 'Water': 'Tenement plumbing', 'Workshop': 'Workshop' };
  const SMALL = { 'Balcony': 'Apartment balcony', 'Bathroom': 'Apartment bathroom', 'Electricity': 'Apartment electricity', 'Heating': 'Apartment heating', 'Kitchen': 'Apartment kitchen',
    'Walls': 'Apartment walls', 'Water': 'Apartment water' };
  const SHOP = { 'Bathroom': 'Shop bathroom', 'Walls': 'Shop walls' };

  // 'Assets/Content/Tenement/Upgrades/ApartmentSmall/Kitchen/Small-Kitchen-2-Shabby.asset' -> { cat: 'Apartment kitchen', tier: 2 }
  function pathInfo(p) {
    const m = /Upgrades\/([^/]+)\/([^/]+)\/[^/]*?-(\d+)-[^/]*\.asset$/.exec(p || '');
    if (!m) return null;
    const g = m[1], f = m[2], tier = +m[3];
    let cat = null;
    if (g === 'General') cat = GEN[f];
    else if (g === 'ApartmentSmall') cat = SMALL[f];
    else if (g === 'ApartmentLarge' && f === 'BalconyBack') cat = 'Apartment balcony (back)';
    else if (g === 'ApartmentShop') cat = SHOP[f];
    else if (g === 'ApartmentPlayer') cat = f === 'ExtensionFront' ? 'Apartment extension (front)' : f === 'ExtensionBack' ? 'Apartment extension (back)' : null;
    return cat ? { cat, tier } : null;
  }

  function niceName(key) { return String(key).replace(/([a-z])([A-Z])/g, '$1 $2'); }

  // Returns { character, slot, date, version, inst: { category: [tier, ...] }, stored: { contractor: { itemId: n } }, upgradesDone } or throws.
  function parse(text) {
    const j = JSON.parse(String(text).replace(/^﻿/, ''));
    const entry = j && Array.isArray(j.Data) ? j.Data.find(e => e && e.GUID === 'TenementController') : null;
    if (!entry || !entry.Data) throw new Error('This file has no tenement data. Pick Globals.tnmt from a save folder.');
    const t = entry.Data, ids = {};
    (function walk(o) { if (o && typeof o === 'object') { if (o.$id && o.addressableAssetPath) ids[o.$id] = o; for (const k in o) walk(o[k]); } })(t);
    const upg = u => { if (u && u.$ref) u = ids[u.$ref]; return u && u.addressableAssetPath ? pathInfo(u.addressableAssetPath) : null; };
    const inst = {};
    const add = u => { const i = upg(u); if (i) (inst[i.cat] = inst[i.cat] || []).push(i.tier); };
    const g = t.general || {};
    for (const k in g) if (/^current\w+Upgrade$/.test(k)) add(g[k]);
    for (const a of (t.apartments || [])) for (const k in a) if (/^current\w+Upgrade$/.test(k)) add(a[k]);
    const stored = {};
    const rs = t.resourceStorageSnapshotsByContractor || {};
    for (const c in rs) { const o = stored[niceName(c)] = {}; for (const kv of (Array.isArray(rs[c]) ? rs[c] : [])) if (kv && kv.Value > 0) o[kv.Key] = (o[kv.Key] || 0) + kv.Value; }
    return { character: j.CharacterName || '', slot: j.SaveName || '', date: j.Date || '', version: j.ApplicationVersion || '', inst, stored, upgradesDone: t.upgradesDone | 0 };
  }

  const api = { parse, pathInfo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TenSave = api;
})(typeof window !== 'undefined' ? window : globalThis);

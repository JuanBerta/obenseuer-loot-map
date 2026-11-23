using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using BepInEx;
using BepInEx.Configuration;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ObenseuerLootMap
{
    // 0.6.0: door lock states, emptied-container memory, value / effect search, shopping list, route planner, shop hours and prices.
    public partial class LootMapPlugin
    {
        ConfigEntry<bool> cfgHideEmpty, cfgShopHud, cfgMoreTools;

        void BindToolsConfig()
        {
            cfgHideEmpty = Config.Bind("Filters", "HideEmptiedContainers", false, "Hide containers you have already emptied (they are shown hollow otherwise).");
            cfgShopHud = Config.Bind("Display", "ShoppingListOnScreen", true, "Show the shopping list (from the website) as a checklist on screen.");
            cfgMoreTools = Config.Bind("Display", "ShowMoreTools", true, "Show the value / effect / shopping list / route tools in the panel.");
        }

        void ToolsLoad() { LoadLooted(); LoadShopList(); }

        float nextToolsTick, nextLootedSave;
        void ToolsTick()
        {
            if (lootedDirty && Time.unscaledTime > nextLootedSave) SaveLooted();
            if (Time.unscaledTime < nextToolsTick) return;
            nextToolsTick = Time.unscaledTime + 1f;
            if (shopList != null)
            {
                RefreshHave();
                if (trackList) ApplyTrackedList();
            }
        }

        // ---------------- doors ----------------
        internal class LiveDoor { public Vector3 pos; public string state; }   // state: null = unlocked
        internal List<LiveDoor> liveDoors = new List<LiveDoor>();

        // open / pick (lockpickable) / key / locked (neither: opens another way) / blocked / closed (not in this game version)
        internal string DoorState(DoorData d, string scene)
        {
            if (d.open == 0) return "closed";
            if (d.lk == "blocked") return "blocked";
            if (scene != null && scene == CurrentScene && liveScene == scene && liveDoors != null)
            {
                var at = new Vector3(d.x, d.y, d.z); LiveDoor best = null; float bd = 9f;
                foreach (var l in liveDoors) { float s = (l.pos - at).sqrMagnitude; if (s < bd) { bd = s; best = l; } }
                if (best != null) return best.state ?? "open";
            }
            return string.IsNullOrEmpty(d.lk) ? "open" : d.lk;
        }
        internal static Color DoorColor(string st)
        {
            switch (st)
            {
                case "pick": return new Color32(107, 63, 160, 255);
                case "key": return new Color32(44, 111, 166, 255);
                case "locked": return new Color32(176, 101, 26, 255);
                case "blocked": case "closed": return new Color32(115, 110, 100, 255);
                default: return new Color(0.1f, 0.09f, 0.08f);
            }
        }
        internal static string DoorText(string st)
        {
            switch (st)
            {
                case "pick": return Loc.T("locked: lockpick it");
                case "key": return Loc.T("locked: needs a key");
                case "locked": return Loc.T("locked: opens another way");
                case "blocked": return Loc.T("blocked, not accessible");
                case "closed": return Loc.T("not open in this game version");
                default: return Loc.T("open");
            }
        }
        internal static string DoorTag(string st)
        {
            switch (st)
            {
                case "pick": return " (" + Loc.T("lockpick") + ")";
                case "key": return " (" + Loc.T("key") + ")";
                case "locked": return " (" + Loc.T("locked") + ")";
                case "blocked": return " (" + Loc.T("blocked") + ")";
                default: return "";
            }
        }
        static float DoorPenalty(string st)
        {
            switch (st) { case "pick": return 40f; case "key": case "locked": return 90f; case "blocked": case "closed": return 100000f; default: return 0f; }
        }
        static string DifficultyText(float df) => df < 0.25f ? Loc.T("easy") : df < 0.5f ? Loc.T("moderate") : df < 1f ? Loc.T("challenging") : Loc.T("difficult");

        void ScanLiveDoors(string scene)
        {
            var ld = new List<LiveDoor>();
            foreach (var dc in FindObjectsByType<DoorChangelevel>(FindObjectsInactive.Exclude, FindObjectsSortMode.None))
            {
                if (dc == null || dc.gameObject.scene.name != scene) continue;
                var lk = dc._Lock; string st = null;
                if (lk != null && lk.Locked) st = lk.Lockpickable ? "pick" : (lk.keyItem != null ? "key" : "locked");
                ld.Add(new LiveDoor { pos = dc.transform.position, state = st });
            }
            liveDoors = ld;
        }

        // ---------------- emptied containers (remembered across places) ----------------
        class LootedEntry { public int until, seen; }
        readonly Dictionary<string, LootedEntry> looted = new Dictionary<string, LootedEntry>();
        bool lootedDirty; internal int lootedVersion;
        static string LootedPath => Path.Combine(Paths.ConfigPath, "lootmap-looted.json");
        static string LKey(string scene, float x, float y, float z) => scene + "|" + Mathf.RoundToInt(x * 4) + "|" + Mathf.RoundToInt(y * 4) + "|" + Mathf.RoundToInt(z * 4);

        void LoadLooted()
        {
            try
            {
                if (!File.Exists(LootedPath)) return;
                var d = JsonConvert.DeserializeObject<Dictionary<string, int[]>>(File.ReadAllText(LootedPath));
                if (d != null) foreach (var kv in d) if (kv.Value != null && kv.Value.Length == 2) looted[kv.Key] = new LootedEntry { until = kv.Value[0], seen = kv.Value[1] };
            }
            catch (Exception e) { Logger.LogWarning("Could not read emptied containers: " + e.Message); }
        }
        void SaveLooted()
        {
            lootedDirty = false; nextLootedSave = Time.unscaledTime + 30f;
            try
            {
                int day = CurrentDay();
                foreach (var k in looted.Where(kv => day >= 0 && kv.Value.until <= day).Select(kv => kv.Key).ToList()) looted.Remove(k);
                File.WriteAllText(LootedPath, JsonConvert.SerializeObject(looted.ToDictionary(kv => kv.Key, kv => new[] { kv.Value.until, kv.Value.seen })));
            }
            catch (Exception e) { Logger.LogWarning("Could not save emptied containers: " + e.Message); }
        }
        void RecordLooted(string scene, PointData p, SpawnSettings ss)
        {
            if (p.k != "c") return;
            int day = CurrentDay(); if (day < 0) return;
            string key = LKey(scene, p.x, p.y, p.z);
            if (p.empty)
            {
                int until = ss != null && ss.respawnEnabled ? (ss.waitingSpawn ? ss.daySpawned + ss.timetospawn : day + 1) : int.MaxValue;
                if (until <= day) { if (looted.Remove(key)) { lootedDirty = true; lootedVersion++; } return; }
                if (!looted.TryGetValue(key, out var e) || e.until != until) { looted[key] = new LootedEntry { until = until, seen = day }; lootedDirty = true; lootedVersion++; }
            }
            else if (looted.Remove(key)) { lootedDirty = true; lootedVersion++; }
        }
        // For places you are not in: emptied the last time you were there, and not restocked yet.
        internal bool IsLooted(string scene, PointData p)
        {
            if (p.k != "c" || looted.Count == 0) return false;
            int day = CurrentDay(); if (day < 0) return false;
            return looted.TryGetValue(LKey(scene, p.x, p.y, p.z), out var e) && day >= e.seen && day < e.until;
        }
        internal bool IsEmptied(string scene, PointData p) => p.live ? p.empty : IsLooted(scene, p);

        // ---------------- find by value / effect ----------------
        static readonly int[] ValueSteps = { 50, 100, 200, 500, 1000, 2000 };
        static readonly int[] EffectSteps = { 1, 5, 10, 20, 40 };
        static readonly (string key, string label, int dir)[] Effects =
        {
            ("nut", "Nutrition", 1), ("thi", "Thirst", 1), ("dep", "Depression (lowers)", -1), ("hp", "Health", 1), ("hyg", "Hygiene", 1), ("alc", "Alcohol", 1),
        };
        int valueStep = 2, effectIdx, effectStep = 1;

        void SetIdSearch(HashSet<int> ids, string label)
        {
            trackList = false;
            if (ids == null || ids.Count == 0) { searchIds = null; searchIdsLabel = Loc.T("No items match"); return; }
            search = appliedSearch = lastTyped = "";
            searchIds = ids; searchIdsLabel = label;
        }
        void UseValueFilter()
        {
            int min = ValueSteps[valueStep];
            var ids = new HashSet<int>(Db.items.Keys.Select(int.Parse).Where(id => Db.ValueOf(id) >= min));
            SetIdSearch(ids, $"{Loc.T("Items worth")} ≥ {min} OC ({ids.Count})");
        }
        void UseEffectFilter()
        {
            var ef = Effects[effectIdx]; int min = EffectSteps[effectStep];
            var ids = new HashSet<int>(Db.items.Keys.Select(int.Parse).Where(id => ef.dir * Db.Stat(id, ef.key) >= min));
            SetIdSearch(ids, $"{Loc.T(ef.label)} ≥ {min} ({ids.Count})");
        }

        // ---------------- shopping list (from the website) ----------------
        class ShopList
        {
            public List<KeyValuePair<string, int>> recipes = new List<KeyValuePair<string, int>>();
            public List<KeyValuePair<string, int>> steps = new List<KeyValuePair<string, int>>();
            public List<KeyValuePair<int, int>> raw = new List<KeyValuePair<int, int>>();
        }
        ShopList shopList; bool trackList; string shopListMsg;
        readonly Dictionary<int, int> have = new Dictionary<int, int>();
        static string ShopListPath => Path.Combine(Paths.ConfigPath, "lootmap-shoplist.json");

        void LoadShopList()
        {
            try { if (File.Exists(ShopListPath)) shopList = ParseShopList(File.ReadAllText(ShopListPath)); }
            catch (Exception e) { Logger.LogWarning("Could not read the shopping list: " + e.Message); }
        }
        static ShopList ParseShopList(string text)
        {
            text = text.Trim();
            if (text.StartsWith("OBSLIST:")) text = text.Substring(8);
            var j = JObject.Parse(text); var l = new ShopList();
            foreach (var r in (JArray)(j["recipes"] ?? new JArray())) l.recipes.Add(new KeyValuePair<string, int>((string)r[0], (int)r[1]));
            foreach (var r in (JArray)(j["steps"] ?? new JArray())) l.steps.Add(new KeyValuePair<string, int>((string)r[0], (int)r[1]));
            foreach (var r in (JArray)(j["raw"] ?? new JArray())) l.raw.Add(new KeyValuePair<int, int>((int)r[0], (int)r[1]));
            if (l.raw.Count == 0 && l.recipes.Count == 0) throw new Exception("empty list");
            return l;
        }
        void PasteShopList()
        {
            try
            {
                var text = GUIUtility.systemCopyBuffer ?? "";
                shopList = ParseShopList(text);
                File.WriteAllText(ShopListPath, text.Trim().StartsWith("OBSLIST:") ? text.Trim().Substring(8) : text.Trim());
                shopListMsg = Loc.T("Shopping list loaded");
                RefreshHave(); trackList = false;
            }
            catch { shopListMsg = Loc.T("Nothing to paste: use \"Copy list for the mod\" on the website first"); }
        }
        void ClearShopList()
        {
            shopList = null; trackList = false; shopListMsg = null;
            try { if (File.Exists(ShopListPath)) File.Delete(ShopListPath); } catch { }
            if (searchIdsLabel != null && searchIdsLabel.StartsWith(Loc.T("Shopping list"))) ClearSearch();
        }
        void RefreshHave()
        {
            if (shopList == null) return;
            try
            {
                foreach (var r in shopList.raw)
                    have[r.Key] = Inventory.instance != null ? Mathf.FloorToInt((float)Inventory.instance.CountItemsDialogue(r.Key, false, true, -1.0, false)) : 0;
            }
            catch { }
        }
        int Have(int id) => have.TryGetValue(id, out var n) ? n : 0;
        List<KeyValuePair<int, int>> Missing() => shopList == null ? new List<KeyValuePair<int, int>>() : shopList.raw.Where(r => Have(r.Key) < r.Value).ToList();

        void ApplyTrackedList()
        {
            var miss = Missing();
            if (miss.Count == 0) { trackList = false; if (searchIdsLabel != null && searchIdsLabel.StartsWith(Loc.T("Shopping list"))) ClearSearch(); shopListMsg = Loc.T("You have everything on the list"); return; }
            var ids = new HashSet<int>(miss.Select(m => m.Key));
            if (searchIds == null || !searchIds.SetEquals(ids))
            {
                search = appliedSearch = lastTyped = "";
                searchIds = ids; searchIdsLabel = $"{Loc.T("Shopping list")}: {miss.Count} {Loc.T("items missing")}";
            }
        }
        void StartTrackingList()
        {
            if (shopList == null) return;
            RefreshHave(); trackList = true; ApplyTrackedList();
            if (searchIds == null) trackList = false;
        }

        GUIStyle hudStyle;
        void DrawShopHud()
        {
            if (shopList == null || !cfgShopHud.Value || !cfgEnabled.Value) return;
            if (hudStyle == null || hudStyle.normal.background == null)
                hudStyle = new GUIStyle(doorStyle) { fontSize = 12, alignment = TextAnchor.UpperLeft, padding = new RectOffset(9, 9, 6, 6), wordWrap = false, richText = true };
            var sb = new StringBuilder($"<b>{Loc.T("Shopping list")}</b>\n");
            int shown = 0, done = 0;
            foreach (var r in shopList.raw.OrderBy(r => Have(r.Key) >= r.Value).ThenBy(r => Db.ItemName(r.Key)))
            {
                bool ok = Have(r.Key) >= r.Value; if (ok) done++;
                if (shown++ >= 12) continue;
                sb.Append(ok ? $"<color=#7fd88a>✔ {Db.ItemName(r.Key)}  {Have(r.Key)}/{r.Value}</color>\n" : $"{Db.ItemName(r.Key)}  <b>{Have(r.Key)}/{r.Value}</b>\n");
            }
            if (shopList.raw.Count > 12) sb.Append($"<color=#a8a08a>+{shopList.raw.Count - 12} {Loc.T("more")} ({done}/{shopList.raw.Count} ✔)</color>\n");
            foreach (var s in shopList.steps.Take(4)) sb.Append($"<color=#d9c7a2>⚒ {s.Key} ×{s.Value}</color>\n");
            var content = new GUIContent(sb.ToString().TrimEnd());
            var sz = hudStyle.CalcSize(content);
            GUI.Box(new Rect(14, 150, sz.x + 6, sz.y + 2), content, hudStyle);
        }

        void DrawShopListPanel()
        {
            GUILayout.Label(Loc.T("Shopping list"), headStyle);
            if (shopList != null)
            {
                var miss = Missing();
                GUILayout.Label($"{shopList.recipes.Count} {Loc.T("recipes")}: {string.Join(", ", shopList.recipes.Take(3).Select(r => r.Key + " ×" + r.Value))}{(shopList.recipes.Count > 3 ? " …" : "")}", smallStyle);
                GUILayout.Label(miss.Count == 0 ? "<color=#7fd88a>✔ " + Loc.T("You have everything on the list") + "</color>" : $"<b>{miss.Count}</b> {Loc.T("items missing")}", labelStyle);
                GUILayout.BeginHorizontal();
                if (miss.Count > 0 && GUILayout.Button(trackList ? Loc.T("Highlighting missing items") : Loc.T("Find the missing items"), btnStyle)) StartTrackingList();
                if (GUILayout.Button(Loc.T("Clear list"), btnStyle)) ClearShopList();
                GUILayout.EndHorizontal();
                cfgShopHud.Value = GUILayout.Toggle(cfgShopHud.Value, " " + Loc.T("Show the list on screen"));
            }
            if (GUILayout.Button(shopList == null ? Loc.T("Paste list from the website") : Loc.T("Paste a new list"), btnStyle)) PasteShopList();
            if (shopListMsg != null) GUILayout.Label(shopListMsg, smallStyle);
        }

        // ---------------- route planner ----------------
        internal void PlanRoute()
        {
            var cur = CurrentScene; var cam = Camera.main; if (cur == null || cam == null) return;
            var me = cam.transform.position - Vector3.up * 1.6f;
            var cand = new List<GuideTarget>(); bool route = TrashRoute;
            foreach (var p in PointsOf(cur))
            {
                if (route ? (!IsTrash(p) || SearchedToday(p, cur)) : !PointMatches(p)) continue;
                if (p.live && p.empty) continue;
                if (cfgFreeOnly.Value && p.s == 1) continue;
                cand.Add(new GuideTarget { scene = cur, pos = new Vector3(p.x, p.y, p.z), label = p.t ?? p.n ?? Loc.T(p.k == "p" ? "Pickup spot" : "Container") });
            }
            if (!route && Db.scenes.TryGetValue(cur, out var sd))
                foreach (var v in sd.vendors) if (VendorMode(v) != 0) cand.Add(new GuideTarget { scene = cur, pos = new Vector3(v.x, v.y, v.z), label = v.n });
            if (cand.Count == 0) { shopListMsg = Loc.T("Nothing to visit here"); return; }
            var order = new List<GuideTarget>(); var at = me;
            while (cand.Count > 0 && order.Count < 12)
            {
                int bi = 0; float bc = float.MaxValue;
                for (int i = 0; i < cand.Count; i++)
                {
                    var d = cand[i].pos - at; float c = new Vector2(d.x, d.z).magnitude + Mathf.Abs(d.y) * 4f;
                    if (c < bc) { bc = c; bi = i; }
                }
                order.Add(cand[bi]); at = cand[bi].pos; cand.RemoveAt(bi);
            }
            routeQueue = order.Skip(1).ToList(); routeTotal = order.Count;
            guide = order[0]; arrivedAt = -1;
        }
        internal int RouteCandidates()
        {
            var cur = CurrentScene; if (cur == null || !(Searching || TrashRoute)) return 0;
            int n = 0; bool route = TrashRoute;
            foreach (var p in PointsOf(cur))
            {
                if (route ? (!IsTrash(p) || SearchedToday(p, cur)) : !PointMatches(p)) continue;
                if (p.live && p.empty) continue;
                n++;
            }
            if (!route && Db.scenes.TryGetValue(cur, out var sd)) n += sd.vendors.Count(v => VendorMode(v) != 0);
            return n;
        }

        // ---------------- shop prices and opening hours ----------------
        static readonly string[] DayNames = { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
        internal int HourKey()
        {
            try { var t = TimeOfDayAzure.instance.currentTimeAndDay; return t.weekDay * 24 + (int)t.hours; } catch { return -1; }
        }
        // null when the shop has no schedule; otherwise "Open until 18:00" / "Closed · opens Tue 8:00".
        internal string HoursText(VendorData v, out bool open)
        {
            open = true;
            if (v.h == null || v.h.Count < 7) return null;
            int wd; float hr;
            try { var t = TimeOfDayAzure.instance.currentTimeAndDay; wd = t.weekDay; hr = t.hours; } catch { return null; }
            if (wd < 0 || wd > 6) return null;
            bool Open(int d, float h) { int o = v.h[d][0], c = v.h[d][1]; if (o == c) return false; return o > c ? (h >= o || h < c) : (h >= o && h < c); }
            open = Open(wd, hr);
            if (open) return $"{Loc.T("Open until")} {v.h[wd][1]}:00";
            for (int k = 0; k <= 7; k++)
            {
                int d = (wd + k) % 7; int o = v.h[d][0], c = v.h[d][1];
                if (o == c) continue;
                if (k == 0 && hr >= o && o < c) continue;
                return $"{Loc.T("Closed")} · {Loc.T("opens")} {(k == 0 ? Loc.T("today") : Loc.T(DayNames[d]))} {o}:00";
            }
            return Loc.T("Closed");
        }
        internal bool IsClosedNow(VendorData v) { var t = HoursText(v, out var open); return t != null && !open; }
        internal int BuyPrice(VendorData v, int id) => v.bm > 0 ? Mathf.RoundToInt(Db.ValueOf(id) * v.bm) : -1;     // what you pay
        internal int SellPrice(VendorData v, int id) => v.sm > 0 ? Mathf.RoundToInt(Db.ValueOf(id) * v.sm) : -1;    // what you get
        // The single item a search is about (price comparison needs exactly one), or -1.
        internal int PriceItem()
        {
            var ids = MatchedIds;
            if (ids == null || ids.Count == 0 || ids.Count > 3 || searchIds != null) return -1;
            return ids.OrderByDescending(i => Db.ValueOf(i)).First();
        }

        // ---------------- panel ----------------
        void DrawToolsPanel()
        {
            cfgMoreTools.Value = GUILayout.Toggle(cfgMoreTools.Value, " " + Loc.T("More tools"));
            if (!cfgMoreTools.Value) return;
            cfgHideEmpty.Value = GUILayout.Toggle(cfgHideEmpty.Value, " " + Loc.T("Hide emptied containers"));
            GUILayout.Label(Loc.T("Find by value or effect"), headStyle);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("◀", btnStyle, GUILayout.Width(26))) valueStep = (valueStep + ValueSteps.Length - 1) % ValueSteps.Length;
            GUILayout.Label($"{Loc.T("Worth")} ≥ {ValueSteps[valueStep]} OC", labelStyle, GUILayout.Width(130));
            if (GUILayout.Button("▶", btnStyle, GUILayout.Width(26))) valueStep = (valueStep + 1) % ValueSteps.Length;
            if (GUILayout.Button(Loc.T("Find"), btnStyle)) UseValueFilter();
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("◀", btnStyle, GUILayout.Width(26))) effectIdx = (effectIdx + Effects.Length - 1) % Effects.Length;
            GUILayout.Label(Loc.T(Effects[effectIdx].label), labelStyle, GUILayout.Width(130));
            if (GUILayout.Button("▶", btnStyle, GUILayout.Width(26))) effectIdx = (effectIdx + 1) % Effects.Length;
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("−", btnStyle, GUILayout.Width(26))) effectStep = (effectStep + EffectSteps.Length - 1) % EffectSteps.Length;
            GUILayout.Label($"{Loc.T("at least")} {EffectSteps[effectStep]}", labelStyle, GUILayout.Width(130));
            if (GUILayout.Button("+", btnStyle, GUILayout.Width(26))) effectStep = (effectStep + 1) % EffectSteps.Length;
            if (GUILayout.Button(Loc.T("Find"), btnStyle)) UseEffectFilter();
            GUILayout.EndHorizontal();
            GUILayout.Space(4);
            DrawShopListPanel();
            int rc = RouteCandidates();
            if (routeTotal > 0 && guide != null)
            {
                if (GUILayout.Button(Loc.T("Stop route"), btnStyle)) ClearGuide();
            }
            else if (rc > 0 && GUILayout.Button($"{Loc.T("Plan a route")} ({Math.Min(rc, 12)} {Loc.T("stops")})", btnStyle)) PlanRoute();
        }
    }
}

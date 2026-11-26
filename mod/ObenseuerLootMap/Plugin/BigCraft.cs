using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ObenseuerLootMap
{
    // The Craft view of the big window: everything one item needs, step by step.
    public partial class LootMapPlugin
    {
        class CNode
        {
            public int id, depth, have, crafts; public float need; public string how, recipe, station, vendor; public float price;
            public List<CNode> kids = new List<CNode>();
        }

        int craftId = -1, craftBackTab, craftLastId = -1; string craftLastKey; string craftKey, craftQtyText = "1", craftPlanSig; int craftQty = 1;
        CNode craftRoot; readonly Dictionary<int, float> craftRaw = new Dictionary<int, float>(); readonly List<KeyValuePair<string, int>> craftSteps = new List<KeyValuePair<string, int>>();
        float craftCost; int craftPickFind = -1; bool craftPickList, craftPickMissing, craftPickCopy, craftPickStation, craftBack; int craftStep;
        Dictionary<int, List<string>> outIndex; Vector2 craftScroll;

        List<string> RecipesFor(int id)
        {
            if (outIndex == null)
            {
                outIndex = new Dictionary<int, List<string>>();
                foreach (var kv in Db.trade)
                {
                    var r = kv.Value; if (r.Count < 6) continue;
                    foreach (JArray x in (JArray)r[5])
                    {
                        int o = (int)x[0]; List<string> l;
                        if (!outIndex.TryGetValue(o, out l)) outIndex[o] = l = new List<string>();
                        if (!l.Contains(kv.Key)) l.Add(kv.Key);
                    }
                }
            }
            List<string> res; return outIndex.TryGetValue(id, out res) ? res : new List<string>();
        }

        (float p, VendorData v) CheapOf(int id)
        {
            var vendors = tradeVendors ??= Db.scenes.Values.SelectMany(sc => sc.vendors).ToList();
            (float p, VendorData v) c;
            if (tradeCheap.TryGetValue(id, out c)) return c;
            c = (-1f, null);
            foreach (var v in vendors) if (Db.Sells(v, id)) { var p = PayAt(v, id); if (c.v == null || p < c.p) c = (p, v); }
            return tradeCheap[id] = c;
        }

        int InvCount(int id)
        {
            try { return Inventory.instance != null ? Mathf.FloorToInt((float)Inventory.instance.CountItemsDialogue(id, false, true, -1.0, Db.IsLiquid(id))) : 0; } catch { return 0; }
        }

        void OpenCraft(int id, string key)
        {
            craftBackTab = bigTab; craftId = id; craftKey = key; craftStep = 0; craftPlanSig = null; craftScroll = Vector2.zero;
            var l = RecipesFor(id);
            if (craftKey == null && l.Count > 0) craftKey = l[0];
            craftLastId = craftId; craftLastKey = craftKey;
        }

        CNode Expand(int id, float need, int depth, HashSet<int> path, string forceKey)
        {
            var n = new CNode { id = id, need = need, depth = depth, have = InvCount(id) };
            if (forceKey == null && n.have >= Mathf.CeilToInt(need - 0.001f)) { n.how = "have"; return n; }
            var c = CheapOf(id);
            var keys = RecipesFor(id);
            if (forceKey == null && c.v != null) { n.how = "buy"; n.vendor = c.v.n; n.price = c.p; return n; }
            if ((forceKey != null || keys.Count > 0) && depth < 6 && !path.Contains(id))
            {
                string key = forceKey ?? keys[0];
                JArray r; if (!Db.trade.TryGetValue(key, out r)) { n.how = "find"; return n; }
                float outPer = 1f;
                foreach (JArray x in (JArray)r[5]) if ((int)x[0] == id) outPer = Mathf.Max(1f, (float)x[1]);
                n.crafts = Mathf.Max(1, Mathf.CeilToInt(need / outPer - 0.001f));
                n.how = "craft"; n.recipe = (string)r[0]; n.station = (string)r[1];
                var next = new HashSet<int>(path) { id };
                bool ammo = r.Count > 10 && Convert.ToInt32(r[10]) == 1;
                foreach (JArray x in (JArray)r[4])
                {
                    int inId = (int)x[0]; float per = (float)x[1] * n.crafts;
                    if (ammo) per /= Mathf.Max(1, Db.UsesOf(inId));
                    n.kids.Add(Expand(inId, per, depth + 1, next, null));
                }
                return n;
            }
            n.how = "find";
            return n;
        }

        void Collect(CNode n)
        {
            if (n.how == "craft")
            {
                foreach (var k in n.kids) Collect(k);
                craftSteps.Add(new KeyValuePair<string, int>(n.recipe, n.crafts));
            }
            else if (n.how == "buy" || n.how == "find")
            {
                float cur; craftRaw.TryGetValue(n.id, out cur); craftRaw[n.id] = cur + n.need;
            }
        }

        void BuildPlan()
        {
            string sig = craftId + "|" + craftKey + "|" + craftQty;
            if (sig == craftPlanSig && craftRoot != null) return;
            craftPlanSig = sig;
            craftRaw.Clear(); craftSteps.Clear(); craftCost = 0f;
            craftRoot = Expand(craftId, craftQty, 0, new HashSet<int>(), craftKey);
            Collect(craftRoot);
            foreach (var kv in craftRaw)
            {
                int need = Mathf.CeilToInt(kv.Value - 0.001f), miss = Mathf.Max(0, need - InvCount(kv.Key));
                var c = CheapOf(kv.Key);
                if (c.v != null) craftCost += c.p * miss;
            }
        }

        void DrawNode(CNode n)
        {
            Color tagColor = n.how == "have" ? BigGood : n.how == "buy" ? BigGold : n.how == "craft" ? BigInfo : BigMuted;
            string tag = n.how == "have" ? "HAVE" : n.how == "buy" ? "BUY" : n.how == "craft" ? "CRAFT" : "FIND";
            GUILayout.BeginHorizontal();
            GUILayout.Space(20 * n.depth);
            GUILayout.BeginHorizontal(bigCard);
            Badge(tag, tagColor);
            GUILayout.BeginVertical();
            GUILayout.Label(Mathf.CeilToInt(n.need - 0.001f) + "×  " + Db.AmtName(n.id) + (n.have > 0 && n.how != "have" ? "   <color=#9fdc8a>you have " + n.have + "</color>" : ""), bigName);
            string detail = n.how == "buy" ? n.vendor + "  ·  " + n.price.ToString("0.#") + " OC each"
                : n.how == "craft" ? n.recipe + "  ×" + n.crafts + "  ·  at " + n.station
                : n.how == "have" ? "already in your inventory"
                : "loot or pickup, not sold anywhere";
            GUILayout.Label(detail, smallStyle);
            GUILayout.EndVertical();
            GUILayout.FlexibleSpace();
            if ((n.how == "find" || n.how == "buy") && GUILayout.Button(Loc.T("Find"), btnStyle, GUILayout.Width(56))) craftPickFind = n.id;
            GUILayout.EndHorizontal();
            GUILayout.EndHorizontal();
            foreach (var k in n.kids) DrawNode(k);
        }

        string PlanText()
        {
            var sb = new StringBuilder();
            sb.AppendLine(craftQty + "× " + Db.ItemName(craftId));
            foreach (var s in craftSteps) sb.AppendLine("Craft " + s.Key + " ×" + s.Value);
            sb.AppendLine("Needs:");
            foreach (var kv in craftRaw) sb.AppendLine("  " + Mathf.CeilToInt(kv.Value - 0.001f) + "× " + Db.AmtName(kv.Key));
            return sb.ToString();
        }

        void BigCraft()
        {
            if (craftId < 0) return;
            var keys = RecipesFor(craftId);
            if ((craftKey == null || !Db.trade.ContainsKey(craftKey)) && keys.Count > 0) craftKey = keys[0];
            if (craftKey == null || !Db.trade.ContainsKey(craftKey)) { craftId = -1; return; }
            craftLastId = craftId; craftLastKey = craftKey;
            var r = Db.trade[craftKey];

            // Header: back, name, recipe picker.
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("◀  Back", bigTabOff)) craftBack = true;
            GUILayout.Space(8);
            GUILayout.Label(Db.ItemName(craftId), bigTitle, GUILayout.ExpandWidth(true));
            if (keys.Count > 1)
            {
                int idx = Mathf.Max(0, keys.IndexOf(craftKey));
                if (GUILayout.Button("◀", bigTabOff)) craftKey = keys[(idx + keys.Count - 1) % keys.Count];
                GUILayout.Label((idx + 1) + " / " + keys.Count, labelStyle, GUILayout.Width(50));
                if (GUILayout.Button("▶", bigTabOff)) craftKey = keys[(idx + 1) % keys.Count];
            }
            GUILayout.EndHorizontal();
            GUILayout.Label((string)r[0], smallStyle);
            GUILayout.Space(4);

            BuildPlan();

            // Facts as badges.
            string skill = r.Count > 6 ? (string)r[6] : "None";
            float mn = r.Count > 11 ? Convert.ToSingle(r[11]) : 0f, fail = (float)r[3], failNow = FailNow(r, fail);
            float lv = -1f;
            if (skill != "None") { PlayerStats.PlayerSkillType t; if (Enum.TryParse(skill, out t)) { try { lv = PlayerStats.instance.GetSkillWithEffects(t); } catch { } } }
            bool lowSkill = lv >= 0 && mn > lv;
            GUILayout.BeginHorizontal();
            Badge((string)r[1] + "  ·  quality " + EqOf((string)r[1]).ToString("0.##"), BigInfo);
            Badge(Mathf.Round((float)r[2] / 60f * 10f) / 10f + " min each", BigMuted);
            if (skill != "None") Badge(skill + (lv >= 0 ? " " + lv.ToString("0.#") : "") + (mn > 0 ? " / " + mn.ToString("0.#") : ""), lowSkill ? BigBad : BigGood);
            Badge("fail " + Mathf.Round(failNow * 100f) + "%", failNow > 0.25f ? BigBad : failNow > 0.05f ? BigGold : BigGood);
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            if (lowSkill) GUILayout.Label("<color=#e07a5f>Your skill is below this recipe's minimum, so it fails more and may give poor quality.</color>", bigWrap);

            // How many.
            GUILayout.Space(6);
            GUILayout.BeginHorizontal();
            GUILayout.Label("How many", labelStyle, GUILayout.Width(84));
            if (GUILayout.Button("−", bigTabOff, GUILayout.Width(34))) craftQty = Mathf.Max(1, craftQty - (Event.current.shift ? 10 : 1));
            GUI.SetNextControlName("lootmap_big_qty");
            string typed = GUILayout.TextField(craftQty.ToString(), 5, fieldStyle, GUILayout.Width(74));
            int parsed; if (int.TryParse(typed, out parsed)) craftQty = Mathf.Clamp(parsed, 1, 9999);
            if (GUILayout.Button("+", bigTabOff, GUILayout.Width(34))) craftQty = Mathf.Min(9999, craftQty + (Event.current.shift ? 10 : 1));
            GUILayout.Space(8);
            foreach (int q in new[] { 10, 50, 100 }) if (GUILayout.Button(q.ToString(), bigTabOff, GUILayout.Width(52))) craftQty = q;
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();

            craftScroll = GUILayout.BeginScrollView(craftScroll);
            Section("What you need");
            if (craftRoot != null) DrawNode(craftRoot);

            if (craftSteps.Count > 0)
            {
                Section("Crafting order");
                GUILayout.BeginVertical(bigCard);
                int i = 1; foreach (var s2 in craftSteps) GUILayout.Label("<b>" + i++ + ".</b>  " + s2.Key + "   ×" + s2.Value, bigWrap);
                GUILayout.EndVertical();
            }

            Section("Raw items to gather");
            GUILayout.BeginVertical(bigCard);
            foreach (var kv in craftRaw.OrderBy(k => Db.ItemName(k.Key)))
            {
                int need = Mathf.CeilToInt(kv.Value - 0.001f), got = InvCount(kv.Key); var c = CheapOf(kv.Key);
                bool ok = got >= need;
                GUILayout.BeginHorizontal();
                GUILayout.Label((ok ? "<color=#9fdc8a>✔  " : "") + Db.AmtName(kv.Key) + (ok ? "</color>" : ""), bigWrap, GUILayout.ExpandWidth(true));
                GUILayout.Label(got + " / " + need, ok ? bigWrap : bigWrap, GUILayout.Width(80));
                GUILayout.Label(c.v != null ? "<color=#d6b23c>" + c.v.n + " · " + c.p.ToString("0.#") + "</color>" : "<color=#9aa3b0>not sold</color>", bigWrap, GUILayout.Width(220));
                if (GUILayout.Button(Loc.T("Find"), btnStyle, GUILayout.Width(56))) craftPickFind = kv.Key;
                GUILayout.EndHorizontal();
            }
            GUILayout.EndVertical();
            GUILayout.EndScrollView();

            // Footer: totals and actions.
            GUILayout.BeginHorizontal(bigCard);
            GUILayout.Label("Still to buy, at the cheapest shops:  <b>" + craftCost.ToString("0.#") + " OC</b>", bigWrap, GUILayout.ExpandWidth(true));
            GUILayout.Label("Result worth about  <b>" + (Db.ValueOf(craftId) * craftQty) + " OC</b>", bigWrap, GUILayout.ExpandWidth(false));
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Use as shopping list", bigPrimary)) craftPickList = true;
            if (GUILayout.Button("Find missing items", btnStyle)) craftPickMissing = true;
            if (GUILayout.Button("Find a workstation", btnStyle)) craftPickStation = true;
            if (GUILayout.Button("Copy plan", btnStyle, GUILayout.Width(100))) craftPickCopy = true;
            GUILayout.EndHorizontal();
            if (shopListMsg != null) GUILayout.Label(shopListMsg, smallStyle);

            // Actions run after the layout is closed.
            if (craftPickCopy) { craftPickCopy = false; GUIUtility.systemCopyBuffer = PlanText(); shopListMsg = "Plan copied."; }
            if (craftPickList) { craftPickList = false; UsePlanAsList(r); }
            if (craftPickMissing)
            {
                craftPickMissing = false;
                var miss = new HashSet<int>(craftRaw.Where(kv => InvCount(kv.Key) < Mathf.CeilToInt(kv.Value - 0.001f)).Select(kv => kv.Key));
                if (miss.Count == 0) shopListMsg = "You have everything raw for this."; else { SetIdSearch(miss, "Missing for " + Db.ItemName(craftId)); SetBig(false); }
            }
            if (craftPickStation)
            {
                craftPickStation = false;
                search = appliedSearch = lastTyped = (string)r[0]; searchIds = null; searchIdsLabel = null; searchWarn = null;
                SetBig(false);
            }
            if (craftPickFind >= 0) { int f = craftPickFind; craftPickFind = -1; SetIdSearch(new HashSet<int> { f }, Db.ItemName(f)); SetBig(false); }
            if (craftBack) { craftBack = false; craftId = -1; bigTab = craftBackTab; }
        }

        void UsePlanAsList(JArray r)
        {
            try
            {
                var l = new ShopList();
                l.recipes.Add(new KeyValuePair<string, int>(Db.ItemName(craftId), craftQty));
                l.steps.AddRange(craftSteps);
                foreach (var kv in craftRaw) l.raw.Add(new KeyValuePair<int, int>(kv.Key, Mathf.CeilToInt(kv.Value - 0.001f)));
                shopList = l; trackList = false;
                var j = new JObject
                {
                    ["recipes"] = new JArray(l.recipes.Select(x => new JArray(x.Key, x.Value))),
                    ["steps"] = new JArray(l.steps.Select(x => new JArray(x.Key, x.Value))),
                    ["raw"] = new JArray(l.raw.Select(x => new JArray(x.Key, x.Value)))
                };
                File.WriteAllText(ShopListPath, j.ToString(Newtonsoft.Json.Formatting.None));
                RefreshHave();
                shopListMsg = "Shopping list set: it shows on screen as a checklist.";
            }
            catch (Exception e) { shopListMsg = "Could not set the list: " + e.Message; }
        }
    }
}

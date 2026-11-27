using System;
using System.Collections.Generic;
using System.Linq;
using BepInEx.Configuration;
using UnityEngine;
using Newtonsoft.Json.Linq;
using UnityEngine.SceneManagement;

namespace ObenseuerLootMap
{
    // 0.7.7: a big in-game window (Home key) with the website's Profit finder and item search, usable anywhere in the game.
    public partial class LootMapPlugin
    {
        ConfigEntry<KeyCode> cfgBigKey; ConfigEntry<float> cfgBigScale; float bigScaleApplied = -1f;
        int FS(int n) => Mathf.Max(8, Mathf.RoundToInt(n * (cfgBigScale != null ? cfgBigScale.Value : 1f)));   // text size of the big window
        bool bigOpen, bigTyping, bigPrevVis; int bigTab, bigSort; Vector2 bigScroll; string bigSearch = "";
        Rect bigRect; List<TradeRow> bigRows; GameObject bigHolder; CursorLockMode bigPrevLock; UnityEngine.EventSystems.EventSystem bigEvents;
        GUIStyle bigWrap;

        void BindBigConfig()
        {
            cfgBigKey = Config.Bind("General", "BigWindowKey", KeyCode.Home, "Key that opens the big Loot Map window (profit finder and item search) anywhere in the game. Set to None to turn it off.");
            cfgBigScale = Config.Bind("General", "BigWindowTextScale", 1f, new ConfigDescription("Text size of the big Loot Map window (1 = normal). Also changed with the A- / A+ buttons in the window.", new AcceptableValueRange<float>(0.8f, 1.8f)));
        }

        static bool InGameNow() { return PlayerStats.instance != null && SceneManager.GetActiveScene().name != "Main Menu"; }

        void SetBig(bool open)
        {
            if (open == bigOpen) return;
            if (open)
            {
                bigPrevLock = Cursor.lockState; bigPrevVis = Cursor.visible;
                try
                {
                    bigEvents = UnityEngine.EventSystems.EventSystem.current;
                    if (bigEvents != null && bigEvents.enabled) bigEvents.enabled = false; else bigEvents = null;
                }
                catch (Exception) { bigEvents = null; }
                try
                {
                    if (bigHolder == null) { bigHolder = new GameObject("LootMap_BigWindow"); DontDestroyOnLoad(bigHolder); }
                    if (GameController.instance != null) GameController.instance.ControlsDisabled(bigHolder, true, true);
                }
                catch (Exception e) { Logger.LogWarning("Big window controls: " + e.Message); }
                try { bigRows = BuildTrade(); } catch (Exception e) { bigRows = new List<TradeRow>(); Logger.LogWarning("Big window profit list: " + e.Message); }
            }
            else
            {
                try { if (bigEvents != null) bigEvents.enabled = true; } catch (Exception) { }
                bigEvents = null;
                try { if (bigHolder != null && GameController.instance != null) GameController.instance.ControlsEnabled(bigHolder); } catch (Exception) { }
                Cursor.lockState = bigPrevLock; Cursor.visible = bigPrevVis;
                GUI.FocusControl(null);
                bigTyping = false;
            }
            bigOpen = open;
        }

        void LateUpdate()
        {
            if (bigOpen) { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
        }

        // Called at the start of OnGUI.
        void BigGui()
        {
            if (cfgBigKey == null) return;
            Event e = Event.current;
            if (e.type == EventType.KeyDown && cfgBigKey.Value != KeyCode.None && e.keyCode == cfgBigKey.Value && !Typing && !bigTyping)
            {
                if (bigOpen) SetBig(false); else if (InGameNow()) SetBig(true);
                e.Use();
            }
            if (bigOpen && !InGameNow()) SetBig(false);
            if (!bigOpen) return;
            if (e.type == EventType.KeyDown && e.keyCode == KeyCode.Escape)
            {
                if (bigTyping) GUI.FocusControl(null); else SetBig(false);
                e.Use();
                return;
            }
            InitStyles();
            float w = Mathf.Min(780f, Screen.width - 60f), h = Mathf.Min(660f, Screen.height - 80f);
            if (bigRect.width < 1f) bigRect = new Rect((Screen.width - w) / 2f, (Screen.height - h) / 2f, w, h);
            GUI.depth = -600;
            bigRect = GUILayout.Window(1280266069, bigRect, DrawBig, "LOOT MAP", panelStyle, GUILayout.Width(w), GUILayout.Height(h));
        }

        // ---- Look ----
        GUIStyle bigCard, bigSection, bigTabOff, bigTabOn, bigPrimary, bigTitle, bigRule, bigName;
        readonly Dictionary<Color, GUIStyle> bigBadges = new Dictionary<Color, GUIStyle>();
        static readonly Color BigOchre = new Color(0.9f, 0.62f, 0.18f), BigGood = new Color(0.36f, 0.65f, 0.3f), BigBad = new Color(0.78f, 0.3f, 0.24f), BigInfo = new Color(0.3f, 0.45f, 0.62f), BigMuted = new Color(0.35f, 0.33f, 0.3f), BigGold = new Color(0.72f, 0.58f, 0.18f);

        static Texture2D BigBox(Color fill, Color edge)
        {
            var t = new Texture2D(6, 6) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Point };
            for (int y = 0; y < 6; y++) for (int x = 0; x < 6; x++) t.SetPixel(x, y, (x == 0 || y == 0 || x == 5 || y == 5) ? edge : fill);
            t.Apply();
            return t;
        }

        void BigStyles()
        {
            if (bigCard != null && bigCard.normal.background != null && Mathf.Approximately(bigScaleApplied, cfgBigScale.Value)) return;
            bigScaleApplied = cfgBigScale.Value;
            bigBadges.Clear();
            bigCard = new GUIStyle(GUI.skin.box) { border = new RectOffset(2, 2, 2, 2), padding = new RectOffset(12, 12, 8, 8), margin = new RectOffset(0, 4, 0, 5) };
            bigCard.normal.background = BigBox(new Color(0.125f, 0.11f, 0.095f), new Color(0.26f, 0.21f, 0.13f));
            bigSection = new GUIStyle(labelStyle) { fontSize = FS(12), fontStyle = FontStyle.Bold, padding = new RectOffset(2, 0, 8, 2) };
            bigSection.normal.textColor = BigOchre;
            bigTabOff = new GUIStyle(btnStyle) { fontSize = FS(13), padding = new RectOffset(16, 16, 6, 6), margin = new RectOffset(0, 4, 0, 0) };
            bigTabOff.normal.background = Solid(new Color(0.17f, 0.15f, 0.12f)); bigTabOff.hover.background = Solid(new Color(0.26f, 0.21f, 0.12f)); bigTabOff.onNormal.background = bigTabOff.normal.background;
            bigTabOff.normal.textColor = new Color(0.72f, 0.67f, 0.58f);
            bigTabOn = new GUIStyle(bigTabOff) { fontStyle = FontStyle.Bold };
            bigTabOn.normal.background = Solid(new Color(0.55f, 0.37f, 0.09f)); bigTabOn.hover.background = bigTabOn.normal.background;
            bigTabOn.normal.textColor = new Color(1f, 0.96f, 0.85f);
            bigPrimary = new GUIStyle(btnStyle) { fontSize = FS(13), fontStyle = FontStyle.Bold, padding = new RectOffset(12, 12, 6, 6) };
            bigPrimary.normal.background = Solid(new Color(0.58f, 0.39f, 0.08f)); bigPrimary.hover.background = Solid(new Color(0.75f, 0.52f, 0.12f));
            bigTitle = new GUIStyle(labelStyle) { fontSize = FS(20), fontStyle = FontStyle.Bold, richText = true };
            bigTitle.normal.textColor = new Color(0.97f, 0.92f, 0.8f);
            bigName = new GUIStyle(labelStyle) { fontSize = FS(14), fontStyle = FontStyle.Bold, richText = true, wordWrap = true };
            bigName.normal.textColor = new Color(0.96f, 0.93f, 0.85f);
            bigWrap = new GUIStyle(labelStyle) { wordWrap = true, richText = true, fontSize = FS(13) };
            bigRule = new GUIStyle(GUI.skin.box) { margin = new RectOffset(0, 4, 2, 4), padding = new RectOffset(0, 0, 0, 0), fixedHeight = 1 };
            bigRule.normal.background = Solid(new Color(0.3f, 0.24f, 0.13f));
        }

        GUIStyle BigBadge(Color c)
        {
            GUIStyle g;
            if (bigBadges.TryGetValue(c, out g) && g.normal.background != null) return g;
            g = new GUIStyle(labelStyle) { fontSize = FS(11), fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, padding = new RectOffset(7, 7, 2, 2), margin = new RectOffset(0, 5, 2, 0), richText = true, wordWrap = false };
            g.normal.background = Solid(c); g.normal.textColor = new Color(0.97f, 0.95f, 0.9f);
            return bigBadges[c] = g;
        }

        void Badge(string text, Color c) { GUILayout.Label(text, BigBadge(c), GUILayout.ExpandWidth(false)); }

        void Section(string text) { GUILayout.Label(text.ToUpperInvariant(), bigSection); GUILayout.Box(GUIContent.none, bigRule, GUILayout.ExpandWidth(true)); }

        void DrawBig(int id)
        {
            BigStyles();
            if (craftId >= 0)
            {
                BigCraft();
            }
            else
            {
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("Profit finder", bigTab == 0 ? bigTabOn : bigTabOff)) bigTab = 0;
                if (GUILayout.Button("Item search", bigTab == 1 ? bigTabOn : bigTabOff)) bigTab = 1;
                if (GUILayout.Button("What to craft", bigTab == 2 ? bigTabOn : bigTabOff)) bigTab = 2;
                if (craftLastId >= 0 && GUILayout.Button("Resume: " + Db.ItemName(craftLastId), bigTabOff)) { craftId = craftLastId; craftKey = craftLastKey; craftBackTab = bigTab; craftPlanSig = null; }
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("A-", bigTabOff, GUILayout.Width(44))) cfgBigScale.Value = Mathf.Max(0.8f, Mathf.Round((cfgBigScale.Value - 0.1f) * 10f) / 10f);
                if (GUILayout.Button("A+", bigTabOff, GUILayout.Width(44))) cfgBigScale.Value = Mathf.Min(1.8f, Mathf.Round((cfgBigScale.Value + 0.1f) * 10f) / 10f);
                if (GUILayout.Button("Close  ·  " + cfgBigKey.Value + " / Esc", bigTabOff)) SetBig(false);
                GUILayout.EndHorizontal();
                GUILayout.Space(8);
                if (bigTab == 0) BigProfit(); else if (bigTab == 2) BigBest(); else BigItems();
            }
            bigTyping = (GUI.GetNameOfFocusedControl() ?? "").StartsWith("lootmap_big");
            GUI.DragWindow(new Rect(0, 0, 10000, 26));
        }

        void BigProfit()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Sort by", labelStyle, GUILayout.Width(60));
            if (GUILayout.Button(RowSortNames[bigSort], bigTabOff)) bigSort = (bigSort + 1) % RowSortNames.Length;
            if (GUILayout.Button("Skill: " + RowSkillLabel(), bigTabOff)) NextRowSkill();
            if (GUILayout.Button("Level: " + RowLvLabel(), bigTabOff)) NextRowLv();
            if (GUILayout.Button("Refresh", bigTabOff)) { try { bigRows = BuildTrade(); } catch (Exception) { } }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            if (Db.containers.Count > 0)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label("Sell liquids in", labelStyle, GUILayout.Width(100));
                if (GUILayout.Button(SaleContainerLabel() + "   (click to change)", bigTabOff)) { NextSaleContainer(); try { bigRows = BuildTrade(); } catch (Exception) { } }
                GUILayout.FlexibleSpace();
                GUILayout.EndHorizontal();
            }
            GUILayout.BeginHorizontal();
            GUILayout.Label("Quality", labelStyle, GUILayout.Width(100));
            foreach (var qp in new float[] { 0f, 0.5f, 1f, 1.5f, 2f })
            {
                string ql = qp == 0f ? "Yours" : qp.ToString("0.#");
                if (GUILayout.Button(qualityPick == qp ? "[" + ql + "]" : ql, qualityPick == qp ? bigTabOn : bigTabOff, GUILayout.Width(qp == 0f ? 70 : 48)) && qualityPick != qp)
                { qualityPick = qp; try { bigRows = BuildTrade(); } catch (Exception) { } }
            }
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            GUILayout.Label(qualityPick > 0f ? "Prices assume everything you craft comes out at quality " + qualityPick.ToString("0.#") + " (items without quality are not affected)." : "Real shop prices, after the fail chance and with the quality your current skills would give. ~ = an ingredient is not sold in any shop.", smallStyle);
            var rows = (bigRows ?? new List<TradeRow>());
            var list = SortRows(FilterRows(rows), bigSort).Take(100).ToList();
            TradeRow pick = null, pickCraft = null;
            bigScroll = GUILayout.BeginScrollView(bigScroll);
            if (list.Count == 0) GUILayout.Label("No profitable recipes found", smallStyle);
            foreach (var r in list)
            {
                GUILayout.BeginHorizontal(bigCard);
                GUILayout.BeginVertical();
                GUILayout.BeginHorizontal();
                GUILayout.Label(r.name + (r.estimated ? "  ~" : ""), bigName, GUILayout.ExpandWidth(false));
                GUILayout.FlexibleSpace();
                Badge(Money(r.profit) + " OC / " + Money(r.profit * 0.1f) + " RM", r.profit >= 0 ? BigGood : BigBad);
                if (r.perHour > float.MinValue) Badge(Money(r.perHour) + " /h", BigInfo);
                GUILayout.EndHorizontal();
                GUILayout.Label(RowTag(r, bigSort) + r.route, smallStyle);
                GUILayout.EndVertical();
                GUILayout.BeginVertical(GUILayout.Width(74));
                if (GUILayout.Button("Craft", bigPrimary)) pickCraft = r;
                if (GUILayout.Button(Loc.T("Find"), btnStyle)) pick = r;
                GUILayout.EndVertical();
                GUILayout.EndHorizontal();
            }
            GUILayout.EndScrollView();
            if (pick != null) { SetIdSearch(new HashSet<int>(pick.ids), pick.name); SetBig(false); }
            if (pickCraft != null && pickCraft.key != null)
            {
                var rr = Db.trade[pickCraft.key];
                int outId = rr[5] is JArray oa && oa.Count > 0 ? (int)((JArray)oa[0])[0] : -1;
                if (outId >= 0) OpenCraft(outId, pickCraft.key);
            }
        }

        // ---------------- What to craft: the best recipes for the skills you have ----------------
        bool bestEst; List<TradeRow> bestLocked; string bestSig; TradeRow bestPick, bestPickCraft;
        static string TimeTxt(float s) => s >= 3600f ? (s / 3600f).ToString("0.#") + " h" : s >= 60f ? Mathf.RoundToInt(s / 60f) + " min" : Mathf.RoundToInt(s) + " s";
        string BestSigNow() { float h = 0f; foreach (var sk in RowSkills()) h = h * 1.7f + MySkill(sk); return qualityPick + "|" + cfgSaleContainer.Value + "|" + cfgShopChoice.Value + "|" + h; }
        void BestCardRow(TradeRow r, bool hourFirst, string extra)
        {
            GUILayout.BeginHorizontal(bigCard);
            GUILayout.BeginVertical();
            GUILayout.BeginHorizontal();
            GUILayout.Label(r.name + (r.estimated ? "  ~" : ""), bigName, GUILayout.ExpandWidth(false));
            GUILayout.FlexibleSpace();
            if (hourFirst) { if (r.perHour > float.MinValue) Badge(Money(r.perHour) + " /h", BigGood); Badge(Money(r.profit) + " per craft", BigInfo); }
            else { Badge(Money(r.profit) + " OC / " + Money(r.profit * 0.1f) + " RM", BigGood); if (r.perHour > float.MinValue) Badge(Money(r.perHour) + " /h", BigInfo); }
            GUILayout.EndHorizontal();
            GUILayout.Label(r.station + " \u00b7 " + (r.skill != "None" ? r.skill + (r.minLv > 0 ? " lv " + r.minLv : "") + " \u00b7 " : "") + TimeTxt(r.time) + " \u00b7 " + Mathf.RoundToInt(r.failNow * 100f) + "% fail" + (extra != null ? " \u00b7 " + extra : ""), smallStyle);
            GUILayout.EndVertical();
            GUILayout.BeginVertical(GUILayout.Width(74));
            if (GUILayout.Button("Craft", bigPrimary)) bestPickCraft = r;
            if (GUILayout.Button(Loc.T("Find"), btnStyle)) bestPick = r;
            GUILayout.EndVertical();
            GUILayout.EndHorizontal();
        }
        void BigBest()
        {
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Skill: " + RowSkillLabel(), bigTabOff)) NextRowSkill();
            if (GUILayout.Button(bestEst ? "Unsold ingredients: included" : "Unsold ingredients: hidden", bigTabOff)) bestEst = !bestEst;
            if (GUILayout.Button("Refresh", bigTabOff)) bestSig = null;
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            string sig = BestSigNow();
            if (bestLocked == null || bestSig == null || sig != bestSig)
            {
                try { bigRows = BuildTrade(); bestLocked = BuildTrade(true); } catch (Exception) { bestLocked = new List<TradeRow>(); }
                bestSig = sig;
            }
            string only = rowSkill <= 0 || rowSkill > RowSkills().Count ? null : RowSkills()[rowSkill - 1];
            bool Ok(TradeRow r) => (only == null || r.skill == only) && (bestEst || !r.estimated);
            var mine = (bigRows ?? new List<TradeRow>()).Where(r => Ok(r) && r.profit > 0f && (r.skill == "None" || r.minLv <= MySkill(r.skill))).ToList();
            var byHour = mine.Where(r => r.perHour > 0f && r.time >= 60f).OrderByDescending(r => r.perHour).Take(10).ToList();
            var byProfit = mine.OrderByDescending(r => r.profit).Take(10).ToList();
            var bestNow = new Dictionary<string, float>();
            foreach (var r in mine) if (r.perHour > 0f && r.time >= 60f && (!bestNow.TryGetValue(r.skill, out var bn) || r.perHour > bn)) bestNow[r.skill] = r.perHour;
            var unlock = (bestLocked ?? new List<TradeRow>()).Where(r => Ok(r) && r.profit > 0f && r.perHour > 0f && r.time >= 60f && r.perHour > (bestNow.TryGetValue(r.skill, out var b2) ? b2 : 0f)).OrderByDescending(r => r.perHour).Take(8).ToList();
            bestPick = bestPickCraft = null;
            bigScroll = GUILayout.BeginScrollView(bigScroll);
            GUILayout.Label("Uses your skill levels and real shop prices, with the quality and liquid container chosen on the Profit finder tab. Recipes under a minute are left out of the per-hour list. ~ = an ingredient is not sold in any shop.", smallStyle);
            GUILayout.Label("Best profit per hour", labelStyle);
            if (byHour.Count == 0) GUILayout.Label("Nothing profitable at your levels", smallStyle);
            foreach (var r in byHour) BestCardRow(r, true, null);
            GUILayout.Space(6);
            GUILayout.Label("Best profit per craft", labelStyle);
            foreach (var r in byProfit) BestCardRow(r, false, null);
            GUILayout.Space(6);
            GUILayout.Label("Worth levelling for (up to 3 levels above yours, priced at the level that unlocks them)", labelStyle);
            if (unlock.Count == 0) GUILayout.Label("Nothing within three levels beats what you can already make", smallStyle);
            foreach (var r in unlock) BestCardRow(r, true, "needs " + r.skill + " " + r.minLv + " (you have " + MySkill(r.skill).ToString("0.#") + ")");
            GUILayout.EndScrollView();
            if (bestPick != null) { SetIdSearch(new HashSet<int>(bestPick.ids), bestPick.name); SetBig(false); }
            if (bestPickCraft != null && bestPickCraft.key != null)
            {
                var rr = Db.trade[bestPickCraft.key];
                int outId = rr[5] is JArray oa && oa.Count > 0 ? (int)((JArray)oa[0])[0] : -1;
                if (outId >= 0) OpenCraft(outId, bestPickCraft.key);
            }
        }

        void BigItems()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Item", labelStyle, GUILayout.Width(44));
            GUI.SetNextControlName("lootmap_big_search");
            bigSearch = GUILayout.TextField(bigSearch ?? "", 40, fieldStyle);
            GUILayout.EndHorizontal();
            GUILayout.Space(4);
            string q = (bigSearch ?? "").Trim().ToLowerInvariant();
            int pickId = -1, craftOpen = -1;
            bigScroll = GUILayout.BeginScrollView(bigScroll);
            if (q.Length < 2) GUILayout.Label("Type at least 2 letters. Craft shows everything an item needs.", smallStyle);
            else
            {
                int shown = 0, total = 0;
                foreach (string key in Db.items.Keys)
                {
                    int id; if (!int.TryParse(key, out id)) continue;
                    string name = Db.ItemName(id);
                    if (string.IsNullOrEmpty(name) || name.ToLowerInvariant().IndexOf(q, StringComparison.Ordinal) < 0) continue;
                    total++;
                    if (shown >= 60) continue;
                    shown++;
                    bool craftable = RecipesFor(id).Count > 0;
                    GUILayout.BeginHorizontal(bigCard);
                    GUILayout.Label(name, bigName, GUILayout.ExpandWidth(true));
                    Badge(Db.ValueOf(id) + " OC", BigGold);
                    if (craftable) Badge("CRAFTABLE", BigInfo);
                    if (craftable) { if (GUILayout.Button("Craft", bigPrimary, GUILayout.Width(74))) craftOpen = id; }
                    else if (GUILayout.Button(Loc.T("Find"), btnStyle, GUILayout.Width(74))) pickId = id;
                    GUILayout.EndHorizontal();
                }
                if (total == 0) GUILayout.Label("No items match.", smallStyle);
                else if (total > shown) GUILayout.Label((total - shown) + " more. Type more letters to narrow it down.", smallStyle);
            }
            GUILayout.EndScrollView();
            if (craftOpen >= 0) OpenCraft(craftOpen, null);
            if (pickId >= 0) { SetIdSearch(new HashSet<int> { pickId }, Db.ItemName(pickId)); SetBig(false); }
        }
    }
}

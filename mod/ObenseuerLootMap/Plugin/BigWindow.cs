using System;
using System.Collections.Generic;
using System.Linq;
using BepInEx.Configuration;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ObenseuerLootMap
{
    // 0.7.7: a big in-game window (Home key) with the website's Profit finder and item search, usable anywhere in the game.
    public partial class LootMapPlugin
    {
        ConfigEntry<KeyCode> cfgBigKey;
        bool bigOpen, bigTyping, bigPrevVis; int bigTab, bigSort; Vector2 bigScroll; string bigSearch = "";
        Rect bigRect; List<TradeRow> bigRows; GameObject bigHolder; CursorLockMode bigPrevLock; UnityEngine.EventSystems.EventSystem bigEvents;
        GUIStyle bigWrap;

        void BindBigConfig()
        {
            cfgBigKey = Config.Bind("General", "BigWindowKey", KeyCode.Home, "Key that opens the big Loot Map window (profit finder and item search) anywhere in the game. Set to None to turn it off.");
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

        void DrawBig(int id)
        {
            if (bigWrap == null || bigWrap.font != labelStyle.font) { bigWrap = new GUIStyle(labelStyle) { wordWrap = true, richText = true }; }
            GUILayout.BeginHorizontal();
            if (GUILayout.Toggle(bigTab == 0, "Profit finder", btnStyle, GUILayout.Height(28))) bigTab = 0;
            if (GUILayout.Toggle(bigTab == 1, "Item search", btnStyle, GUILayout.Height(28))) bigTab = 1;
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("Close (" + cfgBigKey.Value + ")", btnStyle, GUILayout.Width(110), GUILayout.Height(28))) SetBig(false);
            GUILayout.EndHorizontal();
            GUILayout.Space(6);
            if (bigTab == 0) BigProfit(); else BigItems();
            bigTyping = GUI.GetNameOfFocusedControl() == "lootmap_big_search";
            GUI.DragWindow(new Rect(0, 0, 10000, 26));
        }

        void BigProfit()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Sort by", labelStyle, GUILayout.Width(70));
            if (GUILayout.Button(bigSort == 0 ? "Profit" : "Profit per hour", btnStyle, GUILayout.Width(150))) bigSort = 1 - bigSort;
            if (GUILayout.Button("Refresh", btnStyle, GUILayout.Width(90))) { try { bigRows = BuildTrade(); } catch (Exception) { } }
            GUILayout.EndHorizontal();
            GUILayout.Label("Real shop prices, after the fail chance and with the quality your current skills would give. ~ means an ingredient is not sold in any shop. Find marks it on the map and in the world.", smallStyle);
            var rows = (bigRows ?? new List<TradeRow>());
            var list = (bigSort == 0 ? rows.OrderByDescending(r => r.profit) : rows.OrderByDescending(r => r.perHour)).Take(100).ToList();
            TradeRow pick = null;
            bigScroll = GUILayout.BeginScrollView(bigScroll);
            if (list.Count == 0) GUILayout.Label("No profitable recipes found", smallStyle);
            foreach (var r in list)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label("<b>" + r.name + (r.estimated ? " ~" : "") + "</b>  ·  " + Money(r.profit) + " OC" + (r.perHour > float.MinValue ? "  ·  " + Money(r.perHour) + "/h" : ""), bigWrap, GUILayout.ExpandWidth(true));
                if (GUILayout.Button(Loc.T("Find"), btnStyle, GUILayout.Width(70))) pick = r;
                GUILayout.EndHorizontal();
                GUILayout.Label(r.route, smallStyle);
                GUILayout.Space(4);
            }
            GUILayout.EndScrollView();
            if (pick != null) { SetIdSearch(new HashSet<int>(pick.ids), pick.name); SetBig(false); }
        }

        void BigItems()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Item", labelStyle, GUILayout.Width(50));
            GUI.SetNextControlName("lootmap_big_search");
            bigSearch = GUILayout.TextField(bigSearch ?? "", 40, fieldStyle);
            GUILayout.EndHorizontal();
            string q = (bigSearch ?? "").Trim().ToLowerInvariant();
            int pickId = -1;
            bigScroll = GUILayout.BeginScrollView(bigScroll);
            if (q.Length < 2) GUILayout.Label("Type at least 2 letters.", smallStyle);
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
                    GUILayout.BeginHorizontal();
                    GUILayout.Label("<b>" + name + "</b>  ·  worth " + Db.ValueOf(id) + " OC", bigWrap, GUILayout.ExpandWidth(true));
                    if (GUILayout.Button(Loc.T("Find"), btnStyle, GUILayout.Width(70))) pickId = id;
                    GUILayout.EndHorizontal();
                }
                if (total == 0) GUILayout.Label("No items match.", smallStyle);
                else if (total > shown) GUILayout.Label((total - shown) + " more. Type more letters to narrow it down.", smallStyle);
            }
            GUILayout.EndScrollView();
            if (pickId >= 0) { SetIdSearch(new HashSet<int> { pickId }, Db.ItemName(pickId)); SetBig(false); }
        }
    }
}

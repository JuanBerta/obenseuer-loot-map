using System.Collections.Generic;
using System.Linq;
using System.Text;
using UnityEngine;

namespace ObenseuerLootMap
{
    public partial class LootMapPlugin
    {
        Marker hovered; DoorData hoveredDoor; Vector2 hoveredDoorAt;
        GUIStyle panelStyle, tipStyle, labelStyle, headStyle, smallStyle, btnStyle, doorStyle, fieldStyle;
        Rect panelRect; bool panelInit, hadFont; Font gameFont;
        Rect mapScreenRect;
        const string SearchControl = "lootmap_search";
        static readonly Color Paper = new Color(0.91f, 0.88f, 0.81f), Ink = new Color(0.14f, 0.11f, 0.08f), Ochre = new Color(0.79f, 0.6f, 0.23f);

        // 8x8 texture with a coloured edge, used as a 9-slice background (GUIStyle.border).
        static Texture2D Framed(Color fill, Color edge, int width)
        {
            var t = new Texture2D(8, 8) { hideFlags = HideFlags.HideAndDontSave };
            for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++)
                t.SetPixel(x, y, x < width || y < width || x >= 8 - width || y >= 8 - width ? edge : fill);
            t.Apply(); return t;
        }
        static Texture2D Solid(Color c) { var t = new Texture2D(1, 1) { hideFlags = HideFlags.HideAndDontSave }; t.SetPixel(0, 0, c); t.Apply(); return t; }

        void InitStyles()
        {
            // Scene changes unload unreferenced assets; rebuild the styles if their textures or font were destroyed.
            if (panelStyle != null && panelStyle.normal.background != null && tipStyle.normal.background != null && btnStyle.normal.background != null && fieldStyle.focused.background != null && (gameFont != null || !hadFont)) return;
            gameFont = Resources.FindObjectsOfTypeAll<Font>().FirstOrDefault(f =>
                new[] { "special", "elite", "typewriter", "courier", "american" }.Any(k => f.name.ToLowerInvariant().Contains(k)));
            hadFont = gameFont != null;
            Logger.LogInfo("Panel font: " + (gameFont != null ? gameFont.name : "default"));
            panelStyle = new GUIStyle(GUI.skin.window) { padding = new RectOffset(12, 12, 30, 10), fontSize = 15, richText = true, font = gameFont };
            panelStyle.normal.background = panelStyle.onNormal.background = Solid(new Color(0.09f, 0.08f, 0.07f, 0.95f));
            panelStyle.normal.textColor = panelStyle.onNormal.textColor = Ochre;
            tipStyle = new GUIStyle(GUI.skin.box) { alignment = TextAnchor.UpperLeft, wordWrap = true, richText = true, fontSize = 13, padding = new RectOffset(11, 11, 9, 9) };
            tipStyle.normal.background = Solid(new Color(Paper.r, Paper.g, Paper.b, 0.97f));
            tipStyle.normal.textColor = Ink;
            labelStyle = new GUIStyle(GUI.skin.label) { richText = true, wordWrap = true, fontSize = 13 };
            labelStyle.normal.textColor = new Color(0.93f, 0.89f, 0.83f);
            headStyle = new GUIStyle(labelStyle) { fontSize = 12, font = gameFont, fontStyle = gameFont != null ? FontStyle.Normal : FontStyle.Bold };
            headStyle.normal.textColor = Ochre;
            smallStyle = new GUIStyle(labelStyle) { fontSize = 11 };
            smallStyle.normal.textColor = new Color(0.66f, 0.62f, 0.53f);
            btnStyle = new GUIStyle(GUI.skin.button) { fontSize = 12, richText = true, font = gameFont };
            btnStyle.normal.background = Solid(new Color(0.42f, 0.29f, 0.08f)); btnStyle.hover.background = Solid(new Color(0.6f, 0.42f, 0.12f));
            btnStyle.active.background = Solid(new Color(0.79f, 0.6f, 0.23f));
            btnStyle.normal.textColor = btnStyle.hover.textColor = new Color(0.98f, 0.93f, 0.8f); btnStyle.active.textColor = Ink;
            fieldStyle = new GUIStyle(GUI.skin.textField) { fontSize = 14, border = new RectOffset(3, 3, 3, 3), padding = new RectOffset(7, 7, 5, 5) };
            var idle = new Color(0.78f, 0.74f, 0.66f);
            fieldStyle.normal.background = Framed(idle, new Color(0.35f, 0.3f, 0.24f), 1);
            fieldStyle.hover.background = Framed(new Color(0.86f, 0.82f, 0.74f), new Color(0.55f, 0.45f, 0.3f), 1);
            fieldStyle.focused.background = Framed(new Color(1f, 0.98f, 0.92f), new Color(0.95f, 0.66f, 0.12f), 3);
            fieldStyle.normal.textColor = fieldStyle.hover.textColor = new Color(0.25f, 0.21f, 0.16f);
            fieldStyle.focused.textColor = Ink;
            doorStyle = new GUIStyle(GUI.skin.label) { fontSize = 11, richText = true, padding = new RectOffset(4, 4, 1, 1) };
            doorStyle.normal.background = Solid(new Color(0.1f, 0.09f, 0.08f, 0.88f));
            doorStyle.normal.textColor = new Color(0.98f, 0.93f, 0.8f);
        }

        void OnGUI()
        {
            if (Db == null) return;
            var e = Event.current;
            if (e.type == EventType.KeyDown && e.keyCode == cfgToggleKey.Value && !Typing && cfgToggleKey.Value != KeyCode.None)
            {
                bool on = !(cfgPanel.Value && cfgEnabled.Value);
                cfgPanel.Value = on; cfgEnabled.Value = on; e.Use();
            }
            if (!MapOpen) { Typing = false; DrawHud(); return; }
            InitStyles();
            if (!panelInit) { panelRect = new Rect(cfgPanelX.Value, cfgPanelY.Value, 300, 10); panelInit = true; }
            ComputeMapRect();
            if (cfgEnabled.Value && cfgDoors.Value) DrawDoors();
            if (cfgPanel.Value)
            {
                var before = panelRect.position;
                panelRect = GUILayout.Window(0x4C4F4F54, panelRect, DrawPanel, Loc.T("LOOT MAP"), panelStyle, GUILayout.Width(300));
                if (panelRect.position != before) { cfgPanelX.Value = panelRect.x; cfgPanelY.Value = panelRect.y; }
            }
            if (LeaveSearch) { LeaveSearch = false; GUI.FocusControl(null); }
            Typing = GUI.GetNameOfFocusedControl() == SearchControl;
            if (Typing && e.type == EventType.KeyDown && e.keyCode == KeyCode.Escape) { GUI.FocusControl(null); Typing = false; }   // let the game close the menu too
            var mouse = e.mousePosition;
            bool overPanel = cfgPanel.Value && panelRect.Contains(mouse);
            if (e.type == EventType.Repaint) UpdateHover(mouse);
            if (!overPanel && e.type == EventType.MouseDown && e.button == 0)
            {
                if (hoveredDoor != null) { SetGuide(CurrentScene, new Vector3(hoveredDoor.x, hoveredDoor.y, hoveredDoor.z), Db.SceneName(hoveredDoor.to)); e.Use(); }
                else if (hovered != null) { SetGuide(hovered.scene, hovered.world, MarkerTitle(hovered)); e.Use(); }
            }
            if (!overPanel)
            {
                if (hovered != null) DrawTooltip(mouse);
                else if (hoveredDoor != null) DrawDoorTooltip(mouse);
            }
        }

        void ComputeMapRect()
        {
            mapScreenRect = new Rect(0, 0, Screen.width, Screen.height);
            var content = MapContent(map); var view = content != null ? content.parent as RectTransform : null;
            if (view == null) return;
            var corners = new Vector3[4]; view.GetWorldCorners(corners);
            var root = view.GetComponentInParent<Canvas>()?.rootCanvas;
            var cam = root != null && root.renderMode != RenderMode.ScreenSpaceOverlay ? root.worldCamera : null;
            var a = RectTransformUtility.WorldToScreenPoint(cam, corners[0]); var b = RectTransformUtility.WorldToScreenPoint(cam, corners[2]);
            mapScreenRect = Rect.MinMaxRect(a.x, Screen.height - b.y, b.x, Screen.height - a.y);
        }

        Camera UiCam()
        {
            var canvas = layer != null ? layer.GetComponentInParent<Canvas>() : null;
            var root = canvas != null ? canvas.rootCanvas : null;
            return root != null && root.renderMode != RenderMode.ScreenSpaceOverlay ? root.worldCamera : null;
        }

        Vector2 GuiPointOnMap(Vector3 world)
        {
            var size = MapSize(map); var info = info_map.instance;
            var local = MapLocal(info, size.rect.width, size.rect.height, world);
            var sp = RectTransformUtility.WorldToScreenPoint(UiCam(), layer.TransformPoint(local));
            return new Vector2(sp.x, Screen.height - sp.y);
        }

        void DrawDoors()
        {
            hoveredDoor = null;
            if (layer == null || info_map.instance == null || !Db.scenes.TryGetValue(CurrentScene ?? "", out var sd)) return;
            float zoom = lastZoom > 0 ? lastZoom : 1f;
            var mouse = Event.current.mousePosition;
            foreach (var d in sd.doors)
            {
                var g = GuiPointOnMap(new Vector3(d.x, d.y, d.z));
                if (!mapScreenRect.Contains(g)) continue;
                bool hov = (g - mouse).sqrMagnitude < 81f;
                if (hov) { hoveredDoor = d; hoveredDoorAt = g; }
                var oldC = GUI.color;
                GUI.color = d.open == 1 ? new Color(0.1f, 0.09f, 0.08f) : new Color(0.45f, 0.43f, 0.4f);
                GUI.DrawTexture(new Rect(g.x - 5, g.y - 5, 10, 10), Texture2D.whiteTexture);
                GUI.color = Paper; GUI.DrawTexture(new Rect(g.x - 1.5f, g.y - 3, 3, 6), Texture2D.whiteTexture);
                GUI.color = oldC;
                if (Event.current.type == EventType.Repaint && (hov || zoom > 2.2f || Indoors))
                {
                    var c = new GUIContent(Db.SceneName(d.to));
                    var sz = doorStyle.CalcSize(c);
                    doorStyle.Draw(new Rect(g.x + 8, g.y - sz.y / 2, sz.x, sz.y), c, false, false, false, false);
                }
            }
        }

        void DrawDoorTooltip(Vector2 at)
        {
            var d = hoveredDoor; var sb = new StringBuilder();
            sb.Append($"<b><size=15>{Db.SceneName(d.to)}</size></b>\n");
            if (d.open == 0) sb.Append($"<color=#7a6f5c>{Loc.T("not open in this game version")}</color>");
            else if (Db.scenes.TryGetValue(d.to, out var s))
            {
                sb.Append($"{s.free + s.steal} {Loc.T("loot")}: <color=#3f6b2f><b>{s.free} {Loc.T("free")}</b></color> · <color=#9b1c14><b>{s.steal} {Loc.T("stealing")}</b></color>");
                if (s.vendors.Count > 0) sb.Append($"\n{Loc.T("Shops")}: {string.Join(", ", s.vendors.Select(v => v.n).Distinct().Take(4))}");
                if (s.stations.Count > 0) sb.Append($"\n{Loc.T("Workstations")}: {string.Join(", ", s.stations.Select(v => v.n).Distinct().Take(6))}");
                sb.Append($"\n<color=#7a6f5c>{Loc.T("Click to go there")}</color>");
            }
            ShowTip(at, sb.ToString());
        }

        string MarkerTitle(Marker m)
        {
            if (m.st != null) return m.st.n;
            if (m.v != null) return m.v.n;
            return m.p.t ?? m.p.n ?? Loc.T(m.p.k == "p" ? "Pickup spot" : "Container");
        }


        void DrawPanel(int id)
        {
            cfgEnabled.Value = GUILayout.Toggle(cfgEnabled.Value, " " + Loc.T("Show loot markers"));
            if (cfgEnabled.Value)
            {
                GUILayout.Space(4);
                GUILayout.Label(Loc.T("Search item, container or workstation"), smallStyle);
                GUI.SetNextControlName(SearchControl);
                search = GUILayout.TextField(search, 40, fieldStyle);
                if (Typing) GUILayout.Label("<color=#f2a51f>✎ " + Loc.T("Typing — game keys are paused. Esc to leave.") + "</color>", smallStyle);
                if (ExactSearch) GUILayout.Label("<color=#9fdc8a>" + Loc.T("Exact name only") + ": " + ExactTerm + "</color>", smallStyle);
                else if (Typing || search.Length == 0) GUILayout.Label(Loc.T("Tip: \"bottle of ink\" or (bottle of ink) finds that exact item."), smallStyle);
                else if (search.Length == 0) GUILayout.Label(Loc.T("Click the box to type."), smallStyle);
                GUILayout.BeginHorizontal();
                if (GUILayout.Button(Loc.T("Zoom to me"), btnStyle)) ZoomToPlayer();
                if ((search.Length > 0 || searchIds != null || searchIdsLabel != null) && GUILayout.Button(Loc.T("Clear search"), btnStyle)) { ClearSearch(); GUI.FocusControl(null); }
                GUILayout.EndHorizontal();
                if (GUILayout.Button(Loc.T("Ingredients for my marked recipes"), btnStyle)) UseMarkedRecipes();
                if (searchIdsLabel != null) GUILayout.Label(searchIdsLabel, smallStyle);
                if (search != appliedSearch) GUILayout.Label(Loc.T("searching…"), smallStyle);
                GUILayout.Space(6);
                cfgContainers.Value = GUILayout.Toggle(cfgContainers.Value, " " + Loc.T("Containers"));
                cfgPickups.Value = GUILayout.Toggle(cfgPickups.Value, " " + Loc.T("Pickup spots"));
                cfgStations.Value = GUILayout.Toggle(cfgStations.Value, " " + Loc.T("Workstations"));
                cfgShops.Value = GUILayout.Toggle(cfgShops.Value, " " + Loc.T("Shops"));
                cfgDoors.Value = GUILayout.Toggle(cfgDoors.Value, " " + Loc.T("Doors"));
                cfgFreeOnly.Value = GUILayout.Toggle(cfgFreeOnly.Value, " " + Loc.T("Only free to take"));
                cfgFloorOnly.Value = GUILayout.Toggle(cfgFloorOnly.Value, " " + Loc.T("Indoors: only my floor"));
                cfgWholeMap.Value = GUILayout.Toggle(cfgWholeMap.Value, " " + Loc.T("Search other buildings too"));
                cfgWorld.Value = GUILayout.Toggle(cfgWorld.Value, " " + Loc.T("Highlight matches in the world"));
                if (ScavengerBridge.Available)
                {
                    cfgTrashRoute.Value = GUILayout.Toggle(cfgTrashRoute.Value, " " + Loc.T("Trash route (Scavenger)"));
                    GUILayout.Label($"<color=#b5c936>■</color> {Loc.T("Trash searched today")}: <b>{ScavengerBridge.SearchedTodayCount}</b>" +
                                    (TrashRoute ? $" · <b>{TrashLeftOnMap()}</b> {Loc.T("left on this map")}" : ""), labelStyle);
                }
                GUILayout.Space(6);
                GUILayout.Label(Summary(), labelStyle);
                var ids = MatchedIds; var furn = MatchedFurniture;
                if (furn != null && furn.Count > 0)
                    GUILayout.Label($"<color=#c9a46a>{Loc.T("Furniture")}</color>: " + string.Join("\n", furn.Take(3).Select(Db.FurnInfo)) + (furn.Count > 3 ? $"  +{furn.Count - 3} {Loc.T("more")}" : ""), smallStyle);
                if ((ids != null && ids.Count > 0) || (furn != null && furn.Count > 0))
                    GUILayout.Label($"<color=#3ddc5a>■</color> {Loc.T("has it now")}   <color=#d98e04>■</color> {Loc.T("can drop it")}\n" +
                                    $"<color=#3d8bff>●</color> {Loc.T("sells it")}   <color=#ff7a2f>●</color> {Loc.T("buys it")}   <color=#b45cff>●</color> {Loc.T("sells & buys")}", smallStyle);
                DrawShops();
                if (guide != null)
                {
                    GUILayout.Space(4);
                    GUILayout.Label($"{Loc.T("Guiding to")}: <b>{GuideLabel}</b>", labelStyle);
                    if (GUILayout.Button(Loc.T("Stop guiding"), btnStyle)) ClearGuide();
                }
                GUILayout.Space(4);
                GUILayout.Label($"<color=#d98e04>■</color> {Loc.T("container")}   <color=#1f7a8c>●</color> {Loc.T("pickup")}   <color=#2f5d3a>■</color> {Loc.T("workstation")}   <color=#d6b23c>●</color> {Loc.T("shop")}\n" +
                                $"<color=#c81e18>{Loc.T("red edge = stealing")}</color> · <color=#9f7ae0>{Loc.T("purple edge = locked")}</color> · {Loc.T("hollow = empty")}\n" +
                                Loc.T("Hover a marker for its loot. Click it to be guided there.") + $"  [{cfgToggleKey.Value}] {Loc.T("Toggle panel")}", smallStyle);
            }
            GUI.DragWindow();
        }

        string Summary()
        {
            int here = markers.Count(m => m.scene == CurrentScene);
            if (!Searching) return $"{here} {Loc.T("markers in this place.")}";
            int mh = markers.Count(m => m.match && m.scene == CurrentScene);
            int other = markers.Count(m => m.match && m.scene != CurrentScene);
            int places = markers.Where(m => m.match && m.scene != CurrentScene).Select(m => m.scene).Distinct().Count();
            var sb = new StringBuilder($"<b>{mh}</b> {Loc.T("matches here")}");
            if (cfgWholeMap.Value) sb.Append($", <b>{other}</b> {Loc.T("in")} {places} {Loc.T("other buildings on this map")}");
            return sb.Append('.').ToString();
        }

        // "Where to buy": shops anywhere in the game that sell what you searched for.
        List<(string scene, VendorData v, int mode)> shopHits; string shopKey;
        static string ModeText(int mode) => (mode & 4) != 0 ? "<color=#9fdc8a>" + Loc.T("in stock now") + "</color>" : mode == 3 ? "<color=#c99bff>" + Loc.T("sells & buys") + "</color>" :
                                            mode == 1 ? "<color=#7fb2ff>" + Loc.T("sells it") + "</color>" : "<color=#ffa070>" + Loc.T("buys it") + "</color>";
        void DrawShops()
        {
            if (!Searching) return;
            string key = appliedSearch + "|" + searchIdsLabel + "|" + LiveKey();
            if (key != shopKey)
            {
                shopKey = key;
                shopHits = Db.scenes.SelectMany(kv => kv.Value.vendors.Select(v => (kv.Key, v, VendorMode(v)))).Where(x => x.Item3 != 0)
                    .OrderByDescending(x => (x.Item3 & 1) != 0).ThenByDescending(x => x.Item3 == 3).ThenByDescending(x => Db.scenes[x.Key].map == CurrentMap)
                    .Take(8).ToList();
            }
            string cur = CurrentScene;
            if (cur != null && Db.scenes.TryGetValue(cur, out var here))
            {
                var now = here.vendors.Select(v => (v, InStockNow(v))).Where(x => x.Item2.Count > 0).ToList();
                if (now.Count > 0)
                {
                    GUILayout.Space(4);
                    GUILayout.Label(Loc.T("In stock now"), headStyle);
                    foreach (var (v, stock) in now)
                        if (GUILayout.Button($"{v.n} <color=#9fdc8a>· {string.Join(", ", stock.Take(3).Select(kv => Db.FurnName(kv.Key) + (kv.Value > 1 ? " ×" + kv.Value : "")))}</color>", btnStyle))
                            SetGuide(cur, new Vector3(v.x, v.y, v.z), v.n);
                }
            }
            if (shopHits == null || shopHits.Count == 0) return;
            GUILayout.Space(4);
            GUILayout.Label(Loc.T("Shops for this item"), headStyle);
            foreach (var (scene, v, mode) in shopHits)
                if (GUILayout.Button($"{v.n} <color=#d9c7a2>· {Db.SceneName(scene)}</color> · {ModeText(mode)}", btnStyle))
                    SetGuide(scene, new Vector3(v.x, v.y, v.z), v.n);
        }

        void UpdateHover(Vector2 guiMouse)
        {
            hovered = null;
            if (layer == null || markers.Count == 0 || !mapScreenRect.Contains(guiMouse)) return;
            var cam = UiCam();
            var mouse = new Vector2(guiMouse.x, Screen.height - guiMouse.y);
            float best = 13f * 13f;
            foreach (var m in markers)
            {
                if (m.rt == null || (Searching && !m.match)) continue;
                var sp = RectTransformUtility.WorldToScreenPoint(cam, m.rt.position);
                float d = (sp - mouse).sqrMagnitude;
                if (d < best) { best = d; hovered = m; }
            }
            if (hovered != null) hoveredDoor = null;
        }

        string Hi(string name)
        {
            bool hit = Q.Length > 0 && TextMatch(name);
            return hit ? $"<color=#9b5a00><b>{name}</b></color>" : name;
        }
        string HiId(int id)
        {
            var nm = Db.ItemName(id);
            return searchIds != null && searchIds.Contains(id) ? $"<color=#9b5a00><b>{nm}</b></color>" : Hi(nm);
        }
        bool IsHit(int id) => (searchIds != null && searchIds.Contains(id)) || (Q.Length > 0 && TextMatch(Db.ItemName(id)));

        string ItemList(IEnumerable<int> ids, int max)
        {
            var groups = ids.GroupBy(i => i).Select(g => (id: g.Key, n: g.Count())).ToList();
            var shown = groups.OrderByDescending(g => IsHit(g.id)).ThenBy(g => Db.ItemName(g.id)).Take(max).OrderBy(g => Db.ItemName(g.id));
            var s = string.Join(", ", shown.Select(g => HiId(g.id) + (g.n > 1 ? $" ×{g.n}" : "")));
            return groups.Count > max ? s + $"  <color=#7a6f5c>+{groups.Count - max} {Loc.T("more")}</color>" : s;
        }

        void DrawTooltip(Vector2 at)
        {
            var sb = new StringBuilder(); var m = hovered;
            const string dim = "#7a6f5c", green = "#3f6b2f", red = "#9b1c14";
            if (m.st != null)
            {
                var s = m.st;
                sb.Append($"<b><size=15>{s.n}</size></b>  <color={dim}>{Loc.T("workstation")}</color>\n");
                sb.Append(s.s == 1 ? $"<color={red}><b>{Loc.T("Owned")}{(s.o != null ? " " + Loc.T("by") + " " + s.o : "")}</b> — {Loc.T("taking its items is stealing")}</color>\n" : $"<color={green}><b>{Loc.T("Free to use")}</b></color>\n");
                foreach (var t in s.r)
                {
                    Db.recipes.TryGetValue(t, out var rs); rs = rs ?? new List<string>();
                    var q = Q;
                    var shown = rs.OrderByDescending(r => q.Length > 0 && TextMatch(r)).Take(10).OrderBy(r => r);
                    sb.Append($"\n<b>{t}</b> · {rs.Count} {Loc.T("recipes")}\n{string.Join(", ", shown.Select(Hi))}{(rs.Count > 10 ? $"  <color={dim}>+{rs.Count - 10} {Loc.T("more")}</color>" : "")}\n");
                }
            }
            else if (m.v != null)
            {
                var v = m.v;
                sb.Append($"<b><size=15>{v.n}</size></b>  <color={dim}>{Loc.T("shop")}{(v.o != null ? " · " + v.o : "")}</color>\n");
                var ids = MatchedIds;
                if (ids != null && ids.Count > 0)
                {
                    var sold = ids.Where(id => Db.Sells(v, id)).Take(6).ToList(); var bought = ids.Where(id => Db.Buys(v, id)).Take(6).ToList();
                    if (sold.Count > 0) sb.Append($"<color=#1f5fd0><b>{Loc.T("Sells")}</b>: {string.Join(", ", sold.Select(Db.ItemName))}</color>\n");
                    if (bought.Count > 0) sb.Append($"<color=#c2501a><b>{Loc.T("Buys")}</b>: {string.Join(", ", bought.Select(Db.ItemName))}</color>\n");
                }
                var stockNow = InStockNow(v);
                if (stockNow.Count > 0)
                    sb.Append($"<color=#1f8a3a><b>✔ {Loc.T("In stock now")}</b>: {string.Join(", ", stockNow.Select(kv => Db.FurnName(kv.Key) + (kv.Value > 1 ? " ×" + kv.Value : "")))}</color>\n");
                var mf = MatchedFurniture;
                if (mf != null && mf.Count > 0)
                {
                    var fsold = mf.Where(id => Db.FurnSells(v, id)).Take(6).ToList(); var fbought = mf.Where(id => Db.FurnBuys(v, id)).Take(6).ToList();
                    if (fsold.Count > 0) sb.Append($"<color=#1f5fd0><b>{Loc.T("Sells furniture")}</b>: {string.Join(", ", fsold.Select(Db.FurnInfo))}</color>\n");
                    if (fbought.Count > 0) sb.Append($"<color=#c2501a><b>{Loc.T("Buys furniture")}</b>: {string.Join(", ", fbought.Select(Db.FurnName))}</color>\n");
                }
                if (v.fs != null && v.fs.Count > 0) sb.Append($"<color={dim}>{Loc.T("Furniture for sale")}: {v.fs.Count}</color>\n");
                if (v.fb != null) sb.Append($"<color={dim}>{Loc.T("Buys furniture")}: {(v.fb.Type == Newtonsoft.Json.Linq.JTokenType.String ? Loc.T(v.fb.ToString() == "any" ? "any furniture" : "what it sells") : v.fb.Count() + "")}</color>\n");
                if (v.b == 1) sb.Append($"<color={dim}>{Loc.T("Buys from you")}{(v.ba != null && v.ba.Count > 0 ? ": " + string.Join(", ", v.ba.Take(8).Select(r => r.Replace("_item_", "").Replace("_Meta_", ""))) : " " + Loc.T("almost anything"))}{(v.bs == 1 ? " · " + Loc.T("buys stolen goods") : "")}</color>\n");
                if (v.i != null && v.i.Count > 0) sb.Append($"\n<b>{Loc.T("Sells")}</b>: {ItemList(v.i, 16)}\n");
                if (v.t != null && Db.loot.TryGetValue(v.t, out var tb))
                    sb.Append($"\n<b>{Loc.T("Stock from")} {v.t}</b>: {ItemList(tb.SelectMany(x => x), 18)}\n");
            }
            else
            {
                var p = m.p;
                sb.Append($"<b><size=15>{MarkerTitle(m)}</size></b>  <color={dim}>{(p.k == "p" ? Loc.T("pickup") : (p.n ?? Loc.T("container")))}</color>\n");
                sb.Append(p.s == 1 ? $"<color={red}><b>{Loc.T("Stealing — owned by")} {p.o ?? Loc.T("a resident")}</b></color>" : $"<color={green}><b>{Loc.T("Free to take")}</b></color>");
                if (p.l == 1) sb.Append($"  ·  <color=#6b3fa0>{Loc.T("locked")}</color>");
                sb.Append('\n');
                if (IsTrash(p))
                    sb.Append(SearchedToday(p, m.scene) ? $"<color={dim}>{Loc.T("Searched today")} ✓</color>\n"
                                               : $"<color=#5a6b12><b>{Loc.T("Not searched today: gives Scavenging XP")}</b></color>\n");
                if (m.scene != CurrentScene) sb.Append($"<color={dim}>{Loc.T("in")} {Db.SceneName(m.scene)}</color>\n");
                if (HasNow(p)) sb.Append($"<color=#1f8a3a><b>✔ {Loc.T("Has it now")}</b></color>\n");
                if (p.live)
                {
                    if (p.empty) sb.Append($"<color={dim}><b>{Loc.T("Empty right now")}</b></color>\n");
                    else sb.Append($"<b>{Loc.T("Contains now")}</b>: {string.Join(", ", p.have.Take(12).Select(h => HiId(h.Key) + (h.Value > 1 ? $" ×{h.Value}" : "")))}\n");
                    if (p.restock != null) sb.Append($"<color={dim}>{p.restock}</color>\n");
                }
                if (p.t != null && Db.loot.TryGetValue(p.t, out var tb))
                {
                    if (tb.Count > 0 && tb[0].Count > 0) sb.Append($"\n<b>{Loc.T("Common")}</b> ({tb[0].Distinct().Count()}): {ItemList(tb[0], 14)}\n");
                    if (tb.Count > 1 && tb[1].Count > 0) sb.Append($"\n<b>{Loc.T("Rare")}</b> ({tb[1].Distinct().Count()}): {ItemList(tb[1], 14)}\n");
                }
                if (p.f != null && p.f.Count > 0) sb.Append($"\n<b>{Loc.T("Always contains")}</b>: {ItemList(p.f, 14)}\n");
            }
            sb.Append($"\n<color={dim}>{Loc.T("Click to go there")}</color>");
            ShowTip(at, sb.ToString());
        }

        void ShowTip(Vector2 at, string text)
        {
            var content = new GUIContent(text.TrimEnd());
            float w = 380f, h = tipStyle.CalcHeight(content, w);
            var r = new Rect(at.x + 18, at.y + 18, w, h);
            if (r.xMax > Screen.width - 8) r.x = at.x - w - 18;
            if (r.yMax > Screen.height - 8) r.y = Screen.height - h - 8;
            GUI.Box(r, content, tipStyle);
        }
    }
}

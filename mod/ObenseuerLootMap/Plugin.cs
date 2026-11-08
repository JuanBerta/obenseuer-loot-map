using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Unity.Mono;
using HarmonyLib;
using UnityEngine;
using UnityEngine.UI;

namespace ObenseuerLootMap
{
    [BepInPlugin(Guid, "Loot Map", "0.4.1")]
    public partial class LootMapPlugin : BaseUnityPlugin
    {
        public const string Guid = "com.juanberta.obenseuer.lootmap";
        const int MaxOtherMatches = 500;
        internal static LootMapPlugin I;
        internal static bool Typing, LeaveSearch;

        internal LootDb Db;
        ConfigEntry<bool> cfgTrashRoute;
        ConfigEntry<bool> cfgEnabled, cfgContainers, cfgPickups, cfgStations, cfgShops, cfgDoors, cfgFreeOnly, cfgFloorOnly, cfgWholeMap, cfgWorld, cfgPanel;
        ConfigEntry<float> cfgMarkerSize, cfgPanelX, cfgPanelY;
        ConfigEntry<KeyCode> cfgToggleKey;
        ConfigEntry<string> cfgLanguage;
        string search = "", appliedSearch = ""; float searchChangedAt; string lastTyped = "";
        HashSet<int> searchIds; string searchIdsLabel;   // "ingredients for marked recipes" mode

        static readonly AccessTools.FieldRef<Map, RectTransform> MapSize = AccessTools.FieldRefAccess<Map, RectTransform>("mapsize");
        static readonly AccessTools.FieldRef<Map, GameObject> LandmarksArea = AccessTools.FieldRefAccess<Map, GameObject>("LandmarksArea");

        void Awake()
        {
            I = this;
            Config.SaveOnConfigSet = false;
            cfgEnabled = Config.Bind("General", "ShowMarkers", true, "Show loot markers on the in-game map.");
            cfgPanel = Config.Bind("General", "ShowPanel", true, "Show the Loot Map panel next to the map.");
            cfgToggleKey = Config.Bind("General", "TogglePanelKey", KeyCode.F6, "Key that shows/hides the Loot Map panel and markers.");
            cfgLanguage = Config.Bind("General", "Language", "Auto", new ConfigDescription("Panel language. Auto = the language the game is showing.", new AcceptableValueList<string>("Auto", "English", "Spanish", "Finnish")));
            cfgContainers = Config.Bind("Filters", "Containers", true, "Show containers.");
            cfgPickups = Config.Bind("Filters", "PickupSpots", true, "Show item pickup spots.");
            cfgStations = Config.Bind("Filters", "Workstations", true, "Show workstations (Drill, Lathe, stoves...).");
            cfgShops = Config.Bind("Filters", "Shops", true, "Show shops and traders.");
            cfgDoors = Config.Bind("Filters", "Doors", true, "Show door labels on the map.");
            cfgFreeOnly = Config.Bind("Filters", "FreeToTakeOnly", false, "Hide containers where taking counts as stealing.");
            cfgFloorOnly = Config.Bind("Filters", "CurrentFloorOnly", true, "Indoors, only show markers on the floor you are standing on.");
            cfgWholeMap = Config.Bind("Filters", "SearchWholeMap", true, "When searching, also show matches from other buildings on this map.");
            cfgWorld = Config.Bind("Filters", "HighlightInWorld", true, "While a search is active, mark matching containers near you in the world.");
            cfgMarkerSize = Config.Bind("Display", "MarkerSize", 9f, "Marker size on the map.");
            cfgTrashRoute = Config.Bind("Filters", "TrashRoute", false, "With the Scavenger mod: show only trash containers on this map, highlighting the ones you haven't searched today.");
            cfgPanelX = Config.Bind("Display", "PanelX", 20f, "Panel position (x).");
            cfgPanelY = Config.Bind("Display", "PanelY", 110f, "Panel position (y).");
            try
            {
                var path = Path.Combine(Path.GetDirectoryName(Info.Location), "lootmap-data.json");
                Db = LootDb.Load(path);
                Logger.LogInfo($"Loaded loot data v{Db.version}: {Db.scenes.Count} scenes, {Db.scenes.Values.Sum(s => s.points.Count)} loot points, {Db.scenes.Values.Sum(s => s.vendors.Count)} shops.");
            }
            catch (Exception e) { Logger.LogError("Could not load lootmap-data.json: " + e); }
            new Harmony(Guid).PatchAll(typeof(LootMapPlugin).Assembly);
            Logger.LogInfo("Loot Map loaded.");
        }

        void OnApplicationQuit() { try { Config.Save(); } catch { } }

        // ---------------- map state ----------------
        Map map; float nextMapSearch; RectTransform layer; string builtKey; float nextFloorCheck; int floorBand = int.MinValue;
        readonly List<Marker> markers = new List<Marker>();
        Sprite square, circle, ring;
        bool wasOpen; string langScene, loggedLang;

        internal class Marker
        {
            public RectTransform rt; public Image fill, edge;
            public PointData p; public StationData st; public VendorData v; public string scene; public bool match;
            public Vector3 world; public bool top;
        }
        internal static readonly Color32 ColHasNow = new Color32(61, 220, 90, 255), ColSells = new Color32(61, 139, 255, 255),
                                          ColBuys = new Color32(255, 122, 47, 255), ColBoth = new Color32(180, 92, 255, 255),
                                          ColTrash = new Color32(181, 201, 54, 255);

        internal bool MapOpen => map != null && map.isActiveAndEnabled && map.gameObject.activeInHierarchy && Db != null;
        internal string CurrentScene => info_map.instance != null ? info_map.instance.gameObject.scene.name : null;
        string CurrentMap => info_map.instance != null && info_map.instance.mapImage != null ? info_map.instance.mapImage.name : null;
        internal bool Indoors => CurrentScene != null && !CurrentScene.StartsWith("Open Sewer") && CurrentScene != "Under Map";

        void Update()
        {
            if (Db == null) return;
            if (map == null && Time.unscaledTime > nextMapSearch)
            {
                nextMapSearch = Time.unscaledTime + 1f;
                map = Map.instance != null ? Map.instance : FindAnyObjectByType<Map>(FindObjectsInactive.Include);
            }
            if (search != lastTyped) { lastTyped = search; searchChangedAt = Time.unscaledTime; }
            if (search != appliedSearch && (Time.unscaledTime - searchChangedAt > 0.35f || search.Length == 0)) { appliedSearch = search; if (search.Length > 0) searchIds = null; }

            UpdateSlotHighlights();
            bool open = MapOpen;
            if (open || Guiding || ((Searching || TrashRoute) && cfgWorld.Value)) ScanLive(false);
            if (CurrentScene != langScene) { langScene = CurrentScene; Loc.Detect(cfgLanguage.Value); }
            if (!open)
            {
                Typing = false;
                if (wasOpen) { wasOpen = false; try { Config.Save(); } catch { } }
                UpdateGuide();
                return;
            }
            if (!wasOpen) { Loc.Detect(cfgLanguage.Value); if (Loc.Detected != loggedLang) { loggedLang = Loc.Detected; Logger.LogInfo("Language: " + Loc.Detected); } }
            wasOpen = true;
            if (cfgFloorOnly.Value && Time.unscaledTime > nextFloorCheck)
            {
                nextFloorCheck = Time.unscaledTime + 0.5f;
                int band = PlayerFloorBand();
                if (band != floorBand) { floorBand = band; builtKey = null; }
            }
            string key = string.Join("|", CurrentScene, CurrentMap, appliedSearch, searchIdsLabel, cfgEnabled.Value, cfgContainers.Value, cfgPickups.Value,
                cfgStations.Value, cfgShops.Value, cfgFreeOnly.Value, cfgFloorOnly.Value, cfgWholeMap.Value, cfgMarkerSize.Value, floorBand, LiveKey(), Loc.Lang,
                TrashRoute, ScavengerBridge.SearchedTodayCount);
            if (layer == null || key != builtKey) { Rebuild(); builtKey = key; }
            KeepMarkerSize();
        }

        internal static float PlayerY()
        {
            var cam = Camera.main;
            return cam != null ? cam.transform.position.y - 1.6f : 0f;
        }
        static int PlayerFloorBand() => Mathf.FloorToInt((PlayerY() + 1.2f) / 3f);

        internal bool TrashRoute => cfgTrashRoute.Value && ScavengerBridge.Available;
        internal static bool IsTrash(PointData p) => p != null && p.k == "c" && p.t != null && ScavengerBridge.IsTrash(p.t);
        internal static bool SearchedToday(PointData p, string scene) => IsTrash(p) && ScavengerBridge.SearchedAt(scene, p.x, p.y, p.z);

        // Trash on this map not searched today (for the "Trash route" line).
        int trashLeftCache; float trashLeftAt = -10f;
        internal int TrashLeftOnMap()
        {
            if (Time.unscaledTime - trashLeftAt < 1f) return trashLeftCache;
            trashLeftAt = Time.unscaledTime;
            return trashLeftCache = CountTrashLeft();
        }
        int CountTrashLeft()
        {
            string mapName = CurrentMap; int left = 0;
            foreach (var kv in Db.scenes)
            {
                if (kv.Value.map != mapName) continue;
                foreach (var p in PointsOf(kv.Key)) if (IsTrash(p) && !SearchedToday(p, kv.Key)) left++;
            }
            return left;
        }

        // ---------------- matching ----------------
        internal string Q => appliedSearch.Trim().ToLowerInvariant();
        internal bool Searching => Q.Length > 0 || searchIds != null;

        bool IdMatch(IEnumerable<int> ids) => ids != null && searchIds != null && ids.Any(searchIds.Contains);
        string[] QWords => Q.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        // every word of the search appears in the text, in any order ("metal sheet" finds "Sheet Metal")
        internal bool TextMatch(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;
            var t = text.ToLowerInvariant(); var q = Q;
            if (t.Contains(q)) return true;
            var w = QWords; return w.Length > 1 && w.All(t.Contains);
        }
        bool NameMatch(int id) => TextMatch(Db.ItemName(id));
        readonly Dictionary<string, bool> tableMatchCache = new Dictionary<string, bool>(); string tableMatchQ;
        bool TableMatch(string table)
        {
            if (table == null || !Db.TableItems.TryGetValue(table, out var ids)) return false;
            if (tableMatchQ != Q) { tableMatchQ = Q; tableMatchCache.Clear(); }
            if (!tableMatchCache.TryGetValue(table, out var hit)) tableMatchCache[table] = hit = TextMatch(table) || ids.Any(NameMatch);
            return hit;
        }

        internal bool PointMatches(PointData p)
        {
            if (searchIds != null)
                return (p.t != null && Db.TableItems.TryGetValue(p.t, out var ti) && ti.Overlaps(searchIds)) || IdMatch(p.f) || IdMatch(p.have?.Select(h => h.Key));
            var q = Q; if (q.Length == 0) return true;
            if (TableMatch(p.t)) return true;
            if (TextMatch(p.n) || TextMatch(p.o)) return true;
            if (p.have != null && p.have.Any(h => NameMatch(h.Key))) return true;
            return p.f != null && p.f.Any(NameMatch);
        }
        internal bool StationMatches(StationData s)
        {
            if (searchIds != null) return false;
            var q = Q; if (q.Length == 0) return true;
            return Db.StationTextFor(s.n, s.r).Split('\n').Any(TextMatch);
        }
        // Items the current search refers to (by name, or the marked-recipe ingredients).
        HashSet<int> matchedIdsCache; string matchedIdsQ;
        internal HashSet<int> MatchedIds
        {
            get
            {
                if (searchIds != null) return searchIds;
                if (Q.Length == 0) return null;
                if (matchedIdsQ != Q)
                {
                    matchedIdsQ = Q;
                    matchedIdsCache = new HashSet<int>(Db.items.Keys.Select(int.Parse).Where(NameMatch));
                }
                return matchedIdsCache;
            }
        }
        // 0 = no match, 1 = sells it, 2 = buys it, 3 = both
        internal int VendorMode(VendorData v)
        {
            var ids = MatchedIds; if (ids == null || ids.Count == 0) return 0;
            bool sells = ids.Any(id => Db.Sells(v, id)), buys = ids.Any(id => Db.Buys(v, id));
            return (sells ? 1 : 0) | (buys ? 2 : 0);
        }
        internal bool HasNow(PointData p)
        {
            var ids = MatchedIds;
            return ids != null && ids.Count > 0 && p != null && p.live && p.have != null && p.have.Any(h => ids.Contains(h.Key));
        }

        internal bool VendorMatches(VendorData v)
        {
            if (VendorMode(v) != 0) return true;
            if (searchIds != null) return false;
            var q = Q; if (q.Length == 0) return true;
            return TextMatch(v.n) || TextMatch(v.o) || (v.t != null && TextMatch(v.t));
        }

        // Points/stations for a scene: live components for the scene we're in, bundled data otherwise.
        internal List<PointData> PointsOf(string scene) =>
            scene == CurrentScene && livePoints != null && liveScene == scene ? livePoints : (Db.scenes.TryGetValue(scene, out var s) ? s.points : new List<PointData>());
        internal List<StationData> StationsOf(string scene) =>
            scene == CurrentScene && liveStations != null && liveScene == scene ? liveStations : (Db.scenes.TryGetValue(scene, out var s) ? s.stations : new List<StationData>());

        // ---------------- Recipe Marker integration ----------------
        internal void UseMarkedRecipes()
        {
            try
            {
                var t = AccessTools.TypeByName("ObenseuerRecipeMarker.RecipeMarkerManager");
                var ids = t != null ? AccessTools.Field(t, "MarkedRecipeIds")?.GetValue(null) as IEnumerable<int> : null;
                var list = ids?.ToList() ?? new List<int>();
                var items = new HashSet<int>(); var names = new List<string>();
                foreach (var rid in list)
                    if (Db.recipeInputs.TryGetValue(rid.ToString(), out var r))
                    {
                        names.Add(r[0].ToString());
                        foreach (var id in r[2]) items.Add((int)id);
                    }
                if (items.Count == 0) { searchIds = null; searchIdsLabel = Loc.T("No marked recipes (Recipe Marker)"); return; }
                search = appliedSearch = lastTyped = "";
                searchIds = items;
                searchIdsLabel = $"{Loc.T("Marked recipes")}: {string.Join(", ", names)} ({items.Count})";
            }
            catch (Exception e) { Logger.LogWarning("Recipe Marker link failed: " + e.Message); searchIdsLabel = Loc.T("No marked recipes (Recipe Marker)"); }
        }
        internal void ClearSearch() { search = appliedSearch = lastTyped = ""; searchIds = null; searchIdsLabel = null; }

        // ---------------- markers ----------------
        void EnsureSprites()
        {
            if (square != null && ring != null && circle != null) return;
            square = MakeSprite(0); circle = MakeSprite(1); ring = MakeSprite(2);
        }
        static Sprite MakeSprite(int shape)
        {
            const int n = 32;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp, hideFlags = HideFlags.HideAndDontSave };
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float dx = x - n / 2f + .5f, dy = y - n / 2f + .5f, r = Mathf.Sqrt(dx * dx + dy * dy), a = 1f;
                    if (shape == 1) a = Mathf.Clamp01(n / 2f - r);
                    if (shape == 2) a = Mathf.Clamp01(n / 2f - r) * Mathf.Clamp01(r - (n / 2f - 7f));   // ring
                    px[y * n + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            tex.SetPixels32(px); tex.Apply();
            var spr = Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(.5f, .5f), 100f); spr.hideFlags = HideFlags.HideAndDontSave; return spr;
        }

        void Rebuild()
        {
            EnsureSprites();
            ClearMarkers();
            var area = LandmarksArea(map); var size = MapSize(map); var info = info_map.instance;
            if (!cfgEnabled.Value || area == null || size == null || info == null) return;
            if (layer == null)
            {
                var go = new GameObject("LootMapLayer", typeof(RectTransform));
                layer = go.GetComponent<RectTransform>();
                layer.SetParent(area.transform, false);
                layer.anchorMin = layer.anchorMax = layer.pivot = new Vector2(.5f, .5f);
                layer.sizeDelta = Vector2.zero;
                layer.localPosition = Vector3.zero; layer.localRotation = Quaternion.identity; layer.localScale = Vector3.one;
            }
            layer.SetAsLastSibling();

            string cur = CurrentScene, mapName = CurrentMap;
            var scenes = new List<string>();
            if (cur != null) scenes.Add(cur);
            bool route = TrashRoute;
            if ((Searching && cfgWholeMap.Value) || route)
                scenes.AddRange(Db.scenes.Where(kv => kv.Key != cur && kv.Value.map == mapName).Select(kv => kv.Key));

            float w = size.rect.width, h = size.rect.height, py = PlayerY(); int others = 0;
            foreach (var sn in scenes)
            {
                bool here = sn == cur, floorFilter = here && Indoors && cfgFloorOnly.Value;
                Db.scenes.TryGetValue(sn, out var sd);
                foreach (var p in PointsOf(sn))
                {
                    if (route)
                    {
                        if (!IsTrash(p) || (here && floorFilter && Mathf.Abs(p.y - py) > 2.2f)) continue;
                        AddMarker(info, w, h, new Vector3(p.x, p.y, p.z), sn, !SearchedToday(p, sn), p, null, null);
                        continue;
                    }
                    if (p.k == "p" ? !cfgPickups.Value : !cfgContainers.Value) continue;
                    if (cfgFreeOnly.Value && p.s == 1) continue;
                    if (floorFilter && Mathf.Abs(p.y - py) > 2.2f) continue;
                    bool m = PointMatches(p);
                    if (!here && (!m || others >= MaxOtherMatches)) continue;
                    if (!here) others++;
                    AddMarker(info, w, h, new Vector3(p.x, p.y, p.z), sn, m, p, null, null);
                }
                if (route) continue;
                if (cfgStations.Value)
                    foreach (var s in StationsOf(sn))
                    {
                        if (floorFilter && Mathf.Abs(s.y - py) > 2.2f) continue;
                        bool m = StationMatches(s);
                        if (!here && (!m || others >= MaxOtherMatches)) continue;
                        if (!here) others++;
                        AddMarker(info, w, h, new Vector3(s.x, s.y, s.z), sn, m, null, s, null);
                    }
                if (cfgShops.Value && sd != null)
                    foreach (var v in sd.vendors)
                    {
                        if (floorFilter && Mathf.Abs(v.y - py) > 2.2f) continue;
                        bool m = VendorMatches(v);
                        if (!here && !m) continue;
                        AddMarker(info, w, h, new Vector3(v.x, v.y, v.z), sn, m, null, null, v);
                    }
            }
            foreach (var mk in markers.Where(k => k.match && Searching)) mk.rt.SetAsLastSibling();
            foreach (var mk in markers.Where(k => k.top)) mk.rt.SetAsLastSibling();
            lastZoom = -1;
        }

        internal Vector2 MapLocal(info_map info, float w, float h, Vector3 world)
        {
            var rel = info.transform.InverseTransformPoint(world) / info.mapRadius;
            return new Vector2(rel.x * w, rel.z * h);
        }

        readonly Stack<Marker> pool = new Stack<Marker>();
        void AddMarker(info_map info, float w, float h, Vector3 world, string scene, bool match, PointData p, StationData st, VendorData v)
        {
            Marker mk = null;
            while (pool.Count > 0 && mk == null) { mk = pool.Pop(); if (mk.rt == null || mk.rt.parent != layer) mk = null; }
            if (mk == null)
            {
                var go = new GameObject("lm", typeof(RectTransform));
                mk = new Marker { rt = go.GetComponent<RectTransform>() };
                mk.rt.SetParent(layer, false);
                mk.edge = go.AddComponent<Image>(); mk.edge.raycastTarget = false;
                var fillGo = new GameObject("f", typeof(RectTransform)); var frt = fillGo.GetComponent<RectTransform>();
                frt.SetParent(mk.rt, false); frt.anchorMin = Vector2.zero; frt.anchorMax = Vector2.one; frt.offsetMin = new Vector2(1.6f, 1.6f); frt.offsetMax = new Vector2(-1.6f, -1.6f);
                mk.fill = fillGo.AddComponent<Image>(); mk.fill.raycastTarget = false;
            }
            var rt = mk.rt; rt.gameObject.SetActive(true);
            rt.localPosition = MapLocal(info, w, h, world);
            bool pickup = p != null && p.k == "p", searchedTrash = SearchedToday(p, scene);
            bool empty = p != null && ((p.live && p.empty) || searchedTrash);
            var spr = pickup || v != null ? circle : square;
            mk.edge.sprite = spr; mk.fill.sprite = empty ? ring : spr;

            bool steal = (p != null && p.s == 1) || (st != null && st.s == 1);
            Color fc = v != null ? new Color32(214, 178, 60, 255) : st != null ? new Color32(47, 93, 58, 255) : pickup ? new Color32(31, 122, 140, 255) : new Color32(217, 142, 4, 255);
            Color ec = steal ? new Color32(200, 30, 24, 255) : v != null ? new Color32(60, 40, 10, 255) : new Color32(250, 246, 235, 255);
            if (p != null && p.l == 1 && !steal) ec = new Color32(120, 70, 180, 255);
            if (empty) { ec = new Color32(250, 246, 235, 120); }
            bool hasNow = Searching && match && HasNow(p);
            int vmode = Searching && match && v != null ? VendorMode(v) : 0;
            if (hasNow) { fc = ColHasNow; mk.fill.sprite = spr; }
            if (vmode == 1) fc = ColSells; else if (vmode == 2) fc = ColBuys; else if (vmode == 3) fc = ColBoth;
            bool routeTodo = TrashRoute && IsTrash(p) && !searchedTrash;
            if (routeTodo) { fc = ColTrash; mk.fill.sprite = spr; }
            float alpha = TrashRoute ? (routeTodo ? 1f : 0.45f) : (Searching && !match ? 0.28f : (empty ? 0.75f : 1f));
            fc.a = Mathf.Min(fc.a, alpha); ec.a = Mathf.Min(ec.a, alpha);
            mk.fill.color = fc; mk.edge.color = ec;
            float s = cfgMarkerSize.Value * (Searching && match ? 1.5f : 1f) * (routeTodo ? 1.35f : 1f) * (st != null || v != null ? 1.15f : 1f) * (hasNow ? 1.25f : 1f);
            rt.sizeDelta = new Vector2(s, s);
            mk.p = p; mk.st = st; mk.v = v; mk.scene = scene; mk.match = match; mk.world = world; mk.top = hasNow || vmode != 0 || routeTodo;
            markers.Add(mk);
        }

        void ClearMarkers()
        {
            foreach (var m in markers) if (m.rt != null) { m.rt.gameObject.SetActive(false); pool.Push(m); }
            markers.Clear(); hovered = null;
        }

        float lastZoom = -1;
        void KeepMarkerSize()
        {
            if (layer == null) return;
            var canvas = layer.GetComponentInParent<Canvas>();
            if (canvas == null) return;
            float zoom = layer.lossyScale.x / Mathf.Max(1e-6f, canvas.rootCanvas.transform.lossyScale.x);
            if (Mathf.Abs(zoom - lastZoom) < 1e-4f) return;
            lastZoom = zoom;
            var inv = Vector3.one / Mathf.Max(0.05f, zoom);
            foreach (var m in markers) if (m.rt != null) m.rt.localScale = inv;
        }

        static readonly AccessTools.FieldRef<Map, RectTransform> MapContent = AccessTools.FieldRefAccess<Map, RectTransform>("rectTransform");
        static readonly AccessTools.FieldRef<Map, GameObject> PlayerMarkerGo = AccessTools.FieldRefAccess<Map, GameObject>("playerMarker");
        static readonly AccessTools.FieldRef<Map, Vector3> InitialScale = AccessTools.FieldRefAccess<Map, Vector3>("intialScale");
        static readonly AccessTools.FieldRef<Map, float> MaxZoom = AccessTools.FieldRefAccess<Map, float>("maxZoom");
        static readonly AccessTools.FieldRef<Map, float> SliderValue = AccessTools.FieldRefAccess<Map, float>("currentSliderValue");
        static readonly AccessTools.FieldRef<Map, Slider> MapSlider = AccessTools.FieldRefAccess<Map, Slider>("mapSlider");

        internal void ZoomToPlayer()
        {
            try
            {
                var content = MapContent(map); var pm = PlayerMarkerGo(map);
                if (content == null || pm == null) return;
                var init = InitialScale(map); if (init == Vector3.zero) init = Vector3.one;
                content.localScale = init * Mathf.Max(1f, MaxZoom(map));
                var view = content.parent as RectTransform;
                Vector3 center = view != null ? view.TransformPoint(view.rect.center) : content.position;
                content.position += center - pm.transform.position;
                var sl = MapSlider(map);
                if (sl != null) { sl.SetValueWithoutNotify(sl.maxValue); SliderValue(map) = sl.maxValue; }
                lastZoom = -1;
            }
            catch (Exception e) { Logger.LogWarning("Zoom to player failed: " + e.Message); }
        }

        void OnDestroy() { ClearMarkers(); }
    }
}

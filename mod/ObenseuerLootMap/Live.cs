using System;
using System.Collections.Generic;
using System.Linq;
using HarmonyLib;
using UnityEngine;

namespace ObenseuerLootMap
{
    // Reads the real containers / pickup spots / workstations of the loaded scene:
    // what's inside right now, current owner (renting changes it), and restock timers.
    public partial class LootMapPlugin
    {
        internal List<PointData> livePoints;
        internal List<StationData> liveStations;
        string liveScene; float nextLiveScan;

        static int CurrentDay()
        {
            try { return TimeOfDayAzure.instance != null ? TimeOfDayAzure.instance.currentTimeAndDay.currentDay : -1; }
            catch { return -1; }
        }

        static bool Stealing(NPC.NPCReference owner, bool permission) => owner != null && owner.ID > 1 && !permission;

        string RestockText(SpawnSettings ss, bool empty)
        {
            if (ss == null || !ss.respawnEnabled) return null;
            int day = CurrentDay();
            if (day >= 0 && ss.waitingSpawn)
            {
                int left = ss.daySpawned + ss.timetospawn - day;
                if (left <= 0) return Loc.T("Restocks") + " " + Loc.T("today");
                return $"{Loc.T("Restocks")} {Loc.T("in about")} {left} {Loc.T(left == 1 ? "day" : "days")}";
            }
            return Loc.T("Restocks");
        }

        internal void ScanLive(bool force)
        {
            string scene = CurrentScene;
            if (!force && scene == liveScene && Time.unscaledTime < nextLiveScan) return;
            nextLiveScan = Time.unscaledTime + 2f;
            liveScene = scene;
            var pts = new List<PointData>(); var sts = new List<StationData>();
            try
            {
                foreach (var st in FindObjectsByType<Storage>(FindObjectsInactive.Exclude, FindObjectsSortMode.None))
                {
                    if (st == null || st.gameObject.scene.name != scene) continue;
                    if (st.GetComponent<Trade>() != null || st.GetComponent<VendingMachine>() != null) continue;   // shop stock
                    var cat = st.itemSpawnCategory;
                    var have = new List<KeyValuePair<int, int>>();
                    if (st.storageSlots != null)
                        foreach (var slot in st.storageSlots)
                        {
                            if (slot == null) continue;
                            var tr = Traverse.Create(slot);
                            int id = tr.Field("itemId").GetValue<int>(), amt = tr.Field("itemAmount").GetValue<int>();
                            if (id >= 0 && amt > 0) have.Add(new KeyValuePair<int, int>(id, amt));
                        }
                    bool hasTable = !string.IsNullOrEmpty(cat) && Db.loot.ContainsKey(cat);
                    if (!hasTable && have.Count == 0) continue;
                    var pos = st.transform.position;
                    var p = new PointData
                    {
                        k = "c", x = pos.x, y = pos.y, z = pos.z, t = hasTable ? cat : null,
                        n = string.IsNullOrEmpty(st.title) ? null : st.title,
                        s = Stealing(st.StorageOwner, st.PermissionToTake) ? 1 : 0,
                        l = st._Lock != null && st._Lock.Locked ? 1 : 0,
                        live = true, empty = have.Count == 0, have = have,
                    };
                    if (p.s == 1 && st.StorageOwner != null && !string.IsNullOrEmpty(st.StorageOwner.name) && st.StorageOwner.name != "Default Male" && st.StorageOwner.name != "Name") p.o = st.StorageOwner.name;
                    p.restock = RestockText(st.spawnSettings, p.empty);
                    pts.Add(p);
                }
                foreach (var sp in FindObjectsByType<CollectibleItemSpawner>(FindObjectsInactive.Exclude, FindObjectsSortMode.None))
                {
                    if (sp == null || sp.gameObject.scene.name != scene) continue;
                    var have = new List<KeyValuePair<int, int>>();
                    var list = Traverse.Create(sp).Field("collectibleItems").GetValue<List<CollectibleItem>>();
                    if (list != null)
                        foreach (var ci in list)
                        {
                            if (ci == null || !ci.gameObject.activeInHierarchy) continue;
                            var tr = Traverse.Create(ci);
                            var iref = tr.Field("Item").GetValue<ItemReference>();
                            int amt = tr.Field("amount").GetValue<int>();
                            if (iref != null) have.Add(new KeyValuePair<int, int>(iref.ID, Math.Max(1, amt)));
                        }
                    var cat = sp.itemSpawnCategory;
                    var pos = sp.transform.position;
                    var p = new PointData
                    {
                        k = "p", x = pos.x, y = pos.y, z = pos.z, t = !string.IsNullOrEmpty(cat) && Db.loot.ContainsKey(cat) ? cat : null,
                        s = Stealing(sp.owner, sp.permissionToTake) ? 1 : 0, live = true, empty = have.Count == 0, have = have,
                    };
                    if (p.s == 1 && sp.owner != null && !string.IsNullOrEmpty(sp.owner.name) && sp.owner.name != "Default Male" && sp.owner.name != "Name") p.o = sp.owner.name;
                    pts.Add(p);
                }
                foreach (var m in FindObjectsByType<manufacturing>(FindObjectsInactive.Exclude, FindObjectsSortMode.None))
                {
                    if (m == null || m.gameObject.scene.name != scene) continue;
                    string name = !string.IsNullOrEmpty(m.ManuName) ? m.ManuName : m.title;
                    if (string.IsNullOrEmpty(name)) continue;
                    var pos = m.transform.position;
                    var types = m.Recipes != null ? m.Recipes.Select(r => r.ToString()).Distinct().ToList() : new List<string>();
                    var s = new StationData { n = name, x = pos.x, y = pos.y, z = pos.z, r = types, s = Stealing(m.owner, m.PermissionToTake) ? 1 : 0 };
                    if (s.s == 1 && m.owner != null && !string.IsNullOrEmpty(m.owner.name) && m.owner.name != "Default Male" && m.owner.name != "Name") s.o = m.owner.name;
                    Db.StationTextFor(s.n, s.r);
                    sts.Add(s);
                }
                livePoints = pts; liveStations = sts;
            }
            catch (Exception e)
            {
                Logger.LogWarning("Live scan failed, using bundled data: " + e.Message);
                livePoints = null; liveStations = null;
            }
        }

        // Fingerprint of live state, so markers rebuild when something is looted or restocked.
        internal string LiveKey()
        {
            if (livePoints == null) return "";
            int empty = 0, items = 0, steal = 0;
            foreach (var p in livePoints) { if (p.empty) empty++; items += p.have?.Count ?? 0; steal += p.s; }
            return $"{livePoints.Count}/{empty}/{items}/{steal}";
        }
    }
}

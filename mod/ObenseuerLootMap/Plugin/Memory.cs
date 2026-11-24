using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using BepInEx;
using BepInEx.Configuration;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ObenseuerLootMap
{
    // 0.8.0: what is inside the containers of the places you have already been to, read from your save, without going back.
    // The game saves every place when you leave it: each container's items, its restock timer and the items it will restock with.
    // Time passes in the game while you are away, so the contents are predicted for "now": if the restock timer has run out, the
    // pre-rolled restock items are added to the empty slots, exactly as the game does when the place is loaded again.
    public partial class LootMapPlugin
    {
        class Box { public List<KeyValuePair<int, int>> have = new List<KeyValuePair<int, int>>(), next = new List<KeyValuePair<int, int>>(); public int ttl, dayS, slots, used; public bool wait; public long saved; }
        class SceneMem { public long mtime, size; public Dictionary<string, Box> boxes = new Dictionary<string, Box>(); }

        readonly Dictionary<string, SceneMem> mem = new Dictionary<string, SceneMem>();
        readonly object memLock = new object();
        readonly Dictionary<string, string> memApplied = new Dictionary<string, string>();
        volatile bool memBusy; int memVersion; float nextMemCheck; bool memCacheLoaded;
        ConfigEntry<bool> cfgMemory;

        void BindMemoryConfig()
        {
            cfgMemory = Config.Bind("Display", "RememberVisitedPlaces", true, "Read your save to show what the containers of places you have visited hold (predicted for now, including restocks), without going back there.");
        }

        string MemoryCachePath() { return Path.Combine(Path.GetDirectoryName(Info.Location), "lootmap-memory.json"); }

        void MemoryTick()
        {
            if (!cfgMemory.Value || memBusy || Time.unscaledTime < nextMemCheck) return;
            nextMemCheck = Time.unscaledTime + 30f;
            string folder = null;
            try { folder = SaveController.LastSaveFolderPath; } catch (Exception) { }
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return;
            memBusy = true;
            bool loadCache = !memCacheLoaded; memCacheLoaded = true;
            string cache = MemoryCachePath();
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try { ScanSaveFolder(folder, cache, loadCache); }
                catch (Exception e) { Logger.LogWarning("Memory: " + e.Message); }
                finally { memBusy = false; }
            });
        }

        void ScanSaveFolder(string folder, string cachePath, bool loadCache)
        {
            if (loadCache && File.Exists(cachePath))
            {
                try
                {
                    var root = JObject.Parse(File.ReadAllText(cachePath));
                    foreach (var sp in (JObject)root["scenes"])
                    {
                        var sm = new SceneMem { mtime = (long)sp.Value["m"], size = (long)sp.Value["s"] };
                        foreach (JArray b in (JArray)sp.Value["b"])
                        {
                            var bx = new Box { ttl = (int)b[3], wait = (int)b[4] == 1, dayS = (int)b[5], slots = (int)b[6], used = (int)b[7], saved = (long)b[8] };
                            foreach (JArray kv in (JArray)b[1]) bx.have.Add(new KeyValuePair<int, int>((int)kv[0], (int)kv[1]));
                            foreach (JArray kv in (JArray)b[2]) bx.next.Add(new KeyValuePair<int, int>((int)kv[0], (int)kv[1]));
                            sm.boxes[(string)b[0]] = bx;
                        }
                        lock (memLock) mem[sp.Key] = sm;
                    }
                    memVersion++;
                }
                catch (Exception e) { Logger.LogWarning("Memory cache: " + e.Message); }
            }
            bool changed = false;
            var seen = new HashSet<string>();
            foreach (string file in Directory.GetFiles(folder, "*.tnmt"))
            {
                string name = Path.GetFileNameWithoutExtension(file);
                if (name == "Globals" || name == "Info") continue;
                var fi = new FileInfo(file);
                SceneMem old; lock (memLock) mem.TryGetValue(name, out old);
                seen.Add(name);
                if (old != null && old.mtime == fi.LastWriteTimeUtc.Ticks && old.size == fi.Length) continue;
                try
                {
                    var sm = ParseScene(file); sm.mtime = fi.LastWriteTimeUtc.Ticks; sm.size = fi.Length;
                    lock (memLock) mem[name] = sm;
                    changed = true; memVersion++;
                }
                catch (Exception e) { Logger.LogWarning("Memory " + name + ": " + e.Message); }
            }
            lock (memLock) foreach (string gone in mem.Keys.Where(k => !seen.Contains(k)).ToList()) { mem.Remove(gone); changed = true; memVersion++; }
            if (changed || !File.Exists(cachePath)) SaveMemoryCache(cachePath);
        }

        static long TotalSecs(JToken t)
        {
            if (t == null || t.Type != JTokenType.Object) return 0;
            double s = (double?)t["seconds"] ?? 0, m = (double?)t["minutes"] ?? 0, h = (double?)t["hours"] ?? 0; long d = (long?)t["currentDay"] ?? 0;
            return (long)(s + m * 60 + h * 3600) + d * 86400;
        }

        static SceneMem ParseScene(string path)
        {
            JObject root;
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (var sr = new StreamReader(fs))
            using (var jr = new Newtonsoft.Json.JsonTextReader(sr))
                root = JObject.Load(jr);
            var sm = new SceneMem();
            var data = root["Data"] as JArray;
            if (data == null) return sm;
            foreach (JToken e in data)
            {
                var d = e["Data"] as JObject; string guid = (string)e["GUID"];
                var slots = d != null ? d["storageSlots"] as JArray : null;
                if (slots == null || string.IsNullOrEmpty(guid)) continue;
                var bx = new Box { slots = slots.Count, saved = TotalSecs(d["savedTimeAndDay"]) };
                var have = new Dictionary<int, int>();
                foreach (JToken s in slots)
                {
                    int id = (int?)s["itemId"] ?? -1, amt = (int?)s["itemAmount"] ?? 0;
                    if (id < 0 || amt <= 0) continue;
                    bx.used++; int cur; have.TryGetValue(id, out cur); have[id] = cur + amt;
                }
                bx.have = have.Select(kv => new KeyValuePair<int, int>(kv.Key, kv.Value)).ToList();
                var next = d["nextItemsToSpawn"] as JArray;
                if (next != null) foreach (JToken n in next) { int id = (int?)n["itemId"] ?? -1; if (id >= 0) bx.next.Add(new KeyValuePair<int, int>(id, Math.Max(1, (int?)n["itemAmount"] ?? 1))); }
                var ss = d["spawnSettings"];
                if (ss != null) { bx.ttl = (int?)ss["timetospawn"] ?? 0; bx.wait = (bool?)ss["waitingSpawn"] ?? false; bx.dayS = (int?)ss["daySpawned"] ?? 0; }
                sm.boxes[guid.ToLowerInvariant()] = bx;
            }
            return sm;
        }

        void SaveMemoryCache(string path)
        {
            try
            {
                var scenes = new JObject();
                lock (memLock)
                    foreach (var kv in mem)
                    {
                        var arr = new JArray();
                        foreach (var b in kv.Value.boxes)
                            arr.Add(new JArray(b.Key, new JArray(b.Value.have.Select(h => new JArray(h.Key, h.Value))), new JArray(b.Value.next.Select(h => new JArray(h.Key, h.Value))),
                                b.Value.ttl, b.Value.wait ? 1 : 0, b.Value.dayS, b.Value.slots, b.Value.used, b.Value.saved));
                        scenes[kv.Key] = new JObject { ["m"] = kv.Value.mtime, ["s"] = kv.Value.size, ["b"] = arr };
                    }
                File.WriteAllText(path, new JObject { ["scenes"] = scenes }.ToString(Newtonsoft.Json.Formatting.None));
            }
            catch (Exception e) { Logger.LogWarning("Memory cache save: " + e.Message); }
        }

        // The contents of a container now, and a note on its restock (null if it never restocks).
        void PredictBox(Box b, long nowSec, int curDay, out List<KeyValuePair<int, int>> have, out string note)
        {
            have = b.have; note = null;
            if (!b.wait) return;
            long elapsed = nowSec - b.saved;
            bool due = b.ttl > 0 ? b.ttl - elapsed < 1 : curDay > b.dayS;
            if (due && b.next.Count > 0)
            {
                var merged = b.have.ToDictionary(kv => kv.Key, kv => kv.Value);
                int free = Math.Max(0, b.slots - b.used), added = 0;
                foreach (var n in b.next)
                {
                    if (added >= free) break;
                    int cur; merged.TryGetValue(n.Key, out cur); merged[n.Key] = cur + n.Value; added++;
                }
                have = merged.Select(kv => new KeyValuePair<int, int>(kv.Key, kv.Value)).ToList();
                note = Loc.T("Restocked while you were away (predicted)");
            }
            else if (due) note = Loc.T("Restocks");
            else
            {
                long left = b.ttl - elapsed; int hours = (int)Math.Max(1, left / 3600);
                note = Loc.T("Restocks") + " " + Loc.T("in about") + " " + (hours >= 48 ? (hours / 24) + " " + Loc.T("days") : hours + " h");
            }
        }

        // Fills in what the save says about the containers of a place you are not in. Cheap: redone only when the save or the game clock moves.
        List<PointData> WithMemory(string scene, List<PointData> pts)
        {
            if (!cfgMemory.Value || scene == null) return pts;
            SceneMem sm; lock (memLock) mem.TryGetValue(scene, out sm);
            if (sm == null || sm.boxes.Count == 0) return pts;
            var tod = TimeOfDayAzure.instance; if (tod == null) return pts;
            long now = (long)tod.currentTimeAndDay.TotalSeconds; int day = tod.currentTimeAndDay.currentDay;
            string key = memVersion + "|" + now / 900;
            string was; if (memApplied.TryGetValue(scene, out was) && was == key) return pts;
            memApplied[scene] = key;
            foreach (PointData p in pts)
            {
                Box b;
                if (string.IsNullOrEmpty(p.g) || !sm.boxes.TryGetValue(p.g.ToLowerInvariant(), out b)) continue;
                List<KeyValuePair<int, int>> have; string note;
                PredictBox(b, now, day, out have, out note);
                p.mem = true; p.live = true; p.have = have; p.empty = have.Count == 0; p.restock = note;
            }
            return pts;
        }
    }
}

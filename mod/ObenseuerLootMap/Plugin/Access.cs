using System;
using System.Collections.Generic;
using System.Linq;
using BepInEx.Configuration;
using Pathfinding;
using UnityEngine;

namespace ObenseuerLootMap
{
    // 0.7.7: spots behind locked doors. The game's doors never block its pathfinding (they only tag the doorway), so the mod asks the pathfinder
    // for everything you can reach from where you stand while treating locked doors as walls, and marks the spots outside that area.
    public partial class LootMapPlugin
    {
        ConfigEntry<bool> cfgAccess, cfgHideLocked;

        void BindAccessConfig()
        {
            cfgAccess = Config.Bind("Filters", "MarkBehindLockedDoors", true, "While searching, mark spots you cannot walk to without passing a locked door (lockpick or key).");
            cfgHideLocked = Config.Bind("Filters", "HideBehindLockedDoors", false, "While searching, hide the spots behind locked doors (and leave them out of planned routes).");
        }

        internal const float ReachRadius = 90f;

        class LockedDoorPos { public Vector3 pos; public bool pick; }

        class DoorBlocker : ITraversalProvider
        {
            readonly List<LockedDoorPos> doors; readonly bool keyOnly; readonly Vector3 start;
            public DoorBlocker(List<LockedDoorPos> d, bool keyDoorsOnly, Vector3 from) { doors = d; keyOnly = keyDoorsOnly; start = from; }
            public bool CanTraverse(Path path, GraphNode node)
            {
                if (!path.CanTraverse(node)) return false;
                Vector3 p = (Vector3)node.position;
                float fx = p.x - start.x, fz = p.z - start.z;
                if (fx * fx + fz * fz > ReachRadius * ReachRadius || Mathf.Abs(p.y - start.y) > 30f) return false;   // keep the search small
                if ((p - start).sqrMagnitude < 2.25f) return true;   // never block the spot you stand on
                foreach (var d in doors)
                {
                    if (keyOnly && d.pick) continue;
                    float dy = Mathf.Abs(p.y - d.pos.y); if (dy > 2.2f) continue;
                    float dx = p.x - d.pos.x, dz = p.z - d.pos.z, s = dx * dx + dz * dz;
                    if (s < 0.64f || (node.Tag == 3 && s < 4f)) return false;
                }
                return true;
            }
            public uint GetTraversalCost(Path path, GraphNode node) { return path.GetTagPenalty((int)node.Tag) + node.Penalty; }
        }

        HashSet<GraphNode> reachAny, reachKey;   // reachable with every locked door shut / with only the key doors shut
        ConstantPath pathAny, pathKey; string reachSig; string reachScene; float reachNext, reachStamp; Vector3 reachFrom; int accessVersion;
        readonly Dictionary<PointData, int> accessMemo = new Dictionary<PointData, int>();
        List<LockedDoorPos> lockedNow = new List<LockedDoorPos>();
        string doorScene; float doorScanAt;

        void ScanLockedDoors(string scene)
        {
            var l = new List<LockedDoorPos>();
            foreach (var d in FindObjectsByType<Door>(FindObjectsInactive.Exclude, FindObjectsSortMode.None))
            {
                if (d == null || d.gameObject.scene.name != scene) continue;
                var lk = d._Lock; if (lk == null || !lk.Locked) continue;
                l.Add(new LockedDoorPos { pos = d.transform.position, pick = lk.Lockpickable });
            }
            lockedNow = l;
        }

        // Called every frame; does its work at most every couple of seconds, and only while a search is on.
        void AccessTick()
        {
            try
            {
                if (cfgAccess == null || !cfgAccess.Value || !cfgEnabled.Value) return;
                if (pathAny != null || pathKey != null)
                {
                    if ((pathAny != null && !pathAny.IsDone()) || (pathKey != null && !pathKey.IsDone())) return;
                    HashSet<GraphNode> a = Collect(pathAny), k = Collect(pathKey);
                    pathAny = null; pathKey = null;
                    if (a != null && k != null) { reachAny = a; reachKey = k; } else { reachAny = null; reachKey = null; }
                    accessMemo.Clear(); accessVersion++; reachStamp = Time.unscaledTime;
                    return;
                }
                string scene = CurrentScene;
                if (Typing) return;   // never do heavy work while the search box is being typed in
                if (!Searching || string.IsNullOrEmpty(scene) || AstarPath.active == null) { if (reachAny != null && !Searching) { reachAny = null; reachKey = null; accessMemo.Clear(); accessVersion++; } return; }
                if (Time.unscaledTime < reachNext) return;
                reachNext = Time.unscaledTime + 1.5f;
                if (liveScene != scene) return;
                if (scene != doorScene || Time.unscaledTime - doorScanAt > 20f) { ScanLockedDoors(scene); doorScene = scene; doorScanAt = Time.unscaledTime; }
                if (lockedNow.Count == 0) { if (reachAny != null) { reachAny = null; reachKey = null; accessMemo.Clear(); accessVersion++; } return; }
                Camera cam = Camera.main; if (cam == null) return;
                Vector3 me = cam.transform.position; me.y -= 1.6f;
                string sig = scene + "|" + string.Join(",", lockedNow.Select(d => Mathf.RoundToInt(d.pos.x) + ":" + Mathf.RoundToInt(d.pos.z) + (d.pick ? "p" : "k"))) + "|" + Mathf.RoundToInt(me.x / 5f) + ":" + Mathf.RoundToInt(me.z / 5f) + ":" + Mathf.RoundToInt(me.y / 2f);
                if (sig == reachSig && Time.unscaledTime - reachStamp < 20f) return;
                reachSig = sig; reachScene = scene; reachFrom = me;
                pathAny = ConstantPath.Construct(me, 150000); pathAny.traversalProvider = new DoorBlocker(lockedNow, false, me);
                pathKey = ConstantPath.Construct(me, 150000); pathKey.traversalProvider = new DoorBlocker(lockedNow, true, me);
                AstarPath.StartPath(pathAny); AstarPath.StartPath(pathKey);
            }
            catch (Exception ex) { pathAny = null; pathKey = null; reachNext = Time.unscaledTime + 10f; Logger.LogWarning("Access check failed: " + ex.Message); }
        }

        static HashSet<GraphNode> Collect(ConstantPath p)
        {
            if (p == null || p.error || p.allNodes == null || p.allNodes.Count == 0 || p.allNodes.Count > 200000) return null;
            return new HashSet<GraphNode>(p.allNodes);
        }

        // 0 = reachable (or unknown), 1 = behind a lockpickable door, 2 = behind a door that needs a key or cannot be opened.
        internal int Access(string scene, PointData p)
        {
            if (p == null || reachAny == null || reachKey == null || scene != CurrentScene || scene != reachScene || cfgAccess == null || !cfgAccess.Value) return 0;
            int r;
            if (accessMemo.TryGetValue(p, out r)) return r;
            r = 0;
            try
            {
                var pos = new Vector3(p.x, p.y, p.z);
                float gx = pos.x - reachFrom.x, gz = pos.z - reachFrom.z;
                if (gx * gx + gz * gz > (ReachRadius - 5f) * (ReachRadius - 5f) || Mathf.Abs(pos.y - reachFrom.y) > 28f) { accessMemo[p] = 0; return 0; }
                NNInfo nn = AstarPath.active.GetNearest(pos);
                if (nn.node != null && (nn.position - pos).sqrMagnitude < 9f && !reachAny.Contains(nn.node))
                    r = reachKey.Contains(nn.node) ? 1 : 2;
            }
            catch { r = 0; }
            accessMemo[p] = r;
            return r;
        }

        static string AccessTip(int a)
        {
            return a == 1 ? "<color=#6b3fa0><b>🔒 " + Loc.T("Behind a locked door") + "</b> (" + Loc.T("lockpick") + ")</color>\n"
                 : a == 2 ? "<color=#b0651a><b>🔒 " + Loc.T("Behind a locked door") + "</b> (" + Loc.T("needs a key or cannot be opened") + ")</color>\n" : "";
        }
    }
}

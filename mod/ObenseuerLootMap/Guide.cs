using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ObenseuerLootMap
{
    // "Guide me there": a HUD arrow toward a chosen marker (through doors when it is in another building),
    // and small in-world icons on nearby containers that match the current search.
    public partial class LootMapPlugin
    {
        class GuideTarget { public string scene, label; public Vector3 pos; }
        GuideTarget guide; float arrivedAt = -1;
        Texture2D arrowTex, diamondTex, diamondEdgeTex;
        internal bool Guiding => guide != null;

        internal void SetGuide(string scene, Vector3 pos, string label)
        {
            guide = new GuideTarget { scene = scene, pos = pos, label = label };
            arrivedAt = -1;
        }
        internal void ClearGuide() { guide = null; arrivedAt = -1; }
        internal string GuideLabel => guide == null ? null : guide.label + (guide.scene != CurrentScene ? " (" + Db.SceneName(guide.scene) + ")" : "");

        void UpdateGuide()
        {
            if (guide == null || Camera.main == null) return;
            if (guide.scene == CurrentScene && Vector3.Distance(Camera.main.transform.position - Vector3.up * 1.2f, guide.pos) < 2.2f)
            {
                if (arrivedAt < 0) arrivedAt = Time.unscaledTime;
                else if (Time.unscaledTime - arrivedAt > 4f) ClearGuide();
            }
        }

        // Where to walk next: the target itself, or the door that leads toward it.
        bool NextWaypoint(out Vector3 wp, out string text)
        {
            wp = Vector3.zero; text = null;
            var cur = CurrentScene; if (guide == null || cur == null) return false;
            if (guide.scene == cur) { wp = guide.pos; text = guide.label; return true; }
            Db.scenes.TryGetValue(cur, out var here);
            var doors = here?.doors ?? new List<DoorData>();
            var cam = Camera.main; Vector3 me = cam != null ? cam.transform.position : Vector3.zero;
            DoorData Nearest(IEnumerable<DoorData> ds) => ds.OrderBy(d => (new Vector3(d.x, d.y, d.z) - me).sqrMagnitude).FirstOrDefault();
            var direct = Nearest(doors.Where(d => d.to == guide.scene));
            if (direct != null) { wp = new Vector3(direct.x, direct.y, direct.z); text = $"{Loc.T("Go through the door to")} {Db.SceneName(guide.scene)}"; return true; }
            // two hops: a door to a place that has a door to the target
            var hop = Nearest(doors.Where(d => Db.scenes.TryGetValue(d.to, out var s2) && s2.doors.Any(x => x.to == guide.scene)));
            if (hop != null) { wp = new Vector3(hop.x, hop.y, hop.z); text = $"{Loc.T("Go through the door to")} {Db.SceneName(hop.to)} → {Db.SceneName(guide.scene)}"; return true; }
            if (Indoors)
            {
                var outDoor = Nearest(doors.Where(d => d.to.StartsWith("Open Sewer")));
                if (outDoor != null) { wp = new Vector3(outDoor.x, outDoor.y, outDoor.z); text = $"{Loc.T("Go outside")} → {Db.SceneName(guide.scene)}"; return true; }
            }
            text = $"{Loc.T("Head to")} {Db.SceneName(guide.scene)}";
            return false;
        }

        void EnsureHudTextures()
        {
            if (arrowTex != null && diamondTex != null && diamondEdgeTex != null) return;
            const int n = 64;
            arrowTex = new Texture2D(n, n, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            diamondTex = new Texture2D(32, 32, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            diamondEdgeTex = new Texture2D(32, 32, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    // arrow pointing up: triangle head + shaft
                    float u = (x - n / 2f) / (n / 2f), v = y / (float)n;   // v: 0 bottom .. 1 top
                    bool head = v > 0.45f && Mathf.Abs(u) < (1f - v) * 1.8f;
                    bool shaft = v <= 0.47f && v > 0.05f && Mathf.Abs(u) < 0.22f;
                    arrowTex.SetPixel(x, y, head || shaft ? Color.white : Color.clear);
                }
            for (int y = 0; y < 32; y++)
                for (int x = 0; x < 32; x++)
                {
                    float d = Mathf.Abs(x - 15.5f) + Mathf.Abs(y - 15.5f);
                    diamondTex.SetPixel(x, y, d < 12f ? Color.white : Color.clear);
                    diamondEdgeTex.SetPixel(x, y, d < 15.5f ? Color.white : Color.clear);
                }
            arrowTex.Apply(); diamondTex.Apply(); diamondEdgeTex.Apply();
        }

        static string Floors(float dy)
        {
            int f = Mathf.RoundToInt(dy / 3f);
            if (f == 0) return "";
            return f > 0 ? $" · {f} {Loc.T(f == 1 ? "floor up" : "floors up")}" : $" · {-f} {Loc.T(f == -1 ? "floor down" : "floors down")}";
        }

        void DrawHud()
        {
            var cam = Camera.main; if (cam == null) return;
            EnsureHudTextures(); InitStyles();
            if (Searching && cfgWorld.Value && cfgEnabled.Value) DrawWorldHighlights(cam);
            if (guide == null) return;
            bool have = NextWaypoint(out var wp, out var text);
            float cx = Screen.width / 2f, top = 70f;
            string line = text;
            if (have)
            {
                var me = cam.transform.position - Vector3.up * 1.6f;
                float dist = Vector3.Distance(new Vector3(me.x, 0, me.z), new Vector3(wp.x, 0, wp.z));
                line += $" · {dist:0} m" + Floors(wp.y - me.y);
                if (arrivedAt >= 0) line = $"{Loc.T("You are there")}: {guide.label}";
                var v = cam.transform.InverseTransformPoint(wp);
                float ang = Mathf.Atan2(v.x, v.z) * Mathf.Rad2Deg;
                var old = GUI.matrix; var oldC = GUI.color;
                GUIUtility.RotateAroundPivot(ang, new Vector2(cx, top));
                GUI.color = new Color(0, 0, 0, .6f); GUI.DrawTexture(new Rect(cx - 21, top - 21, 42, 42), arrowTex);
                GUI.color = arrivedAt >= 0 ? new Color(.6f, .9f, .5f) : new Color(.95f, .8f, .45f); GUI.DrawTexture(new Rect(cx - 18, top - 18, 36, 36), arrowTex);
                GUI.matrix = old; GUI.color = oldC;
                // target marker in the world when it is on screen
                var sp = cam.WorldToScreenPoint(wp + Vector3.up * 0.4f);
                if (sp.z > 0) { GUI.color = new Color(.95f, .8f, .45f); GUI.DrawTexture(new Rect(sp.x - 9, Screen.height - sp.y - 9, 18, 18), diamondEdgeTex); GUI.color = oldC; }
            }
            var content = new GUIContent($"{Loc.T("Guiding to")} <b>{GuideLabel}</b>\n{line}");
            float w = Mathf.Min(520f, tipStyle.CalcSize(content).x + 20f), h = tipStyle.CalcHeight(content, w);
            GUI.Box(new Rect(cx - w / 2f, top + 26, w, h), content, tipStyle);
        }

        void DrawWorldHighlights(Camera cam)
        {
            var cur = CurrentScene; if (cur == null) return;
            var me = cam.transform.position; var oldC = GUI.color;
            int drawn = 0;
            foreach (var p in PointsOf(cur))
            {
                if (p.live && p.empty) continue;
                if (cfgFreeOnly.Value && p.s == 1) continue;
                var pos = new Vector3(p.x, p.y, p.z);
                float d = Vector3.Distance(me, pos);
                if (d > 25f || Mathf.Abs(pos.y - (me.y - 1.6f)) > 3.2f) continue;
                if (!PointMatches(p)) continue;
                var sp = cam.WorldToScreenPoint(pos + Vector3.up * 0.25f);
                if (sp.z <= 0) continue;
                float s = Mathf.Lerp(20f, 10f, d / 25f);
                var r = new Rect(sp.x - s / 2, Screen.height - sp.y - s / 2, s, s);
                GUI.color = p.s == 1 ? new Color(.8f, .12f, .1f, .9f) : new Color(.1f, .1f, .08f, .85f);
                GUI.DrawTexture(new Rect(r.x - 2, r.y - 2, r.width + 4, r.height + 4), diamondEdgeTex);
                GUI.color = HasNow(p) ? (Color)ColHasNow : p.k == "p" ? new Color(.12f, .6f, .7f) : new Color(.95f, .62f, .1f);
                GUI.DrawTexture(r, diamondTex);
                if (d < 7f && p.t != null) { GUI.color = oldC; GUI.Label(new Rect(r.xMax + 4, r.y - 2, 220, 22), p.t, smallStyle); }
                if (++drawn > 60) break;
            }
            GUI.color = oldC;
        }
    }
}

using System.Collections.Generic;
using BepInEx.Configuration;
using UnityEngine;

namespace ObenseuerLootMap
{
    // 0.7.4: doors inside buildings (with their lock) and stairs, ladders and elevator stops on the map (from the website's data).
    public class InnerDoorData { public float x, y, z; public string lk; public float df; }
    public class VertData { public string k; public float x, y, z; }

    public partial class LootMapPlugin
    {
        ConfigEntry<bool> cfgInside;
        InnerDoorData hoveredInner; VertData hoveredVert; Vector2 hoveredInsideAt;
        internal bool InsideHovered { get { return hoveredInner != null || hoveredVert != null; } }

        void BindInsideConfig()
        {
            cfgInside = Config.Bind("Filters", "InsideDoorsAndStairs", true, "Show the doors inside buildings (with their lock), stairs, ladders and elevator stops, and tree debris (wood piles to chop with an axe) on the map.");
        }

        static string VertName(string k) { return k == "w" ? Loc.T("Tree debris") : k == "l" ? Loc.T("Ladder") : k == "e" ? Loc.T("Elevator") : Loc.T("Stairs"); }
        static Color VertColor { get { return new Color32(46, 122, 104, 255); } }
        static Color WoodColor { get { return new Color32(138, 90, 43, 255); } }

        bool InsideOnFloor(float y)
        {
            return !(Indoors && cfgFloorOnly.Value && Mathf.Abs(y - PlayerY()) > 2.2f);
        }

        void DrawInside()
        {
            hoveredInner = null; hoveredVert = null;
            if ((Object)(object)layer == (Object)null || (Object)(object)info_map.instance == (Object)null) return;
            SceneData sd;
            if (!Db.scenes.TryGetValue(CurrentScene ?? "", out sd)) return;
            Vector2 mouse = Event.current.mousePosition;
            bool repaint = Event.current.type == EventType.Repaint;
            Color prev = GUI.color;
            foreach (InnerDoorData d in sd.idoors)
            {
                if (!InsideOnFloor(d.y)) continue;
                Vector2 p = GuiPointOnMap(new Vector3(d.x, d.y, d.z));
                if (!mapScreenRect.Contains(p)) continue;
                bool hov = (p - mouse).sqrMagnitude < 49f;
                if (hov) { hoveredInner = d; hoveredInsideAt = p; }
                string st = string.IsNullOrEmpty(d.lk) ? "open" : d.lk;
                GUI.color = DoorColor(st);
                GUI.DrawTexture(new Rect(p.x - 3.5f, p.y - 3.5f, 7f, 7f), Texture2D.whiteTexture);
                GUI.color = Paper;
                if (st == "open") GUI.DrawTexture(new Rect(p.x - 1f, p.y - 2f, 2f, 4f), Texture2D.whiteTexture);
                else GUI.DrawTexture(new Rect(p.x - 2f, p.y - 0.5f, 4f, 3f), Texture2D.whiteTexture);
                if (st == "blocked") { GUI.color = new Color(0.8f, 0.12f, 0.1f); GUI.DrawTexture(new Rect(p.x - 3.5f, p.y - 0.5f, 7f, 1.2f), Texture2D.whiteTexture); }
            }
            foreach (VertData v in sd.verts)
            {
                if (!InsideOnFloor(v.y)) continue;
                Vector2 p = GuiPointOnMap(new Vector3(v.x, v.y, v.z));
                if (!mapScreenRect.Contains(p)) continue;
                bool hov = (p - mouse).sqrMagnitude < 64f;
                if (hov) { hoveredVert = v; hoveredInsideAt = p; hoveredInner = null; }
                GUI.color = v.k == "w" ? WoodColor : VertColor;
                GUI.DrawTexture(new Rect(p.x - 4.5f, p.y - 4.5f, 9f, 9f), Texture2D.whiteTexture);
                GUI.color = Paper;
                if (v.k == "w")   // tree debris: two logs
                {
                    GUI.DrawTexture(new Rect(p.x - 3.5f, p.y - 2.5f, 7f, 1.6f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x - 3.5f, p.y + 0.9f, 7f, 1.6f), Texture2D.whiteTexture);
                }
                else if (v.k == "l")   // ladder: two rails and rungs
                {
                    GUI.DrawTexture(new Rect(p.x - 2.5f, p.y - 3.5f, 1f, 7f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x + 1.5f, p.y - 3.5f, 1f, 7f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x - 2.5f, p.y - 1.5f, 5f, 1f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x - 2.5f, p.y + 1.2f, 5f, 1f), Texture2D.whiteTexture);
                }
                else if (v.k == "e")   // elevator: up and down bars
                {
                    GUI.DrawTexture(new Rect(p.x - 2.5f, p.y - 3.5f, 5f, 2f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x - 1f, p.y - 1.5f, 2f, 3f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x - 2.5f, p.y + 1.5f, 5f, 2f), Texture2D.whiteTexture);
                }
                else   // stairs: three steps
                {
                    GUI.DrawTexture(new Rect(p.x - 3.5f, p.y + 1.5f, 3f, 2f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x - 1.5f, p.y - 0.5f, 3f, 2f), Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x + 0.5f, p.y - 2.5f, 3f, 2f), Texture2D.whiteTexture);
                }
            }
            GUI.color = prev;
        }

        // Tooltip text for whatever inside marker is hovered (null if none).
        string InsideTip()
        {
            if (hoveredVert != null) return "<b><size=15>" + VertName(hoveredVert.k) + "</size></b>\n" + (hoveredVert.k == "w" ? Loc.T("Wood pile you can chop with an axe") + "\n" : "") + "<color=#7a6f5c>" + Loc.T("Click to go there") + "</color>";
            if (hoveredInner != null)
            {
                string st = string.IsNullOrEmpty(hoveredInner.lk) ? "open" : hoveredInner.lk;
                string t = "<b><size=15>" + Loc.T("Door") + "</size></b>\n" + DoorText(st);
                if (st == "pick" && hoveredInner.df > 0f) t += " · " + DifficultyText(hoveredInner.df);
                return t + "\n<color=#7a6f5c>" + Loc.T("Click to go there") + "</color>";
            }
            return null;
        }

        bool InsideClick()
        {
            if (hoveredVert != null) { SetGuide(CurrentScene, new Vector3(hoveredVert.x, hoveredVert.y, hoveredVert.z), VertName(hoveredVert.k)); return true; }
            if (hoveredInner != null) { SetGuide(CurrentScene, new Vector3(hoveredInner.x, hoveredInner.y, hoveredInner.z), Loc.T("Door")); return true; }
            return false;
        }
    }
}

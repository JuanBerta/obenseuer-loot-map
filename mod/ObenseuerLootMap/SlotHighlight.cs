using System.Collections.Generic;
using HarmonyLib;
using UnityEngine;
using UnityEngine.UI;

namespace ObenseuerLootMap
{
    // While a search is active, slots of an opened container / shop that hold a searched item get a green frame.
    public partial class LootMapPlugin
    {
        StoragePanelUI storagePanel; float nextSlotCheck, nextPanelSearch;
        Sprite frameSprite, glowSprite;
        readonly Dictionary<Slot, GameObject> slotFrames = new Dictionary<Slot, GameObject>();

        void EnsureFrameSprites()
        {
            if (frameSprite != null && glowSprite != null) return;
            const int n = 16, b = 3;
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Point };
            var g = new Texture2D(4, 4, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                    t.SetPixel(x, y, x < b || y < b || x >= n - b || y >= n - b ? Color.white : Color.clear);
            for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) g.SetPixel(x, y, Color.white);
            t.Apply(); g.Apply();
            frameSprite = Sprite.Create(t, new Rect(0, 0, n, n), new Vector2(.5f, .5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(b + 1, b + 1, b + 1, b + 1));
            glowSprite = Sprite.Create(g, new Rect(0, 0, 4, 4), new Vector2(.5f, .5f), 100f);
            frameSprite.hideFlags = glowSprite.hideFlags = HideFlags.HideAndDontSave;
        }

        void UpdateSlotHighlights()
        {
            if (Time.unscaledTime < nextSlotCheck) return;
            nextSlotCheck = Time.unscaledTime + 0.15f;
            var ids = MatchedIds;
            bool active = cfgEnabled.Value && ids != null && ids.Count > 0;
            if ((storagePanel == null) && Time.unscaledTime > nextPanelSearch)
            {
                nextPanelSearch = Time.unscaledTime + 2f;
                storagePanel = FindAnyObjectByType<StoragePanelUI>(FindObjectsInactive.Include);
            }
            var seen = new HashSet<Slot>();
            if (active && storagePanel != null && storagePanel.isActiveAndEnabled && storagePanel.storageSlotPanel != null)
            {
                EnsureFrameSprites();
                foreach (var slot in storagePanel.storageSlotPanel.GetComponentsInChildren<Slot>(false))
                {
                    seen.Add(slot);
                    bool hit = false;
                    var stack = slot.slotcontrol != null ? slot.slotcontrol.itemStack : null;
                    if (stack != null)
                    {
                        var tr = Traverse.Create(stack);
                        int id = tr.Field("itemId").GetValue<int>(), amt = tr.Field("itemAmount").GetValue<int>();
                        hit = amt > 0 && ids.Contains(id);
                    }
                    SetFrame(slot, hit);
                }
            }
            // hide frames on slots that are no longer shown / matching
            foreach (var kv in slotFrames)
                if (kv.Key == null || !seen.Contains(kv.Key)) { if (kv.Value != null) kv.Value.SetActive(false); }
        }

        void SetFrame(Slot slot, bool on)
        {
            slotFrames.TryGetValue(slot, out var go);
            if (!on) { if (go != null) go.SetActive(false); return; }
            if (go == null)
            {
                go = new GameObject("LootMapFound", typeof(RectTransform));
                var rt = go.GetComponent<RectTransform>();
                rt.SetParent(slot.transform, false);
                rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = new Vector2(-1, -1); rt.offsetMax = new Vector2(1, 1);
                var glow = new GameObject("glow", typeof(RectTransform)); var grt = glow.GetComponent<RectTransform>();
                grt.SetParent(rt, false); grt.anchorMin = Vector2.zero; grt.anchorMax = Vector2.one; grt.offsetMin = grt.offsetMax = Vector2.zero;
                var gi = glow.AddComponent<Image>(); gi.sprite = glowSprite; gi.color = new Color(0.24f, 0.86f, 0.35f, 0.22f); gi.raycastTarget = false;
                var fi = go.AddComponent<Image>(); fi.sprite = frameSprite; fi.type = Image.Type.Sliced; fi.color = new Color(0.24f, 0.86f, 0.35f, 1f); fi.raycastTarget = false;
                slotFrames[slot] = go;
            }
            go.transform.SetAsLastSibling();
            if (!go.activeSelf) go.SetActive(true);
        }
    }
}

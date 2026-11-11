using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ObenseuerLootMap
{
    // Shape of lootmap-data.json (built by tools/build_mod_data.py).
    public class LootDb
    {
        public int version;
        public Dictionary<string, SceneData> scenes = new Dictionary<string, SceneData>();
        public Dictionary<string, List<List<int>>> loot = new Dictionary<string, List<List<int>>>();   // table -> [common ids, rare ids]
        public Dictionary<string, List<object>> items = new Dictionary<string, List<object>>();        // id -> [title, value]
        public Dictionary<string, List<string>> recipes = new Dictionary<string, List<string>>();      // recipe type -> recipe names
        public Dictionary<string, JArray> recipeInputs = new Dictionary<string, JArray>();             // recipe id -> [name, type, [item ids]]
        public Dictionary<string, List<object>> furniture = new Dictionary<string, List<object>>();    // furniture id -> [title, category, priceOC, priceRM, [recipe types]]
        public Dictionary<string, List<string>> typeSkills = new Dictionary<string, List<string>>();   // recipe type -> skills it trains

        [JsonIgnore] Dictionary<string, int> furnByTitle;
        public int FurnIdByTitle(string title)
        {
            if (furnByTitle == null)
            {
                furnByTitle = new Dictionary<string, int>(System.StringComparer.OrdinalIgnoreCase);
                foreach (var kv in furniture) if (kv.Value.Count > 0) furnByTitle[kv.Value[0].ToString().Trim()] = int.Parse(kv.Key);
            }
            return title != null && furnByTitle.TryGetValue(title.Trim(), out var id) ? id : 0;
        }

        public IEnumerable<string> SkillsFor(IEnumerable<string> types) =>
            types.SelectMany(t => typeSkills.TryGetValue(t, out var s) ? s : new List<string>()).Distinct();

        public List<string> FurnTypes(int id) =>
            furniture.TryGetValue(id.ToString(), out var v) && v.Count > 4 && v[4] is JArray a ? a.Select(x => x.ToString()).ToList() : new List<string>();

        [JsonIgnore] public Dictionary<string, string> TableText = new Dictionary<string, string>();
        [JsonIgnore] public Dictionary<string, HashSet<int>> TableItems = new Dictionary<string, HashSet<int>>();
        [JsonIgnore] public Dictionary<string, string> StationText = new Dictionary<string, string>();

        public static LootDb Load(string path)
        {
            var db = JsonConvert.DeserializeObject<LootDb>(File.ReadAllText(path));
            foreach (var kv in db.loot)
            {
                var ids = kv.Value.SelectMany(l => l).ToList();
                db.TableItems[kv.Key] = new HashSet<int>(ids);
                db.TableText[kv.Key] = (kv.Key + "\n" + string.Join("\n", ids.Select(db.ItemName))).ToLowerInvariant();
            }
            foreach (var s in db.scenes.Values)
                foreach (var st in s.stations)
                    db.StationTextFor(st.n, st.r);
            return db;
        }

        public string StationTextFor(string name, List<string> types)
        {
            if (!StationText.TryGetValue(name, out var t))
                StationText[name] = t = (name + "\n" + string.Join("\n", types) + "\n" + string.Join("\n", SkillsFor(types)) + "\n" +
                    string.Join("\n", types.SelectMany(x => recipes.TryGetValue(x, out var r) ? r : new List<string>()))).ToLowerInvariant();
            return t;
        }

        public string ItemName(int id) =>
            items.TryGetValue(id.ToString(), out var v) && v.Count > 0 ? Loc.Item(v[0].ToString()) : "Item #" + id;

        public string ItemValue(int id) =>
            items.TryGetValue(id.ToString(), out var v) && v.Count > 1 ? v[1].ToString() : "";

        IEnumerable<string> ItemField(int id, int idx)
        {
            if (!items.TryGetValue(id.ToString(), out var v) || v.Count <= idx) return Enumerable.Empty<string>();
            return v[idx] is JArray a ? a.Select(x => x.ToString()) : Enumerable.Empty<string>();
        }

        public bool Sells(VendorData v, int id) =>
            (v.i != null && v.i.Contains(id)) || (v.t != null && TableItems.TryGetValue(v.t, out var s) && s.Contains(id));

        // Same rules as Trade.CheckIfAllowed: categories, "_item_<Title>" and "_Meta_<MetaType>" entries.
        public bool Buys(VendorData v, int id)
        {
            if (v.b != 1 || !items.TryGetValue(id.ToString(), out var it)) return false;
            string title = it[0].ToString();
            var cats = ItemField(id, 2).ToList(); var metas = ItemField(id, 3).ToList();
            bool Match(string rule)
            {
                if (rule.StartsWith("_item_")) return string.Equals(rule.Substring(6), title, System.StringComparison.OrdinalIgnoreCase);
                if (rule.StartsWith("_Meta_")) { var m = rule.Substring(6); return metas.Any(x => x.EndsWith(m, System.StringComparison.OrdinalIgnoreCase)); }
                return cats.Any(c => string.Equals(c, rule, System.StringComparison.OrdinalIgnoreCase));
            }
            bool allowed = v.ba == null || v.ba.Count == 0 || v.ba.Any(Match);
            return allowed && !(v.bf != null && v.bf.Any(Match));
        }

        public string FurnName(int id) =>
            furniture.TryGetValue(id.ToString(), out var v) && v.Count > 0 ? v[0].ToString() : "Furniture #" + id;

        public string FurnInfo(int id)
        {
            if (!furniture.TryGetValue(id.ToString(), out var v) || v.Count < 4) return FurnName(id);
            string price = (System.Convert.ToInt32(v[2]) > 0 ? v[2] + " OC" : "") + (System.Convert.ToInt32(v[3]) > 0 ? (System.Convert.ToInt32(v[2]) > 0 ? " / " : "") + v[3] + " RM" : "");
            var skills = SkillsFor(FurnTypes(id)).ToList();
            return v[0] + " · " + v[1] + (price.Length > 0 ? " · " + price : "") + (skills.Count > 0 ? " · " + Loc.T("trains") + " " + string.Join(", ", skills) : "");
        }

        public bool FurnSells(VendorData v, int id) => v.fs != null && v.fs.Contains(id);

        // FurnitureShop.CanSell: buysAnything, or (canSellItems and) same as its stock / its sell lists.
        public bool FurnBuys(VendorData v, int id)
        {
            if (v.fb == null) return false;
            if (v.fb.Type == JTokenType.String)
            {
                var mode = v.fb.ToString();
                return mode == "any" || (mode == "same" && FurnSells(v, id));
            }
            return v.fb.Type == JTokenType.Array && v.fb.Values<int>().Contains(id);
        }

        public string SceneName(string scene) =>
            scene != null && scenes.TryGetValue(scene, out var s) && !string.IsNullOrEmpty(s.name) ? s.name : scene?.Replace("Interior ", "");
    }

    public class SceneData
    {
        public string name;                      // friendly name from the door signs ("Sewerview Inn")
        public string map;                       // in-game map sprite name (map_tenement_001 / map_mines_001)
        public int free, steal;
        public List<PointData> points = new List<PointData>();
        public List<StationData> stations = new List<StationData>();
        public List<DoorData> doors = new List<DoorData>();
        public List<VendorData> vendors = new List<VendorData>();
    }

    public class PointData
    {
        public string k;      // "c" container, "p" pickup spot
        public float x, y, z;
        public string t;      // loot table name
        public string n;      // display name
        public int s;         // 1 = taking counts as stealing
        public int l;         // 1 = locked
        public string o;      // owner name
        public List<int> f;   // fixed items
        public string g;      // save GUID (trash containers), to match Scavenger's "searched today"

        // Live state (current scene only)
        [JsonIgnore] public bool live, empty;
        [JsonIgnore] public List<KeyValuePair<int, int>> have;   // item id, amount
        [JsonIgnore] public string restock;
    }

    public class StationData
    {
        public string n;      // station name (Drill, Lathe...)
        public float x, y, z;
        public List<string> r = new List<string>();  // recipe types
        public int s;         // 1 = owned by someone
        public string o;
    }

    public class DoorData
    {
        public string to;     // scene the door leads to
        public string n;      // friendly name of that place
        public float x, y, z;
        public int open;      // 0 = leads to a scene that is not in this game version
    }

    public class VendorData
    {
        public string n, o;   // shop name, trader
        public float x, y, z;
        public string t;      // stock table
        public List<int> i;   // fixed items for sale
        public int b;         // 1 = trader that buys from the player
        public List<string> ba, bf;   // buy rules: allowed / forbidden (category, _item_<Title>, _Meta_<MetaType>)
        public int bs;        // 1 = buys stolen goods
        public List<int> fs;  // furniture for sale
        public JToken fb;     // furniture it buys: "any", "same" (its own stock) or a list of furniture ids
    }
}

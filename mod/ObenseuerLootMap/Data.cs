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
                StationText[name] = t = (name + "\n" + string.Join("\n", types) + "\n" +
                    string.Join("\n", types.SelectMany(x => recipes.TryGetValue(x, out var r) ? r : new List<string>()))).ToLowerInvariant();
            return t;
        }

        public string ItemName(int id) =>
            items.TryGetValue(id.ToString(), out var v) && v.Count > 0 ? Loc.Item(v[0].ToString()) : "Item #" + id;

        public string ItemValue(int id) =>
            items.TryGetValue(id.ToString(), out var v) && v.Count > 1 ? v[1].ToString() : "";

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
    }
}

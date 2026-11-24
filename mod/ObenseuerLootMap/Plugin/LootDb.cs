using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ObenseuerLootMap;

public class LootDb
{
	public int version;

	public Dictionary<string, SceneData> scenes = new Dictionary<string, SceneData>();

	public Dictionary<string, List<List<int>>> loot = new Dictionary<string, List<List<int>>>();

	public Dictionary<string, List<object>> items = new Dictionary<string, List<object>>();

	public Dictionary<string, List<string>> recipes = new Dictionary<string, List<string>>();

	public Dictionary<string, JArray> recipeInputs = new Dictionary<string, JArray>();

	public Dictionary<string, JArray> trade = new Dictionary<string, JArray>();

	public Dictionary<string, List<object>> furniture = new Dictionary<string, List<object>>();

	public Dictionary<string, List<string>> typeSkills = new Dictionary<string, List<string>>();

	[JsonIgnore]
	private Dictionary<string, int> furnByTitle;

	[JsonIgnore]
	public Dictionary<string, string> TableText = new Dictionary<string, string>();

	[JsonIgnore]
	public Dictionary<string, HashSet<int>> TableItems = new Dictionary<string, HashSet<int>>();

	[JsonIgnore]
	public Dictionary<string, string> StationText = new Dictionary<string, string>();

	public int FurnIdByTitle(string title)
	{
		if (furnByTitle == null)
		{
			furnByTitle = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
			foreach (KeyValuePair<string, List<object>> item in furniture)
			{
				if (item.Value.Count > 0)
				{
					furnByTitle[item.Value[0].ToString().Trim()] = int.Parse(item.Key);
				}
			}
		}
		if (title == null || !furnByTitle.TryGetValue(title.Trim(), out var value))
		{
			return 0;
		}
		return value;
	}

	public IEnumerable<string> SkillsFor(IEnumerable<string> types)
	{
		return types.SelectMany((string t) => (!typeSkills.TryGetValue(t, out var value)) ? new List<string>() : value).Distinct();
	}

	public List<string> FurnTypes(int id)
	{
		if (furniture.TryGetValue(id.ToString(), out var value) && value.Count > 4)
		{
			object obj = value[4];
			JArray val = (JArray)((obj is JArray) ? obj : null);
			if (val != null)
			{
				return ((IEnumerable<JToken>)val).Select((JToken x) => ((object)x).ToString()).ToList();
			}
		}
		return new List<string>();
	}

	public int ValueOf(int id)
	{
		return (items.TryGetValue(id.ToString(), out var v) && v.Count > 1) ? (int)Convert.ToDouble(v[1]) : 0;
	}

	public float Stat(int id, string key)
	{
		if (items.TryGetValue(id.ToString(), out var v) && v.Count > 4 && v[4] is JObject o && o[key] != null)
		{
			return (float)o[key];
		}
		return 0f;
	}

	public static LootDb Load(string path)
	{
		LootDb lootDb = JsonConvert.DeserializeObject<LootDb>(File.ReadAllText(path));
		foreach (KeyValuePair<string, List<List<int>>> item in lootDb.loot)
		{
			List<int> list = item.Value.SelectMany((List<int> l) => l).ToList();
			lootDb.TableItems[item.Key] = new HashSet<int>(list);
			lootDb.TableText[item.Key] = (item.Key + "\n" + string.Join("\n", list.Select(lootDb.ItemName))).ToLowerInvariant();
		}
		foreach (SceneData value in lootDb.scenes.Values)
		{
			foreach (StationData station in value.stations)
			{
				lootDb.StationTextFor(station.n, station.r);
			}
		}
		return lootDb;
	}

	// Furniture shops sell under a longer name than the placed workstation has (“Metalworking Lathe” → “Lathe”): searching the furniture name finds the station.
	string FurnNamesLike(string station)
	{
		if (station == null || station.Length < 4) return "";
		var names = furniture.Values.Where(f => f.Count > 0).Select(f => f[0].ToString().Trim()).Where(n => n.IndexOf(station, StringComparison.OrdinalIgnoreCase) >= 0).ToList();
		return names.Count == 0 ? "" : string.Join("\n", names) + "\n";
	}

	public string StationTextFor(string name, List<string> types)
	{
		if (!StationText.TryGetValue(name, out var value))
		{
			value = (StationText[name] = (name + "\n" + FurnNamesLike(name) + string.Join("\n", types) + "\n" + string.Join("\n", SkillsFor(types)) + "\n" + string.Join("\n", types.SelectMany((string x) => (!recipes.TryGetValue(x, out var value2)) ? new List<string>() : value2))).ToLowerInvariant());
		}
		return value;
	}

	public string ItemName(int id)
	{
		if (!items.TryGetValue(id.ToString(), out var value) || value.Count <= 0)
		{
			return "Item #" + id;
		}
		return Loc.Item(value[0].ToString());
	}

	public string ItemValue(int id)
	{
		if (!items.TryGetValue(id.ToString(), out var value) || value.Count <= 1)
		{
			return "";
		}
		return value[1].ToString();
	}

	public IEnumerable<string> ItemField(int id, int idx)
	{
		if (!items.TryGetValue(id.ToString(), out var value) || value.Count <= idx)
		{
			return Enumerable.Empty<string>();
		}
		object obj = value[idx];
		JArray val = (JArray)((obj is JArray) ? obj : null);
		if (val == null)
		{
			return Enumerable.Empty<string>();
		}
		return ((IEnumerable<JToken>)val).Select((JToken x) => ((object)x).ToString());
	}

	public bool Sells(VendorData v, int id)
	{
		if (v.i == null || !v.i.Contains(id))
		{
			if (v.t != null && TableItems.TryGetValue(v.t, out var value))
			{
				return value.Contains(id);
			}
			return false;
		}
		return true;
	}

	public bool Buys(VendorData v, int id)
	{
		if (v.b != 1 || !items.TryGetValue(id.ToString(), out var value))
		{
			return false;
		}
		string title = value[0].ToString();
		List<string> cats = ItemField(id, 2).ToList();
		List<string> metas = ItemField(id, 3).ToList();
		if (v.ba == null || v.ba.Count == 0 || v.ba.Any(Match))
		{
			if (v.bf != null)
			{
				return !v.bf.Any(Match);
			}
			return true;
		}
		return false;
		bool Match(string rule)
		{
			if (rule.StartsWith("_item_"))
			{
				return string.Equals(rule.Substring(6), title, StringComparison.OrdinalIgnoreCase);
			}
			if (rule.StartsWith("_Meta_"))
			{
				string m = rule.Substring(6);
				return metas.Any((string x) => x.EndsWith(m, StringComparison.OrdinalIgnoreCase));
			}
			return cats.Any((string c) => string.Equals(c, rule, StringComparison.OrdinalIgnoreCase));
		}
	}

	public string FurnName(int id)
	{
		if (!furniture.TryGetValue(id.ToString(), out var value) || value.Count <= 0)
		{
			return "Furniture #" + id;
		}
		return value[0].ToString();
	}

	public string FurnInfo(int id)
	{
		if (!furniture.TryGetValue(id.ToString(), out var value) || value.Count < 4)
		{
			return FurnName(id);
		}
		string text = ((Convert.ToInt32(value[2]) > 0) ? (value[2]?.ToString() + " OC") : "") + ((Convert.ToInt32(value[3]) > 0) ? (((Convert.ToInt32(value[2]) > 0) ? " / " : "") + value[3]?.ToString() + " RM") : "");
		List<string> list = SkillsFor(FurnTypes(id)).ToList();
		return value[0]?.ToString() + " · " + value[1]?.ToString() + ((text.Length > 0) ? (" · " + text) : "") + ((list.Count > 0) ? (" · " + Loc.T("trains") + " " + string.Join(", ", list)) : "");
	}

	public bool FurnSells(VendorData v, int id)
	{
		if (v.fs != null)
		{
			return v.fs.Contains(id);
		}
		return false;
	}

	public bool FurnBuys(VendorData v, int id)
	{
		//IL_0010: Unknown result type (might be due to invalid IL or missing references)
		//IL_0016: Invalid comparison between Unknown and I4
		//IL_0051: Unknown result type (might be due to invalid IL or missing references)
		//IL_0057: Invalid comparison between Unknown and I4
		if (v.fb == null)
		{
			return false;
		}
		if ((int)v.fb.Type == 8)
		{
			string text = ((object)v.fb).ToString();
			if (!(text == "any"))
			{
				if (text == "same")
				{
					return FurnSells(v, id);
				}
				return false;
			}
			return true;
		}
		if ((int)v.fb.Type == 2)
		{
			return v.fb.Values<int>().Contains(id);
		}
		return false;
	}

	public string SceneName(string scene)
	{
		if (scene == null || !scenes.TryGetValue(scene, out var value) || string.IsNullOrEmpty(value.name))
		{
			return scene?.Replace("Interior ", "");
		}
		return value.name;
	}
}

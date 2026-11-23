using System.Collections.Generic;
using Newtonsoft.Json;

namespace ObenseuerLootMap;

public class PointData
{
	public string k;

	public float x;

	public float y;

	public float z;

	public string t;

	public string n;

	public int s;

	public int l;

	public string o;

	public List<int> f;

	public string g;

	[JsonIgnore]
	public bool live;

	[JsonIgnore]
	public bool empty;

	[JsonIgnore]
	public List<KeyValuePair<int, int>> have;

	[JsonIgnore]
	public string restock;
}

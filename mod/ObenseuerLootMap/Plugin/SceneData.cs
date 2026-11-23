using System.Collections.Generic;

namespace ObenseuerLootMap;

public class SceneData
{
	public string name;

	public string map;

	public int free;

	public int steal;

	public List<PointData> points = new List<PointData>();

	public List<StationData> stations = new List<StationData>();

	public List<DoorData> doors = new List<DoorData>();

	public List<VendorData> vendors = new List<VendorData>();
}

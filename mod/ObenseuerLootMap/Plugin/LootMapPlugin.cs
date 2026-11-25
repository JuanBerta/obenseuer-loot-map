using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Core.Logging.Interpolation;
using BepInEx.Logging;
using BepInEx.Unity.Mono;
using HarmonyLib;
using NPC;
using Newtonsoft.Json.Linq;
using UnityEngine;
using Object = UnityEngine.Object;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace ObenseuerLootMap;

[BepInPlugin("com.juanberta.obenseuer.lootmap", "Loot Map", "0.7.6")]
public partial class LootMapPlugin : BaseUnityPlugin
{
	private class GuideTarget
	{
		public string scene;

		public string label;

		public Vector3 pos;

		public bool sure;
	}

	internal class LiveFurnShop
	{
		public Vector3 pos;

		public string name;

		public Dictionary<int, int> stock = new Dictionary<int, int>();
	}

	internal class Marker
	{
		public RectTransform rt;

		public Image fill;

		public Image edge;

		public PointData p;

		public StationData st;

		public VendorData v;

		public string scene;

		public bool match;

		public Vector3 world;

		public bool top;
	}

	private GuideTarget guide;

	private float arrivedAt = -1f;

	private List<GuideTarget> routeQueue = new List<GuideTarget>();

	private int routeTotal;

	private Texture2D arrowTex;

	private Texture2D diamondTex;

	private Texture2D diamondEdgeTex;

	internal List<LiveFurnShop> liveFurnShops = new List<LiveFurnShop>();

	internal List<PointData> livePoints;

	internal List<StationData> liveStations;

	private string liveScene;

	private float nextLiveScan;

	private Marker hovered;

	private DoorData hoveredDoor;

	private Vector2 hoveredDoorAt;

	private GUIStyle panelStyle;

	private GUIStyle tipStyle;

	private GUIStyle labelStyle;

	private GUIStyle headStyle;

	private GUIStyle smallStyle;

	private GUIStyle btnStyle;

	private GUIStyle doorStyle;

	private GUIStyle fieldStyle;

	private Rect panelRect;

	private Vector2 panelScroll;

	private bool panelInit;

	private bool hadFont;

	private bool paperLook;

	private Font gameFont;

	private Rect mapScreenRect;

	private const string SearchControl = "lootmap_search";

	private static readonly Color Paper = new Color(0.91f, 0.88f, 0.81f);

	private static readonly Color Ink = new Color(0.14f, 0.11f, 0.08f);

	private static readonly Color Ochre = new Color(0.79f, 0.6f, 0.23f);

	private List<(string scene, VendorData v, int mode)> shopHits;

	private string shopKey;

	public const string Guid = "com.juanberta.obenseuer.lootmap";

	private const int MaxOtherMatches = 500;

	internal static LootMapPlugin I;

	internal static bool Typing;

	internal static bool LeaveSearch;

	internal LootDb Db;

	private ConfigEntry<bool> cfgTrashRoute;

	private ConfigEntry<bool> cfgEnabled;

	private ConfigEntry<bool> cfgContainers;

	private ConfigEntry<bool> cfgPickups;

	private ConfigEntry<bool> cfgRecipes;

	private readonly Dictionary<string, List<PointData>> recipeMemory = new Dictionary<string, List<PointData>>();

	private bool recipeMemoryLoaded;

	private ConfigEntry<bool> cfgStations;

	private ConfigEntry<bool> cfgShops;

	private ConfigEntry<bool> cfgDoors;

	private ConfigEntry<bool> cfgFreeOnly;
	private ConfigEntry<bool> cfgOnlyNow;

	private ConfigEntry<bool> cfgFloorOnly;

	private ConfigEntry<bool> cfgWholeMap;

	private ConfigEntry<bool> cfgWorld;

	private ConfigEntry<bool> cfgPanel;

	private ConfigEntry<float> cfgMarkerSize;

	private ConfigEntry<float> cfgPanelX;

	private ConfigEntry<float> cfgPanelY;

	private ConfigEntry<KeyCode> cfgToggleKey;

	private ConfigEntry<string> cfgLanguage;

	private string search = "";

	private string appliedSearch = "";

	private string searchWarn;

	private string evalSearch;

	private float searchChangedAt;

	private string lastTyped = "";

	private HashSet<int> searchIds;

	private string searchIdsLabel;

	private static readonly AccessTools.FieldRef<Map, RectTransform> MapSize = AccessTools.FieldRefAccess<Map, RectTransform>("mapsize");

	private static readonly AccessTools.FieldRef<Map, GameObject> LandmarksArea = AccessTools.FieldRefAccess<Map, GameObject>("LandmarksArea");

	private Map map;

	private float nextMapSearch;

	private RectTransform layer;

	private string builtKey;

	private float nextFloorCheck;

	private int floorBand = int.MinValue;

	private readonly List<Marker> markers = new List<Marker>();

	private Sprite square;

	private Sprite circle;

	private Sprite ring;

	private bool wasOpen;

	private string langScene;

	private string loggedLang;

	internal static readonly Color32 ColHasNow = new Color32((byte)61, (byte)220, (byte)90, byte.MaxValue);

	internal static readonly Color32 ColSells = new Color32((byte)61, (byte)139, byte.MaxValue, byte.MaxValue);

	internal static readonly Color32 ColBuys = new Color32(byte.MaxValue, (byte)122, (byte)47, byte.MaxValue);

	internal static readonly Color32 ColBoth = new Color32((byte)180, (byte)92, byte.MaxValue, byte.MaxValue);

	internal static readonly Color32 ColTrash = new Color32((byte)181, (byte)201, (byte)54, byte.MaxValue);

	private int trashLeftCache;

	private float trashLeftAt = -10f;

	private readonly Dictionary<string, bool> tableMatchCache = new Dictionary<string, bool>();

	private string tableMatchQ;

	private HashSet<int> matchedIdsCache;

	private string matchedIdsQ;

	private HashSet<int> matchedFurnCache;

	private string matchedFurnQ;

	private readonly Stack<Marker> pool = new Stack<Marker>();

	private float lastZoom = -1f;

	private static readonly AccessTools.FieldRef<Map, RectTransform> MapContent = AccessTools.FieldRefAccess<Map, RectTransform>("rectTransform");

	private static readonly AccessTools.FieldRef<Map, GameObject> PlayerMarkerGo = AccessTools.FieldRefAccess<Map, GameObject>("playerMarker");

	private static readonly AccessTools.FieldRef<Map, Vector3> InitialScale = AccessTools.FieldRefAccess<Map, Vector3>("intialScale");

	private static readonly AccessTools.FieldRef<Map, float> MaxZoom = AccessTools.FieldRefAccess<Map, float>("maxZoom");

	private static readonly AccessTools.FieldRef<Map, float> SliderValue = AccessTools.FieldRefAccess<Map, float>("currentSliderValue");

	private static readonly AccessTools.FieldRef<Map, Slider> MapSlider = AccessTools.FieldRefAccess<Map, Slider>("mapSlider");

	private StoragePanelUI storagePanel;

	private float nextSlotCheck;

	private float nextPanelSearch;

	private Sprite frameSprite;

	private Sprite glowSprite;

	private readonly Dictionary<Slot, GameObject> slotFrames = new Dictionary<Slot, GameObject>();

	internal bool Guiding => guide != null;

	internal string GuideLabel
	{
		get
		{
			if (guide != null)
			{
				return ((routeTotal > 0) ? string.Format("{0}/{1} · ", routeTotal - routeQueue.Count, routeTotal) : "") + guide.label + ((guide.scene != CurrentScene) ? (" (" + Db.SceneName(guide.scene) + ")") : "");
			}
			return null;
		}
	}

	internal bool MapOpen
	{
		get
		{
			if ((Object)(object)map != (Object)null && ((Behaviour)map).isActiveAndEnabled && ((Component)map).gameObject.activeInHierarchy)
			{
				return Db != null;
			}
			return false;
		}
	}

	private static Color ToColor(Color32 c) { return c; }
	private static Vector3 ToV3(Vector2 v) { return v; }
	internal string CurrentScene
	{
		get
		{
			//IL_0019: Unknown result type (might be due to invalid IL or missing references)
			//IL_001e: Unknown result type (might be due to invalid IL or missing references)
			if (!((Object)(object)info_map.instance != (Object)null))
			{
				return null;
			}
			Scene scene = ((Component)info_map.instance).gameObject.scene;
			return scene.name;
		}
	}

	private string CurrentMap
	{
		get
		{
			if (!((Object)(object)info_map.instance != (Object)null) || !((Object)(object)info_map.instance.mapImage != (Object)null))
			{
				return null;
			}
			return ((Object)info_map.instance.mapImage).name;
		}
	}

	internal bool Indoors
	{
		get
		{
			if (CurrentScene != null && !CurrentScene.StartsWith("Open Sewer"))
			{
				return CurrentScene != "Under Map";
			}
			return false;
		}
	}

	internal bool TrashRoute
	{
		get
		{
			if (cfgTrashRoute.Value)
			{
				return ScavengerBridge.Available;
			}
			return false;
		}
	}

	internal string Q => appliedSearch.Trim().ToLowerInvariant();

	internal bool Searching
	{
		get
		{
			if (Q.Length <= 0)
			{
				return searchIds != null;
			}
			return true;
		}
	}

	private string[] QWords => Q.Split(new char[1] { ' ' }, StringSplitOptions.RemoveEmptyEntries);

	internal bool ExactSearch
	{
		get
		{
			string q = Q;
			if (q.Length >= 2)
			{
				if ((q[0] != '"' || q[q.Length - 1] != '"') && (q[0] != '(' || q[q.Length - 1] != ')'))
				{
					if (q[0] == '“')
					{
						return q[q.Length - 1] == '”';
					}
					return false;
				}
				return true;
			}
			return false;
		}
	}

	internal string ExactTerm
	{
		get
		{
			if (!ExactSearch)
			{
				return null;
			}
			return Q.Substring(1, Q.Length - 2).Trim();
		}
	}

	internal HashSet<int> MatchedIds
	{
		get
		{
			if (searchIds != null)
			{
				return searchIds;
			}
			if (Q.Length == 0)
			{
				return null;
			}
			if (matchedIdsQ != Q)
			{
				matchedIdsQ = Q;
				matchedIdsCache = new HashSet<int>(Db.items.Keys.Select(int.Parse).Where(NameMatch));
			}
			return matchedIdsCache;
		}
	}

	internal HashSet<int> MatchedFurniture
	{
		get
		{
			if (searchIds != null || Q.Length == 0 || Db.furniture.Count == 0)
			{
				return null;
			}
			if (matchedFurnQ != Q)
			{
				matchedFurnQ = Q;
				matchedFurnCache = new HashSet<int>(Db.furniture.Keys.Select(int.Parse).Where((int id) =>
				{
					if (TextMatch(Db.FurnName(id)))
					{
						return true;
					}
					List<string> list = Db.FurnTypes(id);
					return list.Any(TextMatch) || Db.SkillsFor(list).Any(TextMatch);
				}));
			}
			return matchedFurnCache;
		}
	}

	internal void SetGuide(string scene, Vector3 pos, string label)
	{
		//IL_000e: Unknown result type (might be due to invalid IL or missing references)
		//IL_000f: Unknown result type (might be due to invalid IL or missing references)
		guide = new GuideTarget
		{
			scene = scene,
			pos = pos,
			label = label
		};
		arrivedAt = -1f;
	}

	internal void ClearGuide()
	{
		guide = null;
		arrivedAt = -1f;
		routeQueue.Clear();
		routeTotal = 0;
	}

	private void UpdateGuide()
	{
		//IL_0038: Unknown result type (might be due to invalid IL or missing references)
		//IL_003d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0047: Unknown result type (might be due to invalid IL or missing references)
		//IL_004c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0057: Unknown result type (might be due to invalid IL or missing references)
		if (guide != null && !((Object)(object)Camera.main == (Object)null) && guide.scene == CurrentScene && Vector3.Distance(((Component)Camera.main).transform.position - Vector3.up * 1.2f, guide.pos) < 2.2f)
		{
			if (arrivedAt < 0f)
			{
				arrivedAt = Time.unscaledTime;
			}
			else if (routeQueue.Count > 0)
			{
				if (Time.unscaledTime - arrivedAt > 1.2f)
				{
					guide = routeQueue[0];
					routeQueue.RemoveAt(0);
					arrivedAt = -1f;
				}
			}
			else if (Time.unscaledTime - arrivedAt > 4f)
			{
				ClearGuide();
			}
		}
	}

	private bool NextWaypoint(out Vector3 wp, out string text)
	{
		//IL_000e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0013: Unknown result type (might be due to invalid IL or missing references)
		//IL_0049: Unknown result type (might be due to invalid IL or missing references)
		//IL_004e: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ac: Unknown result type (might be due to invalid IL or missing references)
		//IL_009e: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ea: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ef: Unknown result type (might be due to invalid IL or missing references)
		//IL_0156: Unknown result type (might be due to invalid IL or missing references)
		//IL_015b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0209: Unknown result type (might be due to invalid IL or missing references)
		//IL_020e: Unknown result type (might be due to invalid IL or missing references)
		wp = Vector3.zero;
		text = null;
		string currentScene = CurrentScene;
		if (guide == null || currentScene == null)
		{
			return false;
		}
		if (guide.scene == currentScene)
		{
			wp = guide.pos;
			text = guide.label;
			return true;
		}
		Db.scenes.TryGetValue(currentScene, out var value);
		List<DoorData> source = value?.doors ?? new List<DoorData>();
		Camera main = Camera.main;
		Vector3 me = (((Object)(object)main != (Object)null) ? ((Component)main).transform.position : Vector3.zero);
		DoorData doorData = Nearest(source.Where((DoorData d) => d.to == guide.scene));
		if (doorData != null)
		{
			wp = new Vector3(doorData.x, doorData.y, doorData.z);
			text = Loc.T("Go through the door to") + " " + Db.SceneName(guide.scene) + Note(doorData);
			return true;
		}
		DoorData doorData2 = Nearest(source.Where((DoorData d) => Db.scenes.TryGetValue(d.to, out var value2) && value2.doors.Any((DoorData x) => x.to == guide.scene)));
		if (doorData2 != null)
		{
			wp = new Vector3(doorData2.x, doorData2.y, doorData2.z);
			text = Loc.T("Go through the door to") + " " + Db.SceneName(doorData2.to) + " → " + Db.SceneName(guide.scene) + Note(doorData2);
			return true;
		}
		if (Indoors)
		{
			DoorData doorData3 = Nearest(source.Where((DoorData d) => d.to.StartsWith("Open Sewer")));
			if (doorData3 != null)
			{
				wp = new Vector3(doorData3.x, doorData3.y, doorData3.z);
				text = Loc.T("Go outside") + " → " + Db.SceneName(guide.scene) + Note(doorData3);
				return true;
			}
		}
		text = Loc.T("Head to") + " " + Db.SceneName(guide.scene);
		return false;
		DoorData Nearest(IEnumerable<DoorData> ds)
		{
			return ds.OrderBy((DoorData d) => (new Vector3(d.x, d.y, d.z) - me).magnitude + DoorPenalty(DoorState(d, currentScene))).FirstOrDefault();
		}
		string Note(DoorData d)
		{
			string st = DoorState(d, currentScene);
			return (st == "open") ? "" : (" · " + DoorText(st));
		}
	}

	private void EnsureHudTextures()
	{
		//IL_0032: Unknown result type (might be due to invalid IL or missing references)
		//IL_0037: Unknown result type (might be due to invalid IL or missing references)
		//IL_0044: Expected Obj, but got Unknown
		//IL_004b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0050: Unknown result type (might be due to invalid IL or missing references)
		//IL_005d: Expected Obj, but got Unknown
		//IL_0064: Unknown result type (might be due to invalid IL or missing references)
		//IL_0069: Unknown result type (might be due to invalid IL or missing references)
		//IL_0076: Expected Obj, but got Unknown
		//IL_015b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0154: Unknown result type (might be due to invalid IL or missing references)
		//IL_00f6: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ef: Unknown result type (might be due to invalid IL or missing references)
		//IL_017f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0178: Unknown result type (might be due to invalid IL or missing references)
		if ((Object)(object)arrowTex != (Object)null && (Object)(object)diamondTex != (Object)null && (Object)(object)diamondEdgeTex != (Object)null)
		{
			return;
		}
		arrowTex = new Texture2D(64, 64, (TextureFormat)4, false)
		{
			hideFlags = (HideFlags)61
		};
		diamondTex = new Texture2D(32, 32, (TextureFormat)4, false)
		{
			hideFlags = (HideFlags)61
		};
		diamondEdgeTex = new Texture2D(32, 32, (TextureFormat)4, false)
		{
			hideFlags = (HideFlags)61
		};
		for (int i = 0; i < 64; i++)
		{
			for (int j = 0; j < 64; j++)
			{
				float num = ((float)j - 32f) / 32f;
				float num2 = (float)i / 64f;
				bool flag = num2 > 0.45f && Mathf.Abs(num) < (1f - num2) * 1.8f;
				bool flag2 = num2 <= 0.47f && num2 > 0.05f && Mathf.Abs(num) < 0.22f;
				arrowTex.SetPixel(j, i, (flag | flag2) ? Color.white : Color.clear);
			}
		}
		for (int k = 0; k < 32; k++)
		{
			for (int l = 0; l < 32; l++)
			{
				float num3 = Mathf.Abs((float)l - 15.5f) + Mathf.Abs((float)k - 15.5f);
				diamondTex.SetPixel(l, k, (num3 < 12f) ? Color.white : Color.clear);
				diamondEdgeTex.SetPixel(l, k, (num3 < 15.5f) ? Color.white : Color.clear);
			}
		}
		arrowTex.Apply();
		diamondTex.Apply();
		diamondEdgeTex.Apply();
	}

	private static string Floors(float dy)
	{
		int num = Mathf.RoundToInt(dy / 3f);
		if (num == 0)
		{
			return "";
		}
		if (num <= 0)
		{
			return string.Format(" · {0} {1}", -num, Loc.T((num == -1) ? "floor down" : "floors down"));
		}
		return string.Format(" · {0} {1}", num, Loc.T((num == 1) ? "floor up" : "floors up"));
	}

	private void DrawHud()
	{
		//IL_02ed: Unknown result type (might be due to invalid IL or missing references)
		//IL_02f4: Expected Obj, but got Unknown
		//IL_0301: Unknown result type (might be due to invalid IL or missing references)
		//IL_033f: Unknown result type (might be due to invalid IL or missing references)
		//IL_008a: Unknown result type (might be due to invalid IL or missing references)
		//IL_008f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0099: Unknown result type (might be due to invalid IL or missing references)
		//IL_009e: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a5: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bd: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ce: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ed: Unknown result type (might be due to invalid IL or missing references)
		//IL_00f3: Unknown result type (might be due to invalid IL or missing references)
		//IL_013b: Unknown result type (might be due to invalid IL or missing references)
		//IL_013c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0141: Unknown result type (might be due to invalid IL or missing references)
		//IL_0143: Unknown result type (might be due to invalid IL or missing references)
		//IL_014a: Unknown result type (might be due to invalid IL or missing references)
		//IL_015c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0161: Unknown result type (might be due to invalid IL or missing references)
		//IL_0163: Unknown result type (might be due to invalid IL or missing references)
		//IL_0168: Unknown result type (might be due to invalid IL or missing references)
		//IL_016d: Unknown result type (might be due to invalid IL or missing references)
		//IL_018b: Unknown result type (might be due to invalid IL or missing references)
		//IL_01ae: Unknown result type (might be due to invalid IL or missing references)
		//IL_01f0: Unknown result type (might be due to invalid IL or missing references)
		//IL_01da: Unknown result type (might be due to invalid IL or missing references)
		//IL_0213: Unknown result type (might be due to invalid IL or missing references)
		//IL_0223: Unknown result type (might be due to invalid IL or missing references)
		//IL_022a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0232: Unknown result type (might be due to invalid IL or missing references)
		//IL_0233: Unknown result type (might be due to invalid IL or missing references)
		//IL_023d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0242: Unknown result type (might be due to invalid IL or missing references)
		//IL_0247: Unknown result type (might be due to invalid IL or missing references)
		//IL_024c: Unknown result type (might be due to invalid IL or missing references)
		//IL_024e: Unknown result type (might be due to invalid IL or missing references)
		//IL_026b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0275: Unknown result type (might be due to invalid IL or missing references)
		//IL_0288: Unknown result type (might be due to invalid IL or missing references)
		//IL_02a0: Unknown result type (might be due to invalid IL or missing references)
		//IL_02b0: Unknown result type (might be due to invalid IL or missing references)
		Camera main = Camera.main;
		if ((Object)(object)main == (Object)null || HudHidden())
		{
			return;
		}
		EnsureHudTextures();
		InitStyles();
		if ((Searching || TrashRoute) && cfgWorld.Value && cfgEnabled.Value)
		{
			DrawWorldHighlights(main);
		}
		DrawShopHud();
		if (guide == null)
		{
			return;
		}
		bool flag = NextWaypoint(out var wp, out var text);
		float num = (float)Screen.width / 2f;
		float num2 = 70f;
		string text2 = text;
		if (flag)
		{
			Vector3 val = ((Component)main).transform.position - Vector3.up * 1.6f;
			float num3 = Vector3.Distance(new Vector3(val.x, 0f, val.z), new Vector3(wp.x, 0f, wp.z));
			text2 = text2 + $" · {num3:0} m" + Floors(wp.y - val.y);
			if (arrivedAt >= 0f)
			{
				text2 = Loc.T("You are there") + ": " + guide.label;
			}
			Vector3 val2 = ((Component)main).transform.InverseTransformPoint(wp);
			float num4 = Mathf.Atan2(val2.x, val2.z) * 57.29578f;
			Matrix4x4 matrix = GUI.matrix;
			Color color = GUI.color;
			GUIUtility.RotateAroundPivot(num4, new Vector2(num, num2));
			GUI.color = new Color(0f, 0f, 0f, 0.6f);
			GUI.DrawTexture(new Rect(num - 21f, num2 - 21f, 42f, 42f), (Texture)(object)arrowTex);
			GUI.color = ((arrivedAt >= 0f) ? new Color(0.6f, 0.9f, 0.5f) : new Color(0.95f, 0.8f, 0.45f));
			GUI.DrawTexture(new Rect(num - 18f, num2 - 18f, 36f, 36f), (Texture)(object)arrowTex);
			GUI.matrix = matrix;
			GUI.color = color;
			Vector3 val3 = main.WorldToScreenPoint(wp + Vector3.up * 0.4f);
			if (val3.z > 0f)
			{
				GUI.color = new Color(0.95f, 0.8f, 0.45f);
				GUI.DrawTexture(new Rect(val3.x - 9f, (float)Screen.height - val3.y - 9f, 18f, 18f), (Texture)(object)diamondEdgeTex);
				GUI.color = color;
			}
		}
		GUIContent val4 = new GUIContent(Loc.T("Guiding to") + " <b>" + GuideLabel + "</b>\n" + text2);
		float num5 = Mathf.Min(520f, tipStyle.CalcSize(val4).x + 20f);
		float num6 = tipStyle.CalcHeight(val4, num5);
		GUI.Box(new Rect(num - num5 / 2f, num2 + 26f, num5, num6), val4, tipStyle);
	}

	private static System.Reflection.FieldInfo loadOpField;
	private static float loadingHoldUntil, loadingSince;
	private static bool SceneIsLoading()
	{
		try
		{
			LoadingScreen ls = LoadingScreen.instance;
			if ((Object)(object)ls == (Object)null)
			{
				return Time.unscaledTime < loadingHoldUntil;
			}
			if (loadOpField == null)
			{
				loadOpField = typeof(LoadingScreen).GetField("operation", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
			}
			AsyncOperation val = loadOpField != null ? (AsyncOperation)loadOpField.GetValue(ls) : null;
			if (val == null || val.isDone)
			{
				loadingSince = 0f;
			}
			else
			{
				if (loadingSince == 0f)
				{
					loadingSince = Time.unscaledTime;
				}
				if (Time.unscaledTime - loadingSince < 90f)
				{
					loadingHoldUntil = Time.unscaledTime + 1.2f;
					return true;
				}
			}
		}
		catch
		{
		}
		return Time.unscaledTime < loadingHoldUntil;
	}

	private static bool HudHidden()
	{
		if (Time.timeScale < 0.01f)
		{
			return true;
		}
		if (SceneIsLoading())
		{
			return true;
		}
		try
		{
			GameUIController instance = GameUIController.instance;
			if ((Object)(object)instance != (Object)null && (instance.IsAnyMenuOpen() || instance.IsMenuVisible || !instance.GameUIVisible()))
			{
				return true;
			}
		}
		catch
		{
		}
		return false;
	}

	private void DrawWorldHighlights(Camera cam)
	{
		//IL_0011: Unknown result type (might be due to invalid IL or missing references)
		//IL_0016: Unknown result type (might be due to invalid IL or missing references)
		//IL_0017: Unknown result type (might be due to invalid IL or missing references)
		//IL_001c: Unknown result type (might be due to invalid IL or missing references)
		//IL_02f3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a9: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ae: Unknown result type (might be due to invalid IL or missing references)
		//IL_00af: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c4: Unknown result type (might be due to invalid IL or missing references)
		//IL_00cb: Unknown result type (might be due to invalid IL or missing references)
		//IL_0104: Unknown result type (might be due to invalid IL or missing references)
		//IL_0106: Unknown result type (might be due to invalid IL or missing references)
		//IL_0110: Unknown result type (might be due to invalid IL or missing references)
		//IL_0115: Unknown result type (might be due to invalid IL or missing references)
		//IL_011a: Unknown result type (might be due to invalid IL or missing references)
		//IL_011f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0121: Unknown result type (might be due to invalid IL or missing references)
		//IL_014d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0163: Unknown result type (might be due to invalid IL or missing references)
		//IL_0178: Unknown result type (might be due to invalid IL or missing references)
		//IL_01b6: Unknown result type (might be due to invalid IL or missing references)
		//IL_019b: Unknown result type (might be due to invalid IL or missing references)
		//IL_01f4: Unknown result type (might be due to invalid IL or missing references)
		//IL_025d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0262: Unknown result type (might be due to invalid IL or missing references)
		//IL_026c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0251: Unknown result type (might be due to invalid IL or missing references)
		//IL_0256: Unknown result type (might be due to invalid IL or missing references)
		//IL_024a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0234: Unknown result type (might be due to invalid IL or missing references)
		//IL_028b: Unknown result type (might be due to invalid IL or missing references)
		//IL_02b5: Unknown result type (might be due to invalid IL or missing references)
		string currentScene = CurrentScene;
		if (currentScene == null)
		{
			return;
		}
		Vector3 position = ((Component)cam).transform.position;
		Color color = GUI.color;
		int num = 0;
		foreach (PointData item in PointsOf(currentScene))
		{
			if ((item.live && item.empty) || (cfgFreeOnly.Value && item.s == 1))
			{
				continue;
			}
			bool flag = IsTrash(item);
			if (flag && SearchedToday(item, currentScene))
			{
				continue;
			}
			bool flag2 = TrashRoute & flag;
			Vector3 val = new Vector3(item.x, item.y, item.z);
			float num2 = Vector3.Distance(position, val);
			if (num2 > 25f || Mathf.Abs(val.y - (position.y - 1.6f)) > 3.2f || (!flag2 && (!Searching || !PointMatches(item))))
			{
				continue;
			}
			Vector3 val2 = cam.WorldToScreenPoint(val + Vector3.up * 0.25f);
			if (!(val2.z <= 0f))
			{
				float num3 = Mathf.Lerp(20f, 10f, num2 / 25f);
				Rect val3 = new Rect(val2.x - num3 / 2f, (float)Screen.height - val2.y - num3 / 2f, num3, num3);
				GUI.color = ((item.s == 1) ? new Color(0.8f, 0.12f, 0.1f, 0.9f) : new Color(0.1f, 0.1f, 0.08f, 0.85f));
				GUI.DrawTexture(new Rect(val3.x - 2f, val3.y - 2f, val3.width + 4f, val3.height + 4f), (Texture)(object)diamondEdgeTex);
				GUI.color = (Color)(flag2 ? ToColor(ColTrash) : (HasNow(item) ? ToColor(ColHasNow) : ((item.k == "p") ? new Color(0.12f, 0.6f, 0.7f) : new Color(0.95f, 0.62f, 0.1f))));
				GUI.DrawTexture(val3, (Texture)(object)diamondTex);
				if (num2 < 7f && item.t != null)
				{
					GUI.color = color;
					GUI.Label(new Rect(val3.xMax + 4f, val3.y - 2f, 220f, 22f), item.t, smallStyle);
				}
				if (++num > 60)
				{
					break;
				}
			}
		}
		GUI.color = color;
	}

	private static int CurrentDay()
	{
		try
		{
			return ((Object)(object)TimeOfDayAzure.instance != (Object)null) ? TimeOfDayAzure.instance.currentTimeAndDay.currentDay : (-1);
		}
		catch
		{
			return -1;
		}
	}

	private static bool Stealing(NPCReference owner, bool permission)
	{
		if (owner != null && owner.ID > 1)
		{
			return !permission;
		}
		return false;
	}

	private string RestockText(SpawnSettings ss, bool empty)
	{
		if (ss == null || !ss.respawnEnabled)
		{
			return null;
		}
		int num = CurrentDay();
		if (num >= 0 && ss.waitingSpawn)
		{
			int num2 = ss.daySpawned + ss.timetospawn - num;
			if (num2 <= 0)
			{
				return Loc.T("Restocks") + " " + Loc.T("today");
			}
			return string.Format("{0} {1} {2} {3}", Loc.T("Restocks"), Loc.T("in about"), num2, Loc.T((num2 == 1) ? "day" : "days"));
		}
		return Loc.T("Restocks");
	}

	// Recipes and blueprints lying in the world: recipe pages, recipe books (some respawn) and furniture blueprints.
	// The ones seen in a building are remembered, so a search can find them from anywhere on the map.
	private void ScanRecipes(string currentScene, List<PointData> list)
	{
		LoadRecipeMemory();
		List<PointData> found = new List<PointData>();
		Collectible[] all = Object.FindObjectsByType<Collectible>((FindObjectsInactive)1, (FindObjectsSortMode)0);
		foreach (Collectible c in all)
		{
			if ((Object)(object)c == (Object)null || c.gameObject.scene.name != currentScene)
			{
				continue;
			}
			string kind = null;
			string name = null;
			if (c is CollectibleRecipe cr)
			{
				kind = "Recipe";
				name = cr.recipe != null ? cr.recipe.name : null;
			}
			else if (c is CollectibleRecipes crs)
			{
				kind = "Recipe";
				name = (crs.recipes != null && crs.recipes.Count > 0) ? string.Join(", ", crs.recipes.Select((RecipeReference r) => r.name)) : null;
			}
			else if (c is CollectibleRecipeBook)
			{
				kind = "Recipe";
				name = ((Interactable)c).title;
			}
			else if (c is CollectibleTaskItem cti && cti.taskItem is TaskItemBlueprint)
			{
				kind = "Blueprint";
				name = !string.IsNullOrEmpty(cti.taskItem.itemName) ? cti.taskItem.itemName : ((Interactable)c).title;
			}
			if (kind == null)
			{
				continue;
			}
			SpawnSettings ss = Traverse.Create((object)c).Field("spawnSettings").GetValue<SpawnSettings>();
			bool respawns = ss != null && ss.respawnEnabled;
			bool here = c.gameObject.activeInHierarchy;
			if (!here && !respawns)
			{
				continue;
			}
			Vector3 pos = ((Component)c).transform.position;
			string label = Loc.T(kind) + (string.IsNullOrEmpty(name) ? "" : ": " + name);
			PointData p = new PointData
			{
				k = "r",
				x = pos.x,
				y = pos.y,
				z = pos.z,
				n = label,
				s = (Stealing(c.owner, false) ? 1 : 0),
				live = !here,
				empty = !here
			};
			if (p.s == 1 && c.owner != null && !string.IsNullOrEmpty(c.owner.name) && c.owner.name != "Default Male" && c.owner.name != "Name")
			{
				p.o = c.owner.name;
			}
			if (respawns)
			{
				p.restock = RestockText(ss, !here);
			}
			found.Add(p);
		}
		list.AddRange(found);
		recipeMemory[currentScene] = found.Select((PointData p) => new PointData { k = p.k, x = p.x, y = p.y, z = p.z, n = p.n, s = p.s, o = p.o, live = false, empty = false }).ToList();
		SaveRecipeMemory();
	}

	private string RecipeMemoryPath()
	{
		return Path.Combine(Path.GetDirectoryName(((BaseUnityPlugin)this).Info.Location), "lootmap-recipes.json");
	}

	private void LoadRecipeMemory()
	{
		if (recipeMemoryLoaded)
		{
			return;
		}
		recipeMemoryLoaded = true;
		try
		{
			string path = RecipeMemoryPath();
			if (File.Exists(path))
			{
				Dictionary<string, List<PointData>> d = Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, List<PointData>>>(File.ReadAllText(path));
				if (d != null)
				{
					foreach (KeyValuePair<string, List<PointData>> kv in d)
					{
						if (!recipeMemory.ContainsKey(kv.Key) && kv.Value != null)
						{
							recipeMemory[kv.Key] = kv.Value;
						}
					}
				}
			}
		}
		catch (Exception ex)
		{
			Logger.LogWarning((object)("Couldn't read remembered recipes: " + ex.Message));
		}
	}

	private string lastRecipeSave;

	private void SaveRecipeMemory()
	{
		try
		{
			string json = Newtonsoft.Json.JsonConvert.SerializeObject(recipeMemory);
			if (json == lastRecipeSave)
			{
				return;
			}
			lastRecipeSave = json;
			File.WriteAllText(RecipeMemoryPath(), json);
		}
		catch (Exception ex)
		{
			Logger.LogWarning((object)("Couldn't save remembered recipes: " + ex.Message));
		}
	}

	internal void ScanLive(bool force)
	{
		//IL_0076: Unknown result type (might be due to invalid IL or missing references)
		//IL_007b: Unknown result type (might be due to invalid IL or missing references)
		//IL_031e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0323: Unknown result type (might be due to invalid IL or missing references)
		//IL_03fb: Unknown result type (might be due to invalid IL or missing references)
		//IL_0400: Unknown result type (might be due to invalid IL or missing references)
		//IL_0413: Unknown result type (might be due to invalid IL or missing references)
		//IL_0420: Unknown result type (might be due to invalid IL or missing references)
		//IL_042d: Unknown result type (might be due to invalid IL or missing references)
		//IL_054c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0551: Unknown result type (might be due to invalid IL or missing references)
		//IL_070e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0713: Unknown result type (might be due to invalid IL or missing references)
		//IL_016e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0173: Unknown result type (might be due to invalid IL or missing references)
		//IL_0186: Unknown result type (might be due to invalid IL or missing references)
		//IL_0193: Unknown result type (might be due to invalid IL or missing references)
		//IL_01a0: Unknown result type (might be due to invalid IL or missing references)
		//IL_0734: Unknown result type (might be due to invalid IL or missing references)
		//IL_0739: Unknown result type (might be due to invalid IL or missing references)
		//IL_0598: Unknown result type (might be due to invalid IL or missing references)
		//IL_059d: Unknown result type (might be due to invalid IL or missing references)
		//IL_05f4: Unknown result type (might be due to invalid IL or missing references)
		//IL_0601: Unknown result type (might be due to invalid IL or missing references)
		//IL_060e: Unknown result type (might be due to invalid IL or missing references)
		string currentScene = CurrentScene;
		if (!force && currentScene == liveScene && Time.unscaledTime < nextLiveScan)
		{
			return;
		}
		nextLiveScan = Time.unscaledTime + 2f;
		liveScene = currentScene;
		List<PointData> list = new List<PointData>();
		List<StationData> list2 = new List<StationData>();
		try
		{
			Storage[] array = Object.FindObjectsByType<Storage>((FindObjectsInactive)0, (FindObjectsSortMode)0);
			Scene scene;
			foreach (Storage val in array)
			{
				if ((Object)(object)val == (Object)null)
				{
					continue;
				}
				scene = ((Component)val).gameObject.scene;
				if (scene.name != currentScene || (Object)(object)((Component)val).GetComponent<Trade>() != (Object)null || (Object)(object)((Component)val).GetComponent<VendingMachine>() != (Object)null)
				{
					continue;
				}
				string itemSpawnCategory = val.itemSpawnCategory;
				List<KeyValuePair<int, int>> list3 = new List<KeyValuePair<int, int>>();
				if (val.storageSlots != null)
				{
					StorageSlot[] storageSlots = val.storageSlots;
					foreach (StorageSlot val2 in storageSlots)
					{
						if (val2 != null)
						{
							Traverse val3 = Traverse.Create((object)val2);
							int value = val3.Field("itemId").GetValue<int>();
							int value2 = val3.Field("itemAmount").GetValue<int>();
							if (value >= 0 && value2 > 0)
							{
								list3.Add(new KeyValuePair<int, int>(value, value2));
							}
						}
					}
				}
				bool flag = !string.IsNullOrEmpty(itemSpawnCategory) && Db.loot.ContainsKey(itemSpawnCategory);
				if (flag || list3.Count != 0)
				{
					Vector3 position = ((Component)val).transform.position;
					PointData pointData = new PointData
					{
						k = "c",
						x = position.x,
						y = position.y,
						z = position.z,
						t = (flag ? itemSpawnCategory : null),
						n = (string.IsNullOrEmpty(((Interactable)val).title) ? null : ((Interactable)val).title),
						s = (Stealing(val.StorageOwner, val.PermissionToTake) ? 1 : 0),
						l = ((val._Lock != null && val._Lock.Locked) ? 1 : 0),
						live = true,
						empty = (list3.Count == 0),
						have = list3,
						g = (string.IsNullOrEmpty(val.GUID) ? null : val.GUID)
					};
					if (pointData.s == 1 && val.StorageOwner != null && !string.IsNullOrEmpty(val.StorageOwner.name) && val.StorageOwner.name != "Default Male" && val.StorageOwner.name != "Name")
					{
						pointData.o = val.StorageOwner.name;
					}
					pointData.restock = RestockText(val.spawnSettings, pointData.empty);
					RecordLooted(currentScene, pointData, val.spawnSettings);
					list.Add(pointData);
				}
			}
			CollectibleItemSpawner[] array2 = Object.FindObjectsByType<CollectibleItemSpawner>((FindObjectsInactive)0, (FindObjectsSortMode)0);
			foreach (CollectibleItemSpawner val4 in array2)
			{
				if ((Object)(object)val4 == (Object)null)
				{
					continue;
				}
				scene = ((Component)val4).gameObject.scene;
				if (scene.name != currentScene)
				{
					continue;
				}
				List<KeyValuePair<int, int>> list4 = new List<KeyValuePair<int, int>>();
				List<CollectibleItem> value3 = Traverse.Create((object)val4).Field("collectibleItems").GetValue<List<CollectibleItem>>();
				if (value3 != null)
				{
					foreach (CollectibleItem item in value3)
					{
						if (!((Object)(object)item == (Object)null) && ((Component)item).gameObject.activeInHierarchy)
						{
							Traverse val5 = Traverse.Create((object)item);
							ItemReference value4 = val5.Field("Item").GetValue<ItemReference>();
							int value5 = val5.Field("amount").GetValue<int>();
							if (value4 != null)
							{
								list4.Add(new KeyValuePair<int, int>(value4.ID, Math.Max(1, value5)));
							}
						}
					}
				}
				string itemSpawnCategory2 = val4.itemSpawnCategory;
				Vector3 position2 = ((Component)val4).transform.position;
				PointData pointData2 = new PointData
				{
					k = "p",
					x = position2.x,
					y = position2.y,
					z = position2.z,
					t = ((!string.IsNullOrEmpty(itemSpawnCategory2) && Db.loot.ContainsKey(itemSpawnCategory2)) ? itemSpawnCategory2 : null),
					s = (Stealing(val4.owner, val4.permissionToTake) ? 1 : 0),
					live = true,
					empty = (list4.Count == 0),
					have = list4
				};
				if (pointData2.s == 1 && val4.owner != null && !string.IsNullOrEmpty(val4.owner.name) && val4.owner.name != "Default Male" && val4.owner.name != "Name")
				{
					pointData2.o = val4.owner.name;
				}
				list.Add(pointData2);
			}
			manufacturing[] array3 = Object.FindObjectsByType<manufacturing>((FindObjectsInactive)0, (FindObjectsSortMode)0);
			foreach (manufacturing val6 in array3)
			{
				if ((Object)(object)val6 == (Object)null)
				{
					continue;
				}
				scene = ((Component)val6).gameObject.scene;
				if (scene.name != currentScene)
				{
					continue;
				}
				string text = ((!string.IsNullOrEmpty(((CraftingBase)val6).ManuName)) ? ((CraftingBase)val6).ManuName : ((Interactable)val6).title);
				if (!string.IsNullOrEmpty(text))
				{
					Vector3 position3 = ((Component)val6).transform.position;
					List<string> r = ((((CraftingBase)val6).Recipes != null) ? ((CraftingBase)val6).Recipes.Select((RecipeType val8) => ((object)val8/*cast due to constrained. prefix*/).ToString()).Distinct().ToList() : new List<string>());
					StationData stationData = new StationData
					{
						n = text,
						x = position3.x,
						y = position3.y,
						z = position3.z,
						r = r,
						s = (Stealing(((CraftingBase)val6).owner, ((CraftingBase)val6).PermissionToTake) ? 1 : 0)
					};
					if (stationData.s == 1 && ((CraftingBase)val6).owner != null && !string.IsNullOrEmpty(((CraftingBase)val6).owner.name) && ((CraftingBase)val6).owner.name != "Default Male" && ((CraftingBase)val6).owner.name != "Name")
					{
						stationData.o = ((CraftingBase)val6).owner.name;
					}
					Db.StationTextFor(stationData.n, stationData.r);
					list2.Add(stationData);
				}
			}
			if (cfgRecipes.Value)
			{
				try { ScanRecipes(currentScene, list); }
				catch (Exception ex2) { Logger.LogWarning((object)("Recipe scan failed: " + ex2.Message)); }
			}
			List<LiveFurnShop> list5 = new List<LiveFurnShop>();
			FurnitureShop[] array4 = Object.FindObjectsByType<FurnitureShop>((FindObjectsInactive)0, (FindObjectsSortMode)0);
			foreach (FurnitureShop val7 in array4)
			{
				if ((Object)(object)val7 == (Object)null)
				{
					continue;
				}
				scene = ((Component)val7).gameObject.scene;
				if (scene.name != currentScene)
				{
					continue;
				}
				LiveFurnShop liveFurnShop = new LiveFurnShop
				{
					pos = ((Component)val7).transform.position,
					name = (string.IsNullOrEmpty(((Interactable)val7).title) ? null : ((Interactable)val7).title)
				};
				if (val7.availableFurnitures != null)
				{
					foreach (BuildingSystem.FurnitureInfo availableFurniture in val7.availableFurnitures)
					{
						if (availableFurniture != null && !((Object)(object)availableFurniture.furniture == (Object)null))
						{
							int num = Db.FurnIdByTitle(availableFurniture.furniture.title);
							if (num != 0)
							{
								liveFurnShop.stock.TryGetValue(num, out var value6);
								liveFurnShop.stock[num] = value6 + Math.Max(1, availableFurniture.amount);
							}
						}
					}
				}
				list5.Add(liveFurnShop);
			}
			liveFurnShops = list5;
			ScanLiveDoors(currentScene);
			livePoints = list;
			liveStations = list2;
		}
		catch (Exception ex)
		{
			Logger.LogWarning((object)("Live scan failed, using bundled data: " + ex.Message));
			livePoints = null;
			liveStations = null;
		}
	}

	internal string LiveKey()
	{
		if (livePoints == null)
		{
			return "";
		}
		int num = 0;
		int num2 = 0;
		int num3 = 0;
		foreach (PointData livePoint in livePoints)
		{
			if (livePoint.empty)
			{
				num++;
			}
			num2 += livePoint.have?.Count ?? 0;
			num3 += livePoint.s;
		}
		int num4 = 0;
		foreach (LiveFurnShop liveFurnShop in liveFurnShops)
		{
			foreach (KeyValuePair<int, int> item in liveFurnShop.stock)
			{
				num4 += item.Value;
			}
		}
		return $"{livePoints.Count}/{num}/{num2}/{num3}/{num4}";
	}

	private static Texture2D Framed(Color fill, Color edge, int width)
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_0010: Expected Obj, but got Unknown
		//IL_0032: Unknown result type (might be due to invalid IL or missing references)
		//IL_002f: Unknown result type (might be due to invalid IL or missing references)
		Texture2D val = new Texture2D(8, 8)
		{
			hideFlags = (HideFlags)61
		};
		for (int i = 0; i < 8; i++)
		{
			for (int j = 0; j < 8; j++)
			{
				val.SetPixel(j, i, (j < width || i < width || j >= 8 - width || i >= 8 - width) ? edge : fill);
			}
		}
		val.Apply();
		return val;
	}

	private static Texture2D Solid(Color c)
	{
		//IL_0002: Unknown result type (might be due to invalid IL or missing references)
		//IL_0007: Unknown result type (might be due to invalid IL or missing references)
		//IL_000f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0012: Unknown result type (might be due to invalid IL or missing references)
		//IL_0018: Unknown result type (might be due to invalid IL or missing references)
		//IL_001f: Expected Obj, but got Unknown
		Texture2D val = new Texture2D(1, 1)
		{
			hideFlags = (HideFlags)61
		};
		val.SetPixel(0, 0, c);
		val.Apply();
		return val;
	}

	private void InitStyles()
	{
		//IL_0132: Unknown result type (might be due to invalid IL or missing references)
		//IL_0137: Unknown result type (might be due to invalid IL or missing references)
		//IL_0140: Unknown result type (might be due to invalid IL or missing references)
		//IL_014a: Expected Obj, but got Unknown
		//IL_014a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0152: Unknown result type (might be due to invalid IL or missing references)
		//IL_0159: Unknown result type (might be due to invalid IL or missing references)
		//IL_016a: Expected Obj, but got Unknown
		//IL_0194: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c1: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c6: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c7: Unknown result type (might be due to invalid IL or missing references)
		//IL_01ce: Unknown result type (might be due to invalid IL or missing references)
		//IL_01e0: Unknown result type (might be due to invalid IL or missing references)
		//IL_01e5: Unknown result type (might be due to invalid IL or missing references)
		//IL_01ec: Unknown result type (might be due to invalid IL or missing references)
		//IL_01f3: Unknown result type (might be due to invalid IL or missing references)
		//IL_01fa: Unknown result type (might be due to invalid IL or missing references)
		//IL_0202: Unknown result type (might be due to invalid IL or missing references)
		//IL_020b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0215: Expected Obj, but got Unknown
		//IL_021a: Expected Obj, but got Unknown
		//IL_0248: Unknown result type (might be due to invalid IL or missing references)
		//IL_0262: Unknown result type (might be due to invalid IL or missing references)
		//IL_0277: Unknown result type (might be due to invalid IL or missing references)
		//IL_027c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0283: Unknown result type (might be due to invalid IL or missing references)
		//IL_028a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0297: Expected Obj, but got Unknown
		//IL_02b1: Unknown result type (might be due to invalid IL or missing references)
		//IL_02c2: Unknown result type (might be due to invalid IL or missing references)
		//IL_02c7: Unknown result type (might be due to invalid IL or missing references)
		//IL_02cf: Unknown result type (might be due to invalid IL or missing references)
		//IL_02db: Unknown result type (might be due to invalid IL or missing references)
		//IL_02f8: Expected Obj, but got Unknown
		//IL_0303: Unknown result type (might be due to invalid IL or missing references)
		//IL_0314: Unknown result type (might be due to invalid IL or missing references)
		//IL_0319: Unknown result type (might be due to invalid IL or missing references)
		//IL_0326: Expected Obj, but got Unknown
		//IL_0340: Unknown result type (might be due to invalid IL or missing references)
		//IL_0355: Unknown result type (might be due to invalid IL or missing references)
		//IL_035a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0362: Unknown result type (might be due to invalid IL or missing references)
		//IL_0369: Unknown result type (might be due to invalid IL or missing references)
		//IL_037a: Expected Obj, but got Unknown
		//IL_0394: Unknown result type (might be due to invalid IL or missing references)
		//IL_03bd: Unknown result type (might be due to invalid IL or missing references)
		//IL_03e6: Unknown result type (might be due to invalid IL or missing references)
		//IL_041c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0421: Unknown result type (might be due to invalid IL or missing references)
		//IL_0428: Unknown result type (might be due to invalid IL or missing references)
		//IL_043a: Unknown result type (might be due to invalid IL or missing references)
		//IL_044f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0454: Unknown result type (might be due to invalid IL or missing references)
		//IL_045c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0461: Unknown result type (might be due to invalid IL or missing references)
		//IL_046b: Expected Obj, but got Unknown
		//IL_046b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0470: Unknown result type (might be due to invalid IL or missing references)
		//IL_047a: Expected Obj, but got Unknown
		//IL_047f: Expected Obj, but got Unknown
		//IL_0490: Unknown result type (might be due to invalid IL or missing references)
		//IL_04a0: Unknown result type (might be due to invalid IL or missing references)
		//IL_04b0: Unknown result type (might be due to invalid IL or missing references)
		//IL_04da: Unknown result type (might be due to invalid IL or missing references)
		//IL_04ee: Unknown result type (might be due to invalid IL or missing references)
		//IL_0518: Unknown result type (might be due to invalid IL or missing references)
		//IL_052c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0563: Unknown result type (might be due to invalid IL or missing references)
		//IL_0568: Unknown result type (might be due to invalid IL or missing references)
		//IL_056f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0581: Unknown result type (might be due to invalid IL or missing references)
		//IL_0596: Unknown result type (might be due to invalid IL or missing references)
		//IL_059b: Unknown result type (might be due to invalid IL or missing references)
		//IL_05a3: Unknown result type (might be due to invalid IL or missing references)
		//IL_05aa: Unknown result type (might be due to invalid IL or missing references)
		//IL_05af: Unknown result type (might be due to invalid IL or missing references)
		//IL_05b9: Expected Obj, but got Unknown
		//IL_05be: Expected Obj, but got Unknown
		//IL_05dd: Unknown result type (might be due to invalid IL or missing references)
		//IL_0606: Unknown result type (might be due to invalid IL or missing references)
		object data = AppDomain.CurrentDomain.GetData("Obenseuer.DiegeticTheme.LootMap");
		bool flag = data is bool && (bool)data;
		if (flag == paperLook && panelStyle != null && (Object)(object)panelStyle.normal.background != (Object)null && (Object)(object)tipStyle.normal.background != (Object)null && (Object)(object)btnStyle.normal.background != (Object)null && (Object)(object)fieldStyle.focused.background != (Object)null && ((Object)(object)gameFont != (Object)null || !hadFont))
		{
			return;
		}
		paperLook = flag;
		gameFont = Resources.FindObjectsOfTypeAll<Font>().FirstOrDefault((Font f) => new string[5] { "special", "elite", "typewriter", "courier", "american" }.Any((string k) => ((Object)f).name.ToLowerInvariant().Contains(k)));
		hadFont = (Object)(object)gameFont != (Object)null;
		Logger.LogInfo((object)("Panel font: " + (((Object)(object)gameFont != (Object)null) ? ((Object)gameFont).name : "default")));
		panelStyle = new GUIStyle(GUI.skin.window)
		{
			padding = new RectOffset(12, 12, 30, 10),
			fontSize = 15,
			richText = true,
			font = gameFont
		};
		GUIStyleState normal = panelStyle.normal;
		Texture2D background = (panelStyle.onNormal.background = Solid(new Color(0.09f, 0.08f, 0.07f, 0.95f)));
		normal.background = background;
		GUIStyleState normal2 = panelStyle.normal;
		Color textColor = (panelStyle.onNormal.textColor = Ochre);
		normal2.textColor = textColor;
		tipStyle = new GUIStyle(GUI.skin.box)
		{
			alignment = (TextAnchor)0,
			wordWrap = true,
			richText = true,
			fontSize = 13,
			padding = new RectOffset(11, 11, 9, 9)
		};
		tipStyle.normal.background = Solid(new Color(Paper.r, Paper.g, Paper.b, 0.97f));
		tipStyle.normal.textColor = Ink;
		labelStyle = new GUIStyle(GUI.skin.label)
		{
			richText = true,
			wordWrap = true,
			fontSize = 13
		};
		labelStyle.normal.textColor = new Color(0.93f, 0.89f, 0.83f);
		headStyle = new GUIStyle(labelStyle)
		{
			fontSize = 12,
			font = gameFont,
			fontStyle = (FontStyle)(((Object)(object)gameFont == (Object)null) ? 1 : 0)
		};
		headStyle.normal.textColor = Ochre;
		smallStyle = new GUIStyle(labelStyle)
		{
			fontSize = 11
		};
		smallStyle.normal.textColor = new Color(0.66f, 0.62f, 0.53f);
		btnStyle = new GUIStyle(GUI.skin.button)
		{
			fontSize = 12,
			richText = true,
			font = gameFont
		};
		btnStyle.normal.background = Solid(new Color(0.42f, 0.29f, 0.08f));
		btnStyle.hover.background = Solid(new Color(0.6f, 0.42f, 0.12f));
		btnStyle.active.background = Solid(new Color(0.79f, 0.6f, 0.23f));
		GUIStyleState normal3 = btnStyle.normal;
		textColor = (btnStyle.hover.textColor = new Color(0.98f, 0.93f, 0.8f));
		normal3.textColor = textColor;
		btnStyle.active.textColor = Ink;
		fieldStyle = new GUIStyle(GUI.skin.textField)
		{
			fontSize = 14,
			border = new RectOffset(3, 3, 3, 3),
			padding = new RectOffset(7, 7, 5, 5)
		};
		Color fill = new Color(0.78f, 0.74f, 0.66f);
		fieldStyle.normal.background = Framed(fill, new Color(0.35f, 0.3f, 0.24f), 1);
		fieldStyle.hover.background = Framed(new Color(0.86f, 0.82f, 0.74f), new Color(0.55f, 0.45f, 0.3f), 1);
		fieldStyle.focused.background = Framed(new Color(1f, 0.98f, 0.92f), new Color(0.95f, 0.66f, 0.12f), 3);
		GUIStyleState normal4 = fieldStyle.normal;
		textColor = (fieldStyle.hover.textColor = new Color(0.25f, 0.21f, 0.16f));
		normal4.textColor = textColor;
		fieldStyle.focused.textColor = Ink;
		doorStyle = new GUIStyle(GUI.skin.label)
		{
			fontSize = 11,
			richText = true,
			padding = new RectOffset(4, 4, 1, 1)
		};
		doorStyle.normal.background = Solid(new Color(0.1f, 0.09f, 0.08f, 0.88f));
		doorStyle.normal.textColor = new Color(0.98f, 0.93f, 0.8f);
		if (paperLook)
		{
			PaperStyles();
		}
	}

	private void PaperStyles()
	{
		//IL_0014: Unknown result type (might be due to invalid IL or missing references)
		//IL_0019: Unknown result type (might be due to invalid IL or missing references)
		//IL_001e: Unknown result type (might be due to invalid IL or missing references)
		//IL_002a: Unknown result type (might be due to invalid IL or missing references)
		//IL_002f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0034: Unknown result type (might be due to invalid IL or missing references)
		//IL_0040: Unknown result type (might be due to invalid IL or missing references)
		//IL_0045: Unknown result type (might be due to invalid IL or missing references)
		//IL_004a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0056: Unknown result type (might be due to invalid IL or missing references)
		//IL_005b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0060: Unknown result type (might be due to invalid IL or missing references)
		//IL_006c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0071: Unknown result type (might be due to invalid IL or missing references)
		//IL_0076: Unknown result type (might be due to invalid IL or missing references)
		//IL_0083: Unknown result type (might be due to invalid IL or missing references)
		//IL_0088: Unknown result type (might be due to invalid IL or missing references)
		//IL_008d: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ad: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c5: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c6: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e6: Unknown result type (might be due to invalid IL or missing references)
		//IL_00f0: Expected Obj, but got Unknown
		//IL_0106: Unknown result type (might be due to invalid IL or missing references)
		//IL_0108: Unknown result type (might be due to invalid IL or missing references)
		//IL_0109: Unknown result type (might be due to invalid IL or missing references)
		//IL_0110: Unknown result type (might be due to invalid IL or missing references)
		//IL_0122: Unknown result type (might be due to invalid IL or missing references)
		//IL_0133: Unknown result type (might be due to invalid IL or missing references)
		//IL_0145: Unknown result type (might be due to invalid IL or missing references)
		//IL_0157: Unknown result type (might be due to invalid IL or missing references)
		//IL_016d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0194: Unknown result type (might be due to invalid IL or missing references)
		//IL_0199: Unknown result type (might be due to invalid IL or missing references)
		//IL_01be: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c0: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c1: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c8: Unknown result type (might be due to invalid IL or missing references)
		//IL_01da: Unknown result type (might be due to invalid IL or missing references)
		//IL_01ff: Unknown result type (might be due to invalid IL or missing references)
		//IL_0204: Unknown result type (might be due to invalid IL or missing references)
		//IL_0209: Unknown result type (might be due to invalid IL or missing references)
		//IL_0235: Unknown result type (might be due to invalid IL or missing references)
		//IL_023a: Unknown result type (might be due to invalid IL or missing references)
		//IL_023f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0256: Unknown result type (might be due to invalid IL or missing references)
		//IL_025b: Unknown result type (might be due to invalid IL or missing references)
		//IL_027e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0280: Unknown result type (might be due to invalid IL or missing references)
		//IL_0281: Unknown result type (might be due to invalid IL or missing references)
		//IL_0288: Unknown result type (might be due to invalid IL or missing references)
		//IL_029a: Unknown result type (might be due to invalid IL or missing references)
		Color fill = ToColor(new Color32((byte)222, (byte)205, (byte)162, (byte)245));
		Color val = ToColor(new Color32((byte)92, (byte)70, (byte)44, byte.MaxValue));
		Color c = ToColor(new Color32((byte)120, (byte)92, (byte)58, byte.MaxValue));
		Color textColor = ToColor(new Color32((byte)43, (byte)36, (byte)24, byte.MaxValue));
		Color val2 = ToColor(new Color32((byte)122, (byte)43, (byte)28, byte.MaxValue));
		Color val3 = ToColor(new Color32((byte)84, (byte)72, (byte)52, byte.MaxValue));
		Color val4 = ToColor(new Color32((byte)240, (byte)228, (byte)205, byte.MaxValue));
		GUIStyleState normal = panelStyle.normal;
		Texture2D background = (panelStyle.onNormal.background = Framed(fill, val, 2));
		normal.background = background;
		panelStyle.border = new RectOffset(3, 3, 3, 3);
		GUIStyleState normal2 = panelStyle.normal;
		Color textColor2 = (panelStyle.onNormal.textColor = val2);
		normal2.textColor = textColor2;
		labelStyle.normal.textColor = textColor;
		headStyle.normal.textColor = val2;
		smallStyle.normal.textColor = val3;
		btnStyle.normal.background = Solid(val);
		btnStyle.hover.background = Solid(c);
		btnStyle.active.background = Solid(ToColor(new Color32((byte)201, (byte)160, (byte)72, byte.MaxValue)));
		GUIStyleState normal3 = btnStyle.normal;
		textColor2 = (btnStyle.hover.textColor = val4);
		normal3.textColor = textColor2;
		btnStyle.active.textColor = textColor;
		fieldStyle.normal.background = Framed(ToColor(new Color32((byte)241, (byte)238, (byte)230, byte.MaxValue)), val3, 1);
		fieldStyle.hover.background = Framed(ToColor(new Color32((byte)248, (byte)245, (byte)238, byte.MaxValue)), val, 1);
		fieldStyle.focused.background = Framed(Color.white, val2, 2);
		GUIStyleState normal4 = fieldStyle.normal;
		textColor2 = (fieldStyle.hover.textColor = val3);
		normal4.textColor = textColor2;
		fieldStyle.focused.textColor = textColor;
	}

	private void OnGUI()
	{
		//IL_0010: Unknown result type (might be due to invalid IL or missing references)
		//IL_0016: Invalid comparison between Unknown and I4
		//IL_0019: Unknown result type (might be due to invalid IL or missing references)
		//IL_0024: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c0: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c5: Unknown result type (might be due to invalid IL or missing references)
		//IL_0038: Unknown result type (might be due to invalid IL or missing references)
		//IL_010d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0112: Unknown result type (might be due to invalid IL or missing references)
		//IL_011a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0126: Unknown result type (might be due to invalid IL or missing references)
		//IL_0153: Expected Obj, but got Unknown
		//IL_014e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0153: Unknown result type (might be due to invalid IL or missing references)
		//IL_015e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0163: Unknown result type (might be due to invalid IL or missing references)
		//IL_01e5: Unknown result type (might be due to invalid IL or missing references)
		//IL_01ea: Unknown result type (might be due to invalid IL or missing references)
		//IL_01c6: Unknown result type (might be due to invalid IL or missing references)
		//IL_01cc: Invalid comparison between Unknown and I4
		//IL_01fe: Unknown result type (might be due to invalid IL or missing references)
		//IL_01cf: Unknown result type (might be due to invalid IL or missing references)
		//IL_01d6: Invalid comparison between Unknown and I4
		//IL_0208: Unknown result type (might be due to invalid IL or missing references)
		//IL_020e: Invalid comparison between Unknown and I4
		//IL_0211: Unknown result type (might be due to invalid IL or missing references)
		//IL_021e: Unknown result type (might be due to invalid IL or missing references)
		//IL_02cc: Unknown result type (might be due to invalid IL or missing references)
		//IL_02dc: Unknown result type (might be due to invalid IL or missing references)
		//IL_0263: Unknown result type (might be due to invalid IL or missing references)
		//IL_02a5: Unknown result type (might be due to invalid IL or missing references)
		if (Db == null)
		{
			return;
		}
		Event current = Event.current;
		if ((int)current.type == 4 && current.keyCode == cfgToggleKey.Value && !Typing && (int)cfgToggleKey.Value != 0)
		{
			bool value = !cfgPanel.Value || !cfgEnabled.Value;
			cfgPanel.Value = value;
			cfgEnabled.Value = value;
			current.Use();
		}
		if (!MapOpen)
		{
			Typing = false;
			DrawHud();
			return;
		}
		InitStyles();
		if (!panelInit)
		{
			panelRect = new Rect(cfgPanelX.Value, cfgPanelY.Value, 300f, 10f);
			panelInit = true;
		}
		ComputeMapRect();
		if (cfgEnabled.Value && cfgDoors.Value)
		{
			DrawDoors();
		}
		if (cfgEnabled.Value && cfgInside.Value)
		{
			DrawInside();
		}
		if (cfgPanel.Value)
		{
			Vector2 position = panelRect.position;
			panelRect = GUILayout.Window(1280266068, panelRect, (GUI.WindowFunction)DrawPanel, Loc.T("LOOT MAP"), panelStyle, new GUILayoutOption[1] { GUILayout.Width(300f) });
			if (panelRect.position != position)
			{
				cfgPanelX.Value = panelRect.x;
				cfgPanelY.Value = panelRect.y;
			}
		}
		if (LeaveSearch)
		{
			LeaveSearch = false;
			GUI.FocusControl((string)null);
		}
		Typing = GUI.GetNameOfFocusedControl() == "lootmap_search";
		if (Typing && (int)current.type == 4 && (int)current.keyCode == 27)
		{
			GUI.FocusControl((string)null);
			Typing = false;
		}
		Vector2 mousePosition = current.mousePosition;
		bool num = cfgPanel.Value && panelRect.Contains(mousePosition);
		if ((int)current.type == 7)
		{
			UpdateHover(mousePosition);
		}
		if (!num && (int)current.type == 0 && current.button == 0)
		{
			if (hoveredDoor != null)
			{
				SetGuide(CurrentScene, new Vector3(hoveredDoor.x, hoveredDoor.y, hoveredDoor.z), Db.SceneName(hoveredDoor.to));
				current.Use();
			}
			else if (InsideHovered && InsideClick())
			{
				current.Use();
			}
			else if (hovered != null)
			{
				SetGuide(hovered.scene, hovered.world, MarkerTitle(hovered));
				current.Use();
			}
		}
		if (!num)
		{
			if (hovered != null)
			{
				DrawTooltip(mousePosition);
			}
			else if (hoveredDoor != null)
			{
				DrawDoorTooltip(mousePosition);
			}
			else if (InsideHovered)
			{
				ShowTip(mousePosition, InsideTip());
			}
		}
	}

	private void ComputeMapRect()
	{
		//IL_0017: Unknown result type (might be due to invalid IL or missing references)
		//IL_001c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0080: Unknown result type (might be due to invalid IL or missing references)
		//IL_0093: Unknown result type (might be due to invalid IL or missing references)
		//IL_0098: Unknown result type (might be due to invalid IL or missing references)
		//IL_009d: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a6: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ab: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ae: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bb: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d0: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00dd: Unknown result type (might be due to invalid IL or missing references)
		mapScreenRect = new Rect(0f, 0f, (float)Screen.width, (float)Screen.height);
		RectTransform val = MapContent.Invoke(map);
		object obj;
		if (!((Object)(object)val != (Object)null))
		{
			obj = null;
		}
		else
		{
			Transform parent = ((Transform)val).parent;
			obj = ((parent is RectTransform) ? parent : null);
		}
		RectTransform val2 = (RectTransform)obj;
		if (!((Object)(object)val2 == (Object)null))
		{
			Vector3[] array = new Vector3[4];
			val2.GetWorldCorners(array);
			Canvas componentInParent = ((Component)val2).GetComponentInParent<Canvas>();
			Canvas val3 = ((componentInParent != null) ? componentInParent.rootCanvas : null);
			Camera obj2 = (((Object)(object)val3 != (Object)null && (int)val3.renderMode != 0) ? val3.worldCamera : null);
			Vector2 val4 = RectTransformUtility.WorldToScreenPoint(obj2, array[0]);
			Vector2 val5 = RectTransformUtility.WorldToScreenPoint(obj2, array[2]);
			mapScreenRect = Rect.MinMaxRect(val4.x, (float)Screen.height - val5.y, val5.x, (float)Screen.height - val4.y);
		}
	}

	private Camera UiCam()
	{
		//IL_003a: Unknown result type (might be due to invalid IL or missing references)
		Canvas val = (((Object)(object)layer != (Object)null) ? ((Component)layer).GetComponentInParent<Canvas>() : null);
		Canvas val2 = (((Object)(object)val != (Object)null) ? val.rootCanvas : null);
		if (!((Object)(object)val2 != (Object)null) || (int)val2.renderMode == 0)
		{
			return null;
		}
		return val2.worldCamera;
	}

	private Vector2 GuiPointOnMap(Vector3 world)
	{
		//IL_001b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0020: Unknown result type (might be due to invalid IL or missing references)
		//IL_002a: Unknown result type (might be due to invalid IL or missing references)
		//IL_002f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0038: Unknown result type (might be due to invalid IL or missing references)
		//IL_0039: Unknown result type (might be due to invalid IL or missing references)
		//IL_003e: Unknown result type (might be due to invalid IL or missing references)
		//IL_004b: Unknown result type (might be due to invalid IL or missing references)
		//IL_004c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0051: Unknown result type (might be due to invalid IL or missing references)
		//IL_0056: Unknown result type (might be due to invalid IL or missing references)
		//IL_005b: Unknown result type (might be due to invalid IL or missing references)
		//IL_005c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0068: Unknown result type (might be due to invalid IL or missing references)
		//IL_006f: Unknown result type (might be due to invalid IL or missing references)
		RectTransform val = MapSize.Invoke(map);
		info_map instance = info_map.instance;
		Rect rect = val.rect;
		float width = rect.width;
		rect = val.rect;
		Vector2 val2 = MapLocal(instance, width, rect.height, world);
		Vector2 val3 = RectTransformUtility.WorldToScreenPoint(UiCam(), ((Transform)layer).TransformPoint(ToV3(val2)));
		return new Vector2(val3.x, (float)Screen.height - val3.y);
	}

	private void DrawDoors()
	{
		//IL_0066: Unknown result type (might be due to invalid IL or missing references)
		//IL_006b: Unknown result type (might be due to invalid IL or missing references)
		//IL_009c: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a6: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ae: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ba: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bc: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bd: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c2: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e3: Unknown result type (might be due to invalid IL or missing references)
		//IL_011c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0106: Unknown result type (might be due to invalid IL or missing references)
		//IL_0126: Unknown result type (might be due to invalid IL or missing references)
		//IL_0133: Unknown result type (might be due to invalid IL or missing references)
		//IL_014a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0159: Unknown result type (might be due to invalid IL or missing references)
		//IL_0163: Unknown result type (might be due to invalid IL or missing references)
		//IL_0170: Unknown result type (might be due to invalid IL or missing references)
		//IL_0187: Unknown result type (might be due to invalid IL or missing references)
		//IL_01a0: Unknown result type (might be due to invalid IL or missing references)
		//IL_01a6: Invalid comparison between Unknown and I4
		//IL_01d1: Unknown result type (might be due to invalid IL or missing references)
		//IL_01d8: Expected Obj, but got Unknown
		//IL_01e0: Unknown result type (might be due to invalid IL or missing references)
		//IL_01e5: Unknown result type (might be due to invalid IL or missing references)
		//IL_01ed: Unknown result type (might be due to invalid IL or missing references)
		//IL_01fa: Unknown result type (might be due to invalid IL or missing references)
		//IL_0201: Unknown result type (might be due to invalid IL or missing references)
		//IL_020f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0216: Unknown result type (might be due to invalid IL or missing references)
		//IL_021d: Unknown result type (might be due to invalid IL or missing references)
		hoveredDoor = null;
		if ((Object)(object)layer == (Object)null || (Object)(object)info_map.instance == (Object)null || !Db.scenes.TryGetValue(CurrentScene ?? "", out var value))
		{
			return;
		}
		float num = ((lastZoom > 0f) ? lastZoom : 1f);
		Vector2 mousePosition = Event.current.mousePosition;
		foreach (DoorData door in value.doors)
		{
			Vector2 val = GuiPointOnMap(new Vector3(door.x, door.y, door.z));
			if (mapScreenRect.Contains(val))
			{
				Vector2 val2 = val - mousePosition;
				bool flag = val2.sqrMagnitude < 81f;
				if (flag)
				{
					hoveredDoor = door;
					hoveredDoorAt = val;
				}
				Color color = GUI.color;
				string doorSt = DoorState(door, CurrentScene);
				GUI.color = DoorColor(doorSt);
				GUI.DrawTexture(new Rect(val.x - 5f, val.y - 5f, 10f, 10f), (Texture)(object)Texture2D.whiteTexture);
				GUI.color = Paper;
				if (doorSt == "open" || doorSt == "closed")
				{
					GUI.DrawTexture(new Rect(val.x - 1.5f, val.y - 3f, 3f, 6f), (Texture)(object)Texture2D.whiteTexture);
				}
				else
				{
					GUI.DrawTexture(new Rect(val.x - 3f, val.y - 0.5f, 6f, 4.5f), (Texture)(object)Texture2D.whiteTexture);
					GUI.DrawTexture(new Rect(val.x - 2f, val.y - 3.5f, 1.2f, 3.2f), (Texture)(object)Texture2D.whiteTexture);
					GUI.DrawTexture(new Rect(val.x + 0.8f, val.y - 3.5f, 1.2f, 3.2f), (Texture)(object)Texture2D.whiteTexture);
					GUI.DrawTexture(new Rect(val.x - 2f, val.y - 3.5f, 4f, 1.2f), (Texture)(object)Texture2D.whiteTexture);
					if (doorSt == "blocked")
					{
						GUI.color = new Color(0.8f, 0.12f, 0.1f);
						GUI.DrawTexture(new Rect(val.x - 5f, val.y - 0.6f, 10f, 1.4f), (Texture)(object)Texture2D.whiteTexture);
					}
				}
				GUI.color = color;
				if ((int)Event.current.type == 7 && (flag || num > 2.2f || Indoors))
				{
					GUIContent val3 = new GUIContent(Db.SceneName(door.to) + DoorTag(doorSt));
					Vector2 val4 = doorStyle.CalcSize(val3);
					doorStyle.Draw(new Rect(val.x + 8f, val.y - val4.y / 2f, val4.x, val4.y), val3, false, false, false, false);
				}
			}
		}
	}

	private void DrawDoorTooltip(Vector2 at)
	{
		//IL_01e8: Unknown result type (might be due to invalid IL or missing references)
		DoorData doorData = hoveredDoor;
		StringBuilder stringBuilder = new StringBuilder();
		stringBuilder.Append("<b><size=15>" + Db.SceneName(doorData.to) + "</size></b>\n");
		SceneData value;
		if (doorData.open == 0)
		{
			stringBuilder.Append("<color=#7a6f5c>" + Loc.T("not open in this game version") + "</color>");
		}
		else if (Db.scenes.TryGetValue(doorData.to, out value))
		{
			string dst = DoorState(doorData, CurrentScene);
			if (dst != "open")
			{
				stringBuilder.Append("<color=" + ((dst == "blocked") ? "#7a6f5c" : "#6b3fa0") + "><b>" + DoorText(dst) + "</b>" + ((dst == "pick" && doorData.df > 0f) ? (" · " + DifficultyText(doorData.df)) : "") + "</color>\n");
			}
			stringBuilder.Append(string.Format("{0} {1}: <color=#3f6b2f><b>{2} {3}</b></color> · <color=#9b1c14><b>{4} {5}</b></color>", value.free + value.steal, Loc.T("loot"), value.free, Loc.T("free"), value.steal, Loc.T("stealing")));
			if (value.vendors.Count > 0)
			{
				stringBuilder.Append("\n" + Loc.T("Shops") + ": " + string.Join(", ", value.vendors.Select((VendorData v) => v.n).Distinct().Take(4)));
			}
			if (value.stations.Count > 0)
			{
				stringBuilder.Append("\n" + Loc.T("Workstations") + ": " + string.Join(", ", value.stations.Select((StationData v) => v.n).Distinct().Take(6)));
			}
			stringBuilder.Append("\n<color=#7a6f5c>" + Loc.T("Click to go there") + "</color>");
		}
		ShowTip(at, stringBuilder.ToString());
	}

	private string MarkerTitle(Marker m)
	{
		if (m.st != null)
		{
			return m.st.n;
		}
		if (m.v != null)
		{
			return m.v.n;
		}
		return m.p.t ?? m.p.n ?? Loc.T((m.p.k == "p") ? "Pickup spot" : "Container");
	}

	private void DrawPanel(int id)
	{
		//IL_0011: Unknown result type (might be due to invalid IL or missing references)
		//IL_0016: Unknown result type (might be due to invalid IL or missing references)
		//IL_001d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0022: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		//IL_002e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0035: Unknown result type (might be due to invalid IL or missing references)
		//IL_003a: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a4: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b0: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bc: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c8: Unknown result type (might be due to invalid IL or missing references)
		//IL_0067: Unknown result type (might be due to invalid IL or missing references)
		//IL_006c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0071: Unknown result type (might be due to invalid IL or missing references)
		//IL_0072: Unknown result type (might be due to invalid IL or missing references)
		//IL_0079: Unknown result type (might be due to invalid IL or missing references)
		//IL_007b: Unknown result type (might be due to invalid IL or missing references)
		//IL_007c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0083: Unknown result type (might be due to invalid IL or missing references)
		//IL_0085: Unknown result type (might be due to invalid IL or missing references)
		//IL_0086: Unknown result type (might be due to invalid IL or missing references)
		//IL_008d: Unknown result type (might be due to invalid IL or missing references)
		GUIStyle toggle = GUI.skin.toggle;
		Color textColor = toggle.normal.textColor;
		Color textColor2 = toggle.onNormal.textColor;
		Color textColor3 = toggle.hover.textColor;
		Color textColor4 = toggle.onHover.textColor;
		if (paperLook)
		{
			GUIStyleState normal = toggle.normal;
			GUIStyleState onNormal = toggle.onNormal;
			GUIStyleState hover = toggle.hover;
			Color val = (toggle.onHover.textColor = ToColor(new Color32((byte)43, (byte)36, (byte)24, byte.MaxValue)));
			Color val3 = (hover.textColor = val);
			Color textColor5 = (onNormal.textColor = val3);
			normal.textColor = textColor5;
		}
		try
		{
			DrawPanelContent(id);
		}
		finally
		{
			toggle.normal.textColor = textColor;
			toggle.onNormal.textColor = textColor2;
			toggle.hover.textColor = textColor3;
			toggle.onHover.textColor = textColor4;
		}
	}

	private void DrawPanelContent(int id)
	{
		//IL_077c: Unknown result type (might be due to invalid IL or missing references)
		// The panel can be taller than the screen (profit finder, shopping list): scroll instead of running off the bottom.
		float panelMaxH = Mathf.Max(220f, (float)Screen.height - panelRect.y - 40f);
		panelScroll = GUILayout.BeginScrollView(panelScroll, false, false, GUIStyle.none, GUI.skin.verticalScrollbar, GUIStyle.none, new GUILayoutOption[1] { GUILayout.MaxHeight(panelMaxH) });
		cfgEnabled.Value = GUILayout.Toggle(cfgEnabled.Value, " " + Loc.T("Show loot markers"), Array.Empty<GUILayoutOption>());
		if (cfgEnabled.Value)
		{
			GUILayout.Space(4f);
			GUILayout.Label(Loc.T("Search item, container or workstation"), smallStyle, Array.Empty<GUILayoutOption>());
			GUI.SetNextControlName("lootmap_search");
			search = GUILayout.TextField(search, 40, fieldStyle, Array.Empty<GUILayoutOption>());
			if (Typing)
			{
				GUILayout.Label("<color=#f2a51f>✎ " + Loc.T("Typing — game keys are paused. Esc to leave.") + "</color>", smallStyle, Array.Empty<GUILayoutOption>());
			}
			if (ExactSearch)
			{
				GUILayout.Label("<color=#9fdc8a>" + Loc.T("Exact name only") + ": " + ExactTerm + "</color>", smallStyle, Array.Empty<GUILayoutOption>());
			}
			else if (Typing || search.Length == 0)
			{
				GUILayout.Label(Loc.T("Tip: \"bottle of ink\" or (bottle of ink) finds that exact item."), smallStyle, Array.Empty<GUILayoutOption>());
			}
			else if (search.Length == 0)
			{
				GUILayout.Label(Loc.T("Click the box to type."), smallStyle, Array.Empty<GUILayoutOption>());
			}
			GUILayout.BeginHorizontal(Array.Empty<GUILayoutOption>());
			if (GUILayout.Button(Loc.T("Zoom to me"), btnStyle, Array.Empty<GUILayoutOption>()))
			{
				ZoomToPlayer();
			}
			if ((search.Length > 0 || searchIds != null || searchIdsLabel != null) && GUILayout.Button(Loc.T("Clear search"), btnStyle, Array.Empty<GUILayoutOption>()))
			{
				ClearSearch();
				GUI.FocusControl((string)null);
			}
			GUILayout.EndHorizontal();
			if (GUILayout.Button(Loc.T("Ingredients for my marked recipes"), btnStyle, Array.Empty<GUILayoutOption>()))
			{
				UseMarkedRecipes();
			}
			if (searchIdsLabel != null)
			{
				GUILayout.Label(searchIdsLabel, smallStyle, Array.Empty<GUILayoutOption>());
			}
			if (searchWarn != null && search.Trim().Length > 0 && appliedSearch.Length == 0)
			{
				GUILayout.Label("<color=#d98e04>" + searchWarn + "</color>", smallStyle, Array.Empty<GUILayoutOption>());
			}
			if (search != appliedSearch && searchWarn == null)
			{
				GUILayout.Label(Loc.T("searching…"), smallStyle, Array.Empty<GUILayoutOption>());
			}
			GUILayout.Space(6f);
			cfgContainers.Value = GUILayout.Toggle(cfgContainers.Value, " " + Loc.T("Containers"), Array.Empty<GUILayoutOption>());
			cfgPickups.Value = GUILayout.Toggle(cfgPickups.Value, " " + Loc.T("Pickup spots"), Array.Empty<GUILayoutOption>());
			cfgRecipes.Value = GUILayout.Toggle(cfgRecipes.Value, " " + Loc.T("Recipes & blueprints"), Array.Empty<GUILayoutOption>());
			cfgStations.Value = GUILayout.Toggle(cfgStations.Value, " " + Loc.T("Workstations"), Array.Empty<GUILayoutOption>());
			cfgShops.Value = GUILayout.Toggle(cfgShops.Value, " " + Loc.T("Shops"), Array.Empty<GUILayoutOption>());
			cfgDoors.Value = GUILayout.Toggle(cfgDoors.Value, " " + Loc.T("Doors"), Array.Empty<GUILayoutOption>());
			cfgInside.Value = GUILayout.Toggle(cfgInside.Value, " " + Loc.T("Inside doors, stairs, lifts"), Array.Empty<GUILayoutOption>());
			cfgFreeOnly.Value = GUILayout.Toggle(cfgFreeOnly.Value, " " + Loc.T("Only free to take"), Array.Empty<GUILayoutOption>());
			cfgOnlyNow.Value = GUILayout.Toggle(cfgOnlyNow.Value, " " + Loc.T("Searching: only where it is now"), Array.Empty<GUILayoutOption>());
			cfgAccess.Value = GUILayout.Toggle(cfgAccess.Value, " " + Loc.T("Searching: mark spots behind locked doors"), Array.Empty<GUILayoutOption>());
			cfgHideLocked.Value = GUILayout.Toggle(cfgHideLocked.Value, " " + Loc.T("Searching: hide spots behind locked doors"), Array.Empty<GUILayoutOption>());
			cfgFloorOnly.Value = GUILayout.Toggle(cfgFloorOnly.Value, " " + Loc.T("Indoors: only my floor"), Array.Empty<GUILayoutOption>());
			cfgWholeMap.Value = GUILayout.Toggle(cfgWholeMap.Value, " " + Loc.T("Search other buildings too"), Array.Empty<GUILayoutOption>());
			cfgWorld.Value = GUILayout.Toggle(cfgWorld.Value, " " + Loc.T("Highlight matches in the world"), Array.Empty<GUILayoutOption>());
			if (ScavengerBridge.Available)
			{
				cfgTrashRoute.Value = GUILayout.Toggle(cfgTrashRoute.Value, " " + Loc.T("Trash route (Scavenger)"), Array.Empty<GUILayoutOption>());
				GUILayout.Label(string.Format("<color=#b5c936>■</color> {0}: <b>{1}</b>", Loc.T("Trash searched today"), ScavengerBridge.SearchedTodayCount) + (TrashRoute ? string.Format(" · <b>{0}</b> {1}", TrashLeftOnMap(), Loc.T("left on this map")) : ""), labelStyle, Array.Empty<GUILayoutOption>());
			}
			GUILayout.Space(6f);
			GUILayout.Label(Summary(), labelStyle, Array.Empty<GUILayoutOption>());
			HashSet<int> matchedIds = MatchedIds;
			HashSet<int> matchedFurniture = MatchedFurniture;
			if (matchedFurniture != null && matchedFurniture.Count > 0)
			{
				GUILayout.Label("<color=#c9a46a>" + Loc.T("Furniture") + "</color>: " + string.Join("\n", matchedFurniture.Take(3).Select(Db.FurnInfo)) + ((matchedFurniture.Count > 3) ? string.Format("  +{0} {1}", matchedFurniture.Count - 3, Loc.T("more")) : ""), smallStyle, Array.Empty<GUILayoutOption>());
			}
			if ((matchedIds != null && matchedIds.Count > 0) || (matchedFurniture != null && matchedFurniture.Count > 0))
			{
				GUILayout.Label("<color=#3ddc5a>■</color> " + Loc.T("has it now") + "   <color=#d98e04>■</color> " + Loc.T("can drop it") + "\n<color=#3d8bff>●</color> " + Loc.T("sells it") + "   <color=#ff7a2f>●</color> " + Loc.T("buys it") + "   <color=#b45cff>●</color> " + Loc.T("sells & buys"), smallStyle, Array.Empty<GUILayoutOption>());
			}
			DrawShops();
			DrawToolsPanel();
			if (guide != null)
			{
				GUILayout.Space(4f);
				GUILayout.Label(Loc.T("Guiding to") + ": <b>" + GuideLabel + "</b>", labelStyle, Array.Empty<GUILayoutOption>());
				if (GUILayout.Button(Loc.T("Stop guiding"), btnStyle, Array.Empty<GUILayoutOption>()))
				{
					ClearGuide();
				}
			}
			GUILayout.Space(4f);
			GUILayout.Label("<color=#d98e04>■</color> " + Loc.T("container") + "   <color=#1f7a8c>●</color> " + Loc.T("pickup") + "   <color=#2f5d3a>■</color> " + Loc.T("workstation") + "   <color=#d6b23c>●</color> " + Loc.T("shop") + "\n<color=#c81e18>" + Loc.T("red edge = stealing") + "</color> · <color=#9f7ae0>" + Loc.T("purple edge = locked") + "</color> · " + Loc.T("hollow = empty") + "\n" + Loc.T("Hover a marker for its loot. Click it to be guided there.") + string.Format("  [{0}] {1}", cfgToggleKey.Value, Loc.T("Toggle panel")), smallStyle, Array.Empty<GUILayoutOption>());
		}
		GUILayout.EndScrollView();
		GUI.DragWindow();
	}

	private string Summary()
	{
		int num = Enumerable.Count(markers, (Marker m) => m.scene == CurrentScene);
		if (!Searching)
		{
			int cl = markers.Count((Marker m) => m.scene == CurrentScene && m.p != null && m.p.k == "c" && !(m.p.live ? m.p.empty : IsLooted(m.scene, m.p)));
			int ce = markers.Count((Marker m) => m.scene == CurrentScene && m.p != null && m.p.k == "c" && (m.p.live ? m.p.empty : IsLooted(m.scene, m.p)));
			string extra = (ce > 0) ? string.Format(" · {0} {1}, {2} {3}", cl, Loc.T("containers left"), ce, Loc.T("emptied")) + ((cl == 0) ? (" ✓ " + Loc.T("nothing left to search here")) : "") : "";
			return string.Format("{0} {1}{2}", num, Loc.T("markers in this place."), extra);
		}
		int num2 = Enumerable.Count(markers, (Marker m) => m.match && m.scene == CurrentScene);
		int num3 = Enumerable.Count(markers, (Marker m) => m.match && m.scene != CurrentScene);
		int num4 = (from m in markers
			where m.match && m.scene != CurrentScene
			select m.scene).Distinct().Count();
		StringBuilder stringBuilder = new StringBuilder(string.Format("<b>{0}</b> {1}", num2, Loc.T("matches here")));
		if (cfgWholeMap.Value)
		{
			stringBuilder.Append(string.Format(", <b>{0}</b> {1} {2} {3}", num3, Loc.T("in"), num4, Loc.T("other buildings on this map")));
		}
		return stringBuilder.Append('.').ToString();
	}

	private static string ModeText(int mode)
	{
		if ((mode & 4) == 0)
		{
			return mode switch
			{
				1 => "<color=#7fb2ff>" + Loc.T("sells it") + "</color>", 
				3 => "<color=#c99bff>" + Loc.T("sells & buys") + "</color>", 
				_ => "<color=#ffa070>" + Loc.T("buys it") + "</color>", 
			};
		}
		return "<color=#9fdc8a>" + Loc.T("in stock now") + "</color>";
	}

	private string ShopExtra(VendorData v, int mode)
	{
		StringBuilder stringBuilder = new StringBuilder();
		int pid = PriceItem();
		if (pid > 0)
		{
			if ((mode & 1) != 0 && BuyPrice(v, pid) > 0)
			{
				stringBuilder.Append(" · <color=#7fb2ff>" + BuyPrice(v, pid) + " OC</color>");
			}
			if ((mode & 2) != 0 && SellPrice(v, pid) > 0)
			{
				stringBuilder.Append(" · <color=#ffa070>" + SellPrice(v, pid) + " OC</color>");
			}
		}
		if (IsClosedNow(v))
		{
			stringBuilder.Append(" · <color=#d98a7a>" + Loc.T("closed now") + "</color>");
		}
		return stringBuilder.ToString();
	}

	private void DrawShops()
	{
		//IL_031d: Unknown result type (might be due to invalid IL or missing references)
		//IL_021d: Unknown result type (might be due to invalid IL or missing references)
		if (!Searching)
		{
			return;
		}
		string text = appliedSearch + "|" + searchIdsLabel + "|" + LiveKey();
		if (text != shopKey)
		{
			shopKey = text;
			shopHits = (from x in Db.scenes.SelectMany((KeyValuePair<string, SceneData> kv) => kv.Value.vendors.Select((VendorData v) => (Key: kv.Key, v: v, VendorMode(v))))
				where x.Item3 != 0
				orderby (x.Item3 & 1) != 0 descending, x.Item3 == 3 descending, Db.scenes[x.Key].map == CurrentMap descending, ((PriceItem() > 0 && (x.Item3 & 1) != 0 && BuyPrice(x.v, PriceItem()) > 0) ? BuyPrice(x.v, PriceItem()) : int.MaxValue)
				select x).Take(8).ToList();
		}
		string currentScene = CurrentScene;
		if (currentScene != null && Db.scenes.TryGetValue(currentScene, out var value))
		{
			List<(VendorData, List<KeyValuePair<int, int>>)> list = (from v in value.vendors
				select (v: v, InStockNow(v)) into x
				where x.Item2.Count > 0
				select x).ToList();
			if (list.Count > 0)
			{
				GUILayout.Space(4f);
				GUILayout.Label(Loc.T("In stock now"), headStyle, Array.Empty<GUILayoutOption>());
				foreach (var (vendorData, source) in list)
				{
					if (GUILayout.Button(vendorData.n + " <color=#9fdc8a>· " + string.Join(", ", from kv in source.Take(3)
						select Db.FurnName(kv.Key) + ((kv.Value > 1) ? (" ×" + kv.Value) : "")) + "</color>", btnStyle, Array.Empty<GUILayoutOption>()))
					{
						SetGuide(currentScene, new Vector3(vendorData.x, vendorData.y, vendorData.z), vendorData.n);
					}
				}
			}
		}
		if (shopHits == null || shopHits.Count == 0)
		{
			return;
		}
		GUILayout.Space(4f);
		GUILayout.Label(Loc.T("Shops for this item"), headStyle, Array.Empty<GUILayoutOption>());
		foreach (var (scene, vendorData2, mode) in shopHits)
		{
			if (GUILayout.Button(vendorData2.n + " <color=#d9c7a2>· " + Db.SceneName(scene) + "</color> · " + ModeText(mode) + ShopExtra(vendorData2, mode), btnStyle, Array.Empty<GUILayoutOption>()))
			{
				SetGuide(scene, new Vector3(vendorData2.x, vendorData2.y, vendorData2.z), vendorData2.n);
			}
		}
	}

	private void UpdateHover(Vector2 guiMouse)
	{
		//IL_0028: Unknown result type (might be due to invalid IL or missing references)
		//IL_003a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0046: Unknown result type (might be due to invalid IL or missing references)
		//IL_004d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0097: Unknown result type (might be due to invalid IL or missing references)
		//IL_009c: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a2: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a7: Unknown result type (might be due to invalid IL or missing references)
		hovered = null;
		if ((Object)(object)layer == (Object)null || markers.Count == 0 || !mapScreenRect.Contains(guiMouse))
		{
			return;
		}
		Camera val = UiCam();
		Vector2 val2 = new Vector2(guiMouse.x, (float)Screen.height - guiMouse.y);
		float num = 169f;
		foreach (Marker marker in markers)
		{
			if (!((Object)(object)marker.rt == (Object)null) && (!Searching || marker.match))
			{
				Vector2 val3 = RectTransformUtility.WorldToScreenPoint(val, ((Transform)marker.rt).position) - val2;
				float sqrMagnitude = val3.sqrMagnitude;
				if (sqrMagnitude < num)
				{
					num = sqrMagnitude;
					hovered = marker;
				}
			}
		}
		if (hovered != null)
		{
			hoveredDoor = null;
		}
	}

	private string Hi(string name)
	{
		if (Q.Length <= 0 || !TextMatch(name))
		{
			return name;
		}
		return "<color=#9b5a00><b>" + name + "</b></color>";
	}

	private string HiId(int id)
	{
		string text = Db.ItemName(id);
		if (searchIds == null || !searchIds.Contains(id))
		{
			return Hi(text);
		}
		return "<color=#9b5a00><b>" + text + "</b></color>";
	}

	private bool IsHit(int id)
	{
		if (searchIds == null || !searchIds.Contains(id))
		{
			if (Q.Length > 0)
			{
				return TextMatch(Db.ItemName(id));
			}
			return false;
		}
		return true;
	}

	private string ItemList(IEnumerable<int> ids, int max)
	{
		List<(int, int)> list = (from i in ids
			group i by i into g
			select (id: g.Key, n: g.Count())).ToList();
		IOrderedEnumerable<(int, int)> source = list.OrderByDescending(((int id, int n) g) => IsHit(g.id)).ThenBy(((int id, int n) g) => Db.ItemName(g.id)).Take(max)
			.OrderBy(((int id, int n) g) => Db.ItemName(g.id));
		string text = string.Join(", ", source.Select(((int id, int n) g) => HiId(g.id) + ((g.n > 1) ? $" ×{g.n}" : "")));
		if (list.Count <= max)
		{
			return text;
		}
		return text + string.Format("  <color=#7a6f5c>+{0} {1}</color>", list.Count - max, Loc.T("more"));
	}

	private void DrawTooltip(Vector2 at)
	{
		//IL_0ce2: Unknown result type (might be due to invalid IL or missing references)
		//IL_063f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0645: Invalid comparison between Unknown and I4
		StringBuilder stringBuilder = new StringBuilder();
		Marker marker = hovered;
		if (marker.st != null)
		{
			StationData st = marker.st;
			stringBuilder.Append("<b><size=15>" + st.n + "</size></b>  <color=#7a6f5c>" + Loc.T("workstation") + "</color>\n");
			stringBuilder.Append((st.s == 1) ? ("<color=#9b1c14><b>" + Loc.T("Owned") + ((st.o != null) ? (" " + Loc.T("by") + " " + st.o) : "") + "</b> — " + Loc.T("taking its items is stealing") + "</color>\n") : ("<color=#3f6b2f><b>" + Loc.T("Free to use") + "</b></color>\n"));
			foreach (string item in st.r)
			{
				Db.recipes.TryGetValue(item, out var value);
				value = value ?? new List<string>();
				string q = Q;
				IOrderedEnumerable<string> source = from r in value.OrderByDescending((string r) => q.Length > 0 && TextMatch(r)).Take(10)
					orderby r
					select r;
				stringBuilder.Append(string.Format("\n<b>{0}</b> · {1} {2}\n{3}{4}\n", item, value.Count, Loc.T("recipes"), string.Join(", ", source.Select(Hi)), (value.Count > 10) ? string.Format("  <color={0}>+{1} {2}</color>", "#7a6f5c", value.Count - 10, Loc.T("more")) : ""));
			}
		}
		else if (marker.v != null)
		{
			VendorData v = marker.v;
			stringBuilder.Append("<b><size=15>" + v.n + "</size></b>  <color=#7a6f5c>" + Loc.T("shop") + ((v.o != null) ? (" · " + v.o) : "") + "</color>\n");
			bool shopOpen;
			string shopHours = HoursText(v, out shopOpen);
			if (shopHours != null)
			{
				stringBuilder.Append("<color=" + (shopOpen ? "#1f8a3a" : "#b03a2e") + "><b>" + shopHours + "</b></color>\n");
			}
			if (v.bm > 0f)
			{
				stringBuilder.Append("<color=#7a6f5c>" + Loc.T("You pay") + " ×" + v.bm.ToString("0.##") + " · " + Loc.T("you get") + " ×" + v.sm.ToString("0.##") + ((v.fp == 1) ? (" · " + Loc.T("fixed prices")) : "") + "</color>\n");
			}
			HashSet<int> matchedIds = MatchedIds;
			if (matchedIds != null && matchedIds.Count > 0)
			{
				List<int> list = matchedIds.Where((int id) => Db.Sells(v, id)).Take(6).ToList();
				List<int> list2 = matchedIds.Where((int id) => Db.Buys(v, id)).Take(6).ToList();
				if (list.Count > 0)
				{
					stringBuilder.Append("<color=#1f5fd0><b>" + Loc.T("Sells") + "</b>: " + string.Join(", ", list.Select((int i) => Db.ItemName(i) + ((BuyPrice(v, i) > 0) ? (" (" + BuyPrice(v, i) + " OC)") : ""))) + "</color>\n");
				}
				if (list2.Count > 0)
				{
					stringBuilder.Append("<color=#c2501a><b>" + Loc.T("Buys") + "</b>: " + string.Join(", ", list2.Select((int i) => Db.ItemName(i) + ((SellPrice(v, i) > 0) ? (" (" + SellPrice(v, i) + " OC)") : ""))) + "</color>\n");
				}
			}
			List<KeyValuePair<int, int>> list3 = InStockNow(v);
			if (list3.Count > 0)
			{
				stringBuilder.Append("<color=#1f8a3a><b>✔ " + Loc.T("In stock now") + "</b>: " + string.Join(", ", list3.Select((KeyValuePair<int, int> kv) => Db.FurnName(kv.Key) + ((kv.Value > 1) ? (" ×" + kv.Value) : ""))) + "</color>\n");
			}
			HashSet<int> matchedFurniture = MatchedFurniture;
			if (matchedFurniture != null && matchedFurniture.Count > 0)
			{
				List<int> list4 = matchedFurniture.Where((int id) => Db.FurnSells(v, id)).Take(6).ToList();
				List<int> list5 = matchedFurniture.Where((int id) => Db.FurnBuys(v, id)).Take(6).ToList();
				if (list4.Count > 0)
				{
					stringBuilder.Append("<color=#1f5fd0><b>" + Loc.T("Sells furniture") + "</b>: " + string.Join(", ", list4.Select(Db.FurnInfo)) + "</color>\n");
				}
				if (list5.Count > 0)
				{
					stringBuilder.Append("<color=#c2501a><b>" + Loc.T("Buys furniture") + "</b>: " + string.Join(", ", list5.Select(Db.FurnName)) + "</color>\n");
				}
			}
			if (v.fs != null && v.fs.Count > 0)
			{
				stringBuilder.Append(string.Format("<color={0}>{1}: {2}</color>\n", "#7a6f5c", Loc.T("Furniture for sale"), v.fs.Count));
			}
			if (v.fb != null)
			{
				stringBuilder.Append("<color=#7a6f5c>" + Loc.T("Buys furniture") + ": " + (((int)v.fb.Type == 8) ? Loc.T((((object)v.fb).ToString() == "any") ? "any furniture" : "what it sells") : (((IEnumerable<JToken>)v.fb).Count().ToString() ?? "")) + "</color>\n");
			}
			if (v.b == 1)
			{
				stringBuilder.Append("<color=#7a6f5c>" + Loc.T("Buys from you") + ((v.ba != null && v.ba.Count > 0) ? (": " + string.Join(", ", from r in v.ba.Take(8)
					select r.Replace("_item_", "").Replace("_Meta_", ""))) : (" " + Loc.T("almost anything"))) + ((v.bs == 1) ? (" · " + Loc.T("buys stolen goods")) : "") + "</color>\n");
			}
			if (v.i != null && v.i.Count > 0)
			{
				stringBuilder.Append("\n<b>" + Loc.T("Sells") + "</b>: " + ItemList(v.i, 16) + "\n");
			}
			if (v.t != null && Db.loot.TryGetValue(v.t, out var value2))
			{
				stringBuilder.Append("\n<b>" + Loc.T("Stock from") + " " + v.t + "</b>: " + ItemList(value2.SelectMany((List<int> x) => x), 18) + "\n");
			}
		}
		else
		{
			PointData p = marker.p;
			stringBuilder.Append("<b><size=15>" + MarkerTitle(marker) + "</size></b>  <color=#7a6f5c>" + ((p.k == "r") ? Loc.T("recipe or blueprint") : ((p.k == "p") ? Loc.T("pickup") : (p.n ?? Loc.T("container")))) + "</color>\n");
			stringBuilder.Append((p.s == 1) ? ("<color=#9b1c14><b>" + Loc.T("Stealing — owned by") + " " + (p.o ?? Loc.T("a resident")) + "</b></color>") : ("<color=#3f6b2f><b>" + Loc.T("Free to take") + "</b></color>"));
			if (p.l == 1)
			{
				stringBuilder.Append("  ·  <color=#6b3fa0>" + Loc.T("locked") + "</color>");
			}
			stringBuilder.Append('\n');
			if (IsTrash(p))
			{
				stringBuilder.Append(SearchedToday(p, marker.scene) ? ("<color=#7a6f5c>" + Loc.T("Searched today") + " ✓</color>\n") : ("<color=#5a6b12><b>" + Loc.T("Not searched today: gives Scavenging XP") + "</b></color>\n"));
			}
			if (marker.scene != CurrentScene)
			{
				stringBuilder.Append("<color=#7a6f5c>" + Loc.T("in") + " " + Db.SceneName(marker.scene) + "</color>\n");
			}
			stringBuilder.Append(AccessTip(Searching ? Access(marker.scene, p) : 0));
			if (HasNow(p))
			{
				stringBuilder.Append("<color=#1f8a3a><b>✔ " + Loc.T(p.mem ? "Probably has it" : "Has it now") + "</b></color>\n");
			}
			if (p.live)
			{
				if (p.empty)
				{
					stringBuilder.Append("<color=#7a6f5c><b>" + Loc.T(p.mem ? "Probably empty (from your save)" : "Empty right now") + "</b></color>\n");
				}
				else
				{
					stringBuilder.Append("<b>" + Loc.T(p.mem ? "Probably contains (from your save)" : "Contains now") + "</b>: " + string.Join(", ", from h in p.have.Take(12)
						select HiId(h.Key) + ((h.Value > 1) ? $" ×{h.Value}" : "")) + "\n");
				}
				if (p.restock != null)
				{
					stringBuilder.Append("<color=#7a6f5c>" + p.restock + "</color>\n");
				}
			}
			if (p.t != null && Db.loot.TryGetValue(p.t, out var value3))
			{
				if (value3.Count > 0 && value3[0].Count > 0)
				{
					stringBuilder.Append(string.Format("\n<b>{0}</b> ({1}): {2}\n", Loc.T("Common"), value3[0].Distinct().Count(), ItemList(value3[0], 14)));
				}
				if (value3.Count > 1 && value3[1].Count > 0)
				{
					stringBuilder.Append(string.Format("\n<b>{0}</b> ({1}): {2}\n", Loc.T("Rare"), value3[1].Distinct().Count(), ItemList(value3[1], 14)));
				}
			}
			if (p.f != null && p.f.Count > 0)
			{
				stringBuilder.Append("\n<b>" + Loc.T("Always contains") + "</b>: " + ItemList(p.f, 14) + "\n");
			}
		}
		stringBuilder.Append("\n<color=#7a6f5c>" + Loc.T("Click to go there") + "</color>");
		ShowTip(at, stringBuilder.ToString());
	}

	private void ShowTip(Vector2 at, string text)
	{
		//IL_0006: Unknown result type (might be due to invalid IL or missing references)
		//IL_000c: Expected Obj, but got Unknown
		//IL_0022: Unknown result type (might be due to invalid IL or missing references)
		//IL_002e: Unknown result type (might be due to invalid IL or missing references)
		//IL_003c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0054: Unknown result type (might be due to invalid IL or missing references)
		//IL_008d: Unknown result type (might be due to invalid IL or missing references)
		GUIContent val = new GUIContent(text.TrimEnd());
		float num = 380f;
		float num2 = tipStyle.CalcHeight(val, num);
		Rect val2 = new Rect(at.x + 18f, at.y + 18f, num, num2);
		if (val2.xMax > (float)(Screen.width - 8))
		{
			val2.x = at.x - num - 18f;
		}
		if (val2.yMax > (float)(Screen.height - 8))
		{
			val2.y = (float)Screen.height - num2 - 8f;
		}
		GUI.Box(val2, val, tipStyle);
	}

	private void Awake()
	{
		//IL_00c4: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ce: Expected Obj, but got Unknown
		//IL_02be: Unknown result type (might be due to invalid IL or missing references)
		//IL_02c4: Expected Obj, but got Unknown
		//IL_03ce: Unknown result type (might be due to invalid IL or missing references)
		I = this;
		((BaseUnityPlugin)this).Config.SaveOnConfigSet = false;
		cfgEnabled = ((BaseUnityPlugin)this).Config.Bind<bool>("General", "ShowMarkers", true, "Show loot markers on the in-game map.");
		cfgPanel = ((BaseUnityPlugin)this).Config.Bind<bool>("General", "ShowPanel", true, "Show the Loot Map panel next to the map.");
		cfgToggleKey = ((BaseUnityPlugin)this).Config.Bind<KeyCode>("General", "TogglePanelKey", (KeyCode)287, "Key that shows/hides the Loot Map panel and markers.");
		cfgLanguage = ((BaseUnityPlugin)this).Config.Bind<string>("General", "Language", "Auto", new ConfigDescription("Panel language. Auto = the language the game is showing.", (AcceptableValueBase)(object)new AcceptableValueList<string>(new string[4] { "Auto", "English", "Spanish", "Finnish" }), Array.Empty<object>()));
		cfgContainers = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "Containers", true, "Show containers.");
		cfgPickups = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "PickupSpots", true, "Show item pickup spots.");
		cfgRecipes = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "RecipesAndBlueprints", true, "Show recipes and blueprints lying in the world (also remembers the ones you have seen in other buildings).");
		cfgStations = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "Workstations", true, "Show workstations (Drill, Lathe, stoves...).");
		cfgShops = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "Shops", true, "Show shops and traders.");
		cfgDoors = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "Doors", true, "Show door labels on the map.");
		cfgOnlyNow = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "OnlyWhereItIsNow", false, "While searching an item, show only the spots in this area that hold it right now (green), hiding the ones where it could merely spawn.");
		cfgFreeOnly = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "FreeToTakeOnly", false, "Hide containers where taking counts as stealing.");
		cfgFloorOnly = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "CurrentFloorOnly", true, "Indoors, only show markers on the floor you are standing on.");
		cfgWholeMap = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "SearchWholeMap", true, "When searching, also show matches from other buildings on this map.");
		cfgWorld = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "HighlightInWorld", true, "While a search is active, mark matching containers near you in the world.");
		cfgMarkerSize = ((BaseUnityPlugin)this).Config.Bind<float>("Display", "MarkerSize", 9f, "Marker size on the map.");
		cfgTrashRoute = ((BaseUnityPlugin)this).Config.Bind<bool>("Filters", "TrashRoute", false, "With the Scavenger mod: show only trash containers on this map, highlighting the ones you haven't searched today.");
		cfgPanelX = ((BaseUnityPlugin)this).Config.Bind<float>("Display", "PanelX", 20f, "Panel position (x).");
		cfgPanelY = ((BaseUnityPlugin)this).Config.Bind<float>("Display", "PanelY", 110f, "Panel position (y).");
		BindToolsConfig();
		try
		{
			string path = Path.Combine(Path.GetDirectoryName(((BaseUnityPlugin)this).Info.Location), "lootmap-data.json");
			Db = LootDb.Load(path);
			ToolsLoad();
			ManualLogSource logger = Logger;
			bool flag = default;
			BepInExInfoLogInterpolatedStringHandler val = new BepInExInfoLogInterpolatedStringHandler(50, 4, out flag);
			if (flag)
			{
				((BepInExLogInterpolatedStringHandler)val).AppendLiteral("Loaded loot data v");
				((BepInExLogInterpolatedStringHandler)val).AppendFormatted<int>(Db.version);
				((BepInExLogInterpolatedStringHandler)val).AppendLiteral(": ");
				((BepInExLogInterpolatedStringHandler)val).AppendFormatted<int>(Db.scenes.Count);
				((BepInExLogInterpolatedStringHandler)val).AppendLiteral(" scenes, ");
				((BepInExLogInterpolatedStringHandler)val).AppendFormatted<int>(Db.scenes.Values.Sum((SceneData s) => s.points.Count));
				((BepInExLogInterpolatedStringHandler)val).AppendLiteral(" loot points, ");
				((BepInExLogInterpolatedStringHandler)val).AppendFormatted<int>(Db.scenes.Values.Sum((SceneData s) => s.vendors.Count));
				((BepInExLogInterpolatedStringHandler)val).AppendLiteral(" shops.");
			}
			logger.LogInfo(val);
		}
		catch (Exception ex)
		{
			Logger.LogError((object)("Could not load lootmap-data.json: " + ex));
		}
		new Harmony("com.juanberta.obenseuer.lootmap").PatchAll(typeof(LootMapPlugin).Assembly);
		Logger.LogInfo((object)"Loot Map loaded.");
	}

	private void OnApplicationQuit()
	{
		try
		{
			((BaseUnityPlugin)this).Config.Save();
		}
		catch
		{
		}
	}

	private void Update()
	{
		if (Db == null)
		{
			return;
		}
		ToolsTick();
		AccessTick();
		if ((Object)(object)map == (Object)null && Time.unscaledTime > nextMapSearch)
		{
			nextMapSearch = Time.unscaledTime + 1f;
			map = (((Object)(object)Map.instance != (Object)null) ? Map.instance : Object.FindAnyObjectByType<Map>((FindObjectsInactive)1));
		}
		if (search != lastTyped)
		{
			lastTyped = search;
			searchChangedAt = Time.unscaledTime;
		}
		if (search == appliedSearch)
		{
			evalSearch = null;
		}
		if (search != appliedSearch && search != evalSearch && (Time.unscaledTime - searchChangedAt > 0.35f || search.Length == 0))
		{
			evalSearch = search;
			string trimmed = search.Trim();
			bool quoted = trimmed.Length >= 3 && (trimmed[0] == '"' || trimmed[0] == '(');
			searchWarn = null;
			if (trimmed.Length > 0 && trimmed.Length < 2 && !quoted)
			{
				// One letter matches almost every item and would mark the whole map.
				appliedSearch = "";
				searchWarn = Loc.T("Type at least 2 letters");
			}
			else
			{
				appliedSearch = search;
				if (search.Length > 0)
				{
					searchIds = null;
					HashSet<int> broad = MatchedIds;
					if (broad != null && broad.Count > 600)
					{
						appliedSearch = "";
						matchedIdsQ = null;
						searchWarn = string.Format(Loc.T("Too many items match \"{0}\" ({1}). Type more letters."), trimmed, broad.Count);
					}
				}
			}
		}
		UpdateSlotHighlights();
		bool mapOpen = MapOpen;
		if (mapOpen || Guiding || ((Searching || TrashRoute) && cfgWorld.Value))
		{
			ScanLive(force: false);
		}
		if (CurrentScene != langScene)
		{
			langScene = CurrentScene;
			Loc.Detect(cfgLanguage.Value);
		}
		if (!mapOpen)
		{
			Typing = false;
			if (wasOpen)
			{
				wasOpen = false;
				try
				{
					((BaseUnityPlugin)this).Config.Save();
				}
				catch
				{
				}
			}
			UpdateGuide();
			return;
		}
		if (!wasOpen)
		{
			Loc.Detect(cfgLanguage.Value);
			if (Loc.Detected != loggedLang)
			{
				loggedLang = Loc.Detected;
				Logger.LogInfo((object)("Language: " + Loc.Detected));
			}
		}
		wasOpen = true;
		if (cfgFloorOnly.Value && Time.unscaledTime > nextFloorCheck)
		{
			nextFloorCheck = Time.unscaledTime + 0.5f;
			int num = PlayerFloorBand();
			if (num != floorBand)
			{
				floorBand = num;
				builtKey = null;
			}
		}
		string text = string.Join("|", CurrentScene, CurrentMap, appliedSearch, searchIdsLabel, cfgEnabled.Value, cfgContainers.Value, cfgPickups.Value, cfgRecipes.Value, cfgStations.Value, cfgShops.Value, cfgFreeOnly.Value, cfgOnlyNow.Value, cfgFloorOnly.Value, cfgWholeMap.Value, cfgMarkerSize.Value, floorBand, LiveKey(), Loc.Lang, TrashRoute, ScavengerBridge.SearchedTodayCount, lootedVersion, cfgHideEmpty.Value, HourKey(), accessVersion, cfgAccess.Value, cfgHideLocked.Value);
		if ((Object)(object)layer == (Object)null || text != builtKey)
		{
			Rebuild();
			builtKey = text;
		}
		KeepMarkerSize();
	}

	internal static float PlayerY()
	{
		//IL_001b: Unknown result type (might be due to invalid IL or missing references)
		Camera main = Camera.main;
		if (!((Object)(object)main != (Object)null))
		{
			return 0f;
		}
		return ((Component)main).transform.position.y - 1.6f;
	}

	private static int PlayerFloorBand()
	{
		return Mathf.FloorToInt((PlayerY() + 1.2f) / 3f);
	}

	internal static bool IsTrash(PointData p)
	{
		if (p != null && p.k == "c" && p.t != null)
		{
			return ScavengerBridge.IsTrash(p.t);
		}
		return false;
	}

	internal static bool SearchedToday(PointData p, string scene)
	{
		if (IsTrash(p))
		{
			return ScavengerBridge.SearchedAt(scene, p.x, p.y, p.z);
		}
		return false;
	}

	internal int TrashLeftOnMap()
	{
		if (Time.unscaledTime - trashLeftAt < 1f)
		{
			return trashLeftCache;
		}
		trashLeftAt = Time.unscaledTime;
		return trashLeftCache = CountTrashLeft();
	}

	private int CountTrashLeft()
	{
		string currentMap = CurrentMap;
		int num = 0;
		foreach (KeyValuePair<string, SceneData> scene in Db.scenes)
		{
			if (scene.Value.map != currentMap)
			{
				continue;
			}
			foreach (PointData item in PointsOf(scene.Key))
			{
				if (IsTrash(item) && !SearchedToday(item, scene.Key))
				{
					num++;
				}
			}
		}
		return num;
	}

	private bool IdMatch(IEnumerable<int> ids)
	{
		if (ids != null && searchIds != null)
		{
			return ids.Any(searchIds.Contains);
		}
		return false;
	}

	internal bool TextMatch(string text)
	{
		if (string.IsNullOrEmpty(text))
		{
			return false;
		}
		string text2 = text.ToLowerInvariant();
		string q = Q;
		if (ExactSearch)
		{
			string exactTerm = ExactTerm;
			if (exactTerm.Length > 0)
			{
				return text2.Trim() == exactTerm;
			}
			return false;
		}
		if (text2.Contains(q))
		{
			return true;
		}
		string[] qWords = QWords;
		if (qWords.Length > 1)
		{
			return qWords.All(text2.Contains);
		}
		return false;
	}

	private bool NameMatch(int id)
	{
		return TextMatch(Db.ItemName(id));
	}

	private bool TableMatch(string table)
	{
		if (table == null || !Db.TableItems.TryGetValue(table, out var value))
		{
			return false;
		}
		if (tableMatchQ != Q)
		{
			tableMatchQ = Q;
			tableMatchCache.Clear();
		}
		if (!tableMatchCache.TryGetValue(table, out var value2))
		{
			value2 = (tableMatchCache[table] = TextMatch(table) || value.Any(NameMatch));
		}
		return value2;
	}

	internal bool PointMatches(PointData p)
	{
		if (searchIds != null)
		{
			if ((p.t == null || !Db.TableItems.TryGetValue(p.t, out var value) || !value.Overlaps(searchIds)) && !IdMatch(p.f))
			{
				return IdMatch(p.have?.Select((KeyValuePair<int, int> h) => h.Key));
			}
			return true;
		}
		if (Q.Length == 0)
		{
			return true;
		}
		if (TableMatch(p.t))
		{
			return true;
		}
		if (TextMatch(p.n) || TextMatch(p.o))
		{
			return true;
		}
		if (p.have != null && p.have.Any((KeyValuePair<int, int> h) => NameMatch(h.Key)))
		{
			return true;
		}
		if (p.f != null)
		{
			return p.f.Any(NameMatch);
		}
		return false;
	}

	internal bool StationMatches(StationData s)
	{
		if (searchIds != null)
		{
			return false;
		}
		if (Q.Length == 0)
		{
			return true;
		}
		return Db.StationTextFor(s.n, s.r).Split('\n').Any(TextMatch);
	}

	internal LiveFurnShop LiveShopAt(VendorData v)
	{
		//IL_0021: Unknown result type (might be due to invalid IL or missing references)
		//IL_0047: Unknown result type (might be due to invalid IL or missing references)
		//IL_004c: Unknown result type (might be due to invalid IL or missing references)
		//IL_004d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0052: Unknown result type (might be due to invalid IL or missing references)
		if (v == null || liveFurnShops == null)
		{
			return null;
		}
		Vector3 val = new Vector3(v.x, v.y, v.z);
		LiveFurnShop result = null;
		float num = 36f;
		foreach (LiveFurnShop liveFurnShop in liveFurnShops)
		{
			Vector3 val2 = liveFurnShop.pos - val;
			float sqrMagnitude = val2.sqrMagnitude;
			if (sqrMagnitude < num)
			{
				num = sqrMagnitude;
				result = liveFurnShop;
			}
		}
		return result;
	}

	internal List<KeyValuePair<int, int>> InStockNow(VendorData v)
	{
		HashSet<int> furn = MatchedFurniture;
		LiveFurnShop liveFurnShop = LiveShopAt(v);
		if (furn == null || furn.Count == 0 || liveFurnShop == null)
		{
			return new List<KeyValuePair<int, int>>();
		}
		return liveFurnShop.stock.Where((KeyValuePair<int, int> kv) => furn.Contains(kv.Key)).ToList();
	}

	internal int VendorMode(VendorData v)
	{
		bool flag = false;
		bool flag2 = false;
		HashSet<int> matchedIds = MatchedIds;
		if (matchedIds != null && matchedIds.Count > 0)
		{
			flag = matchedIds.Any((int id) => Db.Sells(v, id));
			flag2 = matchedIds.Any((int id) => Db.Buys(v, id));
		}
		HashSet<int> matchedFurniture = MatchedFurniture;
		if (matchedFurniture != null && matchedFurniture.Count > 0)
		{
			flag |= matchedFurniture.Any((int id) => Db.FurnSells(v, id));
			flag2 |= matchedFurniture.Any((int id) => Db.FurnBuys(v, id));
		}
		int num = (flag ? 1 : 0) | (flag2 ? 2 : 0);
		if (InStockNow(v).Count > 0)
		{
			num |= 5;
		}
		return num;
	}

	internal bool HasNow(PointData p)
	{
		HashSet<int> ids = MatchedIds;
		if (ids != null && ids.Count > 0 && p != null && p.live && p.have != null)
		{
			return p.have.Any((KeyValuePair<int, int> h) => ids.Contains(h.Key));
		}
		return false;
	}

	internal bool VendorMatches(VendorData v)
	{
		if (VendorMode(v) != 0)
		{
			return true;
		}
		if (searchIds != null)
		{
			return false;
		}
		if (Q.Length == 0)
		{
			return true;
		}
		if (!TextMatch(v.n) && !TextMatch(v.o))
		{
			if (v.t != null)
			{
				return TextMatch(v.t);
			}
			return false;
		}
		return true;
	}

	internal List<PointData> PointsOf(string scene)
	{
		if (!(scene == CurrentScene) || livePoints == null || !(liveScene == scene))
		{
			LoadRecipeMemory();
			recipeMemory.TryGetValue(scene, out var remembered);
			if (!Db.scenes.TryGetValue(scene, out var value))
			{
				return remembered ?? new List<PointData>();
			}
			WithMemory(scene, value.points);
			if (remembered == null || remembered.Count == 0)
			{
				return value.points;
			}
			return value.points.Concat(remembered).ToList();
		}
		return livePoints;
	}

	internal List<StationData> StationsOf(string scene)
	{
		if (!(scene == CurrentScene) || liveStations == null || !(liveScene == scene))
		{
			if (!Db.scenes.TryGetValue(scene, out var value))
			{
				return new List<StationData>();
			}
			return value.stations;
		}
		return liveStations;
	}

	internal void UseMarkedRecipes()
	{
		try
		{
			Type type = AccessTools.TypeByName("ObenseuerRecipeMarker.RecipeMarkerManager");
			HashSet<int> hashSet = new HashSet<int>();
			List<string> list = new List<string>();
			IEnumerable<int> enumerable = ((type != null) ? (AccessTools.Field(type, "MarkedInputItemIds")?.GetValue(null) as IEnumerable<int>) : null);
			if (enumerable != null)
			{
				foreach (int item in enumerable)
				{
					hashSet.Add(item);
				}
			}
			IDictionary dictionary = ((type != null) ? (AccessTools.Field(type, "MarkedRequiredByItem")?.GetValue(null) as IDictionary) : null);
			if (dictionary != null)
			{
				foreach (DictionaryEntry item2 in dictionary)
				{
					if (!(item2.Value is IEnumerable enumerable2))
					{
						continue;
					}
					foreach (object? item3 in enumerable2)
					{
						string text = item3?.GetType().GetField("Item1")?.GetValue(item3) as string;
						if (!string.IsNullOrEmpty(text) && !list.Contains(text))
						{
							list.Add(text);
						}
					}
				}
			}
			if (hashSet.Count == 0)
			{
				IEnumerable<int> enumerable3 = ((type != null) ? (AccessTools.Field(type, "MarkedRecipeIds")?.GetValue(null) as IEnumerable<int>) : null);
				foreach (int item4 in enumerable3 ?? Enumerable.Empty<int>())
				{
					if (!Db.recipeInputs.TryGetValue(item4.ToString(), out var value))
					{
						continue;
					}
					if (!list.Contains(((object)value[0]).ToString()))
					{
						list.Add(((object)value[0]).ToString());
					}
					foreach (JToken item5 in (IEnumerable<JToken>)value[2])
					{
						hashSet.Add((int)item5);
					}
				}
			}
			if (hashSet.Count == 0)
			{
				searchIds = null;
				searchIdsLabel = Loc.T("No marked recipes (Recipe Marker)");
			}
			else
			{
				search = (appliedSearch = (lastTyped = ""));
				searchIds = hashSet;
				searchIdsLabel = string.Format("{0}: {1} ({2})", Loc.T("Marked recipes"), string.Join(", ", list), hashSet.Count);
			}
		}
		catch (Exception ex)
		{
			Logger.LogWarning((object)("Recipe Marker link failed: " + ex.Message));
			searchIdsLabel = Loc.T("No marked recipes (Recipe Marker)");
		}
	}

	internal void ClearSearch()
	{
		search = (appliedSearch = (lastTyped = ""));
		searchIds = null;
		searchIdsLabel = null;
	}

	private void EnsureSprites()
	{
		if (!((Object)(object)square != (Object)null) || !((Object)(object)ring != (Object)null) || !((Object)(object)circle != (Object)null))
		{
			square = MakeSprite(0);
			circle = MakeSprite(1);
			ring = MakeSprite(2);
		}
	}

	private static Sprite MakeSprite(int shape)
	{
		//IL_0006: Unknown result type (might be due to invalid IL or missing references)
		//IL_000b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0012: Unknown result type (might be due to invalid IL or missing references)
		//IL_0019: Unknown result type (might be due to invalid IL or missing references)
		//IL_0022: Expected Obj, but got Unknown
		//IL_0106: Unknown result type (might be due to invalid IL or missing references)
		//IL_0115: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c2: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c7: Unknown result type (might be due to invalid IL or missing references)
		Texture2D val = new Texture2D(32, 32, (TextureFormat)4, false)
		{
			filterMode = (FilterMode)1,
			wrapMode = (TextureWrapMode)1,
			hideFlags = (HideFlags)61
		};
		Color32[] array = new Color32[1024];
		for (int i = 0; i < 32; i++)
		{
			for (int j = 0; j < 32; j++)
			{
				float num = (float)j - 16f + 0.5f;
				float num2 = (float)i - 16f + 0.5f;
				float num3 = Mathf.Sqrt(num * num + num2 * num2);
				float num4 = 1f;
				if (shape == 1)
				{
					num4 = Mathf.Clamp01(16f - num3);
				}
				if (shape == 2)
				{
					num4 = Mathf.Clamp01(16f - num3) * Mathf.Clamp01(num3 - 9f);
				}
				array[i * 32 + j] = new Color32(byte.MaxValue, byte.MaxValue, byte.MaxValue, (byte)(num4 * 255f));
			}
		}
		val.SetPixels32(array);
		val.Apply();
		Sprite val2 = Sprite.Create(val, new Rect(0f, 0f, 32f, 32f), new Vector2(0.5f, 0.5f), 100f);
		((Object)val2).hideFlags = (HideFlags)61;
		return val2;
	}

	private void Rebuild()
	{
		//IL_0095: Unknown result type (might be due to invalid IL or missing references)
		//IL_009c: Expected Obj, but got Unknown
		//IL_00d9: Unknown result type (might be due to invalid IL or missing references)
		//IL_00de: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e5: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e7: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ef: Unknown result type (might be due to invalid IL or missing references)
		//IL_00fc: Unknown result type (might be due to invalid IL or missing references)
		//IL_010c: Unknown result type (might be due to invalid IL or missing references)
		//IL_011c: Unknown result type (might be due to invalid IL or missing references)
		//IL_012c: Unknown result type (might be due to invalid IL or missing references)
		//IL_01e0: Unknown result type (might be due to invalid IL or missing references)
		//IL_01e5: Unknown result type (might be due to invalid IL or missing references)
		//IL_01f1: Unknown result type (might be due to invalid IL or missing references)
		//IL_01f6: Unknown result type (might be due to invalid IL or missing references)
		//IL_02ca: Unknown result type (might be due to invalid IL or missing references)
		//IL_0392: Unknown result type (might be due to invalid IL or missing references)
		//IL_044b: Unknown result type (might be due to invalid IL or missing references)
		//IL_04ed: Unknown result type (might be due to invalid IL or missing references)
		EnsureSprites();
		ClearMarkers();
		GameObject val = LandmarksArea.Invoke(map);
		RectTransform val2 = MapSize.Invoke(map);
		info_map instance = info_map.instance;
		if (!cfgEnabled.Value || (Object)(object)val == (Object)null || (Object)(object)val2 == (Object)null || (Object)(object)instance == (Object)null)
		{
			return;
		}
		if ((Object)(object)layer == (Object)null)
		{
			GameObject val3 = new GameObject("LootMapLayer", new Type[1] { typeof(RectTransform) });
			layer = val3.GetComponent<RectTransform>();
			((Transform)layer).SetParent(val.transform, false);
			RectTransform val4 = layer;
			RectTransform val5 = layer;
			Vector2 val6 = (layer.pivot = new Vector2(0.5f, 0.5f));
			Vector2 anchorMin = (val5.anchorMax = val6);
			val4.anchorMin = anchorMin;
			layer.sizeDelta = Vector2.zero;
			((Transform)layer).localPosition = Vector3.zero;
			((Transform)layer).localRotation = Quaternion.identity;
			((Transform)layer).localScale = Vector3.one;
		}
		((Transform)layer).SetAsLastSibling();
		string cur = CurrentScene;
		string mapName = CurrentMap;
		List<string> list = new List<string>();
		if (cur != null)
		{
			list.Add(cur);
		}
		bool trashRoute = TrashRoute;
		if ((Searching && cfgWholeMap.Value) | trashRoute)
		{
			list.AddRange(from kv in Db.scenes
				where kv.Key != cur && kv.Value.map == mapName
				select kv.Key);
		}
		Rect rect = val2.rect;
		float width = rect.width;
		rect = val2.rect;
		float height = rect.height;
		float num = PlayerY();
		int num2 = 0;
		foreach (string item in list)
		{
			bool flag = item == cur;
			bool flag2 = flag && Indoors && cfgFloorOnly.Value;
			Db.scenes.TryGetValue(item, out var value);
			foreach (PointData item2 in PointsOf(item))
			{
				if (trashRoute)
				{
					if (IsTrash(item2) && (!(flag & flag2) || !(Mathf.Abs(item2.y - num) > 2.2f)))
					{
						AddMarker(instance, width, height, new Vector3(item2.x, item2.y, item2.z), item, !SearchedToday(item2, item), item2, null, null);
					}
				}
				else
				{
					if (((item2.k == "r") ? (!cfgRecipes.Value) : ((item2.k == "p") ? (!cfgPickups.Value) : (!cfgContainers.Value))) || (cfgFreeOnly.Value && item2.s == 1) || (cfgHideEmpty.Value && IsEmptied(item, item2)) || (flag && cfgOnlyNow.Value && Searching && !HasNow(item2)) || (cfgHideLocked.Value && Searching && Access(item, item2) > 0) || (flag2 && Mathf.Abs(item2.y - num) > 2.2f))
					{
						continue;
					}
					bool flag3 = PointMatches(item2);
					if (flag || (flag3 && num2 < 500))
					{
						if (!flag)
						{
							num2++;
						}
						AddMarker(instance, width, height, new Vector3(item2.x, item2.y, item2.z), item, flag3, item2, null, null);
					}
				}
			}
			if (trashRoute)
			{
				continue;
			}
			if (cfgStations.Value)
			{
				foreach (StationData item3 in StationsOf(item))
				{
					if (flag2 && Mathf.Abs(item3.y - num) > 2.2f)
					{
						continue;
					}
					bool flag4 = StationMatches(item3);
					if (flag || (flag4 && num2 < 500))
					{
						if (!flag)
						{
							num2++;
						}
						AddMarker(instance, width, height, new Vector3(item3.x, item3.y, item3.z), item, flag4, null, item3, null);
					}
				}
			}
			if (!cfgShops.Value || value == null)
			{
				continue;
			}
			foreach (VendorData vendor in value.vendors)
			{
				if (!flag2 || !(Mathf.Abs(vendor.y - num) > 2.2f))
				{
					bool flag5 = VendorMatches(vendor);
					if (flag || flag5)
					{
						AddMarker(instance, width, height, new Vector3(vendor.x, vendor.y, vendor.z), item, flag5, null, null, vendor);
					}
				}
			}
		}
		foreach (Marker item4 in markers.Where((Marker k) => k.match && Searching))
		{
			((Transform)item4.rt).SetAsLastSibling();
		}
		foreach (Marker item5 in markers.Where((Marker k) => k.top))
		{
			((Transform)item5.rt).SetAsLastSibling();
		}
		lastZoom = -1f;
	}

	internal Vector2 MapLocal(info_map info, float w, float h, Vector3 world)
	{
		//IL_0006: Unknown result type (might be due to invalid IL or missing references)
		//IL_0008: Unknown result type (might be due to invalid IL or missing references)
		//IL_0013: Unknown result type (might be due to invalid IL or missing references)
		//IL_0018: Unknown result type (might be due to invalid IL or missing references)
		//IL_0019: Unknown result type (might be due to invalid IL or missing references)
		//IL_0021: Unknown result type (might be due to invalid IL or missing references)
		//IL_0029: Unknown result type (might be due to invalid IL or missing references)
		Vector3 val = ((Component)info).transform.InverseTransformPoint(world) / info.mapRadius;
		return new Vector2(val.x * w, val.z * h);
	}

	private void AddMarker(info_map info, float w, float h, Vector3 world, string scene, bool match, PointData p, StationData st, VendorData v)
	{
		if (markers.Count >= 2500)
		{
			return;
		}
		//IL_014e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0150: Unknown result type (might be due to invalid IL or missing references)
		//IL_0155: Unknown result type (might be due to invalid IL or missing references)
		//IL_0067: Unknown result type (might be due to invalid IL or missing references)
		//IL_006e: Expected Obj, but got Unknown
		//IL_00c4: Unknown result type (might be due to invalid IL or missing references)
		//IL_00cb: Expected Obj, but got Unknown
		//IL_00e0: Unknown result type (might be due to invalid IL or missing references)
		//IL_00eb: Unknown result type (might be due to invalid IL or missing references)
		//IL_0100: Unknown result type (might be due to invalid IL or missing references)
		//IL_0114: Unknown result type (might be due to invalid IL or missing references)
		//IL_0259: Unknown result type (might be due to invalid IL or missing references)
		//IL_025e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0263: Unknown result type (might be due to invalid IL or missing references)
		//IL_0241: Unknown result type (might be due to invalid IL or missing references)
		//IL_02a8: Unknown result type (might be due to invalid IL or missing references)
		//IL_022f: Unknown result type (might be due to invalid IL or missing references)
		//IL_021a: Unknown result type (might be due to invalid IL or missing references)
		//IL_02ad: Unknown result type (might be due to invalid IL or missing references)
		//IL_02b2: Unknown result type (might be due to invalid IL or missing references)
		//IL_0293: Unknown result type (might be due to invalid IL or missing references)
		//IL_0281: Unknown result type (might be due to invalid IL or missing references)
		//IL_02f4: Unknown result type (might be due to invalid IL or missing references)
		//IL_02f9: Unknown result type (might be due to invalid IL or missing references)
		//IL_02fe: Unknown result type (might be due to invalid IL or missing references)
		//IL_02d4: Unknown result type (might be due to invalid IL or missing references)
		//IL_02d9: Unknown result type (might be due to invalid IL or missing references)
		//IL_02de: Unknown result type (might be due to invalid IL or missing references)
		//IL_0338: Unknown result type (might be due to invalid IL or missing references)
		//IL_033d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0342: Unknown result type (might be due to invalid IL or missing references)
		//IL_0357: Unknown result type (might be due to invalid IL or missing references)
		//IL_035c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0361: Unknown result type (might be due to invalid IL or missing references)
		//IL_036a: Unknown result type (might be due to invalid IL or missing references)
		//IL_036f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0374: Unknown result type (might be due to invalid IL or missing references)
		//IL_037d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0382: Unknown result type (might be due to invalid IL or missing references)
		//IL_0387: Unknown result type (might be due to invalid IL or missing references)
		//IL_0390: Unknown result type (might be due to invalid IL or missing references)
		//IL_0395: Unknown result type (might be due to invalid IL or missing references)
		//IL_039a: Unknown result type (might be due to invalid IL or missing references)
		//IL_03ba: Unknown result type (might be due to invalid IL or missing references)
		//IL_03bf: Unknown result type (might be due to invalid IL or missing references)
		//IL_03c4: Unknown result type (might be due to invalid IL or missing references)
		//IL_0413: Unknown result type (might be due to invalid IL or missing references)
		//IL_0428: Unknown result type (might be due to invalid IL or missing references)
		//IL_0441: Unknown result type (might be due to invalid IL or missing references)
		//IL_044e: Unknown result type (might be due to invalid IL or missing references)
		//IL_04b5: Unknown result type (might be due to invalid IL or missing references)
		//IL_04e8: Unknown result type (might be due to invalid IL or missing references)
		//IL_04ea: Unknown result type (might be due to invalid IL or missing references)
		Marker marker = null;
		while (pool.Count > 0 && marker == null)
		{
			marker = pool.Pop();
			if ((Object)(object)marker.rt == (Object)null || (Object)(object)((Transform)marker.rt).parent != (Object)(object)layer)
			{
				marker = null;
			}
		}
		if (marker == null)
		{
			GameObject val = new GameObject("lm", new Type[1] { typeof(RectTransform) });
			marker = new Marker
			{
				rt = val.GetComponent<RectTransform>()
			};
			((Transform)marker.rt).SetParent((Transform)(object)layer, false);
			marker.edge = val.AddComponent<Image>();
			((Graphic)marker.edge).raycastTarget = false;
			GameObject val2 = new GameObject("f", new Type[1] { typeof(RectTransform) });
			RectTransform component = val2.GetComponent<RectTransform>();
			((Transform)component).SetParent((Transform)(object)marker.rt, false);
			component.anchorMin = Vector2.zero;
			component.anchorMax = Vector2.one;
			component.offsetMin = new Vector2(1.6f, 1.6f);
			component.offsetMax = new Vector2(-1.6f, -1.6f);
			marker.fill = val2.AddComponent<Image>();
			((Graphic)marker.fill).raycastTarget = false;
		}
		RectTransform rt = marker.rt;
		((Component)rt).gameObject.SetActive(true);
		((Transform)rt).localPosition = ToV3(MapLocal(info, w, h, world));
		bool flag = p != null && p.k == "p";
		bool recipePt = p != null && p.k == "r";
		bool flag2 = SearchedToday(p, scene);
		bool flag3 = p != null && ((p.live && p.empty) | flag2 || (!p.live && IsLooted(scene, p)));
		Sprite val3 = ((flag || recipePt || v != null) ? circle : square);
		marker.edge.sprite = val3;
		marker.fill.sprite = (flag3 ? ring : val3);
		bool flag4 = (p != null && p.s == 1) || (st != null && st.s == 1);
		Color val4 = ToColor((v != null) ? new Color32((byte)214, (byte)178, (byte)60, byte.MaxValue) : ((st != null) ? new Color32((byte)47, (byte)93, (byte)58, byte.MaxValue) : (recipePt ? new Color32((byte)112, (byte)72, (byte)176, byte.MaxValue) : (flag ? new Color32((byte)31, (byte)122, (byte)140, byte.MaxValue) : new Color32((byte)217, (byte)142, (byte)4, byte.MaxValue)))));
		Color val5 = ToColor(flag4 ? new Color32((byte)200, (byte)30, (byte)24, byte.MaxValue) : ((v != null) ? new Color32((byte)60, (byte)40, (byte)10, byte.MaxValue) : new Color32((byte)250, (byte)246, (byte)235, byte.MaxValue)));
		if (p != null && p.l == 1 && !flag4)
		{
			val5 = ToColor(new Color32((byte)120, (byte)70, (byte)180, byte.MaxValue));
		}
		if (flag3)
		{
			val5 = ToColor(new Color32((byte)250, (byte)246, (byte)235, (byte)120));
		}
		bool flag5 = (Searching & match) && HasNow(p);
		int num = (((Searching & match) && v != null) ? VendorMode(v) : 0);
		if (flag5)
		{
			val4 = ToColor(ColHasNow);
			marker.fill.sprite = val3;
		}
		if ((num & 4) != 0)
		{
			val4 = ToColor(ColHasNow);
		}
		else
		{
			switch (num)
			{
			case 1:
				val4 = ToColor(ColSells);
				break;
			case 2:
				val4 = ToColor(ColBuys);
				break;
			case 3:
				val4 = ToColor(ColBoth);
				break;
			}
		}
		int accessState = (Searching && match) ? Access(scene, p) : 0;
		if (accessState > 0)
		{
			val5 = ToColor(DoorColor(accessState == 1 ? "pick" : "key"));
		}
		bool flag6 = TrashRoute && IsTrash(p) && !flag2;
		if (flag6)
		{
			val4 = ToColor(ColTrash);
			marker.fill.sprite = val3;
		}
		float num2;
		if (TrashRoute)
		{
			num2 = (flag6 ? 1f : 0.45f);
		}
		else if (Searching && !match)
		{
			num2 = 0.28f;
		}
		else
		{
			num2 = (flag3 ? 0.75f : 1f);
		}
		if (v != null && !(Searching && match) && IsClosedNow(v))
		{
			num2 = Mathf.Min(num2, 0.5f);
		}
		if (accessState > 0)
		{
			num2 = Mathf.Min(num2, 0.5f);
		}
		val4.a = Mathf.Min(val4.a, num2);
		val5.a = Mathf.Min(val5.a, num2);
		((Graphic)marker.fill).color = val4;
		((Graphic)marker.edge).color = val5;
		float num3 = cfgMarkerSize.Value * ((Searching & match) ? 1.5f : 1f) * (flag6 ? 1.35f : 1f) * ((st != null || v != null) ? 1.15f : 1f) * (flag5 ? 1.25f : 1f);
		rt.sizeDelta = new Vector2(num3, num3);
		marker.p = p;
		marker.st = st;
		marker.v = v;
		marker.scene = scene;
		marker.match = match;
		marker.world = world;
		marker.top = (flag5 || num != 0) | flag6;
		markers.Add(marker);
	}

	private void ClearMarkers()
	{
		foreach (Marker marker in markers)
		{
			if ((Object)(object)marker.rt != (Object)null)
			{
				((Component)marker.rt).gameObject.SetActive(false);
				pool.Push(marker);
			}
		}
		markers.Clear();
		hovered = null;
	}

	private void KeepMarkerSize()
	{
		//IL_002b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0045: Unknown result type (might be due to invalid IL or missing references)
		//IL_0072: Unknown result type (might be due to invalid IL or missing references)
		//IL_0082: Unknown result type (might be due to invalid IL or missing references)
		//IL_0087: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b5: Unknown result type (might be due to invalid IL or missing references)
		if ((Object)(object)layer == (Object)null)
		{
			return;
		}
		Canvas componentInParent = ((Component)layer).GetComponentInParent<Canvas>();
		if ((Object)(object)componentInParent == (Object)null)
		{
			return;
		}
		float num = ((Transform)layer).lossyScale.x / Mathf.Max(1E-06f, ((Component)componentInParent.rootCanvas).transform.lossyScale.x);
		if (Mathf.Abs(num - lastZoom) < 0.0001f)
		{
			return;
		}
		lastZoom = num;
		Vector3 localScale = Vector3.one / Mathf.Max(0.05f, num);
		foreach (Marker marker in markers)
		{
			if ((Object)(object)marker.rt != (Object)null)
			{
				((Transform)marker.rt).localScale = localScale;
			}
		}
	}

	internal void ZoomToPlayer()
	{
		//IL_004b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0050: Unknown result type (might be due to invalid IL or missing references)
		//IL_0051: Unknown result type (might be due to invalid IL or missing references)
		//IL_0052: Unknown result type (might be due to invalid IL or missing references)
		//IL_0065: Unknown result type (might be due to invalid IL or missing references)
		//IL_0081: Unknown result type (might be due to invalid IL or missing references)
		//IL_005e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0063: Unknown result type (might be due to invalid IL or missing references)
		//IL_00aa: Unknown result type (might be due to invalid IL or missing references)
		//IL_00af: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00bd: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c2: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c6: Unknown result type (might be due to invalid IL or missing references)
		//IL_00cb: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00dd: Unknown result type (might be due to invalid IL or missing references)
		try
		{
			RectTransform val = MapContent.Invoke(map);
			GameObject val2 = PlayerMarkerGo.Invoke(map);
			if (!((Object)(object)val == (Object)null) && !((Object)(object)val2 == (Object)null))
			{
				Vector3 val3 = InitialScale.Invoke(map);
				if (val3 == Vector3.zero)
				{
					val3 = Vector3.one;
				}
				((Transform)val).localScale = val3 * Mathf.Max(1f, MaxZoom.Invoke(map));
				Transform parent = ((Transform)val).parent;
				RectTransform val4 = (RectTransform)(object)((parent is RectTransform) ? parent : null);
				Vector3 val5;
				if (!((Object)(object)val4 != (Object)null))
				{
					val5 = ((Transform)val).position;
				}
				else
				{
					Rect rect = val4.rect;
					val5 = ((Transform)val4).TransformPoint(ToV3(rect.center));
				}
				Vector3 val6 = val5;
				((Transform)val).position = ((Transform)val).position + (val6 - val2.transform.position);
				Slider val7 = MapSlider.Invoke(map);
				if ((Object)(object)val7 != (Object)null)
				{
					val7.SetValueWithoutNotify(val7.maxValue);
					SliderValue.Invoke(map) = val7.maxValue;
				}
				lastZoom = -1f;
			}
		}
		catch (Exception ex)
		{
			Logger.LogWarning((object)("Zoom to player failed: " + ex.Message));
		}
	}

	private void OnDestroy()
	{
		ClearMarkers();
	}

	private void EnsureFrameSprites()
	{
		//IL_0023: Unknown result type (might be due to invalid IL or missing references)
		//IL_0028: Unknown result type (might be due to invalid IL or missing references)
		//IL_0030: Unknown result type (might be due to invalid IL or missing references)
		//IL_0038: Expected Obj, but got Unknown
		//IL_003c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0041: Unknown result type (might be due to invalid IL or missing references)
		//IL_004a: Expected Obj, but got Unknown
		//IL_00db: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ea: Unknown result type (might be due to invalid IL or missing references)
		//IL_010a: Unknown result type (might be due to invalid IL or missing references)
		//IL_012f: Unknown result type (might be due to invalid IL or missing references)
		//IL_013e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0161: Unknown result type (might be due to invalid IL or missing references)
		//IL_0168: Unknown result type (might be due to invalid IL or missing references)
		//IL_006e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0099: Unknown result type (might be due to invalid IL or missing references)
		//IL_0067: Unknown result type (might be due to invalid IL or missing references)
		if ((Object)(object)frameSprite != (Object)null && (Object)(object)glowSprite != (Object)null)
		{
			return;
		}
		Texture2D val = new Texture2D(16, 16, (TextureFormat)4, false)
		{
			hideFlags = (HideFlags)61,
			filterMode = (FilterMode)0
		};
		Texture2D val2 = new Texture2D(4, 4, (TextureFormat)4, false)
		{
			hideFlags = (HideFlags)61
		};
		for (int i = 0; i < 16; i++)
		{
			for (int j = 0; j < 16; j++)
			{
				val.SetPixel(j, i, (j < 3 || i < 3 || j >= 13 || i >= 13) ? Color.white : Color.clear);
			}
		}
		for (int k = 0; k < 4; k++)
		{
			for (int l = 0; l < 4; l++)
			{
				val2.SetPixel(l, k, Color.white);
			}
		}
		val.Apply();
		val2.Apply();
		frameSprite = Sprite.Create(val, new Rect(0f, 0f, 16f, 16f), new Vector2(0.5f, 0.5f), 100f, 0u, (SpriteMeshType)0, new Vector4(4f, 4f, 4f, 4f));
		glowSprite = Sprite.Create(val2, new Rect(0f, 0f, 4f, 4f), new Vector2(0.5f, 0.5f), 100f);
		Sprite val3 = frameSprite;
		Sprite val4 = glowSprite;
		HideFlags hideFlags = (HideFlags)61;
		((Object)val4).hideFlags = (HideFlags)61;
		((Object)val3).hideFlags = hideFlags;
	}

	private void UpdateSlotHighlights()
	{
		if (Time.unscaledTime < nextSlotCheck)
		{
			return;
		}
		nextSlotCheck = Time.unscaledTime + 0.15f;
		HashSet<int> matchedIds = MatchedIds;
		bool num = cfgEnabled.Value && matchedIds != null && matchedIds.Count > 0;
		if ((Object)(object)storagePanel == (Object)null && Time.unscaledTime > nextPanelSearch)
		{
			nextPanelSearch = Time.unscaledTime + 2f;
			storagePanel = Object.FindAnyObjectByType<StoragePanelUI>((FindObjectsInactive)1);
		}
		HashSet<Slot> hashSet = new HashSet<Slot>();
		if (num && (Object)(object)storagePanel != (Object)null && ((Behaviour)storagePanel).isActiveAndEnabled && (Object)(object)storagePanel.storageSlotPanel != (Object)null)
		{
			EnsureFrameSprites();
			Slot[] componentsInChildren = storagePanel.storageSlotPanel.GetComponentsInChildren<Slot>(false);
			foreach (Slot val in componentsInChildren)
			{
				hashSet.Add(val);
				bool flag = false;
				ItemStack val2 = ((val.slotcontrol != null) ? val.slotcontrol.itemStack : null);
				if (val2 != null)
				{
					Traverse val3 = Traverse.Create((object)val2);
					int value = val3.Field("itemId").GetValue<int>();
					flag = val3.Field("itemAmount").GetValue<int>() > 0 && matchedIds.Contains(value);
				}
				SetFrame(val, flag);
			}
		}
		foreach (KeyValuePair<Slot, GameObject> slotFrame in slotFrames)
		{
			if (((Object)(object)slotFrame.Key == (Object)null || !hashSet.Contains(slotFrame.Key)) && (Object)(object)slotFrame.Value != (Object)null)
			{
				slotFrame.Value.SetActive(false);
			}
		}
	}

	private void SetFrame(Slot slot, bool on)
	{
		//IL_0047: Unknown result type (might be due to invalid IL or missing references)
		//IL_004d: Expected Obj, but got Unknown
		//IL_0062: Unknown result type (might be due to invalid IL or missing references)
		//IL_006d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0082: Unknown result type (might be due to invalid IL or missing references)
		//IL_0097: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b9: Unknown result type (might be due to invalid IL or missing references)
		//IL_00be: Unknown result type (might be due to invalid IL or missing references)
		//IL_00cd: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e9: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ef: Unknown result type (might be due to invalid IL or missing references)
		//IL_011b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0159: Unknown result type (might be due to invalid IL or missing references)
		slotFrames.TryGetValue(slot, out var value);
		if (!on)
		{
			if ((Object)(object)value != (Object)null)
			{
				value.SetActive(false);
			}
			return;
		}
		if ((Object)(object)value == (Object)null)
		{
			value = new GameObject("LootMapFound", new Type[1] { typeof(RectTransform) });
			RectTransform component = value.GetComponent<RectTransform>();
			((Transform)component).SetParent(((Component)slot).transform, false);
			component.anchorMin = Vector2.zero;
			component.anchorMax = Vector2.one;
			component.offsetMin = new Vector2(-1f, -1f);
			component.offsetMax = new Vector2(1f, 1f);
			GameObject val = new GameObject("glow", new Type[1] { typeof(RectTransform) });
			RectTransform component2 = val.GetComponent<RectTransform>();
			((Transform)component2).SetParent((Transform)(object)component, false);
			component2.anchorMin = Vector2.zero;
			component2.anchorMax = Vector2.one;
			Vector2 offsetMin = (component2.offsetMax = Vector2.zero);
			component2.offsetMin = offsetMin;
			Image val2 = val.AddComponent<Image>();
			val2.sprite = glowSprite;
			((Graphic)val2).color = new Color(0.24f, 0.86f, 0.35f, 0.22f);
			((Graphic)val2).raycastTarget = false;
			Image val3 = value.AddComponent<Image>();
			val3.sprite = frameSprite;
			val3.type = (Image.Type)1;
			((Graphic)val3).color = new Color(0.24f, 0.86f, 0.35f, 1f);
			((Graphic)val3).raycastTarget = false;
			slotFrames[slot] = value;
		}
		value.transform.SetAsLastSibling();
		if (!value.activeSelf)
		{
			value.SetActive(true);
		}
	}

	static LootMapPlugin()
	{
		//IL_000f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0014: Unknown result type (might be due to invalid IL or missing references)
		//IL_0028: Unknown result type (might be due to invalid IL or missing references)
		//IL_002d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0041: Unknown result type (might be due to invalid IL or missing references)
		//IL_0046: Unknown result type (might be due to invalid IL or missing references)
		//IL_0077: Unknown result type (might be due to invalid IL or missing references)
		//IL_007c: Unknown result type (might be due to invalid IL or missing references)
		//IL_0092: Unknown result type (might be due to invalid IL or missing references)
		//IL_0097: Unknown result type (might be due to invalid IL or missing references)
		//IL_00aa: Unknown result type (might be due to invalid IL or missing references)
		//IL_00af: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c5: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ca: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e0: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e5: Unknown result type (might be due to invalid IL or missing references)
	}
}

using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using HarmonyLib;

namespace ObenseuerLootMap;

[HarmonyPatch]
internal static class InputBlockAxis
{
	private static IEnumerable<MethodBase> TargetMethods()
	{
		return from m in AccessTools.GetDeclaredMethods(typeof(InputManager))
			where m.Name.EndsWith("Input") && m.Name.StartsWith("Get") && m.ReturnType == typeof(float)
			select m;
	}

	private static bool Prefix(ref float __result)
	{
		if (!LootMapPlugin.Typing)
		{
			return true;
		}
		__result = 0f;
		return false;
	}
}

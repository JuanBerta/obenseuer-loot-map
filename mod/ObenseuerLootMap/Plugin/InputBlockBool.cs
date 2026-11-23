using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using HarmonyLib;
using UnityEngine;
using Object = UnityEngine.Object;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace ObenseuerLootMap;

[HarmonyPatch]
internal static class InputBlockBool
{
	private static readonly string[] Names = new string[9] { "IsKeyDown", "IsKeyUp", "IsKey", "GetKeyDown", "GetKeyDownKeyboardOnly", "GetKeyUp", "GetKey", "GetKeyWithHold", "GetAuxiliaryReloadDown" };

	private static IEnumerable<MethodBase> TargetMethods()
	{
		return from m in AccessTools.GetDeclaredMethods(typeof(InputManager))
			where Enumerable.Contains(Names, m.Name) && m.ReturnType == typeof(bool)
			select m;
	}

	private static bool Prefix(ref bool __result)
	{
		if (!LootMapPlugin.Typing)
		{
			return true;
		}
		if (EscapeHeld())
		{
			LootMapPlugin.Typing = false;
			LootMapPlugin.LeaveSearch = true;
			return true;
		}
		__result = false;
		return false;
	}

	internal static bool EscapeHeld()
	{
		try
		{
			Keyboard current = Keyboard.current;
			if (current != null)
			{
				return ((ButtonControl)current.escapeKey).isPressed;
			}
		}
		catch
		{
		}
		try
		{
			return Input.GetKey((KeyCode)27);
		}
		catch
		{
			return false;
		}
	}
}

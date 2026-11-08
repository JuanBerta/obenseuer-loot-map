using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using HarmonyLib;

namespace ObenseuerLootMap
{
    // While the player types in the Loot Map search box, the game's own key bindings
    // (InputManager.GetKey*/IsKey*) report "not pressed" so typing doesn't trigger hotkeys.
    [HarmonyPatch]
    internal static class InputBlockBool
    {
        static readonly string[] Names = { "IsKeyDown", "IsKeyUp", "IsKey", "GetKeyDown", "GetKeyDownKeyboardOnly",
                                           "GetKeyUp", "GetKey", "GetKeyWithHold", "GetAuxiliaryReloadDown" };
        static IEnumerable<MethodBase> TargetMethods() =>
            AccessTools.GetDeclaredMethods(typeof(InputManager)).Where(m => Names.Contains(m.Name) && m.ReturnType == typeof(bool));
        static bool Prefix(ref bool __result)
        {
            if (!LootMapPlugin.Typing) return true;
            if (EscapeHeld()) { LootMapPlugin.Typing = false; LootMapPlugin.LeaveSearch = true; return true; }   // Esc still closes menus
            __result = false; return false;
        }

        internal static bool EscapeHeld()
        {
            try { var kb = UnityEngine.InputSystem.Keyboard.current; if (kb != null) return kb.escapeKey.isPressed; } catch { }
            try { return UnityEngine.Input.GetKey(UnityEngine.KeyCode.Escape); } catch { return false; }
        }
    }

    [HarmonyPatch]
    internal static class InputBlockAxis
    {
        static IEnumerable<MethodBase> TargetMethods() =>
            AccessTools.GetDeclaredMethods(typeof(InputManager)).Where(m => m.Name.EndsWith("Input") && m.Name.StartsWith("Get") && m.ReturnType == typeof(float));
        static bool Prefix(ref float __result)
        {
            if (!LootMapPlugin.Typing) return true;
            __result = 0f; return false;
        }
    }
}

using System;
using System.Linq;
using System.Reflection;

namespace ObenseuerLootMap
{
    // Optional link to the Scavenger mod (ScavengeTimerMod.ScavengerApi), found through reflection,
    // so Loot Map works the same with or without it.
    internal static class ScavengerBridge
    {
        static bool looked; static Type api;
        static MethodInfo isTrash, searchedAt; static PropertyInfo enabled, count;

        static void Find()
        {
            if (looked) return; looked = true;
            try
            {
                api = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("ScavengeTimerMod.ScavengerApi")).FirstOrDefault(t => t != null);
                if (api == null) return;
                isTrash = api.GetMethod("IsTrash", new[] { typeof(string) });
                searchedAt = api.GetMethod("SearchedAt", new[] { typeof(string), typeof(float), typeof(float), typeof(float) });
                enabled = api.GetProperty("Enabled");
                count = api.GetProperty("SearchedTodayCount");
                if (isTrash == null || searchedAt == null) api = null;   // needs Scavenger 1.0+
            }
            catch { api = null; }
        }

        internal static bool Available
        {
            get
            {
                Find();
                try { return api != null && (enabled == null || (bool)enabled.GetValue(null)); } catch { return false; }
            }
        }

        internal static bool IsTrash(string category)
        {
            if (category == null || !Available) return false;
            try { return (bool)isTrash.Invoke(null, new object[] { category }); } catch { return false; }
        }

        internal static bool SearchedAt(string scene, float x, float y, float z)
        {
            if (string.IsNullOrEmpty(scene) || !Available) return false;
            try { return (bool)searchedAt.Invoke(null, new object[] { scene, x, y, z }); } catch { return false; }
        }

        internal static int SearchedTodayCount
        {
            get { try { return Available && count != null ? (int)count.GetValue(null) : 0; } catch { return 0; } }
        }
    }
}

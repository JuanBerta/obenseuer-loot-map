using System;
using System.Linq;
using System.Reflection;

namespace ObenseuerLootMap;

internal static class ScavengerBridge
{
	private static bool looked;

	private static Type api;

	private static MethodInfo isTrash;

	private static MethodInfo searchedAt;

	private static PropertyInfo enabled;

	private static PropertyInfo count;

	internal static bool Available
	{
		get
		{
			Find();
			try
			{
				return api != null && (enabled == null || (bool)enabled.GetValue(null));
			}
			catch
			{
				return false;
			}
		}
	}

	internal static int SearchedTodayCount
	{
		get
		{
			try
			{
				return (Available && count != null) ? ((int)count.GetValue(null)) : 0;
			}
			catch
			{
				return 0;
			}
		}
	}

	private static void Find()
	{
		if (looked)
		{
			return;
		}
		looked = true;
		try
		{
			api = (from a in AppDomain.CurrentDomain.GetAssemblies()
				select a.GetType("ScavengeTimerMod.ScavengerApi")).FirstOrDefault((Type t) => t != null);
			if (!(api == null))
			{
				isTrash = api.GetMethod("IsTrash", new Type[1] { typeof(string) });
				searchedAt = api.GetMethod("SearchedAt", new Type[4]
				{
					typeof(string),
					typeof(float),
					typeof(float),
					typeof(float)
				});
				enabled = api.GetProperty("Enabled");
				count = api.GetProperty("SearchedTodayCount");
				if (isTrash == null || searchedAt == null)
				{
					api = null;
				}
			}
		}
		catch
		{
			api = null;
		}
	}

	internal static bool IsTrash(string category)
	{
		if (category == null || !Available)
		{
			return false;
		}
		try
		{
			return (bool)isTrash.Invoke(null, new object[1] { category });
		}
		catch
		{
			return false;
		}
	}

	internal static bool SearchedAt(string scene, float x, float y, float z)
	{
		if (string.IsNullOrEmpty(scene) || !Available)
		{
			return false;
		}
		try
		{
			return (bool)searchedAt.Invoke(null, new object[4] { scene, x, y, z });
		}
		catch
		{
			return false;
		}
	}
}

using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace ObenseuerLootMap
{
    // UI strings in the game's language, plus item names from the game's "Items" string table when it has them.
    internal static class Loc
    {
        internal static string Lang = "en";
        static readonly Dictionary<string, string> Es = new Dictionary<string, string>
        {
            ["Show loot markers"] = "Mostrar marcadores", ["Search item, container or workstation"] = "Buscar objeto, contenedor o estación",
            ["Zoom to me"] = "Centrar en mí", ["Clear search"] = "Borrar búsqueda", ["searching…"] = "buscando…",
            ["Containers"] = "Contenedores", ["Pickup spots"] = "Objetos sueltos", ["Workstations"] = "Estaciones de trabajo",
            ["Shops"] = "Tiendas", ["Doors"] = "Puertas", ["Only free to take"] = "Solo libres de tomar", ["Indoors: only my floor"] = "Interior: solo mi piso",
            ["Search other buildings too"] = "Buscar también en otros edificios", ["Highlight matches in the world"] = "Resaltar en el mundo",
            ["markers in this place."] = "marcadores en este lugar.", ["matches here"] = "coincidencias aquí", ["in"] = "en",
            ["other buildings on this map"] = "otros edificios en este mapa",
            ["container"] = "contenedor", ["pickup"] = "objeto suelto", ["workstation"] = "estación", ["shop"] = "tienda",
            ["red edge = stealing"] = "borde rojo = robar", ["purple edge = locked"] = "borde violeta = con llave", ["hollow = empty"] = "hueco = vacío",
            ["Hover a marker for its loot. Click it to be guided there."] = "Pasa el ratón por un marcador para ver su botín. Haz clic para que te guíe.",
            ["Free to take"] = "Libre de tomar", ["Stealing — owned by"] = "Robo — pertenece a", ["a resident"] = "un residente",
            ["locked"] = "con llave", ["Common"] = "Común", ["Rare"] = "Raro", ["Always contains"] = "Siempre contiene", ["more"] = "más",
            ["Free to use"] = "Libre de usar", ["Owned"] = "Tiene dueño", ["by"] = "de", ["taking its items is stealing"] = "tomar sus objetos es robar",
            ["recipes"] = "recetas", ["Empty right now"] = "Vacío ahora", ["Contains now"] = "Contiene ahora", ["Restocks"] = "Se repone",
            ["in about"] = "en aprox.", ["day"] = "día", ["days"] = "días", ["today"] = "hoy", ["Sells"] = "Vende", ["Stock from"] = "Surtido de",
            ["Guide"] = "Guía", ["Stop guiding"] = "Dejar de guiar", ["Guiding to"] = "Guiando a", ["You are there"] = "Has llegado",
            ["floor up"] = "piso arriba", ["floors up"] = "pisos arriba", ["floor down"] = "piso abajo", ["floors down"] = "pisos abajo",
            ["Go through the door to"] = "Ve por la puerta a", ["Go outside"] = "Sal afuera", ["Head to"] = "Ve a",
            ["Ingredients for my marked recipes"] = "Ingredientes de mis recetas marcadas", ["Marked recipes"] = "Recetas marcadas",
            ["No marked recipes (Recipe Marker)"] = "No hay recetas marcadas (Recipe Marker)", ["Where to buy"] = "Dónde comprar",
            ["Click to go there"] = "Clic para ir allí", ["leads to"] = "lleva a", ["not open in this game version"] = "no disponible en esta versión",
            ["free"] = "libres", ["stealing"] = "robo", ["loot"] = "botín", ["Pickup spot"] = "Objeto suelto", ["Container"] = "Contenedor",
            ["Shop"] = "Tienda", ["LOOT MAP"] = "MAPA DE BOTÍN", ["Toggle panel"] = "Mostrar/ocultar panel",
        };
        internal static string T(string s) => Lang == "es" && Es.TryGetValue(s, out var v) ? v : s;

        // ---- game language detection & item names (via Unity Localization, through reflection) ----
        static object stringDb; static MethodInfo getLocalized; static bool locFailed;
        static readonly Dictionary<string, string> itemCache = new Dictionary<string, string>();

        internal static void Detect(string setting)
        {
            if (setting != "Auto") { Lang = setting.ToLowerInvariant().StartsWith("es") ? "es" : "en"; return; }
            string code = null;
            try
            {
                var t = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("UnityEngine.Localization.Settings.LocalizationSettings")).FirstOrDefault(x => x != null);
                var locale = t?.GetProperty("SelectedLocale", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
                var id = locale?.GetType().GetProperty("Identifier")?.GetValue(locale);
                code = id?.GetType().GetProperty("Code")?.GetValue(id) as string;
                stringDb = t?.GetProperty("StringDatabase", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
                getLocalized = stringDb?.GetType().GetMethods().FirstOrDefault(m => m.Name == "GetLocalizedString" && m.GetParameters().Length == 2
                    && m.GetParameters()[0].ParameterType.Name == "TableReference" && m.GetParameters()[1].ParameterType.Name == "TableEntryReference");
            }
            catch { }
            if (string.IsNullOrEmpty(code)) code = Application.systemLanguage == SystemLanguage.Spanish ? "es" : "en";
            Lang = code.StartsWith("es") ? "es" : "en";
            itemCache.Clear();
        }

        internal static string Item(string english)
        {
            if (Lang == "en" || locFailed || stringDb == null || getLocalized == null) return english;
            if (itemCache.TryGetValue(english, out var v)) return v;
            try
            {
                var pars = getLocalized.GetParameters();
                object table = Convert(pars[0].ParameterType, "Items"), entry = Convert(pars[1].ParameterType, english);
                var r = getLocalized.Invoke(stringDb, new[] { table, entry }) as string;
                v = string.IsNullOrEmpty(r) || r.StartsWith("No translation found") ? english : r;
            }
            catch { locFailed = true; v = english; }
            itemCache[english] = v;
            return v;
        }

        static object Convert(Type target, string value)
        {
            var op = target.GetMethods(BindingFlags.Public | BindingFlags.Static).FirstOrDefault(m => m.Name == "op_Implicit" && m.GetParameters()[0].ParameterType == typeof(string));
            return op.Invoke(null, new object[] { value });
        }
    }
}

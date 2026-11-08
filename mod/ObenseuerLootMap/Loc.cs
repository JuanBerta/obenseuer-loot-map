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
            ["Shop"] = "Tienda", ["has it now"] = "lo tiene ahora", ["can drop it"] = "puede soltarlo", ["sells it"] = "lo vende", ["buys it"] = "lo compra", ["sells & buys"] = "vende y compra", ["Shops for this item"] = "Tiendas para este objeto", ["Buys"] = "Compra", ["Has it now"] = "Lo tiene ahora", ["Buys from you"] = "Te compra", ["almost anything"] = "casi de todo", ["buys stolen goods"] = "compra objetos robados", ["LOOT MAP"] = "MAPA DE BOTÍN", ["Typing — game keys are paused. Esc to leave."] = "Escribiendo — las teclas del juego están en pausa. Esc para salir.", ["Click the box to type."] = "Haz clic en el cuadro para escribir.", ["Toggle panel"] = "Mostrar/ocultar panel",
        };
        static readonly Dictionary<string, string> Fi = new Dictionary<string, string>
        {
            ["Show loot markers"] = "Näytä merkit", ["Search item, container or workstation"] = "Hae esinettä, säilytystä tai työpistettä",
            ["Zoom to me"] = "Keskitä minuun", ["Clear search"] = "Tyhjennä haku", ["searching…"] = "haetaan…",
            ["Containers"] = "Säilytykset", ["Pickup spots"] = "Löytöpaikat", ["Workstations"] = "Työpisteet",
            ["Shops"] = "Kaupat", ["Doors"] = "Ovet", ["Only free to take"] = "Vain vapaasti otettavat", ["Indoors: only my floor"] = "Sisällä: vain oma kerros",
            ["Search other buildings too"] = "Hae myös muista rakennuksista", ["Highlight matches in the world"] = "Korosta osumat maailmassa",
            ["markers in this place."] = "merkkiä tässä paikassa.", ["matches here"] = "osumaa täällä", ["in"] = "",
            ["other buildings on this map"] = "muussa rakennuksessa tällä kartalla",
            ["container"] = "säilytys", ["pickup"] = "löytö", ["workstation"] = "työpiste", ["shop"] = "kauppa",
            ["red edge = stealing"] = "punainen reuna = varastamista", ["purple edge = locked"] = "violetti reuna = lukittu", ["hollow = empty"] = "ontto = tyhjä",
            ["Hover a marker for its loot. Click it to be guided there."] = "Vie hiiri merkin päälle nähdäksesi saaliin. Klikkaa, niin sinut opastetaan perille.",
            ["Free to take"] = "Vapaasti otettavissa", ["Stealing — owned by"] = "Varastamista — omistaja", ["a resident"] = "asukas",
            ["locked"] = "lukittu", ["Common"] = "Yleinen", ["Rare"] = "Harvinainen", ["Always contains"] = "Sisältää aina", ["more"] = "lisää",
            ["Free to use"] = "Vapaasti käytettävissä", ["Owned"] = "Omistettu", ["by"] = "—", ["taking its items is stealing"] = "sen tavaroiden ottaminen on varastamista",
            ["recipes"] = "reseptiä", ["Empty right now"] = "Tyhjä juuri nyt", ["Contains now"] = "Sisältää nyt", ["Restocks"] = "Täydentyy",
            ["in about"] = "noin", ["day"] = "päivässä", ["days"] = "päivässä", ["today"] = "tänään", ["Sells"] = "Myy", ["Stock from"] = "Valikoima",
            ["Guide"] = "Opastus", ["Stop guiding"] = "Lopeta opastus", ["Guiding to"] = "Opastetaan kohteeseen", ["You are there"] = "Olet perillä",
            ["floor up"] = "kerros ylös", ["floors up"] = "kerrosta ylös", ["floor down"] = "kerros alas", ["floors down"] = "kerrosta alas",
            ["Go through the door to"] = "Mene ovesta kohteeseen", ["Go outside"] = "Mene ulos", ["Head to"] = "Suuntaa kohteeseen",
            ["Ingredients for my marked recipes"] = "Merkittyjen reseptien ainekset", ["Marked recipes"] = "Merkityt reseptit",
            ["No marked recipes (Recipe Marker)"] = "Ei merkittyjä reseptejä (Recipe Marker)", ["Where to buy"] = "Mistä ostaa",
            ["Click to go there"] = "Klikkaa mennäksesi sinne", ["leads to"] = "vie kohteeseen", ["not open in this game version"] = "ei avoinna tässä pelin versiossa",
            ["free"] = "vapaata", ["stealing"] = "varastettavaa", ["loot"] = "saalista", ["Pickup spot"] = "Löytöpaikka", ["Container"] = "Säilytys",
            ["Shop"] = "Kauppa", ["has it now"] = "on nyt", ["can drop it"] = "voi löytyä", ["sells it"] = "myy", ["buys it"] = "ostaa", ["sells & buys"] = "myy ja ostaa", ["Shops for this item"] = "Kaupat tälle esineelle", ["Buys"] = "Ostaa", ["Has it now"] = "Sisältää nyt", ["Buys from you"] = "Ostaa sinulta", ["almost anything"] = "lähes mitä tahansa", ["buys stolen goods"] = "ostaa varastettua", ["LOOT MAP"] = "SAALISKARTTA", ["Typing — game keys are paused. Esc to leave."] = "Kirjoitetaan — pelin näppäimet ovat tauolla. Esc lopettaa.", ["Click the box to type."] = "Klikkaa kenttää kirjoittaaksesi.", ["Toggle panel"] = "Näytä/piilota paneeli",
        };
        internal static string T(string s) =>
            Lang == "es" && Es.TryGetValue(s, out var v) ? v : Lang == "fi" && Fi.TryGetValue(s, out var f) ? f : s;

        // ---- game language detection & item names (via Unity Localization, through reflection) ----
        static object stringDb; static MethodInfo getLocalized; static bool locFailed;
        static readonly Dictionary<string, string> itemCache = new Dictionary<string, string>();

        internal static string Detected = "";

        // The language the game actually shows: its selected locale, but only if the game has real text for it
        // (most locales are empty placeholders and the game falls back to English).
        internal static void Detect(string setting)
        {
            if (setting != "Auto")
            {
                var sl = setting.ToLowerInvariant();
                Lang = sl.StartsWith("es") || sl.StartsWith("span") ? "es" : sl.StartsWith("fi") ? "fi" : "en";
                itemCache.Clear(); return;
            }
            string code = null; int menuEntries = -1;
            try
            {
                var t = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("UnityEngine.Localization.Settings.LocalizationSettings")).FirstOrDefault(x => x != null);
                var locale = t?.GetProperty("SelectedLocale", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
                var id = locale?.GetType().GetProperty("Identifier")?.GetValue(locale);
                code = id?.GetType().GetProperty("Code")?.GetValue(id) as string;
                stringDb = t?.GetProperty("StringDatabase", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
                getLocalized = stringDb?.GetType().GetMethods().FirstOrDefault(m => m.Name == "GetLocalizedString" && m.GetParameters().Length == 2
                    && m.GetParameters()[0].ParameterType.Name == "TableReference" && m.GetParameters()[1].ParameterType.Name == "TableEntryReference");
                var getTable = stringDb?.GetType().GetMethods().FirstOrDefault(m => m.Name == "GetTable" && m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType.Name == "TableReference");
                if (getTable != null)
                {
                    var ps = getTable.GetParameters();
                    var args = new object[ps.Length];
                    args[0] = Convert(ps[0].ParameterType, "Menu");
                    for (int i = 1; i < ps.Length; i++) args[i] = ps[i].HasDefaultValue ? ps[i].DefaultValue : null;
                    var table = getTable.Invoke(stringDb, args);
                    var count = table?.GetType().GetProperty("Count")?.GetValue(table);
                    if (count is int c) menuEntries = c;
                }
            }
            catch { }
            code = (code ?? "en").ToLowerInvariant();
            bool translated = code.StartsWith("en") || menuEntries > 20;
            Lang = !translated ? "en" : code.StartsWith("es") ? "es" : code.StartsWith("fi") ? "fi" : "en";
            Detected = $"game locale '{code}', Menu table entries {menuEntries} -> panel language '{Lang}'";
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

using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace ObenseuerLootMap;

internal static class Loc
{
	internal static string Lang = "en";

	private static readonly Dictionary<string, string> Es = new Dictionary<string, string>
	{
		["Profit finder"] = "Buscador de beneficios",
		["Profit"] = "Beneficio",
		["Profit per hour"] = "Beneficio por hora",
		["Sort by"] = "Ordenar por",
		["Buy at"] = "Comprar en",
		["sell at"] = "vender en",
		["Real shop prices, after the fail chance and with the quality your current skills would give. ~ means some ingredient is not sold in any shop (counted at its base value)."] = "Precios reales de tienda, con la probabilidad de fallo. ~ significa que algún ingrediente no se vende en ninguna tienda (se cuenta a su valor base).",
		["No profitable recipes found"] = "No hay recetas rentables",
		["Show loot markers"] = "Mostrar marcadores",
		["locked: lockpick it"] = "con llave: se fuerza con ganzúa",
		["locked: needs a key"] = "con llave: necesita llave",
		["locked: opens another way"] = "cerrada: se abre de otra forma",
		["blocked, not accessible"] = "bloqueada, no accesible",
		["open"] = "abierta",
		["lockpick"] = "ganzúa",
		["key"] = "llave",
		["blocked"] = "bloqueada",
		["easy"] = "fácil",
		["moderate"] = "moderada",
		["challenging"] = "difícil",
		["difficult"] = "muy difícil",
		["No items match"] = "Ningún objeto coincide",
		["Items worth"] = "Objetos que valen",
		["Shopping list"] = "Lista de compras",
		["items missing"] = "objetos que faltan",
		["You have everything on the list"] = "Tienes todo lo de la lista",
		["Shopping list loaded"] = "Lista cargada",
		["Nothing to paste: use \"Copy list for the mod\" on the website first"] = "Nada que pegar: usa \"Copy list for the mod\" en la web primero",
		["Highlighting missing items"] = "Resaltando lo que falta",
		["Find the missing items"] = "Buscar lo que falta",
		["Clear list"] = "Borrar lista",
		["Show the list on screen"] = "Mostrar la lista en pantalla",
		["Paste list from the website"] = "Pegar lista de la web",
		["Paste a new list"] = "Pegar una lista nueva",
		["Nothing to visit here"] = "Nada que visitar aquí",
		["Open until"] = "Abierto hasta",
		["Closed"] = "Cerrado",
		["opens"] = "abre",
		["Mon"] = "lun",
		["Tue"] = "mar",
		["Wed"] = "mié",
		["Thu"] = "jue",
		["Fri"] = "vie",
		["Sat"] = "sáb",
		["Sun"] = "dom",
		["More tools"] = "Más herramientas",
		["Hide emptied containers"] = "Ocultar contenedores vacíos",
		["Find by value or effect"] = "Buscar por valor o efecto",
		["Worth"] = "Vale",
		["Find"] = "Buscar",
		["Nutrition"] = "Nutrición",
		["Thirst"] = "Sed",
		["Depression (lowers)"] = "Depresión (la baja)",
		["Health"] = "Salud",
		["Hygiene"] = "Higiene",
		["Alcohol"] = "Alcohol",
		["at least"] = "al menos",
		["Stop route"] = "Detener ruta",
		["Plan a route"] = "Planear ruta",
		["stops"] = "paradas",
		["You pay"] = "Pagas",
		["you get"] = "recibes",
		["fixed prices"] = "precios fijos",
		["closed now"] = "cerrado ahora",
		["containers left"] = "contenedores restantes",
		["emptied"] = "vaciados",
		["nothing left to search here"] = "nada más que buscar aquí",
		["locked"] = "con llave",
		["more"] = "más",
		["recipes"] = "recetas",
		["today"] = "hoy",
		["not open in this game version"] = "no disponible en esta versión",
		["Show loot markers"] = "Mostrar marcadores",
		["Search item, container or workstation"] = "Buscar objeto, contenedor o estación",
		["Zoom to me"] = "Centrar en mí",
		["Clear search"] = "Borrar búsqueda",
		["searching…"] = "buscando…",
		["Containers"] = "Contenedores",
		["Pickup spots"] = "Objetos sueltos",
		["Workstations"] = "Estaciones de trabajo",
		["Shops"] = "Tiendas",
		["Doors"] = "Puertas",
		["Inside doors, stairs, lifts"] = "Puertas interiores, escaleras, ascensores",
		["Door"] = "Puerta",
		["Tree debris"] = "Escombros de árbol",
		["Wood pile you can chop with an axe"] = "Montón de madera que puedes cortar con un hacha",
		["Probably has it"] = "Probablemente lo tiene",
		["Probably empty (from your save)"] = "Probablemente vacío (según tu partida)",
		["Probably contains (from your save)"] = "Probablemente contiene (según tu partida)",
		["Restocked while you were away (predicted)"] = "Repuesto mientras no estabas (previsto)",
		["Stairs"] = "Escaleras",
		["Ladder"] = "Escalera de mano",
		["Elevator"] = "Ascensor",
		["Only free to take"] = "Solo libres de tomar",
		["Searching: only where it is now"] = "Al buscar: solo donde está ahora",
		["Indoors: only my floor"] = "Interior: solo mi piso",
		["Search other buildings too"] = "Buscar también en otros edificios",
		["Highlight matches in the world"] = "Resaltar en el mundo",
		["markers in this place."] = "marcadores en este lugar.",
		["matches here"] = "coincidencias aquí",
		["in"] = "en",
		["other buildings on this map"] = "otros edificios en este mapa",
		["container"] = "contenedor",
		["pickup"] = "objeto suelto",
		["Recipes & blueprints"] = "Recetas y planos",
		["recipe or blueprint"] = "receta o plano",
		["Recipe"] = "Receta",
		["Blueprint"] = "Plano",
		["workstation"] = "estación",
		["shop"] = "tienda",
		["red edge = stealing"] = "borde rojo = robar",
		["purple edge = locked"] = "borde violeta = con llave",
		["hollow = empty"] = "hueco = vacío",
		["Hover a marker for its loot. Click it to be guided there."] = "Pasa el ratón por un marcador para ver su botín. Haz clic para que te guíe.",
		["Free to take"] = "Libre de tomar",
		["Stealing — owned by"] = "Robo — pertenece a",
		["a resident"] = "un residente",
		["locked"] = "con llave",
		["Common"] = "Común",
		["Rare"] = "Raro",
		["Always contains"] = "Siempre contiene",
		["more"] = "más",
		["Free to use"] = "Libre de usar",
		["Owned"] = "Tiene dueño",
		["by"] = "de",
		["taking its items is stealing"] = "tomar sus objetos es robar",
		["recipes"] = "recetas",
		["Empty right now"] = "Vacío ahora",
		["Contains now"] = "Contiene ahora",
		["Restocks"] = "Se repone",
		["in about"] = "en aprox.",
		["day"] = "día",
		["days"] = "días",
		["today"] = "hoy",
		["Sells"] = "Vende",
		["Stock from"] = "Surtido de",
		["Guide"] = "Guía",
		["Stop guiding"] = "Dejar de guiar",
		["Guiding to"] = "Guiando a",
		["You are there"] = "Has llegado",
		["floor up"] = "piso arriba",
		["floors up"] = "pisos arriba",
		["floor down"] = "piso abajo",
		["floors down"] = "pisos abajo",
		["Go through the door to"] = "Ve por la puerta a",
		["Go outside"] = "Sal afuera",
		["Head to"] = "Ve a",
		["Ingredients for my marked recipes"] = "Ingredientes de mis recetas marcadas",
		["Marked recipes"] = "Recetas marcadas",
		["No marked recipes (Recipe Marker)"] = "No hay recetas marcadas (Recipe Marker)",
		["Where to buy"] = "Dónde comprar",
		["Click to go there"] = "Clic para ir allí",
		["leads to"] = "lleva a",
		["not open in this game version"] = "no disponible en esta versión",
		["free"] = "libres",
		["stealing"] = "robo",
		["loot"] = "botín",
		["Pickup spot"] = "Objeto suelto",
		["Container"] = "Contenedor",
		["Shop"] = "Tienda",
		["In stock now"] = "En stock ahora",
		["in stock now"] = "en stock ahora",
		["trains"] = "entrena",
		["Furniture"] = "Mueble",
		["Sells furniture"] = "Vende muebles",
		["Buys furniture"] = "Compra muebles",
		["Furniture for sale"] = "Muebles a la venta",
		["any furniture"] = "cualquier mueble",
		["what it sells"] = "lo que vende",
		["Exact name only"] = "Solo el nombre exacto",
		["Tip: \"bottle of ink\" or (bottle of ink) finds that exact item."] = "Consejo: \"bottle of ink\" o (bottle of ink) busca ese objeto exacto.",
		["Trash route (Scavenger)"] = "Ruta de basura (Scavenger)",
		["Trash searched today"] = "Basura revisada hoy",
		["left on this map"] = "quedan en este mapa",
		["Searched today"] = "Revisado hoy",
		["Not searched today: gives Scavenging XP"] = "Sin revisar hoy: da XP de Scavenging",
		["has it now"] = "lo tiene ahora",
		["can drop it"] = "puede soltarlo",
		["sells it"] = "lo vende",
		["buys it"] = "lo compra",
		["sells & buys"] = "vende y compra",
		["Shops for this item"] = "Tiendas para este objeto",
		["Buys"] = "Compra",
		["Has it now"] = "Lo tiene ahora",
		["Buys from you"] = "Te compra",
		["almost anything"] = "casi de todo",
		["buys stolen goods"] = "compra objetos robados",
		["LOOT MAP"] = "MAPA DE BOTÍN",
		["Typing — game keys are paused. Esc to leave."] = "Escribiendo — las teclas del juego están en pausa. Esc para salir.",
		["Click the box to type."] = "Haz clic en el cuadro para escribir.",
		["Toggle panel"] = "Mostrar/ocultar panel"
	};

	private static readonly Dictionary<string, string> Fi = new Dictionary<string, string>
	{
		["Profit finder"] = "Voitonetsijä",
		["Profit"] = "Voitto",
		["Profit per hour"] = "Voitto tunnissa",
		["Sort by"] = "Järjestä",
		["Buy at"] = "Osta täältä",
		["sell at"] = "myy täällä",
		["Real shop prices, after the fail chance and with the quality your current skills would give. ~ means some ingredient is not sold in any shop (counted at its base value)."] = "Oikeat kauppahinnat epäonnistumisen jälkeen. ~ tarkoittaa, ettei jotain raaka-ainetta myydä missään kaupassa (lasketaan perusarvolla).",
		["No profitable recipes found"] = "Kannattavia reseptejä ei löytynyt",
		["Show loot markers"] = "Näytä merkit",
		["locked"] = "lukittu",
		["more"] = "lisää",
		["recipes"] = "reseptiä",
		["today"] = "tänään",
		["not open in this game version"] = "ei avoinna tässä pelin versiossa",
		["Show loot markers"] = "Näytä merkit",
		["Search item, container or workstation"] = "Hae esinettä, säilytystä tai työpistettä",
		["Zoom to me"] = "Keskitä minuun",
		["Clear search"] = "Tyhjennä haku",
		["searching…"] = "haetaan…",
		["Containers"] = "Säilytykset",
		["Pickup spots"] = "Löytöpaikat",
		["Workstations"] = "Työpisteet",
		["Shops"] = "Kaupat",
		["Doors"] = "Ovet",
		["Inside doors, stairs, lifts"] = "Sisäovet, portaat, hissit",
		["Door"] = "Ovi",
		["Tree debris"] = "Puunjäänteet",
		["Wood pile you can chop with an axe"] = "Puukasa, jonka voi hakata kirveellä",
		["Probably has it"] = "Siinä on todennäköisesti se",
		["Probably empty (from your save)"] = "Todennäköisesti tyhjä (tallennuksesta)",
		["Probably contains (from your save)"] = "Sisältää todennäköisesti (tallennuksesta)",
		["Restocked while you were away (predicted)"] = "Täydentynyt poissaollessasi (arvio)",
		["Stairs"] = "Portaat",
		["Ladder"] = "Tikkaat",
		["Elevator"] = "Hissi",
		["Only free to take"] = "Vain vapaasti otettavat",
		["Searching: only where it is now"] = "Haettaessa: vain missä se on nyt",
		["Indoors: only my floor"] = "Sisällä: vain oma kerros",
		["Search other buildings too"] = "Hae myös muista rakennuksista",
		["Highlight matches in the world"] = "Korosta osumat maailmassa",
		["markers in this place."] = "merkkiä tässä paikassa.",
		["matches here"] = "osumaa täällä",
		["in"] = "",
		["other buildings on this map"] = "muussa rakennuksessa tällä kartalla",
		["container"] = "säilytys",
		["pickup"] = "löytö",
		["Recipes & blueprints"] = "Reseptit ja piirustukset",
		["recipe or blueprint"] = "resepti tai piirustus",
		["Recipe"] = "Resepti",
		["Blueprint"] = "Piirustus",
		["workstation"] = "työpiste",
		["shop"] = "kauppa",
		["red edge = stealing"] = "punainen reuna = varastamista",
		["purple edge = locked"] = "violetti reuna = lukittu",
		["hollow = empty"] = "ontto = tyhjä",
		["Hover a marker for its loot. Click it to be guided there."] = "Vie hiiri merkin päälle nähdäksesi saaliin. Klikkaa, niin sinut opastetaan perille.",
		["Free to take"] = "Vapaasti otettavissa",
		["Stealing — owned by"] = "Varastamista — omistaja",
		["a resident"] = "asukas",
		["locked"] = "lukittu",
		["Common"] = "Yleinen",
		["Rare"] = "Harvinainen",
		["Always contains"] = "Sisältää aina",
		["more"] = "lisää",
		["Free to use"] = "Vapaasti käytettävissä",
		["Owned"] = "Omistettu",
		["by"] = "—",
		["taking its items is stealing"] = "sen tavaroiden ottaminen on varastamista",
		["recipes"] = "reseptiä",
		["Empty right now"] = "Tyhjä juuri nyt",
		["Contains now"] = "Sisältää nyt",
		["Restocks"] = "Täydentyy",
		["in about"] = "noin",
		["day"] = "päivässä",
		["days"] = "päivässä",
		["today"] = "tänään",
		["Sells"] = "Myy",
		["Stock from"] = "Valikoima",
		["Guide"] = "Opastus",
		["Stop guiding"] = "Lopeta opastus",
		["Guiding to"] = "Opastetaan kohteeseen",
		["You are there"] = "Olet perillä",
		["floor up"] = "kerros ylös",
		["floors up"] = "kerrosta ylös",
		["floor down"] = "kerros alas",
		["floors down"] = "kerrosta alas",
		["Go through the door to"] = "Mene ovesta kohteeseen",
		["Go outside"] = "Mene ulos",
		["Head to"] = "Suuntaa kohteeseen",
		["Ingredients for my marked recipes"] = "Merkittyjen reseptien ainekset",
		["Marked recipes"] = "Merkityt reseptit",
		["No marked recipes (Recipe Marker)"] = "Ei merkittyjä reseptejä (Recipe Marker)",
		["Where to buy"] = "Mistä ostaa",
		["Click to go there"] = "Klikkaa mennäksesi sinne",
		["leads to"] = "vie kohteeseen",
		["not open in this game version"] = "ei avoinna tässä pelin versiossa",
		["free"] = "vapaata",
		["stealing"] = "varastettavaa",
		["loot"] = "saalista",
		["Pickup spot"] = "Löytöpaikka",
		["Container"] = "Säilytys",
		["Shop"] = "Kauppa",
		["In stock now"] = "Varastossa nyt",
		["in stock now"] = "varastossa nyt",
		["trains"] = "kehittää",
		["Furniture"] = "Huonekalu",
		["Sells furniture"] = "Myy huonekaluja",
		["Buys furniture"] = "Ostaa huonekaluja",
		["Furniture for sale"] = "Myytäviä huonekaluja",
		["any furniture"] = "mitä tahansa huonekaluja",
		["what it sells"] = "mitä se myy",
		["Exact name only"] = "Vain tarkka nimi",
		["Tip: \"bottle of ink\" or (bottle of ink) finds that exact item."] = "Vinkki: \"bottle of ink\" tai (bottle of ink) etsii juuri sen esineen.",
		["Trash route (Scavenger)"] = "Roskareitti (Scavenger)",
		["Trash searched today"] = "Roskia penkottu tänään",
		["left on this map"] = "jäljellä tällä kartalla",
		["Searched today"] = "Penkottu tänään",
		["Not searched today: gives Scavenging XP"] = "Penkomatta tänään: antaa Scavenging-XP:tä",
		["has it now"] = "on nyt",
		["can drop it"] = "voi löytyä",
		["sells it"] = "myy",
		["buys it"] = "ostaa",
		["sells & buys"] = "myy ja ostaa",
		["Shops for this item"] = "Kaupat tälle esineelle",
		["Buys"] = "Ostaa",
		["Has it now"] = "Sisältää nyt",
		["Buys from you"] = "Ostaa sinulta",
		["almost anything"] = "lähes mitä tahansa",
		["buys stolen goods"] = "ostaa varastettua",
		["LOOT MAP"] = "SAALISKARTTA",
		["Typing — game keys are paused. Esc to leave."] = "Kirjoitetaan — pelin näppäimet ovat tauolla. Esc lopettaa.",
		["Click the box to type."] = "Klikkaa kenttää kirjoittaaksesi.",
		["Toggle panel"] = "Näytä/piilota paneeli"
	};

	private static object stringDb;

	private static MethodInfo getLocalized;

	private static bool locFailed;

	private static readonly Dictionary<string, string> itemCache = new Dictionary<string, string>();

	internal static string Detected = "";

	internal static string T(string s)
	{
		if (!(Lang == "es") || !Es.TryGetValue(s, out var value))
		{
			if (!(Lang == "fi") || !Fi.TryGetValue(s, out var value2))
			{
				return s;
			}
			return value2;
		}
		return value;
	}

	internal static void Detect(string setting)
	{
		if (setting != "Auto")
		{
			string text = setting.ToLowerInvariant();
			string lang;
			if (text.StartsWith("es") || text.StartsWith("span"))
			{
				lang = "es";
			}
			else
			{
				lang = (text.StartsWith("fi") ? "fi" : "en");
			}
			Lang = lang;
			itemCache.Clear();
			return;
		}
		string text2 = null;
		int num = -1;
		try
		{
			Type? type = (from a in AppDomain.CurrentDomain.GetAssemblies()
				select a.GetType("UnityEngine.Localization.Settings.LocalizationSettings")).FirstOrDefault((Type x) => x != null);
			object obj = type?.GetProperty("SelectedLocale", BindingFlags.Static | BindingFlags.Public)?.GetValue(null);
			object obj2 = obj?.GetType().GetProperty("Identifier")?.GetValue(obj);
			text2 = obj2?.GetType().GetProperty("Code")?.GetValue(obj2) as string;
			stringDb = type?.GetProperty("StringDatabase", BindingFlags.Static | BindingFlags.Public)?.GetValue(null);
			object obj3 = stringDb;
			getLocalized = ((obj3 != null) ? obj3.GetType().GetMethods().FirstOrDefault((MethodInfo m) => m.Name == "GetLocalizedString" && m.GetParameters().Length == 2 && m.GetParameters()[0].ParameterType.Name == "TableReference" && m.GetParameters()[1].ParameterType.Name == "TableEntryReference") : null);
			object obj4 = stringDb;
			MethodInfo methodInfo = ((obj4 != null) ? obj4.GetType().GetMethods().FirstOrDefault((MethodInfo m) => m.Name == "GetTable" && m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType.Name == "TableReference") : null);
			if (methodInfo != null)
			{
				ParameterInfo[] parameters = methodInfo.GetParameters();
				object[] array = new object[parameters.Length];
				array[0] = Convert(parameters[0].ParameterType, "Menu");
				for (int num2 = 1; num2 < parameters.Length; num2++)
				{
					array[num2] = (parameters[num2].HasDefaultValue ? parameters[num2].DefaultValue : null);
				}
				object obj5 = methodInfo.Invoke(stringDb, array);
				if (obj5?.GetType().GetProperty("Count")?.GetValue(obj5) is int num3)
				{
					num = num3;
				}
			}
		}
		catch
		{
		}
		text2 = (text2 ?? "en").ToLowerInvariant();
		string lang2;
		if (!text2.StartsWith("en") && num <= 20)
		{
			lang2 = "en";
		}
		else if (text2.StartsWith("es"))
		{
			lang2 = "es";
		}
		else
		{
			lang2 = (text2.StartsWith("fi") ? "fi" : "en");
		}
		Lang = lang2;
		Detected = $"game locale '{text2}', Menu table entries {num} -> panel language '{Lang}'";
		itemCache.Clear();
	}

	internal static string Item(string english)
	{
		if (Lang == "en" || locFailed || stringDb == null || getLocalized == null)
		{
			return english;
		}
		if (itemCache.TryGetValue(english, out var value))
		{
			return value;
		}
		try
		{
			ParameterInfo[] parameters = getLocalized.GetParameters();
			object obj = Convert(parameters[0].ParameterType, "Items");
			object obj2 = Convert(parameters[1].ParameterType, english);
			string text = getLocalized.Invoke(stringDb, new object[2] { obj, obj2 }) as string;
			value = ((string.IsNullOrEmpty(text) || text.StartsWith("No translation found")) ? english : text);
		}
		catch
		{
			locFailed = true;
			value = english;
		}
		itemCache[english] = value;
		return value;
	}

	private static object Convert(Type target, string value)
	{
		return target.GetMethods(BindingFlags.Static | BindingFlags.Public).FirstOrDefault((MethodInfo m) => m.Name == "op_Implicit" && m.GetParameters()[0].ParameterType == typeof(string)).Invoke(null, new object[1] { value });
	}
}

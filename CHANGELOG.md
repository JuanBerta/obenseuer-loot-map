# Changelog - Loot Map (in-game mod)

## 0.6.0
- Doors show whether you can get through: open, locked (lockpick it, with a difficulty hint), locked (needs a key), locked (opens another way) or blocked. The state is read live from the game when you are in that place, so a door you already unlocked shows as open. "Guide me there" prefers open doors and tells you when the route goes through a locked one.
- Containers you have emptied are remembered between places (until they restock), shown hollow, and can be hidden with "Hide emptied containers". The panel says how many are left and when nothing is left to search.
- Find by value: highlight everything that can drop, or that shops sell or buy, above a chosen value.
- Find by effect: nutrition, thirst, depression (lowers), health, hygiene or alcohol above a chosen amount.
- Shopping list: press "Copy list for the mod" on the website's Shopping list, then "Paste list from the website" in the panel. The list (with the full crafting chain) appears as a checklist on screen, counts what is in your inventory, and "Find the missing items" highlights where to get what you still need.
- Route planner: with a search active, "Plan a route" walks you through the matching containers and shops in this place, nearest first, one stop at a time.
- Shops: opening hours (open now / opens at), the price factors (what you pay, what you get) and, when you search one item, its price at each shop, cheapest first.

## 0.5.1
- With Diegetic UI installed (its LootMapPaperLook option on), the panel on the map page uses its paper look: a manila sheet with ink text, cardboard buttons and a white search field. Without it, nothing changes.

## 0.5.0
- Exact search: put a name in quotes or parentheses, like "bottle of ink" or (bottle of ink), to find only that item.
- Furniture shops: search a piece of furniture to see which shops sell it and which buy it, with buy/sell colours on the map.
- Search by skill: typing a skill (for example Carpentry or Machining) finds the workstations and furniture that use it.
- Live furniture stock: in the shop you're in, an "In stock now" section shows the furniture it has right now.
- Recipe Marker: "Ingredients for my marked recipes" now includes marked blueprints, not only recipes.

## 0.4.1
- Trash you've searched today no longer gets an in-world marker; with Trash route on, the world markers show only the trash left to search.
- In-world markers and the guide arrow are hidden in the pause menu.

## 0.4.0
- Scavenger support (needs Scavenger 1.0.0): trash you have searched today is shown as a faded ring, and tooltips say whether a trash container still gives Scavenging XP today.
- New "Trash route" filter: shows only trash on the current map (all buildings), highlighting in olive green the trash you haven't searched today, with a "searched today / left on this map" counter.

## 0.3.3
- Renamed to Loot Map.
- Installs to BepInEx\plugins\LootMap as LootMap.dll. Delete the old BepInEx\plugins\ObenseuerLootMap folder when updating; your settings are kept.

## 0.3.2
- World markers and the guide arrow are hidden while a game menu is open.

## 0.3.1
- When you open a container or shop, slots holding the item you searched get a green frame.

## 0.3.0
- Searching an item colours markers: green = container has it now, blue = shop sells it, orange = shop buys it, purple = both.
- "Shops for this item" shows who sells and who buys it; trader buy rules read from the game files.

## 0.2.3
- Search box is highlighted while you type.

## 0.2.2
- Panel follows the language the game actually shows (English, Finnish).

## 0.2.1
- Fixed: panel and tooltips turning transparent after changing scenes.
- Fixed: Esc leaves the search box and closes the menu in one press.
- Search matches words in any order.

## 0.2.0
- Live container state (contents, empty, restock timers, live ownership), Guide me there, world highlights, door labels, shops, Recipe Marker support, restyled panel with F6 hotkey.

## 0.1.1
- Fixed a short freeze on every keystroke while searching; added Zoom to me.

## 0.1.0
- First release: containers, pickup spots and workstations on the Map tab, tooltips, search, filters.

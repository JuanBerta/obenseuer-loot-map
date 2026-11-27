# Changelog - Loot Map (in-game mod)

## 0.8.2
- New: a What to craft tab in the big window (Home key) recommends what to craft for money with the skills you have: the best recipes by profit per hour and by profit per craft at real shop prices, using your live skill levels, and a Worth levelling for list of recipes up to three levels above yours that would pay more per hour, priced at the level that unlocks them. It can be limited to one skill, hides recipes whose ingredients no shop sells unless you include them, and leaves recipes under a minute out of the per-hour list. Each entry has Craft and Find buttons.
- Website: a new What to craft page with the same three lists, based on the levels you set on the Your skills page.

## 0.8.1
- New: recipes (website list and the mod's profit finder) can also be sorted by skill, by station and by lowest or highest fail chance. Each entry shows the skill and level, the station or the fail chance to match the sort.
- New: the profit finder (Home window and the big window) can be filtered by skill and by the skill level a recipe needs (any, none, up to level 1 to 10, or at your own skill levels) and sorted by the highest or lowest level needed. Each entry shows its skill and level. The website's recipe list got the same filter and sort.
- New: shops are chosen by price and availability, not only the lowest price, in the profit finder and the Craft plan. A shop with a fixed list always has the item; one that rolls a stock list only usually or sometimes has it, so its price counts for more. The Craft plan shows how reliably each shop stocks the item. A Shops button switches between price + availability, lowest price only and most reliable stock (setting ShopChoice). The website's trade run got the same choice, and its furniture pages now show descriptions, modifiers, dismantle items and the in-game station names.
- Website: recipe profits and the trade run now show money in both currencies (for example "sell 6 RM" or "30 OC + 204 RM"), with the net result in OC value next to it.
- New: in the Craft plan, every item below the top one has a Method picker (< >) to choose how to get it: buy it from a shop or any of its recipes. Before, it always took the first option. The shopping list follows your picks.
- Fix: shops that deal in Real Money are now handled. The data records, per shop, whether it pays you in RM or charges you in RM (for example the Bazaar Butchershop pays RM for chicken, pig, salmon, perch and pike). The website shows those prices in RM (1 RM = 10 OC), counts RM shops in the cheapest/best-price search, and the mod shows RM in the shop info and profit finder.
- Fix: growing and breeding recipes (fish, chickens, rats, cats, plants) were valued at nothing because they make the live plant or animal. They now count what it yields when harvested (for example a Salmon recipe gives 1 salmon and 1 to 3 salmon eggs), read from the game's prefabs (new tools/extract_grow.py). Plants that keep producing (berry bushes, tomatoes, hops, grapes) are not included yet.
- New: the shopping list shows an estimate of what is still to buy (cheapest shop that sells each missing item).
- New: items stored in the Bank Inventory mod count as owned on the shopping list (setting CountBankInventory).
- New: a Clear list button under the on-screen shopping list when the mouse is free (two clicks).
- New: the Home window profit finder can assume a craft quality (yours, 0.5, 1, 1.5 or 2).
- New: searching an item group by name now works on the map (for example "Metal Recycle" finds containers holding nails or tin cans). Needs the updated lootmap-data.json that ships with this version.
- New: searching a group also marks the shops where its items are sold, and the Obenseuer Recycling shop (Bazaar streets) is marked for the items that can be inside its Trash Bales (nails, tin cans, scrap metal, and so on). The shop sells bales that are filled at random when you buy one; the game data now says so (new "pk" field, read from the game files).
- Website: a group page (for example Metal Recycle) lists where each member is bought, and any shop whose bales can contain it.
- Website: item pages show the shop price by quality, and recipes show the profit by quality.

## 0.8.0
- Fixed: the shopping-list checklist stayed on screen in the main menu; it now only shows in game.
- Changed: the shopping-list checklist moved to the top right (under the clock) so it no longer covers notifications.
- New: a Resume button in the Home window returns to the last recipe you were crafting.
- Home window: A- / A+ buttons (and a BigWindowTextScale setting) change its text size, the Close button says Home / Esc, and "Clear list" on the shopping list now needs a second click to confirm.
- Website: filter and sort menus have names for screen readers, the database has a page heading and main area, the scrolling side panels can be reached with the keyboard, and all tabs and buttons are at least 44 px tall on phones.
- Shops that show their goods on separate shelves (Alco, the butcher shop) now list everything they sell, and empty market shelf slots no longer show as an item. The slow stations (Mashing Barrel/Kettle, Fermenting Barrel/Bucket/Container, distilleries and others) now show the recipes they craft, their power and their upgrades.
- Profit finder (mod and website): liquids are now priced by the container they are sold in. A shop pays for the whole filled container, and each container multiplies the liquid's value (Fancy Glass Bottle x2, Plastic Canister x0.7, and so on). Pick the container with the new "Sell liquids in" button/menu; the default is the best one, and "plain liters" gives the old numbers.
- Liquids (Rice Wine, etc.) on the shopping list and in the Craft view are labelled "(liters)", and the have/need count now includes liquid held in your bottles instead of showing 0.
- Self-service markets (O-Market, Mine Market, and others where you take things from shelves and pay at the register) now count as places that sell items, at the market's own price. They show up as shops in the mod and website and in the cheapest-price, profit and shopping calculations. Markets that charge RM are listed but left out of OC price comparisons.
- Home window: new Craft view for any craftable item (and from the Profit finder). It shows the recipe, station, your skill, fail chance, how many to make, the full chain of what you need (buy / craft / find / already have), the crafting order, the raw items with what you hold, the cost of what you still lack, and buttons to find missing items, find a workstation, copy the plan or use it as your shopping list. Redesigned the window with cards and badges.
- New: press Home anywhere in the game for a big Loot Map window with the Profit finder (top 100, by profit or profit per hour) and an item search. Find marks the result on the map and in the world. Key setting: BigWindowKey.
- Fixed: after pressing Zoom to me you could only zoom in, not out.
- Fixed: long Profit finder lines ran past the right edge of the panel; they now wrap.
- Faster searching: the map is rebuilt at most about twice a second instead of many times in a row while things load.
- The locked-door marking is now an experimental option, off by default (config MarkBehindLockedDoorsExperimental) while a crash is investigated.
- Fixed: searching a single letter (or any search matching hundreds of items) marked the whole map and could crash the game. Searches now need 2+ letters, ask for more letters when too many items match, and the map shows at most 2500 markers.
- Fixed: the locked-door check could freeze or crash the game in big places (like the Bazaar) while typing in the search box. It now only looks about 90 m around you, rescans doors every 20 s, and waits while you type.
- Mod: the in-game panel now scrolls when it is taller than the screen, so the Profit finder and shopping list no longer run off the bottom.
- Fixed two recipes that share an ID in the game data (Apple mash and Green Orb Mash): one of them was dropped from the website and the Profit finder. Items nothing can make, drop or sell (like Sugar Beet Wine in this game version) now say so.
- Website: furniture pages show the machine's stats read from the game files (electricity or fuel use, idle use, what a generator makes, fuel types, upgrade slots, equipment quality).
- Profit now counts the workstation's equipment quality (it multiplies craft quality and lowers the fail chance); pick your station on a recipe, the best one is assumed otherwise. The Profit finder in the mod assumes the best station too.
- Website: every craft profit now uses the same real numbers (shop prices, your skill, quality and fail chance), so a recipe, its item and the "Best craft profit" sort no longer disagree. Base values are only used when no shop buys the product.
- Profit uses the real fail chance at your level (it drops 3 points per skill level above the recipe's minimum, and is far worse below it) and counts what a failed craft sells for. The website warns when your skill is below a recipe's minimum.
- Every multi-use item is now counted per use, not only a few: Glue (10 uses) and about 140 others (soap, cigarettes, medicine, wine bottles, pizzas...). Items that take other items as ammo (flashlights, lighters...) are left alone.
- Searching marks spots behind locked doors: the mod asks the game's pathfinder what you can walk to with locked doors treated as walls, and dims the rest with a purple (lockpick) or brown (key / cannot be opened) edge and a tooltip line. New options: mark them (on) and hide them (off); hidden spots are also left out of planned routes.
- Multi-use items count per use: a Bottle of Ink is 50 uses, so a recipe that spends one use is charged about 1/50 of the bottle in the Profit finder, the website's profit and the shopping list (which buys whole items, rounded up).

## 0.7.6
- Profit counts quality: what you craft is priced by the quality your skill gives it (the Profit finder uses your live skill levels; the website has a "Your skills" page to enter them).
- Profit finder (More tools): ranks every recipe by what it earns at real shop prices (cheapest shop for the ingredients, best buyer for the products, after the fail chance), by profit or by profit per hour, and shows where to buy and sell. "Find" highlights the ingredients and products on the map.
- The website's database gained the same real-price profit: sort recipes by "Best profit at shops" or "Best profit per hour", a "Trade at shops" block on every recipe, ranked "Where to buy" and "Where to sell" lists on items, and a "Trade run" on the shopping list (what to buy where, what to sell where, in walking order).

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

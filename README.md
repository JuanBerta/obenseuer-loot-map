# Obenseuer Loot Map

An interactive version of the **Obenseuer** in-game map that shows every loot container and
item pickup spot, which loot table it rolls from, and what that table can drop. Search for an item (e.g. `duct tape`) or a container / loot table (e.g. `Locker`) and the
scene list and map light up wherever it can be found.

- **120 scenes** (outdoor areas, the tenement, the mines, the bazaar and every interior)
- **~9,000 containers** and **~4,100 pickup spots**, with world position, floor, owner,
  lock / lockpick difficulty, restock flag and roll chances
- Loot tables with common / rare item lists and values, linking to the
  [Obenseuer viewer](https://obenseuer-viewer.pages.dev/) for icons and more detail
- The real in-game map art for the Tenement, Bazaar and Mines, with the game's own landmark
  icons and hand-drawn circles (Hotel Korso, Sewerview Inn, Kolhola, Deekula A/B/C…)
- Doors labeled with their in-game signs: click one to walk inside, and "Back outside" to return
- Beds, toilets, shop counters, phones and mailboxes
- Workstations and usable furniture (Drill, Lathe, 3D Printer, stoves, ovens, Sewing Machine, Chemical lab…) with every recipe they can make, plus planters, water sources, showers, saunas, generators and recycling drops
- Ownership: every container, pickup spot and workstation is marked **free to take** or **stealing**, using the game's own rule (an owner with ID > 1 and no permission to take), with a filter to show only one or the other
- Floor plans drawn from the game's navmesh and physics colliders, with a per-floor selector
  for multi-storey buildings
- Shareable links: the URL keeps the scene, search, selected container, floor and view

## Publish on GitHub Pages

1. Create a new repository on GitHub and push this folder to it (see below).
2. In the repository go to **Settings → Pages**, set **Source: Deploy from a branch**,
   branch **main**, folder **/ (root)**, and save.
3. After a minute the site is live at `https://<your-user>.github.io/<repo-name>/`.

```bash
git init -b main
git add .
git commit -m "Obenseuer container map"
git remote add origin https://github.com/<your-user>/<repo-name>.git
git push -u origin main
```

The site is plain static HTML/JS with no build step. You can also open `index.html`
directly from disk.

## In-game mod: Loot Map

`mod/ObenseuerLootMap` is a BepInEx 6 (Unity Mono) plugin that brings the same data into the game's own Map tab.

- Markers for containers, pickup spots, workstations and shops of the place you're in, placed with the game's own world-to-map conversion
- **Live state** for the current scene: empty containers show as rings, tooltips list what's inside right now and when it restocks, ownership is read live (renting changes it)
- **Search** items, containers or workstations (words in any order); matches in other buildings on the same map are shown too, plus **where to buy** the item
- **Guide me there**: click a marker, door or shop and an arrow with distance and floors leads you there, through the right doors
- Matching containers near you are **highlighted in the world** while a search is active
- **Doors** labeled with their in-game names, with free/stealing counts when you hover them
- **Recipe Marker** support: one button highlights every container that can drop ingredients for your starred recipes
- Panel in the language the game is showing (English, Finnish; Spanish once the game ships it); **F6** toggles it; it remembers its position

### Install
1. Install [BepInEx 6 for Unity Mono](https://github.com/BepInEx/BepInEx) in the game folder.
2. Copy `Obenseuer-LootMap.dll` and `lootmap-data.json` into `BepInEx/plugins/ObenseuerLootMap/`.
3. Start the game and open the Map tab.

### Build
```bash
cd mod/ObenseuerLootMap
dotnet build -c Release -p:GameDir="C:\Program Files (x86)\Steam\steamapps\common\Obenseuer\\"
```
The data file is rebuilt with `python tools/build_mod_data.py <Obenseuer_Data> build mod/ObenseuerLootMap/lootmap-data.json .`
after running the extractor.

## Updating the data after a game patch

The data in `data/` is generated from your local game install with two scripts in `tools/`.
They need Python 3.9+ with `numpy` and `opencv-python` (`pip install numpy opencv-python`).

```bash
python tools/extract.py "C:\Program Files (x86)\Steam\steamapps\common\Obenseuer\Obenseuer_Data" build
python tools/build_data.py "C:\Program Files (x86)\Steam\steamapps\common\Obenseuer\Obenseuer_Data" build .
```

`extract.py` reads every scene and writes raw JSON to `build/` (ignored by git);
`build_data.py` combines it with the loot tables, item list and navmeshes into `data/`.
A full run takes a few minutes. You can pass level numbers to `extract.py` to re-extract
only some scenes.

## How it works

Obenseuer is a Unity 6 game. Scenes ship as `Obenseuer_Data/levelN` serialized files with
their type trees stripped, so the tools include:

| File | What it does |
| --- | --- |
| `tools/usf.py` | Minimal reader for Unity SerializedFile (format 22): object table, externals, MonoScripts, GameObjects and Transforms. |
| `tools/dotnet.py` | Minimal .NET metadata reader for `Assembly-CSharp.dll`, used to learn the field layout of the game's scripts. |
| `tools/ser.py` | Generic Unity field deserializer driven by that metadata (follows Unity's serialization rules). |
| `tools/nav.py` | Reader for the A* Pathfinding recast navmeshes in `StreamingAssets/NavigationData/*.nav`. |
| `tools/extract.py` | Finds every `Storage` (container) and `CollectibleItemSpawner` (pickup spot) component, computes its world position from the transform hierarchy, and reads its loot table, owner, lock and spawn settings. Also projects box and mesh colliders to 2D footprints. |
| `tools/tex.py` | Decodes textures and sprites (RGB24, DXT1, DXT5) for the map art and landmark icons. |
| `tools/finish.py` | Extracts landmarks, their icons and the in-game map textures (`info_map` gives each map's world position and size). |
| `tools/build_data.py` | Joins scene data with `StorageSpawnCategory.json` and `Items.json` and writes `data/index.js` plus one `data/scenes/<scene>.js` per scene. |

A container's loot table is its `itemSpawnCategory`; containers set to "Custom" without a
table (player storage, decoration, quest props) are hidden by default and can be shown with
"containers without loot". Containers on objects that start disabled (they appear after a
quest or event) are shown with "hidden until an event".

## Notes

- Positions come straight from the scene files. Containers created at runtime from prefabs
  (for example player-built furniture) are not on the map.
- Map orientation: up is the game's +Z axis, right is +X.

## Disclaimer

Unofficial fan project, not affiliated with or endorsed by Loiste Interactive. Obenseuer and
its game data belong to Loiste Interactive. The code in this repository is released under the
MIT License (see `LICENSE`); the extracted data in `data/` is derived from the game.

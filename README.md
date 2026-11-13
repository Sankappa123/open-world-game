# Hearthborn

A 3D survival story: two people start with nothing in a wild valley and work their way from
gathering and hunting to fire, a thatch hut, painted caves, a tamed horse, a brick home they furnish together,
farming, a daughter, and finally a village.

## Run

    npm install
    npm run db      # starts the MongoDB save database in Docker (once per boot; data persists)
    npm run dev

Then open http://localhost:5173 in Chrome or Firefox. Progress is saved automatically (every 20 s, after
every build/craft/sleep, and when the tab is hidden or closed) to MongoDB, with a copy in the browser.
If Docker is not running the server falls back to a SQLite file in `saves/`, so nothing is lost either way.

`npm run db:stop` stops the database container (saves are kept in the `hearthborn-mongo` volume).
The container listens on port 27018; set `MONGO_URL` to point the server elsewhere.

Production: `npm run build && npm start` serves the built game plus the save API on one port.

### Save API

    GET    /api/save?slot=default      current save
    PUT    /api/save?slot=default      store a save (JSON body); keeps the last 12 snapshots
    DELETE /api/save?slot=default
    GET    /api/history?slot=default   snapshot list;  POST /api/restore?slot=default&id=… rolls one back
    GET    /api/health                 which database is in use

## Controls

W A S D move · Shift sprint (uses stamina) · Space jump · C toggles sneak, or hold Ctrl · V first/third person ·
Mouse look, wheel zooms the camera · E use/gather · F eat · T light/put out torch · R drink from waterskin · H use a healing poultice · Tab craft & build · M map (click to drop a pin) ·
G auto-walk to the pin · Click punch (axe swing once you have one) · Right-click throw spear · Q cancel building ·
E at the fire: sit with Sena · hold E at a construction site to build together · E at the hut/house: rest together ·
Riding: E ride / dismount · W trot (hold for canter) · Shift gallop (needs a saddle) · Space jump · X call your horse ·
Esc pause menu (mouse sensitivity, invert Y, graphics quality, fullscreen, volume, save, quit). Walk into deep water to swim.

The game goes fullscreen when you start so that Ctrl, Tab, Alt and Esc reach the game instead of the browser;
turn that off in the Esc menu if you prefer a window. Graphics quality is picked automatically from your
graphics card and the render resolution adapts to hold a smooth frame rate (shown bottom-right).

Survival gear: a torch (light at night, keeps wolves back, burns ~3 min), herbal poultices (heal), a fur cloak
from hides (halves heat loss), a waterskin (3 drinks, refills at the river or well). Throw the spear into the river to fish.

Events: storms, wolf packs at night (fire and deep water keep them off) and deer herds crossing near camp.

## The story

| # | Chapter | What you do |
|---|---|---|
| I | Awakening | Gather sticks, stones and berries |
| II | The First Fire | Build a campfire, sit by it with Sena |
| III | The Hunt | Craft a spear, hunt and cook |
| IV | Shelter | Make an axe, raise the thatch hut together, rest in it |
| V | Into the Dark | Light a torch, find Echo Hollow, see the old paintings, leave your handprints, chip flint |
| VI | The Wild Herd | Craft a saddle, find the herd east of the river, win a horse's trust, tame and ride her to Lookout Peak |
| VII | Clay and Flame | Dig clay and fire bricks in a kiln |
| VIII | A Home of Brick | Build the brick house with Sena |
| IX | Hearth and Home | Hearth, a bed for two, a stable, rest at home together |
| X | Seeds of Tomorrow | Farm, well, make the home cosy (Homeliness 6) |
| XI | A New Life | Grow close to Sena, build a cradle and a nursery; your daughter Lio is born |
| – | Epilogue: The Village | Years pass, others settle; free play with side goals (discoveries, horse bond, homeliness, closeness) |

Old saves are migrated to the new chapter list automatically.

## Features

- **Closeness** with Sena (pink bar): sitting at the fire, shared meals, building and resting together, flowers, handprints.
- **Building together**: timed construction sites; Sena walks over and helps, which makes it go faster.
- **Home**: hearth, double bed, cradle, nursery room, drying rack, storage basket, fence, stone path, flower bed, stable. A Homeliness score counts them.
- **World**: landmark hills, two river fords, Mirror Lake, Horse Meadow, a hot spring, the Great Tree, standing stones, old ruins and Lookout Peak.
- **Caves**: Echo Hollow (paintings, handprints, shelter) and Flint Deep (flint, crystals, bats). Take a torch; Sena carries her own.
- **Horses**: earn a wild horse's trust with food, calm her, then ride (walk, trot, canter, gallop), with horse stamina, a whistle and bond levels.
- **Map**: parchment map with fog of war, discoveries, a quest marker and markers for Sena and your horse.
- **Family**: Lio follows Sena around, plays near home in the evening and, in the epilogue, rides the old horse in the mornings.

## Credits

All models except the cave bear are by Quaternius (quaternius.com), CC0 1.0 Public Domain: Universal Base Characters,
Universal Animation Library, Stylized Nature MegaKit and Ultimate Animated Animals. The game-ready copies live in `public/models`;
`tools/prep_models.py` rebuilds them from the original packs in `_assets_src/`.
The horse, white horse and donkey are from Quaternius' Ultimate Animated Animals (CC0 1.0), via poly.pizza.
Universal Animation Library 2 and Bull by Quaternius, CC0 1.0 (combat clips in `anims2.glb`; the bull is the aurochs).
Running Brown Bear by Google Data Arts Team, CC-BY 3.0, via poly.pizza (https://poly.pizza/m/Coppphok4P) (the cave bear).
See `public/models/CREDITS.txt` for the full list.

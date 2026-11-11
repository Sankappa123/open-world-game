# Hearthborn

A 3D survival story: two people start with nothing in a wild valley and work their way from
gathering and hunting to fire, a thatch hut, a kiln, a brick house, farming and finally a village.

## Run

    npm install
    npm run dev

Then open http://localhost:5173 in Chrome or Firefox.

## Controls

W A S D move · Shift sprint (uses stamina) · Space jump · C sneak · V first/third person · Mouse look, wheel zooms the camera · E use/gather · F eat · Tab craft & build · M map (click to drop a pin) · G auto-walk to the pin · Click punch (axe swing once you have one) · Right-click throw spear · Q cancel building. Walk into deep water to swim.

Events: storms, wolf packs at night (fire and deep water keep them off) and deer herds crossing near camp.

## Credits

All models are by Quaternius (quaternius.com), CC0 1.0 Public Domain: Universal Base Characters,
Universal Animation Library, Stylized Nature MegaKit and Ultimate Animated Animals. The game-ready copies live in `public/models`;
`tools/prep_models.py` rebuilds them from the original packs in `_assets_src/`.

# The sixteen cheap tells

Each is something a stranger notices in seconds, drawn from what our own games had to
fix (DK, MC, AW, SR, OC) and what the Studio's reviewer finds in first versions (ST). For
each: what it looks like, how to see it, and which skill fixes it. Tells 13 to 16 came
from OC, a large 3D game played on desktops and phones.

| # | Tell | What it looks like | How to see it | Fix with |
| --- | --- | --- | --- | --- |
| 1 | Primitive stand-ins | A hero, creature, vehicle, item or landmark drawn as a box, sphere, capsule or cone where a designed thing belongs | Grep for `BoxGeometry`, `SphereGeometry`, `CapsuleGeometry` under item and actor names; look at play distance | `opengame-assets`, `opengame-characters` |
| 2 | Default materials | Flat colour, roughness 1 or one roughness everywhere, no maps, metal that reflects nothing | Grep `MeshStandardMaterial({ color` with no maps; look at a surface while moving | `opengame-look` |
| 3 | Flat light | Shadowed surfaces nearly as bright as lit ones, no cast or contact shadows, no warm and cool contrast | Compare a lit wall and its shadowed neighbour; isolate the ambient term | `opengame-lighting` |
| 4 | Missing post | No tone curve or grade, bloom on lit walls, a milky horizon, a frame flatter than the concept | Capture with the grade off and on; look at the horizon | `opengame-look` |
| 5 | An empty world | A ground plane with props on a grid, nothing overhead, no wear, props floating or intersecting | Run the scene audit; pan slowly at a grazing angle | `opengame-depth`, `opengame-scene-audit` |
| 6 | Placeholder UI | Browser-default fonts, debug text, unstyled boxes, emoji or Unicode glyphs as icons, a title that is a button on black | Load the menu cold; inspect computed fonts | `opengame-front-end` |
| 7 | Silence or thin sound | No music or ambience, one sample for every action, clipping when sounds overlap | Play with headphones through a busy minute | `opengame-audio` |
| 8 | No hit feedback | A hit with no marker, flash, sound or reaction; a kill with no beat of its own | Hit something and watch the next half second frame by frame | `opengame-game-feel` |
| 9 | A dead camera | Rigid follow, no easing, no response to sprint or impact, shake that never decays, a camera inside walls | Sprint, land, take a hit, back into a wall | `opengame-game-feel` |
| 10 | Stiff animation | Sliding feet, clips that pop with no crossfade, no hit reaction or death, a T-pose anywhere | Watch feet at slow, normal and sprint speed; kill something | `opengame-characters` |
| 11 | Hitches | A stall on the first shot or effect (shader compile), frame-time spikes from allocation | Record frame times through first combat; read p95 and p99 | `opengame-performance` |
| 12 | Generated work left out | A model, rig or clip made for this game that the game never loads, while a stand-in sits in its place | List generated files; grep each name in source | `opengame-quality-bar` |
| 13 | Stand-ins while loading | A low-poly copy, a silhouette, a wrong variant or a half-built mesh shown in a menu, a pickup, a reward spin or a customisation preview while the real asset loads | Throttle the network, open every menu and acquisition path, and capture the first frame each item appears | `opengame-loading`, `opengame-assets` |
| 14 | A black or white held item | The gun or hands in first person read as a black shape or a blown-out white one, in dark corners or after a shot | Capture the held item in the darkest and brightest spots of the map and on the frame after firing | `opengame-weapons`, `opengame-lighting` |
| 15 | Stuck enemies | Enemies or allies pressed against a wall, pacing on a ledge, frozen in the air, or a round that never ends because one is stranded | Stand at every spot the player can reach and count how many enemies arrive | `opengame-enemies` |
| 16 | Crash or reload during load | The tab reloads, the browser says a problem repeatedly occurred, or the game drops back to the menu near the end of the bar | Cold loads on a real phone in Safari and on a throttled desktop, several in a row | `opengame-stability`, `opengame-loading`, `opengame-mobile` |

## The order to fix them in

When time is short, in this order, because each step makes the next one worth doing:

1. The game loads and plays without crashing on the target devices, and the core loop
   and its flagship moment work and feel right.
2. Every generated asset is in the game where it belongs, and no stand-in shows while
   it loads.
3. The title, menus, pause and results are real screens in the game's own language.
4. A playtest from the real menu, reviewed by somebody who did not build it.

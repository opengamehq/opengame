> Carried from `opengame-scene-audit` 1.1.1. Read it when: Audit a 3D browser game's geometry with a script, and its flicker on film. Finds props floating off what is drawn, buried props, overlapping solids, faces tied on the shipped vertex grid, missing colliders and invisible walls, cameras inside solids and duplicate actors, walks every staircase, and proves each check on a planted defect. Use when the person says things float, z-fighting, flicker, invisible walls, I walk through things, the screen goes black, or before calling a level finished.


# Scene audit

A scene that looks right in a still can be full of geometry that is wrong: a crate
hovering a hand's width above the floor, two wall panels in one plane flickering as the
camera moves, a fence nobody can collide with, a wall of collision with nothing drawn on
it. Most of these are answerable from the scene's own geometry, headless, in seconds.
[helpers/scene-audit.js](helpers/scene-audit.js) does it; copy it into the game.
Flicker is the exception: it lives in motion, and only a film on a stepped clock judges it.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.

## Running it

In the browser, against the scene the game actually builds:

```js
import * as THREE from 'three'
import { runSceneAudit, fromThreeScene, formatReport } from './scene-audit.js'

const scene = fromThreeScene(THREE, world, { colliders: collisionBoxes, groundY: 0 })
scene.routes = [{ name: 'tower stairs', from: [4, 0, 12], to: [4, 6, -2] }]
const report = runSceneAudit(scene)
console.log(formatReport(report))
```

Mark meshes through `userData`: `collider: true` for collision geometry,
`nocollide: 'foliage'` for drawn things a body may pass, `hangs: 'lamp on a chain'` for
things held up by design, `group: 'truck'` for parts of one object that touch on
purpose, `decal: true` for layered decals, and `gridStep` for the vertex grid a part is
shipped on when the format quantises positions. A collider the player can see the reason
for (a fence line, a cliff edge) carries `userData.nodraw` with that reason. In Node,
build the same `{ parts, colliders, routes }` shape from the level's own layout data; the
file imports nothing.

`report.ok` is true when the applicable checks caught their planted defects, examined
the scene and found no defects. For a level with no stairs or ramps, pass
`{ notApplicable: { stairs: "This level has no stairs or ramps" } }`. List a reason for
each omitted check. An empty check without a reason remains a failure. Findings name the
part, the world position and why.

The adapter reads each visible mesh as one world-space box plus its triangles. It skips
skinned meshes (characters are judged in `opengame-characters`), and reads an
`InstancedMesh` as one box around all its instances, so expand instanced props that
matter into one part per instance before auditing them. A mesh hidden in the scene graph
but marked `collider` is read as a collider nothing draws, and a `Box3` collider may carry a
`nodraw` property. Boxes are a first pass: a whole-map merged mesh or a terrain mesh read
as one box hides every collider under its top, so split those into chunks (or leave
terrain to `groundY`), and run the engine-side sweeps in the rules below for the rest.

## Rules

### Every check proves itself first
- **Invariant:** No check reports on the real scene until it has found a known defect planted in it, an applicable check that examined nothing is a failure, and a check never measures with the same inputs the fix it judges used.
- **Technique:** Before measuring, plant a floating crate, a buried prop, two interpenetrating crates, two coplanar panels, a collider-less wall and an undrawn collider at an open site chosen from the real scene, and a staircase with one riser too tall. Report how many things each check examined. When a check reaches zero by gaining filters or exemptions, plant a defect of each filtered kind and show it is still flagged before believing the zero.
- **Reference configuration:** DK's first coplanar audit clipped triangles with inverted winding and measured 0 m² on every prop, including one already known to have 0.4 m². AW plants a defect for each of its eight checks into every map under test, and its plants have found two bugs in the checks themselves. OS's integrity audit reached 0/0/0 by adding filters, and its lead refused it until every planted hole was flagged; its plant-grounding check read the same invisible card corners the grounding pass had moved and printed "0 still floating" over about 3,600 floating plants.
- **Applies when:** Every audit, every run.
- **Verify:** `formatReport` prints `plant caught` and a non-zero examined count for every check.

### No camera inside a solid
- **Invariant:** No camera (gameplay, cinematic, spawn, menu or capture) has its near plane inside geometry, and no framed shot is mostly blocked by near cover.
- **Technique:** Before using a camera position, test a sphere the size of the near plane against the colliders and cast from the subject to the camera; pull the camera in, or reject the position. Aim framed shots from the subject's live joints, so a change of scale moves the camera with it. Reject shots where near cover fills a large share of the frame, and run the same test on every capture camera and every spawn's first view before anyone judges them. In a debug build, log every frame whose camera is inside a collider. In three.js run the test against the physics world (Rapier's shape-intersection queries) or `Box3.containsPoint` on collider boxes, and raycast from the subject with `Raycaster.far` set to the camera distance.
- **Reference configuration:** OC's game-over screen rendered a black 3D layer from r57 to r66, about 7 hours, because its camera was 0.3 m inside a stone ledge: black at 66.33 m, the full scene at 66.22 m. OC's victory camera ended inside rubble, then inside the boss. OC rejects a shot with more than 25% near cover. OS fails a capture camera or spawn view with more than 25% of the frame within 6 m, written after judges found five of ten first-person spawn views facing a boulder, a wall or grass; 13 of one map's first 39 staged cameras sat in walls, roofs or on cliffs.
- **Applies when:** Every 3D game with scripted, menu, capture, spawn or follow cameras.
- **Verify:** Sample every authored camera and every ending camera at each boss scale and arena variant: the audit reports zero cameras inside solids, and the captures contain no black frame with the HUD still drawn.

### Nothing floats, measured on what is drawn
- **Invariant:** Every part's visible base is held up by the visible surface through some chain of contact, whatever placed it (authored, generated, at load or at runtime), unless it hangs by design and keeps hanging.
- **Technique:** Seed the supported set from parts resting on the ground or a published floor, then spread support through contact until nothing changes; two parts touching in mid-air do not hold each other up. Seat from drawn geometry: for an alpha card, the lowest opaque texel of each level of detail, never the card's corners. Cast centre and footprint rays against the terrain and the top level of detail; hide an instance over a ledge, otherwise tilt it a little and sink its low edge. Audit with a different measure from the one the placer used, against drawn triangles and excluding the object's own mesh. Keep the `hangs` exemption through every grounding pass. A prop that touches can still look afloat without contact shading, so check contact occlusion reaches it, alpha-tested materials included.
- **Reference configuration:** AW: a base more than 0.12 m (a hand's width) above its support floats; parts within 0.08 m touch; ten AW boulders hung 0.13 m over a cliff path for nine rounds because each rock's base touched its own cap. OS: "we cant have foliage/grass things floating on any fucking map! wtf si this bs?" (owner). Cards carried invisible skirts of 0.2 to 1.07 m below the blades; measured on the drawn base, floating plants went from 3,059 to 75 to 0 on 16 of 17 maps. Seating used 5 rays, a lean of at most 20 degrees and a 5 cm sink: "Losing a tuft is better than one floating." Runtime barriers floated 8 m up on roofs, and one grounding pass dragged a hanging plant "across a window". Ambient occlusion with a 1.1 m reach "left props floating" until 2.4 m, and alpha-tested materials had none at all.
- **Applies when:** Any 3D scene with props, procedural dressing, terrain edited after dressing, or anything placed at load or runtime.
- **Verify:** The float check reports zero, a planted floater on each placement path is flagged, and standing-eye frames agree with it (OS took 24 a map).

### Nothing is sunk
- **Invariant:** A prop stands on the floor, not in it, while foundations and footings may go as deep as they need.
- **Technique:** Compare each prop's base with the floor under its centre; anything larger than a prop is structure and is not judged.
- **Reference configuration:** AW: a prop's base more than 0.25 m under the floor is buried; anything over 2.5 m in plan or height is structure.
- **Applies when:** Any scene with props on floors or terrain.
- **Verify:** The buried check reports zero.

### Solids do not share volume
- **Invariant:** Two solid objects that are not one authored object do not occupy the same space.
- **Technique:** Judge overlap two ways, because each misses what the other sees: depth past the thinner part's own thickness catches a wall through a wall; a fraction of the smaller part catches two equal crates inside each other. A wall corner overlapping by one thickness is a joint, not a defect.
- **Reference configuration:** AW: shared volume above 0.02 m³ and either more than 20% of the smaller part or deeper than the thinner part plus 0.05 m. AW's depth-only version missed its own planted defect.
- **Applies when:** Any scene with placed solids.
- **Verify:** The interpenetration check reports zero.

### No two faces within the shipped grid of one plane
- **Invariant:** No two visible faces facing the same way lie within two steps of the vertex grid they ship on (or a fixed tolerance, whichever is larger) and overlap, measured on the positions drawn after cooking and every load-time pass, and no zero-thickness double-sided sheet ships.
- **Technique:** Measure what the renderer draws: learn the format's position encoding, decode the cooked file, and flag same-facing faces within two grid steps of one plane, inside models and across them. Fix in this order: delete the hidden or back-to-back face first, then lift what must stay well clear of the tolerance (never less than the reference lift below, and at least two or three grid steps), and keep polygon offset for a dedicated overlay such as a decal. Make the fix the last step of every exporter so a re-export cannot bring a tie back. Prefer reversed floating-point depth where the renderer supports it, and recheck draw order after switching. The helper compares parts with each other: set `gridStep` per part (or for the scene), and scan inside each model in the exporter.
- **Reference configuration:** AW and DK work on float positions: faces within 2 mm of one plane with more than 0.02 m² of overlap; DK found 187.7 m² of fighting surface, 150 m² of it from every crate drawing its rails twice; AW holds wall decals 4 to 90 mm off the wall. OS stored positions at 16 bits per axis over each part's box, so grids ran from about 1.2 to 20 mm: the owner's stripe was faces 1.5 mm apart on a 1.22 mm grid, which an exact-tie check called safe, and a fixed 2 mm lift "rounded back into exact ties". That is why the rule counts grid steps. OS lifts at least 1 cm, two to three grid steps, and the owner pasted the rule twice: "never two visible surfaces in the same plane, lift decals ~1 cm along the normal or draw them with polygon offset (factor -1, units -4)". Lifting before deleting turned 8 spike pixels into 28,089; ties "re-grew" after re-exports until the fix ran last; across 1,192 models ties went from 98,914 to 721. LC: reversed depth made a 1 cm gap at 100 m draw 0 wrong pixels where the old buffer's steps were 24 mm there, but it also reversed draw order and the sky drew over everything; a z-fight mend that put jambs every quarter metre of a doorway made a slat wall bodies walked through, on main for 8 hours.
- **Applies when:** Every scene with opaque geometry, distant scenery included, and above all formats that quantise positions and kit-built, generated or merged maps.
- **Verify:** The decoded scan reads zero on the file that landed, the coplanar check reports zero area, and the motion path in the next rule shows the band gone.

### Flicker is judged in motion, on a repeatable path, from every camera
- **Invariant:** No surface flickers, crawls or swaps while the camera moves, from any camera the game uses (play, aiming and zoom, spawn cinematics, menus, map edges, places a player cannot reach), and each reported flicker's cause is named before it is mended.
- **Technique:** Script a fixed sequence (still, turn, strafe, walk, and a zoomed pan) on the game's clock with a fixed step, so before and after film identical frames. Count A-B-A reversals after compensating motion with optical flow, mask the reticle and HUD, and score spike pixels per frame per spot. Then name each hotspot's cause with toggles in one session: stepping the near plane re-rolls only depth ties, turning the sun off removes shadow acne, turning temporal anti-aliasing off removes aliasing, and hiding one object at a time finds its owner. Prove the counter on a still frame first. Aliasing counts as flicker too; mend it with `opengame-look`'s thin-detail rule.
- **Reference configuration:** OS: "so much z fighting / flickering on so many maps still ... that needs to be 0 across all maps every inch..." and "u need to catch them all across every map even in areas u cant see while playing btu spawn in cinematics or around map" (owner). The owner's one word covered at least six causes: coplanar ties, back-face-lit sheets, sub-pixel trim, far-plane clipping, chain-link moiré and shadow stipple. Free-running captures varied 10 to 30%, the stepped path about 5%; the reticle mask removed 75 to 91% of false scoped spikes. The team's bar was 300 spike pixels per frame (0.015% of 1080p) and 13 of 17 maps passed it at the end; the owner never approved that bar, and his own was zero. LC: twenty world leads found 373 coplanar places while the flicker the owner saw was snow-edge noise, normal relief under a lamp at the lens, the lamp's shadow at contact range and ground relief ("nine guesses before that were wrong"), mended by fading sub-pixel relief and keeping normals from facing away from the viewer; with the camera pinned, the clock stopped and the lens moved a quarter pixel, flips fell from 1.64 to 0.00 per 1000 pixels walking. A recorder's grain counted as 209 flips per 1000 pixels and a 2 mm camera drift as flicker.
- **Applies when:** Any 3D game with temporal anti-aliasing, cascaded shadows, thin geometry, fine relief or zoom.
- **Verify:** A planted z-fight is flagged on the path, and every spot is under the bar or signed off with three consecutive 1:1 frames.

### Stills catch joins, never motion
- **Invariant:** The places a person would inspect (contact points, joins, roofs, terrain edges, the skyline, and the view from every camera the game uses) have been inspected on fixed stills, and no still is offered as proof that nothing flickers.
- **Technique:** Place fixed cameras once per level (two at grazing angles along major walls, one looking up at a ceiling join, one along a terrain edge, one across the busiest floor at prop height, one at the skyline), plus each spawn view, cinematic and menu camera, captured every round so the same views compare before and after. Judge flicker, shimmer and popping only on the motion path of the rule above.
- **Reference configuration:** DK's report of a cabinet whose side fought its skin came from a player's photograph at exactly such a join. OS's still sweeps, with temporal anti-aliasing and the sun off, called maps "clean" or showed "faint specks" for eight days while the owner saw "a lot, IN MOTION"; anti-aliasing on raised the count 7.5 times. This rule was "Freeze the frame and look closely" and was offered as a flicker check; it no longer is.
- **Applies when:** Every 3D level.
- **Verify:** The same stills each round with the same camera transforms, reviewed by somebody who did not build the level, beside the motion path's numbers.

### Collision is audited against the picture in both directions
- **Invariant:** Every drawn solid blocks a body or says why it does not, and no collider blocks where nothing is drawn unless the player can see why they are stopped.
- **Technique:** Compare the visible solids with the collision layer both ways. Drawn side: give each uncovered solid a collider or a `nocollide` reason, and report colliders that cover clearly less than their mesh. Undrawn side: report any collider with nothing drawn in it, or with only walk-through things (foliage, decals) drawn in it, unless it carries a `nodraw` reason the player can see. The `colliders` and `invisible` checks do both at box level. In the engine, sweep rays from every reachable cell comparing the first drawn face with the first solid, walk a probe body at every placed thing from four sides, report by category (invisible wall, invisible bullet stop, walk-through, low ceiling, open edge, a lid over a reachable roof), test size rules in each collider's own frame rather than its world box, and let each count only go down.
- **Reference configuration:** OS's most repeated map defect was the undrawn side: "theres random invisible like walls that u cant walk through on map btw?" and "still has a ton of invisible walls u cant walk or run or shoot through" (owner), about 40 collision notes in five days, from colliders of removed gates, clipped bushes and a substring match ("'pine' inside 'alpine' and 'tree' inside 'street'"); on one map player walls went from 1,195 to 2 and bullet-stopping cells from 526 to 38, each kept with a reason, yet at the end another map still had 178 shot-through cells, and a rotated railing had been read as a roof lid because a size rule used its world box. LC's ray grid, 271,936 rays from 4,249 standpoints, found 1,569 solids with nothing drawn on 30 colliders, then 0. AW's body-physics gate found bodies inside drawn opaque volume with no collider on every map; OC's palisade, fences, railings and roofs had none, and its building boxes covered 84% of the footprint. The walk bot only sees the routes you give it, so these checks are the ones that cover the whole level.
- **Applies when:** Every game with a walking body or projectiles.
- **Verify:** The colliders and invisible checks report zero with their plants caught, the walk bot reports no walk-throughs, and the engine's sweep counts are at or below the last good build.

### Every staircase climbed forward-only
- **Invariant:** The walk bot reaches past the top of every flight, ramp and ladder holding forward, with no jump, and a route passes only when the body ends beyond the obstacle.
- **Technique:** Add a route for every staircase, ramp and narrow opening in the level, and one from each ladder's top onto the floor past it, with every goal beyond the landing, not on it. The bot is a capsule that steps up at most one step height and slides along whatever blocks it.
- **Reference configuration:** AW's body radius 0.35 m, height 1.8 m and step 0.42 m are the bot's defaults; pass the game's own numbers as `tolerances`. OC's owner raised stairs that needed a jump 3 times; OC settled on a 0.4 m step for the player and the zombies alike. OS's old walk passed a railing bug by stopping 0.42 m short, and a ladder with less than 1.2 m clear past its top could be climbed and not left. Run the routes again with the AI body's numbers when they differ from the player's (`opengame-world-physics`).
- **Applies when:** Any game with stairs, ramps, ladders or narrow openings.
- **Verify:** The stairs check examined as many routes as the level has flights and climbs, and reports zero.

### Each actor is drawn once
- **Invariant:** Each screen shows the expected number of each actor: one boss, one player character, no frozen leftover copy.
- **Technique:** At the title, in play and on the results screen, count live root objects per actor type in the scene and compare with a table of expected counts. After any rebuild or clone, apply per-instance overrides again.
- **Reference configuration:** OC shipped "two titans one moving one frozen". A hidden-head flag that was not reset on a material rebuild gave one character a double head.
- **Applies when:** Every game with characters, bosses or scripted scenes.
- **Verify:** The count check passes on every screen, including after a character switch and a restart.

## Tuning

Every tolerance is in `TOLERANCES` and can be overridden per run. Change them for a
different scale (a miniature world, a giant), or set `gridStep` to the grid the game
ships on, never to make a finding go away.

---
name: opengame-scene-audit
description: Audit a 3D browser game's geometry with a script. It finds floating and buried props, solids inside each other, coplanar faces that z-fight, solids with no collider or a collider that does not fit, cameras inside solids and duplicate actors, runs a walk bot up every staircase without jumping, and proves each check on a planted defect first. Use when the person says things float, z-fighting, I can walk through things, the screen goes black, stairs are broken, or before calling a level finished.
metadata:
  version: "1.0.0"
---

# Scene audit

A scene that looks right in a still can be full of geometry that is wrong: a crate
hovering a hand's width above the floor, two wall panels in one plane flickering as the
camera moves, a fence nobody can collide with. These are answerable from the scene's own
geometry, headless, in seconds. [helpers/scene-audit.js](helpers/scene-audit.js) does it;
copy it into the game.

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
purpose, `decal: true` for layered decals. In Node, build the same `{ parts, colliders,
routes }` shape from the level's own layout data; the file imports nothing.

`report.ok` is true when the applicable checks caught their planted defects, examined
the scene and found no defects. For a level with no stairs or ramps, pass
`{ notApplicable: { stairs: "This level has no stairs or ramps" } }`. List a reason for
each omitted check. An empty check without a reason remains a failure. Findings name the part, the world position and why.

The adapter reads each visible mesh as one world-space box plus its triangles. It skips
skinned meshes (characters are judged in `opengame-characters`), and reads an
`InstancedMesh` as one box around all its instances, so expand instanced props that
matter into one part per instance before auditing them.

## Rules

### Every check proves itself first
- **Invariant:** No check reports on the real scene until it has found a known defect planted in it, and an applicable check that examined nothing is a failure.
- **Technique:** Before measuring, plant a floating crate, a buried prop, two interpenetrating crates, two coplanar panels and a collider-less wall at an open site chosen from the real scene, and a staircase with one riser too tall. Report how many things each check examined.
- **Reference configuration:** DK's first coplanar audit clipped triangles with inverted winding and measured 0 m² on every prop, including one already known to have 0.4 m². AW plants a defect for each of its eight checks into every map under test, and its plants have found two bugs in the checks themselves.
- **Applies when:** Every audit, every run.
- **Verify:** `formatReport` prints `plant caught` and a non-zero examined count for every check.

### No camera inside a solid
- **Invariant:** No camera (gameplay, cinematic, menu or capture) has its near plane inside geometry, and no framed shot is mostly blocked by near cover.
- **Technique:** Before using a camera position, test a sphere the size of the near plane against the colliders and cast from the subject to the camera; pull the camera in, or reject the position. Aim framed shots from the subject's live joints, so a change of scale moves the camera with it. Reject shots where near cover fills a large share of the frame. In a debug build, log every frame whose camera is inside a collider. In three.js run the test against the physics world (Rapier's shape-intersection queries) or `Box3.containsPoint` on collider boxes, and raycast from the subject with `Raycaster.far` set to the camera distance.
- **Reference configuration:** OC's game-over screen rendered a black 3D layer from r57 to r66, about 7 hours, because its camera was 0.3 m inside a stone ledge: black at 66.33 m, the full scene at 66.22 m. A light at infinity was blamed first. OC's victory camera ended inside rubble, then inside the boss, and a change to the boss's scale broke every framed shot. OC rejects a shot with more than 25% near cover.
- **Applies when:** Every 3D game with scripted, menu, capture or follow cameras.
- **Verify:** Sample every authored camera and every ending camera at each boss scale and arena variant: the audit reports zero cameras inside solids, and the captures contain no black frame with the HUD still drawn.

### Nothing floats
- **Invariant:** Every part is held up by the ground through some chain of contact, unless it hangs by design and says so.
- **Technique:** Seed the supported set from parts resting on the ground or a published floor, then spread support through contact until nothing changes. Two parts touching each other in mid-air do not hold each other up.
- **Reference configuration:** AW: a base more than 0.12 m (a hand's width) above its support floats; parts within 0.08 m touch. Ten AW boulders hung 0.13 m over a cliff path for nine rounds because each rock's base touched its own cap.
- **Applies when:** Any 3D scene with props and structures.
- **Verify:** The float check reports zero, and a planted crate above the floor is reported.

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

### No two faces in one plane
- **Invariant:** No two visible opaque faces lie in the same plane facing the same way and overlapping, so nothing flickers as the camera moves.
- **Technique:** Bin faces by normal and plane distance, clip candidate pairs against each other in their shared plane, and sum the overlap. Repair the geometry (cut, inset, overrun one member a few millimetres into the other) before reaching for depth bias; use polygon offset only for a real layered surface such as a decal.
- **Reference configuration:** AW and DK: faces within 2 mm of one plane with more than 0.02 m² of overlap. DK's triangle audit found 187.7 m² of fighting surface, 150 m² of it from every crate drawing its rails twice. AW holds wall decals 4 to 90 mm off the wall.
- **Applies when:** Every scene with opaque geometry, distant scenery included: a face that flickers on the skyline flickers on screen.
- **Verify:** The coplanar check reports zero area. Then pan slowly at a grazing angle past the busiest joins.

### Every visible solid blocks the body
- **Invariant:** Anything drawn solid has a collider or a stated reason it does not.
- **Technique:** Compare visible solids with the collision layer; give each uncovered one a collider or a `nocollide` reason. Check fit as well as presence: report any collider whose box covers clearly less than its mesh, and any walkable or blocking prop (railing, low wall, pier, roof, fence) with none.
- **Reference configuration:** AW's body-physics gate found bodies reaching positions inside drawn opaque volume with no collider on every map. OC's palisade, fences, railings and roofs had no collider, and its building boxes covered 84% of the footprint (`opengame-world-physics` has the rest).
- **Applies when:** Every game with a walking body.
- **Verify:** The colliders check reports zero; the walk bot reports no walk-throughs. The walk bot only sees the routes you give it, so the colliders check is the one that covers the whole level.

### Every staircase climbed forward-only
- **Invariant:** The walk bot reaches the top of every flight holding forward, with no jump.
- **Technique:** Add a route for every staircase, ramp and ladder-free climb in the level. The bot is a capsule that steps up at most one step height and slides along whatever blocks it.
- **Reference configuration:** AW's body radius 0.35 m, height 1.8 m and step 0.42 m are the bot's defaults; pass the game's own numbers as `tolerances`. OC's owner raised stairs that needed a jump 3 times; OC settled on a 0.4 m step for the player and the zombies alike. Run the routes a second time with the AI body's numbers when they differ from the player's (`opengame-world-physics`).
- **Applies when:** Any game with stairs or ramps.
- **Verify:** The stairs check examined as many routes as the level has flights and reports zero.

### Freeze the frame and look closely
- **Invariant:** The places a person would inspect have been inspected: contact points, joins, roofs, terrain edges, the skyline.
- **Technique:** Six fixed cameras placed once per level (two at grazing angles along major walls, one looking up at a ceiling join, one along a terrain edge, one across the busiest floor at prop height, one at the skyline) captured every round, so the same views can be compared before and after.
- **Reference configuration:** DK's report of a cabinet whose side fought its skin came from a player's photograph at exactly such a join.
- **Applies when:** Every 3D level.
- **Verify:** Six captures per round, with the same camera transforms, reviewed by somebody who did not build the level.

### Each actor is drawn once
- **Invariant:** Each screen shows the expected number of each actor: one boss, one player character, no frozen leftover copy.
- **Technique:** At the title, in play and on the results screen, count live root objects per actor type in the scene and compare with a table of expected counts. After any rebuild or clone, apply per-instance overrides again.
- **Reference configuration:** OC shipped "two titans one moving one frozen". A hidden-head flag that was not reset on a material rebuild gave one character a double head.
- **Applies when:** Every game with characters, bosses or scripted scenes.
- **Verify:** The count check passes on every screen, including after a character switch and a restart.

## Tuning

Every tolerance is in `TOLERANCES` and can be overridden per run. Change them for a
different scale (a miniature world, a giant), never to make a finding go away.

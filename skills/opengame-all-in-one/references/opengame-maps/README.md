> Carried from `opengame-maps` 1.0.0. Read it when: Design and prove a 3D browser game's maps. Covers a written spec with scale from two anchors, the world built and tested as numbers before art, parity as a list of what a player can do with a camera on each item, lanes, sightlines and perches as numbers, spawns in open supported space, spawn coverage and guidance lights. Use when the person says build a map, I spawned inside a rock, where do I go, the map plays wrong, or before an art pass.


# Maps

A map is a set of things a player can do in a place: lanes to look down, perches to
hold, doors to run through, a jump-up that shows both sides, a light to follow in the
dark. This skill writes those down as numbers before the art, builds and tests them as
data, and proves each one with a camera and a walk after every pass, so "it plays like
the reference" is a checked list rather than a feeling. In our games many of the map
complaints an owner repeated were about playing, not looking: invisible walls, spawns
inside rocks, doors too small to use, and nobody knowing where to go.

A reference here means the creator's own: an earlier level, a blockout, a written spec,
concept art, or a real place. Use somebody else's shipped game only to measure how a
kind of place plays (crossing times, sightline lengths, player counts). Build an original
layout, ship original names, and keep reference files out of the build.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. Collision
and the contract that art passes leave gameplay alone are in `opengame-world-physics`;
the geometry audit and the walk bot in `opengame-scene-audit`; the hero location and
dressing rules in `opengame-depth`; visual targets painted over the build's own frames in
`opengame-quality-bar`.

## Rules

### Write the map spec before the geometry
- **Invariant:** A map has a written spec before it has geometry: scale from two independent anchors, every dimension tagged fact, measured or estimate, a coordinate table that is the authority, the intended lanes, perches and spawns, and its sources cited. Concept art sets the look only.
- **Technique:** Use the template in [references/map-spec.md](references/map-spec.md). Decode any overhead of your own reference (a blockout, an earlier level, a site plan) to a pixel grid, anchor it with objects of known size, and cross-check with a second anchor and a timed crossing. Match crossing times rather than raw speeds: when the body changes, scale the layout, and give a mantle to any jump-up the new jump cannot reach. Check a lone judge's layout request against the spec before building it, and record the owner's per-spot rulings in the spec rather than generalising them.
- **Reference configuration:** OS: two anchors on one overhead agreed within 0.4% (0.19209 and 0.1928 m per pixel); another map was honest only to plus or minus 20%, and said so. OS scaled its layouts by 0.85 when its body was smaller than the one they were drawn for. A rectangle overlay passed a map twice while it was closed where its spec was open, sunken where it was raised and 4 to 6 m off. Concept art invented a creek, and one build carried an invented canopy with 14 invisible colliders; launchers added on one judge's request cut parity from 8.0 to 6.4 and from 7.8 to 5.3 ("original wins over a judge"). The owner asked for one wide door on one building while another map's list forbade merging openings; both went into their specs as rulings.
- **Applies when:** Every map built to a reference or a spec, and every map an owner has opinions about.
- **Verify:** A bot times three named routes within about 10% of the spec, and a top-down overlay at the same scale matches the spec's coordinate table.

### Build and test the world as numbers before art
- **Invariant:** The layout, its solids, its walkable field and its routes exist as data that tests read before the engine boots, and the picture and the colliders are both built from that data.
- **Technique:** Keep the plan in one module: rooms, walls, doors with their states, floors, spawn points and objectives, as numbers. Test it headless in seconds: door heads and widths against the largest body, the navigation grid's cell size against the narrowest doorway, and the reachability of every objective and spawn in every door state. Then the builder registers solid, floor and roof as it draws.
- **Reference configuration:** LC tested plan, field, solid and flow before the engine booted; the tests caught a 1.9 m door head (now 2.05 m) and a 0.8 m navigation grid that missed doors (now 0.5 m, with AI doorways at least 1.3 m). 413 typed spawn points are reachable in all 387 door states, and 1,700 of 1,700 test walks arrive.
- **Applies when:** Every built or generated level, before art.
- **Verify:** The number tests run on every change to the plan, in seconds, and fail on a planted undersized door.

### Parity is a written list of what a player can do, each proved by a camera
- **Invariant:** A map built to a reference or an owner's spec has every item of the target present, working and framed: openings per side, jump-ups, cover a player can peek over, door widths, stair routes, devices and their landings, and key sightlines.
- **Technique:** Write the checklist from the references before editing, as player verbs with coordinates and one staged camera per item (the eye on collision at standing height, rejected inside a solid). Pin each owner note to their screenshot and the area it shows, and ask for a screenshot when a note is vague. Run every device for real: log each launcher's landing against its marker, and drive a gate's look and its collision from one state. Something in the code that no camera shows is missing.
- **Reference configuration:** OS: "im not going to list out every piece thats what council of judges should be doing at that level of detail" (owner). Lists ran 16 to 36 items a map. 13 of one map's first 39 cameras sat in walls, roofs or on cliffs, and over 20 judge "gaps" were built items no camera showed. Lifts read as "a flat striped ramp", a teleporter never fired, and lava damage was dead code; landing error went from 0.02 to 1.72 m down to 0.00 m over 22 throws. One pass called a layout "already close" and only reskinned it; one courtyard first shipped as the wrong area.
- **Applies when:** Any map with a reference, an owner spec, or owner notes about a place.
- **Verify:** Every row has a frame path plus a walk or ride log, and blind judges mark each item present from its frame alone.

### Lanes, sightlines and perches are numbers
- **Invariant:** Each lane has an intended count per side, a measured length and an open or broken state, each dominant perch has a counter, the player count fits the walkable floor, and all of it survives art passes and every quality tier.
- **Technique:** Write the intended topology, then cast the lanes as rays over the blockout at standing and raised eye heights. Never add cover to a dominant perch: add counter-perches and flanks, and deny unwanted perches with geometry such as steep roofs. Flood the terrain alone for navigation islands, and cap slopes rather than add ramps. Size the player count from walkable area per player instead of adding geometry. Check that no quality tier thins what hides a player.
- **Reference configuration:** OS: one map passed its validator (17 routes, 3,678 samples, 16 spawns) while the owner found "two alleyways" where the design had one lane per side; one arch per wall fixed it. Measured: a window seeing 26% of its map to 42.9 m; a roof-to-roof line 236 m clear, with the centre line broken by a 7 m rise so long duels are "earned". A creek bank steeper than 45 degrees split the navigation mesh; capping it at 32 took route failures from 38 to 0. At 32 players walkable area ran 70 to 280 m² each, so caps were 12 to 24 a map: "Do not add new geometry to 'fix' it." A low tier that thinned tree crowns let weak machines see through cover that hides players elsewhere.
- **Applies when:** Shooters, and any game where seeing first decides fights.
- **Verify:** Rerun the rays on built collision: lanes match within a metre, and the lines that must stay broken stay broken. One camera per tier over the same cover shows the same silhouette.

### A spawn stands in open, supported space, with a way out and a view
- **Invariant:** No life starts inside or under geometry, in a closed volume, off the navigation mesh, facing a wall or in a live sightline, on any path that picks a spawn.
- **Technique:** Validate against the real colliders after everything has streamed in: a start-pose overlap test (a sweep misses a capsule that starts inside a one-sided mesh), support underfoot, closed containers counted as solids, and an escape test by reachable area rather than a short walk. Score sightlines as a risk with a deadline: relax distance, never line of sight, and count glass, foliage, rails and fog as see-through. Aim the first view down the longest open line. Route every spawn path (first life, respawn, teleports) through one helper, so no later adjuster can move a spawn the validator passed.
- **Reference configuration:** OS: "ur like spawned inside a mountain ... u need to always spawn in playable area" (owner), raised 8 times in its first five days. 35 of 54 spawns on one map sat inside stand-in boulders; the validator ran before streamed rocks arrived, and a runtime adjuster overrode it. A 14 m walk test passed three spawns inside a 42 m² room, so escape became 250 m² of reachable area or a 30 m walk. After: 32 of 32 lives see at least 8 m, and 29 of 30 lives moved within 0.5 s of held input (one earlier log showed 22 s frozen). LC: spawns at least 0.6 m clear and reachable in every door state; eight spawns inside the wire's collider stranded 20 of 75 points.
- **Applies when:** Any game where players or enemies spawn or respawn.
- **Verify:** Headless players drive the real controller from every spawn in eight directions, with and without jump, for a few seconds: none is stuck (OS ran 4 s each).

### Spawn coverage is a test from every standpoint
- **Invariant:** Wherever the player stands, enemies can arrive from several sides at a useful range, in every state of the map's doors and gates.
- **Technique:** Sample standpoints on a grid over the walkable map. For each, find spawns reachable by the cheapest walk at a useful distance, and count the sides they cover, in every door state. Weight arrivals toward flanks and ahead, weight the empty side up, and replace stragglers left far behind. Fix a standpoint short of coverage with a spawn, never by steering the player.
- **Reference configuration:** LC: "zombies also always need to be spawning all around u wherever u go im near the cache and havent seen a zobie in like 1-2 minutes/..." (owner). Every 5 m standpoint needs a spawn 20 to 40 m off on at least 3 sides, in all 387 door states; standpoints short of three sides went from 9.7% to 0.8%. Spawns 16 to 36 m off, flanks and ahead weighted 3 to 1, the empty side 4 times. The flow field is 0.5 m cells on two levels, built in 3 ms slices.
- **Applies when:** Wave, horde and arena games with enemy spawns.
- **Verify:** The coverage test over the whole map, plus, per minute of recorded real runs, the sides enemies arrived from.

### The way is lit, not marked
- **Invariant:** A new player can find the next place to go from anywhere on the map, by light the world itself carries, and hears the way in words when they are lost.
- **Technique:** Bake a chain of dim lights in the world (lamps, chemical lights, painted signs) along the walkable way on the AI's navigation grid, close enough that the next is always in view, with sight checked both ways along each link, brighter ahead than behind and leading toward the current objective only. Put a painted word near every fork. Beyond a short distance draw each light as a hard point whose level, not its size, carries it. Detect a lost player (no progress along the way for a while, or facing away) and say the way in one line. A pointer names the next place by walking distance, not a straight-line bearing.
- **Reference configuration:** LC: "also there should be some dim lights or indicators and/or arrows that tell u where to go and what to do otherwise its hard to know what to do in game too" and "dont make itm too easy but it should not be impossible either" (owner). 325 chemical lights every 5 m on open ground and every 3.4 m in trenches, at eye height on the wall facing the corner; blind links went from 62 to 0 and the longest gap is 6.9 m; a painted word within 4.5 m of all 49 forks; brightness ahead 1, 0.5, 0.34 and 0.24, passed lights 0.14; beyond 12 m a 2.5 px hard point. Lost means 30 s without getting nearer along the way, or 15 s facing away. The pointer reads "YARD GATE 40 M". On film with the lamp off, the next light was in view in 98.1% of samples.
- **Applies when:** Dark, large or maze-like maps, and any game where players say they do not know where to go.
- **Verify:** A lights-off walk from every standpoint shows a light ahead, and the link check reports no blind links.

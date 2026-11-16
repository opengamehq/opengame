> Carried from `opengame-world-physics` 1.1.0. Read it when: Make a 3D browser game's world physically coherent. Covers collision that equals the picture both ways, separate body and shot shapes, pipelines that fail closed, art passes that leave gameplay alone, openings sized to the largest body, step heights, the navigation step, tunnelling, depenetration, ragdolls, corpses and ray budgets. Use when the person says invisible walls, I walked through a wall, fell through the floor, cant get through a door, zombies get stuck, or corpses spaz out.


# World physics for a walking player

What players report as "the physics is broken" is almost always one of a few mismatches:
something drawn that the collision layer does not know about, collision where nothing is
drawn, a staircase whose collision is a wall of risers, a fast body that skips a thin
floor in one frame, or a correction that teleports a body out of a corner. Each has a
known fix. The second, the invisible wall, was among the complaints our shooters' owners
repeated most, and the one the first version of these skills did not name.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. The
numbers below are at human scale in metres; scale them with the game.

## Rules

### One placement, two layers
- **Invariant:** What is drawn and what collides come from the same placements and transforms, and change together.
- **Technique:** Keep a small world spec (units, floor levels, player clearance, step and slope limits, which objects are solid and which decorative) and build both the visible mesh and its collider from one placement record. A door that opens, a platform that moves or a wall that breaks updates its collider in the same frame as its mesh. Break the picture, not the collider: bow a board or slump a sandbag in the mesh while its collider stays simple and in place.
- **Reference configuration:** DK registers real colliders for solid props from the same seeded placement pass that dresses the map, and runs its clearance audits after decoration so they cover it. AW measures against the same part list it draws. LC's layout lives in one plan module, and its builder "registers what is solid ... so nothing drawn here can be walked through and nothing solid is unseen".
- **Applies when:** Every 3D game with a walking body.
- **Verify:** Run the scene audit's colliders and invisible checks (`opengame-scene-audit`); then open a door in play and walk through where it was.

### Collision is the picture, in both directions
- **Invariant:** Nothing drawn solid lets a body or a round through, nothing undrawn stops either, what can be seen through can be shot through, and any edge or ceiling a player can reach shows what stops them.
- **Technique:** Give each collider two shapes from the same placement: one for bodies and one for rounds and sight lines, fitted to the mesh. Collide props as their drawn mesh or a fitted proxy, give decorative clutter a simple proxy so small steps over rubble still work, and keep alpha-cutout leaves and foliage out of collision. Classify colliders by material flag or whole word, never a substring. Keep a boundary blocker only where the player can see why they stop. Query nearby candidates through a spatial index, never every render triangle. Hold it with three audits whose counts only go down (`opengame-scene-audit` has them): a probe body walked at every placed thing, a ray sweep from every reachable metre comparing the first drawn face with the first solid, and a check for solids where nothing is drawn.
- **Reference configuration:** OS: "still has a ton of invisible walls u cant walk or run or shoot through" (owner), at least 16 messages over ten days, from stale boxes under replaced rocks, colliders of removed gates (crawl ceilings of 1.2 to 1.45 m), clipped bushes (905 foliage kits on one map) and "'pine' inside 'alpine' and 'tree' inside 'street'"; on one map player walls went from 1,195 to 2 and bullet-stopping cells from 526 to 38, yet the class never closed: at the end another map still had 178 shot-through cells. LC: "u shouldnt be able to run through zombies we need proper object collision across the game" (owner); wire is a 2.1 m belt for bodies while only its pickets stop rounds, and a lorry is one box for bodies and 375 for rounds; walk-through things over 15 cm went from 935 to 0, rays through drawn faces from 13,033 to 6,671 against a known list that fails on anything new, solids with nothing drawn from 1,569 to 0; a sight line costs 5.8 µs and a body step 2.5 µs. OC's palisade, fences, railings and roofs had no collider, its building boxes covered 84% of the footprint, and the owner reported walking through props about 7 times. AW's capsule flood found bodies inside floor slabs that every grid check had passed.
- **Applies when:** Every 3D game with a walking body or projectiles.
- **Verify:** The three audits run on every change that touches placement; walk and sprint a player-sized body at every prop from four sides, and shoot through every fence a player can see through.

### A pipeline that drops collision fails the build
- **Invariant:** No triangle budget, level-of-detail switch, proxy rule or failed asset load removes a collider without a count; every fallback is counted and gated per map.
- **Technique:** Log each collision fallback (too heavy to collide, stand-ins retired, props set down far) and gate the counts against the last good build, with hard caps on the share of walk-through and shot-through cells. Clear an authored solid only once its replacement mesh has loaded and is not empty, and never let a prop with no collision retire a stand-in. A number printed in a log that nothing reads is not a gate. After an engine upgrade, run one smoke that counts refused physics queries.
- **Reference configuration:** OS: one merged town grew from 149,046 to 153,260 triangles, past a silent 150k collision line, and the map had no walls for 4 days at an 8.5% walk-through share against 1% or less elsewhere, while the log printed the count: "It didn't miss it; nothing read the number." The fix: a hidden-face cut, a 600k tier in 32k chunks, and hard caps (too-heavy 0, walk 2%, shot 2%). Pots 0.599 m tall under a 0.6 m clutter line retired their stand-ins, 11 of 17 shot-throughs. A failed replacement load would have made 93 slabs and 45 cliffs walk-through. An engine port with 0 compile errors refused 256,072 distance queries in one smoke, so every wall read "clear".
- **Applies when:** Engines with collision tiers, stand-in colliders, streaming, or art passes over a blockout.
- **Verify:** Inject a missing model and an over-budget map: the gate fails, and the spot still blocks a walk and a shot.

### Art passes never move gameplay geometry
- **Invariant:** Collision, spawns, perches, lanes, ladders and floor heights are identical before and after a fidelity pass, and dressing stays out of every opening, lane, landing and climb.
- **Technique:** Keep the gameplay layer and draw new art as display-only skins over it, such as one detailed model over hidden brushes whose collision stays. Hash the gameplay data after each pass and require an empty diff. Mark each place a player acts as a clearance volume (a lane, a doorway and the space in front of it, a lift's arc, a ladder top) and refuse any prop inside one. Keep clutter below the height that would make it a new perch, and inside a prop budget.
- **Reference configuration:** OS: one map's 1,081 brushes became one 87k-triangle model with "422,481 non-ring data scalars ... unchanged". Clutter stayed under 1.1 m "so none becomes a sniper perch", and 1,060 to 788 props read better; 6,042 scrub props crashed a map on load (budget about 3,000). Failures: a fidelity pass glazed an upstairs door, a pumpjack filled a ladder top, and an art change hid a stall from human testers. "we also shouldnt have flowers or leaves in front of any doorway" (owner); the keep-out became a doorway plus 2 m and no plant within 1.5 m of a door.
- **Applies when:** Any fidelity, dressing or reskin pass over a level that already plays.
- **Verify:** The gameplay hash diff is empty, no prop sits in a clearance volume, and a capsule walks every route and lift arc.

### A body at real scale
- **Invariant:** The player's collision body is sized to the world it moves through, so doorways, steps, ledges and cover all work at the scale they are drawn.
- **Technique:** A capsule or cylinder with a radius, a height and a step height chosen together with the level's door widths, riser heights and cover heights. Mantling has its own maximum height and needs a ledge deep enough to stand on.
- **Reference configuration:** AW: radius 0.35 m, height 1.80 m, eye at 1.62 m, step 0.42 m, mantle up to 1.35 m onto a ledge at least 0.28 m deep within 0.85 m reach, over 0.55 s. Walk 4.9 m/s, sprint 6.9 m/s, jump velocity 4.5 against gravity 13.5. Bots use the same numbers, so what a player can climb a bot can. LC: radius 0.34 m.
- **Applies when:** First and third person at human scale. Top-down and side-on games pick their own body and say so in the world spec.
- **Verify:** Walk the body through the narrowest doorway, onto the tallest step, and mantle the tallest intended ledge; all succeed, and the next height up fails.

### Openings, stairs and ladders fit the largest body
- **Invariant:** Every door, window, stairwell, crawlway and ladder meant to be passable is passable standing, at walking speed, by the largest body that uses it, every climb leads somewhere, and low clearance blocks the player rather than changing their stance.
- **Technique:** Set minimum opening sizes in the generator from the largest capsule, and audit each build from cooked data, measuring the clear height inside the doorway so a porch counts. Walk the real controller through every opening to a goal past it, beside controls that must still block; a traversal test passes only when the body ends beyond the obstacle. Fix the stage a trace names, and never relax a slope, step or contact limit to clear a counter. Jump always releases a ladder.
- **Reference configuration:** OS: "doors that are too small or not wide enough or too short that u cant walk through" and "we cant have ladders that u can climb and cant get to the thing on top" (owner), 16 door messages and 7 ladder messages. Minimums: doors 1.4 m wide and 2.3 m clear, sills about 0.85 m, stairwell clearance 2.3 to 2.4 m (1.82 m stopped a 1.8 m capsule dead), 1.2 m clear past a ladder top. Undersized doors went from 14, 22, 16, 32 and 21 to 0 on five maps. "no part of any map where when u walk through it it makes u go prone automatically" (owner). A static doorway check passed doors the owner could not use. LC's number tests raised a 1.9 m door head to 2.05 m; its AI doorways are at least 1.3 m.
- **Applies when:** Any walkable map with doors, windows, stairs or ladders.
- **Verify:** The walk fails on the build before the fix and passes on the fix, and every control still blocks.

### Stairs are walked, never jumped
- **Invariant:** Every staircase is climbable holding forward only, with no jump, snag, oscillation or launch, and cannot be entered through its side.
- **Technique:** Either a fitted invisible ramp whose width, slope and joins at the top and bottom match the visible flight, with treads that never block, or a step-aware controller. After a step-up, place the body on the landing rather than letting it hover at the riser. Neither may bridge a real gap.
- **Reference configuration:** AW and DK both use invisible ramps for flights. AW's validator drives the shipped controller up every flight with forward input only, and one flight once offered no drivable start at all, which a forward-only bot reports and a grid check does not. OC settled on a 0.4 m step-up after the owner raised stairs 3 times ("again these kind of stairs"); its first controller "stopped dead at the 45° step-on". A capsule that lowered as soon as its centre crossed a curb's lip, with its rear still in the stone, crossed 0 of 64 curbs; after the fix it crossed 64 of 64. OS: "running up stairs ... needs to be as if ur running up a fully smooth ramp" (owner), after a stair collider sat "half a step proud". In three.js, Rapier's `KinematicCharacterController` has `enableAutostep` and `enableSnapToGround`.
- **Applies when:** Any game with stairs, steps or ledges a player should walk.
- **Verify:** The walk bot in `opengame-scene-audit` climbs every flight with no jump input. By hand: approach at walking speed, cross the last riser onto the landing, turn, descend, then repeat diagonally and at sprint speed.

### Step height comes from the smallest real obstacle, and gaps from the body's width
- **Invariant:** The player and enemies step over what a person steps over, are stopped by what stops a person, and are never held by a gap narrower than a body or a sliver they cannot see.
- **Technique:** Survey the smallest real obstacles on the paths players take (stumps, kerbs, stakes, rubble) and set the step from them, separately outdoors and indoors if they differ. Turn loose low things into walkable decks, give round things circle colliders, make every gap either wider than a body or closed, keep a clear margin along the first route a new player walks, and smooth the camera's rise separately from the feet.
- **Reference configuration:** LC: "we need proper object collision all around u shouldnt be able to walk through logs or piece s of wood (u or the zombies...) anywhere" (owner). Step 0.35 m outdoors ("a stump of 0.29 m stopped a running man" at 0.25) and 0.55 m indoors; loose things up to 60 cm become decks; gaps over 0.68 m (a body) or under 5 cm; 1.2 m kept clear along a run's first line, after a 3.5 cm stake 63 cm from a trunk stopped the player 21 times; the lens rises at most 2.1 cm a frame while the feet take a 21.9 cm step.
- **Applies when:** Every walkable 3D map, most of all cluttered outdoor ones.
- **Verify:** A fan of walks at every stake, sign and station, and a film of the feet over each obstacle class.

### The navigation step matches the body's step
- **Invariant:** The navigation mesh's climb height, agent radius, agent height and slope limit match the movement body each AI uses, so every route the planner offers is one that body can walk.
- **Technique:** Derive the navigation settings and the controller settings from one entry in the world spec. Anything the body must jump or drop down is a link (see `opengame-enemies`), never a walkable step. Snap knockback and hit-stagger to the ground so a hit cannot push a body off its route on a slope. Flood the terrain alone for islands, and cap a slope rather than add a ramp. In recast-navigation-js, Recast's `walkableClimb` and `walkableHeight` are counted in cells of height `ch`, so convert from metres and check the units in the version you use. Godot's `NavigationMesh.agent_max_climb` and a Unity agent type's Step Height are the same setting.
- **Reference configuration:** OC's path map treated steps up to about 1.1 m as walkable while bodies could step 0.4 m, so the planner sent zombies up risers they could not climb, and 22 of 136 zombies were stuck in the fall state. OC's hit-stagger slid zombies down slopes because it had no ground snap. OS: a creek bank steeper than 45 degrees split its navigation mesh, and capping it at 32 took route failures from 38 to 0. LC's AI walks a flow field of 0.5 m cells, because a 0.8 m grid missed doors.
- **Applies when:** Any game whose AI moves with a body along a navigation mesh or graph.
- **Verify:** Read the navigation settings and the controller settings at runtime and compare them. Then drive one AI body along a path over every step height the level has: it stops at no riser the planner called walkable.

### Nothing tunnels
- **Invariant:** No body passes through a wall or a thin floor at any frame rate the game can run at, including its worst.
- **Technique:** Sweep or sub-step horizontal and vertical motion so each sub-step is shorter than the thinnest solid, and settle with a few passes per sub-step so corners converge.
- **Reference configuration:** AW sub-steps at `max(0.05, radius * 0.45)` with up to 8 settle passes, and tests at its own worst frame (`dt` clamped to 0.05 s) as well as at 60 Hz.
- **Applies when:** Every game with moving bodies and thin geometry.
- **Verify:** Sprint into a thin wall and drop onto a thin floor with the frame time pinned at the game's clamp; the body stays on the near side.

### Depenetration is bounded
- **Invariant:** A body found inside geometry is pushed out gently, by the side it entered, never teleported through or across the room.
- **Technique:** Cap the correction per call and per frame, and share one budget across every sub-step and settle pass in the frame, because a per-call cap does not bound a frame that makes dozens of calls. A capsule that starts wholly inside a one-sided mesh touches nothing, so test a start pose for overlap rather than sweeping from it.
- **Reference configuration:** AW caps depenetration at 0.06 m per call and 0.12 m per frame (about one frame of sprinting). Before the per-frame cap it measured 0.576 m of correction in one frame from capped calls into one pipe bundle, and 0.828 m when a body wedged under a truck. OS's spawn validator called 35 of 54 spawns on one map valid while they sat inside boulders: "A capsule wholly inside a one-sided mesh touches nothing".
- **Applies when:** Every game that resolves overlaps.
- **Verify:** Spawn a body overlapping a crate and record its position per frame: it leaves by the nearest face in small steps.

### Support after the clamp
- **Invariant:** The question "what is under the body" is asked at the position the body ends up in, after every clamp and constraint.
- **Technique:** Resolve bounds and constraints first, then query support at the final position. Test every edge of every walkable zone, not only interiors.
- **Reference configuration:** AW's player fell under its map at the play boundary because support was resolved before the boundary clamp; every interior-only sweep reported zero on the day a player filmed it.
- **Applies when:** Any game with play bounds, ledges or walkable zones.
- **Verify:** Walk the body into every perimeter at the worst frame time and check it ends at rest on a floor, not under one.

### A fixed simulation step
- **Invariant:** Simulation advances in fixed steps, independent of render rate, with bounded catch-up after a hitch or a hidden tab.
- **Technique:** An accumulator that runs whole fixed steps and interpolates the render, a cap on steps per frame, and a fresh time baseline after pause or visibility changes.
- **Reference configuration:** 1/60 s steps in DK, MC and AW; AW clamps a frame to 0.05 s before integrating.
- **Applies when:** Every game with physics or movement.
- **Verify:** Run the same input recording at 30, 60 and 144 fps; the body ends in the same place.

### Forgiving jumps
- **Invariant:** A jump pressed just before landing or just after walking off a ledge still happens.
- **Technique:** Coyote time after leaving the ground and a jump buffer before landing, both consumed in the simulation step that uses them, never in a render-only frame.
- **Reference configuration:** AW: coyote 0.12 s, jump buffer 0.16 s.
- **Applies when:** Games with jumping, platformers above all. Turn it off where precision is the challenge, and say so.
- **Verify:** Press jump a few frames late off a ledge and a few frames early before landing; both jump.

### Ragdolls settle, then stop
- **Invariant:** A body that dies falls with weight, comes to rest on real geometry soon after, and does not spin, launch, shake or float.
- **Technique:** Play a directional death clip first and hand the body to physics near its end. Push the body out of any solid it starts in when the ragdoll activates. Cap and damp angular velocity per part, and check whether the physics engine reads angular velocity in world space or in the body's own frame before writing it. When motion stays under a threshold for a short time, freeze the pose and take the parts out of the solver. Judge the result on side-by-side video as well as spin numbers. In three.js with Rapier use `setAngvel`, `setAngularDamping`, `isSleeping()` and `sleep()`; cannon-es has `allowSleep`, `sleepSpeedLimit` and `angularDamping`.
- **Reference configuration:** OC cut corpse spin from 25.6 to 3.0 rad/s (R158), against a target of under 3 rad/s by 1.5 s and an 8 rad/s clamp, and cut knee swing-twist from 121 to 17 rad/s and elbow from 132 to 25 (R105 to R107). Its earlier spikes came from a world-space roll written to a body-frame input (limbs at 25.6 rad/s), cached joint impulses (the full rig failed after 13 steps on a flat floor, and held for 600 once reset) and a body that died buried in a solid (188.97 rad/s). OC's plan for the handover was the death clip first, physics for the last 0.15 s, ragdoll time per kill down from 3.8 s to 1.75 s. Raising corpse inertia 8 times improved the spin numbers, looked worse in a blind review, and was reverted. The owner raised spasming corpses about 8 times.
- **Applies when:** Any game with ragdolls or physics corpses.
- **Verify:** Kill enemies with each weapon class on flat ground, slopes, stairs and against walls. Log peak angular speed per part and the speed 1.5 s after death, and watch the clips beside the reference game.

### Corpses retire on game-time deadlines
- **Invariant:** Every corpse and piece of debris leaves within a fixed game-time deadline, and the count of simulated bodies has a cap, whatever the solver does and at any frame rate.
- **Technique:** Drive corpse timers from the game clock, not from solver step counts. Sink or fade each corpse at its deadline and sweep any that remain. Cap active ragdolls and give far or excess kills a death clip only. Turn off corpse-against-corpse collision. A dead body stops counting as a target the frame it dies.
- **Reference configuration:** OC sinks corpses by 8 s and sweeps visible ones at 10 s (R183), caps ragdolls at 112 in total, and retires any past 8 active or 30 m away. Its rule after the fact: never tie corpse timers to solver step counts.
- **Applies when:** Any game that leaves bodies or debris, hordes above all.
- **Verify:** Run a 10-minute horde at the lowest frame rate the game supports (throttle the CPU) and count live corpses each second: each leaves by its deadline and the count stays under the cap.

### Ray queries are budgeted by length and count
- **Invariant:** Each frame's ray and shape queries fit a budget, however many enemies there are and wherever the player looks.
- **Technique:** Clip every ray to the bounds of what it can hit and give it the shortest useful length. Query a broadphase or a bounding volume tree, against simple collider shapes rather than render meshes. Spread searches (camera placement, escape routes, cover) across frames, and back off after a failed search instead of repeating it every frame. Count queries per frame in the profiler. In three.js set `Raycaster.far` and use three-mesh-bvh (`computeBoundsTree`, `acceleratedRaycast`, `firstHitOnly`); Rapier's `castRay` takes a maximum time of impact.
- **Reference configuration:** OC cast about 670 rays a frame and got 100 to 540 ms frames until the rays were clipped to the collider bounds. Its 11,000-ray camera search ran spread over 16 frames. 88 bodies made 1,000 to 1,600 physics queries a frame.
- **Applies when:** Any game with aim rays, line of sight, camera collision or AI queries.
- **Verify:** Log query count and query time per frame through a full horde round and an ending. Aim at the sky, at the farthest wall and into a crowd: the worst frame stays inside the budget.

## Further reading

How AW measured its controller, and what each game's collision checks missed:
[references/measured-failures.md](references/measured-failures.md). Spawns, lanes and the
map's affordances are in `opengame-maps`.

---
name: opengame-world-physics
description: Make a 3D browser game's world physically coherent for players and AI. Covers colliders that fit what is drawn, stairs walked without jumping, a navigation step that matches the body's step, no tunnelling, bounded depenetration, ragdolls that settle, corpses on deadlines, ray queries on a budget and a fixed step. Use when the person says I walked through a wall, fell through the floor, have to jump up stairs, zombies get stuck on steps, corpses spaz out, or movement feels floaty.
metadata:
  version: "1.0.0"
---

# World physics for a walking player

What players report as "the physics is broken" is almost always one of a few seams:
something drawn that the collision layer does not know about, a staircase whose
collision is a wall of risers, a fast body that skips a thin floor in one frame, or a
correction that teleports a body out of a corner. Each has a known fix.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. The
numbers below are at human scale in metres; scale them with the game.

## Rules

### One placement, two layers
- **Invariant:** What is drawn and what collides come from the same placements and transforms, and change together.
- **Technique:** Keep a small world spec (units, floor levels, player clearance, step and slope limits, which objects are solid and which decorative) and build both the visible mesh and its collider from one placement record. A door that opens, a platform that moves or a wall that breaks updates its collider in the same frame as its mesh.
- **Reference configuration:** DK registers real colliders for solid props from the same seeded placement pass that dresses the map, and runs its clearance audits after decoration so they cover it. AW measures against the same part list it draws.
- **Applies when:** Every 3D game with a walking body.
- **Verify:** Run the scene audit's colliders check (`opengame-scene-audit`); then open a door in play and walk through where it was.

### Every visible solid blocks or says why not
- **Invariant:** A thing that looks solid stops the player, unless it carries an explicit reason it does not.
- **Technique:** Give every visible mesh either a collider or a `nocollide` reason ("foliage", "decal", "distant scenery"). Fit the collider to the drawn shape, since a box smaller than the mesh lets bodies into its edges. Give decorative clutter a simple proxy shape instead of its render mesh, so small steps over rubble still work. Use nearby candidates or a spatial index for the query, never every render triangle every frame.
- **Reference configuration:** AW's body-physics gate floods each map with a capsule from its spawns and reports any reachable position inside drawn opaque volume with no collider; it found bodies standing inside floor slabs that every grid check had passed. OC's palisade, fences, railings and roofs had no collider, its building boxes covered 84% of the footprint, and the owner reported walking through props about 7 times. OC's rubble kept its dense collision even when flagged non-solid.
- **Applies when:** Every 3D game with a walking body.
- **Verify:** Walk into representative walls, large props, closed doors, corners and the back and side of stairs, straight and diagonally and at full speed.

### A body at real scale
- **Invariant:** The player's collision body is sized to the world it moves through, so doorways, steps, ledges and cover all work at the scale they are drawn.
- **Technique:** A capsule or cylinder with a radius, a height and a step height chosen together with the level's door widths, riser heights and cover heights. Mantling has its own maximum height and needs a ledge deep enough to stand on.
- **Reference configuration:** AW: radius 0.35 m, height 1.80 m, eye at 1.62 m, step 0.42 m, mantle up to 1.35 m onto a ledge at least 0.28 m deep within 0.85 m reach, over 0.55 s. Walk 4.9 m/s, sprint 6.9 m/s, jump velocity 4.5 against gravity 13.5. Bots use the same numbers, so what a player can climb a bot can.
- **Applies when:** First and third person at human scale. Top-down and side-on games pick their own body and say so in the world spec.
- **Verify:** Walk the body through the narrowest doorway, onto the tallest step, and mantle the tallest intended ledge; all succeed, and the next height up fails.

### Stairs are walked, never jumped
- **Invariant:** Every staircase is climbable holding forward only, with no jump, snag, oscillation or launch, and cannot be entered through its side.
- **Technique:** Either a fitted invisible ramp whose width, slope and joins at the top and bottom match the visible flight, with treads that never block, or a step-aware controller. After a step-up, place the body on the landing rather than letting it hover at the riser. Neither may bridge a real gap.
- **Reference configuration:** AW and DK both use invisible ramps for flights. AW's validator drives the shipped controller up every flight with forward input only, and one flight once offered no drivable start at all, which a forward-only bot reports and a grid check does not. OC settled on a 0.4 m step-up after the owner raised stairs 3 times ("again these kind of stairs"). Its first controller "stopped dead at the 45° step-on". A capsule that lowered as soon as its centre crossed a curb's lip, with its rear still in the stone, crossed 0 of 64 curbs; after the fix it crossed 64 of 64. In three.js, Rapier's `KinematicCharacterController` has `enableAutostep` and `enableSnapToGround`.
- **Applies when:** Any game with stairs, steps or ledges a player should walk.
- **Verify:** The walk bot in `opengame-scene-audit` climbs every flight with no jump input. By hand: approach at walking speed, cross the last riser onto the landing, turn, descend, then repeat diagonally and at sprint speed.

### The navigation step matches the body's step
- **Invariant:** The navigation mesh's climb height, agent radius, agent height and slope limit match the movement body each AI uses, so every route the planner offers is one that body can walk.
- **Technique:** Derive the navigation settings and the controller settings from one entry in the world spec. Anything the body must jump or drop down is a link (see `opengame-enemies`), never a walkable step. Snap knockback and hit-stagger to the ground so a hit cannot push a body off its route on a slope. In recast-navigation-js, Recast's `walkableClimb` and `walkableHeight` are counted in cells of height `ch`, so convert from metres and check the units in the version you use. Godot's `NavigationMesh.agent_max_climb` and a Unity agent type's Step Height are the same setting.
- **Reference configuration:** OC's path map treated steps up to about 1.1 m as walkable while bodies could step 0.4 m, so the planner sent zombies up risers they could not climb, and 22 of 136 zombies were stuck in the fall state. OC's hit-stagger slid zombies down slopes because it had no ground snap.
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
- **Technique:** Cap the correction per call and per frame, and share one budget across every sub-step and settle pass in the frame, because a per-call cap does not bound a frame that makes dozens of calls.
- **Reference configuration:** AW caps depenetration at 0.06 m per call and 0.12 m per frame (about one frame of sprinting). Before the per-frame cap it measured 0.576 m of correction in one frame from capped calls into one pipe bundle, and 0.828 m when a body wedged under a truck.
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

How AW measured its controller, and what each of its checks missed:
[references/measured-failures.md](references/measured-failures.md).

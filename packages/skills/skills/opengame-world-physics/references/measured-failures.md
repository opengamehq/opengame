# What our physics checks missed, and why

## World at War

World at War (AW) built a headless gate for its maps after a player reported doors that
led into rock, z-fighting, floating geometry and walking through stairs. On the day that
gate first reported zero physics findings on all three maps, a player walked through a
staircase, ended up inside a floor and spawned inside a wall. Six mechanisms let it:

1. **The grid asked a question the controller never asks.** Walkable cells were found
   with a standing-clearance test the shipped controller does not use, so the grid's
   idea of where a body could be was not the controller's.
2. **"Feet inside solid" tested a point at the ankles.** A wall through the shoulder, a
   sill through the chest and a slab through the head were all invisible. Testing a
   circle of the body's radius over its whole height found 25 bad spawns on one map, 16
   on another and 5 on a third, where the point test had found none.
3. **An exemption was unconditional.** Bullet-only volumes inside a ramp's footprint were
   exempt at any height, which hid a solid block of ground. The rule now asks what the
   body is inside, not where it is standing.
4. **Nothing swept.** A grid samples positions; a body that moves fast enough is never
   sampled inside the thin thing it passes through.
5. **Published floor levels were never asked whether a body fits on them.**
6. **The edge was excluded by construction.** Interior sweeps refuse columns near a lip,
   because stepping off a lip is allowed. Every fall-through a player suffered
   was at exactly those columns.

What replaced it: **geometry proposes, the shipped controller disposes.** Flood each map
with a capsule from its spawn points using the controller's own traversal rules,
standing then crouched, to get the set of places a body can be. Then press keys on the
real player controller at that set's frontier (jump, mantle, ladder, slide, crouch) and
drive its movement function at the game's worst frame time and at 60 Hz.

## Two rules worth taking from it

- **A zero and an unexercised check print the same number.** Report how many things each
  check examined, report an arm with no subjects as a failure, and say when a staircase
  offered no drivable start.
- **Replaying stored findings is a smoke test, not a fix rate.** After a solver change,
  AW replayed 344 stored findings and read 185 as gone; a fresh measurement found 165 of
  those 185 still present at the same place. A solver change perturbs the path, and a
  map edit renumbers parts, so a stored position no longer arrives where it did. Measure
  fresh on both sides of every before and after.

## Tolerances AW settled on

| Name | Value | Why |
| --- | --- | --- |
| Grid cell | 0.5 m | A body is 0.70 m across, so nothing body-sized hides between samples |
| Floor agreement | 0.15 m | One riser is about 0.10 m; more than this and the gap shows |
| On a ramp | one step, 0.42 m | A drawn tread and a straight ramp differ by up to a riser |
| Doorway width | 0.60 to 3.20 m | Narrower is a crack, wider is a missing wall |
| Headroom | 1.80 m | The body's height |
| Ladder landing | 0.20 m | A landing you step onto, not one you fall to |
| Settle time at an edge | 1.5 s | A body walking off a terrace slides for over a second |

## OG Snipers and Last Contact

OG Snipers (OS) and Last Contact (LC) met the same shape from the other side: checks
that read green while players met invisible walls and spawned inside rocks. The common
cause is in OS's own summary: the check reused the fix's inputs, or the check's path
differed from the player's.

| Check | It said | What was true |
| --- | --- | --- |
| OS spawn validator | Spawns valid | 35 of 54 spawns on one map inside drawn boulders: a capsule wholly inside a one-sided mesh touches nothing |
| OS spawn validator, again | Spawns valid | It ran before streamed rocks arrived, and a runtime adjuster moved spawns after it |
| OS spawn walk | Three spawns can escape | A 14 m walk test passed three spawns inside a 42 m² room; escape is now judged by reachable area |
| OS doorway heuristic | 0 blocked doors | The owner could not get through them; the served build was also stale |
| OS short sweeps | Spawn clear | Two spawns that passed were displaced over a metre in play |
| OS collision on one town | No alarm | The mesh crossed a 150k-triangle collision line and had no walls for 4 days |
| OS engine port | 0 compile errors | 256,072 refused distance queries in one smoke, so every wall read "clear" |
| OS integrity audit | 0/0/0 | Reached by adding filters; refused until every planted hole was flagged |
| OS route walk | Railing passes | The walk stopped 0.42 m short of the railing and called it arrived |
| LC walk tests | Wire is fine | Eight spawn points sat inside the wire belt's 2.1 m collider and stranded 20 of 75 points |
| LC z-fight mend | Fixed | Jambs every quarter metre of an arched doorway made a slat wall bodies walked through, on main for 8 hours, "found by a count, not by an eye" |

What replaced them was the same in both games: walk the real controller from every spawn
and at every placed thing, sweep rays from every reachable cell in both directions, plant
one defect per path the check covers, and let each count only go down.

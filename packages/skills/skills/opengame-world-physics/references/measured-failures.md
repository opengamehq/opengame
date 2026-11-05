# What AW's physics checks missed, and why

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

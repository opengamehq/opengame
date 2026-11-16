# A first-person body, and generated people

LC's numbers for the rules on the player's body, captured motion, joint bands, foot
planting and generated people in `SKILL.md`. LC is a photoreal body-camera survival
shooter in three.js WebGPU: the lens sits on the player's chest, and the dead are
generated people. Its owner raised the body, hands and holds about 19 times. Measure your
own; a stylised game keeps the method and sets its own numbers.

## The whole body

- A full rig even when the player sees only arms: 22 joints, legs, trunk and arms, with a
  third-person debug view. Floating arms were the owner's first note ("u also should have
  a body not just floating arms and hands... with legs body etc.").
- 32 captured clips blended by speed and gait. The chest turns to the aim; the hips are
  set so the chest point is the lens; leg IK keeps the feet on the ground.
- Arms by two-bone IK over the captured pose, the elbow a third of the way from hanging
  toward the captured elbow. "When a target cannot be reached within the limits the
  weapon moves, never the anatomy."
- The figure is scaled to 1.70 m so the lens height is its own body's.
- The lens on the breastbone: 1.30 m standing, 1.105 crouch-walking, 0.895 crouched;
  the shoulders 0.22 m behind it. Looking down bends the trunk at the hips and the lens
  rides it. Placement and feel numbers are in `opengame-game-feel`.

## Never see-through

- Near plane about 2.5 cm. No alpha test, dissolve, dither or near-fade on the player's
  own materials; closed, double-sided cloth.
- Hide the head and neck whole. Never cut triangles near the lens: a cut of everything
  within 7 to 20 cm turned the torso into a ring of shards.
- Post effects skip everything within 1.2 m of the lens.
- When something close up looks wrong, check whether the camera is inside it: a "pale
  lining" was the inside of a sleeve filling 67% of the picture, and a "hole" in the
  shoulder, mended three times as a hole, was unlit cloth.

## Joint limits and the natural band

| Joint | Impossible beyond | Natural band at rest and aim |
|---|---|---|
| Wrist flexion | 80 degrees | within 20 either way |
| Wrist extension | 70 degrees | within 20 either way |
| Wrist radial / ulnar | 25 / 40 degrees | within 20 either way |
| Forearm twist | 85 degrees | |

Check both gates on every frame in the running build, with a console error: the limits
on every frame, the band at rest and on the sights. LC's reload bar used a simpler pair,
70 degrees bent and 30 to the side, on top of these. LC's first
check bounded only the impossible: "0 joint faults over 1,825 arm-states" while wrists at
67 to 78 degrees looked wrong to the owner.

- Fix a bent wrist by the elbow's place, not the hand's: five hand placements left 23 to
  44 degrees; the elbow under the wrist gave 9 to 22.
- No shortest-arc arm solves: they wrung the forearm 36 degrees at the ready, 61 on the
  sights and 105 at one support elbow. Ten twist joints per sleeve, the forearm carrying
  0.6 of the hand's roll (at most 1.2 rad), faded in over 15 to 50 degrees of bend: ring
  twist from 24 to 12 degrees. A plain hinge fix opened a hole at the shoulder.
- Forearm twist weight 0.5; 0.65 left a ring at 0.56 of the cuff's area. The sleeve's
  cuff rides the twist bone, the glove's cuff the hand, and a wrist cross-section never
  falls under 0.85 of rest.

## Holds

- One grip and one elbow place per hold, so the grip never shifts as the look moves.
- Right-handed: the firing forearm enters from the lower right.
- Every action begins and ends with a hand travelling, about a third of a second in and
  out, eased.
- Copy holds from photographs and footage of trained people. LC's first rejected hold was
  built against a composite of its own renders.

## Feet

- Stride phase advanced by metres travelled over stride length: walk 1.48 m per two
  steps x the square root of the speed ratio; runs of 1.73, 1.99, 2.43 and 2.94 m at 2.2,
  2.7, 3.8 and 5.5 m/s.
- Lock a foot while its heel is down, then its toe. A foot left more than 20 cm out steps
  home. A turn past 49 degrees is a stepping turn. Sample the ground ahead for the
  swinging foot. Jump phase comes from vertical velocity, not a fixed clip.
- Gate against a person table at 60 Hz: planted slide under 5 mm a frame; knee 0 to 5
  degrees at heel strike, about 15 loading, 60 in swing; hip bob 4 cm walking and 6 to 10
  running. Before: 21 to 38 mm a frame walking, 66 to 130 sprinting, 255 mm in one frame
  on a stop.

## Proportions

A human table for generated figures, at arm's length in the game's light: stature 1.64
to 1.90 m, head 0.135 to 0.145 of height, arm 33% of height, upper arm 1.2x the forearm,
wrist 0.55 of the forearm's width. No edge stretched over 2.0 to 2.2x across a joint's
range (hip: 116 edges over 2x to 0), with weights from a diffused field over the welded
shell.

## Generated people, step by step (about $2.66 a person)

1. An A-pose concept in close-fitting clothes, arms held well out. Look at it before
   paying for the mesh.
2. Image-to-3D at 4K, 600k to 1M triangles.
3. Prepare: re-bake to about 11,500 triangles (head share 0.27, hands 0.13), a new
   unwrap on a smoothed copy, 2048 bakes, the head on its own 1024 sheet with its own
   reduction budget.
4. Levels of detail at about 3,900 and 1,200 to 1,700 triangles, on the same unwrap.
5. Rig the prepared mesh, not the raw one.
6. Play 27 library actions on each figure's own rig.
7. A packer refuses a mesh more than 10 mm off its rig's mesh.
8. Audit every clip (torn: an edge over 3x or under 0.25x rest; fail above 1% torn) and
   list the failing ones out.

Results: 56 of 56 clips failed on a shared skeleton; 405 clips on 14 people, then 572 of
572 on 21 people, passed on their own rigs. Long coats and capes failed on automatic
rigs. Library motion still fails on sight: film it from the side, at a quarter speed,
before keeping it.

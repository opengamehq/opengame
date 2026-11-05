---
name: opengame-characters
description: Bring generated or imported 3D characters into a browser game so they hold up in play. Covers skin checks against pinched waists, eased gait choice against third-person jitter, authored locomotion over procedural, thumb-and-mitten hands on the posed gun, canon sheets against drift, instant customisation, gated stages and real grips. Use when the character T-poses, jitters, bends wrong, feet slide, hands clip the gun, it drifts from the art, customising is slow, or a game shows the player's OG.
metadata:
  version: "1.1.0"
---

# Characters

A character is finished when it is right in the live spawn path, from the gameplay
camera, while moving, including from behind. A model that loads, a rig that binds and
a clip that plays are three separate facts, and none of them proves the visible
character is correct.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.
Generation and Meshy specifics are in `opengame-assets`.

## Rules

### Bodies keep their volume in every clip
- **Invariant:** No character or creature pinches, hourglasses, splits or bends wrong at the waist, hips, shoulders or neck in any clip, and this is checked when the asset is imported and again in motion.
- **Technique:** At import, pose every clip offline and measure the posed waist width against the bind waist. Check that no thigh weight reaches above the hip or crosses to the other leg, that hoods and collars are not weighted into the head, that skirts and aprons follow the hips, that normals agree with face winding, and that left and right parts match. Spread twist over several torso bones. Then watch a turntable of every clip, because the numbers pass before the eye does.
- **Reference configuration:** OC passes a waist at 0.95 or more of rest, and below 0.90 is a visible pinch. Two zombie types sat at 0.81 and 0.79; after reweighting all 20 heroes reached 0.957 or more and the zombies 0.97 to 0.99. A bind waist at 63 to 65% of hip depth reads as an hourglass even with good weights. One waist kept 65% of its width before the fix and 98% after; an apron weighted to the thighs filled the gap between the legs; a hook was weighted to the thigh instead of the hand; one shoe was 27% longer than its pair. The owner sent three messages in about 30 minutes ("we cant have that on any character or creature!"), and the defect was declared fixed by numbers while screenshots still showed it.
- **Applies when:** Every skinned character or creature, generated or bought.
- **Verify:** The import report lists the waist ratio per clip for every body, and a turntable of each clip in play shows no pinch.

### No pose weight ever changes in one frame
- **Invariant:** Gait choice, direction switches and layer weights ease over time, so a third-person body never pops, flips or jitters while running, strafing, stopping or idling.
- **Technique:** Pick the locomotion clip from a smoothed speed, never the raw one. Damp every blend weight, add hysteresis to direction thresholds, unwrap angle channels before clamping, cross-fade loop joins, and sample gait keys on a spline. Replace every boolean pose gate (grounded, armed, aiming) with an eased weight. When a body jitters, measure the body on its own before touching the camera or world (see `opengame-game-feel`).
- **Reference configuration:** OC's third-person jitter, raised 6 or more times over 3.5 days, came from a gait clip picked on raw speed; an ease of about 80 ms and spline-sampled gait keys ended it. A toe-yaw clamp flipped 51 degrees in 2 to 3 frames; a strafe switch without hysteresis turned the legs 137 degrees in one frame; a grounded gate dropped the hips 3 cm in one frame and an armed gate popped the arms on every swap; the idle loop's join was 68 times the median frame step.
- **Applies when:** Every animated character seen in third person or by other players.
- **Verify:** Record running, stopping, strafing and idling at the display rate; plot the second difference of root and head and the body's screen position per frame, and flag arm jumps over the game's threshold.

### Locomotion is authored; procedural motion is a small layer
- **Invariant:** Walking, running, idling and actions come from authored or captured clips blended by speed, with feet planted and legs still at idle; procedural passes add small corrections on top and never replace a limb's pose.
- **Technique:** Buy or capture a locomotion set before writing procedural legs or arms. Blend clips by measured speed with matched phase, set cadence from distance travelled, and fix bad channels in the clip data at the source. Audit each procedural pass by turning it off and comparing.
- **Reference configuration:** OC: mocap clips at walk 1.4, jog 3.4, run 4.8 and sprint 6.2 m/s, crossfades of at least 0.15 s; 40 clips cost about $2.40. Cadence by distance (1.05 m per walking cycle) cut foot skate from 84% to 30%. The "mannequin arms" the owner disliked came from a procedural arm pass that pulled the arms level. A knee and foot channel swap was fixed in 11 clips at the source. The owner asked 7 to 10 times, including "not even moving and my characters legs are moving".
- **Applies when:** Every walking character. A stylised procedural walk is a style choice, made once and checked against the concept.
- **Verify:** Stand still, walk, run and sprint in play and record the feet: planted feet do not slide and idle legs do not move. Turn each procedural layer off and confirm the base clip already reads right.

### Hands are a thumb and a mitten, fixed to the posed gun
- **Invariant:** First-person and held-item hands are simple closed shapes that rig and pose easily, attach to the item's posed transform, never pass into it, and never cover the sight.
- **Technique:** Model the hand as a thumb plus a single mitten body, cuff-wide, as one closed mesh, unless the game's style needs fingers. Parent it to the gun's posed transform, not the unposed one. Test penetration numerically per reload phase (`opengame-weapons` has the check) and keep sleeves from stretching to reach.
- **Reference configuration:** The owner on OC: "basically a thumb and then a blob for hands ... It should be easier to then rig it and animate it with the guns versus having five fingers", and later "We don't need five fingers. If anything you just need a thumb". Before that it took 4 first-person passes and 5 glove redesigns. OC's sleeves are about 0.17 m across. A hold constant stretched sleeves 16%; a glove covered 35% of one gun's aimed centre.
- **Applies when:** First-person games and any character holding tools, unless the art style calls for articulated fingers.
- **Verify:** Capture hip, aimed and every reload for each gun; measure penetration and the covered share of the aimed centre.

### One canon sheet per character stops drift
- **Invariant:** Each character's identity (proportions, head count, eyes, outfit, colours) comes from one canon sheet of turnarounds, scene paintings guide composition and light only, and every round compares the build with the sheet.
- **Technique:** Write the canon on day one, with turnarounds, measured proportions, the eye and face rules and the materials. Generate 3D only from the turnarounds, never from scene paintings. Put a side-by-side of build and canon in every round's report, measured where it can be.
- **Reference configuration:** OC's canon doc said 2.2 heads tall while the measured turnaround was 2.7. Scene concepts had invented different outfits, helms and horns, and assets generated from scene frames inherited the drift. Eyes: an open eye is a black oval with a small white oval at the bottom and a glint, no rim; a closed eye is a thick tapered lid; eye-white albedo about 0.02. Several eye shader edits never reached the build. All five early character sheets were rejected; after the canon pass the harsher canon critic rose from 3.6 to 5.3. The owner: "make sure we dont drift like that".
- **Applies when:** Every game with designed characters, above all when generating them.
- **Verify:** A sheet per character per round, canon beside build at the same angles, with the head-count ratio and eye crop measured.

### Customisation shows on the next frame
- **Invariant:** Every customisation choice appears on the next frame, on the first click, in any order, and the screen never shows a wrong or half-built character while it loads.
- **Technique:** Make colour and eyes material parameters over a baked mask. Build shapes and outfits from parts imported ahead of time into a small resident pool, preload the neighbours of the current choice, and spread imports over frames so preloading does not stutter. Keep the previous complete character on screen until the exact new one is ready. Persist the last avatar and show it on the title, select and spawn.
- **Reference configuration:** OC's target was every row within about 0.1 s. At one point a change took 1.2 to 12.8 s; colour later took 2 to 86 ms and heads 51 to 135 ms, and outfits still took 0.8 to 2.8 s at the end. A pool of 4 pre-imported looks hit in 15 to 31 ms within 24 MB; three background workers were the limit (five slowed imports 2.5x); warm imports paused for 20 frames after any change; eager preloading caused 38 hitches against 16. Head bakes took 1.7 to 2.7 s each. The owner, 5 or more times: "customizing OGs MUST be instant!" and "it cant be that fucking hard".
- **Applies when:** Games with character creators, outfit pickers or loadout previews.
- **Verify:** Reload the page, then click every row cold in a random order with a frame recording; time each click to its final frame and count hitched frames.

### Gate every stage
- **Invariant:** Each stage of a character (reference, mesh, remesh, rig, skin check, clips, sockets, play) is inspected and passed before the next one is paid for.
- **Technique:** Keep a short stage list per character with the evidence for each: the reference image, a turntable of the mesh, the polygon count after remesh, a rest-pose capture of the rig, a stretch pose for skinning, each clip looped three times, each socket with its equipment, and a capture in play.
- **Reference configuration:** ST gates characters this way, and MC found that two soldiers generated with identical parameters came back at different quality, so each one is checked rather than assumed.
- **Applies when:** Every generated or imported rigged character.
- **Verify:** The stage list has evidence for every stage of every character in the game.

### Pilot two bodies before making many
- **Invariant:** The pipeline is proven on two anatomically different characters before it runs for the rest.
- **Technique:** Pick the two most different bodies the game needs (a heavy and a slight one, a biped and a creature) and take both all the way to play first. Rigs from one generator are not interchangeable; budget a per-character solve for stances, grips and contact.
- **Reference configuration:** ST pilots two before forty. MC found its generator's rigs were not interchangeable between soldiers and that stance correction was a third per-soldier solve.
- **Applies when:** Any game with more than a couple of characters.
- **Verify:** Both pilots pass every gate in play before a batch is started.

### No T-poses, no primitive stand-ins
- **Invariant:** No character is ever seen in its bind pose, and nothing a character holds is a primitive.
- **Technique:** Start every character in an idle clip before its first render; give held items their own models with grip markers. A missing clip falls back to idle, never to the bind pose.
- **Reference configuration:** Our originals require a rig and at minimum idle, locomotion and the game's one signature action on every character mesh. ST's review fails a T-pose anywhere.
- **Applies when:** Every game with characters.
- **Verify:** Capture every character on its first visible frame after spawn and after a respawn.

### One owner of movement
- **Invariant:** The controller moves the character's root through the world; animation never moves it, so the body, the collision capsule and the equipment stay together.
- **Technique:** Strip net horizontal travel from locomotion clips while keeping bob and sway, normalise rest height and forward once, and use a positive uniform scale on animated ancestors. Correct gait clips only, never actions, jumps or deaths.
- **Reference configuration:** AW rebases the hips of its mocap; ST's `prepareLocomotionClip` removes travel and checks three loops for drift. SR's death clip moves the hips more than two metres, so SR samples it once to set a conservative bound and culling stays on.
- **Applies when:** Every animated character driven by a controller.
- **Verify:** Loop each gait three times in place: no drift, no snap at the loop, no separation from the capsule.

### Gaits blend by phase and speed
- **Invariant:** Feet do not slide or pop: transitions blend, a new gait starts where the old one's feet were, and playback speed matches ground speed.
- **Technique:** Crossfade every transition, starting the new clip at the old clip's normalised phase. Set playback rate from displacement after collision, divided by stride over clip length, clamped per clip. Pick the gait from measured motion relative to facing, not from the key pressed.
- **Reference configuration:** SR and MC crossfade 0.14 to 0.16 s, ladders and mantles 0.22 to 0.30 s. Gait thresholds walk above 0.4 m/s and run above 6 m/s. DK varies each actor's idle speed (0.55 + (id % 7) * 0.04) so a horde never moves in lockstep. OC crossfades in at least 0.15 s at a matched phase and sets `timeScale` from velocity.
- **Applies when:** Every walking character.
- **Verify:** Record feet against the ground at slow, normal and sprint speed, against a wall and on stairs; no foot moves while planted.

### Hands hold the real grip
- **Invariant:** A held weapon or tool follows the animated body, both hands sit on its real grips through movement, aim, recoil and reload, and the shot leaves from its real muzzle.
- **Technique:** Attach rigid equipment to a bone with the inverse of the bone's rest transform so it keeps its fitted pose. Author grip and muzzle markers on the actual model, animate a pivot rather than the frozen carry matrix, then solve each arm as a two-bone chain to its grip with a stable elbow pole, clamping unreachable targets rather than stretching.
- **Reference configuration:** MC's weapon IK, AW's hand-on-weapon validator, SR's weapon mount and DK's gear attachment by inverse rest matrix. SR validated 540 hand-grip poses across four outfits and every weapon. OC's default IK pole gave a 52 degree elbow where 17 to 18 was the target, and its third-person gun canted left twice.
- **Applies when:** Characters that hold things, in third person or in any view that shows them from outside.
- **Verify:** Capture both palms against the grips at several aim angles and through a reload; muzzle flash and shot origin coincide.

### Judge from the gameplay camera
- **Invariant:** A character is accepted on how it looks in play, from the camera the player uses, from every side the player sees.
- **Technique:** Capture rest, movement, the signature action and its return, from the gameplay camera, including rear views, and compare against the concept at the same camera. Judge motion as a frame sequence, not a still.
- **Reference configuration:** ST compares player-camera captures with the selected concept and sends actual pixels to an adversarial reviewer; SR's character review lists native shoulder-camera appearance as outstanding until it is seen in play. OC's third-person gun was "hidden behind the body in every follow view"; the owner asked to see the hold "in EVERY camera hangle".
- **Applies when:** Every game with characters.
- **Verify:** A reviewer with fresh context passes the captures, rear views included.

### Fair bodies and fair budgets
- **Invariant:** Hitboxes are fair across characters, and every character fits the game's frame budget.
- **Technique:** Normalise heights so a tall character is not easier to hit, keep the hit capsule independent of cosmetic equipment, set polygon counts before rigging, and share geometry and materials across instances. Clone skinned characters with `SkeletonUtils.clone` so each owns its bones.
- **Reference configuration:** ST budgets 150k triangles per character and 30k per prop. MC sets a 22,000 target before rigging so its rig does not bind to a mesh that is later remeshed. SR's four outfits add 1,140 to 1,320 triangles each and one mesh per actor without changing the hit capsule.
- **Applies when:** Games with several characters on screen, competitive games above all.
- **Verify:** Read triangle counts and draw calls with the busiest crowd on screen; compare hit capsules across characters.

### The player's OG is theirs, read fresh and never kept
- **Invariant:** A game that offers the player's OpenGame OG builds it from `og.player.avatar` each session, never stores it or anything built from it, asks for it or relays it to other players, falls back to its own default for anything missing or unknown, and shows the same OG as "Your OG" in every scene and point of view.
- **Technique:** Remembering that the player picked "Your OG" is fine; the recipe is not. Read it through `watchAvatar` from `@opengamehq/sdk/avatar`, which names the parts with the shared layout (`readAvatar` does the same for one recipe); never split the recipe by position. Map each part through the game's own table with a default per part, and draw it to `AVATAR-SPEC.md` in the SDK package, or start from the SDK's Three.js example in `examples/avatar-threejs`. For a menu, a scoreboard or a 2D game, `portraitUrl(avatar)` gives the head as OpenGame draws it. Start building the model off the main thread as soon as the SDK names the player, under the loading screen, and import it only in menus. List "Your OG" first, labelled, equipped once loaded, removed after sign-out. Give first person separate sleeves and hands in the same colors as the third-person OG rather than a shrunken body, keep a shoulder camera's OG to one side, give every OG the same hitbox in competitive play, and light menus separately from the level. The recipe format, the portrait, the 21-joint contract, the page-bake pattern and each view's settings are in [references/player-og.md](references/player-og.md).
- **Reference configuration:** OG Clash bakes the OG to a GLB in a Web Worker and drops it into its Kaigen engine; its shoulder camera sits 2.6 m back and 1.15 m right with a 58 degree lens and keeps the OG's center within 0.30 of the frame width from the left. Shrinking the body's head and arms for first person spread white shards under the camera, live portraits in a list froze the game at the 39th quick switch, and opening "Your OG" with 4 to 8 workers added 861 MB and crashed an iPhone.
- **Applies when:** Any game on OpenGame that shows the player as a character.
- **Verify:** Capture every view as a guest and with `?og-dev-player=signed-in`, including first person looking down while downed, then grep the game for any write of the recipe, or of a model or image built from it, to storage, network or logs.

## Further reading

Meshy's rig skeleton, animation library and the traps MC hit integrating them are in
`opengame-assets`. Root-motion, carry-frame, grip, skin-check, eased gait and customise-pool code sketches:
[references/integration.md](references/integration.md).

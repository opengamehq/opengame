---
name: opengame-weapons
description: Build first-person weapons and view models that hold up next to a shipped shooter. Covers iconic guns built from the real reference, view model size per gun class, beat-by-beat reloads with exported timings, hands that touch and never clip, no low-poly stand-ins, aiming through the real sight, kill reactions per weapon, camos and upgrades, wonder weapons and mystery-box odds. Use when the person says the gun looks like a toy or is too big, reloads look fake, hands clip, or add a weapon or box.
metadata:
  version: "1.0.0"
---

# Weapons

In a first-person shooter the gun is on screen for the whole game, so every flaw in it
is seen thousands of times. OC's owner raised gun fidelity about 30 times, its wonder
weapon about 22 times and hands about 15 times. Four habits cost most of those rounds.
Agents built a famous gun from an icon, fixed one gun when sixty had the defect, checked
size by eye, and showed a cheap model while the real one loaded.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. The
three.js view model pass, depth handling, coverage masks and model loading are in
[references/threejs.md](references/threejs.md). Recoil springs, shake and hit feedback are
in `opengame-game-feel`; hands and arms are in `opengame-characters`.

**One defect is a defect in the whole class.** When the owner flags one gun, sight, camo
or pickup, sweep every gun on every path before reporting it fixed. The rule and OC's
numbers are in `opengame-quality-bar`.

## Rules

### Famous weapons are built from the real reference
- **Invariant:** A weapon the genre has made iconic matches the original's proportions and silhouette from the side, top and back, as seen from the camera players know it from, before anyone works on surface detail; it is built from the original, not from an icon, a texture sheet or memory, and the reference files stay out of the build.
- **Technique:** Get the original model or clear footage first. Extract its proportions, render it beside the candidate under one camera, and score the silhouette overlap from side, top and back. Write a materials list and a reload beat list from the reference, and recover its handling data (magazine, reload time, cadence, projectile speed, splash). Keep reference files outside the build folder, hash-check the shipped files against them, and ship original names.
- **Reference configuration:** OC built its Ray Gun for about 14 builds from "a texture sheet and a 64-pixel icon, never the actual model", and the owner rejected all of them in one message ("ur not even fucking CLOSE"). It took about 30 builds over 3 days. Six owner images and measured proportions fixed it: side outline overlap 0.947 to 0.954 against a bar of 0.95, first-person framing from directly behind as in the original, and triangles held at or below the heaviest loadout gun (24.9k; the first attempt was 47k). The reference data was a 20-round magazine, a 3 s reload empty or partial, a 330 ms cadence, 81.28 m/s base and 106.68 m/s upgraded, and a 1.6256 m splash. The materials list was worn maroon enamel, chipped edges, brass patina, visible cells, a gauge with a needle, rivets, a decal and grime. A hash check found 0 of 44 private reference files among 12,987 shipped, while trademarked names were still in the build at the launch audit. An agent's own note: "more surface detail alone won't address your criticism".
- **Applies when:** Any weapon, vehicle or prop the audience already knows from another game or film.
- **Verify:** Each round, a sheet of reference and build side by side from the same side, top, back and first-person cameras, with the overlap score for each view.

### View model size is measured per class, in every pose, on several screens
- **Invariant:** Every gun of a class covers about the same share of the screen at hip, aimed, sprinting and drawing, on wide, standard and phone screens, checked against a frame from the genre's reference game; the gun is always in hand and clear of the HUD.
- **Technique:** Render the weapon layer alone to a mask and count its pixels in each pose at each screen size. Keep a table of target shares per class. Change one shared scale, then rerun every gun. Also check the resting angle, the muzzle position and near-plane cuts on long rifles at phone aspect.
- **Reference configuration:** OC hip targets, as a share of a 1280 x 720 frame: pistol about 6%, SMG about 8%, rifle about 9%, LMG about 9.5%, wonder pistol 7 to 9%. The Ray Gun shipped at about 40% and went to 5 to 7% in a hotfix. One fix swung the hip guns from "very small" to "so fucking massive", and the size had been checked against CoD by one agent's eye. The owner rejected guns both as toys and as massive. Within a class OC holds the hip footprint within about 2x (rifles had spread 3.9x and went to 2.1x). Hip yaw above about 13 degrees reads as sideways (one gun sat at 21.5). Screens: 1280 x 720, 1920 x 1080 and 844 x 390. OC's guns are drawn at 1.5x life size against an arm of about 0.52 m, so a true shoulder weld was impossible; the lesson was to fix the scale on day one.
- **Applies when:** First-person games with held weapons or tools.
- **Verify:** The coverage table for every gun in all four poses at all three sizes, with each gun inside its class band.

### Nothing low-poly ever shows
- **Invariant:** The player never sees a placeholder, a low level of detail, a procedural fallback or a wrong variant of a weapon, in the loadout, a menu preview, the mystery box, a wall buy, in hand or in third person, and never pays for a weapon whose model has not loaded.
- **Technique:** Keep the previous complete weapon on screen until the exact new one has loaded and its shaders are compiled. Preload the likely next weapons: the visible roster, the box pool, nearby wall buys, menu neighbours. Gate a purchase on the model being ready. Where nothing exists yet, show a designed loading state in the UI, not a gun-shaped stand-in. Ship authored hero models with named parts and sockets (see `opengame-assets`); code-built guns do not pass.
- **Reference configuration:** OC: one lazy-load change put low-poly guns in 6 places, and a wall gun charged points while its model was missing. The owner said it at least 6 times, including "never load any low poly versions of guns ANYWHERE in this game" and "NOTHING low poly shows when spinning box". OC prewarmed its visible roster of 8 guns, about 28 MB.
- **Applies when:** Any game that streams or swaps models the player sees.
- **Verify:** Throttle the network, then take every acquisition path and open every menu that shows a gun, stepping the recording at each swap: every frame shows the full model or the previous one.

### Reloads are choreographed beat by beat
- **Invariant:** Each reload is a sequence of named physical beats specific to its mechanism, readable at a glance, with each beat's time held in one data file that the animation and the sound both read, so every sound lands on its contact.
- **Technique:** Write a beat spec per mechanism (box magazine, belt, pan, tube, cylinder, energy cells) for empty and partial reloads. Export the timings, trigger each sound from the same table with a short swish before contact, and add a small sound for each part that moves. Make sure every reload state machine exits.
- **Reference configuration:** The owner on OC: "rn u can barely tell they are reloadin gbut we need lke a sick mag drop / mag out and then mag in and like slap the side of the gun", and later that a magnum should eject the shells inside it. OC's Ray Gun spec was latch, chamber opens, spent cells out, fresh cells in one at a time, snap shut, flicker on, with the timings exported so the audio synced per beat. Reload sounds had run 503 to 743 ms late (SMG bolt 503, rifle magazine 743, pump 649); afterwards they land within 12 ms of hand contact with a swish 110 ms before. OC's bow had an auto-reload cycle that never exited. The fidelity bar was "reload beats frame-for-frame" against the reference.
- **Applies when:** Every game with reloading weapons, and any tool with a multi-step use animation.
- **Verify:** Record a reload with sound, step it frame by frame, and check that each beat's sound starts within the game's tolerance of its contact frame, for every gun.

### Hands touch the gun and never pass through it
- **Invariant:** On every reload, empty and partial, in first and third person, the hands and the magazine touch the parts they hold without sinking into the gun, and the support hand stays on the gun.
- **Technique:** Author hand and magazine contact points on each gun model. Measure penetration depth per reload phase offline across every gun, flag every row above the threshold, and fix the worst first. A simple hand (a thumb and a mitten, see `opengame-characters`) makes the fit tractable. Measure third person too.
- **Reference configuration:** OC flags any phase deeper than 8 mm. It fitted 184 contact points over 56 guns; at launch 55 of 114 rows over 57 guns were still over 8 mm, the worst at 20 to 58 mm, and third person was never measured. The support hand stays 2 to 80 mm from the gun. The owner: "we cant have that on any fo the guns". Shotgun shell inserts needed new motion.
- **Applies when:** Games with visible hands on held items.
- **Verify:** Run the contact check over every gun and reload; it fails on any row over the threshold. Capture the worst three rows in play.

### Aiming goes through the visible sight
- **Invariant:** When aimed, the centre of the sight the player sees is on the crosshair, nothing covers the centre of the screen, lenses are clear, the gun stays upright, and the aim is calm and reversible mid-raise.
- **Technique:** Fit an eye point per gun from the sight mesh's world position, never from a mount socket. Ray-test the sight line through each optic. Ease aiming over the gun's own aim time and allow reversal partway. Draw reticles in a shader, visible only from the eye side, behind dark coated glass, with housings that never take camo. Build aim rotation from yaw and pitch so no roll creeps in. Where a true sight picture cannot look right, aim with the gun lowered and a slight zoom.
- **Reference configuration:** OC's aim used a socket 343 mm off the ring, a 31 px error. A glove covered 35.29% of the central box on one gun ("your glove completely blocks your ADS"); the fix took it to 0.04%. The sight is within 6 px of the crosshair at 1280 x 720 and 844 x 390 (achieved 0.5 to 2 px). Lenses on 4 rifles marked transparent blocked 385 of 385 rays. 19 of 61 guns had mesh within 0.15 m of the eye and 9 went through it. A 2 to 3 px red dot was unreadable; scope tubes need 48 or more sides; a 0.8 mm glowing torus bloomed into a seven-ring flower. Shortest-arc aim rotation rolled guns 25 to 30 degrees. Aim times run 0.19 s (pistol) to 0.48 s (LMG); the view model lens goes from 75 to 58.5 degrees. For the minigun the fallback was a lowered gun with a slight zoom, since CoD's version is hip-only.
- **Applies when:** Shooters with aim-down-sights.
- **Verify:** Aim every gun at desktop and phone sizes and capture: measure sight offset in pixels and the covered share of a central box, and ray-test every lens.

### Handling numbers come from the reference game
- **Invariant:** Rate of fire, aim time, swap time, draw time, recoil and spray follow the reference game for each gun, and damage is audited as time to kill across the run.
- **Technique:** Table every gun's handling against its reference. Use real fire rates, authored spray patterns, and recoil springs per class scaled per gun. Audit time to kill at early, middle and late rounds, and treat an outlier gun as a bug.
- **Reference configuration:** OC from World at War: aim 0.245 s in and 0.25 s out, swap 0.25 s, first draw from a machine 0.8 s, kick settling in 0.15 to 0.2 s, aimed kick at 30 to 40% of hip, muzzle flash 2 frames. Real fire rates (MG42 1,200 rpm, a revolver 120); one revolver had done 1,000 damage at 625 rpm. Spray: rounds 1 to 3 straight up, 4 to 10 along the gun's curve, 11 on flatter and wider. Per-gun recoil scale 0.55 to 1.8x of its class. Time to kill audited at rounds 1, 10, 20 and 30; upgraded automatics kill a round-30 zombie in 0.65 to 1.0 s of headshots. Spring and timing tables are in [references/handling-numbers.md](references/handling-numbers.md).
- **Applies when:** Shooters, above all those that imitate a known game.
- **Verify:** The handling table for every gun beside its reference values, and a time-to-kill run per gun at each audited round.

### Each weapon kills in its own way
- **Invariant:** The body's reaction to a kill matches the weapon: energy weapons drop bodies where they stand, shotguns and explosives throw them, and small arms push them a little.
- **Technique:** Choose the death response from the weapon that dealt the kill: a directional death clip, then a ragdoll with an impulse set per weapon class. Tag splash damage by what it is, so an energy splash is not treated as an explosion.
- **Reference configuration:** OC: energy kills rise under 0.15 m and travel under 0.6 m (the Ray Gun at most 0.005 m up and under 0.75 m of slide); a point-blank shotgun throws at 5 to 6 m/s with a sideways part, arm flail, 45 ms of hitstop and stronger shake; a pistol 1.7 m/s; an explosive 4 to 5 m/s out and 3.5 to 4.5 up. The directional death clip plays 0.16 to 0.42 s before the ragdoll. The owner: "ray guns hsouldnt make zombies fly", after the agents had logged "Ray Gun backflip" as a win because its splash was tagged explosive.
- **Applies when:** Games with several weapon types and visible deaths.
- **Verify:** Kill the same enemy type at the same range with each weapon class and record it; measure the root's rise and travel against the table.

### Every way to get a gun shows the same gun
- **Invariant:** A gun from the box, a wall, an upgrade, a pickup, the firing range or a menu preview matches the loadout version in model, scale, camo, optic, grip and angle.
- **Technique:** Route every acquisition through one path that applies the slot's camo and a compatible optic. Audit every gun in every view against every path; a debug grant does not prove a pickup path. Give the firing range every gun, attachment, camo and upgrade.
- **Reference configuration:** OC's sheet was 61 guns x hip, aimed and third person x base, upgraded and camo, 549 views, plus 152 acquisition cases. Wall guns fill 82% of their niche at no less than 1.5x held size. Pickup camo had reset to the default, and the Ray Gun was missing from the range preview twice. Wonder weapons come only from the box, which meant auditing all 11 code paths that write a weapon slot.
- **Applies when:** Games with more than one way to get a weapon.
- **Verify:** One contact sheet per round of every gun on every path, and a list of slot-writing code paths each with its capture.

### Camos and upgrades look like real materials and feel like an event
- **Invariant:** Menus and starting gear show the factory finish; every special finish reads as a real material on every gun and is cheap enough to keep; approved camos are never cut to save memory without asking; an upgrade is a staged moment with its own sound on every upgraded shot; ammo and status effects are seen in a capture before they count as done.
- **Technique:** Bake AO into every gun's material so finishes have something to sit on. Build finishes as material response (sheen by angle, a few clean bolts), not flat colour panels. Budget the held gun's shader cost. Stage the upgrade as a sequence: intake, charge, return, pickup, inspect, voice line.
- **Reference configuration:** OC: 58 of 60 guns lacked AO and camos read flat, so AO went into the packed material at cavity 0.2 to 0.4 with normals of at least 1024 px. A rejected rainbow camo kept returning to menus; gold read as "lumpy sparkly clay"; lightning camo became at most two clean forked bolts, visible about 2 of 3 frames; prism became a smooth sheen that changes with angle. An 11-octave camo cost 1.6 to 1.8 ms, 28% of a combat frame, and went to about 4 octaves against a 0.4 ms target. The owner: "do NOT cut down the sick camos we had to save memory". The upgrade looked "cheap" 3 times; the spec that followed opens with a knuckle crack before the staged sequence. OC's status effects were reported "Not checked in a capture".
- **Applies when:** Games with cosmetic finishes, upgrade stations or special ammo.
- **Verify:** Capture every gun with every finish under the game's own lights, measure the held gun's shader time, and capture an upgrade and an upgraded shot with sound.

### Wonder weapons feel special without breaking the frame or the mix
- **Invariant:** A wonder weapon is as finished as the best loadout gun, stays in its class's size band, is no louder than the other guns, and its effects stay inside the near-lens caps.
- **Technique:** Hold it to every rule above, then add character through shape, sound design and projectile, not through size, level or flash. A person listens to its sound before it ships.
- **Reference configuration:** OC's first loud Ray Gun fire sound was rejected as "too aggressive" and "distorted" (the loudness numbers are in `opengame-audio`), and the shipped Ray Gun's in-game peak of -7.4 dBFS stays within about 4 dB of the others. Projectile streaks are at least 56 px, and its hits stopped counting as explosions. Triangles stay at 20 to 25k like loadout guns, and camos had to work on it too.
- **Applies when:** Games with a signature or legendary weapon.
- **Verify:** Fire it beside a loadout gun at a wall 1 m away and at range: compare loudness, flash coverage and screen share, and have a person listen to both.

### Random rewards have written odds, a pity timer and a show
- **Invariant:** A random reward (a mystery box, a loot crate, a gacha pull) has written odds tuned against the reference game, a pity timer for its rarest reward, a visible rarity for every result, weights that keep the weakest results rare, and a reveal that is an event.
- **Technique:** Keep the weights in one table and compute the real odds of each result from it. Show rarity through colour, sound and light. Slow the reveal's ticks toward the result. Simulate many pulls and compare the results with the table.
- **Reference configuration:** OC: wonder weapon chance 3.4% per pull, guaranteed after 16 to 20 misses; rarity shown by beam colour (white, green, blue, purple, gold); crate weights tiered 12/8/5/4; the chance of the box leaving went to 10/20/30% from 15/30/50; the starter pistol's weight went from 12 to 4. Later tables gave the Ray Gun 1 in 56, then 2 of 446 (about 1 in 102), where World at War is about 1 in 20 to 25. The spin lasts 3.4 s (BO3 4.6 s), the offer 12 s, the move 8 s; ticks slow from about 16 a second to 3 with a music-box jingle. The box costs 950 points.
- **Applies when:** Games with randomised loot from a container, a drop table or a pull. OC's box is the reference here.
- **Verify:** Simulate ten thousand pulls from the shipped table and compare the counts with the intended odds, then play a pull and record the spin with sound.

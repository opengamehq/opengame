---
name: opengame-game-feel
description: Make a browser game feel responsive and weighty. Covers hit and kill feedback on the hit frame, hits on the player that read light or heavy, one game clock for hitstop and slow motion, camera sway that never moves the aim, third-person jitter, input that is never dropped, effects capped near the lens, springs, recoil, shake and the view model pass. Use when the person says it feels floaty, stiff or unresponsive, hits do not land, the camera or body jitters, effects freeze, or add juice.
metadata:
  version: "1.0.0"
---

# Game feel

Feel is a set of small, measurable responses attached to real events: the camera
answers a shot, the world answers a hit, the simulation pauses for a kill. Each one is
cheap, and each one has a way to go wrong that players feel before they can name it.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.
[helpers/spring.js](helpers/spring.js) holds the spring, trauma shake and hitstop; its
`selfTest()` plants the Euler spring this replaces and proves it is caught. Gun handling,
view model size, reloads and kill reactions per weapon are in `opengame-weapons`.

## Rules

### Find the layer that jitters before fixing anything
- **Invariant:** In a third-person or follow view, the character, the camera and the world move smoothly when running, walking, strafing, stopping and standing still, and when something jitters the team proves which of the three moves before changing any of them.
- **Technique:** Measure each layer on its own: camera position second difference, the body's screen position per frame, and changed pixels with the camera still. Simulate on a fixed step and interpolate the render. Ease the follow camera with an exponential, `1 - exp(-k * dt)`. Pull the spring arm in quickly on collision, hold the closest distance briefly, and let it out slowly. Gait clip choice and pose weights belong to `opengame-characters`.
- **Reference configuration:** OC "fixed" the camera and then the world before the owner said "the character/OGs body is the thing jittering". The cause was a gait clip picked from raw speed, and an 80 ms ease ended it, 3.5 days and 6 or more asks after the first report. The stop jump fell from 6.6 to 2.5 px and the strafe jump from 3.1 to 1.0 px. OC's spring arm pulls in over 25 to 75 ms and holds the closest distance for 0.3 s; a side collision had snapped it up to 1.15 m. Framing: over the shoulder 2.6 m back and 1.15 m right, wide 4.8 m back and 2.0 m right, aiming 2.2 m back, with the character's centroid at most 0.30 of the frame width from the left edge. An earlier OC session noted jitter "judged by looking at screenshots and low-frame-rate recordings ... Nobody ever measured it".
- **Applies when:** Every game with a follow camera. First-person games run the same camera checks on the view model.
- **Verify:** Record at the display rate while running, stopping, strafing along a wall and idling. Plot the body's screen position and the camera's second difference per frame; neither shows single-frame spikes, and an idle character's legs do not move.

### Hits on the player read light or heavy at a glance
- **Invariant:** A player who takes a hit knows how hard it was and where it came from on the next frame, the centre of the screen stays clear, and reduced motion keeps every cue while dropping the motion.
- **Technique:** Score severity per attacker and scale every response by it instead of firing one maximum response. Kick the view away from the attacker, never a random shake. Draw an edge arc toward the attacker and claw marks at the screen edge only. Add a heartbeat and desaturation as health falls. Run combat before the camera in the frame so the flinch is not a frame late.
- **Reference configuration:** OC passes a heavy hit when at least 6% of the screen changes by 25 or more levels within 0.1 s; an 80 ms flash was "too timid". Severity runs from 0.3 to 1.0 across the four enemy types; before that, every hit maxed out at about 28 damage on a 250 HP player. Edge arcs are 19 to 38 px at 1080p and fade over 0.7 to 0.9 s. Claws stay in the outer 18%, one per side, stack to three, tear in over 90 ms and dry to brown over 1.5 to 2 s. The low-health vignette stays in the outer 0.15 of the width at 35% opacity or less (it had covered 45% of the frame). Reduced motion caps hitstop at 40 ms and turns the kick off. OC's camera ran before combat, so the flinch landed a frame late.
- **Applies when:** Games where the player takes damage from directions.
- **Verify:** Take a light hit and a heavy hit from each side and capture the next six frames: the two read differently, each points at the attacker, and a centre box is unchanged.

### Hit and kill confirmation lands on the hit frame, once per enemy
- **Invariant:** The hit marker, confirm sound, enemy flinch and blood or sparks appear on the frame the hit resolves; hits, headshots and kills each have their own marker; each enemy shows one counting score pop; the crosshair never changes colour to report what it is over.
- **Technique:** Drive every confirmation from the resolved damage event. Keep one marker per hit type with its own lifetime, merge score pops per enemy into one counting number, and give flesh blood and metal sparks.
- **Reference configuration:** OC markers last 130, 165 and 240 ms for hit, headshot and kill, with a 500 ms headshot-kill marker, a cyan X for a hit and an off-white X for a kill. Score pops merge within 0.15 to 0.25 s in three rows 30 px apart. The enemy flinch peaks one frame after the hit and recovers in about 150 ms. Blood is 24 droplets at 2 to 5 m/s with a #5a1212 mist. The fire cue reaches a quarter of its peak within 3 ms. OC's crosshair had turned red whenever it was over the boss and was changed to never turn red.
- **Applies when:** Shooters, brawlers and any game where the player hits things.
- **Verify:** Fire a burst into one enemy and step the recording frame by frame: marker, sound and flinch share the hit frame, and one pop counts up.

### One game clock for hitstop and slow motion
- **Invariant:** Every timer that should slow with the game reads one time scale, hitstop and slow motion are measured in game time, effects keep moving through a hitstop, and a cinematic can switch hitstop off.
- **Technique:** Keep one clock object that hands out a scaled delta for the simulation and an unscaled delta for UI and anything meant to ignore slow motion, and make each subsystem choose one. Search the code for raw frame delta and frame counters in gameplay timers, effect emitters and physics steps. Slow actors and bosses by scaling their own delta, never by freezing them. Test every effect at a quarter speed.
- **Reference configuration:** OC's kill hitstop and melee holds ran on raw frame delta, so in slow motion they held runs of near-frozen frames, and the owner saw "frozen flips" in a film take after an audit had predicted the defect. A global hitstop froze the boss's clips and springs while targets kept moving, and the boss read as "jagged". A hitstop that held the effect clock froze shot flashes on screen ("why do the gun bullets and juice like just freeze"), which OC logged as a P0. The frame counts at quarter speed, and what each timer did under a capture step, are in `opengame-capture`.
- **Applies when:** Any game with hitstop, slow motion, kill cams or capture for trailers.
- **Verify:** Kill the same enemy at full speed and at 0.25x and record both: the hold lasts the same game time, effects and UI keep moving through it, and no effect strobes.

### Hitstop pauses the simulation, never the render
- **Invariant:** On a kill or a heavy hit, the simulation holds for a moment while rendering and input keep running, and repeated hitstops never stack into stutter.
- **Technique:** Return a reduced simulation step from a hitstop object (`createHitstop` in the helper) and render as normal. A freeze that ends mid-frame hands back the remainder. Rate-cap it, and keep it for heavy moments rather than every kill.
- **Reference configuration:** The ST starter holds 45 ms on a kill and 60 ms on a heavy hit; 30 to 60 ms is the useful range. None of DK, MC, AW or SR has hitstop, and each would gain from it. OC slowed play to 8% speed for 45 ms on a kill and 30 ms on a headshot, 100 ms on a downing blow and 40 to 60 ms on melee (an axe went from 75 to 60). Before a cap of once per 0.6 s it added up to 225 ms of freeze per second, which read as hitching, and OC ended with no hitstop on ordinary gun kills.
- **Applies when:** Melee, brawlers, shooters with kill beats. Not in precision platforming, where a pause eats an input window.
- **Verify:** Log simulated time and rendered frames through a kill: frames keep coming, simulated time stalls for the hold, and the mouse still turns the view. Kill a crowd in one burst and count the holds per second.

### Camera motion sells movement but never moves the aim
- **Invariant:** Sway, bob, flinch, landing jolts and FOV kicks make movement felt, while the shot always goes where the unshaken view points, aimed views stay calm, and the player can turn shake and blur down.
- **Technique:** Put sway and kick on a child of the aiming camera and cast shots from the parent. Kick the FOV per weapon class. Remove sway and bob while aiming. Blur the world with motion blur and keep the held weapon sharp. Offer an FOV slider and a shake setting.
- **Reference configuration:** OC: sprint sway 1.6 to 1.8 degrees per two steps, bob 0.4 to 0.8 degrees, walk 0.2 degrees; a heavy flinch of 3.9 degrees is back at rest in 0.12 s; the flinch spring is pitch 0.026, yaw 0.018, roll 0.055 rad at 7 Hz and damping 0.5. FOV kicks are 2.0 degrees for a shotgun, 2.4 for a launcher, 1.6 for a sniper and 0.2 for an SMG; landing jolts scale over 3 to 15 m/s of fall speed. Motion blur is on by default with the gun sharp, and the FOV slider runs 80 to 120. Sway and bob while aimed was "a big regression" in the owner's words.
- **Applies when:** First-person and over-the-shoulder shooters.
- **Verify:** Sprint and fire at a fixed target with sway on and then off; the spread on the target is the same. Aim and stand still; the view does not move.

### No input is ever dropped
- **Invariant:** Every press registers, the action starts on the frame of the input, a press made slightly early is buffered rather than lost, and releases are heard wherever the pointer is.
- **Technique:** Buffer jump and fire presses for a short window and replay them when they become legal. Let fire and reload run while sprinting. Listen for releases on the window, not the canvas, and handle cancel events so nothing stays pressed. Latch a held confirm key until it is released so it does not advance several menus. Request pointer lock inside the gesture that starts play.
- **Reference configuration:** OC buffers jump for 140 ms, so a press in the last 140 ms of a fall jumps on landing, and the air jump refills only on ground contact. Build placement lands on the click frame. The menu-click case, where releases outside the canvas were lost, is in `opengame-front-end`. A held Enter kept moving the owner through menus until it got a release latch.
- **Applies when:** Every game with real-time input.
- **Verify:** Record input and frames together: tap jump just before landing, release the mouse outside the window, hold Enter on a menu. Each press acts once, on the next frame.

### Effects near the lens are capped
- **Invariant:** No muzzle flash, explosion, glow or particle covers more than a small share of the frame or whites it out, however close to the camera it happens, and every shot shows a flash, a tracer, brass and an impact.
- **Technique:** Scale effects by distance to the camera, clamp HDR values before tonemapping, cull or fade particles near the lens, keep the flash short and warm, and draw tracers with a pixel floor so they never go sub-pixel.
- **Reference configuration:** OC: a wonder-weapon flash at HDR 10 within 1 m whited out the screen, and a 2.1 m crescent at 1.45 m filled 80% of the frame. The flash lasts 40 to 60 ms (two frames) and stays under 2% of the frame; the third-person flash is 1.9x (2.6x was too big); tracer cores are at least 3.2 px. One fix overshot the flash to 42% of its size, read as "hard to see", and settled at two thirds.
- **Applies when:** Games with flashes, explosions or bright effects near the player.
- **Verify:** Trigger each effect at 1, 3 and 10 m from the camera and count the pixels above 0.95; the share stays under the game's cap at every distance.

### Springs that cannot explode
- **Invariant:** Every spring-driven camera or view-model motion settles to rest at any frame time the game can produce, and lands in the same place at any frame rate.
- **Technique:** Solve the critically damped spring in closed form (`spring` in the helper) instead of integrating it step by step. Frame-rate independent easing toward a target uses `damp`, an exponential, never a fixed fraction per frame.
- **Reference configuration:** DK's recoil spring at omega 22, integrated explicitly, went unstable below about 44 fps and spun the camera. The helper's self-test shows a semi-implicit Euler spring at the same omega exploding at a 50 ms frame and drifting between 30 and 150 fps.
- **Applies when:** Any spring, follow camera, sway or smoothing.
- **Verify:** `springProperties(spring)` returns no failures, and the game survives a frame time pinned at its own clamp during heavy recoil.

### Recoil returns to the aim
- **Invariant:** After firing stops, the view returns to where the player was aiming, not to where recoil left it.
- **Technique:** Recoil is its own spring per axis, added on top of the aim and never written into it. Clamp each axis and drop the velocity into the clamp so the view does not bounce off the limit.
- **Reference configuration:** DK: omega 22 pitch, 20 yaw, 17 roll; clamps 0.11, 0.07, 0.09 rad. SR recoils the weapon only, with `exp(-24t) * cos(21t)` over 0.28 s, and shakes nothing. OC's per-class recoil springs are in `opengame-weapons`.
- **Applies when:** Shooters and any game with a kicking weapon or tool.
- **Verify:** Fire a burst at a fixed mark, stop, and wait half a second: the reticle is back on the mark.

### Shake is trauma squared, and it decays
- **Invariant:** Camera shake scales with how hard the event was, fades on its own, and never fights the player's aim.
- **Technique:** Events add trauma between zero and one; trauma decays linearly; the shake is trauma squared driving a few detuned sines per axis. Most of it is removed while aiming. Pick shake or weapon-only recoil for the game, not both.
- **Reference configuration:** DK: three sines per axis at 30 Hz, amplitudes 0.038 yaw, 0.032 pitch, 0.024 roll rad, decaying 1.6 per second; a shot adds 0.08, a heavy shot 0.22, a landing up to 0.35, an explosion up to 0.5; 25% kept while aiming. OC shakes for explosions out to 3.5 times their radius and has a shake setting.
- **Applies when:** Action games with impacts. Puzzle and calm games usually want none.
- **Verify:** After the largest event in the game, the view is still within a second.

### Bob follows the feet
- **Invariant:** Head bob and footsteps match distance travelled, so they keep pace with the feet at any speed and stop when the player stops.
- **Technique:** Advance a bob phase by distance walked over stride length, not by time, and fire footstep sounds on that phase.
- **Reference configuration:** DK: stride 1.35 m walking, 1.65 m sprinting, 0.95 m crouched; a 2:1 Lissajous at amplitude 0.042, cut by 86% while aiming. OC removes bob entirely while aiming.
- **Applies when:** First-person games on foot. Third-person games drive the same timing from the animation instead.
- **Verify:** Walk into a wall holding forward: the bob and the footsteps stop.

### The field of view answers speed
- **Invariant:** Speed is felt through the lens: sprinting and sliding widen the view, and it eases back faster than it widened.
- **Technique:** A held FOV kick eased with `damp`, a faster rate out than in, plus a short punch on entering a slide or dash.
- **Reference configuration:** DK: +9 degrees sprinting, in at rate 5.5 and out at 9; +6 sliding plus a 5 degree punch. SR widens 7 degrees with descent speed.
- **Applies when:** First-person and chase-camera games with speed changes.
- **Verify:** Record FOV per frame through a sprint start and stop; both are smooth curves with no step.

### The view model is its own pass
- **Invariant:** The player's weapon or hands render at a fixed lens with their own depth and light, never clipping into walls and never smeared by world effects.
- **Technique:** A separate camera and pass for the view model, after every depth-consuming world pass, at a fixed field of view and a tiny near plane, with its own small light rig and environment on its own layer. The three.js setup is in `opengame-weapons`.
- **Reference configuration:** DK: a 75 degree lens, near 0.012, a key of 1.34 and a cool rim of 0.44 on the view-model layer; the world's near plane moved out to 0.15 for a three times depth-precision gain. OC: world FOV 85 (65 to 110 on the slider), view model 75 degrees at near 0.012, pulling to 58.5 degrees when aimed; its studio environment gave 41% of the gun's brightness and the two directional lights about 3 luma.
- **Applies when:** First-person games with a visible weapon or tool.
- **Verify:** Press the view model into a wall and sweep the FOV slider; the weapon neither clips nor changes size.

### Every surface answers a hit
- **Invariant:** An impact looks and sounds like the material it hit, and its mark outlasts its dust.
- **Technique:** A per-surface table (dust, chips, sparks, decal colour and size, sound family, light flash) looked up by the hit surface. Decals live in a fixed ring so the oldest goes first.
- **Reference configuration:** DK: metal throws 9 sparks and concrete none, a 0.35 light flash on metal, a ring of 64 decals oriented to the surface, holes living 40 s and fading over their last fifth.
- **Applies when:** Any game where things are hit.
- **Verify:** Shoot or strike each surface type once and capture the next second; each reads differently.

### One complete feedback set per action, and input never waits
- **Invariant:** Each player action has anticipation, impact, sound, camera response and a trace that lingers, all driven by the resolved outcome, and no animation ever delays the input that started it.
- **Technique:** Drive hit, shield-break and kill feedback from resolved damage events, not from the attack button. Stack a kill on several channels: marker, protected sound, score popup, a voice or callout. Start the action on the input frame and let presentation catch up.
- **Reference configuration:** MC and AW stack kill confirmation on four channels. ST's craft defaults: never delay input for an animation, and keep a stable cue for reduced motion.
- **Applies when:** Every game.
- **Verify:** Measure input to first visible response with a frame recording; it is the next frame. Kill something and list every channel that answered.

## More numbers

Muzzle flashes, explosions scaled by radius, loot that lands, third-person camera values
from SR and OC, and OC's player-damage and confirmation tables are in
[references/feel-numbers.md](references/feel-numbers.md).

> Carried from `opengame-game-feel` 1.1.0. Read it when: Make a browser game feel responsive and weighty. Covers hit and kill feedback on the hit frame, hits on the player, one game clock, a camera that is the mouse, a held weapon that rides the camera, killcams that replay what happened, input never dropped and proved with real events, motion judged on film, effects capped near the lens, springs, recoil and shake. Use when it feels floaty, stiff, laggy or jittery, hits do not land, the gun shakes, killcams look wrong, effects freeze, or add juice.


# Game feel

Feel is a set of small, measurable responses attached to real events: the camera
answers a shot, the world answers a hit, the simulation pauses for a kill. Each one is
cheap, and each one has a way to go wrong that players feel before they can name it.
Most of them live in motion and timing, which a still frame cannot show: OS's still
panels sat at 3 to 4 for about 135 builds while its owner's notes were about shake,
pacing and killcams, and LC's owner felt a 55 ms camera ease as a slow mouse.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes.
[helpers/spring.js](helpers/spring.js) holds the spring, trauma shake and hitstop; its
`selfTest()` plants the Euler spring this replaces and proves it is caught. Gun handling,
view model size, reloads and kill reactions per weapon are in `opengame-weapons`. Killcam
recording is in [references/killcam.md](references/killcam.md), and the numbers from our
games, LC's chest camera among them, are in
[references/feel-numbers.md](references/feel-numbers.md).

## Rules

### Find the layer that jitters before fixing anything
- **Invariant:** In a third-person or follow view, the character, the camera and the world move smoothly when running, walking, strafing, stopping and standing still, and when something jitters the team proves which of the three moves before changing any of them.
- **Technique:** Measure each layer on its own: camera position second difference, the body's screen position per frame, and changed pixels with the camera still. Simulate on a fixed step and interpolate the render. Ease the follow camera with an exponential, `1 - exp(-k * dt)`. Pull the spring arm in quickly on collision, hold the closest distance briefly, and let it out slowly. Gait clip choice and pose weights belong to `opengame-characters`.
- **Reference configuration:** OC "fixed" the camera and then the world before the owner said "the character/OGs body is the thing jittering". The cause was a gait clip picked from raw speed, and an 80 ms ease ended it, 3.5 days and 6 or more asks after the first report. The stop jump fell from 6.6 to 2.5 px and the strafe jump from 3.1 to 1.0 px. OC's spring arm pulls in over 25 to 75 ms and holds the closest distance for 0.3 s; a side collision had snapped it up to 1.15 m. Framing: over the shoulder 2.6 m back and 1.15 m right, wide 4.8 m back and 2.0 m right, aiming 2.2 m back, with the character's centroid at most 0.30 of the frame width from the left edge. An earlier OC session noted jitter "judged by looking at screenshots and low-frame-rate recordings ... Nobody ever measured it".
- **Applies when:** Every game with a follow camera. First-person games run the same checks on the held weapon (below).
- **Verify:** Record at the display rate while running, stopping, strafing along a wall and idling. Plot the body's screen position and the camera's second difference per frame; neither shows single-frame spikes, and an idle character's legs do not move.

### A held weapon rides the camera and keeps only millimetres of its own motion
- **Invariant:** A held weapon or tool is still when the player is still, moves only for a cause the player made, and never jumps, twitches or shakes at any frame rate.
- **Technique:** Hang the weapon rig from the lens so it takes all of the camera's own breath, bob and lean, and give the weapon only millimetres of sway of its own. Integrate oscillator phase per frame, never `sin(time * rate)` with a changing rate. In a headless test at several frame rates plus an injected long frame, classify every frame's jolt by its cause and drive the uncaused count to zero; then add designed motion back on purpose (a turn trail, a strafe cant, a stop dip), with a fraction of it on the sights. Motion vectors and same-frame posing for the render side are in `opengame-weapons`.
- **Reference configuration:** LC's owner: "the guns jitter and shake so much when u move or run in diff directions and even like bounce up and down when ur just standing still?..." Its rig hung from the bare aim while the lens pitched, yawed and rolled with breath and stride, on top of the weapon's own 2 cm stride, eases written as a share per frame and hard clamps. After: own motion of 3.5 x 4 mm a stride (long arms 9 x 10) and 0.5 mm of breath; muzzle travel at 720p standing from 3 x 9 px to 0.5 x 1.6, walking 20 x 20 to 4.6 x 3.9, sprinting 68 x 57 to 9.9 x 9.8 (worst frame 1.8 px); uncaused jolts from 1,917 to 233 in 88,372 frames; jolts on a mouse turn in 67 of 108 frames to 0 to 2. Then, at the owner's ask ("as u move aroundin the concept art ur gun changes angle too"), a turn trail of 0.028 rad per rad/s (at most 7.5 degrees), a 5 degree strafe cant and a 2 degree stop dip, a fifth of each on the sights. OS's still-hold numbers are in `opengame-weapons`.
- **Applies when:** First-person games with a held weapon or tool.
- **Verify:** The muzzle's per-frame pixel track standing, walking and sprinting at 30, 60 and 144 fps with a hitch; the uncaused count is zero.

### The camera is the mouse, one to one, in the frame the input arrives
- **Invariant:** The same mouse travel turns the view by the same angle at any frame rate, the picture is never more than one frame behind the input, and any lag or trail lives in the held weapon, never in the camera.
- **Technique:** Apply look input to the camera in the frame it is read, with no ease. Put trails on the weapon. Show sensitivity in physical units (distance per full turn at a stated mouse resolution) with a live tester. Where aim assist slows one device, decide the device by recent motion so a resting stick never slows the mouse, and never let assist turn a still view. Measure the age of the picture the player sees, not the frame rate.
- **Reference configuration:** LC: 1,428 counts turn 180.00 degrees at 60, 30, 15 and 8 fps. The camera had trailed the mouse by a 55 ms ease (4.3 degrees, two to three frames late at a turn's end), which the owner felt as low sensitivity ("my mouse sntivity/how hard it is to turn is correlated with fps and perf it seem s"); 0.0022 rad a count is 9.1 cm per 360 at 800 cpi at 1.00x. A resting stick had flipped the device every frame and slowed the mouse with aim help. Beside a screen recorder sharing the GPU, mouse to photon was 65 to 140 ms. OS ran cancels on elapsed time "so 20 fps and 144 fps decide a press the same way".
- **Applies when:** Every mouse-aimed game.
- **Verify:** Throttle the page to 30, 15 and 8 fps and turn by a fixed count of real input: the angle is identical and the picture is one frame old.

### Hits on the player read light or heavy at a glance
- **Invariant:** A player who takes a hit knows how hard it was and where it came from on the next frame, the centre of the screen stays clear, and reduced motion keeps every cue while dropping the motion.
- **Technique:** Score severity per attacker and scale every response by it instead of firing one maximum response. Kick the view away from the attacker, never a random shake, through a critically damped spring. Draw an edge arc toward the attacker and claw marks at the screen edge only. Add a heartbeat and desaturation as health falls. Run combat before the camera in the frame so the flinch is not a frame late.
- **Reference configuration:** OC passes a heavy hit when at least 6% of the screen changes by 25 or more levels within 0.1 s; an 80 ms flash was "too timid". Severity runs from 0.3 to 1.0 across the four enemy types; before that, every hit maxed out at about 28 damage on a 250 HP player. Edge arcs are 19 to 38 px at 1080p and fade over 0.7 to 0.9 s. Claws stay in the outer 18%, one per side, stack to three, tear in over 90 ms and dry to brown over 1.5 to 2 s. The low-health vignette stays in the outer 0.15 of the width at 35% opacity or less (it had covered 45% of the frame). Reduced motion caps hitstop at 40 ms and turns the kick off. OC's camera ran before combat, so the flinch landed a frame late. LC's blow kick had stayed unsettled at 11.09 degrees after 53 frames; stepped exactly, it settles from 4.14 degrees by frame 11.
- **Applies when:** Games where the player takes damage from directions.
- **Verify:** Take a light hit and a heavy hit from each side and capture the next six frames: the two read differently, each points at the attacker, and a centre box is unchanged.

### Hit and kill confirmation lands on the hit frame, once per enemy
- **Invariant:** The hit marker, confirm sound, enemy flinch and blood or sparks appear on the frame the hit resolves and only for damage that was scored; hits, headshots and kills each have their own marker; each enemy shows one counting score pop; the crosshair never changes colour to report what it is over.
- **Technique:** Drive every confirmation from the one resolved damage event, never from the button or a second calculation in the HUD. Keep one marker per hit type with its own lifetime, merge score pops per enemy into one counting number, and give flesh blood and metal sparks.
- **Reference configuration:** OC markers last 130, 165 and 240 ms for hit, headshot and kill, with a 500 ms headshot-kill marker, a cyan X for a hit and an off-white X for a kill. Score pops merge within 0.15 to 0.25 s in three rows 30 px apart. The enemy flinch peaks one frame after the hit and recovers in about 150 ms. Blood is 24 droplets at 2 to 5 m/s with a #5a1212 mist. The fire cue reaches a quarter of its peak within 3 ms. OC's crosshair had turned red whenever it was over the boss and was changed to never turn red. OS's owner: "im also getting too many hitmarkers... when i shoudlnt be", fixed by firing markers only on scored damage.
- **Applies when:** Shooters, brawlers and any game where the player hits things.
- **Verify:** Fire a burst into one enemy and step the recording frame by frame: marker, sound and flinch share the hit frame, and one pop counts up.

### One game clock for hitstop and slow motion, and wall time for the interface
- **Invariant:** Every timer that should slow with the game reads one time scale, hitstop and slow motion are measured in game time, effects keep moving through a hitstop, a cinematic can switch hitstop off, and menus, countdowns, input arming and logged durations run on real elapsed time.
- **Technique:** Keep one clock object that hands out a scaled delta for the simulation and an unscaled delta for UI and anything meant to ignore slow motion, and make each subsystem choose one. Search the code for raw frame delta and frame counters in gameplay timers, effect emitters and physics steps. Slow actors and bosses by scaling their own delta, never by freezing them. Run interface animations, countdowns and input gates on wall time with a capped step, never on the simulation's clamped delta, and time a rule on the same clock it is spaced on. Test every effect at a quarter speed.
- **Reference configuration:** OC's kill hitstop and melee holds ran on raw frame delta, so in slow motion they held runs of near-frozen frames, and the owner saw "frozen flips" in a film take after an audit had predicted the defect. A global hitstop froze the boss's clips and springs while targets kept moving, and the boss read as "jagged". A hitstop that held the effect clock froze shot flashes on screen ("why do the gun bullets and juice like just freeze"), which OC logged as a P0. OS found six bugs from a 50 ms delta clamp on its interface: a 180 ms wipe that took about 2 s, clicks unarmed for 1.7 s at 3 fps and a title that ignored presses for about 7 s; a countdown on clamped game time ran about twice as long on slow machines; bot jams spaced on match time but timed on frame time lasted 90 s, not 30. The interface side is in `opengame-front-end`, and the frame counts at quarter speed are in `opengame-capture`.
- **Applies when:** Any game with hitstop, slow motion, kill cams, capture for trailers, or a delta clamp.
- **Verify:** Kill the same enemy at full speed and at 0.25x and record both: the hold lasts the same game time, effects and UI keep moving through it, and no effect strobes. Under a 4x CPU throttle, wipes and countdowns match a stopwatch.

### Hitstop pauses the simulation, never the render
- **Invariant:** On a kill or a heavy hit, the simulation holds for a moment while rendering and input keep running, and repeated hitstops never stack into stutter.
- **Technique:** Return a reduced simulation step from a hitstop object (`createHitstop` in the helper) and render as normal. A freeze that ends mid-frame hands back the remainder. Rate-cap it, and keep it for heavy moments rather than every kill.
- **Reference configuration:** The ST starter holds 45 ms on a kill and 60 ms on a heavy hit; 30 to 60 ms is the useful range. None of DK, MC, AW or SR has hitstop, and each would gain from it. OC slowed play to 8% speed for 45 ms on a kill and 30 ms on a headshot, 100 ms on a downing blow and 40 to 60 ms on melee (an axe went from 75 to 60). Before a cap of once per 0.6 s it added up to 225 ms of freeze per second, which read as hitching, and OC ended with no hitstop on ordinary gun kills. OH, a rhythm game, uses none.
- **Applies when:** Melee, brawlers, shooters with kill beats. Not in precision platforming or timing games, where a pause eats an input window or moves the next note.
- **Verify:** Log simulated time and rendered frames through a kill: frames keep coming, simulated time stalls for the hold, and the mouse still turns the view. Kill a crowd in one burst and count the holds per second.

### Camera motion sells movement but never moves the aim
- **Invariant:** Sway, bob, flinch, landing jolts and FOV kicks make movement felt, while the shot always goes where the unshaken view points, aimed views stay calm, and the player can turn shake and blur down.
- **Technique:** Put sway and kick on a child of the aiming camera and cast shots from the parent. Kick the FOV per weapon class. Remove sway and bob while aiming. Blur the world with motion blur and keep the held weapon sharp. Offer an FOV slider and a shake setting. In third person, let the drawn body trail the aim through a spring while hits stay on the simulation.
- **Reference configuration:** OC: sprint sway 1.6 to 1.8 degrees per two steps, bob 0.4 to 0.8 degrees, walk 0.2 degrees; a heavy flinch of 3.9 degrees is back at rest in 0.12 s; the flinch spring is pitch 0.026, yaw 0.018, roll 0.055 rad at 7 Hz and damping 0.5. FOV kicks are 2.0 degrees for a shotgun, 2.4 for a launcher, 1.6 for a sniper and 0.2 for an SMG; landing jolts scale over 3 to 15 m/s of fall speed. Motion blur is on by default with the gun sharp, and the FOV slider runs 80 to 120. Sway and bob while aimed was "a big regression" in the owner's words. LC's landing sinks the lens by impact speed (8 cm standing, about 11 sprinting), and its aim assist never turns a still view. OS's drawn bodies trail aim through a 0.06 s spring capped at 0.6 rad.
- **Applies when:** First-person and over-the-shoulder shooters.
- **Verify:** Sprint and fire at a fixed target with sway on and then off; the spread on the target is the same. Aim and stand still; the view does not move.

### No input is ever dropped
- **Invariant:** Every press registers, the action starts on the frame of the input, a press made slightly early is buffered rather than lost, nothing locks the player out after a landing, releases are heard wherever the pointer is, and work held at a station is never lost to another action.
- **Technique:** Buffer jump and fire presses for a short window and replay them when they become legal, and add no lockout after landing. Let fire and reload run while sprinting, and let firing run during a held station action without resetting its progress. Listen for releases on the window, not the canvas, and handle cancel events so nothing stays pressed. Latch a held confirm key until it is released so it does not advance several menus. Request pointer lock inside the gesture that starts play and never request a held lock again. Inside OpenGame's frame the page owns fullscreen: call `og.fullscreen.request()` from a click, never `requestFullscreen` (`opengame-sdk`); elsewhere, ask for fullscreen only after the lock lands.
- **Reference configuration:** OC buffers jump for 140 ms, so a press in the last 140 ms of a fall jumps on landing, and the air jump refills only on ground contact. Build placement lands on the click frame. A held Enter kept moving the owner through menus until it got a release latch; the menu-click case is in `opengame-front-end`. LC buffers 0.1 s with no landing lockout after "where is there a pause after u alnd after a jump before u can jump again?", and after "u should be able to shoot while cranking generators and that shouldnt stop/reset the generator progress" firing no longer cancels a crank. OS: "and again i said get rid of this weird spawn in shit wher eu dont spawn in and it says click to take control!"; fullscreen had spent the gesture, and "lock+fullscreen both hold in that order, every other order loses the lock"; a second lock request dropped the lock in 1 of 7 tours.
- **Applies when:** Every game with real-time input.
- **Verify:** Record input and frames together: tap jump just before landing, release the mouse outside the window, hold Enter on a menu, fire during a station action, and start play with one real click. Each press acts once, on the next frame, and the lock holds.

### Timing is proved with real input events
- **Invariant:** Every timing claim (a press acting, a shot landing during a raise, a buffered jump, a note judged) is proved with real input events on the page the player loads, and every press is judged at its own event time, not the frame it was read in.
- **Technique:** Drive benches with real key and mouse events at fixed delays after a trigger, and count outcomes per dozen. Stamp each press with its event timestamp and judge it against the game's clock. Scripted page calls grant user activation, so pointer lock and autoplay refusals never happen in them: begin at least one run with a real press on the real page. Leave the feel to the owner's hands once the bench passes, and never report a bench as feel.
- **Reference configuration:** OS's scope bench went from 0 to 2 of 12 hits to 12 of 12 from 100 ms, and passed while the owner still saw "a weird frame". OH stamped keys with their own event time: real presses landed at +1 ms mean, p95 under 5 ms, with no misses under stalls (`opengame-rhythm`). LC: "None of my 34 earlier spawns was begun by a real press", a headless "23 of 23" pointer-lock pass came from the test tool's own activation, and no button on the lobby's panel answered a real press until the director pressed one.
- **Applies when:** Every game with real-time input, and every report that says a timing works.
- **Verify:** A bench table per action at fixed delays from real input, and one run begun by a real press on the page the player loads.

### Motion is judged on film, at a quarter speed and at full speed
- **Invariant:** Anything defined by motion or timing (holds, reloads, recoil, flinches, deaths, killcams, aiming, transitions, shake) is accepted only from recordings stepped frame by frame and then watched at speed in the player's own picture, never from stills.
- **Technique:** Record every drawn frame on the game's clock and play it at a quarter speed beside a sheet of consecutive frames, then watch the whole act at full speed, as the player sees it. Film enemies from the side as well as from the lens. Mask screen-fixed overlays out of any score. Say in the report when nobody has watched a film at speed. Capture methods are in `opengame-capture`.
- **Reference configuration:** LC accepted motion only from quarter-speed video: side-lens films showed library falls were stunt breakfalls, and a leap that looked right from beside went under the bottom of the picture from the lens. Its owner asked to "inspect things at each frame with super harsh critics eye", yet its leads made 72 reload films and watched none at speed, while the owner judged the whole act at speed in the player's own picture, not a fingertip at one frame, as its director put it. OS's still panels sat at 3 to 4 for about 135 builds, and still judges polished a bullet cam the owner had banned. OH counted a change only at 1:1 or in consecutive frames.
- **Applies when:** Anything that moves.
- **Verify:** A sheet per motion with named faults or "none" read at full size, and a note of who watched it at speed.

### Killcams replay recorded truth at normal speed
- **Invariant:** A killcam shows the killer's real weapon, finish, attachments, field of view, moves, hit markers and sounds, and the whole action from its start, at normal speed; only a final killcam slows, around the deciding shot.
- **Technique:** Record the state of every rendered frame (camera, view model pose, scope state, the weapon and finish in hand) plus rival animation and an event ring, in a ring sized by time that reaches back to the start of the action, such as the last hip frame before a scope-in. Snapshot identity with an explicit unset value, since zero is a valid finish. Replay the recorded transforms each frame and never smooth or resample them. Play sound as a tape of the live one-shots at their own pitch. A killcam the owner turns off by default keeps its logic and its tests.
- **Reference configuration:** OS: "normal killcams shoudl be normal killcams not slow mo or follow the bullet shit just normal cod style killcams...", which reversed a bullet cam that judges and research had wanted; then "it even change dthe fucking gun that i had? and no hitmarkers" and "final killcams dont show the full ads / scope in and out etc anymore". It had resampled at 30 to 60 Hz and taken the field of view from the live rifle. A fixed 4.0 s lead opened hardscopes already scoped; a ring of 2,048 frames at up to 120 a second covers 17 s at any refresh rate and reaches back 8 s. Slow-motion rivals stood or jumped on 26 of 86 frames until the renderer took each frame's recorded transform (0 of 56). Killcams took about 11 days and seven rebuilds. Partway through, the owner turned ordinary killcams off by default ("by default lets NOT show killcams") with the logic kept, and the later rebuilds were the recording and the final killcam.
- **Applies when:** Any killcam, replay, spectator view or death recap.
- **Verify:** Change loadout after a kill: the replay keeps the old gun. Diff a replayed kill with a flip against the live capture at 60 and 144 Hz.

### The final killcam keeps its pace and hands back control in one frame
- **Invariant:** The final killcam plays the last seconds at normal speed, slows around the deciding shot, returns to normal speed, holds, then shows the scoreboard and the winner without a button; the victim stays in view, no frame is black, and leaving any replay lands the player alive with a full HUD on one frame.
- **Technique:** Keep the beat sheet as data keyed to the kill time and paced on wall time, and end the replay only after the settle. Ray-test the replay camera's view of the victim. Route every exit (the end, a skip, the menu) through one transaction that picks the life, writes the spawn and clears the view on the same frame. Stand the bots down after the final kill so the replay records nothing new.
- **Reference configuration:** OS's owner: "then last ckill has a lead up o f slow mo and after shot too just all fucking smooth ... then ramp back to normal speed then stya there for a sec and then show the scoreboard and then winner scene", and "like a 1/10 and needs to get to 9.5/10 compared to a mw2 final klilcam clip". Its replay had been "complete immediately on the first post-shot frame", and "a tree trunk fills the scope and the victim never appears". After: VICTORY for 2.3 s over the held game, the killer's eyes, an ease to 0.25x from 0.95 s before the shot to 0.22 s before, 1x by 1.1 s after, the scoreboard, the winner, shown only when the local player wins; no black frame in 848. Skip broke 5 times in 4 days. Critics without the reference clip scored it 8.4 to 9.4 while the owner called it 1 of 10.
- **Applies when:** Shooters with an end-of-match replay.
- **Verify:** Capture from the final kill to results with a beat timeline and adjacent-frame checks; skip with real keys on every exit, and check that the first frame after is live.

### Effects near the lens are capped
- **Invariant:** No muzzle flash, explosion, fire, glow or particle covers more than a small share of the frame or whites it out, however close to the camera it happens, and every shot shows a flash, a tracer, brass and an impact.
- **Technique:** Scale effects by distance to the camera, clamp HDR values before tonemapping, cull or fade particles near the lens, keep the flash short and warm, and draw tracers with a pixel floor so they never go sub-pixel. Build near fire from many small tongues rather than a few large cards. Raise a sprite's brightness by multiplying, never by adding, so its quad stays dark.
- **Reference configuration:** OC: a wonder-weapon flash at HDR 10 within 1 m whited out the screen, and a 2.1 m crescent at 1.45 m filled 80% of the frame. The flash lasts 40 to 60 ms (two frames) and stays under 2% of the frame; the third-person flash is 1.9x (2.6x was too big); tracer cores are at least 3.2 px. One fix overshot the flash to 42% of its size, read as "hard to see", and settled at two thirds. LC's near fire keeps nothing within 0.3 to 0.75 m of the eye and no sprite wider than 0.22 rad (about an eighth of the frame), caps bloom at 4 before halation, and drops the muzzle flash on a flamethrower, which strobed the zombies white ten times a second; its brass went dull after "three fat white cylinders glowing in a dark hall".
- **Applies when:** Games with flashes, explosions, fire or bright effects near the player.
- **Verify:** Trigger each effect at 1, 3 and 10 m from the camera and count the pixels above 0.95; the share stays under the game's cap at every distance.

### Springs and eases that cannot explode or ring
- **Invariant:** Every spring, follow, lurch and return settles to rest at any frame time the game can produce, lands in the same place at any frame rate, never rings, never moves a fixed share of the distance per frame, and never hard-clamps.
- **Technique:** Solve the critically damped spring in closed form (`spring` in the helper) instead of integrating it step by step. Frame-rate independent easing toward a target uses `damp`, an exponential, never a fixed fraction per frame. Turn any target jump over a threshold into a timed, eased travel. Test at uneven frame lengths, not one fixed step, and again after ten minutes of play.
- **Reference configuration:** DK's recoil spring at omega 22, integrated explicitly, went unstable below about 44 fps and spun the camera. The helper's self-test shows a semi-implicit Euler spring at the same omega exploding at a 50 ms frame and drifting between 30 and 150 fps. LC's exact step, `x' = (x + (v + r x) h) e^(-r h)`, is "the same at 30 and 120 frames a second and cannot ring": its hit kick went from 11.09 degrees unsettled after 53 frames to 4.14 settled by frame 11, and target jumps over 8 cm became 0.25 s travels (a hand's worst step from 385 to 11.7 mm). A zombie gait change tested at one fixed frame length broke in the browser, with 28 gait changes in 16 s.
- **Applies when:** Any spring, follow camera, sway, procedural motion or smoothing.
- **Verify:** `springProperties(spring)` returns no failures, and the same scripted motion at 30, 60 and 144 fps with a 100 ms hitch gives curves that overlay.

### Recoil returns to the aim
- **Invariant:** After firing stops, the view returns to where the player was aiming, not to where recoil left it.
- **Technique:** Recoil is its own spring per axis, added on top of the aim and never written into it. Clamp each axis and drop the velocity into the clamp so the view does not bounce off the limit.
- **Reference configuration:** DK: omega 22 pitch, 20 yaw, 17 roll; clamps 0.11, 0.07, 0.09 rad. SR recoils the weapon only, with `exp(-24t) * cos(21t)` over 0.28 s, and shakes nothing. OC's per-class recoil springs and LC's mass-driven recoil are in `opengame-weapons`.
- **Applies when:** Shooters and any game with a kicking weapon or tool.
- **Verify:** Fire a burst at a fixed mark, stop, and wait half a second: the reticle is back on the mark.

### Shake is trauma squared, and it decays
- **Invariant:** Camera shake scales with how hard the event was, fades on its own, and never fights the player's aim.
- **Technique:** Events add trauma between zero and one; trauma decays linearly; the shake is trauma squared driving a few detuned sines per axis. Most of it is removed while aiming. Pick shake or weapon-only recoil for the game, not both, and write the choice into every critic's brief.
- **Reference configuration:** DK: three sines per axis at 30 Hz, amplitudes 0.038 yaw, 0.032 pitch, 0.024 roll rad, decaying 1.6 per second; a shot adds 0.08, a heavy shot 0.22, a landing up to 0.35, an explosion up to 0.5; 25% kept while aiming. OC shakes for explosions out to 3.5 times their radius and has a shake setting. OH's owner wanted no shake at all ("the background is hsaking so much and not looking aaa at all"), and its judges kept recommending "a 6 px shake that decays over 150 ms" until the rule reached their rubric.
- **Applies when:** Action games with impacts. Puzzle, calm and music-synced games usually want none.
- **Verify:** After the largest event in the game, the view is still within a second.

### Bob follows the feet
- **Invariant:** Head bob and footsteps match distance travelled, so they keep pace with the feet at any speed and stop when the player stops.
- **Technique:** Advance a bob phase by distance walked over stride length, not by time, and fire footstep sounds on that phase.
- **Reference configuration:** DK: stride 1.35 m walking, 1.65 m sprinting, 0.95 m crouched; a 2:1 Lissajous at amplitude 0.042, cut by 86% while aiming. OC removes bob entirely while aiming. LC's bob cusp at each footfall was one of its causes of gun jitter; ease through the footfall.
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
- **Technique:** A separate camera and pass for the view model, after every depth-consuming world pass, at a fixed field of view and a tiny near plane, with its own small light rig and environment on its own layer. The three.js setup, its motion vectors and same-frame posing are in `opengame-weapons`.
- **Reference configuration:** DK: a 75 degree lens, near 0.012, a key of 1.34 and a cool rim of 0.44 on the view-model layer; the world's near plane moved out to 0.15 for a three times depth-precision gain. OC: world FOV 85 (65 to 110 on the slider), view model 75 degrees at near 0.012, pulling to 58.5 degrees when aimed; its studio environment gave 41% of the gun's brightness and the two directional lights about 3 luma. OS fixed its view model lens at 68 degrees so a FOV slider from 65 to 120 moves the gun under 0.8%.
- **Applies when:** First-person games with a visible weapon or tool.
- **Verify:** Press the view model into a wall and sweep the FOV slider; the weapon neither clips nor changes size.

### Every surface answers a hit
- **Invariant:** An impact looks and sounds like the material it hit, and its mark outlasts its dust.
- **Technique:** A per-surface table (dust, chips, sparks, decal colour and size, sound family, light flash) looked up by the hit surface. Decals live in a fixed ring so the oldest goes first.
- **Reference configuration:** DK: metal throws 9 sparks and concrete none, a 0.35 light flash on metal, a ring of 64 decals oriented to the surface, holes living 40 s and fading over their last fifth.
- **Applies when:** Any game where things are hit.
- **Verify:** Shoot or strike each surface type once and capture the next second; each reads differently.

### One complete feedback set per action, and the big moment is rare
- **Invariant:** Each player action has anticipation, impact, sound, camera response and a trace that lingers, all driven by the resolved outcome; no animation ever delays the input that started it; and a full-screen effect is rare, timed and decided in one place.
- **Technique:** Drive hit, shield-break and kill feedback from resolved damage events, not from the attack button. Stack a kill on several channels: marker, protected sound, score popup, a voice or callout. Start the action on the input frame and let presentation catch up. Let systems only ask for a big effect, and have one tested function decide whether it fires, so it neither repeats like a clock nor never comes.
- **Reference configuration:** MC and AW stack kill confirmation on four channels. ST's craft defaults: never delay input for an animation, and keep a stable cue for reduced motion. OH answers each hit within a fifth of a second (a splat of 0.12 s, a halo of 0.1 s) and fires its full-screen hit about once a phrase, on a run of 8, a milestone or the first second of its power mode; earlier gates fired "like a clock every 2.4 s", then never in 35 s, then at a combo of 2.
- **Applies when:** Every game.
- **Verify:** Measure input to first visible response with a frame recording; it is the next frame. Kill something and list every channel that answered. Log the big effect's firings over a long run.

## More numbers

Muzzle flashes, explosions scaled by radius, loot that lands, third-person camera values
from SR and OC, OC's player-damage and confirmation tables, and LC's chest-camera feel
(placement, recoil, jumps, input) are in [references/feel-numbers.md](references/feel-numbers.md).

# Filmable: making any game shoot like a film set

A trailer or montage at the bar is not screen-recorded. It is **shot**: the game is frozen, forked into a
capture-only film build, driven frame by frame by a script, and rendered offline at the master resolution with an
exact clock. Slow motion is then real, cameras are exact, the HUD is whatever the shot needs, and a take reshoots in
about a minute. OG Clash did this to a C/WebAssembly WebGPU game in about three hours on day one (a capture probe in
31 minutes, the film build in 1 h 50 min and the rig in 64 minutes, in parallel). OG Clash's raw gameplay montage reused
the rig on a newer build in about an hour, and the OG Snipers montage had its film build and rig ready in 2 h 14 min.

`opengame-capture` holds the rules for the hooks themselves, inside the game: one host-stepped clock, one time scale,
seeds, a director camera with a cut, a clean feed, a ready state, frame-addressed requests, a probe, stepped audio,
readback, and hooks kept out of public builds. If you own the game, build them in. This chapter is the film side: what
to find out, how to fork, how to drive the capture, how to turn takes into selects, and what went wrong.

## 0. Study the game first (parallel, read-only, about 20-30 minutes)

Before planning any shot, write two documents with research agents, every claim backed by a file and line:

- **`research/GAME.md`, the game bible for a director:** the pitch in the game's own words; the core loop end to end
  with every set piece's timing; every weapon, ability and upgrade path; characters, enemies, boss phases; which voice
  lines ship as audio and which are subtitle-only; the map with a coordinate convention and its ten most cinematic
  places; lighting and time of day; the game's own cinematic cameras (their distances and fields of view are free
  starting points); brand assets (logo lockup, key art, palette, fonts, logo sounds); and **known risks that would hurt
  footage** (crashes, stuck AI, bad animations, stand-in models, build text on screen, developer shortcuts that skip
  set pieces).
- **`research/CAPTURE.md`, the capability map:** the checklist below, answered for this game, plus one short real probe.

Mine the developers' own history: playtest verdicts, rejected looks, critical comments in code ("this optic looks
terrible"), acceptance ledgers, existing recorders, camera presets and capture specs. It is the cheapest source of
"what looks bad", and it usually has half a rig already.

**Reading the source over-promises.** OG Clash's research listed flips, dances and the victory pose as "would look
good on camera"; the on-frame audit graded nearly all of them NO. Plan nothing around an animation, behaviour or effect
until it has been **seen on rendered frames**. NOT REPRODUCED means not plannable.

## 1. The capability checklist (settle every line before writing shots)

| # | Capability | What to establish |
|---|---|---|
| C1 | Frozen build | exactly which build players get; its hash; whether you can rebuild it privately and how long that takes |
| C2 | Command bridge | how to set game state from outside at run time and per frame (console, variables, URL parameters, developer switches, a debug socket) |
| C3 | Deterministic clock | whether each rendered frame can advance game time by exactly 1/60 s regardless of wall time |
| C4 | Time scale | whole-world slow motion with exact output frames; ramps inside a take |
| C5 | Fixed-rate traps | every fixed-timestep system without interpolation, frame-count throttles, per-frame emitters, time-quantised flicker, the motion-blur shutter, and **hitstop, hit-pause and freeze-frame timers on raw time** |
| C6 | Free camera | position, look, field of view and roll per frame; a hard cut that resets temporal history (TAA, motion vectors) |
| C7 | HUD mask | all, none, or per element (hit markers, pops, crosshair, points), subtitles, set-piece letterbox, debug and frame-rate overlays |
| C8 | Staging | spawn enemies at set points, times, types and gaits; hold spawns; place, aim, fire and emote friendlies; boss phase and attack; give weapons, upgrades, finishes; a skilled aim helper |
| C9 | Per-frame probe | where every actor, joint and weak point is on each frame, to aim cameras and verify payoffs. **Check it against rendered frames on day one** (OG Clash's boss joints were 10-13 m off the drawn model) |
| C10 | Quality lock | native internal resolution, the top preset locked (not calibrating), dynamic resolution off, LODs settled, accessibility "reduce flashing / shake" set to full strength |
| C11 | Readback and encode | exact-frame pixels at speed, colour-correct (BT.709) |
| C12 | Audio | engine audio captured at the simulation rate (re-aligned in the edit) or rebuilt from the game's own files; in-game music and voice muted at capture |
| C13 | Repeatability | whether takes repeat bit for bit, and which systems seed from the wall clock (weather, sky, lightning, voice picks) |
| C14 | Robustness | crash classes, safe take length, retries, watchdogs |
| C15 | Animation audit | which character and enemy clips survive a trailer frame |
| C16 | Hero tableaux | seated, celebration and idle poses worth filming, and whether they can run in gameplay |
| C17 | World switches | time of day, weather, phase skies, set-piece triggers, hiding markers and telegraphs |
| C18 | Boot gates | press-to-start, install cards, audio unlock, focus or pointer-lock pause, service workers, required headers |
| C19 | Prior art | the developers' recorders, camera presets, capture specs, QA ledgers |

Write each blocker as a **film-build hook to add, off by default**.

## 2. Freeze the build, fork a film build

- **Freeze** a named, hashed build of the game and clone its release and source (a copy-on-write clone if your file
  system has one). The game keeps shipping past it; the film never blocks the game. Tell the game team so in writing.
- **Play the frozen build before planning on it.** OG Clash's "stable" build receipt said its runtime was untested, and
  it had two crash classes.
- **The film build** is a private copy of the frozen source with capture-only hooks behind flags in their own namespace.
  **Every default equals the frozen build,** proven with a parity frame (the PSNR of the film build's frame against
  the frozen build's, within the frozen build's own run-to-run variance).
- **Decide with the owner up front** whether the film may show improved but unshipped visuals. OG Clash started with
  "camera, capture and staging only, never change the look" and ended rewriting its lightning (later the game's
  default), gore scale, crate paint and a boss eye. That was right, but it should be a stated policy: every look change
  behind a named flag with A/B evidence, routed back to the game team as a patch.
- **One owner** merges and deploys the film build; others send patches from private clones. Deploys are atomic (stage,
  then rename), named by hash, the previous binary kept for rollback, with a hooks-file section and a defaults A/B frame
  per deploy and an announcement line in the progress log. Selects record the build hash.
- **Write film fixes so the game can adopt them:** no globals, sizes relative to resolution, bounded pools with overflow
  counters, tested at gameplay frame rates and full load. The game team had to harden OG Clash's lightning patch before
  shipping it as their default.
- **Shader and data cooks:** a code build may not recompile shaders or recook assets. Check the cooked asset contains
  the change.

### The hook catalogue to ask for (any engine)

1. **HUD mask** per element, no subtitles, no set-piece letterbox. Hit markers and pops project from the player's camera,
   so they only line up on first-person shots.
2. **Stage camera:** position, look, field of view, roll and near plane per frame; a **cut** that resets temporal history
   and zeroes that frame's motion blur (without it a camera jump smears the whole frame); a **body** switch that draws
   the third-person body and world weapon under a free camera instead of a floating first-person arm.
3. **Slow-motion-safe simulation:** ragdolls and fixed-rate systems stepped on frame time; **no hitstop** (zero hit-pause
   and freeze-frame juice) for shooters; short animations re-timed to span the slow window. Fighting and action games
   keep their hitstop and re-time it instead (`opengame-montage-plan` explains).
4. **Shutter:** motion blur proportional to the step (blur = frame rate × step) for a constant 180° look.
5. **Depth of field:** usually usable, not premium; off by default, never on the subject.
6. **Staging** of friendlies and NPCs: keep, pose, target, fire (visual only), emote, sit, flip.
7. **Cinematic aim assist:** two cascaded critically damped springs (ω = 2.5 / aim time), a sticky target, the target's
   angular rate fed forward, the head low-passed over 25 ms, so first person looks like a skilled human.
8. **Voice seed** (repeatable voice picks; set it at least 2 s before the take starts, under load).
9. **Per-frame probe:** player, camera, every enemy with its head, corpses, squad, boss joints and weak points, the state
   of interactive objects.
10. **Time scale** (simulation only) as a fallback; the stepped clock is the real slow motion.
11. **World:** time of day and its sun bearing, weather and sky seeds, lightning triggers, and a switch that keeps the
    victory in gameplay so your camera owns the ending (the OG Clash victory cinematic took the camera and deleted the
    enemies; the hook to own the ending took about 5.5 hours).
12. **Look flags as needed:** hide markers and telegraphs, solid pickups, pin the first-person character, gore scale,
    steady held lights, a temporal-history cut on every mesh swap.
13. **Audio:** no in-game music, no voice (engine effects only), separate stems if the engine allows.

## 3. The deterministic stepped capture

Real-time capture cannot hold 4K60 on a game (OG Clash ran 25-31 fps at 4K on its top preset) and changes outcomes
(screenshot calls delay inputs). A page screenshot costs about 2.5 s per 4K frame and a screencast drops frames.
Instead:

1. **Serve the build yourself** (web games): cross-origin isolation headers (COOP and COEP, or the game silently falls
   back to one thread), Range requests, compressed assets, broken asset paths remapped, and **the clock shim prepended
   to whatever script runs the game loop**, often a Worker (a page-level clock does not reach workers).
2. **Boot in real time** to a known state (the title), send boot commands, start, wait for "playing", stage at real-time
   seconds, then **settle** while streaming finishes (top LODs, hero models: wait for the hero model before rolling).
3. **Arm:** switch the engine's clock (`performance.now` and `requestAnimationFrame` in a browser) to a virtual clock.
4. **Preroll** some stepped, unrecorded frames at frame 0's camera so temporal anti-aliasing, LODs and streaming
   settle. Set expensive toggles (seeds, poses, depth of field) in the stage or the preroll, never on a recorded frame.
   **Spawn staged enemies in the stepped preroll:** real-time commands under load drop or collapse into one frame.
5. **Per output frame:** read the directive for this frame from the shot spec (step, commands, input, camera); inject
   commands into the engine's own queue for this frame; advance the virtual clock by the step; run one engine frame (if
   the engine refused, for example a busy GPU slot, retry the same time); convert to BT.709 limited-range YUV on the GPU;
   read back; encode; drain exactly sample rate × step samples of audio; write the frame's metadata (camera, probe,
   signature) off the critical path, every frame (batching it cost 17 %).
6. **Conform:** a lossless remux with BT.709 tags; check the decoded frame count, the rate, the colour tags, duplicate
   signatures and clock skips; make a 1080p proxy; copy the master to the archive and verify the checksum, falling back
   to a local folder when the archive is missing.

**Numbers from OG Clash:** 17-37 captured frames per second at 4K on a quiet laptop GPU (2.1-3.5 s of wall time per
output second) plus 45-75 s of overhead per take; another GPU browser halved it; two parallel takes cost 8 %. For dark
skies, capture HEVC at 300 Mbps (shadow banding 14.5 % of blocks against 51.3 % for H.264 at 160 Mbps); that is about
2.25 GB per output minute. Supersampling at 1.5x cost 3.4x the time for no visible gain except on short slow hero shots.

**Slow motion:** a step of 1/240 s per output frame is 0.25x with perfect 60 fps output; ramps change the step per frame
(smoothstep in log-speed). Check with the engine's own logged clock and the motion on frames.

**Takes are performances.** Two runs of the same OG Clash shot shared 0 of 240 frame signatures, because sky, rain and
lightning seeded from the wall clock while the camera and input were exact. Seed or freeze ambient events if retakes
must match, shoot several takes and pick by measured payoffs. A deterministic seed can even land a "random" event where
you want it (25 forced lightning strikes in the stage made the take's own strike hit the boss's helm).

## 4. Per engine

Check every API name against the engine version in hand.

| Engine | Clock and offline render | Slow motion | Camera and cuts | HUD | Notes |
|---|---|---|---|---|---|
| Unity | `Time.captureDeltaTime = 1/60` (or `captureFramerate`) advances game time a fixed amount per rendered frame; the Recorder package writes sequences or movies under it; HDRP accumulation gives sub-frame motion blur | `captureDeltaTime = 1/240`; keep `fixedDeltaTime` small, Rigidbody interpolation on | Cinemachine or Timeline; reset TAA and motion vectors on cuts (Cinemachine cut events, HDRP history reset) | a canvas per element behind a capture flag | `Time.unscaledDeltaTime` and `realtimeSinceStartup` users (UI tweens, hitstops) will not slow down, and an Animator on an unscaled update mode will not either; audio under capture stepping is unreliable, so rebuild it from the game's files |
| Unreal | Movie Render Queue or Movie Render Graph renders Sequencer at a fixed rate with warm-up frames, temporal sub-samples (motion blur) and spatial samples | global time dilation; Chaos substepping; check real-time timers | CineCameraActor in Sequencer (filmback, focal length, aperture); Sequencer camera cuts reset history | `showhud`, widget visibility; screen percentage 100, dynamic resolution off | for gameplay, record with Take Recorder and re-render through the render queue, or use a fixed frame rate or benchmark mode |
| Godot 4 | `--fixed-fps 60 --write-movie out.png` (Movie Maker) renders at a fixed rate regardless of real time, audio in sync | `Engine.time_scale`; physics ticks and interpolation | Camera3D with CameraAttributes; AnimationPlayer, Path3D | a CanvasLayer per element | check 2D and 3D interpolation support per version |
| three.js, Babylon, custom WebGL or WebGPU | own the loop: no `setAnimationLoop`; call render with a virtual time; feed a fixed dt to `AnimationMixer.update`, physics and shader time uniforms | a smaller dt per frame | your own camera; reset TAA history on cuts | DOM or a flag | shim `requestAnimationFrame` and `performance.now` if the app reads them; read back with `readPixels` (WebGL) or `copyTextureToBuffer` and `mapAsync` (WebGPU); encode with WebCodecs and do the RGB to YUV conversion with the BT.709 matrix yourself (WebCodecs tags frames BT.601); refuse software renderers (SwiftShader, llvmpipe) |
| Browser WebAssembly (Emscripten, Unity WebGL, custom) | find where the loop runs (main thread or Worker), every clock it reads (`performance.now`, `Date.now`, imports), whether pool workers read time, whether a frame pacer refuses short frames; shim all of them | a smaller step | engine commands per frame through its own queue; sync on log lines | engine flags | serve with COOP and COEP; block service workers; skip press, install and audio gates with URL parameters or synthetic events; pointer lock can be faked; gamepads can be spoofed |
| Bevy and native custom engines | add a capture mode: a fixed step per frame, render offscreen, read back, pipe raw frames to ffmpeg or encode in-process | a smaller fixed step | your camera system and a history reset | a resource flag | usually the easiest: you own the loop |
| 2D (Phaser, Pixi, canvas, pixel art) | the same loop ownership; record at an integer multiple of the art's native resolution | a smaller dt; check tweens that run on real time | whole-pixel camera positions (no sub-pixel shimmer) | DOM or a scene flag | upscale with nearest-neighbour; no rotation or non-integer zoom on pixel art unless the game does it |
| Mobile builds | prefer the editor or a desktop build with the mobile content for offline capture; a device recording (Xcode, `adb screenrecord`, then crop) only for "real phone" proof shots | engine-side | as the engine | as the engine | store preview rules: the archetypes chapter of `opengame-trailer-plan` |
| Closed build, no source | drive input from a recorded stream at a locked frame rate, capture at the highest constant rate, use photo mode, replay or spectator if the game has them | optical-flow retiming only as a last resort, and say so | the game's photo or replay camera | in-game options | say plainly what the limits are; lean harder on editing, music, sound and type |

## 5. Shot specs as code: takes, selects, the edit

- **A shot is a module** (for example `capture/shots/<id>.mjs`): `{id, build, size, boot, start, stage[{at, cmd}],
  settle, preroll, frames, step(f), frame(f, ctx) -> {cmds, cam{pos, look, fov, roll, cut}, input, hud}}`, where `ctx`
  is the simulation time and the probe's entities. Specs read music positions from `grid.json` (bar n, beat k), never
  compute frames from BPM.
- **Handles:** record 30 frames either side; take frame = timeline frame − slot start + 30. Script payoffs to ±1 frame
  and outcomes to ±3, then **measure** them from the probe (bodies down, boss gone, a luma jump).
- **First-to-third-person pairs** are one take with an in-take camera cut and a HUD switch on the same frame.
- **Draft at 720p,** test the riskiest shots on proxies, then shoot the master format only for the take you expect to
  select. Never judge at draft size what must be judged at the master: drafts hid mannequin-looking enemies and cheap
  bloom on OG Clash. Delete rejected masters when disk is tight; specs reshoot in about a minute.
- **Takes** live in `capture/takes/<id>/tNN/` with a proxy, `frames.jsonl` (camera and probe per frame), a QA file, a
  summary (capture rate, load at arm) and a copy of the spec.
- **Selects** (`capture/selects/<shot>.json`) are the contract with the edit: take, proxy, take in and out, timeline in
  and out, payoffs (timeline frame, take frame, what) with measured evidence, build hash, notes, a self-review (checks
  PASS or FAIL, what is great, what is weak, what another hour would buy) and the previous select. Store paths relative
  to the project. Back up selects before bulk edits so a revert is one line.
- **Persist every environment override a take depends on** in the spec or the select (OG Clash lost a take because its
  variant lived only in a shell).
- **Shared primitives** (grid lookup, monotone cubic camera paths, a critically damped follower, log-speed ramps, the
  payoff speed cycle, a shutter helper, HUD bits, the boot switches, the weapon and finish tables) are owned by the
  director; builders import them and never fork them.

## 6. The animation audit (before planning any character or enemy shot)

- When the owner or the developers have already called an animation bad, assume it is: measure it, then stage only
  clips that pass.
- Audit weapons, sights and finishes too: every one the plan shows, on frames, aimed down sights included.
- One spec per clip: a flattering three-quarter front camera, mid and wide, at 1x and 0.25x, HUD off.
- A contact sheet per clip: 8 spaced frames and 6 consecutive cropped frames (plus a slow-motion strip for enemies).
- Measure: root and head second-difference RMS (jitter, in mm per frame squared), motion energy over a crop, the share
  of puppet arms (arms locked straighter than 155° with hands above the chest), foot slide, rise linearity (R²).
- A verdict per clip: **USABLE, WITH CAMERA CARE (and the exact framing), NO, or NOT REPRODUCED.**
- Staging rules from the OG Clash audits (reuse them unless your game proves better):
  - motion with intent, never idle; an armed character at most 30 % of frame height, a squad firing at most 20 %, a
    seated character at most 45 %;
  - faces three-quarter or profile; no backs of heads; over-the-shoulder only where the head and back do not fill the
    frame;
  - a low lens (0.3-1.0 m) looking up at heroes;
  - slow motion on what characters cause (muzzle flash, tracers, debris, enemies), not on weak bodies;
  - enemies rising out of the ground at 11 m or more, at most 14 % of frame height, at least 6 bodies, staggered in time
    and depth (one row standing up together reads as a chorus line), or none;
  - cut before arrival jostle, before corpses settle, before a sprint stop snaps;
  - never let an enemy stand in frame; never hold a T-pose;
  - hide the feet of crowd AI (navigation and IK glitches live there).
- Scout lanes first: props block AI and the player ("walking in place" was a blocked controller).

## 7. What cost OG Clash a round

| Symptom | Cause | Fix |
|---|---|---|
| every asset 404s, endless loading | broken relative links in the release | serve with path remaps |
| silent single-threaded fallback | missing COOP and COEP headers | send them |
| low-quality takes | the renderer's auto profile, dynamic quality | force the top preset after the title; check the log says it is fixed |
| BT.601 colour | WebCodecs given RGB frames | convert to BT.709 NV12 on the GPU |
| banding in dark skies | H.264 at 160 Mbps | HEVC at 300 Mbps |
| a full-frame smear on a camera jump | temporal history carried across | the cut hook |
| ghostly see-through pickups | TAA on fast mesh swaps | cut history on every swap frame |
| ragdolls stepping every 4th frame in slow motion | fixed 60 Hz physics, no interpolation | step on frame time |
| a flip freezes while the camera moves | a 70 ms hitstop on raw time is 12 frames at 0.25x | no-hitstop flag; re-time the animation |
| aim drift dies in slow spans | an aim spring in simulation time | per-frame view steering in output frames |
| a floating gun under a free camera | the first-person arm | the body hook |
| music baked into every take | in-game music on | mute at capture; verify by loudness |
| silent guns early in a run | sound banks still loading | grant each weapon once in the preroll, then wait |
| the first recorded frame smeared | the camera sent on frame 0 | set it in the preroll |
| a documented camera position inside a wall | the research doc was wrong | verify every coordinate on frames |
| a scripted run aborts under load | the engine's deadline after the last command | append a far-future no-op |
| a sky change missing | the build did not recook shaders | cook, then verify the cooked asset |
| the revive greys the whole frame | a game state effect | do not use it, or add a hook |
| a held prop never visible | a first-frame visibility bug | fix it with a hook |
| two agents' work in one commit | a deploy script that commits the whole tree | one owner, patches |
| debug overlays in a shot | frame counters, page badges, "reload with sound", build text | turn every overlay off; check the build's defaults |
| capture drops from 120 to 2-5 fps within 30 s | macOS background-priority throttling of the browser | run the capture tree at normal priority (`taskpolicy -B` on macOS) |

## 8. Audio at capture

- Mute in-game music and voice; keep engine effects. Capture at the simulation rate (slow-motion takes are short in
  audio) and map each frame to its samples in the frame log; the edit re-aligns real-time sound to the payoff.
- Inventory every game sound file before buying or generating sound: duration, loudness, true peak, phone-band share
  (300 Hz-5 kHz), sub share, a key estimate against the track's key, organised by beat of the film with the code that
  triggers it. Pick game audio; never pitch-shift it. `opengame-audio` covers how a game's own sound should be built.

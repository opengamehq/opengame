# Capturing a montage: tiers, film-build hooks, and shooting without source

Check the route with the capability checklist C1-C19 in the filmable chapter first. Then pick a tier, and say its limits
in the plan before anything is shot.

## 1. The tiers

| Tier | The game has | Shoot with |
|---|---|---|
| A | source or a film build, a stepped clock, a free camera | the default stepped capture (the filmable chapter); OG Snipers |
| B | deterministic input replay | record a human live, re-run the input in A's rig, verify per-frame state hashes |
| C | a replay or demo with a free camera, no source | play live, shoot each moment in passes (as played, outside, the receiver's side), render offline if possible |
| D | a replay without a free camera, or photo mode only | the game's own cameras plus live capture at a high frame rate |
| E | live play only | high-frame-rate lossless capture; a slow-motion budget of capture fps ÷ 60; events mined from the feed; no second angle |
| F | no GPU, or a software renderer only | stop and say so |

- **Check replay slow motion on frames before planning ramps on it.** Most replays store snapshots and interpolate
  between them: gliding limbs and missing particles at 0.1x. If it interpolates, use it only down to 0.5x. Version-lock
  replays (some stop loading after a game patch): capture each the day it is recorded, or freeze the build.
- **Decide the master resolution before the first select.** Every OG Snipers take was captured at 1080p, so its 4K60
  delivery was an upscale; the seeded 4K re-shoot route was proven on day one and never used.
- **Tiers B-E have no film build,** so staging, seeds and probes become recorded human play, replay passes and event
  mining. At C and D slow motion is only as fine as the replay re-simulates (interpolated replays to 0.5x); at D and E it
  is capped at capture fps ÷ 60; at E there is no second angle, so plan a lower cinematic share.

## 2. Film-build hooks (tier A)

`opengame-capture` lists the in-game rules for each hook; the filmable chapter has the general catalogue. What a
montage needs, from OG Snipers:

- **The minimum:** a frozen build with byte-identical parity (every switch off equals shipped); a per-frame command bridge
  with a far keepalive (the engine quit 10 s after its last command); a stepped clock with any step and a slow floor of
  0.05x or lower; HUD per element and event filters (a hero-only feed); a stage camera with a cut that resets temporal
  history, and attach spaces; a per-frame probe of the player, the camera, every actor, every payoff event (receiver,
  cause, zone) and audio cues; **a deterministic seed over every random generator** (the hook that paid off most:
  inserts, re-shoots and two-pass lenses all depend on it); opponent staging (place, act, path, loadout, name, health or
  pace); a renderer check that refuses software rendering.
- **What paid off:** drawing every body in sync every frame under slow motion (the hero's residual jitter went from 32-60
  px to 0.2-0.4 px); an aim trim inside the game's rules; death and ragdoll controls (speed, variety, no pops, dropped
  props as objects); **drawn body points and a camera look-at** (they came on day 3 and should come on day 1, after two
  guessed framings failed); penetration and scene-ray queries; overlay switches; a hero avatar swap for outside shots;
  payoff events on their own frame; prop landing events; a shutter in game time.
- **What did not pay:** an outside kill-cam hook (written, never run); a film-only damage rule without the owner's yes
  (built, never used); a small hand prop for the ending (it took builds 4 to 45 before it read on camera); a backdrop fix that did not cure a
  flicker (the clip moved to another map instead).
- **Traps:** a field added to a struct that is serialised into a cooked scene made the loader drop it, and two builds
  never started a match (put film switches on run-time structs); staging switches acted on a change of value, so send a
  reset 6 frames before; one replay per page load; a camera that follows the probe lags a frame (use attach spaces); the
  world replays under a seed but a closed-loop scripted hand does not (re-shoots replay the recorded input open loop).
- **On day one, also expose:** the drawn points of whatever the engine animates worst (a skeleton, wheels, board pieces,
  units), the payoff point, the line of the attack, ground height and a camera look-at.
- **Probe translations by genre:** racing has poses, wheel contacts, collisions, position changes and laps; fighting has
  hitboxes, hit events with damage and frame advantage, and the KO frame; sports has the ball, players and score events;
  strategy has units, deaths and buildings; rhythm has judgements and combo; VR has head and hand poses, grab and hit
  events.
- **Reaction controls by genre:** ragdoll for shooters, crash for racing, KO for fighting, and a hitstop multiplier
  wherever hitstop exists.
- **One shared clock library** with a unit test against the engine's own time: a clock-sum off-by-one between the payoff
  solver and the engine failed one take three times.

## 3. Shooting without source

### A replay or demo system (tiers C and D)

1. **Play live, shoot later.** Play, or have players play, normally (real human feel, no bot tells), recording every
   replay. Index events from the replay data, or from a pass that reads the kill feed or score pops.
2. **Shoot each moment as several passes:** the as-played view, then outside cameras (the clip's cinematic), then the
   receiver's side. That is "show it twice" for free.
3. **Check replay fidelity on frames before planning.** Replays are often low-rate state snapshots; checkpoints can hold
   actors from different frames. Look for gliding limbs, missing particles, frozen cloth, popping ragdolls and missing
   sound.
4. **Check replay slow motion.** If it interpolates, use it only to 0.5x. If the replay re-simulates from inputs, slow
   motion can be real. Measure the duplicate-frame share and ragdoll stepping on a test clip.
5. **Render offline if you can** (some replay tools render through ffmpeg; Unreal can re-render a replay through Movie
   Render Queue). If the replay only plays in real time, record at the highest stable frame rate, play at 0.25x and
   record, then conform.
6. **Version-lock replays,** and capture each the day it is recorded.
7. **Design the speed curve before rendering,** then render the replay through it so slow spans have real frames.

### Live play only (tier E)

1. Record everything, lossless or near-lossless, at the highest constant frame rate the machine holds; game audio on its
   own track, in-game music muted.
2. The slow-motion budget is capture fps ÷ 60: at 240 fps, 0.25x is clean. Below that, optical-flow retiming is the last
   resort; say so to the owner and ask.
3. No second angle exists. The show-it-twice layer has to come from staged private matches with a spectator, a photo
   mode, the kill cam, or a separately built cinematic. If none exists, lean on transitions caused by the HUD and the
   weapon (scope irises, tint flashes), and accept a lower cinematic share. Report it as a known limit.
4. Mine footage at scale with an event detector on the kill feed or score pops (template matching), then pick by hand.
5. Fake camera moves only as slow 5-10 % pushes on 4K captures, never upscaled beyond 1.25x.

### Deterministic input replay (tier B, the best case without a film build)

Record a human performance once, live, then re-run it as often as needed with a stepped clock, a free camera and any time
scale. Fighting games with rollback netcode, speedrun tools, many rhythm games and any engine where you own the loop can
do this.

1. Record input against frame numbers, not wall-clock timestamps.
2. Input replay reproduces state only if the simulation is a pure function of state and input: seed every random
   generator, fix the timestep, remove wall-clock reads (weather, sky and voice seeds on the wall clock are the usual
   offenders).
3. **Verify per frame:** hash the player's and key entities' state every frame on the live run and on the replay. The
   first frame they differ is where determinism broke.
4. If determinism cannot be fixed, fall back to state recording: write every relevant transform and animation state per
   frame during live play and replay it as a puppet for camera passes. Physics and particles then need re-simulation or
   are approximate.
5. Slow motion through the stepped clock changes nothing in the outcome, because inputs are keyed to simulation frames.
   Hitstop timers on raw time are the trap.
6. Human feel stays human because a human played it. Scripted input still needs the bot-tell checks.

### No free camera

Use every camera the game ships (photo mode, spectator, kill cam, death cam, replay TV cameras, the menu character
viewer, cutscene cameras); look for mods and console variables; if you have source, add a stage camera with a cut that
resets temporal history (usually an afternoon). Without any of these, gameplay carries the film: transitions come from
objects in the gameplay frame, slow pushes on 4K only, a lower cinematic share said out loud, and no faked third person
made of motion graphics.

### 2D only

Capture at native resolution and upscale by an integer factor with nearest-neighbour; whole-pixel camera positions. The
cinematic layer is scale and time: integer zoom steps or in-engine zoom, slow motion through the stepped clock, the event
replayed at 2x or 4x zoom on the consequence; parallax layers pulled apart for depth moves. Keep the art's own animation
frames in slow motion (a 12 fps walk at 0.25x shows each drawing for 20 output frames; never interpolate drawings), and
snap sprites to the pixel grid at every step. Text in the world uses the game's pixel font on its grid. Screen shake and
palette flashes are the game's own grammar: keep them where they mark the event.

### No characters

The hero is the system's visible agent (a cursor, a piece, a ball, a vehicle, a structure). The money event is the
cascade; the receiver's side is the consequence up close. Macro lenses and slow orbits do the cinematic work, and depth of
field is safer here than anywhere. Repetition is the risk: vary scale and colour per section.

## 4. Take checks before a take is offered

A take is offered only after the checks that need no GPU (about 20 s): payoffs on grid frames; no dead time; only the
high-skill form of the core action; opponents moving; HUD and feed names right; cause before effect; the cinematic's
receiver matching the payoff; smoothness on every frame. And the rig's own checks: frame count, duplicate signatures,
clock skips, the quality preset, and every payoff the spec asked for actually happened.

**Preflight offline before a take takes a slot.** Every way the scripted run can fail, checked without a GPU. On OG
Snipes each of these lost real takes: lines of fire, thin cover, shields, lobby bots, pace marks on another payoff's line,
clock sums. Racing: the line, AI pace, contacts. Fighting: inputs against frame data.

**Clock-easing traps:** changing the clock moves where an action lands (an eased clock after a hop lost a kill); at 0.3x
one simulation frame spans 3.3 output frames, so a key may be unreachable; a payoff cinematic under 28 frames cannot fit
the V ramp. Check every take's speed log: fail any one-frame change over 15 % on a cinematic and any run of 20 or more
frames at constant speed after a payoff.

**The master format:** capture at it, or keep every select seeded and re-shoot it at the master size, verified (frame
count, speed curve, payoff frames, receivers, the camera within 0.15 m and 4 % field of view) before the master.

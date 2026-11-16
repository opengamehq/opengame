> Carried from `opengame-trailer-make` 1.0.0. Read it when: Build a game trailer from its plan in any engine. Covers a capture-only film build, frame-stepped capture with real slow-motion ramps, audits before shooting, shots as code with measured payoffs, fixing cheap effects at the source, a 3D title in the world, then edit, grade, mix, render and QA of review cuts and the master, with a team that survives session deaths. Use when a plan from opengame-trailer-plan is ready and it is time to shoot and cut the trailer.


# Trailer make

Step 2 of 3: `opengame-trailer-plan`, then **make**, then `opengame-trailer-review-and-improve` on every round.

You build the film the plan describes, and the first cut should already pass the gates. A trailer at this bar is not
screen-recorded: it is shot on a film set built out of the game. OG Clash built that set in about three hours on day one
(a capture probe in 31 minutes, the film build in 1 h 50 min, the rig in 64 minutes, in parallel), then lost half of its
47 hours to session deaths, GPU contention and notes the gates now catch.

## Read first

- `plan/PLAN.md`, `plan/shots.json` and the common brief in the film repo.
- [references/filmable.md](references/filmable.md): the capability checklist, the hook catalogue, the stepped capture,
  the per-engine table, shot specs as code, the animation audit and what cost a round. `opengame-capture` has the
  in-game hook rules if you own the game.
- [references/craft.md](references/craft.md), [references/title.md](references/title.md),
  [references/finishing.md](references/finishing.md), [references/music.md](references/music.md) (the grid and the mix).
- [references/ops.md](references/ops.md) (team, machine, storage, talking to the owner) and
  [references/briefs.md](references/briefs.md) (builder, fixer, resume and game-notes briefs, word for word).
- [references/gates.md](references/gates.md), [references/owner-eye.md](references/owner-eye.md) and
  [references/measure.md](references/measure.md): what every cut must pass, what the owner will flag, and how to
  measure each with ffmpeg, Python and a speech recogniser.
- [references/core.md](references/core.md), [references/review.md](references/review.md),
  [references/archetypes.md](references/archetypes.md) (the raw gameplay montage and share card, if planned),
  [references/edge-cases.md](references/edge-cases.md) (2D, closed builds, VR, no GPU) and
  [references/og-clash-record.md](references/og-clash-record.md) (where the last film's time went).

## 1. The team and the ops (the first 30 minutes)

- **Team:** a film-build engineer and a rig engineer in parallel against one shot-spec contract; then sequence builders
  by shot range, a character builder, an ending builder, an effects lead who owns the film build, post (edit, sound and
  the review page), title, and a critic per round. One owner per file set; agents addressed by role through a
  name-to-id table; a port range per agent; at most one master-resolution take in flight per agent; about five agents
  running heavy work at once at most, and machine-wide heavy jobs capped by the share you agreed (at most 2 under OG
  Clash's 45 % share).
- **Briefs on disk before spawning.** Every agent appends to `work/PROGRESS.log` about every 20 minutes and keeps its
  state on disk so a fresh agent can resume.
- **The machine:** heavy jobs through your machine's job queue, if it has one, with thread caps; agree the share with
  other sessions; declare bursts. **Storage:** internal disk first, verified copies to any archive drive, proxies always
  local, a disk floor.
- **Stand up the review page:** the latest cut with a frame and bar.beat readout, the timeline on bars, shot status,
  every take, notes, critic scores, decisions, activity. Load it yourself, then send the link. Keep a latest preview
  file and a footage log from the first take.
- Schedule a resume at any usage-limit reset, write a resume brief before the limit gets close, and keep a second model
  provider ready, among those the person's setup already has (never buy credit without asking).

## 2. Build the set

### The film build (one owner)

Fork the frozen source. Add the plan's hooks behind a flag namespace, every default identical to the frozen build
(prove it with a parity frame): a HUD mask per element; a stage camera with roll, near plane, a **cut** (resets temporal
history and zeroes that frame's motion blur) and a **body** switch; **no hitstop or freeze-frame juice**; slow-motion-safe
physics; a shutter proportional to the step; staging for friendlies and enemies; a cinematic aim assist; a voice seed;
the per-frame probe (checked against rendered frames on day one); world switches; in-game music and voice off. Deploys
are atomic and named by hash with the old binary kept, a hooks-file section and a defaults A/B frame each. Look changes
only as named flags with A/B evidence, written so the game can adopt them, linked in `handoff/GAME-NOTES.md`.

### The capture rig

Use the engine's offline fixed-step capture (the per-engine table): Unity's capture delta time and Recorder, Unreal's
Movie Render Queue, Godot's fixed-fps movie writer, or a stepped browser rig for web and WebAssembly games (a virtual
clock shim in the loop's own thread, per-frame command injection, BT.709 readback converted on the GPU, WebCodecs HEVC at
about 300 Mbps, audio drained at the simulation rate, a conform with QA, a verified copy, a proxy). Measure throughput
in a quiet window; refuse software renderers; keep takes to 2-3 minutes; retry with load-tolerant timeouts.

### Audits (before any shot that depends on them)

Audit every weapon, sight and finish the plan shows, on frames, aimed down sights included. Audit every character and
enemy clip the plan uses: contact sheets, motion metrics, verdicts with framing. Audit every effect the plan features:
flat-white share, structure, flicker. Scout lanes and lens positions on frames. Write the findings as they land and
update the plan's staging. Nothing graded NO or NOT REPRODUCED goes on screen.

## 3. Shoot (builders, in parallel, with the builder brief)

- **Shots are code:** a spec per shot reading positions from `grid.json`, 30-frame handles, payoffs scripted to ±1 frame
  and measured from the probe, first-to-third-person pairs as one take with an in-take camera cut.
- **Drafts at 720p, a proxy check, then one take at the master format** (default 1080p60; 4K60 only if the plan says
  so). Stop when the take is good enough to select, deliver it, improve on the next pass. Never judge at draft size what has to be judged
  at the master.
- **Every take:** the camera moving from first frame to last; one whole action; entering on the wind-up; cutting on the
  payoff; carrying 2 px/f or more into the cut in the next shot's direction; screen direction per the map.
- **Ramps:** 1x approach, the payoff 1-3 frames before the beat, ease to 0.25x over 6-8 frames, hold 24-36 frames with
  the camera at 2 px/f or more, back to 1x over 10-12 frames. Measure the slow span (median 2 px/f or more) and every
  character's angular rate (no frame under 40 % of the median). Make the ramp legible: the subject's speed contrast at
  least 3x and a sound that marks the change.
- **Characters and enemies:** only audited clips, framed as the audit says; never idle, posed, from behind, or with
  visible feet on crowd AI; readable space; one gait in a horde; spawned in the stepped preroll.
- **Effects:** fix cheap effects at the source (thin hot cores, branching, re-strikes, real light, flat white at or
  under 0.5 %), sweep the class, A/B against a legacy toggle. When an effect is called cheap, try removing it first.
  Never add effects to a hero's face.
- **Selects:** `capture/selects/<n>.json` with the take, proxy, in and out, timeline in and out, measured payoffs, build
  hash, the previous select, notes and a self-review (gate checks PASS or FAIL, great, weak, with another hour). Persist
  every environment override in the spec. Keep rejected selects restorable.
- **Alternatives:** for any contested slot, keep an alternatives contact sheet linked from the review page.
- **The raw gameplay montage,** if planned: real time, full HUD, hard cuts, skilled play that fulfils every on-screen
  objective with visible success, the game music muted and verified by loudness (the archetypes chapter).

## 4. The title (the title chapter)

The game's own logo as extruded geometry (about 20 % depth) with side materials and the scene's light, rendered through
the take's logged engine camera (marker reprojection mean at most 0.1 px, maximum 0.25 px), placed in world space with a
fixed yaw by a per-frame solver that keeps it off every character, matched numerically to scenery at the same depth,
composited before the grade, found by the camera, still at rest, its energy striking on the beats from its first frame
with one designed sound per strike. Preflight at 720p, review at 1080p, the master resolution after approval. Confirm
it is in the edit list.

## 5. Edit, sound, finish (the finishing chapter)

- **The edit list from `shots.json` and the selects,** slates for gaps, a frame-exact conform, per-act LUTs and per-shot
  trims (median luma jump at or under 18, none over 40 except story beats).
- **Sound:** a designed hit on every big event (35 % or more in the phone band, 6 dB or more over the bed, in key, on
  the attack); every flash voiced or silent on purpose; tails of 150-400 ms across every cut; slow-motion sound in
  real time on the payoff; voice placed in the track's holes and checked with a speech recogniser on the mix; the
  non-music bus peak-controlled against the bed (no accidental duck); the planned designed silences; the master at −14
  LUFS ±1 and at or under −1 dBTP on the AAC.
- **Render:** review cuts at 1080p at the master frame rate (x264 slow, CRF 18); unique work folders and a lock; a 4K
  master in chunks only after approval and only if the plan's format is 4K; long jobs under a service manager, torn down
  at delivery.
- **QA every cut on the final file:** frames, rate, tags, audio and video sync, black, frozen and duplicate frames, luma
  at cuts, loudness, clicks, strips at every moved cut. Fix failures or list them; document a waiver once instead of
  leaving a gate red forever.
- A watcher may re-cut automatically when selects change, at most once every 10 minutes under load; pause it at a scope
  freeze and make one cut.

## 6. Self-review before anything is sent (the loop's first pass)

- Watch the cut start to finish yourself (and measure the sound, since you cannot listen), then look at strips across
  every cut and every slow span.
- Run every gate and tick the owner-eye anticipations and the pre-send checklist with frames.
- Spawn the blind critic and the owner proxy (the briefs chapter) on the newest cut that passes QA, immediately (they
  need no GPU); fix what survives the filter if there is time; say if you skipped them.
- **Never hold a finished cut the owner is waiting for.** Send it labelled "pre-review" with what is open, and keep
  looping. Send an inline preview, not a path, and per-shot clips of changed shots while a full cut renders.
- Then run `opengame-trailer-review-and-improve`, and add a line to `film/SKILLS.log`.

## When something goes wrong

- **A usage limit or a restart:** resume agents by message with their orphaned processes named; check the progress log's
  FAILED lines before claiming nothing was lost; check for a surviving copy of your own session before cutting.
- **Captures at 1-5 fps:** too many GPU jobs. Cap concurrency, draft at 720p, look for other GPU browsers and for
  background-priority throttling.
- **A slow span looks frozen:** hitstop or a short animation. Turn the juice off, re-time, re-measure angular rate.
- **A camera jump smears, or pickups ghost:** a missing temporal-history cut.
- **Music in the takes:** mute at capture and verify by loudness.
- **A cut is short or frozen at the start:** a work-folder collision. Use unique folders and a lock; QA the final file.
- **The first frame after each cut is still:** the rig started its camera on frame 0. Warm it 3 frames earlier.

## Don't

- Don't screen-record a game that can be shot; don't interpolate slow motion; don't add post blur or shake.
- Don't shoot a hero shot on an unaudited animation; don't feature what the engine does badly.
- Don't render a 4K master before approval; don't run more GPU jobs than keep takes at 5 fps or more.
- Don't edit the game team's source or builds; send patches through the game-notes file.
- Don't spend on generated voice, music or effects without the person's go-ahead, on their own account.
- Don't send a cut you have not watched and measured, or a link you have not loaded.
- Don't leave watchers, scheduled jobs or heartbeats running after delivery.

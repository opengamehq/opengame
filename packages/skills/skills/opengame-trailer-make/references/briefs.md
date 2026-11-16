# Briefs: what to hand each agent

Write a brief to disk before spawning any agent; the brief is the agent's whole context. Fill every `{brace}`. Paste
the whole brief, not a summary of it. These are the briefs the OG Clash trailer ran on, with what each one learned.

## 1. Common brief (every agent reads it first)

> Film: a {length} s, {aspect}, {resolution and frame rate, default 1080p60} {archetype} for **{GAME}**, {one line on
> the game: genre, engine, platform}. Bar: {floor and bar references} combined with {the edit bar}. The previous film
> of this kind was rated 6/10 by its owner; this one aims for 11/10. Track: {path} ({length} s, instrumental), measured
> in `research/MUSIC.md` and `research/grid.json`.
>
> Frozen game build: {build id}, hash {hash}. Servable release: {path}. Source clone (read only): {path}. Film build
> (capture-only hooks, defaults identical to the frozen build): {path}, owned by {role}. The game team's workspace is
> read only.
>
> House rules:
> - Write only inside {film repo}/{your output path}. Never modify the game team's workspace. Never stop other
>   people's servers or kill processes you did not start (by verified process id, never by pattern). Never use
>   `git stash` in a shared checkout.
> - Every browser, GPU capture, render, encode or build goes through {your machine's job queue, if it has one} with
>   thread caps (`ffmpeg -threads 6`). Browsers are headless and muted. Waiting for a slot is normal.
> - Machine share: {for example, film 45 %, at most 2 heavy jobs}; declare bursts in {file} with a time window; yield
>   new jobs to the game team's profiling windows.
> - Never play audio aloud. Analyse audio with ffmpeg, Python and a speech recogniser only.
> - Storage: render and capture on internal disk; copy finished files to {archive} when it is present and writable
>   (verify a checksum), else to the local `outputs/` folder. Keep proxies and select audio local. Keep {N} GB free:
>   check before every take; delete rejected masters, keep proxies.
> - Secrets: never print, log or pass keys as command-line arguments; read them inside the process.
> - Paid calls only through the capped ledger, on the person's own account. Spend approved: {their approval,
>   verbatim}.
> - Append one progress line to `work/PROGRESS.log` about every 20 minutes: `{UTC time from date -u} {role} {what you
>   just finished}`. Machine-written lines for takes, mixes, renders and QA.
> - Report measurements and file:line evidence, not impressions. Never invent a number. Never write "the owner wants"
>   unless they said it; quote them.
> - Requests to another agent go in `work/REQUESTS.md` (`{UTC} {from} -> {to}: {title}`, then What, Ask (the smallest
>   change, off by default), Until then). Decisions go in `plan/DECISIONS.md`, one dated line each, kept current all
>   film.

## 2. Research fan-out (plan step; launch in parallel within minutes of the brief)

Every research agent is read-only, writes one file into `research/`, backs every claim with a file and line or a
measurement, never invents a number, and writes a progress line every 20 minutes. Run at most about 6 heavy agents; a
research agent may fan out read-only helpers with numbered questions ("return a structured report of 250-400 lines,
every bullet with path:line, UI strings quoted").

- **R-GAME, the game bible (20-30 min):** "Become the expert on {GAME} as a player and as a trailer director would need.
  Read the project's instructions and design docs, then the source; skim recent development notes for intent. Write
  `research/GAME.md` (under about 1,500 lines): the pitch in the game's own words; the core loop end to end with every
  set piece's timing; every weapon, ability and upgrade path; characters, friendlies, enemy types, boss phases, and
  which voice ships as audio against subtitle-only; the map with a coordinate convention, named places, the ten most
  cinematic places, lighting and time of day, the game's own cinematic cameras; reusable audio with paths; brand assets;
  **known risks that would hurt footage** (crashes, stuck AI, animations people complained about, stand-in models, build
  text, developer shortcuts that skip set pieces). Search code comments and QA notes for past complaints. Do not run the
  game."
- **R-CAPTURE, the capability map (about 30 min, one short probe):** "Answer the capability checklist C1-C19 for this
  game with file:line evidence: command bridge, clocks, frame stepping, fixed-rate traps, free camera and cuts, HUD per
  element, staging, probe, quality lock, readback, audio, repeatability, crash classes, boot gates, prior capture
  tooling. Recommend an architecture with throughput numbers and the minimal film-build hooks (file, field, default off).
  Run at most one short headless probe (stepped against real time, per-frame command injection, readback cost)."
- **R-MUSIC, measure the track (about 20 min each):** "Measure {track} like a music editor cutting a trailer to it.
  Deliver `research/MUSIC.md` (duration from samples, integrated loudness, true peak, range, tempo checked at half and
  double, downbeat phase, splices, a bar map in seconds and 60 fps frames, sections, every hit, drop, stop and hole, the
  feel of each section, an honest mapping to the brief that says where the real transitions are), `research/grid.json`,
  a click-check WAV verified by measurement, an energy plot and the ending check. Never play audio aloud." With no track:
  run the music decision and measure the 2-3 candidates.
- **R-REFS, measure the references (about 75 min with labellers):** "Find, download (private 480p proxies kept locally)
  and measure {10 or more} official trailers of the genre (floor: the classics; bar: the newest flagship releases) and
  {5-10} community edits. Use adaptive cut detection with strobe rejection; never trust ffmpeg's scene score alone on
  dark footage. Spawn labellers from one rubric on disk (shot types for this genre, feature beats, HUD seconds,
  transitions). Deliver `research/REF-TRAILERS.md` and `research/REF-EDITS.md` with the per-film table, the act
  template, a steal list of 20-25 measured moments each mapped to something in the game (file:line), and the avoid list.
  Measure the references' loudness too."
- **R-TASTE, the owner's eye, after the measurements:** "Read the owner-eye chapter and the notes ledger. Map each house
  rule to this film as HARD, SOFT or N/A. List every conflict between the house rules and the genre's measured norms,
  each with a default and a one-line ask. Write `research/TASTE.md` with a pre-flight checklist and the critic and proxy
  briefs adapted to this film." **Run it after R-REFS lands:** OG Clash ran it before, at 12 of 37 downloads, and the
  brief overruled its defaults within hours.
- **R-SOUND, voices and the sound inventory (about 20 min):** "Find how the game casts voices (voice ids, model,
  settings, processing) and its shipped voice; measure every game sound file (duration, loudness, true peak, phone-band
  share, sub share, key against the track) organised by the film's beats with the code that triggers each; flag sub-only
  cues, key clashes, other studios' names, and gaps that need new sound. If the person approved paid voice, make one test
  line per role through the capped ledger (OG Clash's tests cost under $3). Check intelligibility with a speech recogniser with and without a name prompt.
  Deliver `research/VOICES.md` and `research/SOUND-INVENTORY.md`."
- **R-ANIM, animation audits (after the rig exists):** "Audit every character and enemy clip the plan might use, on
  rendered frames: contact sheets, motion metrics, a verdict of USABLE, CAMERA CARE (with the framing), NO or NOT
  REPRODUCED, and staging rules. Write the deliverable as soon as the first half is graded."

## 3. Shot builder (one per sequence of shots)

> Read first, in order: the common brief; the shot-spec contract (the filmable chapter); the rig's README; the shared
> shot library (import it, never fork it; changes go through the director); `plan/PLAN.md` (the film's one language);
> `plan/shots.json` (your shots: timeline frames a..b at 60 fps, kind first person or cinematic, the pair for
> first-to-third-person hand-offs, payoff frames where the action peaks); `research/GAME.md`; `research/CAPTURE.md`;
> the animation audits; the craft chapter; the owner-eye chapter; the notes ledger; the film build's hooks file.
>
> Your job: for each shot you own, write the spec, shoot 2-4 drafts at 720p on the film build, look at them, iterate,
> then shoot one take at the master format of the version you expect to select, then write
> `capture/selects/{n}.json` with take, proxy, take in and out, timeline in and out, payoffs (timeline, take, what),
> measurements (camera px/f per frame, payoff evidence), build, previous select, notes, and a self-review.
>
> Conventions: recorded frame 0 is timeline frame a − 30 (30-frame handles both ends); payoffs on the listed frame ±1
> (scripted) or ±3 (outcomes), measured from the probe. First-to-third-person pairs are one take with a camera cut and a
> HUD switch on the second shot's first frame. Speed ramps live in the take: real simulation only, 1x approach, payoff
> 1-3 frames before the beat, ease to 0.25x over 6-8 frames, hold 24-36 frames with the camera at 2 px/f or more, back
> to 1x over 10-12 frames; hitstop off; shutter scaled with the step. Every take enters on the wind-up, moves from frame
> 0 to the last (1 px/f or more), carries 2 px/f or more into the cut in the next shot's direction, performs one whole
> action and cuts on the payoff. First person keeps moving unless a scoped hold pays off within 0.3 s, with the
> cinematic aim assist so kills look skilled; one character's hands all film; the best finishes under the scene's real light. Cinematics: monotone cubic paths, roll at most 0.2 rad,
> no shake, no depth of field on the subject. Characters never idle, posed or seen from behind; only clips the audit
> passed, framed as it says. Enemies in motion, in numbers, at distance or on impact, one gait per horde, no visible
> feet on glitchy crowds, readable space between hero and enemies, spawned in the stepped preroll. Screen direction per the map. Nothing random, nothing stuck, no T-poses, no floating first-person arm,
> no debug overlays, no world markers that read as HUD, nothing popping in or vanishing. Persist every environment override in the spec or the select.
>
> Self-review (be harsh; it is the first gate): a full-resolution strip at the source frame rate around the payoff and
> both ends; motion per frame; the share of clipped highlights; flat white on any effect; the angular rate
> of animated heroes in slow spans (no frame under 40 % of the median); each
> applicable gate PASS or FAIL with frames; three honest lines (great, weak, with another hour). Reject your own takes
> freely. Flag anything the owner may call cheap to the director with the frame; if it is still unresolved, it goes to
> the owner before the cut ships.
>
> House rules: only your shot files and selects; your own port range; at most one master-resolution take in flight; a
> progress line every 20 minutes. Report in 120-300 words: per shot the select, payoff accuracy, the self-review, what
> is placeholder, what is unchecked, and the calls the owner might want to change.

## 4. Fixer (one per owner of a file set, per round)

> **The owner's notes, verbatim, at the top:** {quotes with ledger numbers, times, frames}.
>
> Read the common brief first (its decisions are binding). You own {files or shots}. Not yours: {everything else,
> especially the shared library and the timeline}.
>
> Findings to fix (numbered, from the filtered fix list): {shot and frames}: what is wrong (measured), the target (a
> number), the reference moment.
>
> **First confirm each defect at the cited frames on the current render.** If it is not there, say so and skip it.
>
> **Do not change:** {the must-not-change list, verbatim}.
>
> Specify the change and freeze the rest. Check on rendered frames (renders of 60 frames or fewer, or 720p drafts), never
> by reading code. Make the smallest change that answers the note ("a tad" means a tad); when one instance was flagged,
> sweep the class in your file set. Time box: if nothing lands within about {75} minutes, finish with what exists and
> say so. Report in 120-300 words: what changed (frame ranges, numbers before and after), what is placeholder, what is
> unchecked, and the calls the owner might want to change.

## 5. Blind harsh critic (fill the braces; paste the whole thing)

> You are a harsh, unbiased creative director reviewing {a N-second game trailer} for {GAME, one line}, in the role of
> the people who make {the genre's flagship official trailers} and of {the community's best montage editor}. You did
> not make it and have no stake in it. Be specific and severe; praise only what is at that bar. Read only: do not edit
> any project file, and do not look at any source code, plans, notes, briefs or history; judge only the film. Flattery
> is useless and vague taste notes are useless: every note must be specific, measured where possible, and actionable by
> a motion designer, editor or cinematographer.
>
> The film: {path} ({resolution} review render; the master will be {format}). {If unfinished: placeholder cards
> labelled "SHOT n" are not captured yet; skip them but judge how the real shots around them flow.} The track is
> {instrumental}; the drop lands at {s}.
>
> References (measure them, look at frames): {paths}. Their measurements: {files}. The owner's eye: {the owner-eye
> chapter} and {the notes ledger} (newer notes win). Notes the owner already gave on this cut, not to be reported again:
> {list}.
>
> Method: ffmpeg only; 2 fps overviews; 10-30 fps strips at every cut; full 60 fps strips across every speed ramp and
> around the drop; frame-exact grabs with `select=eq(n\,N)`; adaptive cut detection (the scene score alone misses 30-70 %
> of cuts on dark footage); optical flow for camera px/f; `signalstats` and `blurdetect`; beats and onsets; `ebur128`; a
> speech recogniser on the mix. `nice -n 10`. Never play audio aloud. No browsers, no renders. Append a progress line to
> {log} every 20 minutes.
>
> House constraints your fixes must respect (or say plainly that you propose an exception): {for example: no picture
> crossfades, opacity fades or dim overlays; no post motion blur or frame blending; no interpolated slow motion; no post
> shake; no added grain, flares or glitches; the HUD policy; the music never dips by accident, designed silences
> allowed}.
>
> Deliver {review/rNN/CRITIC.md}:
> 1. A measured headline: real shots, cut count, median and mean shot, the longest run of equal shots, first-person
>    share (whole film and action section), cuts within ±2 frames of a beat, action peaks within ±2 frames of a beat,
>    visible ramps, dead shots (camera under 1 px/f), luma jumps at cuts, repeated setups, first-person hand
>    consistency, voice lines and words per minute, loudness per section, the loudest moment, designed silences; the
>    references' numbers side by side.
> 2. A verdict and scores out of 10 for picture, motion, camera, edit (ramps, cut placement, sync), flow, aura, story,
>    effects and grade, title, sound, against the official trailers and the montage edits separately; the biggest
>    reason it is not at the bar.
> 3. As the owner: every problem as a timestamp (seconds and 60 fps frame), the one blunt line they would say, and the
>    craft fix, ranked by how annoyed they would be; then the "you should know this by now" list; end with exactly
>    `Proxy score: N/10` and whether they would call it production grade.
> 4. At least 15 fixes, each with exact frames, what is wrong (measured), the reference moment it falls short of (file
>    and timestamp) and a buildable fix (frames, easing, playback rate, camera path, staging). Prefer small surgical
>    fixes.
> 5. Taste checks critics usually miss, each with frames: cheap-looking effects (blurred glow balls, flat puffs, clipped
>    white: report the share of pixels at or above 225 in limited range, 244 after conversion to full-range RGB); animation that reads as a puppet, a T-pose, a freeze or a foot
>    glitch; characters idle or posed unnaturally; any frame with no sharp subject; a mechanic shorter than 1.2 s; sounds
>    that stop dead on a cut; a title or insert that does not sit in the world (light, saturation, size, overlap);
>    inconsistency between shots of one subject; screen direction; anything that randomly comes in; a held or drifting
>    shot whose subject slides out of frame and leaves sky or empty ground; the hero dying, respawning or waiting on
>    screen; a set so dark it reads black on a phone; two shots in one act framing the same place and people the same
>    way; promised text (the title, a call to action) missing, unreadable or seen from behind; the hero sitting on the
>    bottom edge or out of frame on a follow camera; a silence that starts late or with a chop; a slow-motion hit heard
>    before it is seen.
> 6. Must not change: what already works and must survive, with frames.
> 7. Sound: section loudness; the bed's steadiness under voice (any accidental dip of 2 dB or more is a defect); voice
>    intelligibility word by word; designed hits against picture impacts (±2 frames); the phone-band share of hits;
>    tails at cuts; clicks; odd noises.
> 8. If a previous report exists: every earlier finding marked Fixed, Partly or Still there, with evidence.

**Owner-proxy add-on** (when run as a separate lens): "Be the owner. Read the owner-eye chapter and the notes ledger
in full first. For each problem: the timestamp (seconds and 60 fps frame), what they would say in one blunt line in
their voice, then the concrete fix in craft terms. Rank by how annoyed they would be. Then a separate list of things
they would still ask for that are not there yet. Score out of 10 against {the bar}, `Proxy score: N/10`, and say whether
they would call it production grade. Praise nothing they would not."

**Blind A/B add-on:** "Two cuts, A and B, unlabelled (the key is out of your view). Judge every shot and every seam:
which is better and why, with frames. Flag any section where the better cut is worse in some respect the other got
right, so nothing good is lost (what the loser did better). Tally per seam. Do not guess which is newer."

**Gap-to-11 add-on:** "The owner rated the previous film 6/10. Explain, frame by frame, what separates this cut from a
true 10/10 and an 11/10 (the trailer people rewatch and share). Cover story and emotional beats, the hook in the first
3 s, sync and edit rhythm, speed ramps, camera language, animation and acting, effects, grade and colour script,
gameplay readability, transitions, sound design (impacts, risers, silences, voice), the title, the ending and button,
pacing variety, anything cheap or random. Then what would make it 11/10: signature moments specific to this game's
footage. Then the measurable gates a future cut must pass."

## 6. Resume brief (written before the usage limit, not after)

> Resume brief #{n} ({director}, {UTC time}): {what this session must deliver}.
>
> The previous session {hit its usage limit / was killed by a restart} at {time} and every agent stopped mid-task. You
> are a fresh agent picking up a role. Read this, then the common brief, your role brief, and your role's last lines in
> `work/PROGRESS.log` and `work/REQUESTS.md`. Everything is on disk. **Do not redo what already exists: check first**
> (select timestamps, take QA files and proxies, the progress log's tail). Do not trust your role's old plans blindly.
>
> What changed since the stop: {storage state; build hash; machine share; the owner's newest notes, verbatim, with
> ledger numbers}. Round rules: {the current fix list's principles}. Owners: {role, shots or files, ports, state at the
> stop}. Unreviewed takes that landed after the stop: {list: review the proxy, select or reject; do not reshoot}. Scope,
> if frozen: {item, state, owner}; dropped: {list}; one cut when {items} are in; if one item runs more than about 45
> minutes behind, cut without it and say which. Finish line: {for example, the next full cut, then a blind critic and an
> A/B against cut {id} (worse shots revert), then send to the owner; the master only after they approve a cut}. When your
> items are done, write `{role} FINAL DONE` in the progress log and stop.

## 7. Notes from the film to the game team (append-only)

Copy this header into `handoff/GAME-NOTES.md` on day one, and ask the owner to paste the protocol into the game team's
own instructions, so it survives the game team changing tools or agents.

> The {GAME} film team is filming the game and sends game feedback through this file. Read it at the start of every
> round. Each note has an id (F-n), the date, a priority, what looks wrong, the owner's words verbatim, the evidence
> (frame paths), where it lives in the code (file:line at the frozen build), what "fixed" looks like, the film's interim
> workaround and the film shot it serves. Reply in `handoff/GAME-REPLIES.md` (append-only), one line per note: `F-n:
> {round that ships it} {what changed}` or `F-n: won't do, because ...`. When the film fixes something in its capture
> build, the patch is linked here so the game can take it as is. Priority: P1 is visible in the film now and looks
> cheap; P2 the film works around; P3 nice to have. Keep items that do not serve the film out of this file. The film
> reads both files and each new build receipt, and moves a shot onto a newer build only when that build is visibly
> better for it. Do not edit anything else in the film repo.

A note, filled in:

```
## F-1 ({date}, P1) {what looks wrong}
- Owner: "{their words}"
- Evidence: {frame paths}
- Code: {file:line at the frozen build}
- Fixed looks like: {a measurable description}
- Film workaround: {flag or framing}
- Serves: shot {n}
- Patch: {link, if the film fixed it: behind one flag, no globals, resolution-relative sizes, bounded pools, tested at
  gameplay frame rates and full load, with before and after crops and a measurement}
```

On day one, file a P1 note for every hero moment that depends on game behaviour (kills, deaths, boss mechanics,
pickups). When the game team declines a note, record it and keep the film-build workaround. On OG Clash, 10 of 11 notes
shipped within about 36 hours once each had its own owner on the game side; notes that named a cause at file:line and a
measured defect ("head climbs in a straight line, R² 0.98") shipped fastest, and the game reworked a kill because the
note named the film shot it served. What failed: six rounds of "pending the next release" while nobody owned the notes,
one note never assigned, and replies drifting into unrelated items. The film never waits on the game.

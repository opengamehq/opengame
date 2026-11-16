> Carried from `opengame-montage-make` 1.0.0. Read it when: Build a gameplay montage from its plan, for any game, genre or engine, at any capture tier from a film build to live high-frame-rate capture. Covers the agent team with relays and bounded waits, film-build hooks or replay passes, takes as code with eased speed keys on the beat grid, payoff cinematics from the same run, offline take checks, and a resumable cut chain that delivers read back. Use when a montage plan is ready and it is time to capture and cut.


# Montage make

Step 2 of 3: `opengame-montage-plan`, then **make**, then `opengame-montage-review-and-improve` on every round.

You build the montage the plan describes. Every take should pass the hard gates before it is offered, and every cut should
reach the owner's folder without a slate, a placeholder or an unfixed note they were not told about. On the OG Snipers
sniper montage the rig and film build were up by hour 3, but capture took 42 % of about 302 agent-hours at about 50
sessions per shipped slot, and 10 h 38 min (16 % of the wall clock) passed with no agent logging: a 7 h 20 min
model-provider outage and a 3 h 18 min machine stall.

## Read first

- `plan/PLAN.md`, the common brief and `work/OWNER-NOTES.md` in the film repo.
- [references/montage-grammar.md](references/montage-grammar.md) (the grammar), [references/montage-capture.md](references/montage-capture.md)
  (tiers, hooks, shooting without source, take checks), [references/montage-genres.md](references/montage-genres.md)
  (fake tells, probes and HUD per genre), [references/montage-ops.md](references/montage-ops.md) (team, relay, slots,
  the cut chain, the time budget) and [references/montage-gates.md](references/montage-gates.md).
- [references/filmable.md](references/filmable.md) (the capability checklist, stepped capture, the per-engine table,
  shot specs as code, the animation audit), [references/finishing.md](references/finishing.md) (conform, render, QA,
  delivery) and [references/edge-cases.md](references/edge-cases.md) (closed builds, 2D, VR, no GPU). `opengame-capture`
  has the in-game hook rules if you own the game.
- [references/song.md](references/song.md), [references/reference-study.md](references/reference-study.md) (the
  finishing layer, the bot tells and the player model), [references/briefs.md](references/briefs.md) (common, shooter,
  resume and sweep briefs), [references/owner-eye.md](references/owner-eye.md),
  [references/measure.md](references/measure.md) (how to measure each check with ffmpeg and Python),
  [references/day-one-questions.md](references/day-one-questions.md) (what the owner settled on day one) and
  [references/og-snipers-record.md](references/og-snipers-record.md).
- Rename the shooter words for your genre: payoff (kill, goal, overtake, KO, clear), receiver (victim, overtaken car,
  keeper, losing team, board), secondary sounds (reload, gear change, footwork).

## 1. Team and ops (the first 30 minutes)

- **Roles:** a director; a film-build engineer and a rig engineer in parallel against one spec contract; shooters, one per
  range of slots; edit; sound; post; ending; an independent sweep per cut. One owner per file set. The director makes no
  captures once shooters exist. About 10 agents ran at once on OG Snipers.
- **Relay discipline.** After every owner message: rows in the notes ledger and `work/OWNER-NOTES.md`, then a relay
  checklist of every role it touches, written to each `inbox/<role>.md` and the shared bus. Every agent reads its inbox
  at the start of every task and before queuing any take; specs are read at session start so queued sessions pick up late
  notes. (A title hand-in finished before the note that changed it reached that agent; shooters queued takes a newer note
  had cancelled.) Watch shared files with `tail -n 0 -F`.
- **Handshakes** through `status/<role>.json` (author, cut id, commit, READY), never by grepping a shared log.
- **Bounded waits:** every wait ends on success, on a failure line, or after 15 minutes, then reads the real state.
  **Liveness:** each heartbeat lists every agent's last activity; more than 30 minutes silent with no job of its own means
  hung: restart it from its resume brief. A heartbeat skips if the last one has not finished; delete every schedule at
  delivery. The director's own turn stays alive through long waits; a context restart resumes from the resume brief and
  `plan/DECISIONS.md`.
- **Provider failover:** resume briefs on disk at all times; at the first wave of refusals, restart every agent on another
  model provider within 15 minutes, among those the person's setup already has (never buy credit without asking).
- **The machine:** agree the share before production and verify it is live in the tool everyone calls. Use your machine's
  job queue if it has one: a fixed slot count with timed raises that revert; takes ahead of other jobs ahead of proofs;
  tickets older than 40 minutes jump ahead; one reserved slot for the director's finishing passes; withdraw only waiting
  tickets, by verified process id. Pack takes into one session (OG Snipers booted in 130-180 s), sessions under 12
  minutes. **Measure and report the queue's arrival and service rates** (OG Snipers: 14 takes an hour arriving, 8 served)
  and cut work that fails preflight before it queues. Measure how many parallel captures your machine holds (OG Snipers:
  three held, four lost takes to GPU device loss).
- **Disk:** build the delete keep-list from the select files at deletion time; caps per role; archive selects off the
  capture machine.

## 2. Build the set

### The film build (tier A: one owner, a private worktree)

Fork the frozen source; every switch's default equals shipped, proved with a parity frame: a per-frame command bridge with
a far keepalive; a stepped clock with any step and a slow floor of 0.05x or lower; **a seed over every random generator**;
HUD per element and event filters (a hero-only feed, payoff badges on their own frame); a stage camera with a history cut
and attach spaces; every body drawn in sync each frame under slow motion; opponent or AI staging (place, act, path,
loadout, name, health or pace); the per-frame probe (player, camera, every actor, every payoff event with receiver and
cause, audio cues) **plus, on day one, the drawn points of whatever the engine animates worst (a skeleton, wheels, board
pieces, units), the payoff point, the line of the attack, ground height and a camera look-at** (they came on day 3 on OG
Snipes, after two guessed framings failed); an input assist inside the game's own rules (OG Snipers: an aim trim of at most
0.35° before the game's hit test); reaction controls (ragdoll, crash, KO, a hitstop multiplier); a shutter in game time.
Put film switches on run-time structs (a field on a serialised struct broke two builds); staging acts on a change of value
(send a reset 6 frames before). A proof table per hook in the hooks file.

### Without source (tiers B-E)

No film build: say what that removes and plan around it (the capture chapter). B: record a human's input live, re-run it
in tier A's rig, hash state per frame to prove the replay. C: play live, then shoot each moment in passes from the replay
(as played, outside, the receiver's side), rendering offline if the replay allows; check its slow motion on frames for
interpolation (use interpolated replays only to 0.5x); version-lock the build. D: the game's own cameras plus
high-frame-rate capture. E: lossless capture at the highest stable rate (the slow-motion budget is capture fps ÷ 60),
events mined from the feed or score pops, no second angle. The rest of this skill holds; staging and seeds become
selection from many real plays.

### The rig

The stepped capture for the tier (the filmable chapter); seeded replay proved on day one; **one shared clock library with a
unit test against the engine's own time** (a clock-sum off-by-one between the payoff solver and the engine failed one take
three times); a human-input synthesiser inside the measured ranges of a good player of this genre (the reference-study
chapter); a payoff solver that lands payoffs only on grid frames; the speed logged on every frame; a renderer check that
refuses software rendering; take checks (frame count, duplicate signatures, clock skips, quality, every payoff the spec
asked for actually happened).

### Audits and the pilot

Audit every reaction, hero move and opponent behaviour on frames before shooting on it; scout every map or level for
z-fighting and flicker at the planned lenses (change the framing or the place; a film-only backdrop fix did not cure one);
send the skin and loadout casting sheet; measure the genre's fake tells. Shoot the plan's **pilot clip** first and send it.

## 3. Shoot

- **Specs as code** from `grid.json`: payoffs on grid frames at the beat − 3 frames; movement accents with measured leads;
  speed keys eased per AE1-AE4; the frozen spec, seed and build saved with every select.
- **Preflight offline before a take takes a slot:** every way the scripted run can fail, checked without a GPU. On OG
  Snipes each of these lost real takes: lines of fire, thin cover, shields, lobby bots, pace marks on another payoff's
  line, clock sums. Racing: the line, AI pace, contacts. Fighting: inputs against frame data.
- **Clock-easing traps:** changing the clock moves where an action lands (an eased clock after a hop lost a kill); at 0.3x
  one simulation frame spans 3.3 output frames, so a key may be unreachable; a payoff cinematic under 28 frames cannot fit
  the V ramp. Check every take's speed log: fail a one-frame change over 15 % and a constant run of 20 frames or more after
  a payoff.
- **The payoff cinematic comes from the same run:** the seeded take with a stage camera, the input replay, or the replay's
  free camera on the same moment. Cut on the payoff + 1 frame, from the receiver's side, under the grammar chapter's rules.
  **Solve the lens in two passes** when the framing must include X and exclude Y on every frame: pass 1 with any lens and
  the probe logging; solve a per-frame lens with an 8 % margin; pass 2 plays the keys on the same seed, build and clock;
  check pass 2's own logged points; if the receiver inverts, cut to close-ups or re-stage. OG Snipers verified 0 of 55, 52
  and 42 frames with a leg point in frame.
- **The take check before offering** (about 20 s, no GPU): the grid, no dead time, only the high-skill form, opponents
  moving, HUD and feed names right, cause before effect, the receiver matching, smoothness on every frame. Offer with three
  full-size graded frames, an every-frame strip of every receiver and hero shot, and what is weak, in so many words.
- **Never cut a shot the owner liked:** fix it by re-staging, re-framing or a build request. Never delete a master a select
  names.
- **The master format:** capture at it, or keep every select seeded and re-shoot it at the master size, verified (frame
  count, speed curve, payoff frames, receivers, the camera within 0.15 m and 4 % field of view) before the master.

## 4. Cut, mix, finish, deliver: one chain per cut

- **The edit list never retimes:** no speed, hold, blend, fade or blur keys. At tiers C-E the conform that lays
  high-frame-rate footage at 60 fps is the one sanctioned rate change, declared per shot. A rolling working cut follows
  select changes (at most once every 10 minutes under load) so a full-length cut always exists.
- **At the director's word the edit list freezes** and a resumable chain runs it, each stage idempotent and restartable
  by name (one OG Snipers cut needed five resume scripts written by hand before the chain existed). Never edit a running
  script: write a temporary file, then rename it.
  1. **Lint take-bound rows:** every repair, reframe, push and look exception names its take; stop with an error when its slot's
     take changed, and re-bind in the same order that rules the new take in. (A z-fight repair stopped applying without any warning
     for five cuts while the owner was told those cuts were checked; a title was graded twice.)
  2. Render; **scan for flicker only in the spans that changed,** verdict before strips, a cleared list by take.
  3. **One finishing pass** on the reserved slot, against the locked approved look; frames in equal frames out; the title
     box against its approved comp.
  4. **Mix by signature:** the mix carries the edit list's signature and is muxed only on a match; reuse an existing mix
     whose signature matches. Wait for the sound agent's READY at most 40 minutes, then hold and say so.
  5. Remux bit for bit; QA on the final file.
  6. **Deliver to the owner's folder and check it landed:** a plain temporary name (never a name starting with a dot),
     rename, read it back and compare size and checksum, retry after 10 minutes, report "not delivered" until it is
     there. The copy is a chain stage, not a habit: twelve OG Snipers cuts never reached the owner's folder.
  7. **The full gate report after delivery,** as a delta (new FAIL, fixed, standing); the hard gates and the flicker hold
     already ran before the send. The independent sweep runs on the edit render while stages 3-5 run.
- **Sound** is one command inside every cut build: the song untouched, payoffs timed by their attack, levelled as heard to
  one target, secondary sounds at least 6 dB under, full tails, measured again on the delivered file.

## 5. Before anything is sent

- Watch the cut once at 1x, start to finish, and measure its sound (the OG Snipers director never watched; the owner always
  did).
- The hard gates pass or are listed; every `OWNER-NOTES.md` row verified on frames of the delivered file, with NOT VERIFIED
  rows at the top of the message; the sweep landed, or the cut goes out "sweep pending" with its A rows within the hour.
- No slates, no placeholders, no proxies. Then run `opengame-montage-review-and-improve`, and add a line to
  `film/SKILLS.log`.

## The traps that cost the most on OG Snipers

Faulted shots cut and filled with shots tied to nothing: about 12-14 hours. One model provider: 7 h 20 min dead. The
payoff framing decided on day 3: about 10-12 hours. The hero cast without asking: about 10 hours. The title and ending
without stills: 26 agent-hours and 23 hand-ins. An open wait on a dead job: 3.6 hours; an unnoticed idle agent: 4.4 hours.
Slot queues: a proof starved 2 h 20 min; a neighbour borrowed slots for 4 hours. A placeholder direction check: one round.
A voice line untested over the song: six episodes and three masters. A take-bound repair that stopped applying: five cuts
with a known z-fight. Waiting inside a cut: 45 minutes for the sound agent. Spacing copied from the reference: two re-shoot
rounds. Capture at 1080p for a 4K master: an upscale. Masters of 11 takes deleted while selects named them.

## Don't

- Don't retime, hold, blend or fade in the edit; speed lives in the capture (or in the capture's own frame rate).
- Don't queue a take without reading your inbox and preflighting it offline.
- Don't wait without a timeout, or signal readiness through a shared log.
- Don't let a take-bound row survive a take swap unlinted.
- Don't mux a mix whose signature does not match the edit list.
- Don't run more than one finishing pass per cut, or grade an approved element twice.
- Don't claim a delivery you have not read back from the owner's folder.
- Don't hold a cut the owner is waiting for on the full gate report.
- Don't edit the game team's source; send fixes through the game-notes file.
- Don't spend on generated sound or voice without the person's go-ahead, on their own account.

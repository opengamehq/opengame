# Montage ops: the team, the machine, the cut chain, and the time budget

OG Snipers ran about 302 agent-hours over 66 h 38 min of wall time. Capture took 127 of them (42 %) at about 50 capture
sessions per shipped slot, and 10 h 38 min (16 % of the wall clock) passed with no agent logging anything: a 7 h 20 min
model-provider outage and a 3 h 18 min machine stall. `opengame-production` covers the same failure classes for building
a game; this chapter is the montage version.

## 1. The team shape that worked

| Role | Job | Keep | Change |
|---|---|---|---|
| Director | plan, rule every offered take on frames, route notes, talk to the owner | one decisions file all film; rulings that name takes and frame ranges; defaults taken and logged | watch every candidate once in motion with sound measured; rule on graded, full-size, every-frame pictures; count from the source data before telling the owner (the director corrected itself nine times) |
| Research (seven agents) | the game, capture, music, the reference editor, other edits, sound, a good player | all landed in 58 minutes; game and capture in 15-23 minutes unlocked the engineers | never let research pick the hero or the skins |
| Film-build engineer | hooks behind switches on a frozen, parity-proved release | 57 builds with a proof table per hook | measuring probes (drawn body, hit point, line of fire) on day 1, not day 3 |
| Rig engineer | the stepped rig, an input synthesiser, a payoff solver, seeded replay | the rig by hour 3; seeded replay proved by hour 10 | one shared clock library with a unit test against the engine's time |
| Shooters (three) | one owner per range of slots | written specs, a frozen spec per select, take checks before offering | preflight takes offline; arrivals of 14 takes an hour outran 8 an hour served |
| Edit | the edit list, the take check (about 20 s, no GPU), a rolling cut, the cut chain | chunk reuse; a chain that refuses a stale mix | structured handshakes, not grepping a log |
| Sound | a one-command mix inside every cut build | a check that refuses another edit list's mix | measure as heard on the delivered file |
| Ending and title | the title and the end shot | measured readability tables let the director rule fast | stills on the real plate to the owner on day one |
| Post | the look, caused transitions, repairs, the flicker scan, the ramp check | a look test approved in one round | take-bound rows re-bound with the take, and linted |
| Sweeps | an independent every-frame defect hunt | the best hit rate of any review source | land before the send |

At most about 10 agents ran at once; 18 roles, 13 sweep runs and 11 restarts over the film. The director makes no
captures once shooters exist. One owner per file set.

## 2. The ops rules that would have saved the most

- **Relay.** After every owner message: a row per note in the notes ledger and the owner-notes table, then a relay
  checklist of every role it touches, written to each role's inbox (`inbox/<role>.md`) as well as the shared bus. Agents
  read their inbox at the start of every task and before queuing any take; specs are read at session start so queued
  sessions pick up late notes. One title hand-in finished before the note that changed it reached that agent; shooters
  queued takes a newer note had cancelled, 30-40 minutes of queue each. Watch shared files with `tail -n 0 -F` (a
  rewritten request file silenced a plain `tail -f` for 10 minutes).
- **Handshakes through structured status files** (`status/<role>.json`: author, cut id, commit, READY), never by grepping
  a shared log: one cut chain read the director's own log line as the sound agent's READY.
- **Bounded waits:** every wait ends on success, on a failure line, or after 15 minutes, then reads the real state.
  Never wait on the last line of a background job: an open wait on a dead task blocked the editor for 3.6 hours.
- **Liveness:** each heartbeat lists every agent's last activity; an agent silent for more than 30 minutes with no job of
  its own is hung, so restart it from its resume brief (the film builder sat idle 4.4 hours unnoticed). A heartbeat skips
  if the previous one has not finished. Delete every schedule at delivery.
- **The director's own turn stays alive:** "Continue where you left off." came three times in 16 minutes when the
  director's session kept ending its turn. Long waits are bounded loops inside the turn; a context restart resumes from
  the resume brief and the decisions file, never from the owner's prompt.
- **Provider failover:** resume briefs on disk at all times; at the first wave of refusals, restart every agent on
  another model provider within 15 minutes.
- **Machine slots:** agree the share before production and verify it is live in the tool everyone actually calls (a
  neighbour's wrapper borrowed slots for 4 hours). A fixed count of slots, with timed raises that revert; take classes
  ahead of default ahead of proofs; tickets older than 40 minutes jump ahead; one reserved slot for the director's
  finishing passes; withdraw only waiting tickets, by verified process id. Pack takes into one session (OG Snipers booted in
  130-180 s) and keep sessions under 12 minutes. **Measure and report the queue's arrival and service rates** (14 takes an
  hour arriving, 8 served) and cut work that fails preflight before it queues. Measure how many parallel captures your
  machine holds: on OG Snipers three held, four lost takes to GPU device loss, and above a load of about 60 one job at a
  time was faster.
- **Disk:** build the delete keep-list from the select files at deletion time (two shooters deleted masters that selects
  still named); caps per role; archive selects off the capture machine.

## 3. The cut chain: one resumable state machine per cut

At the director's word the edit list freezes and a chain runs it. Each stage is idempotent and restartable by name
(`--from <stage>`; one cut needed five hand-written resume scripts before the chain existed). Never edit a running script:
write a temporary file, then rename it.

1. **Lint take-bound rows:** every repair, reframe, push and look exception names its take; fail loudly when its slot's
   take changed, and re-bind in the same order that rules the new take in.
2. **Render;** scan for flicker **only the spans that changed,** verdict before strips, a cleared list by take; HOLD
   the chain on a hit until it is cleared or fixed.
3. **One finishing pass** on the reserved slot, against the locked approved look; frames in equal frames out; the title
   box against its approved comp.
4. **Mix by signature:** the mix carries the edit list's signature and is muxed only on a match; reuse an existing mix
   whose signature matches (the final cut failed its first mix check and was saved this way). Wait for the sound agent's
   READY for at most 40 minutes, then hold and say so.
5. **Remux bit for bit;** QA on the final file.
6. **Deliver to the owner's folder and check it landed:** a plain temporary name (`cut.mp4.part-12345`, never a name
   starting with a dot, which a network mount refused and then refused every new file for 10 minutes), rename, read the
   file back and compare size and checksum, retry after 10 minutes, and report "not delivered" until it is there. The
   copy is a chain stage, not a habit: twelve OG Snipers cuts never reached the owner's folder, and one "saved" claim had
   to be withdrawn.
7. **The full gate report after delivery,** as a delta (new FAIL, fixed, standing); the hard gates and the flicker hold
   already ran before the send. The independent sweep runs on the edit render while stages 3-5 run.

A rolling working cut follows select changes (at most once every 10 minutes under load) so a full-length cut always
exists. The sound is one command inside every cut build: the song untouched, payoffs timed by their attack, levelled as
heard to one target, secondary sounds at least 6 dB under, full tails, measured again on the delivered file.

## 4. Cadence

Match the owner's attention. While they are away, batch fixes and keep one current file in their folder; while they are
active, answer every burst of notes with a cut in 30-90 minutes. Short updates every 15 minutes with an image.

## 5. Where OG Snipers' 66 h 38 min went

- Brief to research launch 27 minutes; research 58 minutes; the plan's second version at 2.6 hours; the film build and rig
  ready and shooters launched at 3.1 hours; the first provisional select at 6.9 hours; the first numbered cut at 9 h 38 min.
- Three phases: hours 0-28 (three cuts, 8-10 hours apart, two changes of direction); hours 28-44 (a lost day: a
  wrong-direction round, an outage, a cut of placeholders); hours 44-66 (16 cuts a median 0.8 hours apart, 12 of them
  never watched by the owner).
- About 302 agent-hours: capture 127 (42 %), edit 49, film build 30, title and ending 26, director at least 23, sound 19,
  post 14, sweeps and critics 9, research 4.6.
- About 50 capture sessions per shipped slot (746 session folders, 584 slot jobs, 15 slots); one offered take per 4-6
  sessions. Paid generation: $2.35 of a $200 cap the owner approved.

## 6. The fifteen biggest changes (estimates overlap; the top ten together came to about 35-45 of the 66.6 hours)

| # | Change | Saves | Evidence |
|---|---|---|---|
| 1 | The owner's praise is a lock; sweeps are advice; never replace a liked shot with a filler | about 12 h | the third cut and the round that undid it |
| 2 | Design the payoff shot first, with the owner, on stills: subject size, what is out of frame, reaction timing, ramp shape | about 8-10 h | death-shot rules changed over 22 h; 64 of 100 offers after one restart were death shots |
| 3 | Settle identity on day one in one batched message: the hero and their outfit, the name on screen, the ending, the title material, the payoff count, the HUD | about 5-8 h | the hero changed at hour 11.5; title and ending redesigned three times |
| 4 | Keep a second model provider warm; fail over in 15 minutes | about 6-7 h | the outage |
| 5 | Build measuring probes (drawn skeleton, hit point, line of fire, ground) before staging | about 4-6 h | built on day 3 after two guessed tries |
| 6 | Preflight every take offline | about 4-6 h of queue | 14 an hour arriving, 8 served |
| 7 | Watch every agent; bound every wait | about 4 h | a 3.6 h blocked wait; a 4.4 h idle builder |
| 8 | Size shooting to the machine; enforce and verify the share; cap parallel captures | about 3-4 h | 4 h of borrowed slots; 4 parallel captures lost takes |
| 9 | Decide the master resolution on day one and capture at it, or keep every select seeded with a re-shoot scheduled | about 3 h and a real 4K | the 4K was an upscale |
| 10 | Never send placeholders; ask about direction in words or stills | one round (about 3 h) | a cut of placeholders the owner judged as shots |
| 11 | A notes table with a verification state per row from the first note; no known-unfixed note sent unless disclosed | about one round | 209 rows by the second cut, 136 unverified |
| 12 | Take-bound post rows fail loudly when their take changes | 1-2 h and trust | a title, a z-fight repair, a reframe |
| 13 | Match the cut cadence to the owner's attention | 3-4 agent-hours | 12 unwatched cuts, then one note redirected the death work |
| 14 | Test every spoken line against the song at plan time | about 2 h | six episodes over one callout |
| 15 | Answer "how do we speed up" with a measured bottleneck table and a scope cut, at the first "asap" | the last 1.5 h | the final was the previous cut plus three clips; the owner took it |

## 7. A budget to plan against (derived from the above, not measured)

Setup and research 1 hour; the plan with day-one answers and stills 2 hours; the film build, rig, probes and a pilot
clip with eased ramps and the payoff framing 4-5 hours; the first full real cut by hour 8-10; a good cut the owner could
stop on by hour 16-20; then polish rounds to the owner's call. On OG Snipers the cut they called final came at hour 66,
with eased ramps on 3 of 13 clips.

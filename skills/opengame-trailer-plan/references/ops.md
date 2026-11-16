# Ops: running a film team without losing half the clock

The OG Clash trailer took **47 h 06 min** from brief to final file, and **about 24 hours were idle**: four
usage-limit stops (5 h 46 min, 3 h, 10 h 53 min and 4 min), nine server-restart notices and a machine restart. Waiting
for heavy-job slots cost another 5.6 hours; 4K captures ran at a median 9.7 fps against 28-37 alone. Money was trivial
($2.79 of paid voice and effects). Machine time, session deaths and waiting were the real budget, and the owner sent
about 20 "faster", "asap" or "whats taking so long" messages in the last session alone. `opengame-production` covers the
same failure classes for building a game; this chapter is the film version.

## 1. The team shape that worked

- **Director** (the main session): plans, owns the plan, the shared shot library and the decisions; routes notes; makes
  no captures itself once builders exist.
- **Research** fans out in the first minutes (the briefs chapter); about 75 minutes of wall time for everything.
- **Two engineers in parallel** against one shot-spec contract: a film-build engineer and a capture-rig engineer.
- **Sequence builders** by contiguous shot range (an act, the arsenal, the boss), plus a **character** builder and an
  **ending** builder, an **effects lead who owns the film build**, **post** (edit, sound, the review page), **title**,
  and a **critic** per round. One owner per file set and per seam; separate port ranges per agent; at most one
  master-resolution take in flight per agent.
- Address agents by **role name** through a name-to-id table on disk, with the role in the first line of every message
  (three OG Clash messages went to the wrong agent through opaque ids).
- **One director per film.** After any restart, list your own live processes and peers before acting. A surviving copy
  of the director from before a restart ran beside its resumed self on OG Clash; both posted to the owner and their cuts
  collided.

## 2. Everything on disk

- `work/PROGRESS.log` (UTC times from `date -u`, one format), `work/REQUESTS.md` (the request bus between agents),
  `plan/DECISIONS.md` (kept current all film: OG Clash's stopped after day one), the selects, a hooks file per film-build
  deploy, the notes ledger.
- A resume brief (`briefs/RESUME-<time>.md`) at every stop, written **before** the usage limit is near. A fresh director
  restarted a nine-agent team in about three minutes from these.
- Agents write their deliverable early: half graded is better than nothing when the session dies.

## 3. Session deaths and restarts

- **Usage limits:** check the budget before fanning out more than about four agents; keep a reserve for the director
  and the final render; prefer fewer concurrent agents and cheaper models for waiters and watchers. **Schedule a resume
  at the reset time:** OG Clash sat idle 10 h 53 min because nobody was there when the limit reset.
- **A second model provider kept warm:** the OG Snipers montage lost 7 h 20 min with every agent on one provider during
  an outage. Keep resume briefs on disk and restart on another provider within 15 minutes of the first wave of refusals.
- **Server restarts:** background agents die but their transcripts persist. Resume each by message, naming its orphaned
  processes ("don't launch a duplicate; review its take"). Orphaned captures keep running; check the progress log's
  FAILED lines before claiming "nothing was lost" (5 takes had failed).
- **Long jobs under a service manager,** not inside an agent's shell: in-thread background jobs die at every restart.
  Tear down every watcher, scheduled job, auto-resume and heartbeat **at delivery** (OG Clash's re-ran five times over
  two days, rewriting the edit list and the mix).

## 4. The machine

- Heavy jobs (browsers, captures, renders, encodes, builds) go through your machine's job queue, if it has one, with
  thread caps. Agree an explicit share with any other team on the machine before production (OG Clash settled on 45 %
  film, 45 % game, 10 % other: about 7 cores, at most 2 heavy jobs, under 55 GB of RAM) and declare bursts. Restore any
  cap you lowered when the burst ends.
- Cap concurrency to what keeps takes at 5 fps or more: 10 parallel 4K jobs ran at about 1 fps and failed; 4
  well-chosen jobs beat 10. Draft at 720p; one master-resolution take per agent; one 3D render job at a time; review
  renders on a fast preset.
- Load-tolerant timeouts (a stall of 300 s or more, a boot of 420 s or more, 5 or more retries); pad scripted-run
  deadlines under load.
- **Never renice or kill processes you do not own.** The OG Clash director reniced about 70 of the game team's
  processes and could not undo it. If the owner explicitly authorises killing named stale processes, kill only those,
  by their verified process ids, never by pattern, and log the list.
- Attribute load by process tree before blaming another team; both teams misattributed load at least once.
- Expect the owner to record their own screen or upload from the same machine; keep it light then, and never upload or
  burst-render during a game deploy.
- When asked "what are you waiting on" or "what does load 110 mean": answer per resource (CPU, RAM, GPU, disk, I/O) and
  per owner, measured, in one table; then make a structural change.
- Game performance numbers taken while film jobs run are invalid. The film does not need a quiet machine (stepped
  capture drops no frames); the game's measurements do.
- On macOS, background priority throttles the capture browser (run it at normal priority); there is no `timeout`
  command by default; a script named after a standard-library module shadows it; indexing adds load; exFAT drives grow
  `._*` files.

## 5. Storage

- Render and capture on internal disk; copy masters to an archive drive with a checksum check; keep **proxies and select
  audio local** so a review cut never depends on an external drive (OG Clash's was unplugged three times).
- Fall back automatically to a local `outputs/` folder; never create a fake mount point. Store paths in selects relative
  to the project with a resolver.
- Keep a disk floor (OG Clash used 4 GB); delete rejected masters, keep proxies; use copy-on-write clones for build forks
  and duplicate masters (full private clones per flag cost about 26 GB). Build the delete list from the select files at
  deletion time: two OG Snipers shooters deleted masters that selects still named.
- Write inputs atomically; never let a renderer read a file that is being rewritten.
- Keep film assets out of folders the owner cleans; after a restart, check file-access permissions were not revoked.
- When a round starts from takes on an archive drive, link them rather than copy, and capture new takes under a new name:
  a capture that writes to a linked name writes through it and overwrites the archived original.
- When you archive a film's raw folder, write the archive's absolute path into the handoff; one later round spent 15
  minutes finding takes, and another had to re-shoot every take because the takes were gone a day after delivery.

## 6. Talking to the owner

- **Show files and pictures, not pipeline talk.** Every status carries a file, an image or a link they can open,
  verified by you first ("dont see anything on http://localhost:...").
- **A review page from hour one:** the latest cut with a frame and bar.beat readout, the timeline on bars with each
  shot's status, every take, notes, critic scores, decisions, activity. The OG Clash owner reviewed from it and their
  screenshots came back carrying "f1748 · bar 13, beat 3". Build it as a real page in the project's design system if it
  has one, and keep a latest preview file and a footage log from the first take.
- Settle the delivery size with the format: a target bitrate or size per deliverable.
- **Cadence:** a preview every 30-60 minutes even with slates; never gate a delivery on internal review loops; send the
  first slate-free cut the moment it exists, labelled "pre-review"; per-shot clips while a full cut renders; an
  alternatives sheet for every contested slot ("what are some other options for the scene we have at 7 seconds"); an
  inline 720p preview under 50 MB in the chat, not a path.
- **ETAs from measured throughput** (capture rate × frames left + overhead), with the load assumption stated. When one
  slips, say so once with the new rate and a range.
- **Never post a bare "Waiting."** (one session posted more than ten before "What r u waiting on?"). Every wait names
  what blocks, the measured rate and a clock-time ETA. On "work faster", reply within a minute with a preview or a sheet
  and the bottleneck.
- **Keep a standalone render of every special element ready** at review resolution (the title, a hero effect, a key
  insert); they ask for them by name ("show me the new title render and any new individual scenes").
- **Never recommend dropping the element they asked you to improve.** The OG Clash director offered "Clean end card
  (Recommended)" when the owner wanted a better 3D title; offer the improved version and its cost.
- **Never go silent.** If a tool call dies, say so and redo it in the same turn (OG Clash sat 24 minutes on a dead turn
  until "ok where is it?").
- A status format that worked: "New in this cut / Not in this cut yet / Still old / Who's on what", with frames,
  loudness, peak and the path.
- Answer their literal question first. Batch your questions into one message with defaults; if there is no answer, log
  the default taken and keep going.
- Late in a launch they trade evidence for speed ("do we need proof capture as a requirement rn?"): keep the review step
  cheap (one sheet, one critic), not a matrix.

## 7. Where the OG Clash time went, in order of cost

1. Usage-limit and restart idle time: about 24 of 47 hours.
2. GPU contention from unbounded parallel 4K capture: takes at 1-10 fps instead of 28-37; 5.6 hours of slot waits.
3. One shot (the horde at 0:07): six redesigns and about 46 takes over about 30 hours (a rising horde, a field of
   risers, a walking horde with heavy depth of field, the horde from the other side, a reverse angle blocked by walls, a
   side two-shot, a revert, then waist-up walkers). An animation audit and an overhead map on day one would have saved
   most of it.
4. Notes a better plan would have pre-empted: idle characters, the puppet rise, cheap effects, depth of field, screen
   direction, a too-short mechanic shot, title integration.
5. The 4K master: 2 h 29 min after approval, plus 1 h 18 min for a shot swapped after approval.
6. Finished cuts held for internal loops while the owner waited.

## 8. Lessons from the quick test trailers

- When a batch of trailers for test games was made under a brief that trimmed the method (no review rounds, extras
  skipped), most agents never ran plan, make and review-and-improve, and the trailers shipped at 5-7.5/10. The owner
  caught it by watching. Any agent that cannot call a skill reads its SKILL.md whole at that stage; the skills log proves
  the sequence; a brief never trims the method's scope without telling the owner.
- A half-built cut's takes on disk can belong to an older cut: compare every take's timestamp with the plan's and the
  rig's before building, and recapture anything older (14 of 19 takes in one case; recapture took about 3 minutes).
- A fill light cannot lift dark art in a game whose lighting multiplies the scene: measure one take's luma with the fill
  before recapturing everything; the remaining lift is a shadow curve with black held.
- A slow-motion key can be unreachable: at 0.3x one simulation frame spans 3.3 output frames, so a target on output frame
  6 flipped between 4 and 8. Pick a target the ramp can reach and check the take's own event frame.
- A take rig that loads the game inside a harness page must serve the harness, not the game, on the page's port, or the
  game loads at top level and its ready signal never arrives (a 90 s timeout that reads like a broken build).
- A matching frame count does not prove the takes on disk belong to this cut, and a backup a handoff names may not
  exist. Check timestamps and hashes, not counts.
- Before measuring an incumbent cut restored from an archive, compare its sha256 with the copy the owner received.
- Keep takes on the archive drive from the start: one film's takes and cuts were gone a day after delivery, and every
  take had to be re-shot (stepped takes repeat exactly, so it was cheap, but it was avoidable).
- Key a frame effect (a flash inversion, an accent) to the take's own logged event frame, not to the frame you asked
  the ramp to reach.

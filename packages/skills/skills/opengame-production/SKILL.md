---
name: opengame-production
description: Run a browser game build with one or many agents so the owner's feedback lands in few rounds. Covers the owner's bar written in the first hour, one ask register across handoffs, one integrator, frozen snapshots with a receipt per round, one latest playable link, status on a fixed cadence, usage limits, machine load and reference-first iconic items. Use when a game will take many rounds of owner feedback, when several agents share one game, or when rounds are slow or fixes never reach builds.
metadata:
  version: "1.0.0"
---

# Production

A game built over many rounds of an owner's feedback loses most of its rounds to
process. OC took about 190 numbered builds in 7 days. About 75 of them never became an
accepted build, about 40 for agent or process reasons, about 22 for engine limits and
about 10 for changes of taste. The owner asked "are you there", "work faster" or "how
are we still on" this round more than 80 times. To run the loop in fewer rounds, front-load the bar,
keep one record of what the owner asked, integrate in one place, and show only what a
build the owner can open proves.

Rules carry five tags; `opengame-quality-bar` explains them and the game codes. The
templates for the register, a delivery, a round receipt and a status update are in
[references/templates.md](references/templates.md).

## The first hour

Settle these with the owner before the first build, and write them into one bar file
that every agent reads. Where the owner has not decided, propose a value and mark it
proposed.

1. **Concept art per screen.** One hero frame at the player's camera for the title,
   each menu, loading, each play area, the HUD, the boss, death and results. A canon
   sheet per character: turnarounds fix identity, scene paintings only composition.
2. **The reference games.** One named shipped game per area, with a saved frame per
   screen at the same camera as the concept (see `opengame-quality-bar`).
3. **Frame rate and devices.** A floor and a typical frame rate for desktop and for
   phones, on named devices and browsers. Mainstream phones, not the oldest. A real
   phone on the desk from the first playable (see `opengame-mobile`).
4. **Budgets.** Bytes and seconds to the title and to play, first visit and returning;
   tab memory; draw calls, lights and enemies on screen; paid generation spend. Check
   the engine's fixed caps (lights, models, particles, handles) against what the
   concept needs now (see `opengame-stability`).
5. **Iconic items.** Anything players will compare with a version they know. Collect
   its reference before anyone models it.
6. **The loop.** The ask register file, the latest playable address, the build clock,
   the status interval, the agent count, the heavy-job cap and the compute share
   between teams. Who owns the frame, who owns the renderer, who integrates.
7. **Calibration.** Ask the owner to score one comparison sheet 0 to 10, so the critic
   can be held to the owner's eye from round one.

In OC each of these was found late. The first-person lens sat at 66.5 degrees against the
concepts' 50-55. A 32-light cap met 218 fire sites. The first written budget came at R79
(360 MB to the title, a 3.5 GB tab) against the owner's ask of a tab under 500 MB. The
latest playable address arrived on day 5, and the first real iPhone crash reports came
after launch.

## Rules

### The owner's bar is written down before the first build
- **Invariant:** Concept frames per screen, the reference games, the frame-rate floor and target devices, and the budgets are in one bar file before the first build, and every spec number lives in that file and nowhere else.
- **Technique:** Work through the first-hour list with the owner. Other documents link to the bar file instead of copying its numbers. When the owner raises or changes the bar, update the file that day and add a register row quoting the change.
- **Reference configuration:** OC's kickoff asked for "60fps minimum but up to 120/240fps", and the first written budget came at R79. Boss HP in code was 60,000 against a spec of 400,000; the boss had 3 phases against 4; gate angles changed 3 times across 3 agents. The character canon said 2.2 heads tall where the turnaround measured 2.7. The owner, briefing the film team: "i do NOT want to have to keep watching shitty takes and giving u feedbaxk thqt u should be able to know ill give u".
- **Applies when:** Every game an owner will review over more than a few rounds.
- **Verify:** Grep the repository for each spec number: it appears in the bar file and in the code that reads it. A new agent answers "what is the phone frame-rate floor" from the file alone.

### Done means it shows in a build the owner can open
- **Invariant:** Nothing is reported to the owner as done until it is seen or heard in a promoted build at the latest playable address, reached through the real menu, with a capture as proof.
- **Technique:** Track each change through written, merged, built, seen in the built round, and promoted. Report only the last two as done and call the rest in progress. Declare a launch build only when every top-priority register row is closed with proof from that build. See `opengame-verification` for proving a change ran.
- **Reference configuration:** OC's reports of work never seen in a build are in `opengame-verification`. One register sync closed 4 of about 330 rows. "Launch build" was declared at R164, R181, R184, R186, R187, R193 and R196.
- **Applies when:** Every report to an owner, every round.
- **Verify:** Every "done" in a status update links a capture from the promoted build that the same update names.

### One ask register that every handoff reads first
- **Invariant:** Every request the owner has made is a row in one file, in the owner's own words, with a status and evidence, and every agent that takes over reads it before working.
- **Technique:** Turn each new owner message into rows before starting work. A row holds the quote, the date, the class it belongs to, the status (fixed, partial, not fixed, cannot check yet) and the build and capture that prove it. Add only asks the owner made, and check a relayed decision against the owner's quote before acting on it. Close the top-priority rows before taking new scope.
- **Reference configuration:** OC built its register on day 5 from 384 owner messages spread over several agent threads, which gave 179 requirements; "66 of 67 inherited acceptance rows remain open" after about 25 handoffs. It grew to 331 rows with 321 open, so a register alone does not close asks. One orchestrator told workers the owner had asked "several times" for a plain rifle; he had not. New game modes were added while the frame-rate floor and phone boot were still open.
- **Applies when:** Every project with more than one agent session or more than a day of feedback.
- **Verify:** Pick owner messages at random from the chat history: each maps to a row with a status and an evidence link.

### One integrator merges every change
- **Invariant:** One agent merges every change into the source that rounds are built from. Workers deliver small patches against a named base and never edit the integration tree.
- **Technique:** Each delivery is a patch, the base commit or file hash it was written against, the files it touches, and a capture or test from the worker's private copy. The integrator merges three-way, sends back any delivery on a stale base, has an agent that did not write it review each one for defects, and lands it inside the open round. Run one worker per stream and one root at a time, with a lock file for the root.
- **Reference configuration:** OC once had 19 workers staging dozens of patches while 66 of 67 gates stayed open from 03:18 to 21:12. A stale-base delivery reverted a feature and broke 2 builds. With two teams sharing builds, rounds went from about every 15 min to about every 40. From R138 one integrator with a review per delivery ran the loop; every review found a real bug, and film notes went from waiting on a shipping round to 10 of 11 shipped in about 36 h. Before that, duplicate workers ran in 9 or more streams and two roots ran at once for 27 min.
- **Applies when:** Any build with more than one agent writing code.
- **Verify:** The integration branch has one committer, and each merge links its delivery's base hash and review.

### Rounds are frozen snapshots on a fixed clock, each with a receipt
- **Invariant:** Each round is built from an instant copy of the integrated source taken at a set time, nobody edits that copy, and the round's receipt says what is in it.
- **Technique:** Cut on a clock agreed with the owner. Take the snapshot as a commit or a copy-on-write clone so the freeze lasts seconds. A change that misses the cut goes in the next round. Write a receipt per round with the source commit, build id, file hashes, the register rows it addresses and its test results. Promote only after a smoke test through the real menu with real input.
- **Reference configuration:** OC agreed a 25-min build clock with sub-minute snapshot freezes, after code freezes of about 20 min per build had slowed the loop. An optic fix landed 9 min after the R91 snapshot and shipped a round late; one cut came 2 h late while private builds held the slots; snapshots failed when source changed during the build at R166, R186 and R189-R190. OC built from frozen source clones from R90, checked 701 artifacts per build from R108, and smoke-tested 60-90 s of normal play before promotion.
- **Applies when:** Every project with more than a handful of rounds.
- **Verify:** For any promoted round, the receipt's hashes match the served files and the snapshot time is later than every commit in it.

### One latest playable address
- **Invariant:** One permanent address always opens the newest promoted build, every round also keeps its own address, and the sender opens a link before sending it.
- **Technique:** Serve builds from a supervised server on a fixed host and port, started outside any agent session so agent restarts leave it running. Promotion moves the latest address to the new round; older rounds stay at their own paths for comparison and rollback. Label an unpromoted build as untested when you share it. Show the build id on screen in the game.
- **Reference configuration:** OC's owner asked which localhost was the latest about 12 times. A latest address existed only from day 5, and it was then down for 3 days. "Localhost not up" was reported 6 times, and agent restarts killed preview servers up to 9 times a day, 20-40 min each. The stable build was not promoted from R96 to R137. The owner: "every time a new round is ready show me the build link where i can play it".
- **Applies when:** Every project where the owner plays builds.
- **Verify:** Restart every agent session: the latest address still serves the newest promoted build, and its on-screen build id matches the last receipt.

### A usage-limit death loses nothing
- **Invariant:** When every agent stops at once, the work done so far is on disk, committed or saved as a patch, and fresh agents resume from the files alone.
- **Technique:** Keep concurrent agents under the account's usage budget. Commit or save a patch often. Keep a brief per role on disk and a ledger line per unit of work, and have each handoff name the predecessor's last line and last report. Run builds and long jobs detached from agent sessions. After a death, start fresh agents from the reports on disk rather than resuming dead contexts.
- **Reference configuration:** OC had about 25 whole-team usage-limit deaths in about 7 days, each stopping 8-25 agents in the middle of edits and leaving 27-211 dirty files; about 36 of the 160 hours before launch made no progress. Each new wave spent 20-60 min re-auditing. Cutting from 20 agents to 17 did not prevent the next death; the root later capped itself at 4. One orchestrator died having committed nothing, and its diffs survived only as patch files. OC commits every 20-30 min.
- **Applies when:** Every build that uses agents on metered accounts.
- **Verify:** Stop every agent at a random moment: fresh agents resume from the files and lose no more than the commit interval.

### Heavy jobs are capped against load, and measurements wait for a quiet window
- **Invariant:** Builds, browsers, captures and renders run under a job cap set from the machine's cores, load and free disk, and every performance number comes from a run with no competing heavy work.
- **Technique:** Run heavy jobs through one slot wrapper whose cap someone set from the hardware. Agree the compute share between teams in writing before production. Log competing CPU with every perf run and reject runs over the limit. Keep a free-disk floor and pause captures before it. Schedule quiet windows for perf work, measure interleaved A/B pairs inside them, and leave screenshot frames out of timing.
- **Reference configuration:** OC's 16-core machine ran at load averages of 150-361, with 19-36 jobs waiting for 3-6 slots; the slot cap "was just a default". Jobs hit their own timeouts while waiting, free disk fell to 400 MB and killed a run, and the owner's own play lagged. The perf-run rejection rule and OC's false regression are in `opengame-verification`. The game and film teams agreed a 45/45/10 split after more than 40 h of contention, and quiet windows blocked builds for 20-60 min each.
- **Applies when:** Every project running several agents, browsers or renders on one machine.
- **Verify:** Each perf result prints the load and competing CPU during its run, and the wrapper's log shows the cap held.

### Batch the owner's feedback and sweep the class
- **Invariant:** Each owner message or play session becomes register rows, each fix covers every instance of its class, and the batch lands in one round instead of one item per round.
- **Technique:** Read the whole batch before starting. Name each item's class and list its members. Split the batch across workers in parallel, integrate it in one round, and reply per item with the round and a capture. Ask the owner only what blocks a decision; decide the rest and say what you decided. When tuning a value the owner disliked, change one variable at a time.
- **Reference configuration:** OC's owner sent a 50-item play-test list on day 2. "we should NOT just be fixing things piecemeal if i send you one example you should be sweeping to make sure by yourself that doesnt exist with anything else of the same thing." The class sweep and OC's gun numbers are in `opengame-quality-bar`. Difficulty swung from "not even killing me" to death in 0.37 s, then settled at 3 hits to down once changes were made one at a time. On day 7: "im not gonna answer any more questions, ive asked for this to be fixed many times".
- **Applies when:** Every owner message with more than one item, and every report about one member of a set.
- **Verify:** The reply to a batch lists every item with its round and capture, and each class fix links a sheet of all its members.

### Reference first for iconic items
- **Invariant:** An item with a canonical look (a famous weapon, a real vehicle, a known creature) is built from measured reference of the real shape before its first build, and judged side by side with that reference under one camera.
- **Technique:** Collect a reference model or several orthographic views first. Extract proportions and a materials list, match the reference camera, compare silhouettes from the side, top and back, and write a beat-by-beat spec for how it animates. Keep reference files and trademarked names out of the shipped build.
- **Reference configuration:** OC's Ray Gun went through about 14 builds made from a texture sheet and a 64 px icon, and the owner rejected all of them in one message. The agent: "I built the earlier version without enough reference work." It passed only after the owner sent 6 images and the proportions were measured; the numbers are in `opengame-weapons`.
- **Applies when:** Every item the owner or players will compare with a version they already know.
- **Verify:** A split-view sheet shows reference and build under one camera with the silhouette overlap.

### Status on a fixed cadence
- **Invariant:** The owner hears from the project at an agreed interval, and each update says what to play, what changed and what is next, with the link and the comparison sheets shown inline.
- **Technique:** Agree the interval in the first hour. Post improved, failing and next, with sheets as images, never file paths or hashes. Skip an update with no news, and do not go quiet past the interval: say what is running and when it lands. A blocked agent names the exact blocker and what it needs, or moves to the next item.
- **Reference configuration:** OC's owner asked for updates every 10-15 min. About 60% of one transcript was heartbeat boilerplate ("why do you keep sayin gno change?"). One agent spent about 11 h reporting an old blocked status and then wrote: "There's no current code or permission blocker... That was my mistake."
- **Applies when:** Every project where the owner waits on rounds.
- **Verify:** The update log has no gap longer than the agreed interval, and each update has a link and at least one sheet.

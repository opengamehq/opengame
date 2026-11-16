# Tools for a team of agents on one machine

Each of these is small (tens of lines) and each replaced a written rule that agents kept
breaking. They are described here so you can write them for your own machine; none of
them needs anything beyond a shell, `flock`, git and Node. Numbers are from OS, LC and OH,
which ran 6 to 30 agents on one shared GPU machine.

## The slot queue

A first-come queue in front of the machine's heavy-job slots, for every browser, build,
render, bake and capture.

- Each waiter writes a queue file named by priority, arrival time and its PID. Dead
  waiters are swept by checking their PID is alive. The first live waiter takes one of N
  slot files with a non-blocking `flock` and then `exec`s the job, so the kernel frees the
  slot when the job exits, whatever way it exits.
- N comes from a count file someone set from the hardware. Never raise it to get a job
  through faster; if another project shares the machine, the split is agreed and both
  sides read the same file.
- An urgent lane that jumps the queue, granted only for a capture that gates a fix to
  something the owner saw broken. A quiet lane that waits until every slot is free and
  the machine's load and GPU use are low, then takes them all for a timing run (LC: load
  under 6 and GPU under 15%, for at most 10 minutes).
- It prints "slot N after Ns" when it grants, the only wait telemetry LC had. LC's median
  wait fell from 279 s to about 100-140 s once each lead ran one job at a time.
- Put any timeout inside the slot, around the job. A timeout around the queue counts the
  wait, and on OS it killed at least five jobs that had not started.
- A priority lane needs ageing: on OS, unflagged work starved for 8.5 h under release
  priority until normal jobs were promoted after 60 minutes.

## Starting a job and waiting for it

A pair of commands every agent types instead of a loop written by hand (LC's leads typed the
loop about 2,400 times).

- `start NAME -- command`: runs the command through the slot queue, detached from the
  agent's shell, records its PID, the commit of the tree it built from, and writes a
  began mark, then an ended mark with the exit status beside its log.
- `wait NAME --max SECONDS`: returns within the agent host's tool limit with the job's
  state, so the agent polls it from inside its own turn. A notification may never wake a
  turn that has ended, so a job left behind an ended turn reaches nobody.
- Build from an archive of the commit plus your own files at the moment the slot is
  granted, never from the shared working tree, or an edit made while queued changes what
  runs.

## The sync script

The only way any agent pulls or pushes, when streams commit their own paths.

- Takes a lock with a timeout, fetches, merges without an editor (aborting and retrying
  on a conflict, a few times), and pushes.
- Unstages any path left staged for more than a few seconds, since one stray staged path
  blocked every merge on LC.
- Commits elsewhere always name their paths (`git add -- paths` and `git commit -- paths`
  in one line). With that, LC made 2,317 commits in four days with zero merge conflicts.

## Retention

- A dry run by default; the real run needs a flag.
- Keeps anything marked to keep, anything a document or report cites, anything younger
  than a few hours, and the newest few builds per lane.
- Archives captures older than a day with a checksum verified on the archive copy before
  removing the original. Never follows links and never touches source material or
  masters. Writes a receipt listing every path removed.
- LC's removed 446 GiB of builds; OH's freed 147.9 GiB. OS's earlier scripts, which
  deleted by age, removed cited evidence three times in one day.

## The preview service

- A supervised user service in its own clone, outside every agent session, so restarts
  and outages leave it running.
- Every few minutes: fetch, move to the main branch's tip, build. A failing commit is
  skipped and the last good build stays up. It writes the commit and build time it is
  serving where the game can show them.
- Swaps the served folder atomically and keeps the previous build's hashed files for a
  few hours, so a page still loading never mixes two builds.
- Logs only the visiting browser's family, so the lead knows when the owner is playing.

## The publish script

For a project that publishes release trains rather than main's tip.

- Refuses without a passing receipt for that exact snapshot: a short smoke through the
  real menus (OS's took about 90 s), a GPU tour, and a soak with minutes of real play.
- Refuses an older round, a dirty tree or a shader compile error. A step passes only when
  its exit status and the receipt it wrote this run agree; any disagreement is incomplete
  (one OS tour exited 1 while its receipt said ok).
- Holds a lock, so there is one publisher. Serves each publish under its own stamped
  path. After publishing, hashes what the server returns from outside and compares it
  with the receipt.

## What each failure taught, in one table

| Failure | Game | What fixed it |
| --- | --- | --- |
| Every worker and the lead on one account; a rate limit stopped all of them | OS, LC | At most a few workers per pool, the lead on another pool, staggered starts |
| A scheduled steer kept an old instruction for 10 hours | OS | Steers regenerated from the owner's latest words in the same turn |
| Half-finished edits broke the shared build about 15 times in two days | OS | Temporary file and rename, a compile-and-boot check before landing, debug tags refused |
| Snapshots hard-linked to the live build were rewritten | OS | Snapshots copied, never linked; tainted snapshots refused |
| Raw captures in the repository slowed every agent's start | OS | Captures kept outside the repository |
| 257 builds from an uncommitted tree | OS | Hourly checkpoints by the lead |
| A build published with no evidence put a crash in the owner's hands | OS | Soak before publish, receipts decide |
| One blocking question held the team for 7.5 hours | OS | Ask in plain text with a default and keep working |
| A status file wiped by a script that opened it for writing first | LC | Read, then write to a temporary file, then rename |
| One lead committed over another's half-written file | LC | Commits name their paths; check and act in separate calls |
| New leads started after an outage could not find the old ones' work | LC | Resume each agent in its own thread with a take-stock |
| A tool's help flag ran a real prune, and another's bought voice readings | OS, LC | Dry runs first; help flags treated as untested |

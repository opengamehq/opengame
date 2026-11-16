# Templates

Plain files on disk, so a fresh agent can pick them up after a usage limit, an outage or
a restart. Keep them in the repository beside the bar file.

## Ask register row

One row per ask. The quote is the owner's own words, copied from the raw message, never
from a summary. Rebuild the rows from an export of every owner message after each burst.

```
| id | first | repeats | quote | rule for every instance | priority | status | round | evidence |
| A-41 | 18 Oct | 19 Oct, 21 Oct | "never load any low poly versions of guns ANYWHERE" | no gun on any path shows a stand-in | P0 | partial | R92 | sheets/r92-guns.png (box spin still shows a stand-in) |
| A-58 | 20 Oct | | "make the hud bigger" (superseded by A-77, "hud way too big now") | do not revive | | closed | | |
```

Status is one of open, in progress, verify, fixed, partial, not fixed, cannot check yet.
"Fixed" needs a capture from a promoted round, taken by someone who did not build the fix.
A predecessor's "done" enters as "verify". A repeat goes in the repeats column of the
existing row and marks the last fix as failed. A relayed request gets a row only after
someone finds the owner's own message for it.

## Decisions file

Dated, in the owner's words, pasted into every judge, generator and worker brief.

```
Owner decisions. Must not reverse even if critics ask.
2026-10-21  "the default rifle spawns with the rainbow camo for new players"
2026-10-22  "one wide door on the warehouse, not two"
Spec facts. Do not penalise: no HUD in cinematics; the night is black where nothing is lit.
```

## A brief for a lead or worker

What a new agent reads first. Short, ordered, and complete enough that it never needs to
ask.

```
You are the <stream> lead of <game>: <genre, renderer, players>. You own <paths>; you never
edit <neighbours' paths>. You answer by request files and the head of your status file.
Do not ask anyone questions and do not wait for an answer: decide, say what you decided,
go on.

THE OWNER'S WORDS (in force): "<goal, exact>"; <date>: "<note, exact>" (<measured state>).
The owner plays <exact path: build, saved settings, window, line, input>. Main is what the
owner plays; anything found worse in play is taken back at once.

WHERE IT STANDS: on main, each with its take-back flag: <x>. Off: <y, why>. Not done: <z>.
Budgets: <bytes before the menu; frame time; memory>.

READ FIRST, in order: the team rules, the ownership table, the rulings written for you
(they bind), the head of your status file, your request files newer than a day.

RULES IN SHORT: open every capture yourself at full size; heavy jobs only through the slot
queue, one at a time, under the cap, waited for inside your turn; never signal a process
you did not start and check; no credential printed; nothing bought without a dry run;
commits name your paths; a default only with its take-back flag and a plain boot of the
tree that was booted; never time through a tool that changes the game; commit after every
job; after a few jobs, write the handover.

YOUR WORK, IN ORDER: JOB ONE: <the owner's oldest open note, with its pass test>. JOB TWO:
... LAST JOB: the handover.

NOT YOURS: <neighbour: what, paths>. Ask by request file.

REPORT, after every job: what nobody could see or hear, first; what is wrong; what you
saw and what you did not; every flag with its take-back; budgets before and after; every
command, so the next agent can repeat it; what needs the lead's word.
```

## Handover

At the top of the stream's status file, written before the context fills.

```
HANDOVER <time UTC> <agent>
Owner's open notes: A-41 (partial: box spin still shows a stand-in), A-57 (not started)
On main and seen: hip sizes per class (captures/r164-hip.png)
Behind a flag, unseen: ?optic2 (new scope housing), take-back ?optic0
Rulings in force: "hands never change size" (owner, 21 Oct)
Next commands: <exact commands, in order>
Pipeline notes: the bake needs the slot for about 6 min; run it alone
My mistakes this sitting: reported A-41 fixed from a test before opening the capture
```

## Take-stock after an outage

Each stopped agent runs this in its own thread before doing anything else.

```
1. The time now, in UTC.
2. The head of my status file and my unanswered request files.
3. My uncommitted changes, my own paths only: for each, was it booted? If yes, commit it
   as the tree that was booted; if not, keep it behind its flag off or take it out.
4. My slot jobs from before the stop: read their end marks and logs. Never signal a
   process I cannot verify as my own job's.
5. Commits since the stop, from everyone.
```

## Delivery note

What a worker hands the integrator with each patch, when there is one integrator.

```
stream: weapons-optics
base: 3f2a9c1 (or the sha256 of each file the patch was written against)
files: src/weapons/optics.ts, assets/guns/manifest.json
register rows: A-41, A-57
pair condition: scope housing visible AND no new shimmer in the scoped pan
proof: captures from the worker's private copy, with the build id on screen
known gaps: third-person view not captured
```

The integrator sends back any delivery whose base is older than the current
integration tree for the same files.

## Round receipt

Written when the round is cut, before anyone tests it.

```
round: R164
snapshot: 2026-10-20T23:40Z, source commit 8e01d77
build id shown in game: R164-8e01d77
files: manifest of path and sha256 for every shipped file
addresses rows: A-12 (fixed), A-41 (partial), A-57 (not fixed)
smoke test: menu to match to results through real input, result and log path
soak: every level through the real picker, a full match, result and log path
promoted: yes, latest playable now points here
```

After a deploy, hash what the server returns and compare it with this manifest.

## Status update

Sent at the agreed interval. Images go in the message itself.

```
Play: <latest playable address>, serving R164 (8e01d77), built 23:58Z. I booted it plain: in play, no errors.
Try: the warehouse level with the rifle, and listen for the reload on the second magazine.
Verdict: hip sizes are right; the phone still reloads at the end of the load bar.
Seen myself: hip size per gun class matches the reference frame (sheet attached)
Taken from the weapons lead's film, not opened by me: the new bolt animation
Still not right: real iPhone reloads at the end of the load bar; cause narrowed to texture memory
Running: phone memory fix, reload sweep. Waiting: nothing on you.
Flags worth trying, each gives the old behaviour back: ?optic2 (take back with ?optic0)
Nobody has heard the new reload sounds or played on a pad.
Decided without asking: kept Ultra as the default and added a one-step fallback to High
```

Leave out hashes beyond the one served, internal stream names and heartbeats with no
news. Lead with a correction you owe or an outage before anything else.

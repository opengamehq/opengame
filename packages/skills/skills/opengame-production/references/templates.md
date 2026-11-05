# Templates

Plain files on disk, so a fresh agent can pick them up after a usage limit or a restart.
Keep them in the repository beside the bar file.

## Ask register row

One row per ask. The quote is the owner's own words, copied from the message.

```
| id | date | quote | class | priority | status | round | evidence |
| A-41 | 18 Oct | "never load any low poly versions of guns ANYWHERE" | every gun, every path that shows one | P0 | partial | R92 | sheets/r92-guns.png (box spin still shows a stand-in) |
```

Status is one of fixed, partial, not fixed, cannot check yet. "Fixed" needs a capture
from a promoted round. The class column names what the sweep covers. A relayed request
gets a row only after someone finds the owner's own message for it.

## Delivery note

What a worker hands the integrator with each patch.

```
stream: weapons-optics
base: 3f2a9c1 (or the sha256 of each file the patch was written against)
files: src/weapons/optics.ts, assets/guns/manifest.json
register rows: A-41, A-57
proof: captures from the worker's private copy, with the build id on screen
known gaps: third-person view not captured
```

The integrator sends back any delivery whose base is older than the current
integration tree for the same files.

## Round receipt

Written by the integrator when the round is cut, before anyone tests it.

```
round: R164
snapshot: 2026-10-20T23:40Z, source commit 8e01d77
build id shown in game: R164-8e01d77
files: manifest of path and sha256 for every shipped file
addresses rows: A-12 (fixed), A-41 (partial), A-57 (not fixed)
smoke test: menu to match to results through real input, result and log path
promoted: yes, latest playable now points here
```

After a deploy, hash what the server returns and compare it with this manifest.

## Status update

Sent at the agreed interval. Sheets go inline as images.

```
Play: <latest playable address> (R164, promoted 23:58)
Improved: hip size per gun class now matches the reference frame (sheet)
Failing: real iPhone still reloads at the end of the load bar; cause narrowed to texture memory
Next: R165 at 00:25 with the phone memory fix and the reload sweep
Decided without asking: kept Ultra as the default and added a one-step fallback to High
```

Leave out hashes, internal stream names and heartbeats with no news.

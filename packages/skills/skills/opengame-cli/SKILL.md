---
name: opengame-cli
description: Drive the OpenGame command line tool from an agent. Covers installing it, signing in with the person, every command, JSON and JSONL output, exit codes, findings and how to retry. Use when the person mentions the opengame command, the OpenGame CLI, installing @opengamehq/cli, opengame login, check, dev, deploy, status, submit, releases, rollback, unpublish, restore, delete, details, achievements, handle, jam or token, or a command exited with an error you need to read.
metadata:
  version: "1.7.0"
---

# Use the OpenGame CLI

OpenGame opens on {{launch opens}}, and the CLI on {{launch kickoff}}. Until {{launch kickoff}}, every command except `version`, `help`, `login`, `logout` and `whoami` prints
"OpenGame opens for creators on {{launch kickoff}}." for anybody outside the OpenGame team, and exits with the
`not_launched` code (7) that `opengame help --json` lists. That is the platform's answer,
not a broken install: tell the person, and do not retry, reinstall or look for a way round it.

For the whole deploy procedure, read `opengame-deploy`. This skill is the reference
for the tool itself.

## Install

{{install cli-agent}}

Once `opengame` is installed, confirm it and read the command reference:

```bash
opengame version --json
opengame help --json
```

`help --json` is the authority on commands, flags and exit codes for the version that
is installed. Read it before using a flag this page does not show.

## Sign in with the person

```bash
opengame whoami --json
```

If that exits 3, start a login. In JSON or agent mode it prints a URL and a code and
exits 3 with `login_pending` straight away:

```bash
opengame login --json
```

Give the person the URL and the code. They open it, type the code and press Allow
access; you cannot approve it for them. Once they say they have, finish:

```bash
opengame login --continue --json
```

`login_expired` or `no_pending_login` means start again with `login --json`.

For CI, use a token the person makes in their browser with `opengame token create`,
supplied as `OPENGAME_TOKEN` or on standard input with `--token-stdin`. Never put a
token in a command argument, a file in the project, a log or a reply.

## Commands

| Command | What it does |
| --- | --- |
| `opengame init [dir]` | Create opengame.json for an existing game. |
| `opengame check [dir]` | Find local build and asset problems before uploading. |
| `opengame dev [dir]` | Serve a local export with the game runtime's headers. |
| `opengame login` | Sign in through the browser. |
| `opengame deploy [dir]` | Build, check and upload a release to a private preview. |
| `opengame status [dir]` | Show the latest deploy for this folder, with its findings. |
| `opengame deployments [dir]` | List the linked game's deploys, newest first. |
| `opengame open [dir]` | Open the linked game's private page. |
| `opengame submit [dir]` | Send one release to review, and enter it in a jam. |
| `opengame jams [slug]` | List open jams, or show one jam's tracks and flags. |
| `opengame jam <withdraw\|reenter>` | Withdraw the linked game's jam entry, or put a withdrawn one back. |
| `opengame releases [dir]` | List the linked game's releases: which is live, which were live before, and which can be made live again. |
| `opengame rollback <release>` | Make a release that was live before live again, for every player. |
| `opengame unpublish [dir]` | Take the linked game off the gallery and stop serving it. Reversible. |
| `opengame restore [dir]` | Put a game the person unpublished back on the gallery. |
| `opengame delete [dir]` | Delete the linked game for good, with its title typed to confirm. |
| `opengame achievements [retire <id>]` | List the game's achievements, or retire one. |
| `opengame details [dir]` | Print the game's title, tagline and description as the website shows them, or change them. |
| `opengame handle <name>` | Rename the person's handle. |
| `opengame games` | List your games and their latest deploy. |
| `opengame link [dir]` | Connect this folder to an existing game. |
| `opengame pull [dir]` | Bring website metadata into this folder. |
| `opengame stats [game or dir]` | Read a week of analytics for a game you own. |
| `opengame whoami` | Show the account and permissions for this token. |
| `opengame token create, list or revoke` | Manage tokens, in the browser. |
| `opengame logout` | Revoke this device's token and remove it. |
| `opengame limits` | Show bundle limits and the account's remaining allowance. |
| `opengame vendor [dir]` | Make a separate export with dependencies downloaded and pinned. |
| `opengame skills add or list` | Install the OpenGame skills for a coding agent. |
| `opengame upgrade` | Install the current CLI, or print the line that does. |
| `opengame version` | Print the CLI version. |

## Roll back

When a new version of a live game is broken, `opengame releases --json` lists every
release with `rollback: true` on the ones that can be made live again. Confirm with the
person which one they want, then run `opengame rollback <release> --yes --json` with the
eight characters the list prints or the whole id. It changes what every player gets from
their next load, so never run it without the person's go-ahead, and never to undo a
refusal: a release that was never live goes through `opengame submit`. It needs a token
with `read` or `deploy`, and `submit`, which `opengame login` gives. A refusal's `message`
says why, for example the game is not live, or a release is being published right now. If
it answers `host_failed`, run the same command again: the second run writes only the
game's address.

## Take a game down, or put it back

`opengame unpublish --yes --json` takes the linked game (or `--game <id>`) off the gallery
and stops serving it; its build, uploads and review record are kept. `opengame restore
--yes --json` puts a game the person unpublished back, serving the version it was on. Both
change what every player gets, so run either only when the person asks for it. Both need a
token with `read` or `deploy`, and `submit`, which `opengame login` gives. A refusal's `message` is the website's
own reason, for example the game is not on the gallery, OpenGame took it down, a report is
open, or it is under a hold. Do not try to get round one: write to team@opengame.io is the
way on when the message says so. `unpublish_incomplete` and `restore_incomplete` mean the
first half happened; run the same command again.

`opengame delete --title "<title>" --yes --json` deletes a game for good. It cannot be
undone, so run it only when the person has asked for that game to be deleted, and pass the
title they confirmed rather than reading it off the game yourself. Unpublishing is the
reversible way to take a game down; offer it first. Delete works only with the `opengame
login` token. `delete_refused` says why, for example a legal hold or a reviewer holding it.

## Change a game's words, or the person's handle

`opengame details --json` prints the title, tagline and description the website shows.
`opengame details --title "<text>" --tagline "<text>" --description "<text>" --json` saves
any of them, as the Details tab does; a field left out stays, and `--clear-tagline` removes
the tagline. On a published game players
see it at once, so change only what the person asked for. To keep `opengame.json` in step,
run `opengame pull` afterwards. `opengame handle <name> --yes --json` renames the person's
handle. Ask first: their old handle stays theirs and is never reissued, and renames are
limited per day. It works only with the `opengame login` token, not a token made in
settings. A refusal's `message` says why, for example the name is taken.

## Retire an achievement

Removing an achievement from `opengame.json` does not switch it off. `opengame achievements
--json` lists them; `opengame achievements retire <id> --yes --json` retires one when the
person asks. Players keep what they unlocked, and declaring it again and deploying turns it
back on. Retiring needs `deploy` and `submit`, which `opengame login` gives.

## Withdraw a jam entry, or put it back

`opengame jam withdraw --yes --json` takes the linked game's entry out of the jam and frees
its place; the entry, its build and its certifications are kept. Run it only when the person
asks. `opengame jam reenter --json` puts the newest withdrawn entry back while the jam is
open, with the same reference and build. Both need `read` or `deploy`, and `submit`.
`at_entry_limit` means every place is taken: ask the person which entry to withdraw first.
`reenter_closed` means the jam is not taking entries; wait for it to open, and do not
re-enter after it closes. `jam_entry_taken` means a newer entry of the game is already in.

## Stats as a file

`opengame stats --csv week.csv` writes the week's figures as the CSV the Stats tab
downloads; it takes the same `--game` and `--period` and never writes over a file.

## Read the output

Add `--json` for one final object, or `--jsonl` for progress events with the result
or error as the last line. Every result has `type`, `ok`, `findings` and `notices`. A
success carries its values in `data`. An error carries `code`, `message` and, where it
helps, `retry`, `retryAfterSeconds` and `next`, the command to run next.

| Exit | Name | What to do |
| --- | --- | --- |
| 0 | `ok` | Done. A deploy with `data.done: false` is still being checked; follow it with `opengame status --watch --json`. |
| 1 | `check` | The game needs a change. Read the findings, fix, and run each finding's `verify` command. |
| 2 | `input` | A flag, a choice or a different command is needed. The message names it. |
| 3 | `auth` | Sign in, or use a token with the right scope. Run the error's `next` when it has one. |
| 4 | `rateLimited` | An allowance is used. Wait `retryAfterSeconds`, then run the same command. |
| 5 | `server` | Our side or the network; the game is fine. Follow `retry`. |
| 6 | `upgrade` | This CLI is too old. Run `opengame upgrade --json`. |

`not_launched` has an exit code of its own, listed by `help --json`. Branch on the
error's `code` rather than the number wherever you can.

## Act on findings

Each finding has `fault`, `certainty` and `retry`:

- `fault: game`: make the change its `fix` describes, then run its `verify` command.
- `certainty: heuristic`: check the evidence before changing code that works.
- `fault: platform`: leave the game alone and follow `retry`. `now` means run the same
  command again, `later` means wait, and `after-fix` or `never` means waiting will not
  help, so read `fix`.

Keep retries bounded. If the same platform failure repeats, give the person the
command, the error code and the evidence instead of trying again.

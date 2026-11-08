---
name: opengame-cli
description: Drive the OpenGame command line tool from an agent. Covers installing it, signing in with the person, every command, JSON and JSONL output, exit codes, findings and how to retry. Use when the person mentions the opengame command, the OpenGame CLI, installing @opengamehq/cli, opengame login, check, dev, deploy, status, submit or token, or a command exited with an error you need to read.
metadata:
  version: "1.0.4"
---

# Use the OpenGame CLI

OpenGame opens on 17 November 2026, and the CLI on 18 November. Until 18 November, every command except `version`, `help`, `login`, `logout` and `whoami` prints
"OpenGame opens for creators on 18 November." for anybody outside the OpenGame team, and exits with the
`not_launched` code (7) that `opengame help --json` lists. That is the platform's answer,
not a broken install: tell the person, and do not retry, reinstall or look for a way round it.

For the whole deploy procedure, read `opengame-deploy`. This skill is the reference
for the tool itself.

## Install

The CLI is not on npm yet. If `opengame` is not installed, stop and tell the creator to write to team@opengame.io for a copy.

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

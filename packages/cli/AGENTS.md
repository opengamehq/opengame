# OpenGame CLI: guidance for agents

How a coding agent deploys a creator's game with the `opengame` command. The command and exit code tables at the end are the CLI's own help; `opengame help --json` has every flag.

<!-- generated:procedure -->
Deploy the creator's game to a private preview, give them its link, and submit it only when they ask. Read each command's result before you run the next one.

## Install

```bash
npm i -g @opengamehq/cli
```

Once `opengame` is installed, confirm it and read the command reference:

```bash
opengame version --json
opengame help --json
```

`help --json` lists every command, flag, exit code, environment variable and event, with the finding schema. Read it rather than guessing a flag.

Install the OpenGame skills for the agent you run in, from the game folder:

```bash
opengame skills add .
```

The CLI talks to `https://opengame.io`. Never put a token in a command argument, a file in the repository, a log or a reply. For CI, set `OPENGAME_TOKEN` or pipe the token with `--token-stdin`.

## Output

Every command takes `--json`. When stdout is not a terminal, or `CI`, `CLAUDECODE` or another agent's variable is set, `--json` is the default. A command then prints one object:

```json
{
  "type": "result",
  "command": "deploy",
  "data": { "state": "queued", "done": false },
  "ok": true,
  "url": "https://opengame.io/settings/deployments/<id>",
  "next": "opengame status --watch",
  "findings": [],
  "notices": []
}
```

An error has `"type": "error"`, `"ok": false`, a `code`, a `message`, an `exitCode` and, when there is one, a `next` command to run. `--jsonl` streams one event per line instead: `progress`, `notice`, `finding`, then a `result` or `error` last. In either mode there are no prompts and no browser opens.

| Exit | Meaning | What to do |
| --- | --- | --- |
| 0 | Done | Read `data`. `data.done: false` means the server is still working. |
| 1 | The game needs a change | Fix each finding, then run its `verify` command. |
| 2 | The command needs input | Read the message. It names the missing flag or choice. |
| 3 | Sign in, or a token with the right scope | Run `next` when the error has one. |
| 4 | An allowance is used up | Wait `retryAfterSeconds`, then run the same command. |
| 5 | Our side or the network | Leave the game as it is. Run `next` when the error has one; otherwise wait and retry, at most a few times. |
| 6 | The CLI is too old | Run `opengame upgrade --json`, then the npm command in `data.command`. |
| 7 | OpenGame is not open to creators yet | Stop. Tell the creator the CLI and uploads open on 18 November. |

## Sign in with the creator

```bash
opengame whoami --json
```

Exit 0 means a saved login works. Exit 3 means start one:

```bash
opengame login --json
```

`login --json` prints the approval link and code as a `device_approval` notice, then exits 3 with `login_pending`. Give the creator both. They open the link, sign in, type the code and press Allow access. You cannot approve it for them. When they say they have, finish:

```bash
opengame login --continue --json
```

`--continue` waits up to 10 seconds for the approval.

| Result | What to do |
| --- | --- |
| Exit 0 | Signed in. `data.handle` is the creator's handle. |
| Exit 3, `login_pending` | Not approved yet. Run `login --continue --json` again once the creator has pressed Allow access. |
| Exit 3, `access_denied` | The creator pressed Deny, or the account cannot be used. Read the message to them. |
| `login_expired` or `no_pending_login` | The code ran out. Run `login --json` for a new one. |

## Deploy a private preview

Run these from the game folder.

If the folder has no `opengame.json`, create one. Ask the creator whether it is a game, a world, a decomp or a mod; a decomp or a mod names the game it is based on:

```bash
opengame init . --title "My game" --json
opengame init . --title "Doom but blue" --kind mod --based-on "Doom" --json
```

Then fill in `description` (40 characters or more) and `genre` in `opengame.json`. If the file already exists, leave `init` alone and edit the file.

For a game that already exists on OpenGame, in a new checkout, link the folder first so the deploy does not create a second game:

```bash
opengame games --json
opengame link --game <id> --json
```

Check, then deploy:

```bash
opengame check . --build --json
opengame deploy . --json
```

`deploy` runs the manifest's build command, checks the output and uploads it, up to 1 GiB zipped. It returns once the upload is in, with exit 0 and `data.done: false`, while the checks run on the server. Keep `.opengame/`: later commands resume and follow the same deploy from it. Use `--no-build` only when the creator says the export is already built and its build cannot run here, never to get past a failing build.

| Field | What it holds |
| --- | --- |
| `data.deploymentUrl` | The deploy's page. Give it to the creator straight away: it shows each check and plays the preview once they pass. |
| `data.state` | `uploading`, `queued`, `checking`, `ready`, `failed` or `expired`. |
| `data.done` | `true` once the server has finished. |
| `data.releaseId` | The release. Keep it for `submit`. |
| `data.previewUrl` | The private preview link, once `state` is `ready`. It can be `null` on a ready release the server will not play; the deploy's page says why. |
| `data.gameOrigin` | The origin the published game runs at, such as `https://k3v9q2m7x4ab.opengame.gg`. Give it to the creator when the game talks to their own servers. `null` when the server sent none, or sent one this CLI cannot read. |

To follow the checks, run `status --watch`, which follows the deploy for up to 5 minutes. Set `--timeout <seconds>` for a short tool call; when it runs out the command exits 5 with `checks_pending` and the checks carry on.

```bash
opengame status --watch --timeout 60 --json
```

To block on the outcome in one command, deploy with `--wait`:

```bash
opengame deploy . --wait --json
```

Tell the creator the preview is ready only when a result says `data.state: "ready"` and `data.done: true`. Give them `data.previewUrl` and `data.releaseId`. Play it, or ask them to, before you say the game works.

## Fix findings

Each finding has a `fault`, a `certainty` and a `retry`:

| Finding | What to do |
| --- | --- |
| `fault: game` | Read `evidence`, make the change in `fix`, then run the command in `verify`. |
| `certainty: heuristic` | Check the evidence before you change working code. |
| `fault: platform` | Leave the game as it is. Follow `retry`: `now` runs again, `later` waits `retryAfterSeconds`, `after-fix` and `never` mean waiting will not help, so read `fix`. |
| `fault: unknown` | A person decides at review. Report it to the creator. |

A plain `deploy` resumes a saved upload, or starts a fresh one with an `upload_restarted` notice when the saved one can no longer finish. A deploy started with `--idempotency-key` exits 2 instead. Start a fresh one with a new key, or without the flag:

```bash
opengame deploy . \
  --idempotency-key <a new key> --json
```

Before a large batch of deploys, run `opengame limits --json` for the upload limits and the allowance left on the account. If the same platform failure repeats, stop and give the creator the command, the error code and the evidence.

## Submit only on request

A deploy makes a private preview that only the creator's account can open. `opengame submit` sends a release to review, and the game goes public once review approves it and it is published. Submit only when the creator asks, and send the exact `releaseId` they played.

```bash
opengame jams --json
opengame submit --release <releaseId> --no-wait --json
```

OpenGame decides where submissions go. When that is a jam, the submission is the creator's entry: read the form with `opengame jams <slug> --json`, ask the creator for their track, the models they used and any sponsor evidence, and pass them as `--track`, `--models`, `--sponsor` and `--evidence-<sponsor>`. A missing answer exits 2 and names the flag. A decomp or a mod cannot enter a jam.

When `data.state` is `needs_certification`, give the creator `data.certifyUrl`, which the CLI also prints as a `certify_required` notice. They certify in their own browser that they have the rights to the game. You cannot do it for them. Follow the review with:

```bash
opengame status --watch --json
```

## What a game may do

OpenGame hosts static browser exports. The build needs `index.html` at the root of its output folder.

At runtime the game may call its own origin, `https://api.opengame.gg`, and any other `https:` or `wss:` host. Each call comes from the player's browser, so that host sees the player's IP address. Keep API keys on the creator's server, never in the bundle: players can read every file in it. The review sandbox has no internet, so the game must draw its first frame without its server.

The published game runs at `https://<label>.opengame.gg`, one origin per game, and `opengame deploy` returns it as `data.gameOrigin`. While an experiment runs, players load each version taking part from a `v-` origin instead. If the creator's servers check `Origin` (WebSocket) or send CORS headers (HTTP), they reject the game's requests until that exact origin is on their list, and online play fails with a closed socket, a 401 or 403 on the upgrade, or a CORS error in the console. Tell the creator to add it, and to add a version's `v-` origin before starting an experiment with it. Never suggest allowing `*.opengame.gg`, `null` or any pattern on `opengame.gg`, because other people's games are served there too and a pattern lets them call the creator's server. Use a token in a header or the first socket message, not a cookie. A private preview runs on a temporary `p-` origin, not the game's. That address is a private link, so keep it out of committed config and logs. [Games that talk to your own servers](https://docs.opengame.io/guides/packaging#games-that-talk-to-your-own-servers) has server examples.

A game may not take payments, use crypto, make players create an account or give an email address, show ads, or carry ad pixels or session recording. [Packaging](https://docs.opengame.io/guides/packaging) has every rule and every check.

## Engines

OpenGame supports games built with Three.js, Unity, Godot, Kaigen and WebAssembly, and static web builds from any JavaScript engine. `opengame check` and the server detect the engine from the build. Any other static browser export uploads as a custom build, under the same file, scan and runtime checks.

Run `opengame init . --engine <id>` to record an engine's export folder. `opengame help --json` lists the IDs, and `init` prints the export steps and the guide for the one you choose. The [engine overview](https://docs.opengame.io/engines/overview) links every engine page.

Play the private preview before you tell the creator the game works.
<!-- /generated:procedure -->

## Where it runs

`dev`, `vendor`, `check --vendor`, `deploy --vendor` and Unity asset uploads need Python 3 on macOS or Linux: they read files with a small Python helper that opens each one relative to a held directory, so a symlink swapped into the path mid-read cannot send it outside the project. The CLI looks for Python 3 at `/usr/bin/python3`, `/opt/homebrew/bin/python3`, `/usr/local/bin/python3` and `/bin/python3`, never through `PATH`; without one those commands stop with `filesystem_unsupported` before reading anything, and the fix is to install Python 3 from python.org or Homebrew. Plain `check` and `deploy` use the same helper when Python is found and otherwise read with a Node fallback, after a `node_reader_fallback` notice; they work either way.

## Commands and exit codes

<!-- generated:commands -->
| Command | What it does |
| --- | --- |
| `opengame init [dir] [options]` | Create opengame.json for an existing game. When one is already there, fill in the fields it leaves blank and keep the rest. |
| `opengame check [dir] [options]` | Find local build and asset problems before uploading. |
| `opengame dev [dir] [options]` | Serve a local export with game-runtime headers. Under a contract that adds the SDK, pages also get the host runtime and SDK, as they do when hosted. If the contract supports opting out, sdk.inject: false leaves out the SDK. |
| `opengame login [options]` | Sign in through your browser. |
| `opengame deploy [dir] [options]` | Build, check and upload a release, then return with the address of its deployment page, where the checks run and the private preview plays once they pass. Add --wait to stay until they finish. Once the preview is ready, the achievements opengame.json declares are saved by deploy --wait or by the next opengame status in this folder. Removing an achievement from opengame.json does not switch it off. To retire one, run opengame achievements retire <id>. Unlocks are never deleted. |
| `opengame status [dir] [options]` | Show the most recent deploy for this folder, with its findings. Finishes saving its declared achievements if the deploy could not. Removing an achievement from opengame.json does not switch it off. To retire one, run opengame achievements retire <id>. Unlocks are never deleted. |
| `opengame deployments [dir] [options]` | List the linked game's deploys, newest first: status, when, size, who started each one, why any stopped, and each one's page or preview. |
| `opengame open [dir] [options]` | Open the linked game's private page in your browser. |
| `opengame submit [dir] [options]` | Send one release to review, and enter it in a jam. |
| `opengame jams [slug] [options]` | List open jams, or show one jam's tracks and flags. |
| `opengame jam <withdraw\|reenter> [options]` | Withdraw the linked game's jam entry, freeing its place, or put a withdrawn one back while the jam is open, as your jam entries page does. Needs a token with submit; opengame login has it. |
| `opengame releases [dir] [options]` | List the linked game's releases, newest first, as the Releases tab on its page does: which one is live, which were live before, which are drafts and which were cleaned up, and which can be made live again. |
| `opengame rollback <release> [options]` | Make a release that was live before live again, as Make live again does on the game's page. The game must be live, and the release must still have its files. Players get it from their next load. Run again on the live release to rewrite its address after a failed one. Needs a token with read or deploy, and submit; opengame login has all three. |
| `opengame unpublish [dir] [options]` | Take the linked game off the gallery and stop serving it, as Unpublish does on Your games. Your build, uploads and review record are kept, and opengame restore puts it back. Needs a token with read or deploy, and submit; opengame login has all three. |
| `opengame restore [dir] [options]` | Put a game you unpublished back on the gallery, serving the version it was on, as Put it back does on Your games. Refused for a game we took down, one with an open report or a hold, and one under a copyright notice. Needs a token with read or deploy, and submit; opengame login has all three. |
| `opengame delete [dir] [options]` | Delete the linked game for good, as Delete for good does on its page: it comes off the gallery, stops being served and cannot be put back. You type its title to confirm. Refused while it is under a legal hold, with a reviewer, or in a jam being scored. Only the opengame login token can do this, not a token made in settings. |
| `opengame details [dir] [options]` | Print the linked game's title, tagline and description as the website shows them, or change any of them, as the Details tab on its page does. A field you leave out stays as it is. On a published game players see the change at once. Printing needs a token with read or deploy, and saving needs submit too; opengame login has all three. |
| `opengame achievements [retire <id>] [options]` | List the linked game's achievements, active and retired, or retire one, as the achievements step on the website does. Players keep what they unlocked, and the game can no longer award a retired one. Retiring needs a token with deploy and submit; opengame login has them. |
| `opengame games [options]` | List your games and their latest deploy. |
| `opengame link [dir] [options]` | Connect this folder to an existing game. |
| `opengame pull [dir] [options]` | Bring website metadata into this folder. |
| `opengame stats [game\|dir] [options]` | Read analytics for a game you own, or this folder's linked game, for one complete ISO week, Monday to Sunday in UTC. Average playtime is total playtime divided by distinct players in the week. |
| `opengame whoami [options]` | Show the account and permissions for this token. |
| `opengame handle <name> [options]` | Rename your handle, as Settings does. Your old handle keeps pointing at you and is never given to anybody else, and renames are limited per day. Only the opengame login token can do this, not a token made in settings. |
| `opengame token create\|list\|revoke [options]` | Create, list or revoke tokens in your browser. |
| `opengame logout [options]` | Revoke this device's token and remove it locally. |
| `opengame limits [options]` | Show bundle limits and your remaining account allowance. |
| `opengame vendor [dir] [options]` | Create a separate export with dependencies downloaded at their exact versions, rewritten and hashed. |
| `opengame skills add\|list [dir] [options]` | Install the OpenGame skills for your coding agent. |
| `opengame upgrade [options]` | Install the current CLI, or print the line that does. |
| `opengame version [options]` | Print the CLI version. |

| Exit | Name | Meaning |
| --- | --- | --- |
| 0 | `ok` | Done. With done:false in the result, the deploy is still running on our side: open data.url to watch it, or follow it with opengame status --watch. |
| 1 | `check` | The game needs a change. Read the finding events, or the error's finding and message when there are none, fix it, then run the finding's verify command. |
| 2 | `input` | The command needs input: a flag, a choice or a different command. The message names it. With retry never, running the same command again cannot help. |
| 3 | `auth` | Sign in, or use a token with the right scope. Run the error's next command when it has one. With retry never, signing in again will not help: the account itself has no access. |
| 4 | `rateLimited` | An allowance is used. Wait retryAfterSeconds when the error has it, then run the same command. |
| 5 | `server` | Our side or the network, and the game is fine. Run the error's next command when it has one. With retry after-fix or never, waiting will not help; read the message. Otherwise wait (retryAfterSeconds when given) and run the same command. |
| 6 | `upgrade` | This CLI is too old. Run opengame upgrade. |
| 7 | `notLaunched` | OpenGame is not open to creators yet, so nothing ran. The message names the day the CLI and uploads open. Nothing about the game, the command or the login is wrong. Retrying will not help before then. |
<!-- /generated:commands -->

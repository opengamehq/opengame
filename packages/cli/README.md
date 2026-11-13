# @opengamehq/cli

Deploy browser games to [OpenGame](https://opengame.io) from your terminal. The `opengame`
command checks a game folder, uploads it and gives you a private preview to play.

## Install

<!-- install:cli -->
```bash
npm i -g @opengamehq/cli
```
<!-- /install -->

It needs Node.js 18.17 or later. `opengame --version` prints the version you have.

## Sign in

```bash
opengame login
```

Your browser opens on opengame.io. Sign in with Google or an emailed code and press
Allow access. The CLI keeps the token in the macOS Keychain, and elsewhere in a private
file under `~/.config/opengame`. In CI, pass a token through `OPENGAME_TOKEN` or
`--token-stdin`, never as a command argument.

When OpenGame has not opened to creators for your account, a command that needs the
platform prints `OpenGame opens for creators on` the day the CLI and uploads open, and exits
with code 7. Signing in works either way.

## Deploy a game

Run these from the folder that holds your game's `index.html`, or its source when the
build writes one.

```bash
opengame init .
opengame check .
opengame deploy .
```

`init` writes `opengame.json`, the manifest with your game's title and build. It asks
you one thing, the game's name, and you write the description, choose the genre and
enter the jam on the deployment page afterwards, or have your agent do it. `check` runs the same checks the upload will, on your machine. `deploy` builds,
checks and uploads a release, then prints its deployment page:

```
Uploaded. The checks run on our side, so you can close this terminal.
Your upload is queued for checks.
Watch them, and play the preview once it is ready, at https://opengame.io/settings/deployments/<id>
Or follow them here with opengame status --watch.
```

The private preview plays on that page once the checks pass, and the release goes to
review by itself. Add `--wait` to stay in the terminal until the checks finish.

## Scripts and agents

Every command takes `--json` and prints one result object. For `deploy`:

```json
{
  "type": "result",
  "command": "deploy",
  "ok": true,
  "data": { "operationId": "<id>", "done": false, "deploymentUrl": "https://opengame.io/settings/deployments/<id>" },
  "url": "https://opengame.io/settings/deployments/<id>",
  "next": "opengame status --watch",
  "findings": [],
  "notices": []
}
```

A failure prints `"type": "error"` with `ok: false`, a `code` such as `not_launched`, a
`message` and the process exits with a non-zero code. `opengame help --json`
lists every command, flag, error code and exit code. `--jsonl` streams progress events.

`opengame skills add .` installs the OpenGame skills for Claude Code, Codex, Cursor or
OpenCode, so a coding agent can do all of the above for you.

## Commands

<!-- generated:commands -->
| Command | What it does |
| --- | --- |
| `opengame init [dir] [options]` | Create opengame.json for an existing game. A person at a terminal is asked the game's name and nothing else; the description, genre, jam entry and the rest are filled in on the deploy's page, by you or your agent. When opengame.json is already there, fill in the fields it leaves blank and keep the rest. |
| `opengame check [dir] [options]` | Find local build and asset problems before uploading. |
| `opengame dev [dir] [options]` | Serve a local export with game-runtime headers. Under a contract that adds the SDK, pages also get the host runtime and SDK, as they do when hosted. If the contract supports opting out, sdk.inject: false leaves out the SDK. |
| `opengame login [options]` | Sign in through your browser. |
| `opengame deploy [dir] [options]` | Build, check and upload a release, then return with the address of its deployment page, where the checks run and the private preview plays once they pass. Add --wait to stay until they finish. Once the preview is ready, the achievements opengame.json declares are saved by deploy --wait or by the next opengame status in this folder. Removing an achievement from opengame.json does not switch it off. To retire one, run opengame achievements retire <id>. Unlocks are never deleted. |
| `opengame status [dir] [options]` | Show the most recent deploy for this folder, with its findings. Finishes saving its declared achievements if the deploy could not. Removing an achievement from opengame.json does not switch it off. To retire one, run opengame achievements retire <id>. Unlocks are never deleted. |
| `opengame deployments [dir] [options]` | List the linked game's deploys, newest first: status, when, size, who started each one, why any stopped, and each one's page or preview. |
| `opengame open [dir] [options]` | Open the linked game's private page in your browser. |
| `opengame submit [dir] [options]` | Send one release to review, and enter it in a jam. A deploy goes to review by itself, so this is mostly for agents entering a jam with flags. A person who names no jam answer is given the deploy's page, where the track, models and sponsor tracks are chosen, and nothing is sent. |
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
| `opengame handle <name> [options]` | Rename your handle, as Settings does. Your old handle becomes free for anyone to claim, your games keep their /g links, and your profile address changes. Renames are limited per day. Only the opengame login token can do this, not a token made in settings. |
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
| 7 | `notLaunched` | OpenGame is not open to creators yet, so nothing ran. Signed out, sign in first (next is opengame login) and run the command again; signed in, the message names the day the CLI and uploads open. init and check run before then and say the day as a notice. Nothing about the game is wrong. |
<!-- /generated:commands -->

`opengame <command> --help` prints that command's flags and examples.

## Documentation

The full guide, the API reference and the limits are at
[docs.opengame.io](https://docs.opengame.io).

## License

Apache-2.0

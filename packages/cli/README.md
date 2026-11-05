# @opengamehq/cli

Deploy browser games to [OpenGame](https://opengame.io) from your terminal. The `opengame`
command checks a game folder, uploads it and gives you a private preview to play.

## Install

<!-- install:cli -->
The CLI is not on npm yet. Write to team@opengame.io for a copy.
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

When OpenGame has not opened for your account, a command that needs the platform prints
`OpenGame is not launched.` and exits with code 7. Signing in works either way.

## Deploy a game

Run these from the folder that holds your game's `index.html`, or its source when the
build writes one.

```bash
opengame init .
opengame check .
opengame deploy .
```

`init` writes `opengame.json`, the manifest with your game's title, description and
build. `check` runs the same checks the upload will, on your machine. `deploy` builds,
checks and uploads a release, then prints its deployment page:

```
Uploaded. The checks run on our side, so you can close this terminal.
Your upload is queued for checks.
Watch them, and play the preview once it is ready, at https://opengame.io/settings/deployments/<id>
Or follow them here with opengame status --watch.
```

The private preview plays on that page once the checks pass. Add `--wait` to stay in the
terminal until they finish. When the preview is ready, `opengame submit` sends the
release to review.

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
| `opengame init [dir] [options]` | Create opengame.json for an existing game. |
| `opengame check [dir] [options]` | Find local build and asset problems before uploading. |
| `opengame dev [dir] [options]` | Serve a local export with game-runtime headers. Under a contract that adds the SDK, pages also get the host runtime and SDK, as they do when hosted. If the contract supports opting out, sdk.inject: false leaves out the SDK. |
| `opengame login [options]` | Sign in through your browser. |
| `opengame deploy [dir] [options]` | Build, check and upload a release, then return with the address of its deployment page, where the checks run and the private preview plays once they pass. Add --wait to stay until they finish. Once the preview is ready, the achievements opengame.json declares are saved by deploy --wait or by the next opengame status in this folder. Removing an achievement from opengame.json does not switch it off. To retire one, send PUT /api/v1/games/{id}/achievements with achievementId, title, description and active: false. Unlocks are never deleted. |
| `opengame status [dir] [options]` | Show the most recent deploy for this folder, with its findings. Finishes saving its declared achievements if the deploy could not. Removing an achievement from opengame.json does not switch it off. To retire one, send PUT /api/v1/games/{id}/achievements with achievementId, title, description and active: false. Unlocks are never deleted. |
| `opengame deployments [dir] [options]` | List the linked game's deploys, newest first: status, when, size, who started each one, why any stopped, and each one's page or preview. |
| `opengame open [dir] [options]` | Open the linked game's private page in your browser. |
| `opengame submit [dir] [options]` | Send one release to review, and enter it in a jam. |
| `opengame jams [slug] [options]` | List open jams, or show one jam's tracks and flags. |
| `opengame games [options]` | List your games and their latest deploy. |
| `opengame link [dir] [options]` | Connect this folder to an existing game. |
| `opengame pull [dir] [options]` | Bring website metadata into this folder. |
| `opengame stats [game\|dir] [options]` | Read analytics for a game you own, or this folder's linked game, for one complete ISO week, Monday to Sunday in UTC. Average playtime is total playtime divided by distinct players in the week. |
| `opengame whoami [options]` | Show the account and permissions for this token. |
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
| 7 | `notLaunched` | OpenGame is not launched yet, so nothing ran. Nothing about the game, the command or the login is wrong. Retrying will not help before launch. |
<!-- /generated:commands -->

`opengame <command> --help` prints that command's flags and examples.

## Documentation

The full guide, the API reference and the limits are at
[docs.opengame.io](https://docs.opengame.io).

## License

Apache-2.0

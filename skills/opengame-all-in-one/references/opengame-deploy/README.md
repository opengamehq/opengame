> Carried from `opengame-deploy` 1.1.16. Read it when: Put a browser game online with OpenGame, the marketplace and game jam for browser games. Packages the game, checks it locally, uploads it to a private preview only the owner can play, reads and fixes findings, then hands the creator the page where they confirm the details after review. Use when the person says deploy my game, put it online, host it, share it, upload it, publish it, get me a link, make it playable for friends, or asks where to put a browser game or a Three.js game.


# Deploy a browser game to OpenGame

Any signed-in account can use the CLI, uploads and jam entries. If a CLI command exits 7
(`not_launched`), nothing is wrong with the game or the install: ask the person to run
`opengame login`, then run the command again. Do not reinstall or work around it.

<!-- generated:procedure -->
Before every `opengame deploy` or `opengame publish`, stop and ask the creator: show them the game and its title, for a jam entry the track and models you suggest, and wait for a clear yes. A deploy can use one of their jam entries, and an update to a live game publishes by itself. Then deploy to a private preview, give them its link, and publish after review only if they asked. Read each command's result before the next one.

## Install

```bash
npm i -g @opengamehq/cli
opengame setup
```

Once `opengame` is installed, confirm it and read the command reference:

```bash
opengame version --json
opengame help --json
```

`help --json` lists every command, flag, exit code, environment variable and event, with the finding schema.

`opengame setup` installs every OpenGame skill in the home folder of each coding agent it finds (Claude Code, Codex, Cursor and OpenCode), and later commands keep them current. If your session started before that, read `opengame-router/SKILL.md` in the folder it names.

To commit the skills with the game instead:

```bash
opengame skills add .
```

That installs a starting set. `opengame skills list` names the rest; add one with `--skill <name>`, or `--skill opengame-all-in-one` for every skill as one.

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
| 7 | OpenGame did not let this CLI in | Ask the creator to run `opengame login`, then run the command again. |

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

If the folder has no `opengame.json`, create one. The title is all it needs. A decomp or a mod says so with `--kind` and names the game it is based on:

```bash
opengame init . --title "My game" --json
opengame init . --title "Doom but blue" --kind mod --based-on "Doom" --json
```

Do not ask the creator to write a description or pick a genre. When you know them, pass `--description` (40 characters or more), `--genre` and `--players`; when you do not, leave them out. Every field defaults to Auto: review writes the description and the genre from the game, and the creator accepts or changes them on the deploy's page, where they also enter the jam. A title or description you pass is offered back with its casing and grammar tidied, and `opengame publish --keep-words` keeps it as written. After the deploy you can set the description yourself with `opengame details --description "..." --json`. If the file already exists, `init` fills in only the fields it leaves blank; edit the file to change the rest.

For a game that already exists on OpenGame, in a new checkout, link the folder first so the deploy does not create a second game:

```bash
opengame games --json
opengame link --game <id> --json
```

Check, ask the creator, then deploy:

```bash
opengame check . --build --json
opengame deploy . --json
```

`deploy` runs the manifest's build command, checks the output and uploads it, up to 4 GiB zipped. It returns once the upload is in, with exit 0 and `data.done: false`, while the checks run on the server. Keep `.opengame/`: later commands resume and follow the same deploy from it. Use `--no-build` only when the creator says the export is already built and its build cannot run here, never to get past a failing build.

| Field | What it holds |
| --- | --- |
| `data.deploymentUrl` | The deploy's page. Give it to the creator straight away: it shows each check and plays the preview once they pass. |
| `data.state` | `uploading`, `queued`, `checking`, `ready`, `failed` or `expired`. |
| `data.done` | `true` once the server has finished. |
| `data.releaseId` | The release. Keep it: `opengame publish --release` takes it. |
| `data.previewUrl` | The private preview link, once `state` is `ready`. It can be `null` on a ready release the server will not play; the deploy's page says why. |
| `data.gameOrigin` | The origin the published game runs at, such as `https://k3v9q2m7x4ab.opengame.gg`. Give it to the creator when the game talks to their own servers. `null` when the server sent none, or sent one this CLI cannot read. |

To follow the checks, run `status --watch`, which follows the deploy for up to 300 seconds. Set `--timeout <seconds>` for a short tool call; when it runs out the command exits 5 with `checks_pending` and the checks carry on.

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
| `fault: unknown` | Nothing to change. The playtest and the automatic review settle it. Report it to the creator. |

A plain `deploy` resumes a saved upload, or starts a fresh one with an `upload_restarted` notice when the saved one can no longer finish. A deploy started with `--idempotency-key` exits 2 instead. Start a fresh one with a new key, or without the flag:

```bash
opengame deploy . \
  --idempotency-key <a new key> --json
```

An account can begin 5 deploys in a rolling day, so fix what `opengame check` finds before you deploy again. Run `opengame limits --json` for the upload limits and the allowance left on the account. If the same platform failure repeats, stop and give the creator the command, the error code and the evidence.

## Review and publishing

Review starts automatically once a deploy is ready: it plays the game, then passes it or returns it with findings.

When review passes, a game's first release waits to be published. `opengame status --json` shows `data.review.state: "awaiting_details"`, `data.review.next: "opengame publish"` and the deploy's page in `data.review.url`.

- **The creator asked you to publish it.** Run `opengame publish --json`. It confirms the title, description and genre review wrote, publishes, waits until the game is live and prints the address to share in `data.url`. Change what review wrote with `--description`, `--genre` and the other flags in `opengame publish --help`. While a new game or an update goes on OpenGame only as a jam entry, pass the jam's track and the models used with `--track` and `--models`; `opengame jams <slug> --json` lists them.
- **They did not ask.** Give them `data.review.url`. Signed in, they check the details, enter the jam and publish on that page.

To publish in one step, `opengame deploy --publish --json` stays until review passes, then publishes, and takes the same jam flags.

An update to a game that is already live publishes by itself once it passes review. It keeps the live game's details, including the genre when the deploy left it to Auto, and its jam entry. The token that deployed it has to hold `submit`, as the `opengame login` token does. When the creator asked only for a preview of an update to a live game, deploy with a token made in their settings with `deploy` alone, set as `OPENGAME_TOKEN`, so the release waits for them.

`opengame submit` does not confirm a release that is already in review. The server keeps that submission, and the CLI prints a `jam_answers_unused` notice: the jam answers you passed were not used. Pass them to `opengame publish` once review passes.

While Game Jam #1 runs, a new game or an update goes on OpenGame only as a jam entry, up to 2 for each account. Mods and decomps publish outside the jam at any time and never enter it. When the jam cannot take a build, for example because the account already has 2 entries, the build is not sent to review, and the deploy's page explains why. [Enter a jam](https://docs.opengame.io/guides/jams) has the rules.

Follow the release to the end:

```bash
opengame status --watch --json
```

| `data.review.state` | What to do |
| --- | --- |
| `review`, `playtesting`, `waiting` | Review is running. Watch again. |
| `approved` | Review passed. When `data.review.next` is `opengame publish`, do as for `awaiting_details`; otherwise watch again. |
| `awaiting_details` | Run `opengame publish --json` when the creator asked you to publish. Otherwise give them `data.review.url`, and watch again once they say they have published. |
| `needs_certification` | Give the creator `data.review.url`. Watch again once they say they have done it. |
| `publishing`, `published` | The game is going live. Once it is, `data.submission.live.url` is the address to share. |
| `returned` | Read the findings and run `data.review.next`. Usually that means fix the game and deploy again, and the new deploy is reviewed automatically. A jam entry returned for a fault on our side gets `opengame submit --release <id>` instead: the game needs no change, and the command names any jam answer it still needs. |
| `blocked` | Review refused the game. Give the creator `data.review.message`. |
| `withdrawn` | The creator withdrew this submission. Nothing more happens to it unless they ask you to enter it again. |
| `superseded` | Another submission took its place, and `data.submission.replacedBy` names it. Run `opengame status --json` again to follow that one. |

## What a game may do

OpenGame hosts static browser exports. The build needs `index.html` at the root of its output folder.

At runtime the game may call its own origin, `https://api.opengame.gg`, and any other `https:` or `wss:` host. Each call comes from the player's browser, so that host sees the player's IP address. Keep API keys on the creator's server, never in the bundle: players can read every file in it. The review sandbox has no internet, so the game must draw its first frame without its server.

A game may keep a service worker on the game's address; a takedown removes it and a new version replaces it.

The published game runs at `https://<label>.opengame.gg`, one origin per game, and `opengame deploy` returns it as `data.gameOrigin`. While an experiment runs, players load each version taking part from a `v-` origin instead. If the creator's servers check `Origin` (WebSocket) or send CORS headers (HTTP), they reject the game's requests until that exact origin is on their list, and online play fails with a closed socket, a 401 or 403 on the upgrade, or a CORS error in the console. Tell the creator to add it, and to add a version's `v-` origin before starting an experiment with it. Never suggest allowing `*.opengame.gg`, `null` or any pattern on `opengame.gg`, because other people's games are served there too and a pattern lets them call the creator's server. A private preview runs on a temporary `p-` origin, not the game's. That address is a private link, so keep it out of committed config and logs. [Games that talk to your own servers](https://docs.opengame.io/guides/packaging#games-that-talk-to-your-own-servers) has server examples.

A game may not take payments, use crypto, make players create an account or give an email address, show ads, or carry ad pixels or session recording. [Packaging](https://docs.opengame.io/guides/packaging) has every rule and every check.

## Multiplayer

OpenGame runs no game server or rooms. A game in any engine can reach the creator's servers (Colyseus, Nakama, Photon or their own) over `wss:`, WebTransport or `https:`, or links browsers over WebRTC, since a browser has no raw UDP or TCP. Kaigen invites and relays through Kaigen Online, since it doesn't read `og.invite.code` yet.

- **Invites.** Share `og.invite.link(code)`, the game's page on opengame.io with `?join=CODE`, never the game's `opengame.gg` address. After `await og.init()`, a player with `og.invite.code` set opened an invite: join them to that lobby with no menu in between. `link` is `null` outside OpenGame and for a code the page would change, so show the code too.
- **Game servers.** Allow only the game's exact origin. Send a token in a header or the first socket message, not a cookie. A server cannot verify `og.player.id`, so it issues that token without a sign-in and decides results.
- **Peer to peer.** Run a signalling server, such as PeerServer for PeerJS, over `wss:` instead of `0.peerjs.com`, check `Origin` in front of it, and prefix peer ids with the game's name. Use STUN plus TURN, with TURN credentials from the creator's server, not the bundle. The next host keeps the lobby id.

[Multiplayer](https://docs.opengame.io/guides/multiplayer) covers engines, servers and testing.

## Engines

OpenGame supports games built with Three.js, Unity, Godot, Unreal Engine, Kaigen and WebAssembly, and static web builds from any JavaScript engine. `opengame check` and the server detect the engine from the build. Any other static browser export uploads as a custom build, under the same file and runtime checks.

Any web framework works once it builds static files: Vite, React, React Three Fiber, webpack, Parcel, Astro, SvelteKit with adapter-static, Nuxt with `nuxt generate`, and Next.js with `output: "export"` in `next.config`, which writes `out/`. `init` reads the framework's config and writes the folder the build fills. A project configured for a server fails with `static_build_required`, which names the setting to change; change that setting instead of passing `--output`. [Web frameworks](https://docs.opengame.io/guides/web-frameworks) has each one.

Run `opengame init . --engine <id>` to record an engine's export folder. `opengame help --json` lists the IDs, and `init` prints the export steps and the guide for the one you choose. The [engine overview](https://docs.opengame.io/engines/overview) links every engine page.

Play the private preview before you tell the creator the game works.
<!-- /generated:procedure -->

For field definitions, read [references/manifest.md](references/manifest.md). For the full packaging contract, read [references/packaging.md](references/packaging.md). For sample findings, read [references/json-events.md](references/json-events.md). Read `opengame-jam` for eligibility, certifications and judging rules.

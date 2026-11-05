# Orb Run: OpenGame starter

A Three.js game built with Vite, wired to the OpenGame SDK. Change the game; keep the
platform wiring in `src/main.js` (`og.init`, `og.ready`, `og.onPause`, the leaderboard).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173, with the SDK's local mock
```

Build it inside a checkout of the OpenGame repository: `npm install` takes the SDK from
`packages/sdk` through the `file:` path in `package.json`. The `.npmrc` stops npm from
fetching any other package under the `@opengamehq` name.

## Put it on OpenGame

```bash
npm run build                # check reads dist/ and does not build
opengame check . --json
opengame login --json        # exits 3: give the person the URL and code
opengame login --continue --json  # once they press Allow; deploy after exit 0
opengame deploy . --json     # runs npm run build itself, then checks and uploads
```

Read each `finding` before the last line. `fault: game` means change the game;
`fault: platform` means leave it and retry later. Keep `.opengame/`: deleting it makes a second game.
The CLI's `AGENTS.md` has the full runbook.

## Rules for this game

- This starter uses Three.js in a desktop browser. Other engines have their own export guides. An explicit portrait lock, a touch-only game or a fixed portrait canvas is a warning with
  `fault: unknown`, which a reviewer decides.
- The game may call AI models, third-party APIs and servers of your own over `https:` or
  `wss:`. Keep API keys on your server, never in the game. It must still draw its first
  frame offline, because review runs without the internet.
- No payments or tips, no crypto, no ads, ad pixels or session recording, and no account,
  sign-in or email address before a player can play.
- Call `og.ready()` once the first playable frame is drawn, not before.
- Scores are claims. The `sparks` board and its bounds are in `opengame.json`; a new
  board needs an entry there first.
- `opengame.json` has the title, description and genre. Update them when the game
  changes. `opengame check` fails a description that is too short.

## Expected findings

`opengame check` passes (exit 0) with no findings. A `missing-ref`, labelled "Worth a
look", means your code requests a file that is not in `dist/`. Its fix names each one after
`Not found:`, as `file:line → missing path`. The SDK reads `opengame.json` beside the page
when the game runs locally; that read is never reported, because a published game does not
make it.

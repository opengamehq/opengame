# Jam starter: OpenGame

A starting point for an OpenGame jam entry: Three.js and Vite, with a title screen, a
pause menu, results with a retry, a leaderboard and analytics already wired to the
OpenGame SDK. Replace the dodging game in `src/main.js` (`world` and `update`); keep the
screens and the platform calls.

## Run it

```bash
npm install
npm run dev
```

Build it inside a checkout of the OpenGame repository: `npm install` takes the SDK from
`packages/sdk` through the `file:` path in `package.json`. The `.npmrc` stops npm from
fetching any other package under the `@opengamehq` name.

## Deploy, then enter

```bash
npm run build
opengame check . --json
opengame login --json        # exits 3: give the person the URL and code
opengame login --continue --json  # once they press Allow; deploy after exit 0
opengame deploy . --json     # a private release; nothing is submitted
```

Entering the jam is the person's decision, not yours. When they ask:

```bash
opengame jams --json                                   # open jams, tracks, rules link
opengame submit --release <releaseId> --jam <slug> --track <track> --models <keys> --no-wait --json
```

`deploy --json` returns the release id, and `opengame jams <slug> --json` lists the
tracks, model keys and sponsor flags. The first entry waits for the person to certify, in
their own browser, that the entry is theirs; the `certify_required` notice carries the link
to give them. You cannot do that step.

## Jam rules to respect while building

The jam's rules page is the authority; `opengame jams` links to it. For the first jam:

- Any engine with a web export; this starter uses Three.js. Desktop browser, keyboard and mouse or gamepad. No portrait or touch-only layout.
- The game may call AI models, third-party APIs and servers of your own. Keep API keys on
  your server, never in the game, and make sure the game still draws its first frame
  offline, because review runs without the internet.
- No payments, tips or donations, no crypto, no ads, ad pixels or session recording, and
  no account, sign-in or email address before a player can play.
- Built during the jam. Entrants enter as individuals, and each has a limited number of
  entries, which submit enforces.
- Judged by people on fun, craft, use of AI, technical execution and originality. A menu
  that is a button on black, silence, and no feedback on hits all cost points.

## Keep these working

- The pause menu opens on **P** and on the on-screen button, and when the page pauses
  the game (`og.onPause`) or the window loses focus. Do not rely on Escape.
- `og.ready()` is called after the first playable frame. Move it if you add a loading
  screen, so it fires when the player can act.
- Analytics events use only allowlisted property keys (`mode`, `duration_ms`, `result`
  here). Unknown keys are dropped.
- The `survived_s` board (seconds, to a tenth) is declared in `opengame.json`. A new board needs an entry there.
- Update `title`, `description` and `genre` in `opengame.json` to describe your game.

## Expected findings

`opengame check` passes (exit 0) with no findings. A `missing-ref`, labelled "Worth a
look", means your code requests a file that is not in `dist/`. Its fix names each one after
`Not found:`, as `file:line → missing path`. The SDK reads `opengame.json` beside the page
when the game runs locally; that read is never reported, because a published game does not
make it.

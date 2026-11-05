# The packaging contract

Every number here is read from the platform's own limits when this skill is built, so
it matches what the CLI and the server enforce. The canonical contract for agents is
also published at opengame.io/agent.md.

## The archive

| Rule | Limit | What happens |
| --- | --- | --- |
| Entry point | `{{raw bundle.entryPoint}}` at the root of the build output | Refused |
| Compressed size | {{mib bundle.archiveBytesMax}} | Refused |
| Uncompressed size | {{mib bundle.uncompressedBytesMax}} | Refused |
| File count | {{n bundle.fileCountMax}} | Refused |
| Compression ratio | {{ratio bundle.compressionRatioMax}} | Refused, as a zip bomb guard |
| Paths | Case matches the file on disk; no `../`, no symlinks, no absolute paths | Refused |
| Excluded | `node_modules/`, `.git/`, `.env*`, source maps, OS junk | Stripped, with a `files_excluded` notice |
| `opengame.json`, `.opengame/`, `opengame-assets/` | Project files, not game files | Stripped silently |

`opengame.json` stays out of the bundle on purpose: the manifest describes the game to
the platform and is not one of the game's files.

## Games past the archive limits

A decompilation, mod or recompilation with gigabytes of game data can send its large
files outside the archive on the `large-game-v1` plan: at most
{{gib platform.largeGameAssets.storedBytesMax}} in {{n platform.largeGameAssets.fileCountMax}}
files, and {{gib platform.largeGameAssets.fileBytesMax}} for one file. The archive keeps the
limits above. The account needs large-asset access, which the OpenGame team enables; without
it the deploy exits 3 with `large_asset_lane_not_granted`, so ask the person to request it.

Write `{"delivery": "large-game-v1", "assets": "auto"}` to a file and pass it as
`--external-assets <file>` to both `opengame check` and `opengame deploy`. With `"auto"` the
CLI sends every file of {{mib platform.largeAssetPlans.large-game-v1.autoSplit.fileBytesMin}}
or more separately, then the largest of the rest until the archive fits. HTML, JavaScript,
CSS, XML, SVG, wasm, web manifests, SWF and PDF stay in the archive, and so do
`opengame.json` and the cover. A Kaigen build uses `kaigen-assets-v1` instead.

## Credentials

A credential inside any file is refused, comments included, because a game is served
from a public CDN. The patterns searched for: {{labels credentialPatterns.content}}.
Something shaped like {{labels credentialPatterns.suspicious}} is a warning, not a
refusal. If a match is a real key, rotate it; removing it from the next build does not
take it back.

Identity, leaderboards and achievements come from the page through the SDK (see
`opengame-sdk`), so those need no key. To call an API that does need one, such as an AI
model, put the key on the creator's own server and have the game call that server.

## Where a game may connect

Besides the game's own origin, `{{raw allowedGameOrigins.api}}`,
`{{raw allowedGameOrigins.rtc}}` and `{{raw allowedGameOrigins.rtcHttps}}`, a new release
may reach any `https:` or `wss:` host: an AI model, a third-party API, the creator's own
server, and scripts, stylesheets, fonts and media from a CDN. Releases made
before 26 Oct 2026 keep a contract that allows OpenGame's hosts only.

Before the game calls out:

- Each call goes from the player's browser, so that host gets the player's IP address.
- The review sandbox does not reach the internet. The game must still draw its first
  frame when its server is out of reach.
- The game page is `https:`, so the browser blocks `http://` and `ws://` requests.
- A build that uses threads is cross-origin isolated. There a script or image from
  another host loads only if that host sends CORS or `Cross-Origin-Resource-Policy`
  headers.
- A library from a CDN can be slow, go down or change after review. Bundle it when you
  can.

## What a game may not do

Refused whatever host the game uses. `opengame check`, the upload scan and the review
sandbox look for the common services and code shapes, and a reviewer plays every game.

- **Payments.** {{raw gamePolicy.categories.payments.rule}}
- **Crypto.** {{raw gamePolicy.categories.crypto.rule}}
- **Accounts.** {{raw gamePolicy.categories.accounts.rule}} An anonymous sign-in to the
  game's own backend, such as Firebase anonymous auth, is fine, because the player is
  never asked for anything.
- **Ads.** {{raw gamePolicy.categories.ads.rule}}
- **Tracking.** {{raw gamePolicy.categories.tracking.rule}}

A game also may not put another site in an iframe, post a form, or open a popup. Links
out go through `og.openLink`. OpenGame does not open links to the payment, crypto and sign-in services on its list, judged by the address the game passes, not by where it redirects. Do not hide a service from the checks by renaming or encoding it; the reviewer
plays the game against the rule, not against the list.

## What the checks measure

| Check | What it asks | Who decides | Blocks |
| --- | --- | --- | --- |
{{checktable checks}}

Thresholds that warn rather than refuse: an initial download over
{{mib performance.initialTransferBytesWarn}} before the first playable frame, time to
playable over {{s performance.timeToPlayableMsWarn}}, a median frame rate under
{{raw performance.medianFpsWarn}} on the test machine. A first frame later than
{{s performance.firstFrameMsFail}} fails the boot check. The desktop check loads the
game at {{viewports viewports}} and expects it to respond to resize.

## Manifest limits

`opengame.json` itself is at most {{kib platform.manifest.bytesMax}}, with at most
{{raw platform.manifest.boardCountMax}} leaderboards. See [manifest.md](manifest.md).

# The packaging contract

Every number here is read from the platform's own limits when this skill is built, so
it matches what the CLI and the server enforce. The canonical contract for agents is
also published at opengame.io/agent.md.

## The archive

| Rule | Limit | What happens |
| --- | --- | --- |
| Entry point | `index.html` at the root of the build output | Refused |
| Compressed size | 1024 MiB | Refused |
| Uncompressed size | 1536 MiB | Refused |
| File count | 10,000 | Refused |
| Compression ratio | 200 : 1 | Refused, as a zip bomb guard |
| Paths | Case matches the file on disk; no `../`, no symlinks, no absolute paths | Refused |
| Excluded | `node_modules/`, `.git/`, `.env*`, source maps, OS junk | Stripped, with a `files_excluded` notice |
| `opengame.json`, `.opengame/`, `opengame-assets/` | Project files, not game files | Stripped silently |

`opengame.json` stays out of the bundle on purpose: the manifest describes the game to
the platform and is not one of the game's files.

## Games past the archive limits

A decompilation, mod or recompilation with gigabytes of game data can send its large
files outside the archive on the `large-game-v1` plan: at most
12 GiB in 32,768
files, and 1 GiB for one file. The archive keeps the
limits above. The account needs large-asset access, which the OpenGame team enables; without
it the deploy exits 3 with `large_asset_lane_not_granted`, so ask the person to request it.

Write `{"delivery": "large-game-v1", "assets": "auto"}` to a file and pass it as
`--external-assets <file>` to both `opengame check` and `opengame deploy`. With `"auto"` the
CLI sends every file of 1 MiB
or more separately, then the largest of the rest until the archive fits. HTML, JavaScript,
CSS, XML, SVG, wasm, web manifests, SWF and PDF stay in the archive, and so does
`opengame.json`. A Kaigen build uses `kaigen-assets-v1` instead.

## Credentials

A credential inside any file is refused, comments included, because a game is served
from a public CDN. The patterns searched for: an OpenGame creator token; an AWS access key id; an AWS secret access key; a GitHub token; a GitHub fine-grained token; an Anthropic API key; an OpenAI API key; a Stripe secret key; a Slack token; a Google API key; a private key block; a Supabase service-role key name; a Twilio auth token; a SendGrid API key.
Something shaped like a private key header without its key beside it; an assignment that looks like a secret is a warning, not a
refusal. If a match is a real key, rotate it; removing it from the next build does not
take it back.

Identity, leaderboards and achievements come from the page through the SDK (see
`opengame-sdk`), so those need no key. To call an API that does need one, such as an AI
model, put the key on the creator's own server and have the game call that server.

## Where a game may connect

Besides the game's own origin, `https://api.opengame.gg`,
`wss://rtc.opengame.gg` and `https://rtc.opengame.gg`, a new release
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
sandbox look for the common services and code shapes, and automatic review plays every game.

- **Payments.** Games on OpenGame are free to play. A game may not take money, tips, donations or card details, or send players to a page that does.
- **Crypto.** Games on OpenGame may not use crypto wallets, tokens, NFTs or blockchains, and may not mine.
- **Accounts.** Players start playing without making an account, signing in, or giving an email address. OpenGame gives every game a player through the SDK, so a game never needs its own sign-in. An anonymous sign-in to the
  game's own backend, such as Firebase anonymous auth, is fine, because the player is
  never asked for anything.
- **Ads.** Games on OpenGame may not show ads. A portal SDK such as Poki's or CrazyGames' serves ads, so remove it.
- **Tracking.** Games on OpenGame may not carry ad pixels or session recording. Use the SDK's events for analytics.

A game also may not put another site in an iframe, post a form, or open a popup. Links
out go through `og.openLink`. OpenGame does not open links to the payment, crypto and sign-in services on its list, judged by the address the game passes, not by where it redirects. Do not hide a service from the checks by renaming or encoding it; the reviewer
plays the game against the rule, not against the list.

## What the checks measure

| Check | What it asks | Who decides | Blocks |
| --- | --- | --- | --- |
| `malware` | Malware scan | automatic | yes |
| `archive` | Archive is safe to open | automatic | yes |
| `entry` | index.html at root | automatic | yes |
| `boot` | Boots and renders | automatic | yes |
| `net` | No disallowed origins | automatic | yes |
| `size` | Initial download | automatic | no, a warning |
| `tti` | Time to playable | automatic | no, a warning |
| `mem` | Peak memory | automatic | no, a warning |
| `fps` | Frame rate | automatic | no, a warning |
| `desktop` | Works at every size | automatic | no, a warning |
| `content` | Content and conduct | a person | yes |
| `engine` | Declared engine | a person | yes |
| `ip` | Originality and IP | a person | yes |
| `fresh` | Built after kickoff | a person | yes |

Thresholds that warn rather than refuse: an initial download over
50 MiB before the first playable frame, time to
playable over 10 seconds, a median frame rate under
45 on the test machine. A first frame later than
30 seconds fails the boot check. The desktop check loads the
game at 1920 x 1080 (primary), 1366 x 768, 2560 x 1440, 3440 x 1440, 1024 x 640 and expects it to respond to resize.

## Manifest limits

`opengame.json` itself is at most 64 KiB, with at most
10 leaderboards. See [manifest.md](manifest.md).

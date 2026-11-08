# @opengamehq/sdk

The OpenGame SDK for browser games: who is playing, their OG, leaderboards, achievements
and events. All of it is optional. A game that calls no SDK function still runs, and a game
that calls all of them still runs outside OpenGame or when the platform is down. A game
holds no API key; the OpenGame page it plays in gives it a session.

## Install

<!-- install:sdk -->
The SDK is not on npm yet. Write to team@opengame.io for a copy.
<!-- /install -->

With no bundler, copy the files you use out of `dist/` next to your game (see "No build
step" below).

## Start

```js
import { og } from '@opengamehq/sdk'

await og.init()                       // resolves within 4 s, embedded or not
// ...load assets, draw the first playable frame...
og.ready()
og.onPause(paused => game.setPaused(paused))
og.audio.onHostMute(muted => audio.setMuted(muted))
```

Declare what the game uses in `opengame.json` beside `index.html`:

```json
{
  "leaderboards": [{ "key": "points", "order": "desc", "min": 0, "max": 600 }]
}
```

Then keep a score and record what happened:

```js
const saved = await og.leaderboard('points').submit(42)
if (!saved.ok) showMessage(saved.reason ?? saved.error)
og.track('wave_cleared', { level: 3 })
```

## What comes back

Each call returns `{ ok: true, value }` or `{ ok: false, error, reason? }` instead of
throwing, so a game checks `ok` and goes on.

```js
{ ok: true, value: { score: 42, state: 'ok', best: true, preview: false } }
{ ok: false, error: 'rate_limited', reason: 'Try again after the rate-limit window.' }
```

Opened outside OpenGame, the SDK runs a local mock: scores in `localStorage` and a
pretend player, so the same calls work while you build. `opengame dev` from
[`@opengamehq/cli`](https://www.npmjs.com/package/@opengamehq/cli) serves the game with
the headers it gets on OpenGame.

## Core

| Call | What it does |
| --- | --- |
| `await og.init(options?)` | Handshakes with the page. Resolves within the shared timeout embedded, at once standalone. Calling it twice returns the same promise. |
| `og.ready()` | The first playable frame. Idempotent. Time to playable is measured from it. |
| `og.env` | `{ embedded, connected, preview, sdkVersion, capabilities }`. `preview` is a private release. |
| `og.capabilities` | What the page offers this game: some of `identity`, `leaderboards`, `analytics`, `external-links`, `avatar`. Check before showing a feature. |
| `og.onPause(fn)` | `true` while the tab is hidden or the page has rested the game. |
| `og.audio.onHostMute(fn)`, `og.audio.muted` | The page's mute button, and silence before Play. |
| `og.fullscreen.request()`, `.onChange(fn)`, `.active` | Ask the page for fullscreen, from a player gesture. Keep a pause menu that does not depend on Escape. |
| `og.dispose()` | Removes every listener and timer and resolves a pending `init`. |

A listener receives the current state at once, and registering one returns an unsubscribe
function. A callback that throws does not stop the others. Importing the SDK as a module
starts no work. The injected global (`/_og/sdk.js`, or the copy a game ships as `opengame-global.js`) is the one
exception: on an OpenGame host inside the play page it asks the page for the session as the
script loads. See "The player during your loading screen".

`init` takes `{ manifest }` to pass `opengame.json` yourself when your build moves it, and
`{ dev: { player } }` to choose the local mock's player (below).

## Players

`og.player` is `{ id, handle, ogNumber, signedIn, avatar }`, plus `onChange(fn)` and
`requestSignIn()`.

- `id` is stable for this player in this game, on every device once signed in, and
  different in every other game. It cannot be joined across games.
- `handle` and `ogNumber` are shared only while the player has profile sharing in games
  on. It is on by default for new accounts, so most new players share them. Guests and
  players who have turned sharing off receive null. An account without a handle also
  receives a null handle.
- `avatar` is null unless the page offers the `avatar` capability for a signed-in
  player with profile sharing on. A valid recipe contains `{ seed, palette }`
  and may include `look`, the head of their OpenGame character, and `character`, its
  body and clothes. `character` only comes with a `look`, under the same setting.
  Older recipes remain valid. Use a default appearance when one is absent, including
  in private previews.
- Both recipes are strings in OpenGame's stored format. The SDK checks their syntax
  only, so a version or a name added after your game shipped still reaches it: draw
  your default for the part you do not recognise. `character` is `c3` or `c4`, then
  body, legs, shirt, bottoms, accessories (joined by `-` in `c4`) and shoes, then the
  shirt, bottoms, shoes and accessory colors; `avatar` and `match` take the head's color.
- `onChange` fires when a guest signs in while playing. The game keeps running; do not
  copy the player object, read it again in the callback.
- `requestSignIn()` asks the page to offer sign-in. It returns at once; the answer is an
  `onChange` later, or no change if the player does not sign in.
- The player object has no email, account id or anonymous platform id.

### The player during your loading screen

The page answers the SDK's first message with the player, their OG and their outfit, while
the game is still loading and before `og.ready()`. Use them then: a game that waits for its
title or its first menu to build the player's character shows its default character first
and swaps it in late.

- Load the SDK before anything heavy. The injected global asks for the session as it loads,
  on an OpenGame host, without waiting for `init`, so a native engine whose runtime takes a
  minute to boot still has the player when it first asks.
- Call `og.init()` early and do not block your load on it: start `watchAvatar(og, build)`
  (or `og.player.onChange`) straight away and build the model in the background while assets
  stream. Wear it when the menu opens.
- `og.player` can change while the game loads. While the page is still verifying the
  account it says so to the SDK, and `init` waits up to the shared refresh timeout
  (`play.sessionRefreshTimeoutMs`) for it. A guest stays a guest; `onChange` fires if they
  sign in later.
- Only the handshake starts early. Input, error and frame-rate measurement begin at `init`,
  so a game that never calls it reports nothing.

Locally the mock is a guest. `og.init({ dev: { player: 'signed-in' } })`, or
`?og-dev-player=signed-in` on the page URL, makes it signed in; `no-handle` is an account
without a handle. `requestSignIn()` signs the mock in and fires `onChange`, so the
mid-game sign-in path can be tested offline.

The signed-in mock shares an avatar, and `og.capabilities` lists `avatar` while it is
signed in, as on OpenGame. Its recipe is `{ seed: 1, palette: 'sky', look:
'circle.classic.white', character:
'c4.classic.regular.hoodie.jeans.cape-watch.retro.avatar.avatar.avatar.avatar' }`: a
default head in a hoodie, jeans, a cape and a watch. Use it to build and check a "Your OG"
option offline. The guest and `no-handle` mocks have no avatar.

### Naming the parts of an OG

`@opengamehq/sdk/avatar` turns `og.player.avatar` into named parts, for a game that
renders the player's OG with custom art. It is a separate entry of about 2.9 KB gzip,
outside the core and the injected global, and `dist/avatar.js` imports nothing. With a
bundler, import it from the package. Without one, copy `dist/avatar.js` into the game and
load it from a `<script type="module">`, passing `OpenGame.og` as the client.

```js
import { readAvatar, watchAvatar } from '@opengamehq/sdk/avatar'

const stop = watchAvatar(og, (avatar) => {
  if (!avatar) return useDefaultCharacter()        // guest, sharing off, preview, signed out
  avatar.head.shape                                // 'circle'
  avatar.head.hex                                  // '#F4F3EF', or null for a color this build does not know
  avatar.head.finish                               // true for patterned, metallic, neon and glass colors such as plaid or neonpink
  avatar.head.hairColor                            // chosen hair palette id, or null for the haircut's original ink
  avatar.head.facialHairColor                      // independent palette id, or null to match head hair
  avatar.outfit?.shirt                             // 'hoodie'; null outfit means draw your default body
  avatar.outfit?.accessories                       // ['cape', 'watch']
  avatar.outfit?.colors.shirt                      // { id: 'avatar', hex: '#F4F3EF', followsHead: true }
})
```

| Export | Contract |
| --- | --- |
| `readAvatar(recipe)` | `{ head, outfit }` or null when there is no well-formed look. Ids are not checked against a catalogue: a shape or garment added after your game launched still comes through, and you use your default for that part. `outfit` is null when there is no outfit or its version has no known layout. Old head colors `ink` and `paper` become `black` and `white`. |
| `watchAvatar(og, listener)` | Calls `listener` with `readAvatar`'s result now, then only when the look or outfit changes, including to null on sign-out. Returns the unsubscribe function. Rebuild a model here, not in every `onChange`. A listener that throws is reported with `console.error`. |
| `portraitUrl(avatar, { size, theme })` | The address of the player's head as a transparent PNG, drawn by OpenGame, or null when `avatar` is null. The address is made from the look alone and the image never changes. Any origin may load it, so it works as a WebGL texture with `crossOrigin = 'anonymous'`. `size` rounds up to a size OpenGame draws; `theme: 'dark'` turns the Auto color white. |

Colors come from OpenGame's tables at build time: the head palette's swatches, and the
outfit palette. `avatar` and `match` follow the head (`followsHead: true`), and their
`hex` is the head's swatch; OpenGame draws `avatar` darker by garment, with bottoms at
roughly half the head's brightness. `mono` ("Auto") is black on a light page and white
on a dark one. `identity` picks a face set; do not read it as gender, pronouns or a voice.

A native engine gets the raw recipes from the bridge's `player()`. Call `readAvatar` in
the page and pass its JSON to the engine, or parse the two strings with the field table
in the docs. Read it again each session and do not store it: a player who turns
sharing off expects their OG to leave your game.

`AVATAR-SPEC.md` in this package describes every part of an OG, with its shape,
proportions in head heights and palette, so you can draw one in any engine and art style.
`examples/avatar-threejs` builds an OG from `readAvatar`'s parts in Three.js, with
primitives only.

## Events

`og.track(name, props?)` validates custom events and returns a Result. Names are
lowercase letters, digits and underscores starting with a letter, up to 48
characters. Properties pass the shared allowlist, privacy filters and numeric
bounds. Admission is limited per minute and per client lifetime. Successful
admission means queued in memory, not delivered.

After init begins, startup events may wait for the first analytics grant, and are
dropped if the page denies it. After a credential is lost, the SDK drops new events
instead of filing them under the next player. Admitted rows keep their original
credential, ID and timestamp through retries. A full durable receipt or a list of
accepted IDs retires rows; a reply with only a count does not. `og.dispose()` can try a
final flush, but closing a tab can lose queued events.

The SDK records when the game became playable, the first trusted keyboard or pointer
input, runtime errors by fixed category, and sampled frame timing with optional heap
usage. It does not send error messages, stacks, filenames, keys or coordinates.
Sampling pauses while the game is hidden or held. `sdk_v1` input coverage means keyboard
and pointer input, not gamepads, and is not a measure of simulation or GPU performance.
The host runtime, not the SDK, sends the repeated input signal for the page's play clock.

`og.achievements.list()` returns `AchievementResult<Achievement[]>` and
`og.achievements.unlock(id)` returns `AchievementResult<AchievementUnlock>`.
IDs match `[a-z0-9][a-z0-9_-]*` within the shared length limit. Unlocking an ID the
game has not declared returns `invalid_achievement`. Results label claims as
`source: 'game_reported'`.
Private previews return `unavailable_in_preview`; disposed clients return
`disposed`. Credential changes during a request return `session_changed`.

```js
const result = await og.achievements.unlock('first_win');
if (result.ok) console.log(result.value.firstUnlock);
```

Declare each achievement in `opengame.json` (the limits page has how many, and how long
each field can be):

```json
"achievements": [
  { "id": "first_win", "title": "First win", "description": "Win a round." },
  { "id": "boss", "title": "Beat the boss" }
]
```

`opengame check` validates them. When a deploy's private preview is ready, `opengame
deploy` saves each one through `PUT /api/v1/games/{id}/achievements`, the route you can
also call yourself with a Deploy token. `opengame status` retries saves that did not
finish. Declared achievements are created or updated with their title, description
and `active: true`. Removing an achievement from `opengame.json` does not switch it
off. To retire one, send `PUT /api/v1/games/{id}/achievements` with
`{"achievementId":"first_win","title":"First win","description":"Win a round.","active":false}`.
Unlocks are never deleted.
Unlocks are refused in a private preview, so a declared achievement unlocks once the
release is published.

## External links

Check for `external-links` in `og.capabilities`, then call `og.openLink(url)` directly
from a click or key handler. HTTPS addresses without credentials are supported. The
OpenGame page shows the full address before the player chooses **Open site** or **Keep
playing**. OpenGame does not open links to the payment, tip, crypto, sign-in, ad and
tracking services on its list, as the [game rules](https://opengame.io/rules) say; the
call resolves with `invalid_request`, the same error a malformed address gets. If a
correct-looking URL fails that way, the host is on that list.

```js
creditsButton.addEventListener('click', async () => {
  const result = await og.openLink('https://example.com/credits');
  if (!result.ok && result.error !== 'cancelled') showMessage(result.reason ?? result.error);
});
```

The promise resolves after confirmation, cancellation or a fixed deadline. It also resolves
with an error when the page changes account, withdraws the capability or the client is
disposed. The capability is available only in a parent that renders this confirmation;
standalone local mode does not simulate browser navigation.

## OG Radio

`@opengamehq/sdk/radio` lets players pick OG Radio stations and songs from your game's
menu and listen while they play. The OpenGame page plays the music at the player's own
radio volume; the game sends play, pause and skip and hears back what is playing. The
injected global has the same object as `OpenGame.radio`.

```js
import { radio } from '@opengamehq/sdk/radio'

// A complete picker: All radios and each station, search, genres, an A to Z song list
// and the controls. Theme it with `{ theme }` or --og-radio-* custom properties.
const picker = radio.mountPicker(document.querySelector('#music'), { theme: { accent: '#ff3b30' } })

// Or your own controls. Songs are always A to Z by title, searched within the scope.
const page = await radio.tracks({ station: 'pixel', genre: '8bit', q: 'dawn' })
playButton.addEventListener('click', () => radio.play({ track: page.value.items[0].id }))
radio.onChange(state => { nowPlaying.textContent = state.track?.title ?? '' })
```

Anything that makes sound must be called from the player's click or key press
(`gesture_required` otherwise) and is refused as `muted` while the player has the game's
sound off. Pausing and turning the volume down always work. Outside OpenGame, the local
mock included, every call returns `unavailable`. See
[Let players listen to OG Radio in your game](https://docs.opengame.io/guides/radio).

## Leaderboards

Declare each board in `opengame.json` (up to ten), then use the same calls locally and on
OpenGame:

```js
const board = og.leaderboard('points')
await board.submit(42.5, { mode: 'hard' })   // { score, state, best, preview, ignored }
await board.top({ limit: 10 })               // { entries, order, total, shape, ... }
await board.me()                             // your entry, or null before one is accepted
await board.around()                         // ten either side of you
```

Each call returns `{ ok: true, value }` or `{ ok: false, error, reason }` instead of
throwing. Scores are finite numbers; `state` is `ok`, `clamped` or `rejected` against the
board's `min` and `max`, and only accepted scores appear in reads. Scores are the game's
claim: anybody with a console can forge one, and the game page does not rank by them.

<!-- generated:score-meta -->
Metadata takes only `label`, `mode`, `level` and `character` as strings, and `duration_ms`, `accuracy` and `combo` as numbers. Keep strings short.
<!-- /generated:score-meta -->

An entry's `name` is the player's handle while they share their profile in games, and
otherwise `Guest` and the first four characters of their `og.player.id`; a few old entries
are null. `isMe` marks yours; label guests however suits the game. Private previews have
their own boards.

### Columns, variants and runs

A board can declare stat columns next to its score, variants a run is tagged with, and
whether it keeps each player's best run or every run:

```json
{
  "key": "rounds", "label": "Rounds survived", "order": "desc", "min": 1, "max": 500,
  "scoreLabel": "Round", "format": "integer", "keep": "runs", "runsPerPlayer": 50,
  "columns": [
    { "key": "kills", "label": "Kills", "format": "integer" },
    { "key": "time", "label": "Time", "format": "duration_s", "order": "asc" }
  ],
  "variants": [
    { "key": "mode", "label": "Mode", "values": [{ "key": "solo", "label": "Solo" }, { "key": "coop", "label": "Co-op" }] }
  ]
}
```

```js
await board.submitRun({ value: 14, stats: { kills: 212, time: 1284.5 }, tags: { mode: 'coop' } })
await board.top({ sort: 'kills', filter: { mode: 'solo' }, limit: 25, offset: 25 })
await board.me({ filter: { mode: 'coop' } })
```

`submit(value, meta)` is `submitRun({ value, meta })`, and sends the request it always
sent. A stat the board does not declare is dropped and named in the receipt's `ignored`,
such as `stats.headshots`; a tag the board does not declare fails. Each stat is checked
against its column's `min` and `max` the same way as the score, and the run gets the lower state.
Entries have `stats` and `tags`; a page has `total` (rows under the filter), `offset`,
`sort`, `filter` and `shape`, the board's labels, formats, columns and variants for drawing
it. From an older API `total` and `shape` are null and `stats` and `tags` are empty, and a
page that did not apply the requested sort, filter or offset fails with
`invalid_response`, so a filtered view does not show every run. `keep: "best"`
shows each player once, by their best run for the sorted column; `keep: "runs"` shows every
run, up to `runsPerPlayer` per player for each combination of tags. Stats are the game's
claim, the same as scores.

A board with `keep: "career"` adds up each player's accepted runs on another board, named by
`from`: its score with `scoreAgg` (`sum`, `count`, `max` or `min`) and each column with an
`agg`. It is read like any board, with sort and filter, and its `shape` carries `from`,
`scoreAgg` and each column's `agg`, `of`, `where`, `scale` and `requires`. Nothing submits
to it. Locally `submit` and `submitRun` fail with `invalid_run` and name the source board;
hosted, og-api refuses the run with a 400, which reads as `invalid_request`. In local play a
career board reads as empty, because only OpenGame adds runs up. The docs guide
"Leaderboard runs" has the declaration.

#### From a game's `js/og-platform.js`

The Originals and Studio games ship `dist/og-platform.js` as `js/og-platform.js`, and it
exports this same `og`. A game submits a run at game over with:

```js
import { og } from './og-platform.js'

const saved = await og.leaderboard('rounds').submitRun({
  value: round,                                         // the score: a finite number
  stats: { kills, downs, revives, points, time },       // column key -> finite number
  tags: { mode: coop ? 'coop' : 'solo' },               // variant key -> declared value key
  meta: { character: persona },                         // optional, as for submit
})
if (!saved.ok) console.warn(saved.error, saved.reason)  // invalid_run names the field
else if (saved.value.ignored.length) console.warn('not on this board:', saved.value.ignored)
```

On the wire that is `POST https://api.opengame.gg/v1/scores` with the session token and the
body `{ board, value, meta, stats, tags }`, with `stats` and `tags` left out when the run has
none. A copy of `og-platform.js` built before this release has no `submitRun`; copy the file
again rather than posting the body by hand, so the session and the checks stay the SDK's.

Locally, boards live in `localStorage` per page directory, read `./opengame.json` on first
use through the same parser og-api uses, and start fresh when a board's bounds, order,
keep rule, columns or variants change. A local board keeps one entry, this browser's best
score, whatever its keep rule. A filter shows that entry or hides it, sorting does not move
it, and any offset is past it. A hosted failure never falls back to local scores.

## No build step

```html
<script src="opengame.js"></script>   <!-- OpenGame.og -->
```

Copy `index.js` beside the game and load it with `<script type="module">`. A game that
draws an OG copies `avatar.js` the same way and imports `watchAvatar` from it.

## Injected global and native engines

`dist/opengame-global.js` is a self-contained classic script with the SDK. The platform
serves it at `/_og/sdk.js`, selected by the release's SDK major. Load it before game
code. It exposes the core as `OpenGame`, its `OpenGame.og` alias, and `OpenGame.bridge`.
`OpenGame === OpenGame.og`; importing `{ og }` from the npm package after injection
returns that same client. Loading the full script again keeps the same client and
bridge. Importing `{ bridge }` from `@opengamehq/sdk/bridge` reuses it. Reuse is selected
from an own, versioned installation record, never from unrelated properties on
`OpenGame`. Historical `opengame.js` scripts loaded after injection leave the live
global on this installation. Creator properties remain writable and the global is
configurable; `OpenGame` stays extensible. Load injection first and read the live global
rather than retaining a legacy client captured before injection.

Native packages call the bridge below, with no handshake, credentials, transport or
local mock of their own. With `sdk.inject: false`, copy this same
`opengame-global.js` into the export and load it from the game's origin, not from a
CDN. `ready()` reports `isolated: boolean` on the core's ready message; it
does not change isolation headers or assert engine support.

```js
const bridge = OpenGame.bridge;
const pending = new Map();
bridge.setHandler((kind, id, name, json) => {
  const value = JSON.parse(json);
  if (kind === 'result') {
    const resolve = pending.get(id);
    pending.delete(id);
    resolve?.(value);
  }
});
function request(op, args = {}) {
  return new Promise(resolve => {
    const id = bridge.request(op, JSON.stringify(args));
    pending.set(id, resolve);
  });
}
await request('init');
bridge.ready();
const page = await request('board.top', { key: 'points', limit: 5 });
```

`setHandler` replaces the previous callback; pass `null` to detach it. Current player,
pause, mute and fullscreen values arrive immediately as events with id `0`. Exceptions
and rejected promises from a handler are isolated. Each `request` returns its positive
request id before its one result callback runs, including errors, while its original
handler is attached. Results use `{ ok: true, value }` or `{ ok: false, error, reason? }`.
Unknown operations and malformed arguments return `invalid_request`. There is no
credential operation, and exception text is not passed back. Unknown operations
are rejected before parsing. Argument strings are bounded by the shared manifest byte
limit before parsing.

| Operation | JSON arguments | Successful value |
| --- | --- | --- |
| `init` | `{ manifest?, dev?: { player? } }` | Environment |
| `track` | `{ name, props? }` | Void |
| `openLink` | `{ url }` | Void |
| `fullscreen`, `signIn` | `{}` | Void |
| `board.submit` | `{ key, score, meta?, stats?, tags? }` | Score receipt; with `stats` or `tags` it is `submitRun` |
| `board.top` | `{ key, limit?, offset?, sort?, filter? }` | Leaderboard page |
| `board.me`, `board.around` | `{ key, sort?, filter? }` | Score entry/null, or page |
| `achievements.unlock` | `{ id }` | Unlock receipt, the same as `og.achievements.unlock(id)` |
| `achievements.list` | `{}` | The player's achievements, the same as `og.achievements.list()` |

`env()` and `player()` return JSON strings synchronously.

## Errors

Core, events and leaderboards return `{ ok: false, error, reason? }` instead of throwing. The `error` is one of these codes.

<!-- errors:start -->
| Code | Where | Retry? | What to do |
| --- | --- | --- | --- |
| `unavailable` | both | no | The page did not offer this capability. Check og.capabilities first; the local mock simulates account, leaderboard and analytics features. |
| `invalid_event` | returned | no | Event names are lowercase letters, digits and underscores, starting with a letter, at most 48 characters, and 1 KB with properties. |
| `rate_limited` | both | yes | Too many calls in the window. Events allow 60 a minute. Wait, then try again. |
| `invalid_board` | returned | no | Use a board key declared in opengame.json: lowercase letters, digits, hyphens and underscores. |
| `board_unavailable` | returned | no | This board is not declared in opengame.json, or the published game has no such board. |
| `invalid_score` | returned | no | Scores are finite numbers. |
| `invalid_meta` | returned | no | Score metadata takes only label, mode, level and character as strings, and duration_ms, accuracy and combo as numbers. Keep strings short. |
| `invalid_run` | returned | no | A run's stats are finite numbers keyed by the board's columns, and its tags name one of the board's variants and one of its values. A career board takes no runs; submit to the board it is fed from. The reason names the field or the source board. |
| `invalid_limit` | returned | no | A read limit is a positive integer. Values above the maximum are capped. |
| `invalid_query` | returned | no | Sort by score or a sortable column, filter by the board's variants, and page top() with a whole-number offset. The reason names the part. |
| `invalid_manifest` | returned | no | opengame.json has an invalid leaderboards list. The reason names the board and the field; opengame check says the same. |
| `gesture_required` | returned | yes | Call og.openLink, or an og.radio control that makes sound, directly from a click or key handler. For a link, then confirm the destination on the OpenGame page. |
| `muted` | returned | yes | The player has silenced this game on OpenGame, or another part of the page has the speakers, so the radio stays quiet. Offer Play again once og.audio.onHostMute reports false. |
| `not_found` | returned | no | No station, genre or song by that id. Use the ids og.radio.stations() and og.radio.tracks() return. |
| `invalid_request` | returned | no | The API could not read the request. Check the arguments against the README. |
| `invalid_achievement` | returned | no | Use a declared achievement ID with lowercase letters, digits, hyphens or underscores within the shared length limit. |
| `achievement_unavailable` | returned | yes | The achievement service refused the request. Check the published game and retry when it is available. |
| `unavailable_in_preview` | returned | no | Achievements work in a published game only. A preview answers this every time; unlock and list them after publishing. |
| `network` | returned | yes | The request failed before any service answered. Check the connection, then try again. |
| `cancelled` | returned | yes | The AbortSignal passed to the call was aborted. |
| `timeout` | returned | yes | The page did not answer in time. Try again. |
| `session_changed` | both | yes | The player signed in, out or switched account. Read the player again. |
| `disposed` | both | no | og.dispose() was called on this client. |
| `invalid_response` | both | yes | A service answered with something the SDK does not accept. Try again, and report it if it repeats. |
| `busy` | returned | yes | Too many requests are waiting on the page. Let one finish first. |
<!-- errors:end -->

## Documentation

Guides for each engine, the avatar recipe and the full API are at
[docs.opengame.io](https://docs.opengame.io). `AVATAR-SPEC.md` in this package is the
style spec for drawing an OG in any engine.

## License

Apache-2.0

# Leaderboards

## Declare the board

Every board the game uses is declared in `opengame.json`, up to
10 of them:

```json
{ "leaderboards": [{ "key": "rounds", "order": "desc", "label": "Rounds survived", "min": 0, "max": 75 }] }
```

`order` is `desc` when bigger is better and `asc` for times. `min` and `max` reject the
absurd; they do not stop cheating. Changing a board's bounds, order, keep rule, columns or
variants starts a fresh board locally.

## The calls

```js
const board = og.leaderboard('rounds')
const saved  = await board.submit(14, { mode: 'coop' })  // value: { score, state, best, preview }
const top    = await board.top({ limit: 10 })           // value: { entries, order, preview, source }
const mine   = await board.me()                         // value: an entry, or null before a score
const nearby = await board.around()                     // entries around the player
```

- `submit` takes a finite number. The stored `state` is `ok`, `clamped` (pulled back
  inside the board's bounds) or `rejected`. `best` says whether it beat the player's
  previous best; only accepted scores appear in reads.
- `top` reads up to 100 entries, 50
  by default. `around` returns up to 10 entries
  either side of the player. Reads are cached for 30 seconds.
- Entries carry `name`, `score`, `meta`, `createdAt`, `rank` and `isMe`. Show `name` as
  given; a few old rows are `null`.
- `source` is always `game_reported`. Show it as the game's own scoreboard, never as a
  verified result or a prize standing.

## Columns, variants and runs

A board can declare stat `columns` beside its score, `variants` a run is tagged with, and
`keep`: `best` shows each player once, and `runs` keeps every run, up to a per-player count
the board declares for each combination of tags. The SDK README has a full declaration.

```js
const run = await board.submitRun({ value: 14, stats: { kills: 212, time: 1284.5 }, tags: { mode: 'coop' } })
const solo = await board.top({ sort: 'kills', filter: { mode: 'solo' }, limit: 25, offset: 25 })
const mine = await board.me({ filter: { mode: 'coop' } })
```

- `submit(value, meta)` is `submitRun({ value, meta })`. A stat the board does not declare
  is dropped and named in the receipt's `ignored`; a tag it does not declare fails with
  `invalid_run`, whose reason names the field. Stats are checked against their column's
  `min` and `max` like the score, and they are the game's claim too.
- `sort` is `score` or a sortable column, `filter` names declared variant values, and
  `offset` pages `top()`. Anything else fails with `invalid_query`.
- Entries carry `stats` and `tags`. A page carries `total` (rows under the filter),
  `offset`, `sort`, `filter` and `shape`, the board's labels and formats for drawing it.
- Locally a board keeps one entry, this browser's best, whatever its keep rule.

## Metadata

Allowed keys and types: `label` (string), `mode` (string), `level` (string), `character` (string), `duration_ms` (number), `accuracy` (number), `combo` (number). Strings up to
24 characters, 384 bytes in
all. Contact-like text is refused, including short email addresses and long digit runs.
Use metadata for game context ("coop", "hard", "level 3"), never personal details.

## Results, not exceptions

Every call resolves to `{ ok: true, value }` or `{ ok: false, error, reason }`. The
errors to handle: `rate_limited`, `board_unavailable`, `invalid_score`, `invalid_meta`,
`invalid_run`, `invalid_board`, `invalid_limit`, `invalid_query`, `invalid_manifest`,
`invalid_request` and `unavailable`. Requests stop after
5 seconds. Show a quiet "Scores are unavailable right now"
and let the player keep playing; never block a retry screen on a leaderboard.

## Previews and local play

Scores from the owner's private preview are kept separate from public scores and say
`preview: true`. Outside OpenGame, boards live in `localStorage` per page folder; the
first board call reads `./opengame.json` beside the page, or pass the imported manifest
to `og.init({ manifest })` when the build moves it.

## Achievements

Declare each one in `opengame.json`, up to 100:

```json
{ "achievements": [{ "id": "first_win", "title": "First win", "description": "Win a round." }] }
```

`opengame check` validates them, and a deploy saves them when its preview is ready.
Removing one from the file does not switch it off; the SDK README says how.

```js
const unlocked = await og.achievements.unlock('first_win')  // value: { achievementId, unlocked, firstUnlock, unlockedAt, source }
const mine = await og.achievements.list()                    // value: every declared achievement, unlocked or not
```

- Unlock once per moment, not every frame: keep a set of what this run already sent.
- A private preview answers `unavailable_in_preview`, so a declared achievement first
  unlocks on the published game. Other failures are `invalid_achievement` (an id that
  is malformed or not declared), `achievement_unavailable`, `unavailable` (no session),
  `session_changed`, `network` and `invalid_response`.
- Outside OpenGame, and before `og.init()` has resolved, every achievement call answers
  `unavailable`. Unlike boards, achievement results carry `error` and no `reason`.
- Like scores, every unlock is `source: 'game_reported'`: the game's own claim.

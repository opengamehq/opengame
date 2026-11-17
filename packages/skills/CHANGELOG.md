# Changelog

## 1.7.1

- Unreal Engine 5.9 Wasm packages are hosted: `opengame-sdk` 1.0.14 says how C++ calls the
  `window.OpenGame` OpenGame adds to a threaded page, `opengame-deploy` 1.1.11 names Unreal
  among the engines, and `opengame-all-in-one` 1.0.9 carries both.
- `opengame-deploy` 1.1.10, also in this release: any web framework that builds static files
  deploys, and a Next.js app needs `output: "export"`. `opengame-all-in-one` 1.0.8 carried it.

## 1.7.0

- Matched to the CLI, the SDK and the API on 17 Nov 2026: `opengame-cli` 1.9.2, `opengame-deploy`
  1.1.9, `opengame-jam` 1.1.1, `opengame-router` 1.0.9, `opengame-performance` 1.1.2 and
  `opengame-all-in-one` 1.0.7 describe Auto details, the scopes jam withdraw takes, exit 7,
  `--json` against `--jsonl`, every review state, and `opengame setup` installing every skill.
- `opengame-cli` 1.9.1 and `opengame-deploy` 1.1.8: installing the CLI is followed by
  `opengame setup`, which gives every coding agent on the machine the OpenGame skills in its own
  home folder, and the CLI keeps them current. `opengame-all-in-one` 1.0.6 carries both.

## 1.6.0

- `opengame-cli` 1.9.0, `opengame-deploy` 1.1.7, `opengame-jam` 1.1.0 and `opengame-api`
  1.0.8 publish a release that passed review with `opengame publish`, `opengame deploy
  --publish` or `POST /api/v1/submissions/{id}/publish` when the creator asks, and say that an
  update of a live game publishes by itself. `opengame-all-in-one` 1.0.5 carries them.

## 1.5.0

- What OG Snipers (OS), Last Contact (LC) and OG Hero (OH) taught us, read from their
  whole records, is in the craft skills. Twenty of them move to 1.1.0, and
  `opengame-characters` to 1.2.0: accessibility, assets, audio, capture,
  depth, enemies, front-end, game-feel, lighting, loading, look, mobile, performance,
  production, quality-bar, scene-audit, stability, verification, weapons and world-physics.
  `opengame-quality-bar` defines the new game codes.
- New craft skills: `opengame-rhythm` 1.0.0, `opengame-maps` 1.0.0 and
  `opengame-multiplayer` 1.0.0, which teaches a game to bring its own server.
- A new video family: `opengame-trailer-plan`, `opengame-trailer-make`,
  `opengame-trailer-review-and-improve`, `opengame-montage-plan`, `opengame-montage-make`
  and `opengame-montage-review-and-improve`, all 1.0.0.
- `opengame-all-in-one` 1.0.0 carries every other skill whole, with the order to use them
  in, for a single install. `opengame skills add --all` leaves it out, because it repeats
  the others.
- `opengame-router` 1.0.8 routes to the new skills, `opengame-deploy` 1.1.3 says how to
  install every skill as one, and `opengame-sdk` 1.0.11 says what pause means in a shared
  online match.
- `opengame-multiplayer` 1.1.0: invites open the game on OpenGame through `og.invite`, and
  PeerJS runs on the creator's own PeerServer with TURN. `opengame-sdk` 1.0.13 and
  `opengame-deploy` 1.1.5 teach the same, and `opengame-all-in-one` 1.0.2 carries them.
- `opengame-performance` 1.1.1 and `opengame-scene-audit` 1.1.1 fix their helpers: a failed frame
  leaves the landing pacer's queue, and a hidden collider keeps its `nodraw` reason.

## 1.4.0

- `opengame-sdk` 1.0.10 teaches `og.player.stats()`, which reads the player's own entry on
  every board in one request, a career board's row included, so a game can read XP and
  levels back. It also has the higher event and score budgets and the 25-board limit, and
  drops the request to credit OG Radio's music.
- `opengame-cli` 1.8.0 and `opengame-deploy` 1.1.0: `opengame init` asks a person only the
  game's name, and the description, genre and jam entry are filled in on the deploy's page
  afterwards. Do not ask the creator for a description or genre before deploying.
- `opengame-deploy` 1.1.1 and `opengame-jam` 1.0.7: a build can be 4 GiB zipped, 5 GiB
  unpacked and 25,000 files, from 1 GiB, 1.5 GiB and 10,000.
- `opengame-api` 1.0.5, `opengame-cli` 1.8.1, `opengame-deploy` 1.1.1, `opengame-jam` 1.0.7
  and `opengame-router` 1.0.6: OpenGame opens on 18 November 2026, the jam's kickoff, all
  at once.
- `opengame-api` 1.0.6, `opengame-cli` 1.8.2, `opengame-deploy` 1.1.2, `opengame-jam` 1.0.8
  and `opengame-router` 1.0.7: any signed-in account can use the CLI, the creator API,
  uploads and jam entries before launch. Only a request with no account still hears
  `not_launched` until 18 November; sign in first.

## 1.3.0

- `opengame-cli` 1.2.0 teaches `opengame unpublish` and `opengame restore`, run only when
  the person asks, 1.3.0 `opengame details` and `opengame handle`, 1.4.0 `opengame jam
  withdraw` and `opengame jam reenter`, 1.5.0 `opengame delete`, 1.6.0 `opengame achievements`, and 1.7.0 `opengame stats --csv`.

## 1.2.0

- `opengame-cli` 1.1.0 teaches `opengame releases` and `opengame rollback`, and says to
  roll a live game back only with the person's go-ahead.

## 1.1.0

- `opengame-sdk` 1.0.9 teaches OG Radio (`og.radio` and its picker, in
  `references/radio.md`) and leaderboard runs (`board.submitRun` with stats and tags, and
  reads by sort, filter and offset).
- `opengame-deploy` 1.0.9 reads the origin a published game runs at from
  `data.gameOrigin`, and tells the creator to allow that exact origin on their own servers.
- `opengame-api`, `opengame-cli`, `opengame-deploy`, `opengame-jam`, `opengame-router` and
  `opengame-sdk` name the day the CLI, uploads and the creator API open, the jam's kickoff,
  read from the launch clock.

## 1.0.0

- First release on npm: the rendered OpenGame skills with their changelogs, the manifest
  `opengame skills add` installs from, and a Claude Code plugin marketplace.

# Changelog

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

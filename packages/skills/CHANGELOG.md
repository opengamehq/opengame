# Changelog

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

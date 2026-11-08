# Changelog

## 0.5.0

- Before OpenGame opens for creators, a refused command names the day it opens ("OpenGame
  opens for creators on 18 November") rather than saying it is not launched.
- `opengame deploy` returns `gameOrigin`, the origin the published game runs at, and says
  to allow that exact origin when the game's own servers check `Origin` or send CORS
  headers.
- `opengame pull` names the website setting opengame.json cannot hold, such as a player
  count it has no room for, and the way past it, rather than a general manifest error.
- `--help --json` no longer carries `internal: true`, and the local checker's failure no
  longer tells you to reinstall an internal CLI.
- Ships the skills from `@opengamehq/skills` 1.1.0.

## 0.4.0

- First release on npm. This version is published by hand and has no npm provenance
  statement; versions published from this repository's workflow will.
- Add the launch check and the `not_launched` exit code (7): when OpenGame has not opened
  for the account, a command that needs it says so and stops.
- `AGENTS.md` is in the package: the procedure a coding agent follows to deploy a game.

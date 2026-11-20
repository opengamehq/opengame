> Carried from `opengame-router` 1.0.11. Read it when: Build, test and submit a browser game on OpenGame. Routes game work to the deploy guide, whole-game review and relevant craft skills. Use when someone asks to make a game, improve a game, check it, deploy it or enter an OpenGame jam.


# Work on an OpenGame game

Any signed-in account can use the CLI, uploads and jam entries. Sign in with
`opengame login` first.

Read https://opengame.io/for-agents.md and the AGENTS.md in the CLI package, then [the
working process](references/process.md), before changing the game. Ask the person
before every `opengame deploy` or `opengame publish`, an update to a live game included, and
wait for a clear yes: a deploy can use one of their jam entries, and an update goes live by
itself. Keep the
user's scope and budget. Read only the specialists that apply to the next change.

`opengame setup` installs every OpenGame skill for the agents on the machine, and the CLI
keeps them current. `opengame skills add .` installs a starting set into one project: this
router, `opengame-deploy` and `opengame-quality-bar`. Run `opengame skills list --json` to
see the installed CLI's catalog, and add a specialist to the project with
`opengame skills add . --skill <name>`.

| Work | Skill |
| --- | --- |
| Check, deploy, private preview, publish | `opengame-deploy` |
| A CLI command, its output or its exit code | `opengame-cli` |
| Calling the API from your own tool or CI | `opengame-api` |
| Review the whole game | `opengame-quality-bar` |
| Controls, feedback, camera motion | `opengame-game-feel` |
| Lighting or color | `opengame-lighting`, `opengame-look` |
| Collision and movement | `opengame-world-physics` |
| Maps and levels: spawns, sightlines, guidance, a map that plays wrong | `opengame-maps` |
| Geometry, props or stairs | `opengame-scene-audit` |
| Frame time or memory | `opengame-performance` |
| Models, textures or audio assets | `opengame-assets`, `opengame-audio` |
| Characters, animation, or the player's own OG | `opengame-characters` |
| Menus or HUD | `opengame-front-end` |
| Keyboard, focus or accessibility | `opengame-accessibility` |
| Rules, goals or progression | `opengame-depth` |
| Integrating with OpenGame: the SDK, the player and every name field, boards, achievements, events, fullscreen and keys in the frame | `opengame-sdk` |
| Tests and evidence | `opengame-verification` |
| First-person guns, sights and viewmodels | `opengame-weapons` |
| Enemy AI, navigation, hordes, bosses, deaths | `opengame-enemies` |
| Rhythm and music games: charts, timing, calibration | `opengame-rhythm` |
| Multiplayer: lobbies, rooms, bots standing in for players | `opengame-multiplayer` |
| Boot time, streaming, caching, progress bar | `opengame-loading` |
| Touch, phone memory, Safari on a real phone | `opengame-mobile` |
| Crashes, pool budgets, error reporting | `opengame-stability` |
| Screenshots, captures, filming the game | `opengame-capture` |
| A launch trailer: plan it, make it, review each cut | `opengame-trailer-plan`, `opengame-trailer-make`, `opengame-trailer-review-and-improve` |
| A gameplay montage cut to a song | `opengame-montage-plan`, `opengame-montage-make`, `opengame-montage-review-and-improve` |
| A long build with agents and owner feedback rounds | `opengame-production` |
| Jam fields and eligibility | `opengame-jam` |

`opengame-all-in-one` carries every skill in this table as one install, with the order
to use them in, for a big build that will touch most of them.

Run the whole-game review before handing over a finished game. Mark checks that do
not apply with a reason. Missing tools or evidence mean unverified.

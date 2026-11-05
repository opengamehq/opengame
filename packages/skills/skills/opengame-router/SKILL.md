---
name: opengame-router
description: Build, test and submit a browser game on OpenGame. Routes game work to the deploy guide, whole-game review and relevant craft skills. Use when someone asks to make a game, improve a game, check it, deploy it or enter an OpenGame jam.
metadata:
  version: "1.0.4"
---

# Work on an OpenGame game

OpenGame opens on {{launch opens}}, and jam entries open on {{launch kickoff}}.
Until OpenGame launches, the CLI and the creator API answer "OpenGame is not launched."
to everybody outside the OpenGame team. That is the platform's answer, not a fault in the
game: tell the person, and keep working on the game itself, which they can still build and
play in a browser.

Read [the working process](references/process.md) before changing the game. Keep the
user's scope and budget. Read only the specialists that apply to the next change.

The starting set is this router, `opengame-deploy` and `opengame-quality-bar`.
Run `opengame skills list --json` to see the installed CLI's catalog. Use
`opengame help --json` for its skill selection options before installing a specialist.

| Work | Skill |
| --- | --- |
| Check, deploy, private preview, submit | `opengame-deploy` |
| A CLI command, its output or its exit code | `opengame-cli` |
| Calling the API from your own tool or CI | `opengame-api` |
| Review the whole game | `opengame-quality-bar` |
| Controls, feedback, camera motion | `opengame-game-feel` |
| Lighting or color | `opengame-lighting`, `opengame-look` |
| Collision and movement | `opengame-world-physics` |
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
| Boot time, streaming, caching, progress bar | `opengame-loading` |
| Touch, phone memory, Safari on a real phone | `opengame-mobile` |
| Crashes, pool budgets, error reporting | `opengame-stability` |
| Trailers, screenshots, filming the game | `opengame-capture` |
| A long build with agents and owner feedback rounds | `opengame-production` |
| Jam fields and eligibility | `opengame-jam` |

Run the whole-game review before handing over a finished game. Mark checks that do
not apply with a reason. Missing tools or evidence mean unverified.

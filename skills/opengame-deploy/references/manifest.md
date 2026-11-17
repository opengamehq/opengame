# opengame.json

The game's manifest, committed with its code. `opengame init` writes it; the website
edits the same fields. The game's id is never in this file: it lives in
`.opengame/project.json`, which is git-ignored, so a fork never deploys over somebody
else's game. Jam answers (track, models, sponsors) are never stored here either, because
they belong to one entry, not to the game.

```json
{
  "$schema": "https://opengame.io/schema/opengame.json",
  "title": "Night shift",
  "description": "Survive until dawn with a torch and a dwindling battery.",
  "genre": "shooter-survival",
  "kind": "game",
  "build": { "command": "npm run build", "output": "dist" },
  "controls": ["keyboard", "mouse"],
  "leaderboards": [{ "key": "rounds", "order": "desc", "label": "Rounds survived", "min": 0, "max": 75 }]
}
```

| Field | Rule |
| --- | --- |
| `title` | 3 to 40 characters, or `auto` |
| `tagline` | Optional, up to 140 characters, or `auto` |
| `description` | 40 to 500 characters, or `auto`. Say what the player does |
| `genre` | Exactly one slug from the table below, or `auto` |
| `kind` | Optional. One of the four kinds below; leaving it out means `game`. `opengame init` always writes it |
| `basedOn` | The name of the game a `decomp` or a `mod` is made from, up to 60 characters, shown as "Mod of Doom". Required for a `decomp` or a `mod`, and not allowed for a `game` or a `world` |
| `build.command` | Optional, up to 1,000 characters. Run before checking; may read environment variables but must not contain a secret |
| `build.output` | The folder holding `index.html` after the build, or `.` |
| `cover` | Not used. OpenGame makes the cover after approval. A file that still names one passes `check`, and the CLI does not upload it; leave the field out |
| `controls` | One or more of `keyboard`, `mouse`, `gamepad`, each once, or `auto` |
| `requires` | Optional. `threads: true` for a build that cannot start without them, `renderer` (`webgl`, `webgl2` or `webgpu`), `desktopOnly`, `gamepad`. The game page lists them, and a browser that cannot run threads is told so instead of getting a black frame |
| `leaderboards` | Up to 25 boards: `key` (lowercase, starts with a letter, up to 48 characters), `order` (`asc` or `desc`), `label` (up to 60 characters), optional `min` and `max` |
| `achievements` | Up to 100: `id` (lowercase letters, digits, `-` and `_`, up to 48 characters), `title`, optional `description`. A deploy saves them when its preview is ready |
| `sdk` | Optional. A version string, or `{ "inject": false, "version": "..." }`. `inject: false` is honoured only on the older contract whose serving tree the pipeline rewrites; the contracts that add `/_og/sdk.js` at the edge always add it |
| `runtimes` | Optional. Settings for a runtime the platform serves pinned (js-dos, Ruffle, Pyodide, wasmoon, Flutter's CanvasKit); the engine's guide says which |

Write the title and description from the game itself. Read the code, play it if you
can, and describe what is there. A description that promises modes the game does not
have is a review finding.

## Genres

| Slug | Genre |
| --- | --- |
| `shooter-survival` | Shooter & survival |
| `action-adventure` | Action & adventure |
| `rpg` | RPG |
| `platformer` | Platformer |
| `strategy` | Strategy |
| `simulation-management` | Simulation & management |
| `racing-sports` | Racing & sports |
| `fighting` | Fighting |
| `puzzle-casual` | Puzzle & casual |
| `party-social-sandbox` | Party, social & sandbox |

## Kinds

Ask the person which one it is rather than guessing from the code. A mod or a decomp is
made from someone else's game, which is a fact about where it came from, not about how
it plays.

| Kind | What it is | `basedOn` | Can enter the jam |
| --- | --- | --- | --- |
| `game` | Something to play, with goals, rules or a way to win | Not allowed | Yes |
| `world` | A place to explore or hang out in, with nothing you have to win | Not allowed | Yes |
| `decomp` | An existing game rebuilt from its decompiled code | Required | No |
| `mod` | Changes to an existing game, like new levels, rules or art | Required | No |

`opengame init --kind mod --based-on "Doom"` writes both. Without `--kind`, init makes a
game; it asks a person nothing but the game's name.

## Auto

`title`, `tagline`, `description`, `genre` and `controls` take `"auto"`, and a field that is
blank or left out means the same. `opengame init` writes `"auto"` for every one of them it is
not given. Review writes an Auto field from the game itself, and the creator accepts or
changes what it wrote on the deploy's page before anything publishes; the subgenre is always
review's. Do not ask the creator for a description or a genre before deploying. Once review
passes, `opengame publish --description` and `--genre` answer from here instead, and
`opengame details --description` changes the words once the game exists. A title or
description the creator typed is theirs: review offers a tidied copy on a first publish, and
`opengame publish --keep-words` keeps theirs.

## Who owns which value

Metadata on the server has revisions. A deploy sends the manifest with the revision it
was last synced from. If the website is newer, the deploy keeps the website's values
and says which fields it kept. `kind` and `basedOn` are among those fields: a reviewer
can correct a kind on the website, and a pull brings the correction down. `opengame pull` writes the website's values into this
file, backing up the previous one in `.opengame/manifest-before-pull.json`.
`opengame deploy --metadata=local` replaces the website's values on purpose; use it
only when the person asked for that.

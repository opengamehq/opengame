# opengame.json

The game's manifest, committed with its code. `opengame init` writes it; the website
edits the same fields. The game's id is never in this file: it lives in
`.opengame/project.json`, which is git-ignored, so a fork never deploys over somebody
else's game. Jam answers (track, certification) are never stored here either, because
they belong to one entry, not to the game.

```json
{
  "$schema": "https://opengame.io/schema/opengame.json",
  "title": "Night shift",
  "description": "Survive until dawn with a torch and a dwindling battery.",
  "genre": "shooter-survival",
  "kind": "game",
  "build": { "command": "npm run build", "output": "dist" },
  "cover": "marketing/cover.png",
  "controls": ["keyboard", "mouse"],
  "leaderboards": [{ "key": "rounds", "order": "desc", "label": "Rounds survived", "min": 0, "max": 75 }]
}
```

| Field | Rule |
| --- | --- |
| `title` | {{n text.gameTitle.productMin}} to {{n text.gameTitle.max}} characters |
| `tagline` | Optional, up to {{n text.gameTagline.max}} characters |
| `description` | {{n text.gameDescription.productMin}} to {{n text.gameDescription.max}} characters. Say what the player does |
| `genre` | Exactly one slug from the table below |
| `kind` | Optional. One of the four kinds below; leaving it out means `game`. `opengame init` always writes it |
| `basedOn` | The name of the game a `decomp` or a `mod` is made from, up to {{n text.gameBasedOn.max}} characters, shown as "Mod of Doom". Required for a `decomp` or a `mod`, and not allowed for a `game` or a `world` |
| `build.command` | Optional, up to {{n platform.manifest.buildCommandCharsMax}} characters. Run before checking; may read environment variables but must not contain a secret |
| `build.output` | The folder holding `{{raw bundle.entryPoint}}` after the build, or `.` |
| `cover` | Optional image path inside the project, up to {{mib platform.moderation.imageBytesMax}} |
| `controls` | One or more of `keyboard`, `mouse`, `gamepad`, each once |
| `requires` | Optional. `threads: true` for a build that cannot start without them, `renderer` (`webgl`, `webgl2` or `webgpu`), `desktopOnly`, `gamepad`. The game page lists them, and a browser that cannot run threads is told so instead of getting a black frame |
| `leaderboards` | Up to {{raw platform.manifest.boardCountMax}} boards: `key` (lowercase, starts with a letter, up to {{raw platform.manifest.boardKeyCharsMax}} characters), `order` (`asc` or `desc`), `label` (up to {{raw platform.manifest.boardLabelCharsMax}} characters), optional `min` and `max` |
| `achievements` | Up to {{raw analytics.achievementDefinitionsMax}}: `id` (lowercase letters, digits, `-` and `_`, up to {{raw analytics.achievementIdCharsMax}} characters), `title`, optional `description`. A deploy saves them when its preview is ready |
| `sdk` | Optional. A version string, or `{ "inject": false, "version": "..." }`. `inject: false` is honoured only on the older contract whose serving tree the pipeline rewrites; the contracts that add `/_og/sdk.js` at the edge always add it |
| `runtimes` | Optional. Settings for a runtime the platform serves pinned (js-dos, Ruffle, Pyodide, wasmoon, Flutter's CanvasKit); the engine's guide says which |

Write the title and description from the game itself. Read the code, play it if you
can, and describe what is there. A description that promises modes the game does not
have is a review finding.

## Genres

| Slug | Genre |
| --- | --- |
{{genretable}}

## Kinds

Ask the person which one it is rather than guessing from the code. A mod or a decomp is
made from someone else's game, which is a fact about where it came from, not about how
it plays.

| Kind | What it is | `basedOn` | Can enter the jam |
| --- | --- | --- | --- |
{{kindtable}}

`opengame init --kind mod --based-on "Doom"` writes both. Without `--kind`, init asks a
person in a terminal and makes a game for an agent.

## Who owns which value

Metadata on the server has revisions. A deploy sends the manifest with the revision it
was last synced from. If the website is newer, the deploy keeps the website's values
and says which fields it kept. `kind` and `basedOn` are among those fields: a reviewer
can correct a kind on the website, and a pull brings the correction down. `opengame pull` writes the website's values into this
file, backing up the previous one in `.opengame/manifest-before-pull.json`.
`opengame deploy --metadata=local` replaces the website's values on purpose; use it
only when the person asked for that.

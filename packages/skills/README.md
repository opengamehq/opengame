# @opengamehq/skills

Agent skills for making browser games and putting them on
[OpenGame](https://opengame.io). They teach a coding agent such as Claude Code, Codex,
Cursor or OpenCode how to build a game that plays well, check it and deploy it.

## Install

<!-- install:skills -->
```bash
npx skills add opengamehq/opengame
```
<!-- /install -->

Through the CLI, `opengame setup` installs every skill (all but `opengame-all-in-one`) into
each coding agent's own skills folder and keeps them current as the CLI updates;
`opengame setup --no-skills` stops that. To commit skills with one project instead,
`opengame skills add .` installs the starting set for the agent you use,
`opengame skills add . --all` installs every skill once, each in its own folder (not
`opengame-all-in-one`, which would repeat them), and
`opengame skills add . --skill opengame-all-in-one` installs all of them as one.

### Get the CLI

<!-- install:cli -->
```bash
npm i -g @opengamehq/cli
opengame setup
```
<!-- /install -->

To pin a version or vendor the files yourself, copy a skill's folder out of this package's
`dist/skills/`.

## What is in the package

```
dist/
  skills/
    manifest.json             every skill, its version and a sha256 per file
    opengame-router/
      SKILL.md
      CHANGELOG.md
      references/...
    ...
  .claude-plugin/
    marketplace.json          the same skills as a Claude Code plugin marketplace
```

Each skill is a folder with a `SKILL.md`, the files it references and its own
`CHANGELOG.md`. Every skill has a version in its `SKILL.md` front matter
(`metadata.version`), and `manifest.json` lists it beside the hash of each file the skill loads (the changelog
is beside the skill and not in the list):

```json
{
  "format": 1,
  "limitsVersion": "...",
  "skills": [
    {
      "name": "opengame-router",
      "family": "platform",
      "default": true,
      "description": "Build, test and submit a browser game on OpenGame. ...",
      "version": "1.0.0",
      "files": [{ "path": "SKILL.md", "sha256": "..." }],
      "digest": "..."
    }
  ]
}
```

Read it from code with `@opengamehq/skills/manifest.json`; a skill's folder resolves as
`@opengamehq/skills/skills/<name>/SKILL.md`.

There are four families. Platform skills cover OpenGame itself: the CLI, the API, the
SDK, deploys and jams. Craft skills cover making the game good: look, lighting, game
feel, maps, rhythm games, audio, performance, accessibility, testing and the
rest. Video skills film it: a launch trailer and a gameplay montage, each planned, made and
reviewed in rounds. `opengame-router` points an agent at the ones a task needs, and
`opengame-quality-bar` reviews the whole game.

The fourth family is one skill, `opengame-all-in-one`, which carries every other skill
whole under its `references/` with the order to use them in, for somebody who wants a
single install. The build assembles it from the others, so it cannot fall behind them.

## Documentation

How the skills fit into making and shipping a game is at
[docs.opengame.io](https://docs.opengame.io).

## License

Apache-2.0

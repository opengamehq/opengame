# OpenGame

The developer tools for [OpenGame](https://opengame.io), where people publish browser games
and strangers play them. This repository holds the CLI, the SDK, the agent skills, the engine
starters and the OpenAPI contract for the public API.

Documentation: [docs.opengame.io](https://docs.opengame.io)

## Install

The CLI checks a game and uploads it, and `opengame help` lists its commands.

<!-- install:cli -->
```bash
npm i -g @opengamehq/cli
```
<!-- /install -->

A game calls the SDK at runtime to read who is playing and their OG, and to keep
leaderboards, achievements and events. Every call is optional, and a game that uses the SDK
still runs outside OpenGame.

<!-- install:sdk -->
```bash
npm i @opengamehq/sdk
```
<!-- /install -->

The skills teach a coding agent to build a game and ship it here.

<!-- install:skills -->
```bash
npx skills add opengamehq/opengame
```
<!-- /install -->

## What is in this repository

| Folder | What it is |
| --- | --- |
| `packages/cli` | `opengame`, the command line tool, published as `@opengamehq/cli` |
| `packages/sdk` | The game SDK, published as `@opengamehq/sdk` |
| `packages/skills` | The source of the agent skills, published as `@opengamehq/skills` |
| `skills` | The built skills, which `npx skills add` installs |
| `packages/protocol` | The request and response types the CLI, the SDK and the server share |
| `packages/preflight` | The local checks `opengame check` runs before an upload |
| `packages/shared` | Limits and lists the packages above read |
| `templates` | Starter projects, one per engine |
| `api-reference/openapi.json` | The OpenAPI contract for the public HTTP API |

The servers these packages talk to are not here.

## Build and test

```bash
npm ci
npm run build
npm test
```

## Issues and pull requests

Open an issue for a bug, a confusing error, an engine export the CLI gets wrong or a skill
that teaches the wrong thing. Pull requests are welcome too. This repository is copied from
OpenGame's own monorepo at each release, so a pull request is not merged here: when we take
one, we copy it into the monorepo with credit to you, and it arrives in the next release.
[CONTRIBUTING.md](CONTRIBUTING.md) has the details.

To report a vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## License

[Apache 2.0](LICENSE).

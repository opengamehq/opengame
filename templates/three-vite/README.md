# Orb Run

A starter for an OpenGame game: Three.js, Vite and `@opengamehq/sdk`, with a
leaderboard, pause and the ready signal already wired.

```bash
npm install
npm run dev
```

Deploy with the OpenGame CLI: `opengame login`, then `opengame deploy .`. Agents should
read `AGENTS.md` first. The docs start at
the Quickstart page in the OpenGame docs (`/quickstart`).

Build it inside a checkout of the OpenGame repository, where `npm install` takes the SDK
from `packages/sdk`.

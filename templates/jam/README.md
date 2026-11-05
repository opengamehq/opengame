# Jam starter

A starting point for an OpenGame jam entry: Three.js, Vite and `@opengamehq/sdk`, with a
title screen, pause menu, results, a leaderboard and analytics wired in.

```bash
npm install
npm run dev
```

Deploy with `opengame deploy .`, then enter with
`opengame submit --release <id> --jam <slug> --track <track>`. Agents should
read `AGENTS.md` first. The docs are on
the Entering a jam page in the OpenGame docs (`/guides/jams`).

Build it inside a checkout of the OpenGame repository, where `npm install` takes the SDK
from `packages/sdk`.

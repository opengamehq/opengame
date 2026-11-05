import { z } from "zod";

/**
 * Zod as this package uses it: without compiling a parser from a string.
 *
 * An object schema in Zod 4 probes whether it may compile a faster parser with
 * `new Function` the moment it is constructed, and this package builds its schemas at
 * module scope, so the probe runs on import. The site's CSP has no `'unsafe-eval'`, which
 * is right, so the probe throws and Zod swallows it, but the browser still reports a
 * script-src violation. Measured on 29 Oct 2026 on every game page: one
 * `[CSPV] script-src blocked=eval` per load, from the chunk holding this package, which
 * the game page reaches through `lib/games/model.ts`. A violation that happens on every
 * page is one nobody reads, and that is how a real one goes unread beside it.
 *
 * jitless skips the probe and parses by walking the shape, which is the path the browser
 * was already on. Set here, before any schema exists, because Zod reads it once per
 * schema at construction: every file in this package imports `z` from this module rather
 * than from "zod", and ESM evaluates this file before the first `z.object` runs.
 * tests/zod-jitless.test.ts fails if a file goes back to importing "zod" directly.
 */
z.config({ jitless: true });

export { z };

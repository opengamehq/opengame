/**
 * The platform's limits, checks and enums.
 *
 * The values live in `limits.json` rather than here, and this module only types
 * them. That is deliberate and worth not undoing: the same numbers are read by
 * the Python validation pipeline, and any arrangement where TypeScript is the
 * source and JSON is generated from it produces a copy that can drift from its
 * original -- usually silently, and usually discovered when a game is rejected
 * for exceeding a limit the wizard told the creator was fine.
 *
 * One file, two languages, no drift.
 *
 * THIS MODULE IS THE SERVER'S. It holds every value, and a browser on opengame.io gets
 * limits-browser.ts instead, which reads limits.browser.json, the paths
 * limits.browser-paths.json allows. Every helper lives there and is re-exported here, so
 * there is one of each; what this file adds is LIMITS and the section constants with all of
 * limits.values.json behind them. The site's Turbopack config refuses this file in a client
 * bundle, so a client component that reaches it fails the build rather than publishing the
 * budgets, rate limits and review policy (integrator review of #904, 5 Nov 2026).
 *
 * TypeScript reads `limits.values.json` rather than limits.json itself, and so does
 * `@opengame/shared/limits.json`, which package.json points there. It is limits.json with
 * the `_` notes taken out by `scripts/limits-values.mjs` and no other difference: written,
 * never edited, and checked fresh by a test and by the web and admin prebuild. The notes
 * are for the person editing a limit, and a JSON import cannot be tree-shaken, so while
 * this read limits.json every browser bundle that reached LIMITS shipped all 494 of them.
 * Edit limits.json, then run `node packages/shared/scripts/limits-values.mjs`.
 *
 * Imported without `with { type: "json" }`, here and in every file beside this one, because
 * the web app's ~40 estate modules import `@opengame/shared/limits.json` plainly, and
 * Turbopack keeps an attributed JSON import and a plain one as two modules. Mixed, the
 * browser downloaded and parsed the whole file twice on every page that reaches both: two
 * chunks of 402 KB each, 144 KB each gzipped, on the estate before its engine started.
 */

import raw from "../limits.values.json";
import type { CheckDefinition, TextLimit, TextLimitKey, Viewport } from "./limits-browser";

export * from "./limits-browser";

/* Each of these shadows the browser module's export of the same name, which is how an
   ES module's own export wins over one it re-exports with `*`. */
export const LIMITS = raw;

export const BUNDLE = raw.bundle;
export const PERFORMANCE = raw.performance;
export const VIEWPORTS = raw.viewports as Viewport[];
export const CHECKS = raw.checks as CheckDefinition[];
export const AUTH = raw.auth;
export const EMAIL = raw.email;
export const PLAY = raw.play;
export const HANDLE = raw.handle;
export const SHARING = raw.sharing;
export const RETENTION = raw.retention;
export const JAM = raw.jam;
export const HOSTING = raw.hosting;
/** How long to wait for Modal to accept a job. Read by both places that spawn one. */
export const PIPELINE = raw.pipeline;
/** The studio's run, session and global caps. See docs/studio-plan-2026-09-12.md section 10. */
export const STUDIO = raw.studio;
export const ESTATE = raw.estate;
export const SOCIAL = raw.social;
export const PHOTO_OG = raw.photoOg;

/** Every cap on prose a person types, with the constraint each one mirrors. */
export const TEXT = Object.fromEntries(
  Object.entries(raw.text).filter(([key]) => !key.startsWith("_")),
) as unknown as Record<TextLimitKey, TextLimit>;

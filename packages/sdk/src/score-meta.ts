// Generated from packages/shared/limits.json (play.scoreMeta) by scripts/docs-gen.mjs.
// Change the policy there and run npm run docs:gen; npm run check:docs fails while this is stale.

/**
 * What a score may carry beside its value. These keys and types are the policy the API and
 * the SDK check every submission against: another key, or a value of another type, fails
 * with `invalid_meta` before anything is sent.
 */
export type ScoreMeta = {
  label?: string;
  mode?: string;
  level?: string;
  character?: string;
  duration_ms?: number;
  accuracy?: number;
  combo?: number;
};

/** The same policy in words, for the `invalid_meta` hint. */
export const scoreMetaRule = "label, mode, level and character as strings, and duration_ms, accuracy and combo as numbers";

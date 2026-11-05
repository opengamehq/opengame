/*
 * Every error code the SDK can hand a game, in one table.
 *
 * `scripts/error-docs.mjs` writes the README's and AGENTS.md's catalogue from these
 * rows, so the sentence a coding agent reads in the docs is the sentence it finds on
 * the result. Core, leaderboard and achievement calls return `{ ok: false, error }`
 * with these codes instead of throwing.
 *
 * A hint names what to do, not what went wrong inside the SDK. Codes passed through from
 * the page or the broker are listed too, because a game sees them as they are.
 */
import { scoreMetaRule } from './score-meta.js';

/** Error code, delivery type, retry advice and recovery text. */
export type ErrorEntry = Readonly<{ code: string; where: 'result' | 'both'; retryable: boolean; hint: string }>;

export const errorCatalogue: readonly ErrorEntry[] = Object.freeze([
  // Core, events and leaderboards. Returned, never thrown.
  { code: 'unavailable', where: 'both', retryable: false, hint: 'The page did not offer this capability. Check og.capabilities first; the local mock simulates account, leaderboard and analytics features.' },
  { code: 'invalid_event', where: 'result', retryable: false, hint: 'Event names are lowercase letters, digits and underscores, starting with a letter, at most 48 characters, and 1 KB with properties.' },
  { code: 'rate_limited', where: 'both', retryable: true, hint: 'Too many calls in the window. Events allow 60 a minute. Wait, then try again.' },
  { code: 'invalid_board', where: 'result', retryable: false, hint: 'Use a board key declared in opengame.json: lowercase letters, digits, hyphens and underscores.' },
  { code: 'board_unavailable', where: 'result', retryable: false, hint: 'This board is not declared in opengame.json, or the published game has no such board.' },
  { code: 'invalid_score', where: 'result', retryable: false, hint: 'Scores are finite numbers.' },
  { code: 'invalid_meta', where: 'result', retryable: false, hint: `Score metadata takes only ${scoreMetaRule}. Keep strings short.` },
  { code: 'invalid_limit', where: 'result', retryable: false, hint: 'A read limit is a positive integer. Values above the maximum are capped.' },
  { code: 'invalid_manifest', where: 'result', retryable: false, hint: 'opengame.json has an invalid leaderboards list. Each board needs a unique key and an order of asc or desc.' },
  { code: 'gesture_required', where: 'result', retryable: true, hint: 'Call og.openLink directly from a click or key handler, then confirm the destination on the OpenGame page.' },
  { code: 'invalid_request', where: 'result', retryable: false, hint: 'The API could not read the request. Check the arguments against the README.' },
  { code: 'invalid_achievement', where: 'result', retryable: false, hint: 'Use a declared achievement ID with lowercase letters, digits, hyphens or underscores within the shared length limit.' },
  { code: 'achievement_unavailable', where: 'result', retryable: true, hint: 'The achievement service refused the request. Check the published game and retry when it is available.' },
  // Both are returned by og.achievements. They went out of this table with the room codes
  // on 3 Nov 2026 while achievements.ts kept returning them, so the README stopped naming
  // two codes a game can get, and the plugins that take their hint from this table had none
  // to give. tests/error-codes.test.mjs reads every code the source can
  // return and fails on one missing here.
  { code: 'unavailable_in_preview', where: 'result', retryable: false, hint: 'Achievements work in a published game only. A preview answers this every time; unlock and list them after publishing.' },
  { code: 'network', where: 'result', retryable: true, hint: 'The request failed before any service answered. Check the connection, then try again.' },
  { code: 'cancelled', where: 'result', retryable: true, hint: 'The AbortSignal passed to the call was aborted.' },
  { code: 'timeout', where: 'result', retryable: true, hint: 'The page did not answer in time. Try again.' },
  { code: 'session_changed', where: 'both', retryable: true, hint: 'The player signed in, out or switched account. Read the player again.' },
  { code: 'disposed', where: 'both', retryable: false, hint: 'og.dispose() was called on this client.' },
  { code: 'invalid_response', where: 'both', retryable: true, hint: 'A service answered with something the SDK does not accept. Try again, and report it if it repeats.' },
  { code: 'busy', where: 'result', retryable: true, hint: 'Too many requests are waiting on the page. Let one finish first.' },
]);

const byCode = new Map(errorCatalogue.map(entry => [entry.code, entry]));
const unknown = { retryable: false, hint: 'Not in the SDK error catalogue. See packages/sdk/README.md.' };
/** Whether a code is one the SDK names. The bridge answers a native game only with these;
 * comparing a returned hint against the fallback sentence broke the day the sentence gained
 * a full stop, and every unknown code went through as if it were a catalogued one. */
export function isCatalogued(code: string): boolean {
  return byCode.has(code);
}
export function describeError(code: string): { retryable: boolean; hint: string } {
  return byCode.get(code) ?? unknown;
}

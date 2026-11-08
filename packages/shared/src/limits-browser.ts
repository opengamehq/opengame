/**
 * The platform's limits as a browser on opengame.io gets them, and every helper that reads them.
 *
 * `raw` here is limits.browser.json: limits.json kept to the paths
 * limits.browser-paths.json lists, written by scripts/limits-values.mjs. Every number in it
 * is limits.json's own, at the same path, so nothing here can disagree with the Python
 * pipeline or the server; it only holds fewer of them. limits.ts, the server's module,
 * re-exports everything below and replaces LIMITS and the section constants with the
 * whole of limits.values.json.
 *
 * WHY TWO. A JSON import cannot be tree-shaken, so until 5 Nov 2026 every client page that
 * reached LIMITS shipped every budget, rate limit, abuse threshold, the review policy and the
 * scanner's capacity (integrator review of #904). Client code imports
 * `@opengame/shared/browser`, which re-exports this file in place of limits.ts, and the web
 * app's Turbopack config refuses limits.ts and limits.values.json in a browser bundle. The
 * types come from the projection, so reading a limit the list leaves out is a type error in
 * the browser rather than an undefined.
 *
 * The helpers live here rather than in limits.ts so there is one of each. They read only
 * what the projection keeps, which is why `TextLimit` below has no constraint name.
 */

import raw from "../limits.browser.json";
import { slurTextProblem } from "./text-policy";

export type CheckKind = "auto" | "manual";

export interface CheckDefinition {
  key: string;
  kind: CheckKind;
  /** Blocking checks fail a submission outright; the rest warn and route to a human. */
  blocking: boolean;
  label: string;
  hint: string;
}

export interface Viewport {
  label: string;
  width: number;
  height: number;
  primary?: boolean;
}

export const LIMITS = raw;

export const BUNDLE = raw.bundle;
export const VIEWPORTS = raw.viewports as Viewport[];
export const CHECKS = raw.checks as CheckDefinition[];
export const PLAY = raw.play;
export const HANDLE = raw.handle;
export const JAM = raw.jam;
/** The studio's run, session and global caps. See docs/studio-plan-2026-09-12.md section 10. */
export const STUDIO = raw.studio;

/**
 * The ledger operations the platform pays for rather than the creator. The Worker's ledger
 * leaves them out of the cap and the usage it reports, and the site leaves them out of
 * the receipt it reads from studio_spend; both read this list, so the two cannot disagree
 * about what a creator is charged.
 *
 * Who pays is written into each line by its operation, not decided when it is read, so
 * changing `studio.promptHelp.platformAbsorbed` changes the lines written from then on and
 * never re-bills the ones already written: a New game wizard call is recorded as
 * `onboarding` while the platform pays and `prompt-help` once the creator does. The key
 * keeps the `onboarding:` prefix either way, since it is the call's identity.
 */
/* `name-check` is the check a creator's typed game name gets before it is used
   (studio.nameCheck in limits.json). It is a safety check the platform runs on its own
   account, so it is written down like the wizard's calls and never counted as theirs. */
export const NAME_CHECK_OPERATION = "name-check";
/* `store-copy` writes the genre, tagline and description the submit sheet opens with
   (studio.storeCopy in limits.json). The platform runs it to fill in its own form, and the
   creator never asked for it, so it is written down the same way and never counted as theirs. */
export const STORE_COPY_OPERATION = "store-copy";
export const PLATFORM_ABSORBED_OPERATIONS: readonly string[] = ["onboarding", NAME_CHECK_OPERATION, STORE_COPY_OPERATION];

/**
 * A game name as Studio stores it and checks it: compatibility forms folded (NFKC, so a
 * name in mathematical letters is checked as the plain letters it displays as), and runs
 * of spaces made one. The check and the builder see exactly this string, never a spelling
 * that differs from what was judged.
 */
export function normalGameName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * Characters a game name may not hold, whatever its length: controls, format characters
 * (bidirectional overrides, zero-width joiners and spaces, the tag block that can carry
 * text nobody sees), private-use and unassigned code points, and lone surrogates. Each of
 * them lets a name read one way on screen and another to a model, which is the one thing a
 * name checked by a model must not do. Found in review, 28 Sep 2026.
 */
export function gameNameCharacterProblem(value: string): string | null {
  return /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/u.test(value) ? "The game name can only use letters, numbers, spaces and punctuation." : null;
}
export const PROMPT_HELP_KEY_PREFIX = "onboarding";
export const PROMPT_HELP_OPERATION = raw.studio.promptHelp.platformAbsorbed ? "onboarding" : "prompt-help";

/**
 * How many bytes of creator references one concept request may carry. Each sibling draft
 * sends the creator's images AND its direction's anchor to one GPT Image edit, and fal's
 * reference budget has to hold both, so the anchor's worst case comes off the top. The
 * intake sends the same images to Gemini, whose 20 MB inline limit this sits well inside.
 */
export const CONCEPT_REFERENCE_BYTES_MAX = raw.studio.tools.image.referenceBytesMax - raw.studio.tools.concept.anchorBytesMax;

/**
 * What the browser re-encodes a reference down to. The concept budget shared evenly across
 * the most references a concept request takes, so a full message of them fits by size as
 * well as by count. Larger uploads from before this existed are still accepted up to
 * `attachments.bytesMax`; the concept step skips what does not fit and says which.
 */
export const REFERENCE_PREPARED_BYTES_MAX = Math.floor(CONCEPT_REFERENCE_BYTES_MAX / raw.studio.tools.concept.referenceImagesMax);

/** Checks that fail a submission rather than merely flagging it. */
export const BLOCKING_CHECKS = CHECKS.filter((c) => c.blocking);

/**
 * Every origin a published game may reach, in the order `limits.json` lists them.
 *
 * Enumerated rather than destructured by name, which is not a style preference: the
 * broker needs two entries -- `wss:` for the signalling socket and `https:` for the
 * peer-id and TURN fetches PeerJS makes before it -- and a destructuring caller
 * quietly omits whichever key it was not written to know about. That omission is a
 * CSP refusal inside a sandboxed frame, which is the least legible failure the
 * platform has. Anything whose key begins with `_` is prose for a reader.
 */
export function gameConnectOrigins(): string[] {
  return Object.entries(raw.allowedGameOrigins)
    .filter(([key, value]) => !key.startsWith("_") && typeof value === "string")
    .map(([, value]) => value as string);
}

/** The rule as a browser enforces it. Built from one place so the header the edge
 *  sends, the sandbox run, and the copy shown to creators cannot disagree. */
export function gameConnectSrc(): string {
  return ["'self'", ...gameConnectOrigins()].join(" ");
}

/**
 * Third-party hosts a game may load stylesheets and fonts from.
 *
 * Passive assets only, and the split is the point: `allowedGameOrigins` is `connect-src`,
 * which governs what a game SENDS and RECEIVES, while this is what it may DISPLAY. A
 * stylesheet and a font cannot exfiltrate anything; a script could, which is why there is
 * no script CDN here and the contract still says to vendor those.
 */
export function trustedAssetOrigins(kind: "style" | "font"): string[] {
  const raw_ = raw as unknown as {
    trustedGameAssetOrigins?: Record<string, unknown>;
  };
  const list = raw_.trustedGameAssetOrigins?.[kind];
  return Array.isArray(list) ? (list as string[]) : [];
}

/** Every trusted asset host, whatever directive it belongs to. What the preflight asks. */
export function trustedAssetHosts(): string[] {
  return [...trustedAssetOrigins("style"), ...trustedAssetOrigins("font")].map((u) =>
    u.replace(/^\w+:\/\//, "").replace(/\/.*$/, "").toLowerCase(),
  );
}

/* -------------------------------------------------------------------------- */
/* Credential shapes                                                           */
/* -------------------------------------------------------------------------- */

export interface CredentialPattern {
  /** What a finding says. The matched value is never reported, on either side. */
  label: string;
  /** Source text, in the subset both regex engines read alike. */
  pattern: string;
  /** `"i"` or `""`. A field rather than an inline `(?i)`, which only Python takes. */
  flags: string;
}

/**
 * The credential shapes to look for inside a bundle's files.
 *
 * `content` refuses; `suspicious` warns. Both groups are read here and by
 * `apps/pipeline/opengame_pipeline/limits.py`, which is the whole point of them
 * living in JSON: the browser preflight tells a creator about a key at the drop
 * zone in the same words, from the same list, that the pipeline would use minutes
 * later. Hand-copying thirteen regexes into TypeScript would have made the weaker
 * copy the one on the surface nobody re-reads.
 */
export function credentialPatterns(group: "content" | "suspicious"): CredentialPattern[] {
  const raw_ = raw as unknown as { credentialPatterns?: Record<string, unknown> };
  const list = raw_.credentialPatterns?.[group];
  /* Throws rather than returning an empty list, and the difference is the whole
     behaviour of the check. An empty list is a scanner that finds nothing, which
     looks exactly like a bundle with nothing in it: the wizard would print "This
     build is ready to upload" over a key, which is the defect this seam was built
     to end, arriving a second time through a missing JSON key. The Python side
     raises for the same reason. */
  if (!Array.isArray(list)) {
    throw new Error(
      `limits.json has no credentialPatterns.${group}; the credential scan cannot run`,
    );
  }
  return list as CredentialPattern[];
}

/**
 * The same list, compiled.
 *
 * Compiled once per call rather than per file, and deliberately without the `g`
 * flag: a global regex carries `lastIndex` between calls, so a reused one skips
 * the front of every file after the first match and reports a key in one bundle
 * and not the next. Callers here only ever ask whether and where, never how many.
 */
export function compiledCredentialPatterns(
  group: "content" | "suspicious",
): { label: string; re: RegExp }[] {
  return credentialPatterns(group).map(({ label, pattern, flags }) => ({
    label,
    re: new RegExp(pattern, flags),
  }));
}

/**
 * A small count as a word, for the sentences a limit appears in.
 *
 * `jam.entriesPerCreator` is read by a refusal, by the rules page, by the jam
 * page, by an FAQ answer and by a certification a creator signs, and every one of
 * those is prose: "You may enter 3 games" is a log line with a full stop on it.
 * Without this each of them spells the number itself, which is the copy going
 * stale in five places the day it changes -- and that is the exact failure this
 * key exists to end, so a helper here costs less than the discipline it replaces.
 *
 * The table only reaches as far as the counts anything here can produce. Past it
 * the digits come back, which is the right answer for a number nobody expected to
 * say out loud.
 *
 * IT STOPPED AT SIX UNTIL 1 SEP 2026, because six was the largest a limit could
 * be. What moved the boundary is /jam: three of its section headings count the
 * arrays they are about rather than asserting a number in prose, and one of those
 * arrays is the eight requirements. `spellCount(8)` returning "8" put "8 rules.
 * None of them negotiable." at the top of a section between "Five ways to win"
 * and "Four dates", which is the house voice breaking in the middle of one page.
 *
 * Twelve rather than eight, so the next list to earn a heading does not move it
 * again. Past twelve the digits still come back and the fallback is still what
 * the test below pins: a sentence with a numeral in it reads, `undefined` does
 * not.
 */
const COUNT_WORDS = [
  "no", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

export function spellCount(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/**
 * The same word with the thing it counts, agreeing in number.
 *
 * `spellCount` alone is a trap in a sentence that names what is being counted:
 * `more than ${spellCount(n)} games` reads "more than one games" the moment
 * somebody sets `entriesPerCreator` to 1, and one of the places that sentence
 * appears is a legal attestation stamped into an append-only table. The
 * pluralisation belongs with the number rather than at each of ten call sites,
 * where nine of them would be written against whatever the value happened to be
 * that day.
 */
export function spellItems(n: number, singular: string, plural: string): string {
  return `${spellCount(n)} ${n === 1 ? singular : plural}`;
}

/**
 * The same word, opening a sentence.
 *
 * `spellCount` is lower case because almost every caller drops it mid-sentence,
 * and the two that do not are both on /jam: the hero's "One month to build", and
 * three section headings that count the arrays they are about. Both had grown
 * their own capitalised speller — `lib/jam/placeholders.ts` carried a second
 * `["Zero", "One", "Two", ...]` table, which is a number-to-word map that could
 * disagree with this one and did at zero, where it said "Zero" and this says
 * "no".
 *
 * Sentence case is the house rule, so this capitalises the first letter and
 * nothing else. Past the table it capitalises a digit, which is a no-op, which
 * is the right answer.
 */
export function spellCapitalised(n: number): string {
  const word = spellCount(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

export interface TextLimit {
  /** The check constraint this mirrors. `supabase/tests/schema.test.mjs` joins on it. */
  constraint: string;
  /**
   * Other constraints enforcing this same number, when one cap is spelled on more than
   * one column. `game_versions.title` holds what a creator PROPOSES a game be called
   * while a reviewer reads it, and `games.title` holds what is live, so the cap has two
   * enforcers and must never have two numbers.
   *
   * Here rather than as a second `text` entry because a second entry is a second number,
   * which is the thing this file exists to prevent. The schema test compares every name
   * in `[constraint, ...alsoOn]` against the catalogue and counts them all as accounted
   * for, so its reverse check still needs no allowlist.
   */
  alsoOn?: string[];
  /** What the column enforces. Moving it means writing a migration. */
  min?: number;
  /**
   * A floor the product asks for and the database has no opinion about. Always at
   * least `min`, and the reason the two are separate is that the schema test compares
   * `min` against real SQL: merging them would make that comparison a lie.
   */
  productMin?: number;
  max: number;
  /**
   * The column ceiling when the product max is tighter. The schema test compares
   * this with the check constraint. `max` is what a person is asked to stay within.
   */
  columnMax?: number;
}

/**
 * The names a caller may ask for.
 *
 * Keys beginning `_` are prose for a reader, the same convention the rest of this file
 * uses, so they are excluded here rather than left as callable names that resolve to a
 * paragraph. A typo then fails at the type rather than at whatever `undefined.max`
 * happens to do, which for a comparison is silently nothing.
 */
export type TextLimitKey = Exclude<keyof typeof raw.text & string, `_${string}`>;

/**
 * A text cap as the browser has it: the numbers a person is held to, without the constraint
 * names (limits.browser-paths.json keeps `text.*.min`, `max` and `productMin` only). The
 * server's TEXT in limits.ts has the whole TextLimit for the schema test.
 */
export type BrowserTextLimit = Pick<TextLimit, "min" | "max" | "productMin">;

/** Every cap on prose a person types, keyed by the field rather than the column. */
export const TEXT = Object.fromEntries(
  Object.entries(raw.text).filter(([key]) => !key.startsWith("_")),
) as unknown as Record<TextLimitKey, BrowserTextLimit>;

export function textLimit(key: TextLimitKey): BrowserTextLimit {
  const limit = TEXT[key];
  if (!limit) {
    throw new Error(
      `no text limit named ${String(key)} in limits.json (have: ${Object.keys(TEXT).join(", ")})`,
    );
  }
  return limit;
}

/**
 * Characters the way the database counts them.
 *
 * Postgres `char_length` on a UTF-8 database counts code points. JavaScript's
 * `.length` counts UTF-16 code units, and the two agree on everything in the Basic
 * Multilingual Plane -- which is all of Latin, all of Cyrillic, and all of the CJK
 * a Japanese or Chinese title is actually made of -- and then disagree by a factor
 * of two on emoji, on the rarer kanji in plane 2, and on anything else astral.
 *
 * The direction of that disagreement is what makes it a real defect rather than a
 * pedantic one: `.length` is always the larger number, so a route measuring with it
 * refuses titles the column would have accepted. It is a limit that is quietly
 * stricter for some alphabets than others, and it fails on somebody's submission
 * rather than in anybody's review.
 *
 * Iterating a string yields code points, so the spread is the whole implementation.
 * It is not grapheme clusters, and deliberately not: a family emoji is one thing on
 * screen and several code points, and matching Postgres matters more than matching
 * the eye, because Postgres is what refuses the row.
 */
export function countCharacters(value: string): number {
  return [...value].length;
}

/**
 * The first `max` characters, counted the way `countCharacters` counts them.
 *
 * `.slice(0, max)` is the obvious version and it is wrong in the one place shortening
 * is ever correct here. It indexes UTF-16 code units, so a cut landing between the two
 * halves of an emoji keeps a lone surrogate: not a character, rendered as a replacement
 * box, and in the case this was written for, printed on a public takedown page by us
 * rather than by the person who typed it.
 *
 * Deliberately not what anything in `text` does. Every cap in that block REFUSES, for
 * the reason `textCounter` gives below: a silent cut is discovered by reading your own
 * words back later, and by then the thing has been sent. This is for the narrow case
 * where the full text is already kept somewhere else and only a display copy is being
 * shortened -- today that is the tombstone paragraph, and `hosting.tombstoneReasonMax`
 * argues its own case in limits.json.
 */
export function clampCharacters(value: string, max: number): string {
  const points = [...value];
  return points.length <= max ? value : points.slice(0, max).join("");
}

/**
 * What is wrong with this text, as a sentence, or null when it fits.
 *
 * The point of returning prose rather than a boolean is that every caller would
 * otherwise write the sentence itself, and the constraint violation these replace
 * is the house's worst error message: it names a table, not a field, and it arrives
 * after the upload. So this names what they gave and what the limit is, which is the
 * two facts somebody needs to fix it in one edit rather than by bisection.
 *
 * `label` is what the person calls the box they typed in, sentence case and no
 * article: "title", "description", "review note".
 */
export function textProblem(
  key: TextLimitKey,
  label: string,
  value: string,
): string | null {
  const problem = lengthProblem(textLimit(key), label, value);
  if (problem) return problem;
  // The older jam form also validates these fields here. Sharing this check
  // keeps its API and editor from accepting words refused by manifest parsing.
  if (key === "gameTitle" || key === "gameDescription" || key === "gameTagline") return slurTextProblem(value);
  return null;
}

/**
 * `textProblem` for a cap that is not in `text`: prose with no column behind it, such as
 * a note that is only ever forwarded (`feedback` in limits.json). Every `text` entry has
 * to name the constraint the schema test checks it against, so a cap with no table cannot
 * live there, and its sentences should still be the same ones.
 */
export function lengthProblem(
  limit: Pick<TextLimit, "max" | "min" | "productMin">,
  label: string,
  value: string,
): string | null {
  const length = countCharacters(value.trim());
  const floor = limit.productMin ?? limit.min;

  if (floor !== undefined && length < floor) {
    return length === 0
      ? `The ${label} is empty.`
      : `The ${label} is ${format(length)} characters, and it needs at least ${format(floor)}.`;
  }
  if (length > limit.max) {
    return `The ${label} is ${format(length)} characters, and the limit is ${format(limit.max)}.`;
  }
  return null;
}

export interface TextCounter {
  /** For `Field`'s `meta` slot. Null while the count is not worth saying. */
  meta: string | null;
  /** For `Field`'s `error` slot. Null while it fits. */
  error: string | null;
  /** Whether the value is past the cap, for a Continue button that should not be pressable. */
  over: boolean;
}

/**
 * A live character count that stays quiet until it matters.
 *
 * Data rather than a component, because `@opengame/ui` does not depend on this
 * package and giving it one to hold a counter would be the wrong direction for that
 * dependency. `Field` already has a `meta` slot and renders it in tabular numerals,
 * so the rendering is the design system's and only the RULE lives here -- which is
 * the part that was previously written out by hand at every call site, differently.
 *
 * The rule, in four states:
 *
 * - An EMPTY field says nothing, whatever its floor. The first draft of this counted up
 *   from zero, so the wizard's title field rendered "0 / 2" from first paint -- exactly
 *   the decoration the paragraph below argues against, on the field it uses as its own
 *   example, and every entry with `min: 1` would have shown the useless "0 / 1". A count
 *   is feedback on what somebody has written; before they write anything there is nothing
 *   to give feedback on.
 * - Under a floor the product asks for, count UP to it. "12 / 40" is the useful shape when
 *   somebody has started and has not written enough yet, because the target is the number
 *   they are aiming at.
 * - Near the cap, or past it, count DOWN. "8 left" is what somebody trimming a title
 *   needs; the total is not interesting any more.
 * - Anywhere in the middle, say nothing. A permanent "17 / 40" beside a field nobody is
 *   anywhere near the end of is decoration, and it teaches people to stop reading the one
 *   place the number is load-bearing.
 *
 * "Near" is `max / 5`, CAPPED AT 200 CHARACTERS. The fifth alone scales with the field and
 * that is wrong at the top end: at 5000 it would put the description's first warning at
 * 4000, and the review note's at 3200, which is a counter that has never appeared for any
 * note anybody has actually written. Two hundred characters is enough warning to act on
 * whatever the field is, and it makes the long fields useful rather than theoretical.
 *
 * Past the cap the counter goes to "12 over" rather than freezing at zero, and the field
 * says it is over. That is the whole reason not to put `maxLength` on prose: a hard
 * attribute silently eats the end of a paste, and the person finds out by reading their own
 * game page later.
 *
 * The sentence past the cap names the limit and not the length. It used to be the server's
 * own refusal, "The note is 2,003 characters, and the limit is 2,000.", and `Field` reads its
 * error aloud whenever the words change, so somebody trimming a long note heard a new
 * sentence on every key press. The count is the meta's job, and the meta is never announced.
 */
/** The longest run-up the counter ever takes. See the doc block above. */
const COUNTER_TAIL = 200;

export function textCounter(key: TextLimitKey, label: string, value: string): TextCounter {
  return lengthCounter(textLimit(key), label, value);
}

/** `textCounter` for a cap outside `text`, for the reason `lengthProblem` gives. */
export function lengthCounter(
  limit: Pick<TextLimit, "max" | "min" | "productMin">,
  label: string,
  value: string,
): TextCounter {
  const length = countCharacters(value.trim());
  const floor = limit.productMin ?? limit.min;
  const left = limit.max - length;

  /* Nothing at all on an untouched field. See the fourth state in the doc block: this
     used to render "0 / 2" beside an empty title, which is the decoration the same
     paragraph argues against. */
  if (length === 0) return { meta: null, error: null, over: false };

  /* No error under the floor, deliberately. Somebody four characters into a
     description has not made a mistake, and a field that turns red while you are
     still typing in it is a field that has stopped meaning anything by the time you
     finish. Being short is the step gate's job to say, once, beside the button. */
  if (floor !== undefined && length < floor) {
    return { meta: `${format(length)} / ${format(floor)}`, error: null, over: false };
  }
  if (left < 0) {
    return { meta: `${format(-left)} over`, error: `The ${label} is over the ${format(limit.max)}-character limit.`, over: true };
  }
  if (left <= Math.min(Math.ceil(limit.max / 5), COUNTER_TAIL)) {
    return { meta: `${format(left)} left`, error: null, over: false };
  }
  return { meta: null, error: null, over: false };
}

/** Grouped, because "5000" in a sentence about a limit reads as a part number. */
function format(n: number): string {
  return n.toLocaleString("en-GB");
}

const HANDLE_RE = new RegExp(raw.handle.pattern);

export function isValidHandle(value: string): boolean {
  return HANDLE_RE.test(value);
}

/** Bytes to something a person can read, for wizard feedback and reviewer tables. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

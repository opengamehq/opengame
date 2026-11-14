/**
 * Auto, and the tidy a creator's own words get.
 *
 * The owner, 13 Nov 2026: "leaving blank = model generates ... and even if someone puts in a title
 * and description we should proper case it, clean up casing and grammar in description etc
 * with model". So every field the CLI and Drop collect for a game takes Auto, which is review
 * writing it from the game (`isAutoValue`), and words the creator did type are offered back
 * tidied, with their own kept (`tidyTitle`, `tidyDescription`).
 *
 * The model's tidy is the one the deploy page offers (opengame_pipeline/detected_details.py,
 * `tidyTitle` and the rest). This file is the floor under it: what the CLI prints in its
 * summary before review has run, and what the page offers when review gave none. It only
 * moves spaces, casing and repeated punctuation, so it cannot change what a sentence says.
 * `tidyKeepsMeaning` is the check every tidy, the model's included, has to pass before a
 * creator is shown it: the same letters in the same order, give or take a few.
 */

/** The value that means "review writes this". Blank means the same, so a person pressing
 *  Enter at a prompt and an agent leaving a field out get one answer. */
export const AUTO = "auto";

/** True for Auto: absent, null, blank, or the word `auto` in any case. */
export function isAutoValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text === "" || text.toLowerCase() === AUTO;
}

// The words a title keeps in lower case unless they open or close it (AP and Chicago agree on these).
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "up", "vs", "via"]);
const LETTERS = /\p{L}/u;
const letters = (word: string) => [...word].filter(char => LETTERS.test(char));
const isLower = (word: string) => letters(word).length > 0 && letters(word).every(char => char === char.toLowerCase() && char !== char.toUpperCase());
const isCapitals = (word: string) => letters(word).length > 0 && letters(word).every(char => char === char.toUpperCase() && char !== char.toLowerCase());
// "i.e.", "e.g.", "etc." and the like end in a full stop that ends no sentence.
const ABBREVIATION = /(?:^|\s)(?:\p{L}\.){1,3}$|(?:^|\s)(?:etc|vs|mr|mrs|ms|dr|st|no|vol|approx)\.$/iu;

/**
 * Spacing only: runs of whitespace are one space, there is no space before a comma or a full
 * stop, and "!!" or "?!" is one mark. Nothing is ever inserted, so a URL, "std::vector", "3.5"
 * or "Re:Zero" comes through as typed (code review of #1575: inserting a space after marks
 * broke all four).
 */
function spaced(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])(?=\s|$)/g, "$1")
    .replace(/([!?])[!?]+/g, "$1")
    .replace(/,{2,}/g, ",")
    .trim();
}

/**
 * The one mark a tidy puts a space after: a comma between two words of two letters or more,
 * as in "catch stars,dodge the comets" (final production pass, D2, 14 Nov 2026). Only in
 * prose, never in a word holding a slash, an equals sign, an @ or a colon, so a link's query
 * ("?tags=a,b"), an address and "Re:Zero" keep what was typed, and never beside a digit, so
 * "1,000" and "x2,y3" do too. Every other mark stays as `spaced` leaves it, for the reasons
 * given there.
 */
function commaSpaced(value: string): string {
  return value.split(" ").map(word => /[/=@:]/.test(word) ? word
    : word.replace(/(\p{L}{2}),(?=\p{L}{2})/gu, "$1, ")).join(" ");
}

/**
 * A title in title case with tidy spacing: "my COOL game!!" reads "My Cool Game!".
 *
 * Capitals are left alone unless the title is plainly typed in a hurry, which is when some
 * word in it is all lower case: then a capitalised word of four letters or more is shouting
 * ("COOL"). A title with no lower-case word is the creator's styling (SUPERHOT, FPS ARENA,
 * LÖVE Jam) and keeps its capitals; a word with its own inner casing (iPhone, PixiJS) is kept
 * everywhere, and so is a short acronym (FPS, HOA).
 */
export function tidyTitle(value: string): string {
  const words = spaced(value).split(" ").filter(Boolean);
  const hurried = words.some(isLower);
  return words.map((word, index) => {
    const shape = letters(word);
    if (!shape.length) return word;
    const shouting = hurried && isCapitals(word) && shape.length >= 4;
    // Its own casing (iPhone, PixiJS, LÖVE), or an acronym: kept as typed.
    if (!shouting && shape.slice(1).some(char => char !== char.toLowerCase())) return word;
    const base = shouting ? word.toLowerCase() : word;
    const inner = index > 0 && index < words.length - 1;
    if (inner && SMALL_WORDS.has(base.toLowerCase().replace(/[^\p{L}]/gu, "")) && !/[:.!?]$/.test(words[index - 1]!)) return base.toLowerCase();
    return base.replace(/\p{L}/u, char => char.toUpperCase());
  }).join(" ");
}

/**
 * A description or tagline with tidy spacing and casing: each sentence opens with a capital
 * (not after "i.e."), a lone "i" is "I", repeated marks are one, and a description ends with a
 * mark (`finalMark`; a tagline is often a phrase and keeps its own ending). Capitals are never
 * lowered, since NASA and LÖVE look like shouting. A comma run into the next word gets its
 * space (`commaSpaced`). Grammar beyond this (its or it's, a misspelled word) is the model's,
 * never guessed here.
 */
export function tidyDescription(value: string, options: { finalMark?: boolean } = {}): string {
  let text = commaSpaced(spaced(value));
  if (!text) return text;
  text = text.replace(/(^|[\s(])i(?=['’](?:m|ll|ve|d)\b|\s|$|[,;:!?]|\.(?:\s|$))/g, "$1I");
  text = text.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (whole: string, before: string, letter: string, at: number) =>
    before && ABBREVIATION.test(text.slice(0, at) + before.trimEnd()) ? whole : before + letter.toUpperCase());
  if ((options.finalMark ?? true) && !/[.!?…)"”’]$/.test(text)) text += ".";
  return text;
}

/** The letters and digits of a text, lower case and with shorthand read as the word it
 *  stands for (`SHORTHAND`), which is all a tidy may not change. */
function skeleton(value: string): string {
  return wordsOf(value).join("");
}

/** Edit distance within a band, or `limit + 1` once it is past it. O(n * limit). */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(limit + 1);
    current[0] = i;
    let best = i;
    for (let j = Math.max(1, i - limit); j <= Math.min(b.length, i + limit); j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, current[j]!);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return Math.min(previous[b.length]!, limit + 1);
}

// The words a grammar fix may add: "game where u jump" is "a game where you jump".
const GLUE = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "is", "it", "its", "you", "your", "are", "be", "with", "for"]);
/* Chat shorthand and the word it stands for, read as one word on both sides of the check, so
   "ur" may come back "you're" and "b4" "before" (final production pass, D2, 14 Nov 2026: the
   model's tidy wrote these out, and the check refused the whole tidy as a new word, so the
   page fell back to one that fixes casing alone). "your" and "youre" are one word here,
   because "ur" is either and a tidy that picks the right one is fixing grammar. Apostrophes
   are already dropped (`wordsOf`), so "its" and "dont" need nothing. No single letter is here:
   "u", "r" and "w" are also keys ("press W to jump"), and reading them as words would let a
   tidy turn a control into "press with to jump". "u" to "you" and "w/" to "with" still pass,
   as joining words (GLUE). */
const SHORTHAND: Readonly<Record<string, string>> = {
  ur: "your", youre: "your", pls: "please", plz: "please", thx: "thanks", ty: "thanks",
  b4: "before", bc: "because", cuz: "because", coz: "because", ppl: "people", tho: "though",
  thru: "through", lvl: "level", lvls: "levels", msg: "message",
};
const canonical = (word: string) => SHORTHAND[word] ?? word;
const wordsOf = (value: string) => value.normalize("NFKD").toLowerCase().split(/[^\p{L}\p{N}'’]+/u)
  .map(word => canonical(word.replace(/['’]/g, ""))).filter(Boolean);

/**
 * Whether `tidied` says what `original` said. Two checks, both needed:
 *
 * - the letters and digits, in order, are the same give or take a twentieth plus two, which
 *   allows corrected spellings and apostrophes and nothing like a new sentence;
 * - every word of the tidy is a word of the original or close to one (a fixed spelling), or a
 *   small joining word a grammar fix adds ("a", "the", "you"). So "an exciting, award-winning"
 *   fails however long the description is (code review of #1575: on a 500-letter text the
 *   letter budget alone let 23 new letters through).
 */
export function tidyKeepsMeaning(original: string, tidied: string): boolean {
  const a = skeleton(original), b = skeleton(tidied);
  if (!a || !b) return false;
  if (distance(a, b, Math.floor(a.length / 20) + 2) > Math.floor(a.length / 20) + 2) return false;
  const own = wordsOf(original);
  const known = new Set(own);
  return wordsOf(tidied).every(word => known.has(word) || GLUE.has(word)
    || own.some(mine => distance(mine, word, Math.max(1, Math.floor(mine.length / 3))) <= Math.max(1, Math.floor(mine.length / 3))));
}

/** The tidied text when it differs from what was typed and keeps its meaning, else null. */
export function tidiedOrNull(original: string, tidied: string | null | undefined): string | null {
  const text = tidied?.trim();
  if (!text || text === original.trim()) return null;
  return tidyKeepsMeaning(original, text) ? text : null;
}

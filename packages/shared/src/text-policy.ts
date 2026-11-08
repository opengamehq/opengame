import { foldChar, LEET, readings } from "./confusables.js";

/** Lexical checks for product metadata. This word list supplements moderation;
 * it cannot determine intent, context or whether an unfamiliar word is a slur. */
const SLURS = new Set(["nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "kike", "kikes", "spic", "spics", "chink", "chinks", "tranny", "trannies"]);
const PROFANITY = new Set(["fuck", "fucks", "fucked", "fucking", "fucker", "fuckers", "motherfucker", "motherfuckers", "shit", "shits", "shitty", "bullshit", "bitch", "bitches", "bitching", "bastard", "bastards", "asshole", "assholes", "cunt", "cunts", "dickhead", "dickheads"]);
/** Normalize only for matching. The creator's original writing remains stored. The table
 *  behind it is `confusables.js`, shared with the reserved score label's check. */
export function normalizePolicyWord(value: string): string[] {
  return readings(value);
}

// Include invisible format characters inside a word so inserting a zero-width
// character cannot split it into apparently harmless fragments. Match whole
// words so Scunthorpe, classic and their ordinary neighbours remain untouched.
const WORD = /[\p{L}\p{M}\p{N}@\$][\p{L}\p{M}\p{N}\p{Cf}@\$]*/gu;
function matches(word: string, words: Set<string>): boolean {
  return normalizePolicyWord(word).some(normalized => words.has(normalized));
}

/** UTF-16 offsets refer to the original text, including combining marks. */
export function slurTextSpans(value: string): { start: number; end: number }[] {
  // Normalize before finding words so circled letters and other compatibility
  // characters cannot disappear at the token boundary. Offsets still refer to
  // the original UTF-16 string, including removed accents and format marks.
  const parts: string[] = [], starts: number[] = [], ends: number[] = [];
  let offset = 0;
  for (const char of value) {
    const end = offset + char.length;
    const normalized = foldChar(char);
    parts.push(normalized);
    for (let index = 0; index < normalized.length; index++) { starts.push(offset); ends.push(end); }
    if (!normalized && ends.length) ends[ends.length - 1] = end;
    offset = end;
  }
  const normalized = parts.join("");
  const tokens = [...normalized.matchAll(/[\p{L}\p{N}@\$]+/gu)].map(match => ({
    start: match.index!, end: match.index! + match[0].length,
    primary: match[0].replace(/[013457@$]/g, char => LEET[char]!),
    alternate: match[0].replace(/[013457@$]/g, char => char === "1" ? "l" : LEET[char]!),
  }));
  const spans: { start: number; end: number }[] = [];
  const longest = Math.max(...[...SLURS].map(word => word.length));
  for (let i = 0; i < tokens.length; i++) {
    let primary = "", alternate = "";
    // Each token contributes at least one normalized character. Bounding both
    // token count and word length keeps mark-heavy input linear in its size.
    for (let j = i; j < tokens.length && j - i < longest; j++) {
      const token = tokens[j]!;
      if (j > i && !/^[\s\p{P}\p{S}]*$/u.test(normalized.slice(tokens[j - 1]!.end, token.start))) break;
      primary += token.primary;
      alternate += token.alternate;
      if (primary.length > longest) break;
      if (SLURS.has(primary) || SLURS.has(alternate)) {
        spans.push({ start: starts[tokens[i]!.start]!, end: ends[token.end - 1]! });
        i = j;
        break;
      }
    }
  }
  return spans;
}

export function slurTextProblem(value: string): string | null {
  if (slurTextSpans(value).length) {
    return "This text contains a word we do not allow. Remove it before submitting. If it was matched incorrectly, contact support for a review.";
  }
  return null;
}

/** Public product copy is masked at projection time; creator editing and review
 * keep the original. Existing slurs are masked too while staff review old rows. */
export function maskPublicText(value: string): string {
  return value.replace(WORD, word => {
    if (!matches(word, PROFANITY) && !matches(word, SLURS)) return word;
    const chars = [...word].filter(char => !/\p{Cf}/u.test(char));
    return chars[0] + "*".repeat(Math.max(0, chars.length - 2)) + chars.at(-1);
  });
}

export interface PublicTextOverride {
  game_id: string;
  version_id: string;
  field: "title" | "description";
  raw_text: string;
  display_text: string;
}

/** Staff corrections belong to the reviewed text of one game version. A later
 * edit or publication needs its own review, even when the field name is equal. */
export function displayPublicText(value: string, context: {
  gameId: string;
  versionId: string | null;
  field: PublicTextOverride["field"];
  overrides?: readonly PublicTextOverride[];
}): string {
  const corrected = context.versionId ? context.overrides?.find(override =>
    override.game_id === context.gameId && override.version_id === context.versionId &&
    override.field === context.field && override.raw_text === value && typeof override.display_text === "string") : undefined;
  return corrected ? corrected.display_text : maskPublicText(value);
}

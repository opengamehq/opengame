/** How text reads, for matching only, never for storing: the one table of look-alike letters
 * and digit spellings that every lexical check in this package compares through.
 *
 * Plain JavaScript beside a declaration file, because the SDK bundles `game-scores.js` into
 * every game and reaches this through it; `text-policy.ts`, which carries the word lists, is
 * the other reader. Until 6 Nov 2026 the table lived inside text-policy.ts alone, and the
 * reserved score label had a fold of its own without it, so "Bеfore OpenGame" with a Cyrillic
 * е was refused nowhere a forged score could wear it. One table, so the two cannot drift. */
export const CONFUSABLES = {
  "а": "a", "ɑ": "a", "е": "e", "ε": "e", "і": "i", "ι": "i", "ı": "i", "ӏ": "l", "ɡ": "g",
  "о": "o", "ο": "o", "р": "p", "ρ": "p", "с": "c", "ϲ": "c", "ѕ": "s",
  "т": "t", "τ": "t", "у": "y", "х": "x", "χ": "x", "κ": "k", "п": "n",
};
export const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

/** Every way `value` reads: compatibility forms, case, accents, invisible format characters
 * and look-alike letters folded, then the digit spellings read as letters. A "1" reads as
 * both i and l, so a word holding one has two readings. */
export function readings(value) {
  const normalized = value.normalize("NFKC").toLowerCase().normalize("NFD")
    .replace(/[\p{M}\p{Cf}]/gu, "").replace(/./gu, char => CONFUSABLES[char] ?? char);
  const primary = normalized.replace(/[013457@$]/g, char => LEET[char]);
  return normalized.includes("1") ? [primary, normalized.replace(/[013457@$]/g, char => char === "1" ? "l" : LEET[char])] : [primary];
}

/** One character as `readings` folds it before the digit spellings, for code that keeps
 * offsets into the original text. */
export function foldChar(char) {
  return char.normalize("NFKC").toLowerCase().normalize("NFD")
    .replace(/[\p{M}\p{Cf}]/gu, "").replace(/./gu, unit => CONFUSABLES[unit] ?? unit);
}

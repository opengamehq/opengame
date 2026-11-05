import casefold from "./unicode-casefold.json";

/** Python's str.casefold differs from upper-then-lower for capital sharp-S and
 * dotless-I. Use Python's generated full mapping without depending on the
 * browser's locale or version of Unicode lowercase rules. */
function fold(value: string): string {
  const mapping: Record<string,string> = casefold.mapping;
  return [...value].map(char=>mapping[char]??char).join("");
}

/** Canonical caseless matching decomposes before folding because a fold can
 * turn a combining mark into a letter. Normalizing only after that fold cannot
 * restore the combining-mark order around the newly introduced letter. This
 * is a comparison key; callers retain the original path and its NFC policy. */
export const canonicalName = (value: string): string => fold(value.normalize("NFD")).normalize("NFD");

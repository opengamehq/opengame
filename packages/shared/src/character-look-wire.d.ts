/** Bounded stored character recipe syntax only; version and catalogue membership are separate. */
export function readCharacterRecipe(value: unknown): string | null;
/** A stored character recipe's parts by name. Ids are not checked against the catalogue. */
export type CharacterParts = {
  version: "c1" | "c2" | "c3" | "c4";
  body: string; legs: string; shirt: string; bottoms: string;
  /** Empty for none. */
  extras: string[];
  shoes: string;
  shirtColor: string; bottomsColor: string; shoesColor: string; extraColor: string;
};
/** The parts of a well-formed recipe in a known version, or null. */
export function readCharacterParts(value: unknown): CharacterParts | null;

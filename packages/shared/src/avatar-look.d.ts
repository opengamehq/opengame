/** Bounded stored recipe syntax only; renderer catalogue membership is separate. */
export function readAvatarLook(value: unknown): string | null;
/** A stored look's parts by name; ids are not checked against the catalogue. */
export type AvatarLookParts = { shape: string; eyes: string; color: string; accessory: string | null; identity: "male" | "female"; facialHair: string | null; hairColor: string | null; facialHairColor: string | null; hair: string | null };
/** The parts of a well-formed look, or null. */
export function readAvatarLookParts(value: unknown): AvatarLookParts | null;

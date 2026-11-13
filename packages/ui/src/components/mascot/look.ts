/**
 * The stored value: what a look is, how it is written into a row, and how it is read
 * back. See `mascot-art.ts` for the format.
 */

import { MASCOT_ACCESSORIES, type MascotAccessoryId } from "./accessories";
import { MASCOT_COLORS, type MascotColorId } from "./colors";
import { MASCOT_EYES, type MascotEyesId } from "./eyes";
import { MASCOT_FACIAL_HAIR, type MascotFacialHairId } from "./facial-hair";
import { MASCOT_HAIR_COLORS, type MascotHairColorId } from "./hair-colors";
import { MASCOT_HAIRSTYLES, MASCOT_SHAPES, type MascotShapeId } from "./shapes";

export const MASCOT_IDENTITIES = [{ id: "male", label: "Male" }, { id: "female", label: "Female" }] as const;
export type MascotIdentityId = (typeof MASCOT_IDENTITIES)[number]["id"];

/**
 * `accessory` absent and `accessory: "none"` are the same look and format the same way,
 * as three parts. Absent is what every look from before the fourth axis is, and what
 * `parseMascot` returns for one, so a caller comparing looks should compare
 * `formatMascot` strings rather than fields. Identity absent and `identity: "male"`
 * also describe the same look; female is stored as a fifth part with an explicit
 * accessory slot, so an old three- or four-part recipe keeps its meaning. Facial hair
 * is a sixth part behind explicit accessory and identity slots, for the same reason, and
 * absent and `"none"` are the same face. Optional head and facial hair colours follow
 * in slots seven and eight. `default` preserves the authored head ink or matches it
 * for facial hair, and trailing defaults are omitted when formatting.
 *
 * `hair`, the ninth slot since 13 Nov 2026, is head hair worn over a shape that is not
 * itself a head: a bob on an egg. A hairstyle on the plain circle is still stored the way
 * it always was, as the hairstyle's own shape (`bob.classic.white`), so every recipe written
 * before the slot draws exactly as it did, and the slot appears only for a pairing that
 * could not be stored at all before. `withShape` and `withHair` keep the two forms apart;
 * a recipe with a hairstyle in both places does not parse.
 */
export type MascotLook = {
  shape: MascotShapeId; eyes: MascotEyesId; color: MascotColorId; accessory?: MascotAccessoryId; identity?: MascotIdentityId;
  facialHair?: MascotFacialHairId;
  hairColor?: MascotHairColorId;
  facialHairColor?: MascotHairColorId;
  hair?: MascotHairId;
};

/** A hairstyle worn over another shape: every hairstyle but the plain circle, which is the bald head. */
export type MascotHairId = Exclude<(typeof MASCOT_HAIRSTYLES)[number], "circle">;

/**
 * White by default, the white avatar and not the black one (6 Oct 2026). And no
 * accessory, by the same day's call: a new account starts bare and wears something
 * only because its owner put it on.
 */
export const DEFAULT_MASCOT: MascotLook = { shape: "circle", eyes: "classic", color: "white" };

const SHAPE_IDS = new Set<string>(MASCOT_SHAPES.map((s) => s.id));
const EYES_IDS = new Set<string>(MASCOT_EYES.map((e) => e.id));
const COLOR_IDS = new Set<string>(MASCOT_COLORS.map((c) => c.id));
const ACCESSORY_IDS = new Set<string>(MASCOT_ACCESSORIES.map((a) => a.id));
const FACIAL_HAIR_IDS = new Set<string>(MASCOT_FACIAL_HAIR.map((f) => f.id));
const HAIR_COLOR_IDS = new Set<string>(MASCOT_HAIR_COLORS.map((c) => c.id));
const HAIRSTYLE_IDS = new Set<string>(MASCOT_HAIRSTYLES);
/** Ids that were live for an hour on 5 Oct 2026 and may be in a row. Exported because the
 * SDK's avatar helper reads it at build time, so a game resolves an old colour the same way. */
export const RENAMED: Readonly<Record<string, string>> = { ink: "black", paper: "white" };

/**
 * Three or four known ids, optionally followed by an identity in a fifth slot and facial
 * hair in a sixth; `null` for anything else, so the caller can fall back. `none` and
 * `male` are accepted and omitted from the object. A bare female face still needs the
 * fourth slot in its stored form, so identity never gets mistaken for an accessory, and
 * facial hair needs both, so it is never mistaken for either.
 */
export function parseMascot(value?: string | null): MascotLook | null {
  if (typeof value !== "string" || !value) return null;
  const [shape, eyes, raw, accessory, identity, facialHair, hairColor, facialHairColor, hair, ...rest] = value.split(".");
  const color = RENAMED[raw] ?? raw;
  if (rest.length || !SHAPE_IDS.has(shape) || !EYES_IDS.has(eyes) || !COLOR_IDS.has(color)) return null;
  if (accessory !== undefined && !ACCESSORY_IDS.has(accessory)) return null;
  if (identity !== undefined && identity !== "male" && identity !== "female") return null;
  if (facialHair !== undefined && !FACIAL_HAIR_IDS.has(facialHair)) return null;
  if (hairColor !== undefined && !HAIR_COLOR_IDS.has(hairColor)) return null;
  if (facialHairColor !== undefined && !HAIR_COLOR_IDS.has(facialHairColor)) return null;
  /* Hair over a head that already has its own is two haircuts, which nothing draws. */
  if (hair !== undefined && hair !== "none" && (!isHairOver(hair) || HAIRSTYLE_IDS.has(shape))) return null;
  const look = { shape, eyes, color } as MascotLook;
  if (accessory && accessory !== "none") look.accessory = accessory as MascotAccessoryId;
  if (identity === "female") look.identity = identity;
  if (facialHair && facialHair !== "none") look.facialHair = facialHair as MascotFacialHairId;
  if (hairColor && hairColor !== "default") look.hairColor = hairColor as MascotHairColorId;
  if (facialHairColor && facialHairColor !== "default") look.facialHairColor = facialHairColor as MascotHairColorId;
  if (hair && hair !== "none") look.hair = hair as MascotHairId;
  return look;
}

/**
 * How often each colour comes up when one is picked at random: White three times as
 * often as the rest, Black and Auto about a third as often, everything else evenly.
 * Judged on 5 Oct 2026 from a sheet of five hundred: a crowd of near-black faces reads as
 * one face, and white is the logo's second half and looks good on both themes.
 */
const COLOR_WEIGHT: Partial<Record<MascotColorId, number>> = { white: 3, black: 0.35, mono: 0.35 };

/**
 * How often Shuffle leaves the character bare when it is allowed to dress it: four times
 * in ten, so a run of presses shows the accessories without every face wearing one.
 */
const BARE_SHARE = 0.4;

/**
 * A random character: shape and eyes uniform, colour by `COLOR_WEIGHT`, and no accessory
 * unless `accessory: true` is passed.
 *
 * Only the Shuffle button passes it. Since 6 Oct 2026, anything assigned automatically
 * (a new account's starting face, a backfill) is bare, and an accessory is only ever on
 * a face because its owner pressed something. With the option off it takes the same three
 * numbers from `random` it always did.
 */
export function randomMascot(random: () => number = Math.random, options: { accessory?: boolean } = {}): MascotLook {
  const any = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const color = weightedColor(MASCOT_COLORS.map((c) => c.id), random());
  const look: MascotLook = { shape: any(MASCOT_SHAPES).id, eyes: any(MASCOT_EYES).id, color };
  if (options.accessory && random() >= BARE_SHARE) look.accessory = any(MASCOT_ACCESSORIES.slice(1)).id;
  return look;
}

/** One colour from `list` by `COLOR_WEIGHT`, for a roll in [0, 1). */
function weightedColor(list: readonly MascotColorId[], unit: number): MascotColorId {
  const weights = list.map((id) => COLOR_WEIGHT[id] ?? 1);
  let roll = unit * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

/**
 * The face to draw for a person: the one they built when `look` parses, and the default
 * character when it does not. One function so every surface makes the same choice.
 *
 * THE DEFAULT, NOT A FACE DECIDED BY THE HANDLE. From the morning of 6 Oct 2026 an
 * account with no look wore `fallbackMascot(handle)`, a character hashed out of three
 * frozen id lists so it never moved. That evening the call went the other way: somebody
 * who has not set up an avatar is drawn as the default one we set, everywhere, which is
 * also what the setup step opens on. A hashed face was a choice nobody made, worn in
 * public by somebody who might be about to pick another, so it went, and the lists with
 * it.
 */
export function personMascot(look: string | null | undefined): MascotLook {
  return parseMascot(look) ?? DEFAULT_MASCOT;
}

/**
 * Old recipes stay unchanged; female uses a fifth part, with `none` when bare, and facial
 * hair a sixth, with the two before it spelled out. Hair colours add slots seven and
 * eight only when chosen, keeping explicit placeholders for every slot before them, and
 * hair over another shape a ninth the same way.
 */
export function formatMascot(look: MascotLook): string {
  const base = `${look.shape}.${look.eyes}.${look.color}`;
  const hair = look.hairColor && look.hairColor !== "default" ? look.hairColor : undefined;
  const beard = look.facialHairColor && look.facialHairColor !== "default" ? look.facialHairColor : undefined;
  if (look.hair) return `${base}.${look.accessory ?? "none"}.${look.identity ?? "male"}.${look.facialHair ?? "none"}.${hair ?? "default"}.${beard ?? "default"}.${look.hair}`;
  if (hair || beard) return `${base}.${look.accessory ?? "none"}.${look.identity ?? "male"}.${look.facialHair ?? "none"}.${hair ?? "default"}${beard ? `.${beard}` : ""}`;
  if (look.facialHair && look.facialHair !== "none") return `${base}.${look.accessory ?? "none"}.${look.identity ?? "male"}.${look.facialHair}`;
  if (look.identity === "female") return `${base}.${look.accessory ?? "none"}.female`;
  return look.accessory && look.accessory !== "none" ? `${base}.${look.accessory}` : base;
}

/** The look with this facial hair, or with none; never stores `"none"`. */
export function withFacialHair(look: MascotLook, facialHair: MascotFacialHairId | undefined): MascotLook {
  const { facialHair: _old, ...bare } = look;
  return facialHair && facialHair !== "none" ? { ...bare, facialHair } : bare;
}

/** The look with this accessory on, or with none; never stores `"none"`. */
export function withAccessory(look: MascotLook, accessory: MascotAccessoryId | undefined): MascotLook {
  const { accessory: _old, ...bare } = look;
  return accessory && accessory !== "none" ? { ...bare, accessory } : bare;
}

function isHairOver(id: string): id is MascotHairId {
  return HAIRSTYLE_IDS.has(id) && id !== "circle";
}

/**
 * The shape the picker's Shape tab marks: the shape under any hair. A hairstyle stored as
 * the shape (the old form, and still the form on the plain head) is the circle with that
 * hair, since the circle is the bald head every hairstyle is cut on.
 */
export function lookShape(look: MascotLook): MascotShapeId {
  return !look.hair && isHairOver(look.shape) ? "circle" : look.shape;
}

/** The hair the picker's Hair tab marks, in either stored form, or `"none"`. */
export function lookHair(look: MascotLook): MascotHairId | "none" {
  return look.hair ?? (isHairOver(look.shape) ? look.shape : "none");
}

/**
 * The look with this shape and the hair it already had. Until 13 Nov 2026 a hairstyle was
 * only ever a shape, so choosing hair replaced the shape somebody had picked a tab earlier.
 * These two are how the picker writes either part without touching the other.
 */
export function withShape(look: MascotLook, shape: MascotShapeId): MascotLook {
  /* A hairstyle handed in as a shape (a judge's head, a photo OG) is a whole head already. */
  if (isHairOver(shape)) return withHead(look, shape, undefined);
  return withHead(look, shape, lookHair(look));
}

/** The look with this hair, or none, on the shape it already had. */
export function withHair(look: MascotLook, hair: MascotHairId | "none" | undefined): MascotLook {
  return withHead(look, lookShape(look), hair);
}

function withHead(look: MascotLook, shape: MascotShapeId, hair: MascotHairId | "none" | undefined): MascotLook {
  const { hair: _old, ...bare } = look;
  if (!hair || hair === "none") return { ...bare, shape };
  /* On the plain head the hairstyle is the shape, as every recipe before the ninth slot is. */
  if (shape === "circle") return { ...bare, shape: hair };
  return { ...bare, shape, hair };
}

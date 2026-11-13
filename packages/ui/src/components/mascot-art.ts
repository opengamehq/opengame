/**
 * The OpenGame character: the round thing with two tall eyes from the logo, made into
 * something a person can make their own.
 *
 * Since 5 Oct 2026, onboarding asks a new account to pick a shape, a pair of eyes and a
 * colour, and whatever they pick is what sits in the top bar and on their profile from
 * then on. The logo files are vectorised rasters, one path per colour and several
 * megabytes each, so they could only ever be looked at. This draws the same character
 * from a description instead: a signed distance for the body, a dome lit from the top
 * left, the logo's ordered dither for the shading, and the eyes on top.
 *
 * ## One drawing, three places
 *
 * Everything here is arithmetic over a grid of cells and touches no DOM, so the same
 * function feeds the live canvas in onboarding (sixty frames a second, with a pose), the
 * static SVG beside a name (once, memoised), and a share card under Satori. A face that
 * looked one way animated and another way still would be two implementations of one
 * thing, and AGENTS.md has a section about where that goes.
 *
 * ## The stored value
 *
 * `shape.eyes.color`, three ids joined with dots, in one column; or
 * `shape.eyes.color.accessory` once the character wears something (6 Oct 2026). No
 * accessory is written as three parts, never as `.none`, so every row and every card URL
 * from before the fourth axis is byte-for-byte what it was. Female identity adds a fifth
 * part, `shape.eyes.color.accessory.female`; a bare face uses `none` in the accessory
 * slot. Male is the existing default and keeps its three- or four-part form.
 * Facial hair is the sixth slot. Head and facial hair colours follow in the seventh
 * and eighth; `default` keeps the head's authored colour or matches it for facial hair.
 * Anything that does not parse
 * is not a mascot, and `personMascot` draws `DEFAULT_MASCOT` instead, the same character
 * the avatar step opens on.
 *
 * ## Where the code lives
 *
 * This file is the public entry and nothing else: the drawing is split by what a person
 * adds to it, one file per axis, so several people can add shapes, eyes, colours and
 * accessories at once without editing the same file. `mascot/CONTRIBUTING.md` says
 * which file holds what and how to add to each.
 */

export { MASCOT_HAIRSTYLES, MASCOT_SHAPES, type MascotShapeId } from "./mascot/shapes";
export { MASCOT_EYES, type MascotEyesId } from "./mascot/eyes";
export { MASCOT_COLORS, mascotInks, mascotTones, type MascotColorId, type MascotInks } from "./mascot/colors";
export { MASCOT_ACCESSORIES, type MascotAccessoryId } from "./mascot/accessories";
export { MASCOT_FACIAL_HAIR, type MascotFacialHairId } from "./mascot/facial-hair";
export { MASCOT_HAIR_COLORS, type MascotHairColorId } from "./mascot/hair-colors";
export {
  DEFAULT_MASCOT,
  MASCOT_IDENTITIES,
  formatMascot,
  parseMascot,
  personMascot,
  randomMascot,
  lookHair,
  lookShape,
  withAccessory,
  withFacialHair,
  withHair,
  withShape,
  type MascotHairId,
  type MascotLook,
  type MascotIdentityId,
} from "./mascot/look";
export {
  MASCOT_FRAME,
  STILL_POSE,
  inkColor,
  mascotFrame,
  mascotGrid,
  mascotPaths,
  mascotSurface,
  paintMascot,
  sampleMascot,
  type MascotFrame,
  type MascotInk,
  type MascotPose,
} from "./mascot/render";

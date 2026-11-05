import { hex, mix, ramp, type MascotInks, type Rgb } from "./colors";

/** Hair is a material of its own: choosing blond hair must not tint the face or a hat.
 * The absent/default choice keeps an older portrait's authored ink. Facial hair uses
 * the selected head-hair ink until its owner chooses a separate colour. */
export const MASCOT_HAIR_COLORS = [
  { id: "default", label: "Original", swatch: null },
  { id: "black", label: "Black", swatch: "#242226" },
  { id: "brown", label: "Brown", swatch: "#65432E" },
  { id: "chestnut", label: "Chestnut", swatch: "#926344" },
  { id: "auburn", label: "Auburn", swatch: "#964630" },
  { id: "ginger", label: "Ginger", swatch: "#C47A42" },
  { id: "blonde", label: "Blonde", swatch: "#D8B878" },
  { id: "silver", label: "Silver", swatch: "#999A9D" },
  { id: "white", label: "White", swatch: "#E6E1D7" },
  { id: "rose", label: "Rose", swatch: "#CA718C" },
  { id: "blue", label: "Blue", swatch: "#507DC5" },
  { id: "violet", label: "Violet", swatch: "#9268B9" },
] as const;

export type MascotHairColorId = (typeof MASCOT_HAIR_COLORS)[number]["id"];
const inks = new Map<string, MascotInks>(MASCOT_HAIR_COLORS.flatMap(c => c.swatch ? [[c.id, ramp(c.swatch)]] : []));
export function hairColorInks(color: MascotHairColorId | undefined): MascotInks | undefined {
  return color ? inks.get(color) : undefined;
}

/* Facial hair is a soft material at avatar scale. Keep the chosen hue, but lift the
 * deepest bands and narrow the contrast so light stubble does not become a black mask. */
const facialInks = new Map<string, MascotInks>(MASCOT_HAIR_COLORS.flatMap((c) => {
  if (!c.swatch) return [];
  const base = mix(hex(c.swatch), [255, 255, 255], 0.24) as Rgb;
  const tones = [mix(base, [8, 8, 12], 0.22), mix(base, [8, 8, 12], 0.08), base, mix(base, [255, 255, 255], 0.14), mix(base, [255, 255, 255], 0.3)] as MascotInks["tones"];
  return [[c.id, { tones, rim: mix(base, [8, 8, 12], 0.16), sclera: ramp(c.swatch).sclera, pupil: ramp(c.swatch).pupil }]];
}));

export function facialHairColorInks(color: MascotHairColorId | undefined): MascotInks | undefined {
  return color ? facialInks.get(color) : undefined;
}

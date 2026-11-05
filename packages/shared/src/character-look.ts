/**
 * A person's body and clothes belong beside their avatar, rather than inside its look.
 * A wardrobe change must not change their face. The stable ids in this file are also
 * the portable recipe a game can render, without receiving an account id or a URL to a
 * mutable model. If the recipe changes, add a new version instead of reusing an id.
 */

import limits from "../limits.browser.json";
import { readCharacterParts } from "./character-look-wire.js";

export const CHARACTER_BODIES = [
  { id: "sprout", label: "Sprout", description: "A small, compact body" },
  { id: "classic", label: "Classic", description: "Balanced and rounded" },
  { id: "slim", label: "Slim", description: "A narrow, light frame" },
  { id: "round", label: "Round", description: "A soft, wider body" },
  { id: "tall", label: "Tall", description: "A longer, upright body" },
] as const;

export const CHARACTER_LEGS = [
  { id: "short", label: "Short", description: "Small steps" },
  { id: "regular", label: "Regular", description: "An easy stride" },
  { id: "long", label: "Long", description: "A little more leg" },
] as const;

export const CHARACTER_SHIRTS = [
  { id: "none", label: "None", description: "Your avatar's own color" },
  { id: "tee", label: "T-shirt", description: "A plain everyday tee" },
  { id: "ringer", label: "Ringer", description: "A tee with contrasting trim" },
  { id: "stripe", label: "Striped", description: "A tee with a bold stripe" },
  { id: "hoodie", label: "Hoodie", description: "A hood and a front pocket" },
  { id: "varsity", label: "Varsity", description: "A jacket with contrasting sleeves" },
  { id: "polo", label: "Polo", description: "A collar and a short button placket" },
  { id: "henley", label: "Henley", description: "A collarless top with three buttons" },
  { id: "sweatshirt", label: "Sweatshirt", description: "A crew neck with ribbed cuffs" },
  { id: "cardigan", label: "Cardigan", description: "An open knit with a button front" },
  { id: "jacket", label: "Jacket", description: "A short jacket with a zip front" },
  { id: "vest", label: "Vest", description: "A sleeveless layer with front pockets" },
  { id: "tank", label: "Tank top", description: "A sleeveless top with curved neck trim" },
  { id: "baseball", label: "Baseball tee", description: "Contrasting sleeves and a stitched hem" },
  { id: "rugby", label: "Rugby shirt", description: "Wide stripes and a contrasting collar" },
  { id: "overshirt", label: "Overshirt", description: "A button front with two chest pockets" },
  { id: "raincoat", label: "Raincoat", description: "A long coat with a storm flap" },
  { id: "overalls", label: "Overalls", description: "A bib front with two shoulder straps" },
  { id: "blazer", label: "Blazer", description: "A tailored jacket with folded lapels" },
  { id: "trackjacket", label: "Track jacket", description: "A zip jacket with striped sleeves" },
  { id: "turtleneck", label: "Turtleneck", description: "A close fit with a rolled collar" },
  { id: "knit", label: "Cable knit", description: "A thick sweater with raised knit panels" },
  { id: "tunic", label: "Tunic", description: "A long top with a split hem" },
  { id: "poncho", label: "Poncho", description: "A wide, draped layer over your shoulders" },
  { id: "openjacket", label: "Open jacket", description: "An open jacket over a white tee" },
] as const;

export const CHARACTER_BOTTOMS = [
  { id: "shorts", label: "Shorts", description: "Above the knee" },
  { id: "trousers", label: "Trousers", description: "A straight, full-length fit" },
  { id: "joggers", label: "Joggers", description: "A relaxed fit with cuffs" },
  { id: "skirt", label: "Skirt", description: "A short, flared shape" },
  { id: "chinos", label: "Chinos", description: "A tapered fit with rolled hems" },
  { id: "jeans", label: "Jeans", description: "A straight fit with patch pockets" },
  { id: "cargos", label: "Cargo trousers", description: "A relaxed fit with side pockets" },
  { id: "culottes", label: "Culottes", description: "Wide legs cropped below the knee" },
  { id: "flares", label: "Flares", description: "A fitted leg with a wider hem" },
  { id: "leggings", label: "Leggings", description: "A close fit from waist to ankle" },
  { id: "pleated", label: "Pleated skirt", description: "A short skirt with folded panels" },
  { id: "kilt", label: "Kilt", description: "A wrap skirt with a side buckle" },
  { id: "bermuda", label: "Bermuda shorts", description: "A straight fit down to the knee" },
  { id: "bikers", label: "Bike shorts", description: "A close fit ending above the knee" },
  { id: "parachute", label: "Parachute trousers", description: "Wide legs gathered at the ankles" },
  { id: "bloomers", label: "Bloomers", description: "Rounded shorts with gathered hems" },
  { id: "denimshorts", label: "Denim shorts", description: "Short legs with patch pockets and folded hems" },
  { id: "wrapskirt", label: "Wrap skirt", description: "A long skirt with an overlapping front" },
] as const;

export const CHARACTER_EXTRAS = [
  { id: "none", label: "None", description: "Keep it simple" },
  { id: "backpack", label: "Backpack", description: "A small pack with shoulder straps" },
  { id: "crossbody", label: "Crossbody", description: "A bag worn across your body" },
  { id: "scarf", label: "Scarf", description: "A scarf around your neck" },
  { id: "cape", label: "Cape", description: "A cape behind your shoulders" },
  { id: "satchel", label: "Satchel", description: "A flap bag carried at your side" },
  { id: "belt", label: "Belt", description: "A waist strap with a square buckle" },
  { id: "sash", label: "Sash", description: "A wide ribbon across your chest" },
  { id: "bowtie", label: "Bow tie", description: "A small bow at your collar" },
  { id: "wristband", label: "Wristband", description: "A cuff around your wrist" },
  { id: "wings", label: "Wings", description: "A pair of small wings on your back" },
  { id: "bandolier", label: "Utility strap", description: "A chest strap with small pouches" },
  { id: "apron", label: "Apron", description: "A tied apron with a front pocket" },
  { id: "floatie", label: "Swim ring", description: "A round float around your waist" },
  { id: "medal", label: "Medal", description: "A medal on a ribbon around your neck" },
  { id: "watch", label: "Watch", description: "A wrist strap with a round watch face" },
  { id: "canteen", label: "Canteen", description: "A small bottle carried at your hip" },
  { id: "pauldrons", label: "Shoulder armor", description: "A rounded plate over each shoulder" },
  { id: "harness", label: "Harness", description: "Crossed straps with a chest buckle" },
  { id: "rocketpack", label: "Rocket pack", description: "Twin rockets strapped to your back" },
  { id: "oakwatch", label: "Octagonal watch", description: "An eight-sided steel case and linked bracelet" },
  { id: "nautiluswatch", label: "Porthole watch", description: "A rounded square case with side tabs" },
  { id: "overseaswatch", label: "Blue sport watch", description: "A blue dial with a notched steel bezel" },
  { id: "datejustwatch", label: "Fluted watch", description: "A ridged bezel with a date window" },
] as const;

/** Every accessory, without the "none" placeholder the c3 field needs. */
export type CharacterExtra = Exclude<(typeof CHARACTER_EXTRAS)[number]["id"], "none">;

/**
 * Where on the body each accessory sits. One item per slot, any mix across slots, so a
 * cape and a watch go on together and two capes never do. A slot is a place on the body
 * rather than a kind of thing: the satchel is a bag, but its strap crosses the chest
 * exactly where the sash and the crossbody's strap do, and drawing two of them there is
 * two tubes fighting for the same pixels.
 *
 * The wristband has its own slot rather than sharing the watch's, because a band and a
 * watch together is how people actually wear them. The rig moves the band to the other
 * wrist when a watch is on, and leaves it where it always was otherwise.
 */
export const CHARACTER_EXTRA_SLOTS = [
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "neck", label: "Neck" },
  { id: "across", label: "Across the chest" },
  { id: "waist", label: "Waist" },
  { id: "watch", label: "Watch" },
  { id: "cuff", label: "Wristband" },
] as const;
export type CharacterExtraSlot = (typeof CHARACTER_EXTRA_SLOTS)[number]["id"];

export const CHARACTER_EXTRA_SLOT: Readonly<Record<CharacterExtra, CharacterExtraSlot>> = Object.freeze({
  backpack: "back", cape: "back", wings: "back", rocketpack: "back",
  pauldrons: "shoulders",
  scarf: "neck", bowtie: "neck", medal: "neck",
  crossbody: "across", sash: "across", bandolier: "across", harness: "across", satchel: "across",
  belt: "waist", apron: "waist", floatie: "waist", canteen: "waist",
  watch: "watch", oakwatch: "watch", nautiluswatch: "watch", overseaswatch: "watch", datejustwatch: "watch",
  wristband: "cuff",
});

/**
 * Pairs in different slots that still cannot be drawn together without one passing
 * through the other. Each is a measured overlap in the rig rather than a taste call:
 * a cape's shoulders are where the armour plates sit; the harness straps run down the
 * chest within a centimetre of a backpack's or rocket pack's; a swim ring is wider than
 * the cape's hem, the satchel and the crossbody bag at the height it is worn.
 */
export const CHARACTER_EXTRA_CONFLICTS: readonly (readonly [CharacterExtra, CharacterExtra])[] = [
  ["cape", "pauldrons"],
  ["harness", "backpack"],
  ["harness", "rocketpack"],
  ["floatie", "cape"],
  ["floatie", "satchel"],
  ["floatie", "crossbody"],
];

export const CHARACTER_ACCESSORIES_MAX: number = limits.character.accessoriesMax;

const EXTRA_ORDER = new Map<string, number>(CHARACTER_EXTRAS.map((option, index) => [option.id, index]));

/** What wearing `extra` takes off: whatever held its slot, and anything it clashes with. */
export function characterExtraClashes(extras: readonly CharacterExtra[], extra: CharacterExtra): CharacterExtra[] {
  const slot = CHARACTER_EXTRA_SLOT[extra];
  return extras.filter((worn) => worn !== extra && (CHARACTER_EXTRA_SLOT[worn] === slot
    || CHARACTER_EXTRA_CONFLICTS.some(([a, b]) => (a === worn && b === extra) || (a === extra && b === worn))));
}

/**
 * Put `extra` on, or take it off if it is already worn. Putting it on swaps out what it
 * clashes with, which is the same thing a person does with a real coat; the caller gets
 * the list of what came off so it can say so. At the count limit the first item in the
 * list comes off, because the one somebody just chose is the one they want.
 */
export function toggleCharacterExtra(extras: readonly CharacterExtra[], extra: CharacterExtra): { extras: CharacterExtra[]; removed: CharacterExtra[] } {
  if (extras.includes(extra)) return { extras: extras.filter((worn) => worn !== extra), removed: [] };
  const removed = characterExtraClashes(extras, extra);
  let kept = extras.filter((worn) => !removed.includes(worn));
  while (kept.length >= CHARACTER_ACCESSORIES_MAX) { removed.push(kept[0]!); kept = kept.slice(1); }
  return { extras: sortCharacterExtras([...kept, extra]), removed };
}

/** Catalogue order, which is the only order a recipe may be written in. */
export function sortCharacterExtras(extras: readonly CharacterExtra[]): CharacterExtra[] {
  return [...extras].sort((a, b) => EXTRA_ORDER.get(a)! - EXTRA_ORDER.get(b)!);
}

/** The reason a set of accessories cannot be worn, or null when it can. */
export function characterExtrasProblem(extras: readonly string[]): string | null {
  if (extras.length > CHARACTER_ACCESSORIES_MAX) return "too many";
  for (const [index, extra] of extras.entries()) {
    if (extra === "none" || !EXTRA_ORDER.has(extra)) return "unknown";
    if (index > 0 && EXTRA_ORDER.get(extras[index - 1]!)! >= EXTRA_ORDER.get(extra)!) return "order";
  }
  const typed = extras as readonly CharacterExtra[];
  for (const [index, extra] of typed.entries()) {
    if (characterExtraClashes(typed.slice(0, index), extra).length) return "conflict";
  }
  return null;
}

export const CHARACTER_SHOES = [
  { id: "classic", label: "Classic", description: "Rounded sneakers with a simple sole" },
  { id: "lowtop", label: "Low tops", description: "A low collar with a slim layered sole" },
  { id: "hightop", label: "High tops", description: "An ankle collar and a padded tongue" },
  { id: "runner", label: "Runners", description: "A curved sole with layered side panels" },
  { id: "chunky", label: "Chunky", description: "A wide upper on a thick sculpted sole" },
  { id: "court", label: "Court", description: "A smooth upper with a rounded toe cap" },
  { id: "skate", label: "Skate", description: "A broad padded tongue and a flat sole" },
  { id: "canvas", label: "Canvas", description: "A light upper with a rubber toe cap" },
  { id: "retro", label: "Retro", description: "A narrow toe with contrasting side stripes" },
  { id: "trail", label: "Trail", description: "A reinforced toe and a ridged outsole" },
  { id: "slipon", label: "Slip-ons", description: "A smooth upper with elastic side panels" },
  { id: "platform", label: "Platform", description: "A simple upper on a tall flat sole" },
  { id: "airforce", label: "Air court", description: "A perforated low top with stitched panels and a broad sole" },
  { id: "jumpcourt", label: "Jump court", description: "A layered high top with ankle panels" },
] as const;

export const CHARACTER_COLORS = [
  { id: "avatar", label: "Avatar", hex: null },
  { id: "ink", label: "Ink", hex: "#252522" },
  { id: "chalk", label: "Chalk", hex: "#EEEDE6" },
  { id: "slate", label: "Slate", hex: "#727A83" },
  { id: "blue", label: "Blue", hex: "#0054FF" },
  { id: "green", label: "Green", hex: "#4F8567" },
  { id: "rose", label: "Rose", hex: "#C67488" },
  { id: "amber", label: "Amber", hex: "#C89443" },
  { id: "plum", label: "Plum", hex: "#835985" },
  { id: "coral", label: "Coral", hex: "#EA8067" },
  { id: "red", label: "Red", hex: "#CC4245" },
  { id: "orange", label: "Orange", hex: "#DF782B" },
  { id: "lemon", label: "Lemon", hex: "#E3D75B" },
  { id: "mint", label: "Mint", hex: "#99C9A8" },
  { id: "cyan", label: "Cyan", hex: "#4BC3CB" },
  { id: "teal", label: "Teal", hex: "#2F807D" },
  { id: "sky", label: "Sky", hex: "#83B7D8" },
  { id: "violet", label: "Violet", hex: "#6B55B3" },
  { id: "lavender", label: "Lavender", hex: "#B7A3D0" },
  { id: "magenta", label: "Magenta", hex: "#B34488" },
  { id: "sand", label: "Sand", hex: "#C7B08C" },
  { id: "cocoa", label: "Cocoa", hex: "#775746" },
  { id: "silver", label: "Silver", hex: "#B5BABE" },
  { id: "gold", label: "Gold", hex: "#B79A47" },
  { id: "match", label: "Match avatar", hex: null },
] as const;
export type CharacterColor = (typeof CHARACTER_COLORS)[number]["id"];
/** Each palette colour's hex by id, typed per entry: `CHARACTER_COLOR_HEX.blue` is a string and
 *  `CHARACTER_COLOR_HEX.match` is null, so a lookup of a real colour needs no assertion. */
export const CHARACTER_COLOR_HEX = Object.fromEntries(CHARACTER_COLORS.map((color) => [color.id, color.hex])) as
  { [Entry in (typeof CHARACTER_COLORS)[number] as Entry["id"]]: Entry["hex"] };
export const CHARACTER_COLOR_CATEGORIES = ["shirtColor", "bottomsColor", "shoesColor", "extraColor"] as const;
export type CharacterColorCategory = (typeof CHARACTER_COLOR_CATEGORIES)[number];

export interface CharacterLook {
  body: (typeof CHARACTER_BODIES)[number]["id"];
  legs: (typeof CHARACTER_LEGS)[number]["id"];
  shirt: (typeof CHARACTER_SHIRTS)[number]["id"];
  bottoms: (typeof CHARACTER_BOTTOMS)[number]["id"];
  /** Catalogue order, never "none". Empty is no accessories. */
  extras: readonly CharacterExtra[];
  shoes: (typeof CHARACTER_SHOES)[number]["id"];
  shirtColor: CharacterColor;
  bottomsColor: CharacterColor;
  shoesColor: CharacterColor;
  extraColor: CharacterColor;
}

/** The editor's tabs and the c3 field order. "extra" is the accessory list, the rest are one choice each. */
export const CHARACTER_CATEGORIES = ["body", "legs", "shirt", "bottoms", "extra", "shoes"] as const;
export type CharacterCategory = (typeof CHARACTER_CATEGORIES)[number];
export const CHARACTER_CHOICE_CATEGORIES = ["body", "legs", "shirt", "bottoms", "shoes"] as const;
export type CharacterChoiceCategory = (typeof CHARACTER_CHOICE_CATEGORIES)[number];

export const DEFAULT_CHARACTER: Readonly<CharacterLook> = Object.freeze({
  body: "classic", legs: "regular", shirt: "none", bottoms: "shorts", extras: Object.freeze([]), shoes: "classic",
  shirtColor: "avatar", bottomsColor: "avatar", shoesColor: "avatar", extraColor: "avatar",
});

/** New characters start dressed; Reset returns to the plain body above. Avatar colors
 * retain the renderer's coordinated tones when someone changes their avatar later. */
export const STARTER_CHARACTER: Readonly<CharacterLook> = Object.freeze({
  ...DEFAULT_CHARACTER, shirt: "hoodie", bottoms: "jeans", extras: Object.freeze(["backpack"] as const), shoes: "jumpcourt", shoesColor: "chalk",
});

/** Native watch finishes and an absent garment have no adjustable color. The editor
 * and shuffle use this same rule so each sampled color can appear on the character. */
export function characterHasCustomColor(category: CharacterCategory, value: string | readonly string[]): boolean {
  if (category === "extra") return (typeof value === "string" ? [value] : value).some((extra) => !NATIVE_FINISH.has(extra));
  if (category === "shirt") return value !== "none";
  return category === "bottoms" || category === "shoes";
}
const NATIVE_FINISH: ReadonlySet<string> = new Set(["none", "oakwatch", "nautiluswatch", "overseaswatch", "datejustwatch"]);

const OPTIONS = {
  body: CHARACTER_BODIES,
  legs: CHARACTER_LEGS,
  shirt: CHARACTER_SHIRTS,
  bottoms: CHARACTER_BOTTOMS,
  extra: CHARACTER_EXTRAS,
  shoes: CHARACTER_SHOES,
};
const LONGEST_EXTRAS = CHARACTER_EXTRAS.map((option) => option.id.length).sort((a, b) => b - a)
  .slice(0, CHARACTER_ACCESSORIES_MAX).reduce((length, id) => length + id + 1, -1);
const VALID_IDS: Record<CharacterCategory, ReadonlySet<string>> = {
  body: new Set(CHARACTER_BODIES.map((option) => option.id)),
  legs: new Set(CHARACTER_LEGS.map((option) => option.id)),
  shirt: new Set(CHARACTER_SHIRTS.map((option) => option.id)),
  bottoms: new Set(CHARACTER_BOTTOMS.map((option) => option.id)),
  extra: new Set(CHARACTER_EXTRAS.map((option) => option.id)),
  shoes: new Set(CHARACTER_SHOES.map((option) => option.id)),
};
const VALID_COLORS = new Set<string>(CHARACTER_COLORS.map((color) => color.id));
const VERSION = "c3";
/* c4 is c3 with more than one accessory: the extra field holds catalogue-ordered ids
   joined by "-", two to accessoriesMax of them. One accessory or none is still written
   as c3, so every look that c3 could already say stays byte for byte what it was, and a
   client from before c4 only meets the new form when somebody actually wears two things.
   An old client parses c4 as null and falls back to its default, which is its existing
   behaviour for any recipe it does not know. */
const MULTI_VERSION = "c4";
const EXTRA_SEPARATOR = "-";
const MAX_LENGTH = MULTI_VERSION.length + CHARACTER_CATEGORIES.reduce(
  (length, category) => length + 1 + (category === "extra" ? LONGEST_EXTRAS : Math.max(...OPTIONS[category].map((option) => option.id.length))),
  0,
) + CHARACTER_COLOR_CATEGORIES.length * (1 + Math.max(...CHARACTER_COLORS.map((color) => color.id.length)));

/* c1 has no footwear field. These are its frozen protocol ids, rather than slices of the
   current picker: adding an option must not silently make it valid in an old format.
   Reading supplies the original sneakers and avatar colors; only an explicit save
   writes a current recipe. c2 has sneakers but no independent clothing colors. */
const C1_CATEGORIES = ["body", "legs", "shirt", "bottoms", "extra"] as const;
const C1_IDS: Record<(typeof C1_CATEGORIES)[number], ReadonlySet<string>> = {
  body: new Set(["sprout", "classic", "slim", "round", "tall"]),
  legs: new Set(["short", "regular", "long"]),
  shirt: new Set([
    "none", "tee", "ringer", "stripe", "hoodie", "varsity", "polo", "henley", "sweatshirt", "cardigan", "jacket", "vest",
    "tank", "baseball", "rugby", "overshirt", "raincoat", "overalls", "blazer", "trackjacket", "turtleneck", "knit", "tunic", "poncho",
  ]),
  bottoms: new Set([
    "shorts", "trousers", "joggers", "skirt", "chinos", "jeans", "cargos", "culottes", "flares", "leggings", "pleated", "kilt",
    "bermuda", "bikers", "parachute", "bloomers", "denimshorts", "wrapskirt",
  ]),
  extra: new Set([
    "none", "backpack", "crossbody", "scarf", "cape", "satchel", "belt", "sash", "bowtie", "wristband", "wings", "bandolier",
    "apron", "floatie", "medal", "watch", "canteen", "pauldrons", "harness", "rocketpack",
  ]),
};
const C2_IDS: Record<CharacterCategory, ReadonlySet<string>> = {
  body: C1_IDS.body,
  legs: C1_IDS.legs,
  shirt: C1_IDS.shirt,
  bottoms: C1_IDS.bottoms,
  extra: new Set([
    ...C1_IDS.extra, "oakwatch", "nautiluswatch", "overseaswatch", "datejustwatch",
  ]),
  shoes: new Set([
    "classic", "lowtop", "hightop", "runner", "chunky", "court", "skate", "canvas", "retro", "trail", "slipon", "platform",
  ]),
};

/** Unknown versions or ids are invalid. Both legacy versions have explicit defaults. The
 * layout of each version, and those defaults, come from readCharacterParts, which the SDK
 * hands to games; this adds the catalogue, so the two readers cannot disagree about where
 * a field is. */
export function parseCharacter(value: unknown): CharacterLook | null {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return null;
  const parts = readCharacterParts(value);
  if (!parts) return null;
  const { version, ...look } = parts;
  const ids = version === "c1" ? { ...C1_IDS, shoes: C2_IDS.shoes } : version === "c2" ? C2_IDS : VALID_IDS;
  if (!CHARACTER_CHOICE_CATEGORIES.every((category) => ids[category].has(look[category]))) return null;
  if (version === MULTI_VERSION ? characterExtrasProblem(look.extras) : look.extras.some((extra) => !ids.extra.has(extra))) return null;
  if (!CHARACTER_COLOR_CATEGORIES.every((category) => VALID_COLORS.has(look[category]))) return null;
  return look as CharacterLook;
}

export function formatCharacter(look: CharacterLook): string {
  /* A mounted editor can retain an earlier in-memory recipe through a development hot
     reload. Supply only absent fields introduced since c1; explicit bad ids still fail.
     Persisted c3 strings remain exact, so this does not relax the read boundary. */
  const legacy = (look as { extra?: string }).extra;
  const extras = sortCharacterExtras(look.extras ?? (legacy && legacy !== "none" ? [legacy as CharacterExtra] : []));
  const normalized = {
    ...look,
    extra: extras.length ? extras.join(EXTRA_SEPARATOR) : "none",
    shoes: look.shoes === undefined ? "classic" : look.shoes,
    shirtColor: look.shirtColor === undefined ? "avatar" : look.shirtColor,
    bottomsColor: look.bottomsColor === undefined ? "avatar" : look.bottomsColor,
    shoesColor: look.shoesColor === undefined ? "avatar" : look.shoesColor,
    extraColor: look.extraColor === undefined ? "avatar" : look.extraColor,
  };
  const fields = [...CHARACTER_CATEGORIES, ...CHARACTER_COLOR_CATEGORIES];
  const value = `${extras.length > 1 ? MULTI_VERSION : VERSION}.${fields.map((category) => normalized[category]).join(".")}`;
  if (!parseCharacter(value)) throw new TypeError("Invalid character look");
  return value;
}

/** Samples are bounded here so an injected random source cannot produce a missing id. */
function sampleIndex(length: number, random: () => number): number {
  const sample = random();
  if (!Number.isFinite(sample)) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(sample * length)));
}

function sampleId<Option extends { readonly id: string }>(options: readonly Option[], random: () => number): Option["id"] {
  return options[sampleIndex(options.length, random)]!.id;
}

// These defaults affect suggestions only. The full catalog and saved recipes stay
// available to every identity, including someone who chooses one of these manually.
const FEMININE_SHUFFLE_BOTTOMS: ReadonlySet<CharacterLook["bottoms"]> = new Set([
  "skirt", "pleated", "wrapskirt", "culottes", "bloomers",
]);
const MALE_SHUFFLE_BOTTOMS = CHARACTER_BOTTOMS.filter((option) => !FEMININE_SHUFFLE_BOTTOMS.has(option.id));

function wearOne(extra: (typeof CHARACTER_EXTRAS)[number]["id"]): CharacterExtra[] {
  return extra === "none" ? [] : [extra];
}

export function randomCharacter(random: () => number = Math.random, identity: "male" | "female" = "male"): CharacterLook {
  const look: CharacterLook = {
    body: sampleId(CHARACTER_BODIES, random),
    legs: sampleId(CHARACTER_LEGS, random),
    shirt: sampleId(CHARACTER_SHIRTS, random),
    bottoms: sampleId(identity === "female" ? CHARACTER_BOTTOMS : MALE_SHUFFLE_BOTTOMS, random),
    // One accessory, as before, drawn in its old place so a seeded shuffle keeps its
    // sequence. A shuffle that stacks four reads as noise rather than as a look.
    extras: wearOne(sampleId(CHARACTER_EXTRAS, random)),
    shoes: sampleId(CHARACTER_SHOES, random),
    shirtColor: sampleId(CHARACTER_COLORS, random),
    bottomsColor: sampleId(CHARACTER_COLORS, random),
    shoesColor: sampleId(CHARACTER_COLORS, random),
    extraColor: sampleId(CHARACTER_COLORS, random),
  };
  if (!characterHasCustomColor("shirt", look.shirt)) look.shirtColor = "avatar";
  if (!characterHasCustomColor("extra", look.extras)) look.extraColor = "avatar";
  return look;
}

/** The quick arrows and the detailed picker use the same order. */
export function cycleCharacter(look: CharacterLook, category: CharacterChoiceCategory, direction: -1 | 1): CharacterLook {
  const options = OPTIONS[category];
  const index = options.findIndex((option) => option.id === look[category]);
  const next = (index + direction + options.length) % options.length;
  return { ...look, [category]: options[next]!.id };
}

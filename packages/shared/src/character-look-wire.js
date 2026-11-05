// The transport form of a character recipe, for the SDK core and the play page, which
// cannot carry character-look.ts: it imports limits and the whole catalogue, and the core
// has a gzip budget. Like avatar-look.js this checks representation only. Which versions
// and ids exist, and which accessories can be worn together, stay with parseCharacter, so
// a version or garment added after a game shipped still reaches that game, and the game's
// own parser decides whether it can draw it.
//
// A version, then at least five dot-separated fields (c1, the shortest version, has
// five), each one lowercase id or a list of them joined by "-". The id width mirrors
// avatar-look.js. The length cap bounds what one call can cost; it sits well above the
// longest recipe c4 can spell, so it is not a product rule and moves no limit.
const storedCharacter = /^c[1-9]\d*(?:\.[a-z]{1,16}(?:-[a-z]{1,16})*){5,}$/;

/** The recipe unchanged when its syntax is well formed, otherwise null. Never coerces. */
export function readCharacterRecipe(value) {
  return typeof value === "string" && value.length <= 256 && storedCharacter.test(value) ? value : null;
}

/* The field order of each stored version, so a game can name the parts of a recipe without
   the catalogue. parseCharacter in character-look.ts reads its layout from here and adds the
   catalogue on top, which keeps one owner of the format: a version added there is a layout
   added here, or neither reader knows it. c1 has no shoes and no colours, c2 has shoes and
   no colours, and c3 and c4 differ only in c4 holding two or more accessories joined by
   "-". An unknown version has an unknown layout, so it reads as null rather than as a guess. */
const FIELDS = ["body", "legs", "shirt", "bottoms", "extra", "shoes", "shirtColor", "bottomsColor", "shoesColor", "extraColor"];
const FIELD_COUNT = { c1: 5, c2: 6, c3: 10, c4: 10 };

/** The recipe's parts by name, with the defaults c1 and c2 imply, or null for malformed
 * syntax, an unknown version, or a field count or accessory list its version cannot hold.
 * Ids are not checked against the catalogue, so a garment added later still reads. */
export function readCharacterParts(value) {
  const recipe = readCharacterRecipe(value);
  if (!recipe) return null;
  const [version, ...parts] = recipe.split(".");
  if (!Object.hasOwn(FIELD_COUNT, version) || parts.length !== FIELD_COUNT[version]) return null;
  const extras = parts[4].split("-");
  // "none" is the empty placeholder of the single slot, never an item in a list, and a
  // single accessory has exactly one spelling, which is c3.
  if (version === "c4" ? extras.length < 2 || extras.includes("none") : extras.length !== 1) return null;
  const read = Object.fromEntries(FIELDS.map((field, index) => [field, parts[index] ?? (field === "shoes" ? "classic" : "avatar")]));
  return {
    version, body: read.body, legs: read.legs, shirt: read.shirt, bottoms: read.bottoms,
    extras: version === "c4" ? extras : extras[0] === "none" ? [] : extras, shoes: read.shoes,
    shirtColor: read.shirtColor, bottomsColor: read.bottomsColor, shoesColor: read.shoesColor, extraColor: read.extraColor,
  };
}

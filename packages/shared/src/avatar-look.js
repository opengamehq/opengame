// This is the stored database format, not the renderer's catalogue. A transport
// reader preserves a well-formed recipe; the UI's parseMascot decides whether its
// ids can be drawn. Keeping catalogue membership there avoids a second stale list
// in the SDK when a creator gets a new shape, color or accessory.
// Plain groups rather than non-capturing ones: only the whole match is read, and the
// adapter that carries this into every game has a gzip budget it sat two bytes over.
const storedLook = /^[a-z]{1,16}(\.[a-z]{1,16}){2}(\.[a-z]{1,16}(\.(male|female)(\.[a-z]{1,16}){0,3})?)?$/;

/** Read three ids, an optional accessory, an optional identity, then optional facial
 * hair. The fifth slot requires an explicit accessory, including "none" for a bare
 * character, and the sixth an explicit identity, so no slot is mistaken for another.
 * Head and facial hair colours may follow in slots seven and eight.
 * The fixed grammar bounds a recipe to 125 ASCII characters. Its id width mirrors
 * profiles_avatar_look_check; this is representation syntax, not a new allowance.
 * Alias normalization and catalogue validation remain with parseMascot. */
export function readAvatarLook(value) {
  if (typeof value !== "string") return null;
  // `$` can match before a final newline. Comparing the entire match prevents
  // that exception from admitting an extra byte into the stored format.
  return storedLook.exec(value)?.[0] === value ? value : null;
}

/** A stored look's parts by name, or null when its syntax is malformed. "none" in the
 * accessory or facial hair slot and an absent one both read as null, and an absent
 * identity reads as "male", as parseMascot does. Ids, and the two colours renamed on 5 Oct 2026, are left
 * as stored: catalogue membership and renames stay with the renderer. */
export function readAvatarLookParts(value) {
  const look = readAvatarLook(value);
  if (!look) return null;
  const [shape, eyes, color, accessory, identity, facialHair, hairColor, facialHairColor] = look.split(".");
  return {
    shape, eyes, color, accessory: accessory && accessory !== "none" ? accessory : null, identity: identity === "female" ? "female" : "male",
    facialHair: facialHair && facialHair !== "none" ? facialHair : null,
    hairColor: hairColor && hairColor !== "default" ? hairColor : null,
    facialHairColor: facialHairColor && facialHairColor !== "default" ? facialHairColor : null,
  };
}

/**
 * The sixth axis: facial hair, worn on any head and mixed with any haircut.
 *
 * See CONTRIBUTING.md in this folder before adding one. Ids are stored in rows and URLs,
 * so the list is append-only and an id is never renamed.
 *
 * Until 2 Nov 2026 a beard came only as part of a head: the judges' shapes carried their
 * own, so a person could have the full beard's spiky hair or its beard and not one without
 * the other, and the only bald head with a beard drew it as a chinstrap. Made from a photo
 * that day: a short beard with a mouth showing through it, not a chinstrap,
 * and head hair and facial hair picked separately.
 *
 * ## How one is drawn
 *
 * In its own colour or the head hair's ink, with the body's lighting and dither, and
 * under the eyes. Each style is written in face units rather than body units, so one beard
 * fits a circle, a long face and a cat:
 *
 * - `t` runs down the face, 0 on the eye line and 1 at the chin, measured on the shape
 *   itself (`lowerFace` in shapes.ts), so a long face gets a long beard.
 * - `u` runs across it, 1 at the jaw's edge on the mouth line, so a beard is as wide as the
 *   jaw it is on. Nothing here moves when the eyes look around: a mouth that followed them
 *   sat off the middle of its beard (2 Nov 2026), and a face reads as glancing when
 *   only the eyes move.
 *
 * A style is a patch of hair less the mouth. The mouth is the skin showing through, under
 * the moustache: a grin, so a full beard reads as a face and not a muzzle. Some styles also
 * fill out the jaw (`volume`), which is the one thing here that changes the outline.
 */

import { sdEllipse, sdPolygon, smin } from "./geometry";

export const MASCOT_FACIAL_HAIR = [
  { id: "none", label: "None" },
  { id: "shortbeard", label: "Short beard" },
  { id: "fullbeard", label: "Full beard" },
  { id: "longbeard", label: "Long beard" },
  { id: "goatee", label: "Goatee" },
  { id: "circlebeard", label: "Circle beard" },
  { id: "vandyke", label: "Van Dyke" },
  { id: "soulpatch", label: "Soul patch" },
  { id: "chinstrap", label: "Chinstrap" },
  { id: "horseshoe", label: "Horseshoe" },
  { id: "muttonchops", label: "Mutton chops" },
  { id: "sideburns", label: "Sideburns" },
  { id: "moustache", label: "Moustache" },
  { id: "handlebar", label: "Handlebar" },
  { id: "pencil", label: "Pencil moustache" },
  { id: "walrus", label: "Walrus moustache" },
  { id: "stubble", label: "Stubble" },
  { id: "lightstubble", label: "Light stubble" },
  { id: "patchystubble", label: "Patchy stubble" },
  { id: "softbeard", label: "Soft short beard" },
  { id: "closebeard", label: "Close beard" },
  { id: "lightmoustache", label: "Light moustache" },
  { id: "extendedgoatee", label: "Extended goatee" },
  { id: "balbo", label: "Balbo" },
  { id: "anchor", label: "Anchor" },
  { id: "ducktail", label: "Ducktail" },
  { id: "garibaldi", label: "Garibaldi" },
  { id: "chevron", label: "Chevron moustache" },
  { id: "fumanchu", label: "Long drooping moustache" },
] as const;

export type MascotFacialHairId = (typeof MASCOT_FACIAL_HAIR)[number]["id"];

/** Where the lower face is on a shape, in body units: see `lowerFace` in shapes.ts. */
export type LowerFace = {
  /** The face's centre line. */
  x: number;
  /** The eye line, `t = 0`. */
  eye: number;
  /** The chin on the centre line, `t = 1`. */
  chin: number;
  /** Half the jaw's width on the mouth line, `u = 1`. */
  jaw: number;
};

/** The mouth line, as a share of the way from the eyes to the chin. */
const MOUTH = 0.64;

/** The mouth: a grin, flat along the top under the moustache and round below. */
const grin = (u: number, t: number, rx = 0.3, ry = 0.13) => Math.max(sdEllipse(u, t - MOUTH, rx, ry), MOUTH - t);

/**
 * A smile drawn in the hair's ink, under a moustache that leaves the mouth bare. Without it
 * the moustache's turned-down ends read as a frown, which the moustache judge's face found
 * first (`tacheMoustache` in shapes.ts).
 */
const smile = (u: number, t: number, rx = 0.22) => Math.max(Math.abs(sdEllipse(u, t - MOUTH - 0.02, rx, 0.12)) - 0.03, MOUTH + 0.05 - t);

/**
 * A moustache: a band over the mouth whose ends come down to its corners. `curl` lifts the
 * ends instead, for a handlebar.
 */
function moustache(u: number, t: number, { half = 0.42, thick = 0.1, droop = 0.07, curl = 0, lift = 0 } = {}) {
  const a = Math.abs(u);
  const line = MOUTH - 0.065 - lift + droop * (a / half) ** 2 - curl * Math.max(0, a - half * 0.55) / (half * 0.45);
  return Math.max(Math.abs(t - line) - thick / 2, a - half);
}

/**
 * The cheek line a beard grows up to: level with the top of the moustache in the middle,
 * rising along the cheekbones to the sideburns, which stop below the eyes. Ears are past
 * `u` 1.12 on every head and stay clear.
 */
function beardCover(u: number, t: number, low = 0) {
  const a = Math.abs(u);
  const top = Math.max(0.3, MOUTH - 0.14 + low - 1.1 * Math.max(0, a - 0.45));
  return Math.max(top - t, a - 1.12);
}

/**
 * The hair at a point, under 0 inside, in face units (only the sign matters to the
 * renderer). `d` is the head's own distance at the point, under 0 inside it, in body units:
 * a chinstrap is a band along it.
 */
export function facialHairDistance(id: MascotFacialHairId, f: LowerFace, x: number, y: number, d: number): number {
  if (id === "none") return Infinity;
  const h = Math.max(f.chin - f.eye, 0.2);
  const t = (y - f.eye) / h;
  /* Above the eyes there is nothing to draw, and a sample there is most of the grid. */
  if (t < 0) return Infinity;
  const u = (x - f.x) / f.jaw;
  switch (id) {
    case "shortbeard":
      return Math.max(Math.min(beardCover(u, t), moustache(u, t)), -grin(u, t));
    case "fullbeard":
    case "longbeard":
      return Math.max(Math.min(beardCover(u, t, -0.03), moustache(u, t, { thick: 0.12 })), -grin(u, t, 0.28, 0.12));
    case "goatee": {
      // Moustache, the corners of the mouth and the chin, as one ring round the mouth.
      const ring = Math.max(sdEllipse(u, t - MOUTH - 0.06, 0.4, 0.3), MOUTH - 0.13 - t);
      const chin = Math.max(Math.abs(u) - 0.3, MOUTH - t);
      return Math.max(Math.min(ring, chin, moustache(u, t, { half: 0.4 })), -grin(u, t, 0.24, 0.11));
    }
    case "circlebeard": {
      const ring = Math.max(sdEllipse(u, t - MOUTH - 0.04, 0.46, 0.27), MOUTH - 0.13 - t);
      return Math.max(Math.min(ring, moustache(u, t)), -grin(u, t, 0.25, 0.11));
    }
    case "vandyke": {
      // A moustache that stops short of the corners, and a pointed tuft under the lip
      // that does not meet it.
      const tuft = Math.max(Math.abs(u) - 0.24 * (1.25 - (t - MOUTH) * 2.2), MOUTH + 0.2 - t);
      return Math.min(moustache(u, t, { half: 0.36, droop: 0.02 }), tuft, smile(u, t, 0.2));
    }
    case "soulpatch":
      return Math.max(Math.abs(u) - 0.12, Math.abs(t - (MOUTH + 0.25)) - 0.09);
    case "chinstrap":
      // A band along the jaw from ear to ear, inside the outline, clear of the lips.
      return Math.max(-d - 0.14 * h, d, 0.34 - t, Math.abs(u) - 1.12);
    case "horseshoe": {
      // A moustache whose ends run straight down past the mouth to the jaw.
      const sides = Math.max(Math.abs(Math.abs(u) - 0.4) - 0.08, MOUTH - 0.1 - t);
      return Math.min(moustache(u, t, { half: 0.48, droop: 0.02 }), sides, smile(u, t));
    }
    case "muttonchops": {
      // A full beard with the chin shaved out from under the mouth: sideburns that flare
      // onto the cheeks and join the moustache.
      const chin = Math.max(sdEllipse(u, t - 1.02, 0.5, 0.42), MOUTH - 0.02 - t);
      return Math.max(Math.min(beardCover(u, t), moustache(u, t, { half: 0.5 })), -chin, -grin(u, t));
    }
    case "sideburns":
      // A band down the sides of the face, following its outline, to about the mouth.
      return Math.max(-d - 0.16 * h, d, 0.22 - t, t - MOUTH + 0.06, Math.abs(u) - 1.12);
    case "moustache":
      return Math.min(moustache(u, t), smile(u, t));
    case "handlebar":
      return Math.min(moustache(u, t, { half: 0.5, thick: 0.08, droop: 0, curl: 0.12 }), smile(u, t, 0.18));
    case "pencil":
      return Math.min(moustache(u, t, { half: 0.36, thick: 0.045, droop: 0.02 }), smile(u, t, 0.2));
    case "walrus":
      // Thick enough to hang over the top lip, so only the smile's lower edge shows.
      return Math.min(moustache(u, t, { half: 0.5, thick: 0.17, droop: 0.06, lift: -0.035 }), smile(u, t, 0.2));
    case "stubble": {
      // A short beard's cover, broken into a fine stipple, so the skin shows through it.
      const grain = 0.3 - Math.abs(Math.sin(x * 46) * Math.sin(y * 46 + 0.8));
      return Math.max(beardCover(u, t, 0.04), grain, -grin(u, t));
    }
    case "lightstubble": {
      // A very light five-o'clock shadow: sparse, fine points with a clean mouth.
      const grain = 0.18 - Math.abs(Math.sin(x * 39 + 0.7) * Math.sin(y * 43 + 1.4));
      return Math.max(beardCover(u, t, 0.08), grain, -grin(u, t, 0.28, 0.12));
    }
    case "patchystubble": {
      // Uneven growth: the cheeks are quieter than the chin and moustache.
      const grain = 0.22 - Math.abs(Math.sin(x * 31 + 1.3) * Math.sin(y * 37 - 0.4));
      const patch = Math.max(Math.abs(u) - 0.82, 0.52 - t);
      return Math.max(Math.min(beardCover(u, t, 0.06), patch), grain, -grin(u, t, 0.27, 0.12));
    }
    case "softbeard":
      // A short, softly edged beard: cheeks are lower and the jaw does not flare out.
      return Math.max(Math.min(beardCover(u, t, 0.05), moustache(u, t, { thick: 0.08 })), -grin(u, t, 0.28, 0.12));
    case "closebeard": {
      // Close-trimmed coverage around the mouth and chin, leaving the upper cheeks clear.
      const cover = Math.max(0.47 - t, Math.abs(u) - 0.92);
      return Math.max(Math.min(cover, moustache(u, t, { half: 0.38, thick: 0.075 })), -grin(u, t, 0.27, 0.12));
    }
    case "lightmoustache":
      return Math.min(moustache(u, t, { half: 0.35, thick: 0.05, droop: 0.01 }), smile(u, t, 0.2));
    case "extendedgoatee": {
      // A goatee whose chin runs out along the jaw, short of the sideburns.
      const chin = Math.max(beardCover(u, t), Math.abs(u) - 0.78, MOUTH - 0.02 - t);
      return Math.max(Math.min(chin, moustache(u, t)), -grin(u, t, 0.26, 0.11));
    }
    case "balbo": {
      // A moustache on its own over a chin beard that wraps under the mouth, with a strip
      // under the lip joining the two halves of the beard.
      const chin = Math.max(Math.abs(u) - 0.6, MOUTH + 0.1 - t);
      const strip = Math.max(Math.abs(u) - 0.08, MOUTH + 0.04 - t);
      return Math.min(moustache(u, t, { half: 0.44, droop: 0.03 }), chin, strip, smile(u, t));
    }
    case "anchor": {
      // A pointed chin beard traced along the jaw, a strip up to the lip, and a moustache
      // apart from both: the shape of an anchor.
      const chin = Math.max(Math.abs(u) - Math.max(0, 0.55 - 1.1 * (t - MOUTH - 0.16)), MOUTH + 0.16 - t);
      const strip = Math.max(Math.abs(u) - 0.07, MOUTH + 0.04 - t);
      return Math.min(moustache(u, t, { half: 0.42, droop: 0.02 }), chin, strip, smile(u, t));
    }
    case "ducktail":
    case "garibaldi":
      return Math.max(Math.min(beardCover(u, t, -0.03), moustache(u, t, { thick: 0.12 })), -grin(u, t, 0.27, 0.11));
    case "chevron":
      // Thick and wide over the whole top lip, the ends cut square at the mouth's corners.
      return Math.min(moustache(u, t, { half: 0.4, thick: 0.16, droop: 0.02, lift: -0.02 }), smile(u, t, 0.2));
    case "fumanchu": {
      // A thin moustache whose ends hang in long strands well past the chin.
      const strands = Math.max(Math.abs(Math.abs(u) - 0.38) - 0.05, MOUTH - 0.08 - t);
      return Math.min(moustache(u, t, { half: 0.4, thick: 0.06, droop: 0.02 }), strands, smile(u, t, 0.2));
    }
  }
}

/**
 * Where a style fills out the jaw, in body units, under 0 inside; `Infinity` for one that
 * lies on the face. Joined to the head with a soft union, so the outline runs on into it.
 * Never past the floor the character stands on.
 */
export function facialHairVolume(id: MascotFacialHairId, f: LowerFace, x: number, y: number): number {
  const h = Math.max(f.chin - f.eye, 0.2);
  const floor = 0.86;
  if (id === "fullbeard") {
    const bottom = Math.min(f.chin + 0.06 * h, floor);
    return sdEllipse(x - f.x, y - (bottom - 0.24 * h), f.jaw * 0.86, 0.24 * h);
  }
  if (id === "garibaldi") {
    // The fullest: wide and round, out past the jaw.
    const bottom = Math.min(f.chin + 0.1 * h, floor);
    return sdEllipse(x - f.x, y - (bottom - 0.3 * h), f.jaw * 1.02, 0.3 * h);
  }
  if (id === "ducktail") {
    // A full beard drawn down to a short point at the chin.
    const tip = Math.min(f.chin + 0.14 * h, floor + 0.02);
    const top = f.chin - 0.34 * h;
    return sdPolygon(x, y, [[f.x - f.jaw * 0.86, top], [f.x + f.jaw * 0.86, top], [f.x + f.jaw * 0.5, f.chin - 0.04 * h], [f.x + 0.04, tip], [f.x - 0.04, tip], [f.x - f.jaw * 0.5, f.chin - 0.04 * h]]) - 0.03;
  }
  if (id === "longbeard") {
    // A wedge from the jaw to a rounded point, as far down as the floor allows.
    const tip = Math.min(f.chin + 0.26 * h, floor + 0.02);
    const top = f.chin - 0.3 * h;
    return sdPolygon(x, y, [[f.x - f.jaw * 0.8, top], [f.x + f.jaw * 0.8, top], [f.x + 0.06, tip], [f.x - 0.06, tip]]) - 0.03;
  }
  return Infinity;
}

/** The head's own distance with a style's volume joined to it. */
export function joinFacialHair(id: MascotFacialHairId, f: LowerFace, x: number, y: number, d: number) {
  const v = facialHairVolume(id, f, x, y);
  return v === Infinity ? d : smin(d, v, 0.06);
}

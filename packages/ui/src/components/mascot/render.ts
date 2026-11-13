/**
 * Turning a look and a pose into cells: the pose, the per-cell sample, the colour lookup,
 * and the two outputs, an RGBA buffer for a canvas and run-length SVG paths for
 * everything still.
 */

import { accessoryArt, type AccessoryArt } from "./accessories";
import {
  BEAD, PLASTIC, contrastRatio, markInks, mix, mascotFinish, mascotInks, mascotTones, ramp,
  type MascotColorId, type MascotInks, type MascotSurface, type Rgb,
} from "./colors";
import { sampleEyes } from "./eyes";
import { BAYER4, GROUND, bayer8, length } from "./geometry";
import { formatMascot, type MascotLook } from "./look";
import { facialHairColorInks, hairColorInks } from "./hair-colors";
import { MASCOT_HAIRSTYLES, bodyDistance, faceHairDistance, headAnchor, markingDistance, markingTone, type MascotShapeId } from "./shapes";

/* ------------------------------------------------------------------------- *
 * The pose
 * ------------------------------------------------------------------------- */

/**
 * Everything that moves. All of it is optional and the still pose is the logo's: eyes
 * glancing down and to the left, nothing squashed, nothing mid-change.
 */
export type MascotPose = {
  /** Where the pupils point, -1 to 1 on each axis; y grows downward. */
  lookX: number;
  lookY: number;
  /** Where the face has turned, -1 to 1: the eyes slide across the body with it. */
  turnX: number;
  turnY: number;
  /** 0 open, 1 shut. */
  blink: number;
  /** Body scale about the point it stands on. */
  squashX: number;
  squashY: number;
  /** How far the body has left the ground, in body units (the box is 2 across). */
  lift: number;
  /** Lean, in radians, about the same point. */
  tilt: number;
  /** A clock for the blobs, which breathe a little; seconds are fine. */
  wobble: number;
  /** The shape being left, and how far the morph to `look.shape` has gone (0 to 1). */
  fromShape: MascotShapeId | null;
  morph: number;
  /** The colour being left, and how far the dither dissolve to `look.color` has gone. */
  fromColor: MascotColorId | null;
  dissolve: number;
  /**
   * How far above its seat the accessory is, in body units: a new one is put on by
   * dropping it from above, and 0 is worn. Optional, so a pose written before the
   * fourth axis is still a pose.
   */
  drop?: number;
};

export const STILL_POSE: MascotPose = {
  lookX: 0.45,
  lookY: 0.5,
  turnX: -0.85,
  turnY: 0.1,
  blink: 0,
  squashX: 1,
  squashY: 1,
  lift: 0,
  tilt: 0,
  wobble: 0,
  fromShape: null,
  morph: 1,
  fromColor: null,
  dissolve: 1,
  drop: 0,
};

/* ------------------------------------------------------------------------- *
 * Framing
 * ------------------------------------------------------------------------- */

/**
 * The part of body space a square grid covers: `left` and `top` are the box's corner,
 * `span` its width and height, y down.
 *
 * A bare character is drawn in `bare`, the -1 to 1 box every face was drawn in before
 * accessories, so every stored look without one is the same cells it always was. A
 * character wearing something is drawn in `dressed`, which keeps the floor where it is
 * and adds 0.4 of headroom above and 0.2 either side, enough for the tallest hat on the
 * tallest head; the body comes out about five sixths the size. One frame for every
 * accessory rather than one per accessory, so changing hats does not resize the face.
 */
export type MascotFrame = { left: number; top: number; span: number };

export const MASCOT_FRAME = {
  bare: { left: -1, top: -1, span: 2 },
  dressed: { left: -1.2, top: -1.4, span: 2.4 },
} as const satisfies Record<string, MascotFrame>;

/** The frame a look is drawn in when nothing else asks: dressed when it wears something. */
export function mascotFrame(look: MascotLook): MascotFrame {
  return accessoryArt(look.accessory) ? MASCOT_FRAME.dressed : MASCOT_FRAME.bare;
}

/* ------------------------------------------------------------------------- *
 * Sampling
 * ------------------------------------------------------------------------- */

type MascotTone = "deep" | "shade" | "base" | "light" | "glint";

/**
 * What one cell turned out to be; the caller looks the colour up with `inkColor`.
 *
 * `plastic` and `bead` are the two inks that do not follow the body: a googly eye is white
 * plastic with a black bead in it whatever it is stuck to. Drawn in the body's own eye
 * colour it came out as a dark disc with a pale dot on every light body, which showed on
 * White, 6 Oct 2026, beside the same eyes looking right on Black.
 *
 * `mark.*` is the body's second ink (a shape's markings) and `mark.sclera`/`mark.pupil`
 * an eye drawn over one. `wear.*` and `trim.*` are an accessory's `main` and `alt`
 * colours, which, like the googly inks, do not follow the body.
 */
export type MascotInk =
  | MascotTone
  | "rim"
  | "sclera"
  | "pupil"
  | "plastic"
  | "bead"
  | `mark.${MascotTone}`
  | "mark.sclera"
  | "mark.pupil"
  | `facial.${MascotTone}`
  | "facial.sclera"
  | "facial.pupil"
  | `wear.${MascotTone}`
  | "wear.rim"
  | `trim.${MascotTone}`
  | "trim.rim";

const TONES: readonly MascotTone[] = ["deep", "shade", "base", "light", "glint"];
const MARK: readonly MascotInk[] = ["mark.deep", "mark.shade", "mark.base", "mark.light", "mark.glint"];
const FACIAL: readonly MascotInk[] = ["facial.deep", "facial.shade", "facial.base", "facial.light", "facial.glint"];
const WEAR: readonly MascotInk[] = ["wear.deep", "wear.shade", "wear.base", "wear.light", "wear.glint"];
const TRIM: readonly MascotInk[] = ["trim.deep", "trim.shade", "trim.base", "trim.light", "trim.glint"];

/** Which family an ink belongs to and which of the five tones it is, without parsing strings per cell. */
const INK_FAMILY = new Map<MascotInk, { family: "body" | "mark" | "facial" | "wear" | "trim"; tone: number }>();
for (const [family, list] of [["body", TONES], ["mark", MARK], ["facial", FACIAL], ["wear", WEAR], ["trim", TRIM]] as const) {
  list.forEach((ink, tone) => INK_FAMILY.set(ink, { family, tone }));
}

const LX = -0.54, LY = -0.64, LZ = 0.54; // normalised light from the top left
const HL = Math.hypot(LX, LY, LZ + 1);
const HX = LX / HL, HY = LY / HL, HZ = (LZ + 1) / HL; // half vector between the light and the viewer

/**
 * Where the last shaded cell was and which way it faced, for a finish. A finish picks its
 * colour from the geometry rather than from the ink alone, so `paintMascot` and
 * `mascotPaths` hand one of these to `sampleMascot`, which fills it, and then to
 * `inkColor`, which reads it. One object reused across a whole paint.
 */
export function mascotSurface(): MascotSurface {
  return { x: 0, y: 0, nx: 0, ny: 0, nz: 1, diffuse: 0, spec: 0, t: 0, gx: 0, gy: 0 };
}

const SCRATCH = mascotSurface();

/**
 * A lit value for a dome at distance `d` inside an outline whose gradient is (gx, gy),
 * written into `hit`; `depth` is how far in the dome reaches its crown.
 */
function light(hit: MascotSurface, gxn: number, gyn: number, d: number, depth: number) {
  const gl = length(gxn, gyn) || 1;
  let nx = gxn / gl;
  let ny = gyn / gl;
  const inward = Math.min(1, -d / depth);
  const slope = 1 - inward * (2 - inward); // 1 at the edge, 0 at the crown
  const nz = Math.sqrt(Math.max(0, 1 - slope * slope));
  nx *= slope;
  ny *= slope;
  hit.nx = nx;
  hit.ny = ny;
  hit.nz = nz;
  hit.diffuse = Math.max(0, nx * LX + ny * LY + nz * LZ);
  hit.spec = Math.pow(Math.max(0, nx * HX + ny * HY + nz * HZ), 36) * 0.5;
}

/** A lit value from 0 to 1 to one of five tones, dithered on the grid at 32 cells and up. */
function quantise(tone: number, gx: number, gy: number, dither: boolean) {
  const scaled = tone * (TONES.length - 1);
  let index = Math.floor(scaled);
  const frac = scaled - index;
  const threshold = dither ? BAYER4[(gy & 3) * 4 + (gx & 3)] : 0.5;
  if (frac > threshold) index += 1;
  return Math.min(TONES.length - 1, index);
}

/**
 * One cell of the character at `(x, y)`, both in body space (the -1 to 1 box), y down.
 *
 * `cell` is the width of one cell in the same units, which the dither and the thin
 * strokes need so a wink is still a line at twenty-four cells across. `hit` receives the
 * shaded cell's geometry for `inkColor`; leave it out if you only want the ink.
 *
 * In order: the eyes, then an accessory, then the body's rim, then the dome, with the
 * markings painted in the dome's own light. So an accessory sits in front of the body
 * and behind the eyes, which is the whole of the promise that a hat never covers one. An accessory may be outside the body, which
 * is why the body's outline no longer ends the sample on its own.
 */
export function sampleMascot(
  look: MascotLook,
  pose: MascotPose,
  x: number,
  y: number,
  cell: number,
  gx: number,
  gy: number,
  dither: boolean,
  hit: MascotSurface = SCRATCH,
): MascotInk | null {
  // Undo the pose: lift, then the lean and squash about the ground point.
  let bx = x;
  let by = y + pose.lift;
  if (pose.tilt) {
    const c = Math.cos(-pose.tilt);
    const s = Math.sin(-pose.tilt);
    const rx = bx;
    const ry = by - GROUND;
    bx = rx * c - ry * s;
    by = rx * s + ry * c + GROUND;
  }
  bx /= pose.squashX;
  by = GROUND + (by - GROUND) / pose.squashY;

  const d = bodyDistance(look, pose, bx, by);
  /* Nearly half a cell inside, not the edge itself: a cell whose centre only just clears
     a round edge is the lone pixel that sticks out at the top and sides of a pixel
     circle, and at 28 cells across those read as nubs. */
  const inside = !(d > -cell * 0.42);
  const art = accessoryArt(look.accessory);
  if (!inside && !art) return null;

  if (inside) {
    const eye = sampleEyes(look, pose, bx, by, cell);
    if (eye) {
      if ((eye === "sclera" || eye === "pupil") && markingDistance(look, pose, bx, by) < 0) {
        const facial = faceHairDistance(look, pose, bx, by) < 0;
        return facial ? (eye === "sclera" ? "facial.sclera" : "facial.pupil") : (eye === "sclera" ? "mark.sclera" : "mark.pupil");
      }
      return eye;
    }
  }

  if (art) {
    const worn = sampleWear(art, look, pose, bx, by, cell, gx, gy, dither, inside, hit);
    if (worn) return worn;
    if (!inside) return null;
  }

  if (d > -cell * 1.3) return "rim";

  // The dome: a normal from the distance field's gradient, tipped toward the viewer the
  // further in from the edge the cell is.
  const e = 0.012;
  const nx = bodyDistance(look, pose, bx + e, by) - bodyDistance(look, pose, bx - e, by);
  const ny = bodyDistance(look, pose, bx, by + e) - bodyDistance(look, pose, bx, by - e);
  light(hit, nx, ny, d, 0.5);
  hit.x = bx;
  hit.y = by;
  hit.t = pose.wobble;
  hit.gx = gx;
  hit.gy = gy;
  const finish = mascotFinish(look.color);
  const tone = finish?.light
    ? Math.min(1, Math.max(0, finish.light(hit)))
    : Math.min(1, Math.max(0, 0.04 + hit.diffuse * 0.78 + hit.spec));
  const index = quantise(tone, gx, gy, dither);
  if (faceHairDistance(look, pose, bx, by) < 0) return FACIAL[index];
  if (markingDistance(look, pose, bx, by) < 0) return MARK[index];
  return TONES[index];
}

/**
 * The accessory at a body-space point, or null. It is drawn over the body wherever its
 * parts reach, apart from a `behind` part, and under the eyes: `sampleMascot` asks the
 * eyes first, so an accessory cannot cover an eye however it is written.
 *
 * Until 6 Oct 2026 nothing was drawn inside the body below the head's `ceiling`, a line
 * above every eye style's highest mark. That kept hats off the eyes by cutting them,
 * and on a face set high in its body (a star, a spiky ball) the line sat near the top of
 * the outline, so a crown showed only its points above a body that hid the rest, which
 * read as the crown behind the star. The order is now body, accessory, eyes, and
 * the eyes win by construction rather than by a line every hat has to stay above.
 */
function sampleWear(
  art: AccessoryArt,
  look: MascotLook,
  pose: MascotPose,
  bx: number,
  by: number,
  cell: number,
  gx: number,
  gy: number,
  dither: boolean,
  inside: boolean,
  hit: MascotSurface,
): MascotInk | null {
  const head = headAnchor(look, pose);
  const ay = by + (pose.drop ?? 0);
  const t = pose.wobble;
  for (const part of art.parts) {
    if (part.behind && inside) continue;
    const da = part.sd(bx, ay, head, t);
    if (da > -cell * 0.42) continue;
    if (part.material === "eye") return "sclera";
    const family = part.material === "main" ? WEAR : TRIM;
    if (part.flat) return family[2];
    if (da > -cell * 1.3) return part.material === "main" ? "wear.rim" : "trim.rim";
    const e = 0.012;
    const nx = part.sd(bx + e, ay, head, t) - part.sd(bx - e, ay, head, t);
    const ny = part.sd(bx, ay + e, head, t) - part.sd(bx, ay - e, head, t);
    light(hit, nx, ny, da, part.depth ?? 0.18);
    hit.x = bx;
    hit.y = ay;
    hit.t = t;
    hit.gx = gx;
    hit.gy = gy;
    const spec = part.material === "main" ? art.main : (art.alt ?? art.main);
    const finish = spec.startsWith("#") ? undefined : mascotFinish(spec as MascotColorId);
    const tone = finish?.light
      ? Math.min(1, Math.max(0, finish.light(hit)))
      : Math.min(1, Math.max(0, 0.04 + hit.diffuse * 0.78 + hit.spec));
    return family[quantise(tone, gx, gy, dither)];
  }
  return null;
}

const hexRamps = new Map<string, MascotInks>();

/** An accessory colour's ramp: a hex value's own, or a mascot colour's in this theme. */
function materialInks(spec: string, dark: boolean): MascotInks {
  if (!spec.startsWith("#")) return mascotInks(spec as MascotColorId, dark);
  let inks = hexRamps.get(spec);
  if (!inks) hexRamps.set(spec, (inks = ramp(spec)));
  return inks;
}

/**
 * The colour for one ink, honouring a dissolve between two colours mid-change. `hit` is
 * the geometry `sampleMascot` wrote for this same cell; a finish needs it, and without it
 * a finish answers with its first ramp.
 */
export function inkColor(
  look: MascotLook,
  pose: MascotPose,
  ink: MascotInk,
  gx: number,
  gy: number,
  dark: boolean,
  hit?: MascotSurface,
): Rgb {
  let color = look.color;
  if (pose.fromColor && pose.dissolve < 1 && bayer8(gx & 7, gy & 7) >= pose.dissolve) color = pose.fromColor;
  switch (ink) {
    case "rim":
      return mascotInks(color, dark).rim;
    case "sclera":
      return mascotInks(color, dark).sclera;
    case "pupil":
      return mascotInks(color, dark).pupil;
    case "plastic":
      return PLASTIC;
    case "bead":
      return BEAD;
    case "mark.sclera":
    case "mark.pupil":
    case "facial.sclera":
    case "facial.pupil": {
      /* An eye on a patch keeps its inks while they still read against the patch, and
         takes the body's base tone where they would not: dark eyes in a white panda's
         dark patches. */
      const inks = mascotInks(color, dark);
      const mark = markingInks(look, pose, dark, ink.startsWith("facial."), color);
      const keep = contrastRatio(inks.sclera, mark.tones[2]) >= 2.5;
      if (ink === "mark.sclera" || ink === "facial.sclera") return keep ? inks.sclera : inks.tones[2];
      return keep ? inks.pupil : mark.tones[3];
    }
    case "wear.rim":
    case "trim.rim": {
      const art = accessoryArt(look.accessory);
      const spec = !art ? "#000000" : ink === "wear.rim" ? art.main : (art.alt ?? art.main);
      return materialInks(spec, dark).rim;
    }
  }
  const entry = INK_FAMILY.get(ink);
  if (!entry) throw new Error(`Unknown mascot ink "${ink}"`);
  if (entry.family === "body") return mascotTones(color, dark, hit)[entry.tone];
  if (entry.family === "mark" || entry.family === "facial") return markingInks(look, pose, dark, entry.family === "facial", color).tones[entry.tone];
  const art = accessoryArt(look.accessory);
  const spec = !art ? "#000000" : entry.family === "wear" ? art.main : (art.alt ?? art.main);
  if (spec.startsWith("#")) return materialInks(spec, dark).tones[entry.tone];
  return mascotTones(spec as MascotColorId, dark, hit)[entry.tone];
}

/** Shared with the 3D head: only a haircut's markings are hair. Animal patches keep
 * their own ink even when a stored hair colour accompanies a later shape change. Hair worn
 * over a shape (`look.hair`) is the exception: a face has one second ink, chosen by name
 * and not by where it falls, so the hair's colour paints that shape's patches too. Giving
 * them inks of their own is a new ink family through the 3D atlas and the SDK spec. */
export function markingInks(look: MascotLook, pose: MascotPose, dark: boolean, facial = false, color = look.color): MascotInks {
  const shape = pose.fromShape && pose.morph < 0.5 ? pose.fromShape : look.shape;
  const haircut = Boolean(look.hair) || (MASCOT_HAIRSTYLES as readonly string[]).includes(shape);
  const head = haircut ? hairColorInks(look.hairColor) : undefined;
  const fallback = markInks(color, dark, markingTone(look, pose));
  if (!facial) return head ?? fallback;
  const source = facialHairColorInks(look.facialHairColor) ?? head ?? fallback;
  /* These options describe the low-contrast growth in the photo references. Their
   * geometry is sparse, and their ink is lifted toward the face so the remaining pixels
   * read as hair texture rather than a painted-on black shape. Existing beard recipes
   * keep their authored contrast for backwards compatibility. */
  const soft = new Set(["lightstubble", "patchystubble", "softbeard", "closebeard", "lightmoustache"]);
  if (look.facialHair && soft.has(look.facialHair)) {
    const body = mascotInks(color, dark);
    const amount = look.facialHair === "softbeard" || look.facialHair === "closebeard" ? 0.58 : 0.46;
    return {
      tones: source.tones.map((tone, index) => mix(body.tones[index], tone, amount)) as unknown as MascotInks["tones"],
      rim: mix(body.rim, source.rim, amount),
      sclera: source.sclera,
      pupil: source.pupil,
    };
  }
  return source;
}

/**
 * Paint the character into an RGBA buffer, `size` cells across with its top-left at
 * `(ox, oy)`. Cells outside the character are left alone, so a scene can draw first.
 *
 * `frame` is the part of body space the square covers, `mascotFrame(look)` unless the
 * caller has its own room: the onboarding stage paints a larger square at the same scale
 * so a hat rises into the scene above the character instead of shrinking it.
 */
export function paintMascot(
  buffer: { data: Uint8ClampedArray; width: number; height: number },
  look: MascotLook,
  pose: MascotPose,
  ox: number,
  oy: number,
  size: number,
  dark: boolean,
  frame: MascotFrame = mascotFrame(look),
  /** False for a face shown small and smoothed, where the Bayer pattern reads as dust. */
  dither = size >= 32,
) {
  const cell = frame.span / size;
  const hit = SCRATCH;
  for (let j = 0; j < size; j += 1) {
    const py = oy + j;
    if (py < 0 || py >= buffer.height) continue;
    for (let i = 0; i < size; i += 1) {
      const px = ox + i;
      if (px < 0 || px >= buffer.width) continue;
      const ink = sampleMascot(look, pose, (i + 0.5) * cell + frame.left, (j + 0.5) * cell + frame.top, cell, px, py, dither, hit);
      if (!ink) continue;
      const [r, g, b] = inkColor(look, pose, ink, px, py, dark, hit);
      const k = (py * buffer.width + px) * 4;
      buffer.data[k] = r;
      buffer.data[k + 1] = g;
      buffer.data[k + 2] = b;
      buffer.data[k + 3] = 255;
    }
  }
}

/**
 * How many cells across a face gets at a given CSS size, always a whole number of device
 * pixels per cell so nothing is resampled. Two cells per CSS pixel up to 32px, which is
 * one per device pixel on a retina screen and leaves room for pupils in the top bar; one
 * per CSS pixel above that, so a 96px profile face is 96 cells and as sharp as the
 * screen. It was "about one per pixel, capped at 56" until the profile was seen to look
 * soft: 56 cells over 96 pixels is 1.7 pixels a cell, and that blurs.
 */
export function mascotGrid(size: number) {
  const px = Math.round(size);
  return px <= 32 ? Math.max(24, px * 2) : Math.min(128, px);
}

function toHex([r, g, b]: Rgb) {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

const pathCache = new Map<string, { fill: string; d: string }[]>();

/**
 * The still character as SVG paths, one per colour, each a run-length list of
 * one-cell-tall rectangles in a `0 0 size size` box covering `mascotFrame(look)`.
 * Memoised: the same creator is drawn on every card they have.
 *
 * `pose` draws one frame of the live face instead of the still one, for a face that
 * animates by stepping between a few drawn frames in CSS (the estate chat's faces blink
 * that way, on the compositor, so a busy chat costs the page no frames of its own).
 */
export function mascotPaths(look: MascotLook, size: number, dark: boolean, pose: MascotPose = STILL_POSE): { fill: string; d: string }[] {
  const posed = pose === STILL_POSE ? "" : `/${Object.values(pose).join(",")}`;
  const key = `${formatMascot(look)}/${size}/${dark ? 1 : 0}${posed}`;
  const cached = pathCache.get(key);
  if (cached) {
    pathCache.delete(key);
    pathCache.set(key, cached);
    return cached;
  }
  const frame = mascotFrame(look);
  const cell = frame.span / size;
  const dither = size >= 32;
  const hit = mascotSurface();
  const runs = new Map<string, string>();
  for (let j = 0; j < size; j += 1) {
    let start = 0;
    let current: string | null = null;
    const flush = (end: number) => {
      if (current !== null && end > start) runs.set(current, `${runs.get(current) ?? ""}M${start} ${j}h${end - start}v1h-${end - start}z`);
    };
    for (let i = 0; i <= size; i += 1) {
      let fill: string | null = null;
      if (i < size) {
        const ink = sampleMascot(look, pose, (i + 0.5) * cell + frame.left, (j + 0.5) * cell + frame.top, cell, i, j, dither, hit);
        fill = ink ? toHex(inkColor(look, pose, ink, i, j, dark, hit)) : null;
      }
      if (fill !== current) {
        flush(i);
        current = fill;
        start = i;
      }
    }
  }
  const paths = [...runs].map(([fill, d]) => ({ fill, d }));
  /* Oldest first out, so a picker paging through looks keeps the ones it just drew. A
     Map iterates in insertion order, which is all an LRU this small needs. */
  if (pathCache.size >= 1500) pathCache.delete(pathCache.keys().next().value as string);
  pathCache.set(key, paths);
  return paths;
}

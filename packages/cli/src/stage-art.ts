import { inkColor, mascotSurface, sampleMascot, type MascotColorId, type MascotFrame, type MascotLook, type MascotPose } from "@opengame/ui/mascot-art";

/**
 * What the corner draws around the character, and how it keeps the pixels clean.
 *
 * The ask, 8 Oct 2026, on a recording where the shuffle worked: RGB confetti and sparkles
 * around the character as it animates between characters, smoother morphing, and very
 * clean pixels. Each of those had a cause
 * that could be named:
 *
 * - The colour change was the site's 8x8 dither dissolve. On a 28-cell face it read as
 *   static for half a second rather than as a texture. Here it is a wipe from the top left,
 *   where the light comes from, with a seam of sparks riding its front.
 * - The morph ran 380 ms, eleven frames at thirty a second. It runs 760 here, eased, at
 *   sixty frames while anything moves.
 * - The breath squashes the body by a percent or two and the lean tips it by a few
 *   hundredths of a radian. On a canvas that is life; on twenty-eight cells it moved edge
 *   cells in and out by a fraction, so the silhouette crawled. At rest the terminal keeps
 *   the body square and level, and only a hop squashes it.
 * - The gaze glides, so a pupil spent most of its time between cells and came out as the
 *   jagged half-pupil of the cyclops in that day's screenshot. Here the gaze moves in steps,
 *   as a pixel artist would draw it: thirds of the way, and the face's turn in quarters.
 *
 * None of this changes the shared driver or the renderer; the stage asks them for a frame
 * and then decides how to show it.
 */

export type Rgb = readonly [number, number, number];

/** Cells beside and above the face, for sparks to fly into and a hop to rise into. */
export const SIDE = 4;
export const TOP = 4;

/** How long a change of character takes, from one face to the next. */
export const CHANGE_MS = 760;

export function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const snap = (value: number, step: number) => Math.round(value / step) * step;

/** The driver's frame, made to sit on the grid: square and level at rest, eyes in steps. */
export function cleanPose(pose: MascotPose): MascotPose {
  const hopping = pose.lift > 0.004 || Math.abs(pose.squashY - 1) > 0.03 || Math.abs(pose.squashX - 1) > 0.03;
  return {
    ...pose,
    squashX: hopping ? pose.squashX : 1,
    squashY: hopping ? pose.squashY : 1,
    tilt: 0,
    wobble: 0,
    lookX: snap(pose.lookX, 1 / 3),
    lookY: snap(pose.lookY, 1 / 3),
    turnX: snap(pose.turnX, 0.25),
    turnY: snap(pose.turnY, 0.25),
  };
}

/** A change from one character to another, and when it started. */
export interface Change { from: MascotLook; at: number }

/** Where a change has got to: the morph in the pose, and the wipe's front from 0 to 1. */
export function applyChange(pose: MascotPose, look: MascotLook, change: Change | null, now: number) {
  const progress = change ? Math.min(1, Math.max(0, (now - change.at) / CHANGE_MS)) : 1;
  const eased = easeInOut(progress);
  const moving = change !== null && progress < 1;
  const next: MascotPose = {
    ...pose,
    fromShape: moving && change.from.shape !== look.shape ? change.from.shape : null,
    morph: moving ? eased : 1,
    // The dither dissolve is off: the wipe below does the colour.
    fromColor: null,
    dissolve: 1,
  };
  const wipe = moving && change.from.color !== look.color ? { from: change.from.color, front: eased } : null;
  return { pose: next, wipe, moving };
}

export interface Wipe { from: MascotColorId; front: number }

/** The wipe's diagonal coordinate for a cell, 0 at the top left and 1 at the bottom right. */
export function diagonal(i: number, j: number, columns: number, rows: number) {
  return (i + j) / (columns + rows - 2);
}

/* Every eye in the corner is a white eye with a black pupil, whatever the body's colour.
   The same brief, 8 Oct 2026: black dot pupils on all of them, white filled eyes with black
   pupils. The renderer chooses an eye's inks from the body, which on a pale
   body gave dark whites and on most colours left the pupil a shade of the body; here the
   two inks are fixed, and the corner only draws eye styles that have both. */
const EYE_WHITE: Rgb = [250, 250, 247];
const PUPIL: Rgb = [16, 16, 18];
function eyeInk(ink: string): Rgb | null {
  if (ink === "sclera" || ink === "mark.sclera" || ink === "plastic") return EYE_WHITE;
  if (ink === "pupil" || ink === "mark.pupil" || ink === "bead") return PUPIL;
  return null;
}

/** The face with its margins, as a grid of colours, null where nothing is drawn. */
export function stageCells(look: MascotLook, pose: MascotPose, frame: MascotFrame, dark: boolean, faceColumns: number, wipe: Wipe | null): (Rgb | null)[][] {
  const columns = faceColumns + SIDE * 2;
  const rows = faceColumns + TOP;
  const cell = frame.span / faceColumns;
  const hit = mascotSurface();
  const before = wipe ? { ...look, color: wipe.from } : look;
  const grid: (Rgb | null)[][] = [];
  for (let j = 0; j < rows; j += 1) {
    const row: (Rgb | null)[] = [];
    for (let i = 0; i < columns; i += 1) {
      const ink = sampleMascot(look, pose, (i - SIDE + 0.5) * cell + frame.left, (j - TOP + 0.5) * cell + frame.top, cell, i, j, false, hit);
      if (!ink) { row.push(null); continue; }
      const eye = eyeInk(ink);
      if (eye) { row.push(eye); continue; }
      const painted = wipe && diagonal(i, j, columns, rows) >= wipe.front ? before : look;
      row.push(inkColor(painted, pose, ink, i, j, dark, hit));
    }
    grid.push(row);
  }
  return grid;
}

/* --------------------------------------------------------------------------------------- *
 * Sparks
 * --------------------------------------------------------------------------------------- */

/** One spark: where it is in cells, how it moves in cells a second, and its colour's hue. */
export interface Spark { x: number; y: number; vx: number; vy: number; born: number; life: number; hue: number; big: boolean }

const GRAVITY = 26;

/** A ring of sparks thrown out from the silhouette when the character changes. A cheer,
 * for something that went right, throws more of them higher. */
export function burst(sparks: Spark[], cx: number, cy: number, radius: number, now: number, cheer = false, random = Math.random) {
  const count = cheer ? 34 : 20;
  const hue = random() * 360;
  for (let n = 0; n < count; n += 1) {
    const angle = (n / count) * Math.PI * 2 + random() * 0.4;
    const speed = (cheer ? 16 : 11) + random() * (cheer ? 14 : 9);
    sparks.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.92,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (cheer ? 14 : 6),
      born: now,
      life: (cheer ? 700 : 520) + random() * (cheer ? 600 : 420),
      hue: (hue + n * (360 / count)) % 360,
      big: random() < 0.35,
    });
  }
}

/** A few sparks on the wipe's front, so the new colour arrives with a glint along its edge. */
export function glint(sparks: Spark[], front: number, columns: number, rows: number, now: number, random = Math.random) {
  const along = front * (columns + rows - 2);
  for (let n = 0; n < 2; n += 1) {
    const i = SIDE + random() * (columns - SIDE * 2);
    const j = along - i;
    if (j < TOP - 1 || j > rows - 1) continue;
    sparks.push({ x: i, y: j, vx: (random() - 0.5) * 6, vy: -2 - random() * 5, born: now, life: 260 + random() * 260, hue: random() * 360, big: random() < 0.25 });
  }
}

/** Move every spark to `now` and let go of the ones whose time is up. */
export function stepSparks(sparks: Spark[], now: number, seconds: number) {
  for (let n = sparks.length - 1; n >= 0; n -= 1) {
    const spark = sparks[n]!;
    if (now - spark.born >= spark.life) { sparks.splice(n, 1); continue; }
    spark.vy += GRAVITY * seconds;
    spark.vx *= 1 - 1.6 * seconds;
    spark.x += spark.vx * seconds;
    spark.y += spark.vy * seconds;
  }
}

function hsl(hue: number, light: number): Rgb {
  const h = ((hue % 360) + 360) % 360 / 60;
  const c = (1 - Math.abs(2 * light - 1));
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = light - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Sparks onto the grid, over the face. A big one is a four-point star for the first part of
 * its life and a single pixel after; every spark twinkles for its last fifth, and its hue
 * turns as it flies, which is the RGB. Nothing is faded toward a background colour: the
 * terminal's own background is unknown, so a spark ends by going out, not by dimming.
 */
export function drawSparks(grid: (Rgb | null)[][], sparks: Spark[], now: number) {
  const rows = grid.length;
  const columns = grid[0]?.length ?? 0;
  const put = (x: number, y: number, rgb: Rgb) => { if (x >= 0 && y >= 0 && x < columns && y < rows) grid[y]![x] = rgb; };
  for (const spark of sparks) {
    const age = (now - spark.born) / spark.life;
    if (age > 0.8 && Math.floor((now - spark.born) / 50) % 2) continue;
    const x = Math.round(spark.x);
    const y = Math.round(spark.y);
    const hue = spark.hue + (now - spark.born) * 0.35;
    put(x, y, hsl(hue, 0.72));
    if (spark.big && age < 0.45) {
      const arm = hsl(hue + 25, 0.58);
      put(x - 1, y, arm); put(x + 1, y, arm); put(x, y - 1, arm); put(x, y + 1, arm);
    }
  }
}

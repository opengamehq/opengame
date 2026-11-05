/**
 * The eyes: every style, drawn in body space on top of the body by `sampleEyes`.
 *
 * See CONTRIBUTING.md in this folder before adding one. Ids are stored in rows and URLs,
 * so an id is never renamed or removed. The order is the picker's and may change.
 */

import type { MascotLook } from "./look";
import type { MascotInk, MascotPose } from "./render";
import { faceAnchor } from "./shapes";
import {
  arc, ellipse, heart, length, sdCapsule, sdCone, sdEllipse, sdHexagon, sdPoly, sdRoundBox,
  sdTiltEllipse, sdTriangle, segment, star,
} from "./geometry";

export const MASCOT_EYES = [
  { id: "classic", label: "Classic" },
  { id: "sparkle", label: "Sparkle" },
  { id: "wink", label: "Wink" },
  { id: "happy", label: "Happy" },
  { id: "calm", label: "Calm" },
  { id: "angry", label: "Angry" },
  { id: "sad", label: "Sad" },
  { id: "sleepy", label: "Sleepy" },
  { id: "squint", label: "Squint" },
  { id: "wide", label: "Wide" },
  { id: "dots", label: "Dots" },
  { id: "cyclops", label: "One eye" },
  { id: "hearts", label: "Hearts" },
  { id: "stars", label: "Stars" },
  { id: "dazed", label: "Dazed" },
  { id: "glasses", label: "Glasses" },
  { id: "lashes", label: "Lashes" },
  { id: "googly", label: "Googly" },
  { id: "dizzy", label: "Dizzy" },
  { id: "crying", label: "Crying" },
  { id: "excited", label: "Excited" },
  { id: "sideeye", label: "Side eye" },
  { id: "visor", label: "Visor" },
  { id: "square", label: "Square" },
  { id: "monocle", label: "Monocle" },
  { id: "anime", label: "Anime" },
  { id: "pleading", label: "Pleading" },
  { id: "ovals", label: "Ovals" },
  { id: "mismatched", label: "Mismatched" },
  { id: "brows", label: "Brows" },
  { id: "worried", label: "Worried" },
  { id: "raised", label: "Raised brow" },
  { id: "furious", label: "Furious" },
  { id: "shocked", label: "Shocked" },
  { id: "sly", label: "Sly" },
  { id: "slit", label: "Slit" },
  { id: "starstruck", label: "Starstruck" },
  { id: "smitten", label: "Smitten" },
  { id: "diamond", label: "Diamond" },
  { id: "hollow", label: "Hollow" },
  { id: "plus", label: "Plus" },
  { id: "twinkle", label: "Twinkle" },
  { id: "target", label: "Target" },
  { id: "hypno", label: "Hypno" },
  { id: "button", label: "Button" },
  { id: "goggles", label: "Goggles" },
  { id: "shades", label: "Shades" },
  { id: "pirate", label: "Pirate" },
  { id: "blush", label: "Blush" },
  { id: "nervous", label: "Nervous" },
  { id: "crosseyed", label: "Cross-eyed" },
  { id: "daydream", label: "Daydream" },
  { id: "peeking", label: "Peeking" },
  { id: "ringed", label: "Ringed" },
  { id: "tired", label: "Tired" },
  { id: "annoyed", label: "Annoyed" },
  { id: "skeptic", label: "Skeptical" },
  { id: "dreamy", label: "Dreamy" },
  { id: "flirty", label: "Flirty" },
  { id: "demure", label: "Demure" },
  { id: "snooze", label: "Snooze" },
  { id: "sobbing", label: "Sobbing" },
  { id: "humming", label: "Humming" },
  { id: "puzzled", label: "Puzzled" },
  { id: "alert", label: "Alert" },
  { id: "unibrow", label: "Unibrow" },
  { id: "freckles", label: "Freckles" },
  { id: "whiskers", label: "Whiskers" },
  { id: "glitter", label: "Glitter" },
  { id: "bow", label: "Bow" },
  { id: "scar", label: "Scar" },
  { id: "bandage", label: "Bandage" },
  { id: "cyborg", label: "Cyborg" },
  { id: "triclops", label: "Three eyes" },
  { id: "quad", label: "Four eyes" },
  { id: "aviators", label: "Aviators" },
  { id: "heartshades", label: "Heart shades" },
  { id: "mask", label: "Mask" },
  { id: "winged", label: "Winged" },
  { id: "goat", label: "Goat" },
  { id: "keyhole", label: "Keyhole" },
  { id: "scanline", label: "Scanlines" },
  { id: "glowing", label: "Glowing" },
  { id: "blocks", label: "Blocks" },
  { id: "triangle", label: "Triangle" },
  { id: "hexagon", label: "Hexagon" },
  { id: "deadpan", label: "Deadpan" },
  { id: "disapprove", label: "Disapproving" },
  { id: "wavy", label: "Wavy" },
  { id: "frazzled", label: "Frazzled" },
  { id: "money", label: "Money" },
  { id: "bolt", label: "Lightning" },
  { id: "fiery", label: "Fiery" },
  { id: "flowers", label: "Flowers" },
  { id: "moons", label: "Moons" },
  { id: "sunny", label: "Sunny" },
  { id: "gears", label: "Gears" },
  { id: "spades", label: "Spades" },
  { id: "paws", label: "Paws" },
  { id: "chomp", label: "Chomp" },
  { id: "openhearts", label: "Heart outlines" },
  { id: "pinpoint", label: "Pinpoint" },
  { id: "crosspupil", label: "Cross pupils" },
  { id: "bloodshot", label: "Bloodshot" },
  { id: "doll", label: "Doll" },
  { id: "walleyed", label: "Wall-eyed" },
  { id: "starwink", label: "Starry wink" },
  { id: "determined", label: "Determined" },
  { id: "smug", label: "Smug" },
  { id: "woozy", label: "Woozy" },
  { id: "flustered", label: "Flustered" },
  { id: "joyful", label: "Tears of joy" },
  { id: "sweaty", label: "Sweating" },
  { id: "crush", label: "Crush" },
  { id: "idea", label: "Idea" },
  { id: "clown", label: "Clown" },
  { id: "warpaint", label: "War paint" },
  { id: "stitched", label: "Stitched" },
  { id: "ellipsis", label: "Speechless" },
  { id: "questions", label: "Question marks" },
  { id: "exclaim", label: "Exclamation" },
  { id: "notes", label: "Notes" },
  { id: "clubs", label: "Clubs" },
  { id: "shields", label: "Shields" },
  { id: "checks", label: "Checks" },
  { id: "hourglass", label: "Hourglass" },
  { id: "dshape", label: "D-shape" },
  { id: "teardrop", label: "Teardrop" },
  { id: "droopy", label: "Droopy" },
  { id: "catseye", label: "Cat’s eye" },
  { id: "squircle", label: "Squircle" },
  { id: "owl", label: "Owl" },
  { id: "bug", label: "Bug eyes" },
  { id: "spider", label: "Spider" },
  { id: "outline", label: "Outlined" },
  { id: "wideset", label: "Wide-set" },
  { id: "closeset", label: "Close-set" },
  { id: "led", label: "LED" },
  { id: "scanner", label: "Scanner" },
  { id: "reticle", label: "Reticle" },
  { id: "vr", label: "VR headset" },
  { id: "threed", label: "3D glasses" },
  { id: "ski", label: "Ski goggles" },
  { id: "sleepmask", label: "Sleep mask" },
  { id: "starglasses", label: "Star glasses" },
  { id: "magnify", label: "Magnifier" },
  { id: "catglasses", label: "Cat-eye glasses" },
  { id: "readers", label: "Reading glasses" },
  { id: "disguise", label: "Disguise" },
  { id: "pause", label: "Pause" },
  { id: "equalizer", label: "Equalizer" },
  { id: "prompt", label: "Prompt" },
  { id: "cursor", label: "Cursors" },
  { id: "laser", label: "Laser" },
  { id: "power", label: "Power" },
  { id: "snowflake", label: "Snowflakes" },
  { id: "crinkled", label: "Crinkled" },
  { id: "dice", label: "Dice" },
  { id: "saucers", label: "Saucer eyes" },
  { id: "specs", label: "Glasses and eyes" },
  { id: "roundspecs", label: "Round glasses" },
] as const;

export type MascotEyesId = (typeof MASCOT_EYES)[number]["id"];

/**
 * How far above the face's centre any eye style draws, in face units (`FACE[shape].s`),
 * brows, tears, glyphs, straps and glasses included: measured at 0.65 on 6 Oct 2026
 * (Raised brow, Pirate's strap and Snooze's Z), and `mascot-lookalike.test.ts` fails if a
 * style ever reaches past it.
 *
 * It used to set the line below which no accessory drew inside the body. Accessories now
 * draw over the body and under the eyes, so a hat never covers an eye whatever this says,
 * but eye ink is drawn over the hat wherever the two meet. Keeping the marks low is what
 * keeps a brow from printing across a brim, so it is still a contract with every style.
 */
export const EYE_REACH = 0.7;

/*
 * Small marks that sit beside a face rather than in it: a Z, a question mark, an
 * exclamation mark, a note, the anger mark. Each is a distance, under 0 inside, `h` tall
 * from its middle and `w` half a stroke wide.
 */

function glyphZ(x: number, y: number, cx: number, cy: number, h: number, w: number) {
  return Math.min(
    segment(x, y, cx - h, cy - h, cx + h, cy - h),
    segment(x, y, cx + h, cy - h, cx - h, cy + h),
    segment(x, y, cx - h, cy + h, cx + h, cy + h),
  ) - w;
}

function glyphQuestion(x: number, y: number, cx: number, cy: number, h: number, w: number) {
  // The hook is a circle with its lower left quarter left out, then a short drop and a dot.
  const r = h * 0.45;
  const ay = cy - h * 0.5;
  const dx = x - cx, dy = y - ay;
  const hook = dx < 0 && dy > 0 ? Infinity : Math.abs(length(dx, dy) - r);
  return Math.min(Math.min(hook, segment(x, y, cx, ay + r, cx, cy + h * 0.3)) - w, length(x - cx, y - cy - h * 0.78) - w * 1.3);
}

function glyphBang(x: number, y: number, cx: number, cy: number, h: number, w: number) {
  return Math.min(sdCone(x, y, cx, cy + h * 0.35, w * 0.8, cx, cy - h, w * 1.5), length(x - cx, y - cy - h * 0.82) - w * 1.3);
}

function glyphNote(x: number, y: number, cx: number, cy: number, h: number, w: number) {
  const head = sdTiltEllipse(x, y, cx, cy + h * 0.62, h * 0.3, h * 0.21, -0.35);
  const stem = segment(x, y, cx + h * 0.26, cy + h * 0.56, cx + h * 0.26, cy - h * 0.7) - w;
  const flag = segment(x, y, cx + h * 0.26, cy - h * 0.7, cx + h * 0.62, cy - h * 0.3) - w;
  return Math.min(head, stem, flag);
}

/** Four quarter-circles bowing in toward a middle: the cross-popping vein of a comic. */
function glyphVein(x: number, y: number, cx: number, cy: number, r: number, w: number) {
  let d = Infinity;
  for (const qx of [-1, 1]) {
    for (const qy of [-1, 1]) {
      const ox = cx + qx * r, oy = cy + qy * r;
      if ((x - ox) * qx > 0 || (y - oy) * qy > 0) continue;
      d = Math.min(d, Math.abs(length(x - ox, y - oy) - r * 0.6) - w);
    }
  }
  return d;
}

type EyeCenter = { cx: number; cy: number; side: number; k: number };

function eyeCenters(style: MascotEyesId, fx: number, fy: number, s: number, w: number): EyeCenter[] {
  if (style === "saucers") return [
    { cx: fx - (0.21 * w + 0.08) * s, cy: fy - 0.12 * s, side: -1, k: 1 },
    { cx: fx + (0.21 * w + 0.08) * s, cy: fy - 0.12 * s, side: 1, k: 1 },
  ];
  return style === "cyclops"
    ? [{ cx: fx, cy: fy - 0.12 * s, side: 0, k: 1 }]
    : style === "triclops"
      ? [
          { cx: fx - 0.31 * s * w, cy: fy - 0.1 * s, side: -1, k: 0.66 },
          { cx: fx, cy: fy - 0.15 * s, side: 0, k: 0.74 },
          { cx: fx + 0.31 * s * w, cy: fy - 0.12 * s, side: 1, k: 0.66 },
        ]
      : style === "quad"
        ? [
            { cx: fx - 0.16 * s * w, cy: fy - 0.28 * s, side: -1, k: 0.5 },
            { cx: fx + 0.16 * s * w, cy: fy - 0.3 * s, side: 1, k: 0.5 },
            { cx: fx - 0.16 * s * w, cy: fy + 0.06 * s, side: -1, k: 0.5 },
            { cx: fx + 0.16 * s * w, cy: fy + 0.04 * s, side: 1, k: 0.5 },
          ]
        : [
            { cx: fx - 0.21 * s * w, cy: fy - 0.12 * s, side: -1, k: 1 },
            { cx: fx + 0.21 * s * w, cy: fy - 0.15 * s, side: 1, k: 1 },
          ];
}

type Lash = { x: number; y: number; tipX: number; tipY: number; width: number };
let lashCache: { shape: MascotLook["shape"]; eyes: MascotEyesId; cell: number; pose: MascotPose; lashes: Lash[] } | null = null;

/**
 * Lash roots follow the actual ink, including closed lids, glasses and multi-eye faces.
 * Sampling the contour once per pose keeps the per-pixel renderer inexpensive. A single
 * cached pose is enough: tiles, SVGs and 3D face maps each paint one face at a time.
 * Existing eye ink wins, so lashes never replace a pupil or change an expression.
 */
export function sampleEyes(look: MascotLook, pose: MascotPose, x: number, y: number, cell: number): MascotInk | null {
  const ink = sampleBareEyes(look, pose, x, y, cell);
  if (ink || look.identity !== "female") return ink;
  const previous = lashCache;
  if (!previous || previous.shape !== look.shape || previous.eyes !== look.eyes || previous.cell !== cell ||
      previous.pose.blink !== pose.blink || previous.pose.turnX !== pose.turnX || previous.pose.turnY !== pose.turnY ||
      previous.pose.lookX !== pose.lookX || previous.pose.lookY !== pose.lookY || previous.pose.wobble !== pose.wobble ||
      previous.pose.fromShape !== pose.fromShape || previous.pose.morph !== pose.morph) {
    lashCache = { shape: look.shape, eyes: look.eyes, cell, pose: { ...pose }, lashes: makeLashes(look, pose, cell) };
  }
  for (const lash of lashCache!.lashes) {
    if (segment(x, y, lash.x, lash.y, lash.tipX, lash.tipY) < lash.width) return "sclera";
  }
  return null;
}

function makeLashes(look: MascotLook, pose: MascotPose, cell: number): Lash[] {
  const face = faceAnchor(look, pose);
  const fx = face.x + pose.turnX * 0.11, fy = face.y + pose.turnY * 0.07;
  const lashes: Lash[] = [];
  for (const eye of eyeCenters(look.eyes, fx, fy, face.s, face.w)) {
    const scale = face.s * eye.k;
    for (const side of eye.side === 0 ? [-1, 1] : [eye.side]) {
      for (let i = 0; i < 3; i++) {
        let root: { x: number; y: number } | null = null;
        // Search inward when a narrow or tilted lid does not reach the outer column.
        for (let inset = 0; inset < 5 && !root; inset++) {
          const x = eye.cx + side * (0.08 + i * 0.055 - inset * 0.025) * scale;
          for (let step = 0; step <= 48; step++) {
            const y = eye.cy + (-0.28 + step * 0.01) * scale;
            if (sampleBareEyes(look, pose, x, y, cell)) { root = { x, y }; break; }
          }
        }
        if (!root) continue;
        const width = Math.max(0.016 * scale, cell * 0.42);
        lashes.push({ x: root.x, y: root.y + width * 0.4,
          tipX: root.x + side * (0.025 + i * 0.026) * scale,
          tipY: Math.max(fy - EYE_REACH * face.s + width, root.y - (0.12 - i * 0.014) * scale), width });
      }
    }
  }
  return lashes;
}

/** Eyes, in body space. Returns the ink or null when the cell is plain body. */
function sampleBareEyes(look: MascotLook, pose: MascotPose, x: number, y: number, cell: number): MascotInk | null {
  const face = faceAnchor(look, pose);
  const s = face.s;
  const shiftX = pose.turnX * 0.11;
  const shiftY = pose.turnY * 0.07;
  const style = look.eyes;
  const fx = face.x + shiftX;
  const fy = face.y + shiftY;
  /* `k` shrinks a classic eye, for the faces with more than two: three in a row, or four
     in a square. */
  const eyes = eyeCenters(style, fx, fy, s, face.w);
  const open = Math.max(0.12, 1 - pose.blink);
  const lean = style === "cyclops" ? 0 : 0.26;
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  const stroke = Math.max(0.045, cell * 0.55);
  /* Under about twenty-four cells a pupil inside an eye three cells wide breaks it into
     two marks that read as punctuation, so the smallest faces get solid eyes: the
     favicon's answer. Everything the product draws is above that now (see `mascotGrid`). */
  const tiny = cell > 0.084;

  if (LATER_EYES.has(style)) {
    return sampleLaterEyes(style, { pose, x, y, cell, s, w: face.w, fx, fy, open, cos, sin, stroke, tiny }, eyes);
  }

  // Visor: one band across the face, with a light that scans toward where it looks.
  if (style === "visor") {
    const vy = (eyes[0].cy + eyes[1].cy) / 2;
    const vx = face.x + shiftX;
    if (sdRoundBox(x - vx, y - vy, 0.38 * s, Math.max(0.09 * s * open, cell * 0.8), 0.08 * s) >= 0) return null;
    if (!tiny && sdRoundBox(x - vx - pose.lookX * 0.24 * s, y - vy, 0.07 * s, 0.05 * s * open + cell * 0.2, 0.02 * s) < 0) return "pupil";
    return "sclera";
  }

  // Goggles: thick round frames, a strap across the whole face, small eyes inside.
  if (style === "goggles") {
    const strapY = (eyes[0].cy + eyes[1].cy) / 2;
    const rim = 0.18 * s;
    for (const { cx, cy } of eyes) {
      const r = Math.hypot(x - cx, y - cy);
      if (Math.abs(r - rim) < stroke * 0.95) return "sclera";
      if (r < rim) {
        if (ellipse(x, y, cx, cy + 0.01 * s, 0.075 * s, Math.max(0.1 * s * open, cell * 0.6), 1, 0) >= 1) return null;
        if (tiny) return "sclera";
        return length(x - cx - pose.lookX * 0.03 * s, y - cy - pose.lookY * 0.04 * s) < Math.max(0.045 * s, cell * 0.7) ? "pupil" : "sclera";
      }
    }
    return Math.abs(y - strapY) < stroke * 0.8 ? "sclera" : null;
  }

  // Shades: filled lenses in the eye colour, a bridge, and a glint across each.
  if (style === "shades") {
    const [l, r] = eyes;
    const bridgeY = (l.cy + r.cy) / 2 - 0.04 * s;
    if (x > l.cx + 0.14 * s && x < r.cx - 0.14 * s && Math.abs(y - bridgeY) < stroke * 0.7) return "sclera";
    for (const { cx, cy } of eyes) {
      if (sdRoundBox(x - cx, y - cy + 0.02 * s, 0.17 * s, 0.12 * s, 0.07 * s) >= 0) continue;
      if (!tiny && Math.abs(x - cx + (y - cy) + 0.05 * s) < Math.max(0.022 * s, cell * 0.55)) return "pupil";
      return "sclera";
    }
    return null;
  }

  // Aviators: lenses flat along the top and full at the outer bottom, a double bridge.
  if (style === "aviators") {
    const [l, r] = eyes;
    if (segment(x, y, l.cx + 0.1 * s, l.cy - 0.09 * s, r.cx - 0.1 * s, r.cy - 0.09 * s) < stroke * 0.55) return "sclera";
    for (const { cx, cy, side } of eyes) {
      const inner = ((x - cx) * -side + (y - cy)) * Math.SQRT1_2 - 0.13 * s;
      const lens = Math.max(sdEllipse(x - cx - side * 0.015 * s, y - cy - 0.03 * s, 0.17 * s, 0.16 * s), cy - 0.09 * s - y, inner);
      if (lens >= 0) continue;
      if (!tiny && length(x - cx + side * 0.06 * s, y - cy + 0.01 * s) < Math.max(0.032 * s, cell * 0.7)) return "pupil";
      return "sclera";
    }
    return null;
  }

  // Heart shades: the same idea as Shades with heart lenses.
  if (style === "heartshades") {
    const [l, r] = eyes;
    if (segment(x, y, l.cx + 0.12 * s, l.cy - 0.07 * s, r.cx - 0.12 * s, r.cy - 0.07 * s) < stroke * 0.55) return "sclera";
    for (const { cx, cy } of eyes) {
      if (heart(x - cx, y - cy, 0.32 * s) >= 0) continue;
      if (!tiny && y < cy && Math.abs(x - cx + (y - cy) + 0.07 * s) < Math.max(0.018 * s, cell * 0.5)) return "pupil";
      return "sclera";
    }
    return null;
  }

  // Mask: a domino band in the eye colour, the body showing through two holes.
  if (style === "mask") {
    const [l, r] = eyes;
    const band = Math.min(
      sdCone(x, y, l.cx, l.cy, 0.17 * s, l.cx - 0.22 * s, l.cy - 0.08 * s, 0.04 * s),
      sdCone(x, y, r.cx, r.cy, 0.17 * s, r.cx + 0.22 * s, r.cy - 0.08 * s, 0.04 * s),
      sdCapsule(x, y, l.cx, l.cy - 0.03 * s, r.cx, r.cy - 0.03 * s, 0.11 * s),
    );
    if (band >= 0) return null;
    for (const { cx, cy } of eyes) {
      if (ellipse(x, y, cx, cy + 0.01 * s, 0.085 * s, Math.max(0.095 * s * open, cell * 0.6), cos, sin) >= 1) continue;
      if (tiny) return null;
      return length(x - cx - pose.lookX * 0.03 * s, y - cy - (0.02 + pose.lookY * 0.02) * s) < Math.max(0.035 * s, cell * 0.65) ? "sclera" : null;
    }
    return "sclera";
  }

  /* Marks that belong to the face rather than to either eye: they are drawn first and the
     eyes are drawn after them in the usual way. All of them sit up and to the right, where
     Nervous puts its bead of sweat, which is the one place every body has room. */
  if (eyes.length === 2) {
    const [l, r] = eyes;
    const mx = r.cx + 0.3 * s;
    const my = r.cy - 0.3 * s;
    const bob = Math.sin(pose.wobble * 2.2) * 0.02 * s;
    const w = stroke * 0.5;
    if (style === "unibrow") {
      const span = (r.cx - l.cx) / 2 + 0.14 * s;
      const mid = (l.cx + r.cx) / 2;
      if (Math.abs(x - mid) < span) {
        const by = (l.cy + r.cy) / 2 - 0.38 * s - 0.035 * s * Math.cos(((x - l.cx) / (r.cx - l.cx)) * Math.PI * 2);
        if (Math.abs(y - by) < stroke * 0.8) return "sclera";
      }
    }
    if (style === "snooze" && Math.min(glyphZ(x, y, mx - 0.02 * s, my + 0.02 * s - bob, 0.06 * s, w), glyphZ(x, y, mx + 0.12 * s, my - 0.15 * s - bob, 0.035 * s, w * 0.8)) < 0) return "sclera";
    if (style === "puzzled" && glyphQuestion(x, y, mx, my - bob, 0.15 * s, w) < 0) return "sclera";
    if (style === "alert" && glyphBang(x, y, mx, my, 0.14 * s, w) < 0) return "sclera";
    if (style === "humming" && glyphNote(x, y, mx, my - bob, 0.13 * s, w) < 0) return "sclera";
    if (style === "annoyed" && glyphVein(x, y, mx, my, 0.1 * s, stroke * 0.6) < 0) return "sclera";
    if (style === "bow") {
      const bx = r.cx + 0.2 * s, by = r.cy - 0.42 * s;
      const loops = Math.min(
        ellipse(x, y, bx - 0.09 * s, by, 0.09 * s, 0.06 * s, Math.cos(0.4), Math.sin(0.4)),
        ellipse(x, y, bx + 0.09 * s, by, 0.09 * s, 0.06 * s, Math.cos(-0.4), Math.sin(-0.4)),
      );
      if (loops < 1) return !tiny && length(x - bx, y - by) < Math.max(0.03 * s, cell * 0.6) ? "pupil" : "sclera";
    }
    if (style === "glitter") {
      // Three four-pointed sparkles round the eyes, breathing out of step.
      const sparkles = [[l.cx, l.cy, -0.25, -0.26, 0.15, 0], [r.cx, r.cy, 0.29, -0.12, 0.12, 2], [r.cx, r.cy, 0.2, 0.33, 0.09, 4]] as const;
      for (const [ex, ey, ox, oy, size, phase] of sparkles) {
        const k = size * s * (0.85 + 0.15 * Math.sin(pose.wobble * 3 + phase));
        if (Math.sqrt(Math.abs(x - ex - ox * s)) + Math.sqrt(Math.abs(y - ey - oy * s)) < Math.sqrt(k)) return "sclera";
      }
    }
  }

  // Glasses: two frames and a bridge, drawn once, with the eyes as dots behind them.
  if (style === "glasses") {
    const [l, r] = eyes;
    const bridgeY = (l.cy + r.cy) / 2 - 0.02 * s;
    if (x > l.cx + 0.15 * s && x < r.cx - 0.15 * s && Math.abs(y - bridgeY) < stroke * 0.7) return "sclera";
  }

  for (const eye of eyes) {
    const { cx, cy, side, k: scale } = eye;

    // Brows, drawn above whichever eye they belong to, before the eye itself.
    const brow = { brows: [0.03, -0.01], worried: [-0.07, 0.03], furious: [0.07, -0.05], raised: side === 1 ? [-0.1, -0.1] : [0.02, 0.02] }[style as string];
    if (brow) {
      const by = cy - 0.38 * s;
      const inner = cx - side * 0.12 * s;
      const outer = cx + side * 0.12 * s;
      if (segment(x, y, inner, by + brow[0] * s, outer, by + brow[1] * s) < stroke * (style === "furious" ? 0.85 : 0.6)) return "sclera";
    }
    if (style === "shocked" && arc(x, y, cx, cy - 0.2 * s, 0.13 * s, stroke * 0.6, true) < 0 && y < cy - 0.26 * s) return "sclera";
    // Blush: three short hatches on each cheek, the manga way, in the eye colour.
    if (style === "blush") {
      const bx = cx + side * 0.05 * s;
      const by = cy + 0.36 * s;
      for (let k = -1; k <= 1; k += 1) {
        const hx = bx + k * 0.07 * s;
        if (segment(x, y, hx - 0.025 * s, by + 0.035 * s, hx + 0.025 * s, by - 0.035 * s) < stroke * 0.45) return "sclera";
      }
    }
    // A bead of sweat at the temple.
    if (style === "nervous" && side === 1) {
      const dx = cx + 0.3 * s;
      const dy = cy - 0.26 * s;
      if (sdCone(x, y, dx, dy + 0.06 * s, 0.065 * s, dx, dy - 0.1 * s, 0.01) < 0) return "sclera";
    }
    // Pirate: a patch where the right eye was, and the strap that holds it.
    if (style === "pirate" && side === 1) {
      if (ellipse(x, y, cx, cy, 0.17 * s, 0.16 * s, 1, 0) < 1) return "sclera";
      if (segment(x, y, cx - 0.1 * s, cy - 0.12 * s, cx - 0.62 * s, cy - 0.48 * s) < stroke * 0.45) return "sclera";
      if (segment(x, y, cx + 0.13 * s, cy - 0.08 * s, cx + 0.62 * s, cy - 0.28 * s) < stroke * 0.45) return "sclera";
      continue;
    }

    // Freckles and whiskers: on the cheek under each eye, in the eye colour like Blush.
    if (style === "freckles") {
      for (const [ox, oy] of [[-0.07, 0.35], [0.03, 0.32], [0.08, 0.41], [-0.02, 0.43]] as const) {
        if (length(x - cx - side * ox * s, y - cy - oy * s) < Math.max(0.022 * s, cell * 0.55)) return "sclera";
      }
    }
    if (style === "whiskers") {
      for (let i = -1; i <= 1; i += 1) {
        const wx = cx + side * 0.13 * s;
        const wy = cy + (0.34 + i * 0.06) * s;
        if (segment(x, y, wx, wy, wx + side * 0.24 * s, wy + (i * 0.07 - 0.02) * s) < stroke * 0.42) return "sclera";
      }
    }
    // Bandage: two strips of plaster crossed over the left eye; the right one is plain.
    if (style === "bandage" && side === -1) {
      for (const a of [0.55, -0.55]) {
        const c = Math.cos(a), n = Math.sin(a), dx = x - cx, dy = y - cy;
        const u = dx * c + dy * n, v = -dx * n + dy * c;
        if (sdRoundBox(u, v, 0.21 * s, 0.062 * s, 0.03 * s) < 0) {
          // The pad in the middle of each strip, a shade darker, so the strips read as plaster.
          return !tiny && Math.abs(u) < 0.07 * s && Math.abs(v) < 0.03 * s && a > 0 ? "pupil" : "sclera";
        }
      }
      continue;
    }
    // Cyborg: the right eye is a plate with a lens in it.
    if (style === "cyborg" && side === 1) {
      if (sdRoundBox(x - cx, y - cy, 0.17 * s, 0.15 * s, 0.05 * s) >= 0) {
        if (segment(x, y, cx + 0.17 * s, cy - 0.04 * s, cx + 0.3 * s, cy - 0.04 * s) < stroke * 0.45) return "sclera";
        continue;
      }
      if (tiny) return "sclera";
      const r = length(x - cx - pose.lookX * 0.02 * s, y - cy - pose.lookY * 0.02 * s);
      return Math.abs(r - 0.085 * s) < stroke * 0.45 || r < Math.max(0.03 * s, cell * 0.6) ? "pupil" : "sclera";
    }

    // Closed arcs: both for happy, the right one for a wink, upside down for calm.
    if (style === "happy" || style === "humming" || ((style === "wink" || style === "flirty") && side === 1)) {
      if (arc(x, y, cx, cy + 0.08 * s, 0.15 * s, stroke, true) < 0) return "sclera";
      continue;
    }
    if (style === "calm") {
      if (arc(x, y, cx, cy - 0.06 * s, 0.14 * s, stroke, false) < 0) return "sclera";
      continue;
    }

    // Demure: Calm with lashes hanging off the lid, down and outward.
    if (style === "demure") {
      if (arc(x, y, cx, cy - 0.06 * s, 0.14 * s, stroke, false) < 0) return "sclera";
      for (let i = 0; i < 3; i += 1) {
        const a = (0.45 + i * 0.42) * side;
        const bx = cx + Math.sin(a) * 0.14 * s;
        const by = cy - 0.06 * s + Math.cos(a) * 0.14 * s;
        if (segment(x, y, bx, by, bx + Math.sin(a) * 0.08 * s, by + Math.cos(a) * 0.08 * s) < stroke * 0.5) return "sclera";
      }
      continue;
    }

    // Snooze: lids shut and drooping toward the outside; the Zs are drawn above.
    if (style === "snooze") {
      if (segment(x, y, cx - side * 0.1 * s, cy + 0.02 * s, cx + side * 0.1 * s, cy + 0.07 * s) < stroke * 0.7) return "sclera";
      continue;
    }

    // Sobbing: shut, and a stream from each that runs down the cheek and ripples.
    if (style === "sobbing") {
      if (arc(x, y, cx, cy - 0.06 * s, 0.13 * s, stroke, false) < 0) return "sclera";
      const sx = cx + side * 0.06 * s + Math.sin(y / s * 30 - pose.wobble * 7) * 0.012 * s;
      if (y > cy + 0.05 * s && y < cy + 0.52 * s && Math.abs(x - sx) < Math.max(0.03 * s, cell * 0.6)) return "sclera";
      continue;
    }

    // Deadpan: two flat bars to each eye, = =.
    if (style === "deadpan") {
      if (Math.abs(x - cx) < 0.12 * s && Math.abs(Math.abs(y - cy) - 0.05 * s * open) < stroke * 0.5) return "sclera";
      continue;
    }

    // Wavy and Frazzled: shut, one in a slow sine and one in a hard zigzag.
    if (style === "wavy") {
      const dx = x - cx;
      if (Math.abs(dx) > 0.14 * s) continue;
      const f = (Math.PI * 1.5) / (0.14 * s);
      const phase = dx * f + pose.wobble * 3;
      const slope = 0.04 * s * f * Math.cos(phase);
      if (Math.abs(y - cy - 0.04 * s * Math.sin(phase)) / Math.sqrt(1 + slope * slope) < stroke * 0.6) return "sclera";
      continue;
    }
    if (style === "frazzled") {
      let d = Infinity;
      for (let i = 0; i < 3; i += 1) {
        const ax = cx + (-0.15 + i * 0.1) * s;
        const ay = cy + (i % 2 ? -0.05 : 0.05) * s * open;
        d = Math.min(d, segment(x, y, ax, ay, ax + 0.1 * s, cy + (i % 2 ? 0.05 : -0.05) * s * open));
      }
      if (d < stroke * 0.6) return "sclera";
      continue;
    }

    /* Shapes in place of eyes. Each is squashed toward its middle by the blink, which is
       what `(y - cy) / open` is doing throughout. */
    const ey = (y - cy) / open;

    if (style === "money") {
      // An S from two bowls, each with a quarter left out, and a bar through it.
      const r = 0.07 * s;
      const dx = x - cx;
      const w = stroke * 0.6;
      const top = !(dx > 0 && ey + r > 0) && Math.abs(length(dx, ey + r) - r) < w;
      const bottom = !(dx < 0 && ey - r < 0) && Math.abs(length(dx, ey - r) - r) < w;
      if (top || bottom || (Math.abs(dx) < w * 0.75 && Math.abs(ey) < 0.21 * s)) return "sclera";
      continue;
    }

    if (style === "bolt") {
      const m = side || 1;
      const d = Math.min(
        segment(x, cy + ey, cx + 0.07 * s * m, cy - 0.19 * s, cx - 0.06 * s * m, cy + 0.02 * s),
        segment(x, cy + ey, cx - 0.06 * s * m, cy + 0.02 * s, cx + 0.06 * s * m, cy - 0.02 * s),
        segment(x, cy + ey, cx + 0.06 * s * m, cy - 0.02 * s, cx - 0.07 * s * m, cy + 0.19 * s),
      );
      if (d < stroke * 0.75) return "sclera";
      continue;
    }

    if (style === "fiery") {
      const f = Math.sin(pose.wobble * 6 + side) * 0.02 * s;
      const yy = cy + ey;
      const flame = Math.min(
        sdCone(x, yy, cx, cy + 0.08 * s, 0.11 * s, cx + f, cy - 0.22 * s, 0.01 * s),
        sdCone(x, yy, cx + side * 0.07 * s, cy + 0.06 * s, 0.06 * s, cx + side * 0.13 * s - f, cy - 0.1 * s, 0.005 * s),
      );
      if (flame >= 0) continue;
      if (tiny) return "sclera";
      return sdCone(x, yy, cx, cy + 0.1 * s, 0.05 * s, cx + f * 0.5, cy - 0.04 * s, 0.005 * s) < 0 ? "pupil" : "sclera";
    }

    if (style === "flowers") {
      const dx = x - cx;
      const r = length(dx, ey);
      if (r < 0.05 * s) return tiny ? "sclera" : "pupil";
      const spin = pose.wobble * 0.6 * (side || 1);
      for (let i = 0; i < 5; i += 1) {
        const a = spin + (i / 5) * Math.PI * 2 - Math.PI / 2;
        if (length(dx - Math.cos(a) * 0.1 * s, ey - Math.sin(a) * 0.1 * s) < 0.07 * s) return "sclera";
      }
      continue;
    }

    if (style === "moons") {
      if (length(x - cx, ey) < 0.15 * s && length(x - cx - 0.08 * s, ey + 0.05 * s) > 0.125 * s) return "sclera";
      continue;
    }

    if (style === "sunny") {
      const dx = x - cx;
      const r = length(dx, ey);
      if (r < 0.07 * s) return "sclera";
      if (r > 0.105 * s && r < 0.165 * s && Math.abs(Math.sin(4 * Math.atan2(ey, dx) + pose.wobble)) * r < stroke * 2.2) return "sclera";
      continue;
    }

    if (style === "gears") {
      const r = length(x - cx, ey);
      const a = Math.atan2(ey, x - cx) + pose.wobble * 1.5 * (side || 1);
      if (r < (Math.cos(a * 8) > 0.05 ? 0.18 * s : 0.14 * s) && r > (tiny ? 0 : 0.055 * s)) return "sclera";
      continue;
    }

    if (style === "spades") {
      const k = 0.5 + 0.5 * open;
      const sy = (y - cy) / k;
      if (heart(x - cx, -(sy + 0.03 * s), 0.25 * s) < 0 || sdCone(x, sy, cx, 0.06 * s, 0.015 * s, cx, 0.15 * s, 0.05 * s) < 0) return "sclera";
      continue;
    }

    if (style === "paws") {
      const dx = x - cx;
      if (sdEllipse(dx, ey - 0.07 * s, 0.1 * s, 0.075 * s) < 0) return "sclera";
      for (const [tx, ty] of [[-0.11, -0.08], [0, -0.13], [0.11, -0.08]] as const) if (length(dx - tx * s, ey - ty * s) < 0.042 * s) return "sclera";
      continue;
    }

    if (style === "chomp") {
      // Facing the middle of the face, mouth opening and shutting on the clock.
      const dx = (x - cx) * -(side || 1);
      if (length(dx, ey) >= 0.15 * s) continue;
      if (Math.abs(Math.atan2(ey, dx)) < 0.75 - 0.6 * Math.abs(Math.sin(pose.wobble * 4))) continue;
      if (!tiny && length(dx + 0.01 * s, ey + 0.08 * s) < Math.max(0.025 * s, cell * 0.6)) return "pupil";
      return "sclera";
    }

    if (style === "disapprove") {
      // ಠ: a flat brow resting on a round eye with the pupil sunk to the bottom of it.
      const dx = x - cx, dy = y - cy;
      if (Math.abs(dy + 0.15 * s) < stroke * 0.6 && Math.abs(dx) < 0.15 * s) return "sclera";
      const r = length(dx, ey);
      if (Math.abs(r - 0.1 * s) < stroke * 0.55 && dy > -0.11 * s) return "sclera";
      if (length(dx, ey - 0.05 * s) < Math.max(0.035 * s, cell * 0.7)) return "sclera";
      continue;
    }

    if (style === "blocks") {
      if (Math.abs(x - cx) < 0.075 * s && Math.abs(y - cy) < Math.max(0.17 * s * open, cell * 0.6)) return "sclera";
      continue;
    }

    if (style === "triangle" || style === "hexagon") {
      const shape = style === "triangle" ? sdTriangle(x - cx, ey - 0.03 * s, 0.15 * s) - 0.02 * s : sdHexagon(ey / 1.3, x - cx, 0.13 * s) - 0.01 * s;
      if (shape >= 0) continue;
      if (tiny) return "sclera";
      const py = style === "triangle" ? 0.06 * s : pose.lookY * 0.04 * s;
      return length(x - cx - pose.lookX * 0.03 * s, ey - py) < 0.05 * s ? "pupil" : "sclera";
    }

    if (style === "keyhole" || style === "goat") {
      if (ellipse(x, y, cx, cy, 0.155 * s, Math.max(0.17 * s * open, cell * 0.6), 1, 0) >= 1) continue;
      if (tiny) return "sclera";
      const kx = x - cx - pose.lookX * 0.03 * s;
      const ky = ey - pose.lookY * 0.02 * s;
      const pupil = style === "goat"
        ? sdRoundBox(kx, ky, 0.1 * s, 0.036 * s, 0.02 * s)
        : Math.min(length(kx, ky + 0.035 * s) - 0.05 * s, sdCone(kx, ky, 0, 0, 0.022 * s, 0, 0.1 * s, 0.045 * s));
      return pupil < 0 ? "pupil" : "sclera";
    }

    if (style === "scanline") {
      if (sdRoundBox(x - cx, y - cy, 0.12 * s, Math.max(0.17 * s * open, cell * 0.6), 0.05 * s) >= 0) continue;
      if (tiny) return "sclera";
      const period = Math.max(0.07 * s, cell * 2);
      const phase = (y - cy - pose.wobble * 0.08) / period;
      return phase - Math.floor(phase) < 0.5 ? "sclera" : "pupil";
    }

    if (style === "winged") {
      // An almond, the meeting of two circles, tipped up at the outer corner, and a flick.
      if (segment(x, y, cx + side * 0.15 * s, cy - 0.04 * s, cx + side * 0.27 * s, cy - 0.16 * s) < stroke * 0.55) return "sclera";
      const a = -0.22 * side;
      const c = Math.cos(a), n = Math.sin(a), dx = x - cx, dy = ey;
      const u = dx * c + dy * n, v = -dx * n + dy * c;
      if (length(u, v + 0.1 * s) >= 0.2 * s || length(u, v - 0.1 * s) >= 0.2 * s) continue;
      if (tiny) return "sclera";
      return length(x - cx - pose.lookX * 0.04 * s, ey - 0.01 * s) < 0.065 * s ? "pupil" : "sclera";
    }

    if (style === "glowing") {
      const e = ellipse(x, y, cx, cy, 0.12 * s, Math.max(0.21 * s * open, cell * 0.6), cos, sin);
      if (e < 1) return "sclera";
      if (tiny || e > 2.4) continue;
      // A halo in the logo's own dither: every other cell near the eye, every fourth further out.
      const ix = Math.floor((x + 1) / cell), iy = Math.floor((y + 1) / cell);
      const pulse = 0.15 * Math.sin(pose.wobble * 2.5);
      if (e < 1.55 + pulse ? ((ix + iy) & 1) === 0 : (ix & 1) === 0 && (iy & 1) === 0 && e < 2.2 + pulse) return "sclera";
      continue;
    }

    if (style === "dots") {
      const ry = 0.11 * s * open;
      if (ellipse(x, y, cx + pose.lookX * 0.02, cy + 0.03 + pose.lookY * 0.02, 0.08 * s, Math.max(ry, cell * 0.6), 1, 0) < 1) return "sclera";
      continue;
    }

    if (style === "glasses") {
      const frame = sdRoundBox(x - cx, y - cy + 0.02 * s, 0.16 * s, 0.13 * s, 0.07 * s);
      if (Math.abs(frame) < stroke * 0.7) return "sclera";
      if (frame < 0 && ellipse(x, y, cx + pose.lookX * 0.04, cy + pose.lookY * 0.03, 0.045 * s, Math.max(0.06 * s * open, cell * 0.6), 1, 0) < 1) return "sclera";
      continue;
    }

    /* Hearts and stars are in the eye colour like every other style, not a red of their
       own, since 5 Oct 2026, when a pink pair on an ink body read as a sticker. */
    if (style === "hearts" || style === "stars") {
      const k = 0.5 + 0.5 * open;
      const hy = (y - cy - 0.02) / k + cy + 0.02;
      const d = style === "hearts" ? heart(x - cx, hy - cy, 0.27 * s) : star(x - cx, hy - cy, 0.17 * s);
      if (d < 0) return "sclera";
      continue;
    }

    if (style === "dazed") {
      const dx = x - cx;
      const dy = (y - cy) / open;
      const u = (dx + dy) * Math.SQRT1_2;
      const v = (dx - dy) * Math.SQRT1_2;
      const arm = 0.13 * s;
      if ((Math.abs(u) < stroke * 0.8 && Math.abs(v) < arm) || (Math.abs(v) < stroke * 0.8 && Math.abs(u) < arm)) return "sclera";
      continue;
    }

    if (style === "lashes" || style === "flirty") {
      // Three short strokes off the top of each eye, then the classic eye under them.
      for (let i = 0; i < 3; i += 1) {
        const a = (0.25 + i * 0.4) * side;
        const bx = cx + Math.sin(a) * 0.12 * s;
        const by = cy - Math.cos(a) * 0.26 * s;
        if (segment(x, y, bx, by, bx + Math.sin(a) * 0.09 * s, by - Math.cos(a) * 0.09 * s) < stroke * 0.55) return "sclera";
      }
    }

    // Monocle: a ring and a chain on the right eye; the left narrows under a lid below.
    if (style === "monocle" && side === 1) {
      const ring = Math.hypot(x - cx, y - cy);
      if (Math.abs(ring - 0.2 * s) < stroke * 0.6) return "sclera";
      const sway = Math.sin(pose.wobble * 1.8) * 0.02;
      if (y > cy && segment(x, y, cx + 0.2 * s, cy + 0.04 * s, cx + 0.27 * s + sway, cy + 0.5 * s) < stroke * 0.4) return "sclera";
    }

    if (style === "googly") {
      const r = 0.19 * s;
      const ry = Math.max(r * open, cell * 0.6);
      const inside = ellipse(x, y, cx, cy, r, ry, 1, 0);
      if (inside < 1) {
        if (tiny) return "plastic";
        /* A dark edge, so white plastic on a white or cream body is still an eye. On a
           dark body it disappears into the body, which is also right. */
        if (ellipse(x, y, cx, cy, r - Math.max(cell * 1.1, 0.02 * s), ry - Math.max(cell * 1.1, 0.02 * s), 1, 0) >= 1) return "bead";
        // The pupils sit on the floor of the eye, which is the whole joke.
        const pupil = ellipse(x, y, cx + pose.lookX * 0.07 * s, cy + 0.09 * s * open, 0.085 * s, 0.085 * s * open + cell * 0.2, 1, 0);
        return pupil < 1 ? "bead" : "plastic";
      }
      continue;
    }

    if (style === "dizzy") {
      const r = Math.hypot(x - cx, (y - cy) / open);
      if (Math.abs(r - 0.11 * s) < stroke * 0.6 || r < Math.max(0.035 * s, cell * 0.7)) return "sclera";
      continue;
    }

    if (style === "excited") {
      // > on the left, < on the right: eyes squeezed shut with glee.
      const tip = cx + side * -0.07 * s;
      const back = cx + side * 0.09 * s;
      const h = 0.11 * s * open;
      if (Math.min(segment(x, y, back, cy - h, tip, cy), segment(x, y, tip, cy, back, cy + h)) < stroke * 0.65) return "sclera";
      continue;
    }

    if (style === "square") {
      const hy = Math.max(0.15 * s * open, cell * 0.6);
      if (sdRoundBox(x - cx, y - cy, 0.11 * s, hy, 0.02 * s) < 0) {
        if (tiny) return "sclera";
        return sdRoundBox(x - cx - pose.lookX * 0.04 * s, y - cy - pose.lookY * 0.05 * s * open, 0.055 * s, 0.075 * s * open + cell * 0.2, 0.01) < 0 ? "pupil" : "sclera";
      }
      continue;
    }

    if (style === "ovals") {
      if (ellipse(x, y, cx, cy + 0.02 * s, 0.15 * s, Math.max(0.085 * s * open, cell * 0.6), 1, 0) >= 1) continue;
      if (tiny) return "sclera";
      return length(x - cx - pose.lookX * 0.07 * s, (y - cy - 0.02 * s - pose.lookY * 0.03 * s) / open) < 0.06 * s ? "pupil" : "sclera";
    }

    if (style === "pleading") {
      // Big wet eyes: a pupil nearly as wide as the eye and two lights in it.
      const r = Math.hypot(x - cx, (y - cy) / open);
      if (r >= 0.215 * s) continue;
      if (tiny) return "sclera";
      const px = cx + pose.lookX * 0.03 * s;
      const py = cy + 0.025 * s + pose.lookY * 0.02 * s;
      if (Math.hypot(x - px, (y - py) / open) >= 0.17 * s) return "sclera";
      if (length(x - px + 0.06 * s, y - py + 0.065 * s) < Math.max(0.055 * s, cell * 0.8)) return "sclera";
      if (length(x - px - 0.06 * s, y - py - 0.06 * s) < Math.max(0.026 * s, cell * 0.55)) return "sclera";
      return "pupil";
    }

    if (style === "diamond") {
      const dx = Math.abs(x - cx) / (0.12 * s);
      const dy = Math.abs(y - cy) / Math.max(0.17 * s * open, cell * 0.7);
      if (dx + dy >= 1) continue;
      if (tiny) return "sclera";
      const pdx = Math.abs(x - cx - pose.lookX * 0.03 * s) / (0.05 * s);
      const pdy = Math.abs(y - cy - pose.lookY * 0.04 * s) / (0.07 * s * open + cell * 0.3);
      return pdx + pdy < 1 ? "pupil" : "sclera";
    }

    if (style === "hollow") {
      if (Math.abs(Math.hypot(x - cx, (y - cy) / open) - 0.12 * s) < stroke * 0.65) return "sclera";
      continue;
    }

    if (style === "plus") {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy) / open;
      const arm = 0.12 * s;
      if ((dx < stroke * 0.7 && dy < arm) || (dy < stroke * 0.7 && dx < arm)) return "sclera";
      continue;
    }

    if (style === "twinkle") {
      // A four-pointed sparkle: the astroid, sqrt|x| + sqrt|y| = sqrt r.
      if (Math.sqrt(Math.abs(x - cx)) + Math.sqrt(Math.abs(y - cy) / open) < Math.sqrt(0.17 * s)) return "sclera";
      continue;
    }

    if (style === "target") {
      const r = Math.hypot(x - cx - pose.lookX * 0.02 * s, (y - cy) / open);
      if (r >= 0.16 * s) continue;
      if (tiny) return "sclera";
      return Math.abs(r - 0.1 * s) < stroke * 0.5 || r < Math.max(0.04 * s, cell * 0.7) ? "pupil" : "sclera";
    }

    if (style === "hypno") {
      // An Archimedean spiral, two and a half turns, wound opposite ways in each eye.
      const dx = x - cx;
      const dy = (y - cy) / open;
      const r = Math.hypot(dx, dy);
      const reach = 0.17 * s;
      if (r > reach) continue;
      const a = reach / (2.5 * Math.PI * 2);
      const turn = (r / a - Math.atan2(dy, dx) * (side || 1) - pose.wobble * 4) / (Math.PI * 2);
      if (Math.abs(turn - Math.round(turn)) * Math.PI * 2 * a < stroke * 0.55) return "sclera";
      continue;
    }

    if (style === "button") {
      if (Math.hypot(x - cx, (y - cy) / open) >= 0.14 * s) continue;
      if (tiny) return "sclera";
      for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        if (length(x - cx - hx * 0.045 * s, y - cy - hy * 0.045 * s * open) < Math.max(0.026 * s, cell * 0.55)) return "pupil";
      }
      return "sclera";
    }

    if (style === "wide" || style === "shocked") {
      const r = 0.165 * s;
      const ry = Math.max(r * 1.1 * open, cell * 0.6);
      if (ellipse(x, y, cx, cy, r, ry, 1, 0) < 1) {
        if (tiny) return "sclera";
        const small = style === "shocked" ? 0.6 : 1;
        const pupil = ellipse(x, y, cx + pose.lookX * 0.06, cy + pose.lookY * 0.06 * open, 0.055 * s * small, 0.06 * s * open * small + cell * 0.2, 1, 0);
        return pupil < 1 ? "pupil" : "sclera";
      }
      continue;
    }

    // Classic and the family built on it: a tall leaning oval, sometimes with a lid.
    const big = (style === "cyclops" ? 1.45 : style === "anime" ? 1.2 : style === "mismatched" ? (side === -1 ? 1.25 : 0.7) : 1) * scale;
    const rx = 0.15 * s * big;
    const ry = Math.max(0.27 * s * open * (style === "cyclops" ? 1.15 : 1) * scale, cell * 0.6);
    // Dreamy: a heavy lid drawn as a line above the half of the eye that shows, with lashes.
    if (style === "dreamy") {
      const ly = cy - 0.05 * s;
      if (segment(x, y, cx - 0.15 * s * scale, ly, cx + 0.15 * s * scale, ly) < stroke * 0.55) return "sclera";
      for (let i = 0; i < 2; i += 1) {
        const bx = cx + side * (0.08 + i * 0.07) * s;
        if (segment(x, y, bx, ly, bx + side * 0.05 * s, ly - 0.08 * s) < stroke * 0.5) return "sclera";
      }
    }
    // Scar: a line through the left eye, pale across the body and dark across the eye.
    const scar = style === "scar" && side === -1 ? segment(x, y, cx - 0.12 * s, cy - 0.38 * s, cx + 0.1 * s, cy + 0.38 * s) : Infinity;
    if (ellipse(x, y, cx, cy, rx, ry, cos, sin) >= 1) {
      // A tear under each eye, the point upward, in the eye colour.
      if (style === "crying" && sdCone(x, y, cx + 0.05 * s, cy + 0.42 * s, 0.05 * s, cx + 0.04 * s, cy + 0.3 * s, 0.01) < Math.max(0, cell * 0.2)) return "sclera";
      // Bags: a second, shallower curve under each eye.
      if (style === "tired" && arc(x, y, cx + 0.03 * s, cy + 0.27 * s, 0.11 * s, stroke * 0.45, false) < 0 && y > cy + 0.31 * s) return "sclera";
      if (scar < stroke * 0.55) return "sclera";
      if (scar < Infinity) {
        // Two stitches across it, one either side of the eye.
        for (const f of [0.08, 0.92]) {
          const sx = cx + (-0.12 + 0.22 * f) * s, sy = cy + (-0.38 + 0.76 * f) * s;
          if (segment(x, y, sx - 0.045 * s, sy - 0.013 * s, sx + 0.045 * s, sy + 0.013 * s) < stroke * 0.42) return "sclera";
        }
      }
      continue;
    }

    if ((style === "angry" || style === "furious") && y < cy - 0.1 * s + (x - cx) * 0.75 * -side) continue;
    if ((style === "sad" || style === "sly") && y < cy - 0.1 * s + (x - cx) * 0.7 * side) continue;
    if (style === "sleepy" && y < cy - 0.04 * s + 0.2 * s * (1 - open)) continue;
    /* A flat slit and nothing in it: a pupil in a band three cells tall fills it and the
       eye disappears, which is how the first version of this looked. */
    if (style === "sideeye" && y < cy - 0.02 * s + 0.2 * s * (1 - open)) continue;
    if (style === "monocle" && side === -1 && y < cy + 0.02 * s + 0.2 * s * (1 - open)) continue;
    // Tired droops toward the outside; Annoyed is cut level at the middle.
    if (style === "tired" && y < cy - 0.05 * s + (x - cx) * 0.35 * side + 0.2 * s * (1 - open)) continue;
    if (style === "annoyed" && y < cy + 0.02 * s + 0.2 * s * (1 - open)) continue;
    if (style === "dreamy" && y < cy + 0.02 * s + 0.2 * s * (1 - open)) continue;
    if (style === "peeking" && y > cy + 0.04 * s) continue;
    if (style === "skeptic" && side === 1 && (y < cy + 0.01 * s + 0.14 * s * (1 - open) || y > cy + 0.15 * s)) continue;
    if (scar < stroke * 0.45) return "pupil";
    if (style === "squint") {
      if (y < cy + 0.01 * s || y > cy + 0.01 * s + Math.max(0.08 * s * open, cell * 1.1)) continue;
      return "sclera";
    }

    if (tiny) return "sclera";
    const lifted = {
      angry: 0.05, furious: 0.05, sad: 0.1, sly: 0.08, sleepy: 0.12, sideeye: 0.1,
      tired: 0.1, annoyed: 0.08, dreamy: 0.12, peeking: 0, crosseyed: 0.05, daydream: -0.11, puzzled: -0.05, alert: 0.02,
      skeptic: side === 1 ? 0.08 : 0.07,
    }[style as string] ?? 0.07;
    // Side eye and sly look hard to one side whatever the pointer does, a little either way.
    const px = style === "sideeye" || style === "sly"
      ? cx + (0.075 + pose.lookX * 0.015) * s
      : style === "crosseyed"
        ? cx - side * 0.065 * s
        : style === "puzzled"
          ? cx + 0.05 * s
          : cx + pose.lookX * (style === "daydream" || style === "alert" ? 0.025 : 0.06) * s * big;
    const py = cy + (lifted + pose.lookY * 0.07) * s * open * big;
    // The pupil takes a shape of its own in three of these.
    if (style === "starstruck") return star(x - px, y - py + 0.03 * s, 0.16 * s) < 0 ? "pupil" : "sclera";
    if (style === "smitten") return heart(x - px, y - py + 0.03 * s, 0.26 * s) < 0 ? "pupil" : "sclera";
    if (style === "slit") return ellipse(x, y, px, py - 0.03 * s, Math.max(0.045 * s, cell * 0.8), 0.19 * s * open + cell * 0.2, cos, sin) < 1 ? "pupil" : "sclera";
    const lidded = ["angry", "furious", "sad", "sly", "sleepy", "sideeye", "tired", "annoyed", "dreamy", "peeking"];
    const full = !lidded.includes(style) && !((style === "monocle" || style === "skeptic") && side === (style === "monocle" ? -1 : 1));
    const size = style === "alert" ? 0.62 : style === "ringed" ? 1.18 : 1;
    const prx = (full ? 0.095 : 0.075) * s * big * size;
    const pry = (full ? 0.15 : 0.095) * s * open * big * size + cell * 0.2;
    if (ellipse(x, y, px, py, prx, pry, cos, sin) < 1) {
      // Ringed: the pupil is a hoop, the eye colour showing through the middle of it.
      if (style === "ringed" && ellipse(x, y, px, py, prx * 0.5, pry * 0.5, cos, sin) < 1) return "sclera";
      // A catch light in the pupil: the glint that makes Sparkle and Anime what they are.
      if ((style === "sparkle" || style === "cyclops" || style === "anime") && length(x - (px - 0.035 * s * big), y - (py - 0.06 * s * big)) < Math.max(0.035 * s * big, cell * 0.75)) return "sclera";
      if (style === "anime" && length(x - (px + 0.03 * s), y - (py + 0.07 * s)) < Math.max(0.018 * s, cell * 0.5)) return "sclera";
      return "pupil";
    }
    return "sclera";
  }
  return null;
}

/* ------------------------------------------------------------------------- *
 * The later styles
 * ------------------------------------------------------------------------- */

/*
 * Every style from Heart outlines onward is drawn here rather than threaded through the chain in
 * `sampleEyes`, so each one is whole in one place and cannot be changed by an `if` meant
 * for somebody else. The rules are the same: decorations in the eye colour, `open`
 * squashes what blinks and leaves what does not, `tiny` drops the detail, and nothing
 * reaches above `EYE_REACH`. The highest marks here (Idea's rays, Clown's diamonds)
 * stop near 0.62.
 */

type EyeCtx = {
  pose: MascotPose;
  x: number;
  y: number;
  cell: number;
  s: number;
  w: number;
  fx: number;
  fy: number;
  open: number;
  cos: number;
  sin: number;
  stroke: number;
  tiny: boolean;
};

type Eye = { cx: number; cy: number; side: number; k: number };

const LATER_EYES: ReadonlySet<string> = new Set(MASCOT_EYES.slice(MASCOT_EYES.findIndex((e) => e.id === "openhearts")).map((e) => e.id));

/** The every-other-cell dither the logo shades with, for blush, lenses and beams. */
function checker(x: number, y: number, cell: number) {
  return ((Math.floor((x + 1) / cell) + Math.floor((y + 1) / cell)) & 1) === 0;
}

/**
 * The classic eye on its own: the tall leaning oval and its pupil, for the styles that
 * are a classic eye plus something. Null outside it. `lift` moves the pupil down the eye;
 * `px` pins it across.
 */
function classicEye(c: EyeCtx, cx: number, cy: number, opts: { k?: number; lift?: number; px?: number; glint?: boolean; pupil?: number } = {}): MascotInk | null {
  const { x, y, s, open, cell, cos, sin, pose } = c;
  const k = opts.k ?? 1;
  if (ellipse(x, y, cx, cy, 0.15 * s * k, Math.max(0.27 * s * open * k, cell * 0.6), cos, sin) >= 1) return null;
  if (c.tiny) return "sclera";
  const px = opts.px ?? cx + pose.lookX * 0.06 * s * k;
  const py = cy + ((opts.lift ?? 0.07) + pose.lookY * 0.07) * s * open * k;
  const p = opts.pupil ?? 1;
  if (ellipse(x, y, px, py, 0.095 * s * k * p, 0.15 * s * open * k * p + cell * 0.2, cos, sin) >= 1) return "sclera";
  if (opts.glint && length(x - (px - 0.035 * s * k), y - (py - 0.06 * s * k)) < Math.max(0.035 * s * k, cell * 0.75)) return "sclera";
  return "pupil";
}

function sampleLaterEyes(style: string, c: EyeCtx, standard: readonly Eye[]): MascotInk | null {
  const { pose, x, y, cell, s, w, fx, fy, open, cos, sin, stroke, tiny } = c;

  // Wide-set, Close-set and Spider move the eyes themselves, so they get their own list.
  /* Wide-set adds a fixed step to the usual spread rather than scaling it, because a face
     that is already wide (Frog's is twice the circle's) would push the eyes off the body. */
  const wide = (0.21 * w + 0.12) * s;
  const eyes: readonly Eye[] = style === "wideset"
    ? [{ cx: fx - wide, cy: fy - 0.11 * s, side: -1, k: 0.9 }, { cx: fx + wide, cy: fy - 0.13 * s, side: 1, k: 0.9 }]
    : style === "closeset"
      ? [{ cx: fx - 0.13 * s * w, cy: fy - 0.12 * s, side: -1, k: 0.75 }, { cx: fx + 0.13 * s * w, cy: fy - 0.14 * s, side: 1, k: 0.75 }]
      : style === "specs" || style === "roundspecs"
        ? [{ cx: fx - SPECS_X * s * w, cy: fy - (0.12 - SPECS_DROP) * s, side: -1, k: 1 }, { cx: fx + SPECS_X * s * w, cy: fy - (0.15 - SPECS_DROP) * s, side: 1, k: 1 }]
        : standard;
  const [l, r] = eyes;
  const midX = (l.cx + r.cx) / 2;
  const midY = (l.cy + r.cy) / 2;
  // Half the width of anything worn across both eyes: the eyes' own spread plus a lens.
  const span = (r.cx - l.cx) / 2 + 0.16 * s;

  // Spider: two big eyes and four small ones above and beside them.
  if (style === "spider") {
    const spots = [[-0.14, -0.06, 0.1], [0.14, -0.08, 0.1], [-0.33, -0.19, 0.06], [0.33, -0.21, 0.06], [-0.08, -0.33, 0.055], [0.08, -0.34, 0.055]] as const;
    for (const [ox, oy, rr] of spots) {
      const cx = fx + ox * s * w, cy = fy + oy * s;
      const radius = Math.max(rr * s, cell * 0.75);
      if (Math.hypot(x - cx, (y - cy) / open) >= radius) continue;
      if (tiny || rr < 0.08) return "sclera";
      return length(x - cx - pose.lookX * 0.025 * s, y - cy - pose.lookY * 0.025 * s * open) < Math.max(0.045 * s, cell * 0.8) ? "pupil" : "sclera";
    }
    return null;
  }

  // Scanner: a hairline across the face and a light that slides along it to the gaze.
  if (style === "scanner") {
    const at = midX + Math.max(-1, Math.min(1, pose.lookX)) * (span - 0.1 * s);
    if (sdRoundBox(x - at, y - midY, 0.09 * s, Math.max(0.045 * s * open, cell * 0.6), 0.04 * s) < 0) return "sclera";
    return Math.abs(y - midY) < Math.max(cell * 0.55, 0.014 * s) && Math.abs(x - midX) < span ? "sclera" : null;
  }

  // VR headset: a deep box over both eyes, a notch for the nose, and its strap.
  if (style === "vr") {
    const vy = midY + 0.01 * s;
    if (sdRoundBox(x - midX, y - vy, span, 0.15 * s, 0.07 * s) < 0 && length(x - midX, y - vy - 0.17 * s) >= 0.08 * s) {
      if (tiny) return "sclera";
      if (Math.abs(x - midX) < Math.max(cell * 0.5, 0.012 * s) && y < vy + 0.06 * s) return "pupil";
      if (length(x - midX - span * 0.7, y - vy + 0.08 * s) < Math.max(0.022 * s, cell * 0.55)) return "pupil";
      return "sclera";
    }
    return Math.abs(y - vy + 0.02 * s) < stroke * 0.6 && Math.abs(x - midX) < span + 0.3 * s ? "sclera" : null;
  }

  // Ski goggles: one wide lens outlined, its strap, and two streaks of glare.
  if (style === "ski") {
    const frame = sdRoundBox(x - midX, y - midY, span + 0.02 * s, 0.17 * s, 0.13 * s);
    if (Math.abs(frame) < stroke * 0.75) return "sclera";
    if (frame >= 0) return Math.abs(y - midY) < stroke * 0.9 && Math.abs(x - midX) < span + 0.3 * s ? "sclera" : null;
    if (tiny) return null;
    const g = x - midX + (y - midY) + 0.14 * s;
    return Math.abs(g) < Math.max(0.03 * s, cell * 0.6) || Math.abs(g - 0.1 * s) < Math.max(0.012 * s, cell * 0.5) ? "sclera" : null;
  }

  // Sleep mask: a band over both eyes with shut eyes stitched into it in the body colour.
  if (style === "sleepmask") {
    if (sdRoundBox(x - midX, y - midY, span, 0.13 * s, 0.11 * s) >= 0) {
      return Math.abs(y - midY + 0.02 * s) < stroke * 0.6 && Math.abs(x - midX) < span + 0.3 * s ? "sclera" : null;
    }
    if (tiny) return "sclera";
    for (const { cx, cy, side } of eyes) {
      if (arc(x, y, cx, midY - 0.05 * s, 0.08 * s, stroke * 0.5, false) < 0) return null;
    }
    return "sclera";
  }

  // Owl: a V of brow joining over both eyes, which is what makes the round eyes an owl's.
  if (style === "owl") {
    const vy = midY - 0.27 * s;
    const vee = Math.min(
      segment(x, y, l.cx - 0.17 * s, vy - 0.02 * s, midX, vy + 0.12 * s),
      segment(x, y, midX, vy + 0.12 * s, r.cx + 0.17 * s, vy - 0.02 * s),
    );
    if (vee < stroke * 0.7) return "sclera";
  }

  // Disguise: the nose and moustache of the novelty glasses, shared by both eyes.
  if (style === "disguise") {
    if (ellipse(x, y, midX, midY + 0.16 * s, 0.075 * s, 0.09 * s, 1, 0) < 1) return "sclera";
    for (const m of [-1, 1]) {
      const a = 0.35 * m;
      if (ellipse(x, y, midX + m * 0.085 * s, midY + 0.3 * s, 0.1 * s, 0.042 * s, Math.cos(a), Math.sin(a)) < 1) return "sclera";
    }
  }

  // Bridges, for the glasses that have one.
  if (style === "threed" || style === "starglasses" || style === "catglasses" || style === "disguise" || style === "specs" || style === "roundspecs") {
    const by = midY - 0.04 * s;
    // Specs' lenses are wider than the rest, so its bridge starts at their rim rather than inside the lens.
    const gap = style === "starglasses" ? 0.13 * s : style === "specs" ? SPECS_W * s : style === "roundspecs" ? ROUND_SPECS_R * s : 0.15 * s;
    if (x > l.cx + gap && x < r.cx - gap && Math.abs(y - by) < stroke * 0.6) return "sclera";
  }
  if (style === "readers" && x > l.cx + 0.15 * s && x < r.cx - 0.15 * s && Math.abs(y - midY - 0.1 * s) < stroke * 0.5) return "sclera";

  // Marks up and to the right, where Puzzled and Alert put theirs.
  if (style === "crush" || style === "idea") {
    const mx = r.cx + 0.3 * s;
    const my = r.cy - 0.3 * s - Math.sin(pose.wobble * 2.2) * 0.02 * s;
    if (style === "crush" && heart(x - mx, y - my, 0.17 * s) < 0) return "sclera";
    if (style === "idea") {
      if (length(x - mx, y - my + 0.02 * s) < 0.068 * s) return "sclera";
      if (sdRoundBox(x - mx, y - my - 0.065 * s, 0.033 * s, 0.026 * s, 0.01 * s) < 0) return "sclera";
      for (const a of [-1.1, 0, 1.1]) {
        const dx = Math.sin(a), dy = -Math.cos(a);
        if (segment(x, y, mx + dx * 0.1 * s, my - 0.02 * s + dy * 0.1 * s, mx + dx * 0.14 * s, my - 0.02 * s + dy * 0.14 * s) < stroke * 0.45) return "sclera";
      }
    }
  }

  for (const eye of eyes) {
    const { cx, cy, side } = eye;
    const m = side || 1;
    const dx = x - cx;
    const ey = (y - cy) / open;
    const yy = cy + ey;
    let ink: MascotInk | null = null;

    switch (style) {
      case "saucers": {
        // Oversized plastic discs with broad, low beads, like eyes stuck onto a sculpture.
        const r = 0.265 * s, ry = Math.max(r * open, cell * 0.6);
        if (ellipse(x, y, cx, cy, r, ry, 1, 0) >= 1) break;
        if (tiny) return "plastic";
        const rim = Math.max(cell * 0.65, 0.012 * s);
        if (ellipse(x, y, cx, cy, r - rim, Math.max(ry - rim, cell * 0.25), 1, 0) >= 1) return "bead";
        const px = cx + pose.lookX * 0.065 * s, py = cy + (0.055 + pose.lookY * 0.035) * s * open;
        return ellipse(x, y, px, py, 0.155 * s, Math.max(0.155 * s * open, cell * 0.45), 1, 0) < 1 ? "bead" : "plastic";
      }
      case "openhearts": {
        // Hearts as a line rather than a fill, big enough that the middle survives at 28.
        const hy = (y - cy) / (0.5 + 0.5 * open);
        const d = heart(dx, hy - 0.01 * s, 0.34 * s);
        if (d < 0 && d > -stroke * 1.05) return "sclera";
        break;
      }
      case "pinpoint": {
        // Saucer eyes with a pinprick in each, and a twitch line beside them.
        const r0 = 0.165 * s;
        if (ellipse(x, y, cx, cy, r0, Math.max(r0 * 1.1 * open, cell * 0.6), 1, 0) < 1) {
          if (tiny) return "sclera";
          return length(x - cx - pose.lookX * 0.08 * s, y - cy - pose.lookY * 0.08 * s * open) < Math.max(0.022 * s, cell * 0.55) ? "pupil" : "sclera";
        }
        const tx = cx + m * 0.25 * s;
        if (Math.min(segment(x, y, tx, cy - 0.2 * s, tx + m * 0.04 * s, cy - 0.29 * s), segment(x, y, tx + m * 0.03 * s, cy - 0.08 * s, tx + m * 0.11 * s, cy - 0.12 * s)) < stroke * 0.5) return "sclera";
        break;
      }
      case "crosspupil": {
        if (ellipse(x, y, cx, cy, 0.15 * s, Math.max(0.27 * s * open, cell * 0.6), cos, sin) >= 1) break;
        if (tiny) return "sclera";
        const px = Math.abs(x - cx - pose.lookX * 0.05 * s);
        const py = Math.abs(y - cy - (0.06 + pose.lookY * 0.06) * s * open) / open;
        const arm = 0.085 * s, t = Math.max(0.024 * s, cell * 0.55);
        return (px < t && py < arm) || (py < t && px < arm) ? "pupil" : "sclera";
      }
      case "bloodshot": {
        const base = classicEye(c, cx, cy, { pupil: 0.7 });
        if (base !== "sclera") { ink = base; break; }
        // Three veins in from the edge of the white, in the pupil's ink.
        for (const a of [0.15, 2.9, 4.2]) {
          const ax = cx + Math.cos(a) * 0.13 * s, ay = cy + Math.sin(a) * 0.23 * s * open;
          const bx = cx + Math.cos(a) * 0.06 * s, by = cy + Math.sin(a + 0.4) * 0.12 * s * open;
          if (segment(x, y, ax, ay, bx, by) < Math.max(cell * 0.5, 0.012 * s)) return "pupil";
        }
        return "sclera";
      }
      case "doll": {
        // The classic eye with its light, and lashes off the lower lid.
        for (let i = 0; i < 3; i += 1) {
          const a = (0.25 + i * 0.42) * m;
          const bx = cx + Math.sin(a) * 0.13 * s, by = cy + Math.cos(a) * 0.25 * s;
          if (segment(x, y, bx, by, bx + Math.sin(a) * 0.08 * s, by + Math.cos(a) * 0.08 * s) < stroke * 0.5) return "sclera";
        }
        ink = classicEye(c, cx, cy, { glint: true, lift: 0.04 });
        break;
      }
      case "walleyed":
        ink = classicEye(c, cx, cy, { px: cx + m * 0.065 * s });
        break;
      case "starwink":
        if (side === 1) {
          if (star(dx, (y - cy) / (0.5 + 0.5 * open), 0.19 * s) < 0) return "sclera";
          break;
        }
        ink = classicEye(c, cx, cy, { glint: true });
        break;
      case "determined": {
        // Flat brows pressed down at the middle, and a lower lid pushed up.
        const by = cy - 0.36 * s;
        if (segment(x, y, cx - m * 0.13 * s, by + 0.05 * s, cx + m * 0.12 * s, by - 0.01 * s) < stroke * 0.8) return "sclera";
        if (y > cy + 0.08 * s * open) break;
        ink = classicEye(c, cx, cy, { lift: 0.0 });
        break;
      }
      case "smug":
        // Eyes shut in a pleased curve, brows arched high above them.
        if (arc(x, y, cx, cy - 0.03 * s, 0.12 * s, stroke, false) < 0) return "sclera";
        if (y < cy - 0.29 * s && arc(x, y, cx + m * 0.02 * s, cy - 0.19 * s, 0.14 * s, stroke * 0.6, true) < 0) return "sclera";
        break;
      case "woozy":
        if (side === -1) {
          if (Math.abs(dx) < 0.15 * s && Math.abs(y - cy - 0.04 * s - 0.045 * s * Math.sin((dx / (0.15 * s)) * Math.PI * 1.5 + pose.wobble * 2)) < stroke * 0.75) return "sclera";
          break;
        }
        {
          const ox = cx + 0.01 * s, oy = cy + 0.05 * s, r0 = 0.16 * s;
          if (ellipse(x, y, ox, oy, r0, Math.max(r0 * open, cell * 0.6), 1, 0) >= 1) break;
          if (tiny) return "sclera";
          return length(x - ox + 0.05 * s, y - oy - 0.06 * s * open) < Math.max(0.04 * s, cell * 0.7) ? "pupil" : "sclera";
        }
      case "flustered":
        // A dithered flush on each cheek and the eyes cast down away from it.
        if (ellipse(x, y, cx + m * 0.05 * s, cy + 0.35 * s, 0.12 * s, 0.06 * s, 1, 0) < 1) return checker(x, y, cell) ? "sclera" : null;
        ink = classicEye(c, cx, cy, { lift: 0.13, px: cx - m * 0.04 * s });
        break;
      case "joyful":
        if (arc(x, y, cx, cy + 0.08 * s, 0.15 * s, stroke, true) < 0) return "sclera";
        if (sdCone(x, y, cx + m * 0.23 * s, cy + 0.28 * s, 0.06 * s, cx + m * 0.17 * s, cy + 0.15 * s, 0.012 * s) < 0) return "sclera";
        break;
      case "sweaty": {
        const by = cy - 0.37 * s;
        if (segment(x, y, cx - m * 0.12 * s, by - 0.05 * s, cx + m * 0.12 * s, by + 0.02 * s) < stroke * 0.6) return "sclera";
        const tx = cx + m * 0.3 * s, ty = cy - 0.2 * s;
        if (sdCone(x, y, tx, ty + 0.06 * s, 0.06 * s, tx, ty - 0.1 * s, 0.01 * s) < 0) return "sclera";
        ink = classicEye(c, cx, cy, { lift: 0.02, k: 0.95 });
        break;
      }
      case "crush":
      case "idea":
        ink = classicEye(c, cx, cy, { glint: true });
        break;
      case "clown":
        // The painted diamonds above and below each eye.
        for (const d of [-1, 1]) {
          if (Math.abs(dx) / Math.max(0.035 * s, cell * 0.8) + Math.abs(y - cy - d * 0.39 * s) / (0.085 * s) < 1) return "sclera";
        }
        ink = classicEye(c, cx, cy);
        break;
      case "warpaint":
        for (const i of [0, 1]) {
          if (segment(x, y, cx - m * 0.05 * s, cy + (0.33 + i * 0.1) * s, cx + m * 0.19 * s, cy + (0.31 + i * 0.1) * s) < stroke * 0.55) return "sclera";
        }
        ink = classicEye(c, cx, cy);
        break;
      case "stitched":
        if (segment(x, y, cx - 0.15 * s, cy + 0.02 * s, cx + 0.15 * s, cy + 0.02 * s) < stroke * 0.6) return "sclera";
        for (const t of [-0.09, 0, 0.09]) if (Math.abs(dx - t * s) < stroke * 0.45 && Math.abs(y - cy - 0.02 * s) < 0.085 * s) return "sclera";
        break;
      case "ellipsis": {
        const gap = Math.max(0.1 * s, cell * 2.1);
        const rr = Math.max(0.042 * s, cell * 0.6);
        const i = Math.max(-1, Math.min(1, Math.round(dx / gap)));
        if (length(dx - i * gap, ey - 0.03 * s) < rr) return "sclera";
        break;
      }
      case "questions":
        if (glyphQuestion(x, yy, cx, cy, 0.18 * s, stroke * 0.55) < 0) return "sclera";
        break;
      case "exclaim":
        if (glyphBang(x, yy, cx, cy, 0.18 * s, stroke * 0.6) < 0) return "sclera";
        break;
      case "notes":
        if (glyphNote(x, yy, cx - 0.07 * s, cy - 0.05 * s, 0.21 * s, stroke * 0.55) < 0) return "sclera";
        break;
      case "clubs": {
        const rr = 0.062 * s;
        if (length(dx, ey + 0.07 * s) < rr || length(dx - 0.07 * s, ey - 0.01 * s) < rr || length(dx + 0.07 * s, ey - 0.01 * s) < rr) return "sclera";
        if (sdCone(dx, ey, 0, 0, 0.018 * s, 0, 0.14 * s, 0.05 * s) < 0) return "sclera";
        break;
      }
      case "shields": {
        // Triangle, upside down and rounded: a shield with the pupil in its broad top.
        if (sdTriangle(dx, -ey + 0.02 * s, 0.15 * s) - 0.025 * s >= 0) break;
        if (tiny) return "sclera";
        return length(x - cx - pose.lookX * 0.03 * s, ey + 0.03 * s - pose.lookY * 0.02 * s) < 0.05 * s ? "pupil" : "sclera";
      }
      case "checks":
        if (Math.min(segment(x, yy, cx - 0.11 * s, cy, cx - 0.035 * s, cy + 0.08 * s), segment(x, yy, cx - 0.035 * s, cy + 0.08 * s, cx + 0.12 * s, cy - 0.12 * s)) < stroke * 0.75) return "sclera";
        break;
      case "hourglass": {
        const ay = Math.abs(ey);
        if (ay < 0.165 * s && Math.abs(dx) < 0.105 * s * (ay / (0.165 * s)) + Math.max(0.02 * s, cell * 0.5)) return "sclera";
        if (ay > 0.15 * s && ay < 0.15 * s + stroke * 1.1 && Math.abs(dx) < 0.13 * s) return "sclera";
        break;
      }
      case "dshape": {
        // Flat on the side toward the nose, round on the outside.
        const u = dx * m;
        if (u < -0.08 * s || ellipse(u, y, -0.08 * s, cy, 0.2 * s, Math.max(0.17 * s * open, cell * 0.6), 1, 0) >= 1) break;
        if (tiny) return "sclera";
        return length(x - cx - pose.lookX * 0.04 * s, y - cy - (0.04 + pose.lookY * 0.04) * s * open) < 0.06 * s ? "pupil" : "sclera";
      }
      case "teardrop":
      case "droopy": {
        // Teardrop points up and out; Droopy sags at the outer corner like a hound's.
        const shape = style === "teardrop"
          ? sdCone(x, yy, cx, cy + 0.05 * s, 0.12 * s, cx + m * 0.05 * s, cy - 0.19 * s, 0.015 * s)
          : sdCone(x, yy, cx - m * 0.01 * s, cy - 0.02 * s, 0.125 * s, cx + m * 0.15 * s, cy + 0.15 * s, 0.015 * s);
        if (shape >= 0) break;
        if (tiny) return "sclera";
        const py = cy + (style === "teardrop" ? 0.06 : 0.0) * s + pose.lookY * 0.04 * s;
        return length(x - cx - pose.lookX * 0.04 * s + m * (style === "droopy" ? 0.02 : 0) * s, yy - py) < 0.065 * s ? "pupil" : "sclera";
      }
      case "catseye": {
        // An almond tipped up at the outer corner, split by a slit pupil.
        const a = -0.3 * m;
        const u = dx * Math.cos(a) + ey * Math.sin(a), v = -dx * Math.sin(a) + ey * Math.cos(a);
        if (length(u, v + 0.12 * s) >= 0.21 * s || length(u, v - 0.12 * s) >= 0.21 * s) break;
        if (tiny) return "sclera";
        return ellipse(x, yy, cx + pose.lookX * 0.04 * s, cy, Math.max(0.022 * s, cell * 0.55), 0.09 * s, 1, 0) < 1 ? "pupil" : "sclera";
      }
      case "squircle": {
        const qx = dx / (0.145 * s), qy = (y - cy) / Math.max(0.14 * s * open, cell * 0.6);
        if (qx ** 4 + qy ** 4 >= 1) break;
        if (tiny) return "sclera";
        return length(x - cx - pose.lookX * 0.05 * s, y - cy - pose.lookY * 0.05 * s * open) < Math.max(0.058 * s, cell * 0.9) ? "pupil" : "sclera";
      }
      case "owl": {
        const r0 = 0.165 * s;
        if (ellipse(x, y, cx, cy, r0, Math.max(r0 * open, cell * 0.6), 1, 0) >= 1) break;
        if (tiny) return "sclera";
        return ellipse(x, y, cx + pose.lookX * 0.03 * s, cy + pose.lookY * 0.03 * s * open, 0.09 * s, 0.09 * s * open + cell * 0.2, 1, 0) < 1 ? "pupil" : "sclera";
      }
      case "bug": {
        // Big dithered ovals out at the sides, solid at the rim, with a light in each.
        const ox = cx + m * 0.04 * s;
        const e = ellipse(x, y, ox, cy, 0.17 * s, Math.max(0.21 * s * open, cell * 0.6), 1, 0);
        if (e >= 1) break;
        if (tiny || e > 0.62) return "sclera";
        if (length(x - ox + 0.06 * s, y - cy + 0.08 * s * open) < Math.max(0.035 * s, cell * 0.8)) return "sclera";
        return checker(x, y, cell) ? "sclera" : "pupil";
      }
      case "outline": {
        const rx = 0.15 * s, ry = Math.max(0.27 * s * open, cell * 0.6);
        if (ellipse(x, y, cx, cy, rx, ry, cos, sin) >= 1) break;
        if (tiny) return "sclera";
        const t = Math.max(0.036 * s, cell * 1.0);
        if (ellipse(x, y, cx, cy, rx - t, Math.max(ry - t, cell * 0.3), cos, sin) >= 1) return "sclera";
        return length(x - cx - pose.lookX * 0.04 * s, y - cy - (0.05 + pose.lookY * 0.05) * s * open) < Math.max(0.04 * s, cell * 0.8) ? "sclera" : null;
      }
      case "wideset":
      case "closeset":
        ink = classicEye(c, cx, cy, { k: eye.k });
        break;
      case "led": {
        // A three by three block of lamps, each a cell apart at least.
        const g = Math.max(0.08 * s, cell * 2.05), hw = Math.max(0.026 * s, cell * 0.5);
        const i = Math.max(-1, Math.min(1, Math.round(dx / g)));
        const j = Math.max(-1, Math.min(1, Math.round((y - cy) / (g * open))));
        if (Math.abs(dx - i * g) < hw && Math.abs(y - cy - j * g * open) < hw) return "sclera";
        break;
      }
      case "reticle":
        if (side === 1) {
          const rr = length(dx, y - cy), t = stroke * 0.45;
          if (Math.abs(rr - 0.2 * s) < t) return "sclera";
          const ax = Math.abs(dx), ay = Math.abs(y - cy);
          if ((ax < t && ay > 0.14 * s && ay < 0.27 * s) || (ay < t && ax > 0.14 * s && ax < 0.27 * s)) return "sclera";
          ink = classicEye(c, cx, cy, { k: 0.62 });
          break;
        }
        ink = classicEye(c, cx, cy);
        break;
      case "threed": {
        const lens = sdRoundBox(dx, y - cy + 0.01 * s, 0.15 * s, 0.12 * s, 0.04 * s);
        if (lens >= 0) break;
        if (side === -1 || tiny || lens > -stroke * 0.6) return "sclera";
        return checker(x, y, cell) ? "sclera" : null;
      }
      case "starglasses": {
        // A fatter star than Stars, so the bridge has something to hold.
        if (length(dx, y - cy + 0.01 * s) >= 0.21 * s * (0.74 + 0.26 * Math.cos(5 * Math.atan2(dx, -(y - cy + 0.01 * s))))) break;
        return "sclera";
      }
      case "magnify":
        if (side === 1) {
          const ox = cx + 0.02 * s, rr = length(x - ox, y - cy);
          if (Math.abs(rr - 0.21 * s) < stroke * 0.65) return "sclera";
          if (sdCapsule(x, y, ox + 0.15 * s, cy + 0.15 * s, ox + 0.26 * s, cy + 0.26 * s, stroke * 0.95) < 0) return "sclera";
          if (rr >= 0.21 * s) break;
          if (Math.hypot(x - ox, (y - cy) / open) >= 0.155 * s) return null;
          if (tiny) return "sclera";
          return length(x - ox - pose.lookX * 0.04 * s, y - cy - pose.lookY * 0.04 * s * open) < 0.085 * s ? "pupil" : "sclera";
        }
        ink = classicEye(c, cx, cy, { k: 0.8 });
        break;
      case "catglasses": {
        // Frames swept up into a point at the outer top corner.
        if (sdCone(x, y, cx + m * 0.1 * s, cy - 0.06 * s, 0.045 * s, cx + m * 0.23 * s, cy - 0.17 * s, 0.012 * s) < 0) return "sclera";
        const frame = sdRoundBox(dx, y - cy, 0.155 * s, 0.11 * s, 0.08 * s);
        if (Math.abs(frame) < stroke * 0.6) return "sclera";
        if (frame >= 0) break;
        if (ellipse(x, y, cx + pose.lookX * 0.04 * s, cy + pose.lookY * 0.03 * s, 0.045 * s, Math.max(0.06 * s * open, cell * 0.6), 1, 0) < 1) return "sclera";
        return null;
      }
      case "readers": {
        // Half-moon lenses low on the face, the eyes looking up over the top of them.
        const ly = midY + 0.1 * s;
        if (Math.abs(y - ly) < stroke * 0.5 && Math.abs(dx) < 0.15 * s) return "sclera";
        if (y > ly && Math.abs(sdEllipse(dx, y - ly, 0.15 * s, 0.11 * s)) < stroke * 0.5) return "sclera";
        if (y > ly) break;
        ink = classicEye(c, cx, cy - 0.04 * s, { k: 0.72, lift: -0.06 });
        break;
      }
      case "disguise": {
        if (segment(x, y, cx - 0.14 * s, cy - 0.29 * s, cx + 0.14 * s, cy - 0.31 * s + m * 0.02 * s) < stroke * 1.05) return "sclera";
        const rr = length(dx, y - cy);
        if (Math.abs(rr - 0.14 * s) < stroke * 0.5) return "sclera";
        if (rr < 0.14 * s && ellipse(x, y, cx + pose.lookX * 0.04 * s, cy + pose.lookY * 0.03 * s, 0.045 * s, Math.max(0.06 * s * open, cell * 0.6), 1, 0) < 1) return "sclera";
        break;
      }
      case "pause": {
        const hw = Math.max(0.026 * s, cell * 0.55), g = Math.max(0.055 * s, cell * 1.2);
        if (Math.abs(Math.abs(dx) - g) < hw && Math.abs(y - cy) < Math.max(0.14 * s * open, cell * 0.6)) return "sclera";
        break;
      }
      case "equalizer": {
        // Three bars on one floor, dancing on the clock.
        const g = Math.max(0.065 * s, cell * 2), hw = Math.max(0.022 * s, cell * 0.5);
        const i = Math.max(-1, Math.min(1, Math.round(dx / g)));
        if (Math.abs(dx - i * g) >= hw) break;
        const floor = cy + 0.13 * s;
        const h = Math.max((0.17 + 0.09 * Math.sin(pose.wobble * 5 + i * 2.1 + m * 1.3)) * s * open, cell * 0.6);
        if (y < floor && y > floor - h) return "sclera";
        break;
      }
      case "prompt":
        if (side === 1) {
          if (Math.sin(pose.wobble * 6) > -0.5 && Math.abs(dx) < 0.1 * s && Math.abs(y - cy - 0.1 * s) < stroke * 0.7) return "sclera";
          break;
        }
        if (Math.min(segment(x, yy, cx - 0.07 * s, cy - 0.1 * s, cx + 0.07 * s, cy), segment(x, yy, cx + 0.07 * s, cy, cx - 0.07 * s, cy + 0.1 * s)) < stroke * 0.7) return "sclera";
        break;
      case "cursor": {
        const u = dx / (1.3 * s), v = ey / (1.3 * s);
        if (u < -0.11 || u > 0.11 || v < -0.17 || v > 0.17) break;
        if (sdPoly(u, v, CURSOR) < 0) return "sclera";
        break;
      }
      case "laser": {
        // Eyes lit solid, and a beam out of each, dithered so it reads as light.
        if (ellipse(x, y, cx, cy, 0.12 * s, Math.max(0.21 * s * open, cell * 0.6), cos, sin) < 1) return "sclera";
        if (sdCone(x, y, cx, cy, 0.03 * s, cx + m * 0.42 * s, cy + 0.1 * s, 0.05 * s) < 0) return tiny || checker(x, y, cell) ? "sclera" : null;
        break;
      }
      case "power": {
        const rr = length(dx, ey), t = stroke * 0.6;
        if (Math.abs(dx) < t && ey > -0.2 * s && ey < -0.01 * s) return "sclera";
        if (Math.abs(rr - 0.125 * s) < t && !(ey < 0 && Math.abs(dx) < 0.065 * s)) return "sclera";
        break;
      }
      case "snowflake":
        for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
          const u = dx * Math.cos(a) + ey * Math.sin(a), v = -dx * Math.sin(a) + ey * Math.cos(a);
          if (Math.abs(u) < stroke * 0.5 && Math.abs(v) < 0.16 * s) return "sclera";
        }
        break;
      case "crinkled":
        // Happy, with the lines at the corners that a real smile puts there.
        if (arc(x, y, cx, cy + 0.08 * s, 0.15 * s, stroke, true) < 0) return "sclera";
        for (const a of [-0.55, 0, 0.55]) {
          const bx = cx + m * 0.21 * s, by = cy + 0.07 * s;
          if (segment(x, y, bx + m * Math.cos(a) * 0.02 * s, by + Math.sin(a) * 0.02 * s, bx + m * Math.cos(a) * 0.09 * s, by + Math.sin(a) * 0.09 * s) < stroke * 0.45) return "sclera";
        }
        break;
      case "specs": {
        /* Glasses with the classic eye whole behind each lens. Glasses' dot eyes read as
           tiny next to everybody else's, so this is the same big eyes with glasses
           on (17 Oct 2026, on Keith Lucas's face). The rims are a touch heavier than
           Glasses' so they read as Keith's bold black frames, and the pupil is a little
           smaller than the classic's so the shrunk eye keeps enough ink to read as one. */
        const frame = sdRoundBox(dx, y - cy, SPECS_W * s, SPECS_H * s, 0.05 * s);
        if (Math.abs(frame) < stroke * 0.8) return "sclera";
        if (frame >= 0) break;
        ink = classicEye(c, cx, cy, { k: SPECS_K, pupil: 0.85 });
        break;
      }
      case "roundspecs": {
        /* Specs with round lenses and thicker rims, for Ammaar Reshi's dark round frames
           (20 Oct 2026): the same big classic eye behind each lens as Keith's. */
        const frame = length(dx, y - cy) - ROUND_SPECS_R * s;
        if (Math.abs(frame) < stroke * 0.95) return "sclera";
        if (frame >= 0) break;
        ink = classicEye(c, cx, cy, { k: SPECS_K, pupil: 0.85 });
        break;
      }
      case "dice": {
        // One on the left die and two on the right.
        if (sdRoundBox(dx, y - cy, 0.13 * s, Math.max(0.13 * s * open, cell * 0.6), 0.04 * s) >= 0) break;
        if (tiny) return "sclera";
        const pip = Math.max(0.03 * s, cell * 0.65);
        const pips = side === 1 ? [[-0.06, -0.06], [0.06, 0.06]] : [[0, 0]];
        for (const [px, py] of pips) if (length(dx - px * s, y - cy - py * s * open) < pip) return "pupil";
        return "sclera";
      }
    }
    if (ink) return ink;
  }
  return null;
}

/*
 * Specs, in face units. The lenses sit further out and lower than the standard eyes so
 * that a lens big enough for a classic eye still leaves a bridge between the two and
 * clears the hairline; further out than this and the outer rim runs off a turned face.
 * The eye is the classic one shrunk to leave a cell of lens all round it, so it never
 * touches the rim.
 */
const SPECS_X = 0.285;
const SPECS_DROP = 0.06;
const SPECS_W = 0.225;
const SPECS_H = 0.25;
const SPECS_K = 0.68;
/* Round glasses' lens: as wide as Specs' and a little shorter, so the circle still clears the hairline. */
const ROUND_SPECS_R = 0.215;

/** The arrow pointer, tip at the top left, in face units around the eye's centre. */
const CURSOR = [[-0.085, -0.16], [0.09, 0.03], [0.02, 0.035], [0.065, 0.13], [0.035, 0.145], [-0.01, 0.05], [-0.085, 0.11]] as const;

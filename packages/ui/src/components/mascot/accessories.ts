/**
 * The fourth axis: something the character wears. A hat, a crown, a halo, headphones.
 *
 * See CONTRIBUTING.md in this folder before adding one. Ids are stored in rows and URLs,
 * so the list is append-only and an id is never renamed.
 *
 * ## How one is drawn
 *
 * An accessory is a list of parts, each a signed distance in body space written against
 * the shape's `MascotHead` anchors and nothing else, so the same crown sits on a circle,
 * between a cat's ears and on a pawn's small head, and tilts, squashes, hops and morphs
 * with the body because it is sampled in the body's own coordinates. The renderer gives
 * every part a rim and the dome's lighting and dither, as it does the body, unless the
 * part is `flat`.
 *
 * Parts are tried in order and the first one a cell is inside wins, so list the front
 * pieces first. A part is drawn over the body; a `behind` part is only drawn where the
 * body is not: the back of a headphone band, a halo's far side.
 *
 * ## The two promises
 *
 * - **Never over the eyes.** The body is drawn first, the accessory over it and the eyes
 *   over both, so an eye always shows through. Until 6 Oct 2026 the renderer cut every
 *   accessory cell inside the body below a line over the eyes instead, which buried a
 *   crown behind a star's points. A part that reaches far down the face is now drawn
 *   there, under the eyes, so keep a brim on the forehead: lift it or narrow it.
 * - **Never clipped.** A look with an accessory is drawn in `MASCOT_FRAME.dressed`, which
 *   leaves 0.4 of headroom above the body box. `mascot-lookalike.test.ts` renders every
 *   accessory on every shape and fails if one reaches past it.
 *
 * ## Colours
 *
 * An accessory's colours are its own and do not follow the body, the way googly eyes are
 * plastic whatever they are stuck to. `main` and `alt` take a hex value or the id of a
 * colour in `MASCOT_COLORS`, finishes included, so a crown can be `gold` and catch the
 * light like a gold body does. A part may instead be `eye`, drawn in the body's own eye
 * colour, for a detail that should read as part of the face's ink.
 */

import type { MascotColorId } from "./colors";
import { heart, length, sdCapsule, sdCone, sdEllipse, sdPoly, sdRoundBox, sdTiltEllipse, smin } from "./geometry";
import type { MascotHead } from "./shapes";

export const MASCOT_ACCESSORIES = [
  { id: "none", label: "None" },
  { id: "crown", label: "Crown" },
  { id: "cap", label: "Cap" },
  { id: "beanie", label: "Beanie" },
  { id: "halo", label: "Halo" },
  { id: "headphones", label: "Headphones" },
  { id: "tophat", label: "Top hat" },
  { id: "bowler", label: "Bowler hat" },
  { id: "fedora", label: "Fedora" },
  { id: "cowboy", label: "Cowboy hat" },
  { id: "sombrero", label: "Sombrero" },
  { id: "boater", label: "Boater" },
  { id: "bucket", label: "Bucket hat" },
  { id: "safari", label: "Pith helmet" },
  { id: "witch", label: "Witch hat" },
  { id: "wizardhat", label: "Wizard hat" },
  { id: "party", label: "Party hat" },
  { id: "chef", label: "Chef’s hat" },
  { id: "beret", label: "Beret" },
  { id: "fez", label: "Fez" },
  { id: "captain", label: "Captain’s hat" },
  { id: "pirate", label: "Pirate hat" },
  { id: "mortarboard", label: "Graduation cap" },
  { id: "backcap", label: "Backwards cap" },
  { id: "propeller", label: "Propeller cap" },
  { id: "hardhat", label: "Hard hat" },
  { id: "viking", label: "Viking helmet" },
  { id: "knight", label: "Knight’s helmet" },
  { id: "aviator", label: "Aviator cap" },
  { id: "spacehelmet", label: "Space helmet" },
  { id: "santa", label: "Santa hat" },
  { id: "nightcap", label: "Nightcap" },
  { id: "jester", label: "Jester hat" },
  { id: "ushanka", label: "Ushanka" },
  { id: "bandana", label: "Bandana" },
  { id: "toadstool", label: "Toadstool" },
  { id: "tiara", label: "Tiara" },
  { id: "papercrown", label: "Paper crown" },
  { id: "laurel", label: "Laurel wreath" },
  { id: "flowercrown", label: "Flower crown" },
  { id: "bunnyears", label: "Bunny ears" },
  { id: "catears", label: "Cat ears" },
  { id: "bearears", label: "Bear ears" },
  { id: "horns", label: "Devil horns" },
  { id: "unihorn", label: "Unicorn horn" },
  { id: "antlers", label: "Antlers" },
  { id: "antennae", label: "Antennae" },
  { id: "mohawk", label: "Mohawk" },
  { id: "bow", label: "Bow" },
  { id: "flower", label: "Flower" },
  { id: "leaf", label: "Leaf" },
  { id: "cherries", label: "Cherries" },
  { id: "bird", label: "Bird" },
  { id: "cloud", label: "Cloud" },
  { id: "raincloud", label: "Rain cloud" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "idea", label: "Bright idea" },
  { id: "fire", label: "Fire" },
  { id: "headset", label: "Headset" },
  { id: "earmuffs", label: "Earmuffs" },
  { id: "wings", label: "Wings" },
  { id: "racingcap", label: "Racing cap" },
  { id: "neonhalo", label: "Neon halo" },
  { id: "crosspin", label: "Cross pin" },
  { id: "frontcap", label: "Cap, facing forward" },
] as const;

export type MascotAccessoryId = (typeof MASCOT_ACCESSORIES)[number]["id"];

/** Which ink a part is drawn in. */
export type AccessoryMaterial = "main" | "alt" | "eye";

export type AccessoryPart = {
  /** Under 0 inside. `x`, `y` are body space, y down; `t` is the pose's clock in seconds. */
  sd: (x: number, y: number, head: MascotHead, t: number) => number;
  material: AccessoryMaterial;
  /** Only where the body is not: drawn behind it. */
  behind?: boolean;
  /** One tone, no rim and no shading: for a line too thin to light (a halo, a band). */
  flat?: boolean;
  /**
   * How thick the part is, in body units, for the dome lighting: the distance from its
   * edge at which it reads as facing the viewer. Defaults to 0.18; a thin brim wants less.
   */
  depth?: number;
};

export type AccessoryArt = {
  /** A hex value or a `MASCOT_COLORS` id. */
  main: `#${string}` | MascotColorId;
  alt?: `#${string}` | MascotColorId;
  parts: readonly AccessoryPart[];
};

/* Each accessory below is written against `MascotHead`: `seat` is where its lower edge
   rests, `w` how wide the head is near the top, `k` a size unit that is 1 on the circle.
   Heights are multiplied by `k` so a small head gets a small hat. Keep the tallest point
   within 0.5 * k of `seat`; the dressed frame has room for that on the tallest heads, and
   the framing test says so if it stops being true. */

/** A crown's outline as a polygon about (0, 0) = the middle of its lower edge, before scaling. */
const CROWN = [
  [-1, 0], [-1, -0.62], [-0.55, -0.3], [0, -0.78], [0.55, -0.3], [1, -0.62], [1, 0],
] as const;

/* ------------------------------------------------------------------------- *
 * Head units
 * ------------------------------------------------------------------------- */

/*
 * Most of the set below is written in head units rather than body units: `u` across from
 * the head's centre line and `v` down from its seat, both measured in `k`. So v = -0.5 is
 * the tallest anything may reach, a 0.1 stroke is the same weight on a pawn as on a
 * circle, and a part reads as a picture of the hat rather than as arithmetic about the
 * head. `part` turns one back into the body-space distance the renderer samples.
 *
 * Strokes are at least 0.06 either side of their line. A cell is drawn only when its
 * centre is 0.42 of a cell inside, which at twenty-eight cells across is 0.036 of body
 * space, and on a head where `k` is 0.62 a 0.045 stroke is 0.028 of it: the antlers drew
 * no cells at all on the star and the onigiri until this said 0.06. A hat that loses its
 * tassel on a small head has lost the thing that made it that hat.
 */
type HeadSd = (u: number, v: number, h: MascotHead, t: number) => number;

function part(material: AccessoryMaterial, sd: HeadSd, options: Omit<AccessoryPart, "sd" | "material"> = {}): AccessoryPart {
  return { material, ...options, sd: (x, y, h, t) => sd((x - h.x) / h.k, (y - h.seat) / h.k, h, t) * h.k };
}

/** The head's half-width near the top, in head units. */
const headW = (h: MascotHead) => h.w / h.k;

/**
 * How far either side of the centre line a part may reach before the dressed frame cuts
 * it, in head units. The frame is 1.2 either side; 0.1 of that is left for the half cell
 * an edge needs and for the fish, whose head is off-centre.
 */
const room = (h: MascotHead) => (1.1 - Math.abs(h.x)) / h.k;

/** `f` of the head's width, never narrower than `lo` and never past the frame less `keep`. */
const span = (h: MascotHead, f: number, lo: number, keep = 0) => Math.min(Math.max(headW(h) * f, lo), room(h) - keep);

/** The ear line below the seat and the body's half-width there, in head units. */
const earV = (h: MascotHead) => (h.ear - h.seat) / h.k;
const sideU = (h: MascotHead) => h.side / h.k;

/** Nothing below `v = at`: the flat underside of a crown that sits on the head. */
const above = (d: number, v: number, at = 0) => Math.max(d, v - at);

/** Bands of half-width `half` across `s`, one every `period`. */
const stripes = (s: number, period: number, half: number) => Math.abs(s - Math.round(s / period) * period) - half;

/** `(u, v)` turned `a` radians about `(cu, cv)`, for a part drawn at an angle. */
function turn(u: number, v: number, cu: number, cv: number, a: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  const du = u - cu, dv = v - cv;
  return [du * c + dv * s, -du * s + dv * c];
}

/** A puff of three circles with a flat underside, `cv` its middle: the cloud and the rain cloud. */
function puff(u: number, v: number, cv: number) {
  const d = smin(smin(length(u + 0.19, v - cv - 0.02) - 0.13, length(u, v - cv + 0.03) - 0.16, 0.08), length(u - 0.19, v - cv - 0.02) - 0.13, 0.08);
  return Math.max(d, v - cv - 0.1);
}

/**
 * A band behind the head from one side piece to the other, over the top, the way the
 * headphones draw theirs: an arch at the ear line `e`, `s` out either side, that hugs the
 * outline because it is only drawn where the body is not.
 */
function headband(u: number, v: number, h: MascotHead, half: number) {
  const e = earV(h);
  if (v > e - 0.12) return Infinity;
  return Math.abs(sdEllipse(u, v - e, sideU(h) + 0.03, e + 0.1)) - half;
}

/** A five-pointed star about its middle, 0.22 to the points, as a polygon so its distance is exact. */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 0.1 : 0.22;
  const a = (i * Math.PI) / 5;
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
});

/** A gentle bob for things that float, in head units. */
const bob = (t: number) => Math.sin(t * 2) * 0.015;

/* A baseball cap's parts, peak to the side the still face glances. */
/**
 * How far down a forward cap comes, in head units below the seat: to the brow, halfway to
 * the ear line, so it is worn rather than perched, and never so far that the brim's lower
 * edge reaches the eyes.
 */
const capBase = (h: MascotHead) => Math.min(Math.max(earV(h) * 0.42, 0.1), 0.26);

/** A forward cap's crown: a dome from the brim up past the top of the head. */
const capCrown = (u: number, v: number, h: MascotHead) => above(sdEllipse(u, v - capBase(h), span(h, 1.04, 0.4), capBase(h) + 0.4), v, capBase(h));

const CAP_PARTS: AccessoryArt["parts"] = [
  // The button on top.
  { material: "alt", flat: true, sd: (x, y, h) => length(x - h.x, y - (h.seat - 0.36 * h.k)) - 0.05 * h.k },
  {
    // The brim, pointing the way the still face glances: to the viewer's left.
    material: "main",
    depth: 0.06,
    sd: (x, y, h) => {
      // Pulled in on the widest heads, where it used to run off the frame's left edge.
      const f = Math.min(1, (1.1 - Math.abs(h.x)) / (h.w * 1.57));
      return sdRoundBox(x - (h.x - h.w * 0.85 * f), y - (h.seat - 0.03 * h.k), h.w * 0.72 * f, 0.05 * h.k, 0.05 * h.k);
    },
  },
  {
    material: "main",
    sd: (x, y, h) => Math.max(sdEllipse(x - h.x, y - h.seat, h.w * 0.98, 0.36 * h.k), y - h.seat),
  },
];

export const ACCESSORY_ART: Record<Exclude<MascotAccessoryId, "none">, AccessoryArt> = {
  crosspin: {
    main: "#222228",
    parts: [part("main", (u, v, h) => {
      // Keep the pin above the eyes on short foreheads and legible on small heads.
      // The tall fringe retains its original fit, including the leaning stem.
      const fit = Math.max(1, 0.98 / h.k);
      const seat = Math.min(0.29, (h.ear - h.seat) / h.k - 0.55);
      const x = (u + 0.29) / fit, y = (v - seat) / fit;
      return Math.min(
        sdCapsule(x, y, -0.055, -0.18, 0.045, 0.16, 0.043),
        sdCapsule(x, y, -0.16, -0.005, 0.15, -0.06, 0.043),
      );
    }, { flat: true })],
  },
  crown: {
    main: "gold",
    alt: "#E8423A",
    parts: [
      {
        // A jewel in the middle of the band.
        material: "alt",
        flat: true,
        sd: (x, y, h) => length(x - h.x, y - (h.seat - 0.12 * h.k)) - 0.055 * h.k,
      },
      {
        material: "main",
        depth: 0.12,
        sd: (x, y, h) => {
          const half = Math.min(h.w * 0.85, 0.5 * h.k);
          const tall = 0.48 * h.k;
          return sdPoly((x - h.x) / half, (y - h.seat) / tall, CROWN) * Math.min(half, tall);
        },
      },
    ],
  },
  cap: {
    main: "#E8423A",
    alt: "#F4F3EF",
    parts: CAP_PARTS,
  },
  beanie: {
    main: "#1FB5B0",
    alt: "#F3E7C9",
    parts: [
      // The bobble.
      { material: "alt", sd: (x, y, h) => length(x - h.x, y - (h.seat - 0.44 * h.k)) - 0.1 * h.k },
      {
        // The folded cuff, a little wider than the knit above it.
        material: "alt",
        depth: 0.08,
        sd: (x, y, h) => sdRoundBox(x - h.x, y - (h.seat - 0.06 * h.k), h.w * 1.04, 0.08 * h.k, 0.06 * h.k),
      },
      {
        material: "main",
        sd: (x, y, h) => Math.max(sdEllipse(x - h.x, y - (h.seat - 0.08 * h.k), h.w * 0.98, 0.34 * h.k), y - h.seat),
      },
    ],
  },
  halo: {
    main: "#FFD45C",
    parts: [
      {
        material: "main",
        flat: true,
        sd: (x, y, h, t) => {
          const cy = h.top - 0.22 * h.k + Math.sin(t * 2) * 0.012;
          // 0.065 thick, not 0.045: thinner and the ring was a few loose dots at 28 cells.
          return Math.abs(sdEllipse(x - h.x, y - cy, 0.4 * h.k, 0.11 * h.k)) - 0.065 * h.k;
        },
      },
    ],
  },
  neonhalo: {
    main: "magenta",
    parts: [
      {
        material: "main",
        flat: true,
        sd: (x, y, h, t) => {
          const cy = h.top - 0.22 * h.k + Math.sin(t * 2) * 0.012;
          // 0.065 thick, not 0.045: thinner and the ring was a few loose dots at 28 cells.
          return Math.abs(sdEllipse(x - h.x, y - cy, 0.4 * h.k, 0.11 * h.k)) - 0.065 * h.k;
        },
      },
    ],
  },
  headphones: {
    main: "#2B2B30",
    alt: "#E8423A",
    parts: [
      {
        // Cups at the ear line, half outside the body so they read at any size.
        material: "alt",
        depth: 0.1,
        sd: (x, y, h) => sdRoundBox(Math.abs(x - h.x) - h.side, y - h.ear, 0.1 * h.k, 0.19 * h.k, 0.07 * h.k),
      },
      {
        // The band, an arch from cup to cup over the top of the head, behind the body so
        // it hugs the outline rather than crossing the forehead.
        material: "main",
        behind: true,
        sd: (x, y, h) => {
          if (y > h.ear - 0.12 * h.k) return Infinity;
          const rx = h.side + 0.03;
          const ry = h.ear - (h.top - 0.1 * h.k);
          return Math.abs(sdEllipse(x - h.x, y - h.ear, rx, ry)) - 0.06 * h.k;
        },
      },
    ],
  },

  /* Hats with a brim. The brim is listed before the crown so it reads as in front of it,
     and every width goes through `span`, so the widest sombrero stops at the frame. */

  tophat: {
    main: "#4A4A54",
    alt: "#E8423A",
    parts: [
      part("alt", (u, v, h) => Math.max(sdRoundBox(u, v + 0.27, span(h, 0.68, 0.3), 0.23, 0.04), Math.abs(v + 0.14) - 0.05), { depth: 0.08 }),
      part("main", (u, v, h) => sdRoundBox(u, v + 0.03, span(h, 1.05, 0.46), 0.065, 0.06), { depth: 0.06 }),
      part("main", (u, v, h) => sdRoundBox(u, v + 0.27, span(h, 0.68, 0.3), 0.23, 0.04)),
    ],
  },
  bowler: {
    main: "#57504A",
    alt: "#2E2A28",
    parts: [
      part("alt", (u, v, h) => Math.max(above(sdEllipse(u, v + 0.05, span(h, 0.82, 0.34), 0.37), v, -0.04), Math.abs(v + 0.1) - 0.045)),
      part("main", (u, v, h) => {
        const b = span(h, 1.08, 0.44);
        return sdRoundBox(u, v + 0.03 + 0.1 * (u / b) ** 2, b, 0.055, 0.05);
      }, { depth: 0.06 }),
      part("main", (u, v, h) => above(sdEllipse(u, v + 0.05, span(h, 0.82, 0.34), 0.37), v, -0.04)),
    ],
  },
  fedora: {
    main: "#7A7068",
    alt: "#2B2B30",
    parts: [
      part("alt", (u, v, h) => Math.max(fedoraCrown(u, v, h), Math.abs(v + 0.1) - 0.05)),
      part("main", (u, v, h) => {
        const b = span(h, 1.15, 0.48);
        return sdRoundBox(u, v + 0.03 + 0.08 * (u / b) ** 2, b, 0.055, 0.05);
      }, { depth: 0.06 }),
      part("main", fedoraCrown),
    ],
  },
  cowboy: {
    main: "#B07A45",
    alt: "#5A3A22",
    parts: [
      part("alt", (u, v, h) => Math.max(cowboyCrown(u, v, h), Math.abs(v + 0.11) - 0.045)),
      part("main", (u, v, h) => {
        const b = span(h, 1.3, 0.55);
        return sdRoundBox(u, v + 0.04 + 0.16 * (u / b) ** 2, b, 0.06, 0.06);
      }, { depth: 0.06 }),
      part("main", cowboyCrown),
    ],
  },
  sombrero: {
    main: "#E3B85A",
    alt: "#D7263D",
    parts: [
      part("alt", (u, v, h) => Math.max(sombreroCrown(u, v, h), Math.abs(v + 0.1) - 0.045)),
      part("main", (u, v, h) => {
        const b = span(h, 1.7, 0.66);
        return sdRoundBox(u, v + 0.02 + 0.14 * (Math.abs(u) / b) ** 3, b, 0.06, 0.06);
      }, { depth: 0.06 }),
      part("main", sombreroCrown),
    ],
  },
  boater: {
    main: "#E3C27A",
    alt: "#2F5DA8",
    parts: [
      part("alt", (u, v, h) => Math.max(sdRoundBox(u, v + 0.18, span(h, 0.75, 0.32), 0.16, 0.03), Math.abs(v + 0.1) - 0.05), { flat: true }),
      part("main", (u, v, h) => sdRoundBox(u, v + 0.02, span(h, 1.15, 0.5), 0.055, 0.04), { depth: 0.06 }),
      part("main", (u, v, h) => sdRoundBox(u, v + 0.18, span(h, 0.75, 0.32), 0.16, 0.03)),
    ],
  },
  bucket: {
    main: "#4F6D8F",
    alt: "#2F4560",
    parts: [
      part("alt", (u, v, h) => Math.max(bucketCrown(u, v, h), Math.abs(v + 0.11) - 0.04)),
      part("main", (u, v, h) => {
        const c = Math.min(span(h, 0.85, 0.36), (room(h) - 0.04) / 1.38);
        return sdPoly(u, v, [[-c * 1.38, 0.08], [c * 1.38, 0.08], [c * 1.02, -0.06], [-c * 1.02, -0.06]]) - 0.02;
      }, { depth: 0.08 }),
      part("main", bucketCrown),
    ],
  },
  safari: {
    main: "#D8C79B",
    alt: "#8C7E58",
    parts: [
      part("alt", (u, v, h) => Math.max(safariCrown(u, v, h), Math.abs(v + 0.1) - 0.045)),
      part("main", (u, v, h) => sdEllipse(u, v + 0.03, span(h, 1.22, 0.5), 0.075), { depth: 0.06 }),
      part("main", (u, v) => length(u, v + 0.45) - 0.045),
      part("main", safariCrown),
    ],
  },

  /* Cones and soft hats. */

  witch: {
    main: "#4B3966",
    alt: "#8E5BD9",
    parts: [
      part("alt", (u, v, h) => Math.max(witchCone(u, v, h), Math.abs(v + 0.1) - 0.045)),
      part("main", (u, v, h) => sdRoundBox(u, v + 0.05, span(h, 1.25, 0.5), 0.055, 0.05), { depth: 0.06 }),
      part("main", witchCone),
    ],
  },
  wizardhat: {
    main: "#3550C8",
    alt: "#FFD45C",
    parts: [
      part("alt", (u, v) => sdPoly((u + 0.02) * 2, (v + 0.19) * 2, STAR) / 2, { flat: true }),
      part("main", (u, v, h) => sdRoundBox(u, v, span(h, 0.85, 0.36) + 0.07, 0.05, 0.05), { depth: 0.06 }),
      part("main", (u, v, h) => {
        const c = span(h, 0.85, 0.36);
        return sdPoly(u, v, [[-c, 0], [c, 0], [-0.08, -0.48]]) - 0.015;
      }),
    ],
  },
  party: {
    main: "#FF5FA2",
    alt: "#FFD45C",
    parts: [
      part("alt", (u, v) => length(u, v + 0.41) - 0.09),
      part("alt", (u, v, h) => Math.max(partyCone(u, v, h), stripes(v - u * 0.5, 0.19, 0.05)), { flat: true }),
      part("main", partyCone),
    ],
  },
  chef: {
    main: "#FAF9F6",
    parts: [
      part("main", (u, v, h) => sdRoundBox(u, v + 0.07, span(h, 0.72, 0.34), 0.08, 0.03), { depth: 0.08 }),
      part("main", (u, v, h) => {
        const b = span(h, 0.72, 0.34);
        const top = smin(smin(length(u + b * 0.55, v + 0.27) - 0.16, length(u, v + 0.32) - 0.18, 0.1), length(u - b * 0.55, v + 0.27) - 0.16, 0.1);
        return smin(top, sdRoundBox(u, v + 0.2, b * 0.95, 0.1, 0.05), 0.08);
      }),
    ],
  },
  beret: {
    main: "#D7263D",
    parts: [
      part("main", (u, v) => length(u - 0.03, v + 0.31) - 0.05),
      part("main", (u, v, h) => {
        const c = span(h, 1.0, 0.42, 0.2) / 1.05;
        return above(sdTiltEllipse(u, v, -c * 0.12, -0.13, c * 1.05, 0.17, 0.12), v, 0.02);
      }),
    ],
  },
  fez: {
    main: "#C8102E",
    alt: "#FFC53D",
    parts: [
      part("alt", (u, v, h) => {
        const c = Math.min(span(h, 0.62, 0.28), 0.36) * 0.78;
        return Math.min(sdCapsule(u, v, 0, -0.37, c + 0.08, -0.24, 0.06), sdRoundBox(u - (c + 0.1), v + 0.13, 0.05, 0.09, 0.03));
      }, { flat: true }),
      part("main", (u, v, h) => {
        const c = Math.min(span(h, 0.62, 0.28), 0.36);
        return sdPoly(u, v, [[-c, 0.02], [c, 0.02], [c * 0.78, -0.36], [-c * 0.78, -0.36]]) - 0.02;
      }),
    ],
  },
  captain: {
    main: "#FAF9F6",
    alt: "#1F2D4D",
    parts: [
      part("alt", (u, v, h) => sdRoundBox(u, v + 0.1, span(h, 0.82, 0.34, 0.1), 0.08, 0.03), { depth: 0.08 }),
      part("main", (u, v, h) => {
        const c = span(h, 0.82, 0.34, 0.1) * 0.95;
        return sdPoly(u, v, [[-c, -0.16], [c, -0.16], [c * 1.28, -0.4], [-c * 1.28, -0.4]]) - 0.03;
      }),
    ],
  },
  pirate: {
    main: "#403C48",
    alt: "#F4F3EF",
    parts: [
      part("alt", (u, v) => length(u, v + 0.24) - 0.075, { flat: true }),
      part("alt", (u, v, h) => {
        const b = span(h, 1.15, 0.5);
        const floor = v - (0.03 - 0.2 * (u / b) ** 2);
        return Math.max(pirateHat(u, v, h), Math.abs(floor + 0.06) - 0.04);
      }, { flat: true }),
      part("main", pirateHat),
    ],
  },
  mortarboard: {
    main: "#40404A",
    alt: "#FFC53D",
    parts: [
      part("alt", (u, v, h) => {
        const b = span(h, 1.0, 0.45) * 0.8;
        return Math.min(sdCapsule(u, v, 0, -0.33, b, -0.3, 0.06), sdCapsule(u, v, b, -0.3, b, -0.12, 0.06), sdRoundBox(u - b, v + 0.08, 0.055, 0.07, 0.03));
      }, { flat: true }),
      part("main", (u, v, h) => {
        const b = span(h, 1.0, 0.45);
        return sdPoly(u, v, [[-b, -0.33], [0, -0.43], [b, -0.33], [0, -0.23]]);
      }, { depth: 0.06 }),
      part("main", (u, v, h) => sdRoundBox(u, v + 0.12, span(h, 1.0, 0.45) * 0.6, 0.13, 0.04)),
    ],
  },
  /* A baseball cap worn the way most people wear one in a photo: brim to the front, seen
     from the front, so it reads as a lens across the forehead rather than a peak to one
     side. Black, the colour most caps in photos are. Drawn on 2 Nov 2026 from a real one: the
     side-on `cap` read as somebody else's hat. Kept beside it rather than redrawing it,
     because `cap` is in saved looks. */
  frontcap: {
    main: "#2A2A30",
    alt: "#45454D",
    parts: [
      // The button on top.
      part("alt", (u, v, h) => length(u, v - capBase(h) + 0.44) - 0.055, { flat: true }),
      // The brim, coming toward the viewer: the lower half of a wide, shallow lens across
      // the brow. Lighter than the crown, as its top catches the light.
      part("alt", (u, v, h) => {
        const w = Math.min(span(h, 1.04, 0.4) * 1.08, room(h));
        return Math.max(sdEllipse(u, v - capBase(h), w, 0.13), capBase(h) - v);
      }, { depth: 0.05 }),
      // The seam down the front panel, and the crown pulled down over the head to the brim.
      part("alt", (u, v, h) => Math.max(Math.abs(u) - 0.025, capCrown(u, v, h)), { flat: true }),
      part("main", (u, v, h) => capCrown(u, v, h)),
    ],
  },
  backcap: {
    main: "#1B6CA8",
    alt: "#F4F3EF",
    parts: [
      // The adjuster at the back, which is now the front.
      part("alt", (u, v) => sdRoundBox(u, v + 0.05, 0.13, 0.05, 0.03), { depth: 0.06 }),
      part("main", (u, v, h) => {
        const c = Math.min(span(h, 0.98, 0.38), (room(h) - 0.42) / 0.95);
        const [a, b] = turn(u, v, c * 0.95 + 0.18, -0.12, 0.35);
        return sdRoundBox(a, b, 0.22, 0.05, 0.05);
      }, { depth: 0.06 }),
      part("main", (u, v, h) => above(sdEllipse(u, v, Math.min(span(h, 0.98, 0.38), (room(h) - 0.42) / 0.95), 0.36), v)),
    ],
  },
  propeller: {
    main: "#E8423A",
    alt: "#FFD45C",
    parts: [
      // The blades, turning on the pose's clock.
      part("alt", (u, v, h, t) => sdEllipse(u, v + 0.44, 0.07 + 0.23 * Math.abs(Math.cos(t * 14)), 0.045)),
      part("main", (u, v) => sdRoundBox(u, v + 0.38, 0.04, 0.06, 0.02), { flat: true }),
      part("alt", (u, v, h) => Math.max(above(sdEllipse(u, v, span(h, 0.98, 0.38), 0.34), v), stripes(u, span(h, 0.98, 0.38) * 0.9, span(h, 0.98, 0.38) * 0.2)), { flat: true }),
      part("main", (u, v, h) => above(sdEllipse(u, v, span(h, 0.98, 0.38), 0.34), v)),
    ],
  },

  /* Helmets. */

  hardhat: {
    main: "#FFC53D",
    alt: "#E39A12",
    parts: [
      part("alt", (u, v, h) => Math.max(above(sdEllipse(u, v + 0.03, span(h, 0.95, 0.38), 0.38), v, -0.03), Math.abs(u) - 0.05), { flat: true }),
      part("main", (u, v, h) => sdRoundBox(u, v + 0.02, Math.min(span(h, 0.95, 0.38) * 1.18, room(h)), 0.05, 0.05), { depth: 0.06 }),
      part("main", (u, v, h) => above(sdEllipse(u, v + 0.03, span(h, 0.95, 0.38), 0.38), v, -0.03)),
    ],
  },
  viking: {
    main: "silver",
    alt: "#F1E4C3",
    parts: [
      part("alt", (u, v, h) => {
        const d = Math.min(span(h, 0.95, 0.38), (room(h) - 0.25) / 0.8) * 0.8;
        return smin(sdCone(Math.abs(u), v, d, -0.12, 0.09, d + 0.16, -0.3, 0.05), sdCone(Math.abs(u), v, d + 0.16, -0.3, 0.05, d + 0.12, -0.47, 0.02), 0.04);
      }),
      part("main", (u, v, h) => above(sdEllipse(u, v + 0.02, Math.min(span(h, 0.95, 0.38), (room(h) - 0.25) / 0.8), 0.34), v, -0.02)),
    ],
  },
  knight: {
    main: "silver",
    alt: "#D7263D",
    parts: [
      // The crest, a brush along the top.
      part("alt", (u, v) => Math.max(sdEllipse(u, v + 0.32, 0.34, 0.18), v + 0.26)),
      part("main", (u, v, h) => Math.max(above(sdEllipse(u, v + 0.02, span(h, 0.92, 0.38), 0.36), v, -0.02), Math.abs(v + 0.07) - 0.05), { depth: 0.08 }),
      part("main", (u, v, h) => above(sdEllipse(u, v + 0.02, span(h, 0.92, 0.38), 0.36), v, -0.02)),
    ],
  },
  aviator: {
    main: "#8A5A3C",
    alt: "#7FD3F7",
    parts: [
      part("alt", (u, v) => Math.min(length(u + 0.16, v + 0.2) - 0.1, length(u - 0.16, v + 0.2) - 0.1), { depth: 0.08 }),
      part("main", (u, v, h) => Math.max(above(sdEllipse(u, v, span(h, 0.98, 0.38), 0.34), v), Math.abs(v + 0.2) - 0.05), { depth: 0.06 }),
      part("main", (u, v, h) => above(sdEllipse(u, v, span(h, 0.98, 0.38), 0.34), v)),
    ],
  },
  spacehelmet: {
    main: "#9FD8FF",
    alt: "#FFFFFF",
    parts: [
      // A glint on the glass, top left, and the glass itself: an arch behind the head
      // from the ear line up, so it reads as a dome over it on any outline.
      part("alt", (u, v, h) => {
        const e = Math.max(earV(h), 0.35);
        const rx = Math.min(Math.max(sideU(h) + 0.14, (e + 0.46) * 0.8), room(h) - 0.06);
        const d = Math.abs(sdEllipse(u, v - e, rx - 0.13, e + 0.33)) - 0.04;
        return Math.max(d, u + rx * 0.4, v - e + (e + 0.33) * 0.6);
      }, { behind: true, flat: true }),
      part("main", (u, v, h) => {
        const e = Math.max(earV(h), 0.35);
        const rx = Math.min(Math.max(sideU(h) + 0.14, (e + 0.46) * 0.8), room(h) - 0.06);
        return Math.max(Math.abs(sdEllipse(u, v - e, rx, e + 0.4)) - 0.06, v - e);
      }, { behind: true, depth: 0.05 }),
    ],
  },

  /* Hats that flop. */

  santa: {
    main: "#D7263D",
    alt: "#F7F6F2",
    parts: [
      part("alt", (u, v, h) => length(u - (Math.min(span(h, 0.98, 0.38), room(h) - 0.34) + 0.18), v + 0.1) - 0.1),
      part("alt", (u, v, h) => sdRoundBox(u, v + 0.07, Math.min(span(h, 0.98, 0.38), room(h) - 0.34) * 1.06, 0.075, 0.07), { depth: 0.08 }),
      part("main", (u, v, h) => {
        const c = Math.min(span(h, 0.98, 0.38), room(h) - 0.34);
        return smin(above(sdEllipse(u, v + 0.02, c, 0.4), v, -0.02), sdCone(u, v, c * 0.2, -0.28, 0.14, c + 0.14, -0.14, 0.05), 0.08);
      }),
    ],
  },
  nightcap: {
    main: "#4B6CD1",
    alt: "#F4F3EF",
    parts: [
      part("alt", (u, v, h) => length(u - (Math.min(span(h, 0.95, 0.36), room(h) - 0.3) + 0.14), v - 0.17) - 0.08),
      part("alt", (u, v, h) => Math.max(nightcap(u, v, h), stripes(u + v, 0.22, 0.055)), { flat: true }),
      part("main", nightcap),
    ],
  },
  jester: {
    main: "#7B3FC4",
    alt: "#FFC53D",
    parts: [
      // Two points in two colours, each with a bell in the other's.
      part("alt", (u, v, h) => length(u + jesterWidth(h) + 0.18, v + 0.36) - 0.07),
      part("main", (u, v, h) => length(u - jesterWidth(h) - 0.18, v + 0.36) - 0.07),
      part("main", (u, v, h) => jesterHalf(u, v, h)),
      part("alt", (u, v, h) => jesterHalf(-u, v, h)),
    ],
  },
  ushanka: {
    main: "#7A5638",
    alt: "#E9DCC6",
    parts: [
      part("alt", (u, v, h) => sdRoundBox(u, v, Math.min(span(h, 1.02, 0.4), room(h) - 0.16) * 1.04, 0.1, 0.08), { depth: 0.08 }),
      part("alt", (u, v, h) => sdTiltEllipse(Math.abs(u), v, Math.min(span(h, 1.02, 0.4), room(h) - 0.16) + 0.08, -0.12, 0.1, 0.16, 0.6)),
      part("main", (u, v, h) => above(sdEllipse(u, v + 0.04, Math.min(span(h, 1.02, 0.4), room(h) - 0.16), 0.38), v)),
    ],
  },
  bandana: {
    main: "#D7263D",
    alt: "#F4F3EF",
    parts: [
      part("alt", (u, v, h) => Math.max(bandana(u, v, h), length(u - Math.round(u / 0.2) * 0.2, v - Math.round(v / 0.2) * 0.2) - 0.045), { flat: true }),
      part("main", (u, v, h) => {
        const d = Math.min(span(h, 1.0, 0.4), room(h) - 0.3);
        return Math.min(
          sdPoly(u, v, [[d * 0.85, -0.08], [d + 0.26, -0.04], [d + 0.2, 0.08]]),
          sdPoly(u, v, [[d * 0.85, -0.04], [d + 0.14, 0.2], [d + 0.02, 0.22]]),
        ) - 0.02;
      }),
      part("main", bandana),
    ],
  },
  toadstool: {
    main: "#E8423A",
    alt: "#F7F6F2",
    parts: [
      part("alt", (u, v, h) => Math.min(length(u, v + 0.3) - 0.08, length(Math.abs(u) - span(h, 1.1, 0.44) * 0.58, v + 0.14) - 0.075), { flat: true }),
      part("main", (u, v, h) => above(sdEllipse(u, v + 0.03, span(h, 1.1, 0.44), 0.44), v, -0.03)),
    ],
  },

  /* Crowns and wreaths. */

  tiara: {
    main: "silver",
    alt: "#F06AA8",
    parts: [
      part("alt", (u, v) => length(u, v + 0.22) - 0.075, { flat: true }),
      part("main", (u, v, h) => {
        const t = span(h, 0.78, 0.34);
        return sdPoly(u, v, [[-t, -0.04], [t, -0.04], [t * 0.85, -0.18], [t * 0.45, -0.22], [0, -0.42], [-t * 0.45, -0.22], [-t * 0.85, -0.18]]) - 0.02;
      }, { depth: 0.08 }),
    ],
  },
  papercrown: {
    main: "#FFE066",
    parts: [
      part("main", (u, v, h) => {
        const p = span(h, 0.85, 0.36);
        return sdPoly(u, v, [[-p, 0.02], [p, 0.02], [p, -0.36], [p * 0.5, -0.17], [0, -0.38], [-p * 0.5, -0.17], [-p, -0.36]]);
      }, { depth: 0.06 }),
    ],
  },
  laurel: {
    main: "#4E9A3A",
    alt: "#7CC45A",
    parts: [
      part("alt", (u, v, h) => laurelLeaves(u, v, h, 1)),
      part("main", (u, v, h) => laurelLeaves(u, v, h, 0)),
    ],
  },
  flowercrown: {
    main: "#4E9A3A",
    alt: "#FF8FB8",
    parts: [
      part("alt", (u, v, h) => {
        const r = span(h, 0.98, 0.42);
        let d = Infinity;
        for (const a of [0, 0.62, -0.62, 1.15, -1.15]) {
          const fu = u - r * Math.sin(a), fv = v - (0.02 - 0.3 * Math.cos(a));
          d = Math.min(d, length(fu, fv) - 0.125 * (0.82 + 0.18 * Math.cos(5 * Math.atan2(fu, -fv))));
        }
        return d;
      }),
      part("main", (u, v, h) => Math.max(Math.abs(sdEllipse(u, v - 0.02, span(h, 0.98, 0.42), 0.3)) - 0.05, v), { flat: true }),
    ],
  },

  /* Things that grow out of the head. */

  bunnyears: {
    main: "#F4F3EF",
    alt: "#F59BB8",
    parts: [
      part("alt", (u, v, h) => sdTiltEllipse(Math.abs(u), v, earSpread(h, 0.45, 0.16, 0.3), -0.25, 0.06, 0.15, -0.2)),
      part("main", (u, v, h) => sdTiltEllipse(Math.abs(u), v, earSpread(h, 0.45, 0.16, 0.3), -0.27, 0.12, 0.22, -0.2)),
    ],
  },
  catears: {
    main: "#45454E",
    alt: "#F59BB8",
    parts: [
      part("alt", (u, v, h) => {
        const s = earSpread(h, 0.55, 0.18, 0.34);
        return sdPoly(Math.abs(u), v, [[s - 0.07, -0.04], [s + 0.08, -0.04], [s + 0.05, -0.24]]);
      }, { flat: true }),
      part("main", (u, v, h) => {
        const s = earSpread(h, 0.55, 0.18, 0.34);
        return sdPoly(Math.abs(u), v, [[s - 0.17, 0.02], [s + 0.15, 0.02], [s + 0.06, -0.38]]) - 0.02;
      }),
    ],
  },
  bearears: {
    main: "#8A5A3C",
    alt: "#E2C79A",
    parts: [
      part("alt", (u, v, h) => length(Math.abs(u) - earSpread(h, 0.62, 0.2, 0.4), v + 0.2) - 0.075),
      part("main", (u, v, h) => length(Math.abs(u) - earSpread(h, 0.62, 0.2, 0.4), v + 0.2) - 0.15),
    ],
  },
  horns: {
    main: "#E8423A",
    parts: [
      part("main", (u, v, h) => {
        const s = earSpread(h, 0.5, 0.16, 0.32);
        const au = Math.abs(u);
        return smin(sdCone(au, v, s, 0, 0.1, s + 0.12, -0.22, 0.06), sdCone(au, v, s + 0.12, -0.22, 0.07, s + 0.04, -0.42, 0.04), 0.04);
      }),
    ],
  },
  unihorn: {
    main: "#F7D774",
    alt: "#F59BB8",
    parts: [
      part("alt", (u, v) => Math.max(sdCone(u, v, 0, 0, 0.18, 0.05, -0.46, 0.04), stripes(v + u * 1.2, 0.13, 0.03)), { flat: true }),
      part("main", (u, v) => sdCone(u, v, 0, 0, 0.18, 0.05, -0.46, 0.04)),
    ],
  },
  antlers: {
    main: "#9A6A44",
    parts: [
      part("main", (u, v) => {
        const au = Math.abs(u);
        return Math.min(
          sdCapsule(au, v, 0.16, 0.02, 0.32, -0.42, 0.065),
          sdCapsule(au, v, 0.24, -0.18, 0.45, -0.28, 0.06),
          sdCapsule(au, v, 0.29, -0.32, 0.17, -0.42, 0.06),
        );
      }, { flat: true }),
    ],
  },
  antennae: {
    main: "#55555F",
    alt: "#FF5FA2",
    parts: [
      part("alt", (u, v, h, t) => length(Math.abs(u) - 0.24, v + 0.37 + Math.sin(t * 3) * 0.01) - 0.12),
      part("main", (u, v) => sdCapsule(Math.abs(u), v, 0.12, 0.02, 0.23, -0.3, 0.06), { flat: true }),
    ],
  },
  mohawk: {
    main: "#FF3D9A",
    parts: [
      part("main", (u, v) => {
        let d = Infinity;
        for (const [c, top] of [[-0.2, -0.38], [0, -0.48], [0.2, -0.38]]) d = Math.min(d, sdPoly(u, v, [[c - 0.13, 0.02], [c + 0.13, 0.02], [c + 0.03, top]]));
        return d - 0.01;
      }),
    ],
  },
  bow: {
    main: "#FF5FA2",
    alt: "#D93D86",
    parts: [
      part("alt", (u, v) => length(u, v + 0.2) - 0.075),
      part("main", (u, v) => sdPoly(Math.abs(u), v, [[0.03, -0.2], [0.32, -0.41], [0.34, -0.02]]) - 0.035),
    ],
  },
  flower: {
    main: "#FF7EB3",
    alt: "#FFD45C",
    parts: [
      part("alt", (u, v, h) => length(u - earSpread(h, 0.62, 0.18, 0.42), v + 0.26) - 0.075),
      part("main", (u, v, h) => {
        const fu = u - earSpread(h, 0.62, 0.18, 0.42), fv = v + 0.26;
        return length(fu, fv) - 0.19 * (0.75 + 0.25 * Math.cos(5 * Math.atan2(fu, -fv)));
      }),
    ],
  },
  leaf: {
    main: "#E67E22",
    alt: "#8A5A3C",
    parts: [
      part("alt", (u, v) => sdCapsule(u, v, 0, 0.02, 0.03, -0.12, 0.06), { flat: true }),
      part("main", (u, v) => sdTiltEllipse(u, v, 0.1, -0.27, 0.13, 0.22, 0.6)),
    ],
  },
  cherries: {
    main: "#D7263D",
    alt: "#4E9A3A",
    parts: [
      part("main", (u, v) => Math.min(length(u + 0.15, v + 0.1) - 0.135, length(u - 0.17, v + 0.08) - 0.135)),
      part("alt", (u, v) => Math.min(
        sdCapsule(u, v, -0.13, -0.12, 0.02, -0.42, 0.06),
        sdCapsule(u, v, 0.15, -0.1, 0.02, -0.42, 0.06),
        sdTiltEllipse(u, v, 0.11, -0.43, 0.1, 0.05, -0.3),
      ), { flat: true }),
    ],
  },
  bird: {
    main: "#5CC8FF",
    alt: "#FFA53D",
    parts: [
      part("alt", (u, v) => sdPoly(u, v, [[-0.2, -0.34], [-0.32, -0.29], [-0.2, -0.25]])),
      part("main", (u, v) => smin(smin(sdEllipse(u - 0.04, v + 0.16, 0.2, 0.14), length(u + 0.12, v + 0.3) - 0.1, 0.06), sdPoly(u, v, [[0.18, -0.16], [0.36, -0.29], [0.32, -0.12]]), 0.03)),
    ],
  },

  /* Things that float above. Each keeps a gap over the head, so it reads as floating. */

  cloud: {
    main: "#FFFFFF",
    parts: [part("main", (u, v, h, t) => puff(u, v, -0.29 + bob(t)))],
  },
  raincloud: {
    main: "#8D93A0",
    alt: "#5CC8FF",
    parts: [
      part("main", (u, v, h, t) => puff(u, v, -0.29 + bob(t))),
      part("alt", (u, v, h, t) => {
        const fall = ((t * 0.8) % 1) * 0.04;
        return Math.min(sdCapsule(u, v, -0.1, -0.18 + fall, -0.1, -0.12 + fall, 0.045), sdCapsule(u, v, 0.11, -0.17 + fall, 0.11, -0.11 + fall, 0.045));
      }, { flat: true }),
    ],
  },
  star: {
    main: "gold",
    parts: [part("main", (u, v, h, t) => sdPoly(u, v + 0.27 + bob(t), STAR) - 0.02)],
  },
  heart: {
    main: "#FF4D6D",
    parts: [part("main", (u, v, h, t) => heart(u, v + 0.3 + bob(t), 0.38))],
  },
  idea: {
    main: "#FFE066",
    alt: "#8C8E94",
    parts: [
      part("alt", (u, v, h, t) => sdRoundBox(u, v + 0.15 + bob(t), 0.075, 0.05, 0.02)),
      part("main", (u, v, h, t) => length(u, v + 0.33 + bob(t)) - 0.145),
    ],
  },
  fire: {
    main: "#FF7A2F",
    alt: "#FFD45C",
    parts: [
      part("alt", (u, v, h, t) => smin(sdEllipse(u, v + 0.12, 0.11, 0.1), sdPoly(u, v, [[-0.09, -0.15], [0.09, -0.15], [Math.sin(t * 9) * 0.015, -0.34]]), 0.04)),
      part("main", (u, v, h, t) => smin(sdEllipse(u, v + 0.15, 0.2, 0.16), sdPoly(u, v, [[-0.16, -0.2], [0.16, -0.2], [0.03 + Math.sin(t * 9) * 0.025, -0.49]]), 0.06)),
    ],
  },

  /* Side pieces, at the ear line, half outside the body so they read at any size. */

  headset: {
    main: "#45454E",
    alt: "#3DDC97",
    parts: [
      part("alt", (u, v, h) => length(u + sideAt(h, 0.12) + 0.04, v - earV(h) - 0.42) - 0.085),
      part("alt", (u, v, h) => sdRoundBox(Math.abs(u) - sideAt(h, 0.12) - 0.06, v - earV(h), 0.035, 0.1, 0.03), { flat: true }),
      part("main", (u, v, h) => sdRoundBox(Math.abs(u) - sideAt(h, 0.12), v - earV(h), 0.11, 0.19, 0.08), { depth: 0.1 }),
      part("main", (u, v, h) => sdCapsule(u, v, -sideAt(h, 0.12) - 0.08, earV(h) + 0.12, -sideAt(h, 0.12) - 0.04, earV(h) + 0.4, 0.06), { flat: true }),
      part("main", (u, v, h) => headband(u, v, h, 0.07), { behind: true }),
    ],
  },
  earmuffs: {
    main: "#F59BB8",
    alt: "#C6C8CE",
    parts: [
      part("main", (u, v, h) => {
        const mu = Math.abs(u) - sideAt(h, 0.17), mv = v - earV(h);
        return length(mu, mv) - 0.17 * (1 + 0.1 * Math.cos(9 * Math.atan2(mv, mu)));
      }),
      part("alt", (u, v, h) => headband(u, v, h, 0.05), { behind: true }),
    ],
  },
  wings: {
    main: "#FFFFFF",
    parts: [
      part("main", (u, v, h) => sdTiltEllipse(Math.abs(u), v, sideAt(h, 0.4) + 0.2, earV(h) - 0.14, 0.24, 0.11, -0.5), { behind: true }),
      part("main", (u, v, h) => sdTiltEllipse(Math.abs(u), v, sideAt(h, 0.4) + 0.17, earV(h) + 0.0, 0.21, 0.09, -0.25), { behind: true }),
      part("main", (u, v, h) => sdTiltEllipse(Math.abs(u), v, sideAt(h, 0.4) + 0.12, earV(h) + 0.11, 0.15, 0.075, 0), { behind: true }),
    ],
  },
  racingcap: {
    // A black cap worn straight, brim to the front: seen face on, the brim is a band
    // across the forehead a little wider than the crown, not a peak off to one side.
    main: "#1D1D20",
    alt: "#3A3A40",
    parts: [
      // The button on top.
      { material: "alt", flat: true, sd: (x, y, h) => length(x - h.x, y - (h.seat - 0.36 * h.k)) - 0.05 * h.k },
      {
        // The brim, face on: a flat band at the seat, its front edge catching the light.
        material: "alt",
        depth: 0.06,
        sd: (x, y, h) => sdRoundBox(x - h.x, y - (h.seat + 0.01 * h.k), h.w * 1.04, 0.06 * h.k, 0.06 * h.k),
      },
      {
        material: "main",
        sd: (x, y, h) => Math.max(sdEllipse(x - h.x, y - h.seat, h.w * 0.98, 0.36 * h.k), y - h.seat),
      },
    ],
  },
};

/* The crowns of the brimmed hats, each used twice: once for itself and once to clip its
   band to. */

function fedoraCrown(u: number, v: number, h: MascotHead) {
  const c = span(h, 1.15, 0.48) * 0.66;
  return sdPoly(u, v, [[-c, 0], [c, 0], [c * 0.86, -0.36], [c * 0.3, -0.4], [0, -0.33], [-c * 0.3, -0.4], [-c * 0.86, -0.36]]) - 0.03;
}

function cowboyCrown(u: number, v: number, h: MascotHead) {
  const c = span(h, 1.3, 0.55) * 0.55;
  return Math.max(above(sdEllipse(u, v + 0.06, c, 0.4), v, -0.02), -(length(u, v + 0.5) - 0.1));
}

function sombreroCrown(u: number, v: number, h: MascotHead) {
  const c = Math.min(span(h, 1.7, 0.66) * 0.42, 0.4);
  return above(sdEllipse(u, v + 0.14, c, 0.34), v, -0.02);
}

function bucketCrown(u: number, v: number, h: MascotHead) {
  const c = Math.min(span(h, 0.85, 0.36), (room(h) - 0.04) / 1.38);
  return sdPoly(u, v, [[-c, 0], [c, 0], [c * 0.78, -0.34], [-c * 0.78, -0.34]]) - 0.03;
}

function safariCrown(u: number, v: number, h: MascotHead) {
  return above(sdEllipse(u, v + 0.06, span(h, 0.88, 0.36), 0.38), v, -0.04);
}

function witchCone(u: number, v: number, h: MascotHead) {
  const c = span(h, 0.6, 0.28);
  return sdPoly(u, v, [[-c, -0.04], [c, -0.04], [0.12, -0.3], [0.34, -0.47], [-0.02, -0.38]]) - 0.02;
}

function partyCone(u: number, v: number, h: MascotHead) {
  const c = span(h, 0.66, 0.3);
  return sdPoly(u, v, [[-c, 0.01], [c, 0.01], [0, -0.4]]);
}

function pirateHat(u: number, v: number, h: MascotHead) {
  const b = span(h, 1.15, 0.5);
  return Math.max(sdEllipse(u, v + 0.03, b, 0.44), v - (0.03 - 0.2 * (u / b) ** 2));
}

function nightcap(u: number, v: number, h: MascotHead) {
  const c = Math.min(span(h, 0.95, 0.36), room(h) - 0.3);
  return smin(above(sdEllipse(u, v + 0.02, c, 0.34), v, -0.02), sdCone(u, v, c * 0.25, -0.22, 0.13, c + 0.12, 0.1, 0.04), 0.1);
}

const jesterWidth = (h: MascotHead) => Math.min(span(h, 0.9, 0.36), room(h) - 0.3);

/** The viewer's left half of the jester's hat; the right is the same drawn mirrored. */
function jesterHalf(u: number, v: number, h: MascotHead) {
  const d = jesterWidth(h);
  const dome = Math.max(above(sdEllipse(u, v, d, 0.26), v), u);
  return smin(dome, sdCone(u, v, -d * 0.4, -0.14, 0.13, -(d + 0.14), -0.36, 0.035), 0.06);
}

function bandana(u: number, v: number, h: MascotHead) {
  return above(sdEllipse(u, v, Math.min(span(h, 1.0, 0.4), room(h) - 0.3), 0.33), v);
}

/** Leaves round the top of the head, alternating between the two greens by `which`. */
function laurelLeaves(u: number, v: number, h: MascotHead, which: 0 | 1) {
  const r = span(h, 1.0, 0.42);
  const au = Math.abs(u);
  let d = Infinity;
  [0.3, 0.68, 1.06, 1.44].forEach((a, i) => {
    if (i % 2 !== which) return;
    d = Math.min(d, sdTiltEllipse(au, v, r * Math.sin(a), 0.0 - 0.3 * Math.cos(a), 0.09, 0.15, a + 0.5));
  });
  return d;
}

/** Where a pair of things on top of the head stand, either side of the centre line. */
const earSpread = (h: MascotHead, f: number, lo: number, hi: number) => Math.min(Math.max(headW(h) * f, lo), hi);

/** The body's side at the ear line, pulled in far enough that a piece `reach` wide stays in the frame. */
const sideAt = (h: MascotHead, reach: number) => Math.min(sideU(h), room(h) - reach);

const ART = new Map<string, AccessoryArt>(Object.entries(ACCESSORY_ART));

/** The art for an accessory id; undefined for `none`, for no accessory, and for an unknown id. */
export function accessoryArt(id: string | undefined): AccessoryArt | undefined {
  return id ? ART.get(id) : undefined;
}

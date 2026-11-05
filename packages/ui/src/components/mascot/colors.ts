/**
 * The colours: a ramp of five body tones, a rim and two eye inks per colour, and the
 * finishes, which are colours whose tone or hue moves across the dome.
 *
 * See CONTRIBUTING.md in this folder before adding one. Ids are stored in rows and URLs,
 * so an id is never renamed or removed. The order is the picker's and may change.
 */

import { BAYER4, length } from "./geometry";

export type Rgb = readonly [number, number, number];

/** Five steps of the body from the darkest edge to the glint, then the eye inks. */
export type MascotInks = {
  tones: readonly [Rgb, Rgb, Rgb, Rgb, Rgb];
  rim: Rgb;
  sclera: Rgb;
  pupil: Rgb;
};

export function hex(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export const BLACK: Rgb = [8, 8, 12];
export const WHITE: Rgb = [255, 255, 255];
/** Googly eyes, the same on every body: see `MascotInk`. */
export const PLASTIC: Rgb = [250, 250, 247];
export const BEAD: Rgb = [18, 18, 20];

/**
 * A colour as a ramp. The shade steps lean toward a cool near-black rather than grey,
 * which is what keeps a dithered shadow on a saturated body from going muddy. `sclera`
 * is the eye colour, dark on the pale bodies so the eyes still read as eyes.
 */
export function ramp(base: string, sclera?: string): MascotInks {
  const b = hex(base);
  const eye = sclera ? hex(sclera) : autoSclera(b);
  return {
    tones: [mix(b, BLACK, 0.5), mix(b, BLACK, 0.26), b, mix(b, WHITE, 0.2), mix(b, WHITE, 0.48)],
    rim: mix(b, BLACK, 0.42),
    sclera: eye,
    pupil: pupilInk(eye),
  };
}

/**
 * The inner eye contrasts with its outer ink, not with the skin. On pale bodies the
 * OG eye is inverted: a dark oval with a white inner light. Mixing that light from
 * the body made Sand's pupil brown and barely distinct from the surrounding eye.
 */
function pupilInk(eye: Rgb): Rgb {
  return contrastRatio(eye, WHITE) >= contrastRatio(eye, BLACK) ? WHITE : BLACK;
}

/**
 * White eyes on a body dark enough to hold them and near-black eyes on a pale one, by
 * relative luminance, so a colour added to the list never ships with eyes that vanish.
 */
function autoSclera([r, g, b]: Rgb): Rgb {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.42 ? mix([r, g, b], BLACK, 0.86) : WHITE;
}

/** The logo as it sits on a light page: near-black, quiet shading, white eyes. */
const INK: MascotInks = {
  tones: [hex("#0B0B0B"), hex("#151515"), hex("#1E1E1E"), hex("#2B2B2B"), hex("#3E3E3E")],
  rim: hex("#0B0B0B"),
  sclera: hex("#FFFFFF"),
  pupil: hex("#1E1E1E"),
};

/** The logo as it sits on a dark page: the same character inverted. */
const PAPER: MascotInks = {
  tones: [hex("#A7A5A0"), hex("#CFCDC8"), hex("#EEEDE9"), hex("#F9F8F5"), hex("#FFFFFF")],
  rim: hex("#B9B7B2"),
  sclera: hex("#1B1B1B"),
  pupil: hex("#EEEDE9"),
};

/* ------------------------------------------------------------------------- *
 * Finishes
 * ------------------------------------------------------------------------- */

/**
 * What the renderer knows about one cell of a dome when it asks a finish for its colour.
 * Positions are in the -1 to 1 body box, y down; the normal is the dome's, already tipped
 * toward the viewer, so `nz` is 1 at the crown and 0 at the silhouette.
 */
export type MascotSurface = {
  x: number;
  y: number;
  nx: number;
  ny: number;
  nz: number;
  /** The plain lambert term and the specular term the default lighting adds up. */
  diffuse: number;
  spec: number;
  /** The pose's clock, in seconds; 0 for anything still. */
  t: number;
  /** The cell on the grid, for a dither. */
  gx: number;
  gy: number;
};

/**
 * A colour that is not one flat ramp. Both halves are optional and both stay inside the
 * five-tone dither, so a finish is still pixel art and not a gradient:
 *
 * - `light` replaces the lit value (0 dark to 1 glint) the five tones are picked from.
 *   A metal uses it: it reflects its surroundings rather than scattering light, so it is
 *   a bright sky, a dark horizon and a hard glint, not a soft dome.
 * - `pick` chooses which of `ramps` this cell is drawn from. Iridescence uses it: the hue
 *   bands follow the dome's normal and drift with the clock.
 *
 * Keep `ramps` short. The still SVG emits one path per distinct colour, so a finish costs
 * up to five paths per ramp, and a face is drawn on every card a creator has.
 */
export type MascotFinish = {
  light?: (s: MascotSurface) => number;
  pick?: (s: MascotSurface) => number;
  ramps: readonly MascotInks[];
};

/** A ramp from five explicit tones, for a finish whose shading is not `ramp`'s. */
function tones5(values: readonly [string, string, string, string, string], sclera?: string): MascotInks {
  const t = values.map(hex) as unknown as MascotInks["tones"];
  const eye = sclera ? hex(sclera) : autoSclera(t[2]);
  return { tones: t, rim: mix(t[0], BLACK, 0.3), sclera: eye, pupil: pupilInk(eye) };
}

const GOLD_INKS = tones5(["#5A3A0A", "#946212", "#D29C2A", "#F2CD5C", "#FFF6D2"], "#2A1A04");

/**
 * Gold: a metal, so the light is the room it reflects rather than a lamp. The top of the
 * dome shows a bright sky, a band just under the middle shows the dark floor, and the
 * underside picks up a little bounce; the horizon leans with the normal so it bends
 * round the body instead of cutting straight across. The glint is sharper than a matte
 * body's, which is what reads as polish at twenty-eight cells.
 */
const GOLD: MascotFinish = { ramps: [GOLD_INKS], light: mirror(0.56, 0.1, 0.3, 0.9) };

/**
 * Gold's lighting with its four numbers pulled out, so every metal is the same room seen
 * in a different mirror: `sky` is the lit value at the top of the dome, `floor` the dark
 * band under the horizon, `bounce` the underside, `glint` how hard the highlight is.
 * Chrome is a wide gap between sky and floor; platinum a narrow one.
 */
function mirror(sky: number, floor: number, bounce: number, glint: number) {
  return (s: MascotSurface) => {
    const v = s.ny + s.nx * 0.18;
    const g = Math.pow(Math.max(0, s.spec * 2), 3) * glint;
    if (v < -0.04) return Math.min(1, sky + Math.min(1, -v * 1.6) * 0.3 + s.diffuse * 0.08 + g);
    if (v < 0.3) return floor + s.diffuse * 0.08 + g;
    return bounce + (v - 0.3) * 0.5;
  };
}

const HOLO_RAMPS = ["#FFB0D6", "#C9B0FF", "#9EDCFF", "#A6F5D0", "#FFF0A0", "#FFC2A0"].map((c) => ramp(c, "#22162E"));

/**
 * Holographic: six pastel hues in diagonal bands that bend with the dome and drift
 * slowly with the clock, the way foil shifts as it turns. The band edges are dithered
 * with the same ordered matrix as the shading, so the change of hue is a texture rather
 * than a seam.
 */
const HOLO: MascotFinish = {
  ramps: HOLO_RAMPS,
  pick: (s) => {
    const h = (s.x * 0.9 - s.y * 0.7 + s.nx * 1.1 + s.ny * 0.8) * 0.8 + s.t * 0.12;
    const band = Math.floor(h * 6 + BAYER4[(s.gy & 3) * 4 + (s.gx & 3)] - 0.5);
    return ((band % 6) + 6) % 6;
  },
};

/* The rest of the finishes, 6 Oct 2026. Every one is a few ramps and a `light`, a `pick`
   or both, and every `pick` below reads body space rather than the grid, so a pattern is
   the same size on the body at 28 cells as at 96 and does not crawl when the pose moves.
   The grid is only for the dither at a band's edge. */

/** The ordered-dither threshold for this cell, 0 to 1. */
function dith(s: MascotSurface) {
  return BAYER4[(s.gy & 3) * 4 + (s.gx & 3)];
}

/** An integer lattice point to 0..1. Stable across runs, so a spot never moves. */
function hash2(ix: number, iy: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1, about one feature per unit. */
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * A point on the body pushed outward by its normal, which is what makes a printed pattern
 * look wrapped round a dome rather than stamped on a disc: stripes bunch toward the
 * silhouette the way they would on a ball.
 */
function wrapU(s: MascotSurface) {
  return s.x + s.nx * 0.22;
}
function wrapV(s: MascotSurface) {
  return s.y + s.ny * 0.22;
}

/* Metals. Each is a five-tone ladder lit by `mirror`. */

const CHROME_INKS = tones5(["#1A1F2B", "#475266", "#98A5B8", "#DCE5F0", "#FFFFFF"], "#10141C");
const PLATINUM_INKS = tones5(["#77767C", "#A09FA6", "#C6C5CB", "#E4E3E8", "#FFFFFF"], "#1C1C22");
const COPPER_INKS = tones5(["#4A1A0A", "#8C3C1C", "#C86A3C", "#F0A47A", "#FFE4D0"], "#2A0E04");
const BRONZE_INKS = tones5(["#3A260E", "#6C4A20", "#A27434", "#D0A862", "#F6E2B4"], "#22160A");
const ROSEGOLD_INKS = tones5(["#6A3836", "#A6645E", "#D8968A", "#F2C6BA", "#FFF2EC"], "#3A1C1A");
const GUNMETAL_INKS = tones5(["#121419", "#272B33", "#454B57", "#7A828F", "#CBD3DD"]);

/** Chrome: the widest sky-to-floor gap there is, so it reads as a mirror and not as grey. */
const CHROME: MascotFinish = { ramps: [CHROME_INKS], light: mirror(0.64, 0.16, 0.4, 1.3) };
/** Platinum: a narrow gap and a soft glint, brushed rather than polished. */
const PLATINUM: MascotFinish = { ramps: [PLATINUM_INKS], light: mirror(0.5, 0.3, 0.42, 0.6) };
const COPPER: MascotFinish = { ramps: [COPPER_INKS], light: mirror(0.56, 0.1, 0.3, 0.9) };
const BRONZE: MascotFinish = { ramps: [BRONZE_INKS], light: mirror(0.52, 0.12, 0.3, 0.7) };
const ROSEGOLD: MascotFinish = { ramps: [ROSEGOLD_INKS], light: mirror(0.56, 0.14, 0.32, 0.9) };
const GUNMETAL: MascotFinish = { ramps: [GUNMETAL_INKS], light: mirror(0.5, 0.06, 0.24, 1.1) };

/* Iridescent. */

const PEARL_RAMPS = [tones5(["#B9B2AA", "#D9D2CA", "#F2EDE6", "#FBF8F3", "#FFFFFF"], "#2A2420"), ramp("#F6C8DE"), ramp("#C4DCF6")];

/**
 * Pearl: a cream crown whose edges turn faintly pink on one side and blue on the other,
 * which is what nacre does as the angle to it changes. The lustre is a soft, high light
 * rather than a lamp, so even the shadow side stays pale.
 */
const PEARL: MascotFinish = {
  ramps: PEARL_RAMPS,
  light: (s) => 0.42 + s.diffuse * 0.42 + s.spec * 1.4,
  pick: (s) => {
    const edge = 1 - s.nz;
    if (edge < 0.12 + dith(s) * 0.3) return 0;
    return s.nx - s.ny * 0.6 + Math.sin(s.t * 0.6) * 0.2 > 0 ? 1 : 2;
  },
};

const OPAL_RAMPS = [ramp("#E4EEF0"), ramp("#FF9FC4"), ramp("#7FE8B4"), ramp("#8FC4FF"), ramp("#FFC07A")];

/** Opal: a milky body with flecks of colour in it, each fleck a hue of its own. */
const OPAL: MascotFinish = {
  ramps: OPAL_RAMPS,
  pick: (s) => {
    const u = wrapU(s) * 4.6, v = wrapV(s) * 4.6;
    const f = noise(u + 11, v + s.t * 0.08);
    if (f < 0.6 + dith(s) * 0.08) return 0;
    return 1 + Math.floor(noise(u * 0.7 - 5, v * 0.7 + 3) * 3.999);
  },
};

const OIL_RAMPS = ["#3A1F6E", "#0F6D7A", "#2F8F3A", "#9A7A12", "#8A1F6A"].map((c) => ramp(c, "#FFFFFF"));

/**
 * Oil slick: holographic's bands on a dark body, following the normal more than the
 * position, so the colours ring the dome like a film on water. Darker ramps than holo's,
 * because a slick is a sheen over something black.
 */
const OILSLICK: MascotFinish = {
  ramps: OIL_RAMPS,
  pick: (s) => {
    const h = s.nx * 1.3 + s.ny * 1.1 + (s.x - s.y) * 0.3 + noise(s.x * 2 + 4, s.y * 2) * 0.7 + s.t * 0.1;
    const band = Math.floor(h * 3.2 + dith(s) - 0.5);
    return ((band % 5) + 5) % 5;
  },
};

const AURORA_RAMPS = [ramp("#16264E"), ramp("#3AE08E"), ramp("#2CB8CC"), ramp("#9A62FF")];

/**
 * Aurora: a night body with green curtains hanging down it, teal at their edges and
 * violet at their tops, swaying slowly. The curtains thin out toward the bottom.
 */
const AURORA: MascotFinish = {
  ramps: AURORA_RAMPS,
  pick: (s) => {
    const w = Math.sin(wrapU(s) * 6.5 + Math.sin(s.y * 2.6 + s.t * 0.7) * 1.3);
    const reach = 0.55 - s.y * 0.5;
    const d = dith(s) * 0.22;
    if (w > 1 - reach + d) return s.y < -0.35 ? 3 : 1;
    if (w > 0.85 - reach + d) return 2;
    return 0;
  },
};

/* Two-tone gradients, top to bottom. */

/**
 * A gradient down the body through `stops`, flat inside each colour and dithered only
 * where two meet, so it is still a few flat inks rather than a smear. `sway` bends the
 * boundaries, for fire.
 */
function vertical(stops: readonly string[], sway?: (s: MascotSurface) => number): MascotFinish {
  const ramps = stops.map((c) => ramp(c));
  const n = ramps.length - 1;
  return {
    ramps,
    pick: (s) => {
      const v = ((s.y + (sway ? sway(s) : 0) + 0.78) / 1.56) * n;
      const i = Math.floor(v);
      const f = Math.min(1, Math.max(0, (v - i - 0.5) * 2.4 + 0.5));
      return Math.max(0, Math.min(n, i + (f > dith(s) ? 1 : 0)));
    },
  };
}

const SUNSET = vertical(["#7B4BD8", "#FF5C8A", "#FFB23D"]);
const TIDE = vertical(["#62E4E8", "#1E80CC", "#1B347E"]);
const BERRY = vertical(["#FF72B6", "#B4308F", "#561C78"]);
const MINTLEMON = vertical(["#FFF07A", "#7EF0B6"]);
const FIRE = vertical(["#D8261E", "#FF7A1A", "#FFE04A"], (s) => Math.sin(s.x * 9 + s.t * 4) * 0.07);
const CANDY = vertical(["#FF9FD2", "#C6A8FF", "#8ED8FF"]);
const PEACHSKY = vertical(["#FFC59E", "#A8D6FF"]);

/* Neon. A glow outside the body cannot be drawn, so the tube is the edge: a deep, nearly
   unlit middle, a white-hot band just inside the silhouette, and a rim in the full hue. */

function neon(deep: string, hue: string, hot: string): MascotInks {
  const inks = tones5([deep, deep, hue, hot, "#FFFFFF"]);
  return { ...inks, rim: hex(hue), sclera: WHITE, pupil: mix(hex(deep), BLACK, 0.6) };
}

const neonLight = (s: MascotSurface) => {
  const edge = 1 - s.nz;
  const tube = Math.min(1, Math.max(0, (edge - 0.2) / 0.3));
  return 0.22 + s.diffuse * 0.16 + tube * tube * 0.74 + s.spec * 1.2;
};

const NEONPINK_INKS = neon("#5A0A3C", "#FF2E9A", "#FFA6D6");
const NEONGREEN_INKS = neon("#0E4A12", "#39FF3C", "#B8FFB0");
const NEONBLUE_INKS = neon("#0A2A5E", "#1FD8FF", "#A8F2FF");

/* Glass and jelly: a translucent body is darker at its thick edges, has a hard glint, and
   carries a bright patch low on the side away from the light, where light that went
   through comes out again. */

function translucent(s: MascotSurface) {
  const edge = 1 - s.nz;
  const through = Math.max(0, s.y - 0.1) * Math.max(0, s.nx + 0.2) * 1.6;
  const glint = Math.pow(Math.max(0, s.spec * 2), 2) * 1.2;
  return 0.52 + s.diffuse * 0.14 - edge * 0.38 + through + glint;
}

const GLASS_INKS = tones5(["#5C8A9E", "#9AC4D4", "#CDE7EF", "#EDF8FB", "#FFFFFF"], "#173039");
const JELLY_INKS = tones5(["#7E0A26", "#C8243F", "#FF5670", "#FF9EAE", "#FFF2F4"], "#FFFFFF");

/* Patterns. Some `ramps` lists repeat a ramp: the picker draws a finish's swatch as a
   gradient through its ramps, so a repeat is what makes the stripes swatch striped. A
   repeated ramp is the same colours, so it costs the SVG nothing. */

const STRIPE_A = ramp("#F4F2EC", "#1B2348");
const STRIPE_B = ramp("#26336A");
const STRIPES: MascotFinish = {
  ramps: [STRIPE_A, STRIPE_B, STRIPE_A, STRIPE_B, STRIPE_A],
  pick: (s) => (Math.floor(wrapV(s) * 3.8 + 0.3) & 1 ? 1 : 0),
};

const SPOT_BODY = ramp("#2FB59A");
const SPOT_DOT = ramp("#FFE27A");

/** Spots: one dot per cell of a jittered lattice, each its own size. */
const SPOTS: MascotFinish = {
  ramps: [SPOT_BODY, SPOT_DOT, SPOT_BODY],
  pick: (s) => {
    const u = wrapU(s) * 3, v = wrapV(s) * 3;
    const iu = Math.floor(u), iv = Math.floor(v);
    const cx = iu + 0.25 + hash2(iu, iv) * 0.5, cy = iv + 0.25 + hash2(iv, iu + 7) * 0.5;
    const r = 0.2 + hash2(iu + 3, iv - 5) * 0.14;
    return (u - cx) ** 2 + (v - cy) ** 2 < r * r ? 1 : 0;
  },
};

const CHECK_A = ramp("#E43A3A");
const CHECK_B = ramp("#2A2733");
const CHECKER: MascotFinish = {
  ramps: [CHECK_A, CHECK_B, CHECK_A, CHECK_B],
  pick: (s) => (Math.floor(wrapU(s) * 3.2 + 8) + Math.floor(wrapV(s) * 3.2 + 8)) & 1,
};

const CAMO_RAMPS = [ramp("#6B7A3A"), ramp("#2E391D"), ramp("#6E4C2C"), ramp("#B4A66C")];

/** Camo: two noise fields thresholded into blobs, dark green over brown over khaki. */
const CAMO: MascotFinish = {
  ramps: CAMO_RAMPS,
  pick: (s) => {
    const u = wrapU(s), v = wrapV(s);
    if (noise(u * 2.6 + 3, v * 2.6) > 0.6) return 1;
    if (noise(u * 3.2 - 7, v * 3.2 + 2) > 0.6) return 2;
    if (noise(u * 2.2 + 9, v * 2.2 - 4) < 0.32) return 3;
    return 0;
  },
};

const GALAXY_SPACE = ramp("#1C1848");
const GALAXY_RAMPS = [GALAXY_SPACE, ramp("#C04FB4"), tones5(["#B8B0FF", "#E2DEFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"]), ramp("#4C2C8E"), GALAXY_SPACE];

/** Galaxy: a dark body with a nebula through it and stars that blink in and out. */
const GALAXY: MascotFinish = {
  ramps: GALAXY_RAMPS,
  pick: (s) => {
    const u = wrapU(s), v = wrapV(s);
    const iu = Math.floor(u * 13), iv = Math.floor(v * 13);
    const star = hash2(iu, iv);
    if (star > 0.93 && (star * 97 + s.t * 0.5) % 1 > 0.25) return 2;
    const n = noise(u * 2.2 + s.t * 0.03, v * 2.2 + 5);
    if (n > 0.7 + dith(s) * 0.06) return 1;
    if (n > 0.48 + dith(s) * 0.1) return 3;
    return 0;
  },
};

const MARBLE_RAMPS = [ramp("#EEECE6", "#24221F"), ramp("#B5B1AA"), ramp("#6A6662")];

/** Marble: white stone with a grey vein and a dark one through it, bent by noise. */
const MARBLE: MascotFinish = {
  ramps: MARBLE_RAMPS,
  pick: (s) => {
    const u = wrapU(s), v = wrapV(s);
    const w = Math.abs(Math.sin((u * 1.8 + v * 1.2) * 2.6 + noise(u * 2.4, v * 2.4 + 2) * 5));
    if (w < 0.09) return 2;
    if (w < 0.24 + dith(s) * 0.06) return 1;
    return 0;
  },
};

const WOOD_RAMPS = [ramp("#C99158"), ramp("#93603A"), ramp("#B07A46")];

/** Wood: rings of a trunk cut lengthways, centred off the body so they read as grain. */
const WOOD: MascotFinish = {
  ramps: WOOD_RAMPS,
  pick: (s) => {
    const u = wrapU(s), v = wrapV(s);
    const ring = length(u * 1.1 + 0.9, (v + 0.2) * 0.38) * 8 + noise(u * 3, v * 1.5) * 1.4;
    const f = ring - Math.floor(ring);
    if (f < 0.22) return 1;
    if (f < 0.34 + dith(s) * 0.1) return 2;
    return 0;
  },
};

const PLAID_RAMPS = [ramp("#C42A33"), ramp("#1E4A38"), ramp("#1D2846"), ramp("#F2C94C", "#1D2846")];

/**
 * Plaid: wide dark bands across and down a red ground, darker still where they cross,
 * a thin gold line in each, and the single-band squares half and half on a checkerboard,
 * which is how a twill weave mixes two threads.
 */
const PLAID: MascotFinish = {
  ramps: PLAID_RAMPS,
  pick: (s) => {
    const a = wrapU(s) * 1.7 + 8, b = wrapV(s) * 1.7 + 8;
    const fa = a - Math.floor(a), fb = b - Math.floor(b);
    if ((fa > 0.66 && fa < 0.71) || (fb > 0.66 && fb < 0.71)) return 3;
    const across = fb < 0.36, down = fa < 0.36;
    if (across && down) return 2;
    if (across || down) return (s.gx + s.gy) & 1 ? 1 : 0;
    return 0;
  },
};

const PAINT_RAMPS = [ramp("#F3EEF0", "#1B1840"), ramp("#E8489E"), ramp("#2F55D6"), ramp("#D8303C"), ramp("#1C1A48")];

/**
 * Paint pour: white, pink, cobalt and red poured together and dragged into ribbons, with
 * a thin navy vein along the edge of the blue. The bands are one stripe bent twice by
 * noise, which is what pulls a pour into swirls rather than marble's straight veins.
 * Made on 20 Oct 2026 for Scobel's judge card on /jam, from his painted bust.
 */
const PAINT: MascotFinish = {
  ramps: PAINT_RAMPS,
  pick: (s) => {
    const u = wrapU(s), v = wrapV(s);
    const wu = u + (noise(u * 1.5 + 4, v * 1.5) - 0.5) * 1.4;
    const wv = v + (noise(u * 1.5, v * 1.5 - 6) - 0.5) * 1.4;
    const f = (wu * 1.3 + wv * 0.9) * 1.5 + noise(wu * 2, wv * 2) * 1.2 + (dith(s) - 0.5) * 0.06;
    const band = f - Math.floor(f);
    if (band < 0.3) return 0;
    if (band < 0.47) return 1;
    if (band < 0.53) return 4;
    if (band < 0.7) return 2;
    if (band < 0.82) return 0;
    if (band < 0.92) return 3;
    return 1;
  },
};

/**
 * `mono`, shown as Auto, follows the theme: black on a light page, white on a dark one.
 * It was the logo's own behaviour when the logo shipped as that pair. Since 6 Oct 2026 the
 * logo is the white one on both themes (one logo, and the black one nowhere except
 * on somebody who picked it), so Auto is now only a look a person can choose, and nothing
 * the product draws for itself uses it. Black and White beside it are the same two
 * characters held still. That makes Auto identical to one of them in either theme, and
 * that is deliberate: the call on 5 Oct 2026 was to have the moving one and the fixed pair both,
 * and the half-and-half swatch says which one moves.
 *
 * Every other colour is the same on both pages.
 */
export const MASCOT_COLORS = [
  { id: "mono", label: "Auto", swatch: "#1E1E1E", inks: INK, darkInks: PAPER },
  { id: "black", label: "Black", swatch: "#1E1E1E", inks: INK },
  { id: "charcoal", label: "Charcoal", swatch: "#3C3D44", inks: ramp("#3C3D44") },
  { id: "smoke", label: "Smoke", swatch: "#66655F", inks: ramp("#66655F") },
  { id: "gray", label: "Gray", swatch: "#9A9893", inks: ramp("#9A9893", "#1B1B1B") },
  { id: "silver", label: "Silver", swatch: "#C4C6CF", inks: ramp("#C4C6CF") },
  { id: "white", label: "White", swatch: "#F4F3EF", inks: PAPER },
  { id: "cream", label: "Cream", swatch: "#F9EFCE", inks: ramp("#F9EFCE") },
  { id: "oat", label: "Oat", swatch: "#D1BDB2", inks: ramp("#D1BDB2") },
  { id: "sand", label: "Sand", swatch: "#E2C79A", inks: ramp("#E2C79A", "#2A2014") },
  { id: "khaki", label: "Khaki", swatch: "#B4B478", inks: ramp("#B4B478") },
  { id: "taupe", label: "Taupe", swatch: "#8C7E71", inks: ramp("#8C7E71") },
  { id: "bark", label: "Bark", swatch: "#60543C", inks: ramp("#60543C") },
  { id: "slate", label: "Slate", swatch: "#697386", inks: ramp("#697386") },
  { id: "heather", label: "Heather", swatch: "#9C9CB4", inks: ramp("#9C9CB4") },
  { id: "mist", label: "Mist", swatch: "#A3C2C4", inks: ramp("#A3C2C4") },
  { id: "ice", label: "Ice", swatch: "#DBF5FF", inks: ramp("#DBF5FF") },
  { id: "espresso", label: "Espresso", swatch: "#4B2E22", inks: ramp("#4B2E22") },
  { id: "walnut", label: "Walnut", swatch: "#6A3F14", inks: ramp("#6A3F14") },
  { id: "cocoa", label: "Cocoa", swatch: "#8A5A3C", inks: ramp("#8A5A3C") },
  { id: "caramel", label: "Caramel", swatch: "#C88B51", inks: ramp("#C88B51") },
  { id: "ochre", label: "Ochre", swatch: "#A86C00", inks: ramp("#A86C00") },
  { id: "clay", label: "Clay", swatch: "#B48478", inks: ramp("#B48478") },
  { id: "oxblood", label: "Oxblood", swatch: "#5A1414", inks: ramp("#5A1414") },
  { id: "wine", label: "Wine", swatch: "#7A1F3D", inks: ramp("#7A1F3D") },
  { id: "crimson", label: "Crimson", swatch: "#B3132F", inks: ramp("#B3132F") },
  { id: "brick", label: "Brick", swatch: "#8E2A12", inks: ramp("#8E2A12") },
  { id: "red", label: "Red", swatch: "#E8423A", inks: ramp("#E8423A") },
  { id: "rust", label: "Rust", swatch: "#B4532A", inks: ramp("#B4532A") },
  { id: "coral", label: "Coral", swatch: "#FF7661", inks: ramp("#FF7661") },
  { id: "salmon", label: "Salmon", swatch: "#F7A193", inks: ramp("#F7A193") },
  { id: "blush", label: "Blush", swatch: "#F9CFD3", inks: ramp("#F9CFD3") },
  { id: "peach", label: "Peach", swatch: "#FFBE98", inks: ramp("#FFBE98", "#3A1E10") },
  { id: "tangerine", label: "Tangerine", swatch: "#FF7A2F", inks: ramp("#FF7A2F") },
  { id: "amber", label: "Amber", swatch: "#F38B00", inks: ramp("#F38B00") },
  { id: "apricot", label: "Apricot", swatch: "#FEB45F", inks: ramp("#FEB45F") },
  { id: "mustard", label: "Mustard", swatch: "#D19E18", inks: ramp("#D19E18") },
  { id: "honey", label: "Honey", swatch: "#FFC539", inks: ramp("#FFC539", "#241A05") },
  { id: "lemon", label: "Lemon", swatch: "#FFE209", inks: ramp("#FFE209") },
  { id: "butter", label: "Butter", swatch: "#FFE68C", inks: ramp("#FFE68C") },
  { id: "chartreuse", label: "Chartreuse", swatch: "#C2C408", inks: ramp("#C2C408") },
  { id: "olive", label: "Olive", swatch: "#8A8A2E", inks: ramp("#8A8A2E") },
  { id: "army", label: "Army", swatch: "#3E4A1C", inks: ramp("#3E4A1C") },
  { id: "moss", label: "Moss", swatch: "#5A7A3A", inks: ramp("#5A7A3A") },
  { id: "lichen", label: "Lichen", swatch: "#6E7C62", inks: ramp("#6E7C62") },
  { id: "lime", label: "Lime", swatch: "#B4E33D", inks: ramp("#B4E33D", "#18200A") },
  { id: "pistachio", label: "Pistachio", swatch: "#B4D99A", inks: ramp("#B4D99A") },
  { id: "sage", label: "Sage", swatch: "#8BA888", inks: ramp("#8BA888") },
  { id: "kelly", label: "Kelly", swatch: "#3CC23C", inks: ramp("#3CC23C") },
  { id: "spring", label: "Spring", swatch: "#3DFF6A", inks: ramp("#3DFF6A") },
  { id: "mint", label: "Mint", swatch: "#3DDC97", inks: ramp("#3DDC97", "#0C1F17") },
  { id: "emerald", label: "Emerald", swatch: "#00AC62", inks: ramp("#00AC62") },
  { id: "forest", label: "Forest", swatch: "#2F8D5B", inks: ramp("#2F8D5B") },
  { id: "ivy", label: "Ivy", swatch: "#0F5A22", inks: ramp("#0F5A22") },
  { id: "pine", label: "Pine", swatch: "#1E5446", inks: ramp("#1E5446") },
  { id: "jade", label: "Jade", swatch: "#009084", inks: ramp("#009084") },
  { id: "eucalyptus", label: "Eucalyptus", swatch: "#6C9090", inks: ramp("#6C9090") },
  { id: "seafoam", label: "Seafoam", swatch: "#9DE5C1", inks: ramp("#9DE5C1") },
  { id: "aqua", label: "Aqua", swatch: "#7AEFE5", inks: ramp("#7AEFE5", "#0B2523") },
  { id: "teal", label: "Teal", swatch: "#1FB5B0", inks: ramp("#1FB5B0") },
  { id: "petrol", label: "Petrol", swatch: "#187884", inks: ramp("#187884") },
  { id: "cyan", label: "Cyan", swatch: "#22CFEA", inks: ramp("#22CFEA") },
  { id: "cerulean", label: "Cerulean", swatch: "#009CC0", inks: ramp("#009CC0") },
  { id: "sky", label: "Sky", swatch: "#5CC8FF", inks: ramp("#5CC8FF", "#0E1B2B") },
  { id: "azure", label: "Azure", swatch: "#0090FC", inks: ramp("#0090FC") },
  { id: "powder", label: "Powder", swatch: "#B7D3F2", inks: ramp("#B7D3F2") },
  { id: "ocean", label: "Ocean", swatch: "#006EA9", inks: ramp("#006EA9") },
  { id: "abyss", label: "Abyss", swatch: "#0A4060", inks: ramp("#0A4060") },
  { id: "denim", label: "Denim", swatch: "#536BA7", inks: ramp("#536BA7") },
  { id: "navy", label: "Navy", swatch: "#1F2F5C", inks: ramp("#1F2F5C") },
  { id: "cobalt", label: "Cobalt", swatch: "#2E63FF", inks: ramp("#2E63FF") },
  { id: "royal", label: "Royal", swatch: "#224DBC", inks: ramp("#224DBC") },
  { id: "periwinkle", label: "Periwinkle", swatch: "#98A8FF", inks: ramp("#98A8FF") },
  { id: "dusk", label: "Dusk", swatch: "#545478", inks: ramp("#545478") },
  { id: "indigo", label: "Indigo", swatch: "#3F2BB5", inks: ramp("#3F2BB5") },
  { id: "wisteria", label: "Wisteria", swatch: "#9386CC", inks: ramp("#9386CC") },
  { id: "iris", label: "Iris", swatch: "#8662FF", inks: ramp("#8662FF") },
  { id: "ultraviolet", label: "Ultraviolet", swatch: "#8400FC", inks: ramp("#8400FC") },
  { id: "violet", label: "Violet", swatch: "#C13EFE", inks: ramp("#C13EFE") },
  { id: "grape", label: "Grape", swatch: "#84609C", inks: ramp("#84609C") },
  { id: "lavender", label: "Lavender", swatch: "#C3A6FF", inks: ramp("#C3A6FF", "#22163A") },
  { id: "lilac", label: "Lilac", swatch: "#E4C8F7", inks: ramp("#E4C8F7") },
  { id: "aubergine", label: "Aubergine", swatch: "#3A1050", inks: ramp("#3A1050") },
  { id: "plum", label: "Plum", swatch: "#6B2E7A", inks: ramp("#6B2E7A") },
  { id: "purple", label: "Purple", swatch: "#B400B4", inks: ramp("#B400B4") },
  { id: "orchid", label: "Orchid", swatch: "#D67EE0", inks: ramp("#D67EE0") },
  { id: "mauve", label: "Mauve", swatch: "#B07A9A", inks: ramp("#B07A9A") },
  { id: "magenta", label: "Magenta", swatch: "#E0349C", inks: ramp("#E0349C") },
  { id: "fuchsia", label: "Fuchsia", swatch: "#FF2EE0", inks: ramp("#FF2EE0") },
  { id: "raspberry", label: "Raspberry", swatch: "#C0185F", inks: ramp("#C0185F") },
  { id: "pink", label: "Pink", swatch: "#FF8FC7", inks: ramp("#FF8FC7", "#3A0F24") },
  { id: "rose", label: "Rose", swatch: "#FF4F7B", inks: ramp("#FF4F7B") },
  /* Finishes from here: `inks` is still the colour's rim, eye inks and swatch-like ramp,
     and `finish` decides the tones. */
  { id: "gold", label: "Gold", swatch: "#D29C2A", inks: GOLD_INKS, finish: GOLD },
  { id: "chrome", label: "Chrome", swatch: "#98A5B8", inks: CHROME_INKS, finish: CHROME },
  { id: "platinum", label: "Platinum", swatch: "#C6C5CB", inks: PLATINUM_INKS, finish: PLATINUM },
  { id: "copper", label: "Copper", swatch: "#C86A3C", inks: COPPER_INKS, finish: COPPER },
  { id: "bronze", label: "Bronze", swatch: "#A27434", inks: BRONZE_INKS, finish: BRONZE },
  { id: "rosegold", label: "Rose gold", swatch: "#D8968A", inks: ROSEGOLD_INKS, finish: ROSEGOLD },
  { id: "gunmetal", label: "Gunmetal", swatch: "#454B57", inks: GUNMETAL_INKS, finish: GUNMETAL },
  { id: "holo", label: "Holographic", swatch: "#C9B0FF", inks: HOLO_RAMPS[1], finish: HOLO },
  { id: "pearl", label: "Pearl", swatch: "#F2EDE6", inks: PEARL_RAMPS[0], finish: PEARL },
  { id: "opal", label: "Opal", swatch: "#E4EEF0", inks: OPAL_RAMPS[0], finish: OPAL },
  { id: "oilslick", label: "Oil slick", swatch: "#3A1F6E", inks: OIL_RAMPS[0], finish: OILSLICK },
  { id: "aurora", label: "Aurora", swatch: "#16264E", inks: AURORA_RAMPS[0], finish: AURORA },
  { id: "sunset", label: "Sunset", swatch: "#FF5C8A", inks: SUNSET.ramps[1], finish: SUNSET },
  { id: "tide", label: "Tide", swatch: "#1E80CC", inks: TIDE.ramps[1], finish: TIDE },
  { id: "berry", label: "Berry", swatch: "#B4308F", inks: BERRY.ramps[1], finish: BERRY },
  { id: "mintlemon", label: "Mint lemon", swatch: "#FFF07A", inks: MINTLEMON.ramps[0], finish: MINTLEMON },
  { id: "fire", label: "Fire", swatch: "#FF7A1A", inks: FIRE.ramps[1], finish: FIRE },
  { id: "candy", label: "Candy", swatch: "#C6A8FF", inks: CANDY.ramps[1], finish: CANDY },
  { id: "peachsky", label: "Peach sky", swatch: "#FFC59E", inks: PEACHSKY.ramps[0], finish: PEACHSKY },
  { id: "neonpink", label: "Neon pink", swatch: "#FF2E9A", inks: NEONPINK_INKS, finish: { ramps: [NEONPINK_INKS], light: neonLight } },
  { id: "neongreen", label: "Neon green", swatch: "#39FF3C", inks: NEONGREEN_INKS, finish: { ramps: [NEONGREEN_INKS], light: neonLight } },
  { id: "neonblue", label: "Neon blue", swatch: "#1FD8FF", inks: NEONBLUE_INKS, finish: { ramps: [NEONBLUE_INKS], light: neonLight } },
  { id: "glass", label: "Glass", swatch: "#CDE7EF", inks: GLASS_INKS, finish: { ramps: [GLASS_INKS], light: translucent } },
  { id: "jelly", label: "Jelly", swatch: "#FF5670", inks: JELLY_INKS, finish: { ramps: [JELLY_INKS], light: translucent } },
  { id: "stripes", label: "Stripes", swatch: "#26336A", inks: STRIPE_B, finish: STRIPES },
  { id: "spots", label: "Spots", swatch: "#2FB59A", inks: SPOT_BODY, finish: SPOTS },
  { id: "checker", label: "Checker", swatch: "#E43A3A", inks: CHECK_A, finish: CHECKER },
  { id: "camo", label: "Camo", swatch: "#6B7A3A", inks: CAMO_RAMPS[0], finish: CAMO },
  { id: "galaxy", label: "Galaxy", swatch: "#1C1848", inks: GALAXY_SPACE, finish: GALAXY },
  { id: "marble", label: "Marble", swatch: "#EEECE6", inks: MARBLE_RAMPS[0], finish: MARBLE },
  { id: "wood", label: "Wood", swatch: "#C99158", inks: WOOD_RAMPS[0], finish: WOOD },
  { id: "plaid", label: "Plaid", swatch: "#C42A33", inks: PLAID_RAMPS[0], finish: PLAID },
  { id: "paint", label: "Paint pour", swatch: "#E8489E", inks: PAINT_RAMPS[0], finish: PAINT },
] as const;

export type MascotColorId = (typeof MASCOT_COLORS)[number]["id"];

/**
 * The inks for a colour. An id that is not in the list throws rather than drawing
 * black: on 5 Oct 2026 a stale copy of this list in a hot-reloaded canvas drew a lime
 * character black, and a silent fallback is what made that look like a product bug.
 * Stored values are checked by `parseMascot` first, so only a programming error reaches
 * the throw.
 */
export function mascotInks(color: MascotColorId, dark: boolean): MascotInks {
  const entry = colorEntry(color);
  return dark && entry.darkInks ? entry.darkInks : entry.inks;
}

type ColorEntry = { id: string; inks: MascotInks; darkInks?: MascotInks; finish?: MascotFinish; mark?: string };
const ENTRIES = new Map<string, ColorEntry>(MASCOT_COLORS.map((c) => [c.id, c as ColorEntry]));

function colorEntry(color: string): ColorEntry {
  const entry = ENTRIES.get(color);
  if (!entry) throw new Error(`Unknown mascot colour "${color}"`);
  return entry;
}

/** The finish a colour carries, or undefined for a flat ramp. */
export function mascotFinish(color: MascotColorId): MascotFinish | undefined {
  return colorEntry(color).finish;
}

/**
 * The five body tones for one cell: the colour's own ramp, or the ramp its finish picks
 * for this point of the dome. `surface` is absent when the caller has no geometry (a
 * swatch, a scene tint), and a finish then answers with its first ramp.
 */
export function mascotTones(color: MascotColorId, dark: boolean, surface?: MascotSurface): MascotInks["tones"] {
  const entry = colorEntry(color);
  const finish = entry.finish;
  if (finish?.pick && surface) {
    const ramps = finish.ramps;
    return ramps[Math.max(0, Math.min(ramps.length - 1, finish.pick(surface)))].tones;
  }
  if (finish) return finish.ramps[0].tones;
  return (dark && entry.darkInks ? entry.darkInks : entry.inks).tones;
}

/* ------------------------------------------------------------------------- *
 * The second ink: markings
 * ------------------------------------------------------------------------- */

/**
 * Which way a shape's markings go. `contrast` is the default and the one to reach for: a
 * pale patch on a dark body and a dark one on a pale body, so a panda is a panda in
 * White and still reads in Black. `light` and `dark` hold one direction whatever the
 * body, for a marking that is a material rather than a pattern (a penguin's white belly
 * stays white, and on a white body it simply goes quiet).
 */
/* "grey" is a mid ink for hair that has gone salt and pepper: on a white face it reads as
   grey hair rather than the near-black "dark" draws (17 Oct 2026, for the side part).
   "brown" is a warm one for hair and a beard that are brown rather than black (23 Oct
   2026, for the full beard). */
export type MascotMarkTone = "contrast" | "light" | "dark" | "grey" | "brown";

const MARK_LIGHT = hex("#F6F4EE");
const MARK_DARK = hex("#17171B");
const MARK_GREY = hex("#6E6E6B");
const MARK_BROWN = hex("#5C3A24");

function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two inks, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const markCache = new Map<string, MascotInks>();

/**
 * The second ink: the body's own five tones pulled most of the way toward a marking
 * colour, so a patch is dithered and lit exactly like the body it sits on, its shadow
 * side darker than its lit side. A colour may name its own marking colour with `mark`,
 * for a body whose natural pattern is a hue rather than black or white.
 */
export function markInks(color: MascotColorId, dark: boolean, tone: MascotMarkTone = "contrast"): MascotInks {
  const key = `${color}/${dark ? 1 : 0}/${tone}`;
  const cached = markCache.get(key);
  if (cached) return cached;
  const entry = colorEntry(color);
  const base = mascotInks(color, dark);
  const target = entry.mark
    ? hex(entry.mark)
    : tone === "light" ? MARK_LIGHT : tone === "dark" ? MARK_DARK : tone === "grey" ? MARK_GREY : tone === "brown" ? MARK_BROWN : luminance(base.tones[2]) > 0.18 ? MARK_DARK : MARK_LIGHT;
  const inks: MascotInks = {
    tones: base.tones.map((t) => mix(t, target, 0.8)) as unknown as MascotInks["tones"],
    rim: mix(base.rim, target, 0.6),
    sclera: base.sclera,
    pupil: base.pupil,
  };
  markCache.set(key, inks);
  return inks;
}

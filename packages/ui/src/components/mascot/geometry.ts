/**
 * The distance functions every other file in this folder is drawn with: signed distances
 * in the -1 to 1 body box, y down, under 0 inside. Shapes, eyes, markings and accessories
 * all reach for these rather than writing their own, which is the point of the file: a
 * second rounded box with a different idea of where the corner starts is how two bodies
 * that should match stop matching.
 *
 * Nothing here knows about a look, a pose or a colour.
 */

export const GROUND = 0.86;

export function length(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}

export function sdRoundBox(x: number, y: number, hx: number, hy: number, r: number) {
  const qx = Math.abs(x) - hx + r;
  const qy = Math.abs(y) - hy + r;
  return length(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

export function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Inigo Quilez's uneven capsule: a circle of `r1` at (0, y1) drawn into one of `r2` at (0, y2). */
export function sdUnevenCapsule(x: number, y: number, r1: number, y1: number, r2: number, y2: number) {
  // In a frame with the big circle at the origin and y pointing up toward the small one.
  const px = Math.abs(x);
  const py = y1 - y;
  const h = y1 - y2;
  const b = (r1 - r2) / h;
  const a = Math.sqrt(1 - b * b);
  const k = -px * b + py * a;
  if (k < 0) return length(px, py) - r1;
  if (k > a * h) return length(px, py - h) - r2;
  return px * a + py * b - r1;
}

/** The uneven capsule between any two points: a circle of `ra` at A drawn into `rb` at B. */
export function sdCone(x: number, y: number, ax: number, ay: number, ra: number, bx: number, by: number, rb: number) {
  const ux = bx - ax;
  const uy = by - ay;
  const h = length(ux, uy);
  const dx = x - ax;
  const dy = y - ay;
  const py = (dx * ux + dy * uy) / h;
  const px = Math.abs(dx * uy - dy * ux) / h;
  const b = (ra - rb) / h;
  const a = Math.sqrt(1 - b * b);
  const k = -px * b + py * a;
  if (k < 0) return length(px, py) - ra;
  if (k > a * h) return length(px, py - h) - rb;
  return px * a + py * b - ra;
}

export function sdEllipse(x: number, y: number, rx: number, ry: number) {
  return (length(x / rx, y / ry) - 1) * Math.min(rx, ry);
}

/** Inigo Quilez's hexagon, flat top and bottom, `r` to the middle of a side. */
export function sdHexagon(x: number, y: number, r: number) {
  const k0 = -0.866025404, k1 = 0.5, k2 = 0.577350269;
  let px = Math.abs(x);
  let py = Math.abs(y);
  const m = 2 * Math.min(k0 * px + k1 * py, 0);
  px -= m * k0;
  py -= m * k1;
  px -= Math.max(-k2 * r, Math.min(k2 * r, px));
  py -= r;
  return length(px, py) * Math.sign(py);
}

/** A convex polygon, as the furthest of its edges' half-planes; exact enough inside. */
export function sdPolygon(x: number, y: number, points: readonly (readonly [number, number])[]) {
  let d = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey);
    // Outward normal for points listed clockwise on screen (y down).
    d = Math.max(d, ((x - ax) * -ey + (y - ay) * ex) / -len);
  }
  return d;
}

/** A capsule of one radius between two points. */
export function sdCapsule(x: number, y: number, ax: number, ay: number, bx: number, by: number, r: number) {
  return segment(x, y, ax, ay, bx, by) - r;
}

export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

/** An ellipse turned `a` radians about its own centre. */
export function sdTiltEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, a: number) {
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(a), s = Math.sin(a);
  return sdEllipse(dx * c + dy * s, -dx * s + dy * c, rx, ry);
}

/**
 * Inigo Quilez's exact polygon. `sdPolygon` above is only exact inside, so taking a radius
 * off it grows the corners rather than rounding them; this one is exact both sides, which
 * is what `- r` needs.
 */
export function sdPoly(x: number, y: number, points: readonly (readonly [number, number])[]) {
  let d = (x - points[0][0]) ** 2 + (y - points[0][1]) ** 2;
  let sign = 1;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [ix, iy] = points[i];
    const [jx, jy] = points[j];
    const ex = jx - ix, ey = jy - iy, wx = x - ix, wy = y - iy;
    const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, (wx - ex * h) ** 2 + (wy - ey * h) ** 2);
    const a = y >= iy, b = y < jy, c = ex * wy > ey * wx;
    if ((a && b && c) || (!a && !b && !c)) sign = -sign;
  }
  return sign * Math.sqrt(d);
}

/** Inigo Quilez's equilateral triangle, point up, centred on its centroid, `r` half a side. */
export function sdTriangle(x: number, y: number, r: number) {
  const k = Math.sqrt(3);
  let px = Math.abs(x) - r;
  let py = -y + r / k;
  if (px + k * py > 0) {
    const nx = (px - k * py) / 2;
    py = (-k * px - py) / 2;
    px = nx;
  }
  px -= Math.max(-2 * r, Math.min(0, px));
  return -length(px, py) * Math.sign(py);
}

/** A band of half-width `w` along the circle of radius `r` about (cx, cy). */
export function sdRing(x: number, y: number, cx: number, cy: number, r: number, w: number) {
  return Math.abs(length(x - cx, y - cy) - r) - w;
}

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function bayer8(x: number, y: number) {
  // Recursive 8x8 from the 2x2 base, without a table.
  let v = 0;
  for (let bit = 0; bit < 3; bit += 1) {
    const xb = (x >> bit) & 1;
    const yb = (y >> bit) & 1;
    v = v * 4 + ((xb ^ yb) | (yb << 1));
  }
  // The bit order above reverses significance; reverse it back.
  let r = 0;
  for (let i = 0; i < 3; i += 1) r = r * 4 + ((v >> (i * 2)) & 3);
  return (r + 0.5) / 64;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** An ellipse leaning `tilt` radians, as a value that is under 1 inside it. */
export function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, cos: number, sin: number) {
  const dx = x - cx;
  const dy = y - cy;
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  return (u * u) / (rx * rx) + (v * v) / (ry * ry);
}

/**
 * Inigo Quilez's heart, `height` tall from the tip to the top of the lobes, centred on
 * (0, 0) with y down. Under 0 inside, and a true distance, so a body made of it shades
 * as cleanly as the circle does.
 */
export function heart(x: number, y: number, height: number) {
  const k = height / 1.104;
  const px = Math.abs(x) / k;
  const py = 0.552 - y / k;
  if (px + py > 1) return (length(px - 0.25, py - 0.75) - Math.SQRT2 / 4) * k;
  const m = 0.5 * Math.max(px + py, 0);
  const d = Math.sqrt(Math.min((px * px) + (py - 1) * (py - 1), (px - m) * (px - m) + (py - m) * (py - m)));
  return d * Math.sign(px - py) * k;
}

export function arc(x: number, y: number, cx: number, cy: number, r: number, w: number, up: boolean) {
  const dy = y - cy;
  if (up ? dy > 0.02 : dy < -0.02) return 1;
  return Math.abs(length(x - cx, dy) - r) - w;
}

/** Distance to the segment from A to B. */
export function segment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const px = x - ax, py = y - ay, ux = bx - ax, uy = by - ay;
  const h = Math.max(0, Math.min(1, (px * ux + py * uy) / (ux * ux + uy * uy)));
  return length(px - ux * h, py - uy * h);
}

export function star(x: number, y: number, r: number) {
  const angle = Math.atan2(x, -y);
  return length(x, y) - r * (0.6 + 0.4 * Math.cos(5 * angle));
}

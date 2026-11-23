#!/usr/bin/env node
/**
 * brush-check: is the restyle visibly painted, and is it as steady as the game?
 *
 * It works on captures, so it works the same for any engine, 2D or 3D, first or third
 * person. Shoot the same stretch twice, once as the game draws it and once painted, at the
 * same size and frame rate, frame for frame (a seeded replay, recorded input or a demo).
 *
 *   node brush-check.mjs before.mp4 after.mp4 [--from F] [--frames N] [--json]
 *
 * The command line needs ffmpeg on the PATH and reads both files at 480x270. `measurePair`
 * takes frames you already have (RGB bytes) and needs nothing. It reports:
 *   paint    mean colour difference (CIE76 ΔE, Lab) between matching frames.
 *   grade    the part of that difference as broad as a region: colour, value, shade colour.
 *   strokes  the part at brush scale: laid strokes, line and dots. This is what reads as
 *            painted; a high paint with low strokes is a colour grade, not a painting.
 *   flicker  change between consecutive frames over the quietest quarter of frames,
 *            painted / game. Run it on a still-camera pair too: in a moving take the
 *            camera's own motion hides boiling strokes.
 *   pop      share of pixels jumping by more than 24 of 255 in luma between consecutive
 *            frames on those quiet frames, painted minus game, in percent.
 * and a verdict against GATES (references/values.md, "Checks").
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const GATES = Object.freeze({ paintMin: 9, strokesMin: 8, flickerMax: 2.2, popMax: 1.0 });

const LUT = Float64Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

function lab(fr, px) {
  const L = new Float32Array(px), A = new Float32Array(px), B = new Float32Array(px);
  for (let i = 0, j = 0; i < px; i++, j += 3) {
    const r = LUT[fr[j]], g = LUT[fr[j + 1]], b = LUT[fr[j + 2]];
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
    L[i] = 116 * y - 16; A[i] = 500 * (x - y); B[i] = 200 * (y - z);
  }
  return [L, A, B];
}
function luma(fr, px) {
  const Y = new Float32Array(px);
  for (let i = 0, j = 0; i < px; i++, j += 3) Y[i] = 0.2126 * fr[j] + 0.7152 * fr[j + 1] + 0.0722 * fr[j + 2];
  return Y;
}
// Box blur, separable, radius R: what is left after it is the brush-scale part.
function blur(src, W, H, R) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0, c = 0; const row = y * W;
    for (let x = -R; x < W; x++) {
      if (x + R < W) { acc += src[row + x + R]; c++; }
      if (x - R - 1 >= 0) { acc -= src[row + x - R - 1]; c--; }
      if (x >= 0) tmp[row + x] = acc / c;
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0, c = 0;
    for (let y = -R; y < H; y++) {
      if (y + R < H) { acc += tmp[(y + R) * W + x]; c++; }
      if (y - R - 1 >= 0) { acc -= tmp[(y - R - 1) * W + x]; c--; }
      if (y >= 0) out[y * W + x] = acc / c;
    }
  }
  return out;
}

/**
 * Measure a before/after pair. `before` and `after` are arrays of frames, each W*H*3 RGB
 * bytes, matched frame for frame. Every `every`th frame is used for paint, grade and strokes.
 */
export function measurePair(before, after, W, H, { every = 4, gates = GATES } = {}) {
  const px = W * H, n = Math.min(before.length, after.length);
  if (n < 3) throw new Error(`brush-check: ${n} matching frames; need at least 3`);
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 1 || H < 1) throw new Error(`brush-check: a frame size of ${W}x${H}; need whole pixels`);
  if (!Number.isInteger(every) || every < 1) throw new Error(`brush-check: every ${every}; need a whole number of frames, 1 or more`);
  for (let k = 0; k < n; k++) {
    for (const [side, frames] of [["game", before], ["painted", after]]) {
      const length = frames[k]?.length;
      if (length !== px * 3) throw new Error(`brush-check: ${side} frame ${k} has ${length ?? "no"} bytes; a ${W}x${H} RGB frame has ${px * 3}`);
    }
  }
  const R = Math.max(2, Math.round(H / 22)); // about a broad stroke's width at the default size
  let paint = 0, grade = 0, strokes = 0, sampled = 0;
  const motion = [];
  let prevB = null, prevA = null;
  for (let k = 0; k < n; k++) {
    if (k % every === 0) {
      const lb = lab(before[k], px), la = lab(after[k], px);
      const D = [0, 1, 2].map((c) => { const d = new Float32Array(px); for (let i = 0; i < px; i++) d[i] = la[c][i] - lb[c][i]; return d; });
      const S = D.map((d) => blur(d, W, H, R));
      let p = 0, g = 0, s = 0;
      for (let i = 0; i < px; i++) {
        p += Math.hypot(D[0][i], D[1][i], D[2][i]);
        g += Math.hypot(S[0][i], S[1][i], S[2][i]);
        s += Math.hypot(D[0][i] - S[0][i], D[1][i] - S[1][i], D[2][i] - S[2][i]);
      }
      paint += p / px; grade += g / px; strokes += s / px; sampled++;
    }
    const yb = luma(before[k], px), ya = luma(after[k], px);
    if (prevB) {
      let db = 0, da = 0, jb = 0, ja = 0;
      for (let i = 0; i < px; i++) {
        const eb = Math.abs(yb[i] - prevB[i]), ea = Math.abs(ya[i] - prevA[i]);
        db += eb; da += ea; if (eb > 24) jb++; if (ea > 24) ja++;
      }
      motion.push({ db: db / px, da: da / px, jb: jb / px, ja: ja / px });
    }
    prevB = yb; prevA = ya;
  }
  const quiet = [...motion].sort((x, y) => x.db - y.db).slice(0, Math.max(2, Math.floor(motion.length / 4)));
  const sum = (k) => quiet.reduce((s, m) => s + m[k], 0);
  const round = (x, d = 2) => +x.toFixed(d);
  const r = {
    frames: n,
    paint: round(paint / sampled),
    grade: round(grade / sampled),
    strokes: round(strokes / sampled),
    // A game that is perfectly still in its quiet frames gets a floor of a hundredth of a level.
    flicker: round(sum("da") / Math.max(sum("db"), quiet.length * 0.01)),
    pop: round((100 * (sum("ja") - sum("jb"))) / quiet.length),
    gameQuietChange: round(sum("db") / quiet.length),
  };
  const fails = [];
  /* NaN passes every comparison below as false, so a capture that could not be measured would
     pass every gate (Greptile on opengamehq/opengame#27). Each measure must be a number. */
  for (const [name, value] of Object.entries(r)) {
    if (!Number.isFinite(value)) fails.push(`${name} is ${value}, not a number: the captures could not be measured, so nothing passed`);
  }
  if (r.paint < gates.paintMin) fails.push(`paint ${r.paint} < ${gates.paintMin}: too subtle, it will not read as painted`);
  if (r.strokes < gates.strokesMin) fails.push(`strokes ${r.strokes} < ${gates.strokesMin}: little brushwork at stroke scale, it reads as a colour grade`);
  if (r.flicker > gates.flickerMax) fails.push(`flicker ${r.flicker} > ${gates.flickerMax}: strokes boil, it will not be playable`);
  if (r.pop > gates.popMax) fails.push(`pop ${r.pop}% > ${gates.popMax}%: strokes pop on and off`);
  return { ...r, ok: fails.length === 0, fails };
}

/** Plants the three failures this exists to catch: a grade with no strokes, boil, and a pair that passes. */
export function selfTest() {
  const W = 96, H = 54, px = W * H, failures = [];
  const scene = (t) => { const fr = new Uint8Array(px * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3, v = 90 + ((x + t) % W) * 0.6 + y * 0.5; fr[i] = v; fr[i + 1] = v * 0.9; fr[i + 2] = 120; } return fr; };
  const map = (fr, fn) => { const o = new Uint8Array(fr.length); for (let i = 0; i < px; i++) { const [r, g, b] = fn(fr[i * 3], fr[i * 3 + 1], fr[i * 3 + 2], i % W, Math.floor(i / W)); o[i * 3] = r; o[i * 3 + 1] = g; o[i * 3 + 2] = b; } return o; };
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const before = Array.from({ length: 24 }, (_, t) => scene(t));
  // Strokes: bands a few pixels wide, fixed on the picture, that change value against the scene.
  const stroke = (x, y) => (Math.floor((x + 2 * y) / 5) % 2 ? 1 : -1);
  const painted = before.map((fr) => map(fr, (r, g, b, x, y) => [clamp(r * 0.8 + 50 * stroke(x, y)), clamp(g * 0.7 + 40 * stroke(x, y)), clamp(b + 50 * stroke(x, y))]));
  const graded = before.map((fr) => map(fr, (r, g, b) => [clamp(r * 0.7 + 30), clamp(g * 0.6), clamp(b * 1.3)]));
  const boiling = before.map((fr, t) => map(fr, (r, g, b, x, y) => { const s = ((x * 7 + y * 13 + t * 31) % 11) > 5 ? 1 : -1; return [clamp(r + 60 * s), clamp(g + 60 * s), clamp(b + 60 * s)]; }));
  const good = measurePair(before, painted, W, H, { every: 2 });
  if (!good.ok) failures.push(`a steady painted pair failed: ${good.fails.join("; ")}`);
  const grade = measurePair(before, graded, W, H, { every: 2 });
  if (grade.ok || !grade.fails.some((x) => x.startsWith("strokes"))) failures.push(`a colour grade passed as painting (strokes ${grade.strokes})`);
  const boil = measurePair(before, boiling, W, H, { every: 2 });
  if (boil.ok || !boil.fails.some((x) => x.startsWith("flicker") || x.startsWith("pop"))) failures.push(`boiling strokes passed (flicker ${boil.flicker}, pop ${boil.pop})`);
  return { ok: failures.length === 0, examined: 3, failures, measured: { good, grade, boil } };
}

function readFrames(file, from, count, W, H) {
  const vf = `select='gte(n\\,${from})',scale=${W}:${H}:flags=area,format=rgb24`;
  const p = spawn("ffmpeg", ["-v", "error", "-i", file, "-vf", vf, "-fps_mode", "passthrough", "-frames:v", String(count), "-f", "rawvideo", "-"], { stdio: ["ignore", "pipe", "inherit"] });
  const size = W * H * 3, out = [];
  let buf = Buffer.alloc(0);
  p.stdout.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= size) { out.push(Buffer.from(buf.subarray(0, size))); buf = buf.subarray(size); }
  });
  return new Promise((res, rej) => {
    p.on("error", () => rej(new Error("brush-check: ffmpeg is not on the PATH")));
    p.on("close", (c) => (c === 0 ? res(out) : rej(new Error(`brush-check: ffmpeg could not read ${file}`))));
  });
}

async function main(argv) {
  const files = [], opts = { from: 0, frames: 600, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") opts.json = true;
    else if (argv[i] === "--from" || argv[i] === "--frames") opts[argv[i].slice(2)] = Number(argv[++i]);
    else files.push(argv[i]);
  }
  if (files.length !== 2) {
    console.error("usage: node brush-check.mjs before.mp4 after.mp4 [--from F] [--frames N] [--json]");
    return 2;
  }
  const W = 480, H = 270;
  const [b, a] = await Promise.all(files.map((file) => readFrames(file, opts.from, opts.frames, W, H)));
  if (b.length !== a.length) console.error(`brush-check: ${b.length} game frames and ${a.length} painted; using the first ${Math.min(b.length, a.length)}`);
  const r = measurePair(b, a, W, H);
  if (opts.json) console.log(JSON.stringify(r));
  else {
    console.log(`frames ${r.frames}  paint ${r.paint} (grade ${r.grade}, strokes ${r.strokes})  flicker ${r.flicker}x  pop ${r.pop}%  (game's quiet change ${r.gameQuietChange})`);
    console.log(r.ok ? "PASS" : `FAIL:\n  ${r.fails.join("\n  ")}`);
  }
  return r.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });
}

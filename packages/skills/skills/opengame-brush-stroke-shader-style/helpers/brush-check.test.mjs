import test from "node:test";
import assert from "node:assert/strict";
import { GATES, measurePair, selfTest } from "./brush-check.mjs";

test("brush-check's self-test plants a grade, boil and a good pair, and tells them apart", () => {
  const r = selfTest();
  assert.deepEqual(r.failures, []);
  assert.equal(r.ok, true);
  assert.ok(r.measured.grade.paint > GATES.paintMin, "the grade moves colour a lot");
  assert.ok(r.measured.grade.strokes < GATES.strokesMin, "but lays nothing at brush scale");
  assert.ok(r.measured.boil.flicker > GATES.flickerMax);
  assert.ok(r.measured.good.flicker <= GATES.flickerMax);
});

test("an identical pair is not painted and does not flicker", () => {
  const W = 40, H = 24, frames = Array.from({ length: 8 }, (_, t) => Uint8Array.from({ length: W * H * 3 }, (_, i) => (i * 7 + t * 3) % 256));
  const r = measurePair(frames, frames, W, H, { every: 1 });
  assert.equal(r.paint, 0);
  assert.equal(r.strokes, 0);
  assert.equal(r.flicker, 1);
  assert.equal(r.pop, 0);
  assert.equal(r.ok, false);
  assert.throws(() => measurePair(frames.slice(0, 2), frames.slice(0, 2), W, H), /need at least 3/);
});

/* Greptile on opengamehq/opengame#27: three short RGB buffers measured as NaN, and NaN passed
   every gate. A malformed capture is refused, and a measure that is not a number fails. */
test("a malformed capture is refused, and a measure that is not a number fails the check", () => {
  const W = 40, H = 24, frame = () => Uint8Array.from({ length: W * H * 3 }, (_, i) => (i * 7) % 256);
  const frames = Array.from({ length: 4 }, frame);
  const short = frames.map((f) => f.subarray(0, 30));
  assert.throws(() => measurePair(short, short, W, H), /game frame 0 has 30 bytes; a 40x24 RGB frame has 2880/);
  assert.throws(() => measurePair(frames, [...frames.slice(0, 3), short[3]], W, H), /painted frame 3 has 30 bytes/);
  assert.throws(() => measurePair(frames, frames, W, H, { every: 0 }), /every 0/);
  assert.throws(() => measurePair(frames, frames, W + 0.5, H), /frame size/);
  // Bytes of the right count that are not numbers: every measure is NaN, and nothing passes.
  const broken = frames.map(() => new Float32Array(W * H * 3).fill(NaN));
  const r = measurePair(frames, broken, W, H, { every: 1, gates: { paintMin: -Infinity, strokesMin: -Infinity, flickerMax: Infinity, popMax: Infinity } });
  assert.equal(r.ok, false);
  assert.ok(r.fails.some((f) => /^paint is NaN, not a number/.test(f)), r.fails.join("; "));
});

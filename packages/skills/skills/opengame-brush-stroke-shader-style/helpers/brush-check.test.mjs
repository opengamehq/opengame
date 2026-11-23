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

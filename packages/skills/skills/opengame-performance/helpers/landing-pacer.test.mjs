import test from "node:test";
import assert from "node:assert/strict";
import { createLandingPacer } from "./landing-pacer.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = () => new Promise((r) => setImmediate(r));

test("a frame is held while two are out and the oldest is old", async () => {
  let t = 0;
  const pacer = createLandingPacer({ now: () => t });
  const a = deferred();
  const b = deferred();
  pacer.begin(); pacer.submitted(a.promise);
  t = 16; pacer.begin(); pacer.submitted(b.promise);
  t = 30;
  assert.equal(pacer.canBegin(), true, "the oldest is 30 ms old, under the limit");
  t = 60;
  assert.equal(pacer.canBegin(), false, "two out and the oldest 60 ms old");
  a.resolve();
  await flush();
  assert.equal(pacer.canBegin(), true, "one landed, so one may begin");
  assert.equal(pacer.stats().held, 1);
});

test("held time is carried into the next frame's dt", () => {
  let t = 0;
  const pacer = createLandingPacer({ now: () => t });
  assert.equal(pacer.begin(), 0);
  t = 100;
  assert.equal(pacer.begin(), 0.1);
});

test("stats report the age of what landed, not frames begun", async () => {
  let t = 0;
  const pacer = createLandingPacer({ now: () => t, maxInFlight: 10 });
  const frames = [];
  for (let i = 0; i < 10; i++) {
    const d = deferred();
    t = i * 10;
    pacer.begin();
    pacer.submitted(d.promise);
    frames.push(d);
  }
  t = 200; // the GPU was far behind: every frame lands late
  frames.forEach((d) => d.resolve());
  await flush();
  const { landed, p50, p95, inFlight } = pacer.stats();
  assert.equal(landed, 10);
  assert.equal(inFlight, 0);
  assert.ok(p50 >= 150 && p95 >= 190, `ages p50 ${p50} p95 ${p95}`);
});

test("a planted unpaced loop is caught by the age it reports", async () => {
  // Unpaced: begin a frame every 16 ms while the GPU lands one every 40 ms.
  let t = 0;
  const unpaced = createLandingPacer({ now: () => t, maxInFlight: Infinity });
  const paced = createLandingPacer({ now: () => t });
  const queues = [[], []];
  for (let step = 0; step < 400; step++) {
    t = step * 4;
    if (step % 4 === 0) {
      for (const [i, pacer] of [unpaced, paced].entries()) {
        if (!pacer.canBegin()) continue;
        pacer.begin();
        const d = deferred();
        pacer.submitted(d.promise);
        queues[i].push(d);
      }
    }
    if (step % 10 === 0) {
      for (const queue of queues) queue.shift()?.resolve();
      await flush();
    }
  }
  const slow = unpaced.stats().p95;
  const fast = paced.stats().p95;
  assert.ok(slow > 4 * fast, `unpaced p95 ${slow} ms should dwarf paced ${fast} ms`);
  // Paced, the age stays bounded by a few GPU periods however long the run; unpaced it grows.
  assert.ok(fast <= 150, `paced p95 ${fast} ms`);
});

test("a frame whose promise rejects leaves the queue without counting as landed", async () => {
  let t = 0;
  const pacer = createLandingPacer({ now: () => t });
  pacer.begin(); pacer.submitted(Promise.reject(new Error("device lost")));
  t = 16; pacer.begin(); pacer.submitted(Promise.reject(new Error("device lost")));
  await flush();
  t = 200;
  assert.equal(pacer.canBegin(), true, "two failures do not hold every later frame");
  const s = pacer.stats();
  assert.equal(s.inFlight, 0);
  assert.equal(s.landed, 0);
  assert.equal(s.failed, 2);
});

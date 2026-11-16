import test from "node:test";
import assert from "node:assert/strict";
import { createLoadingCount } from "./loading-count.mjs";

const stages = [{ name: "download", weight: 90 }, { name: "compile", weight: 10 }];

test("weights come from bytes on a first visit and from seconds after one", () => {
  const first = createLoadingCount({ stages });
  first.report("download", 1);
  assert.equal(Math.round(first.truth()), 90);
  assert.equal(first.weightedBy, "given weights");

  // Last visit the compile took nine seconds and the download one: time is what the player waits.
  const second = createLoadingCount({ stages, previous: { download: 1, compile: 9 } });
  second.report("download", 1);
  assert.equal(Math.round(second.truth()), 10);
  assert.equal(second.weightedBy, "previous visit");
});

test("the count never reads 100 until play can start", () => {
  const count = createLoadingCount({ stages, maxRate: 1000 });
  count.report("download", 1);
  count.report("compile", 1);
  for (let i = 0; i < 10; i++) count.step(0.1);
  assert.equal(count.shown(), 99);
  count.ready();
  count.step(0.1);
  assert.equal(count.shown(), 100);
});

test("a stage never goes back, so the count never goes back", () => {
  const count = createLoadingCount({ stages, maxRate: 1000 });
  count.report("download", 0.5);
  const high = count.step(1);
  count.report("download", 0.2); // a retry restarting the download
  assert.equal(count.step(1), high);
  assert.ok(count.truth() >= 45);
});

test("the shown number rises at most maxRate points a second", () => {
  const count = createLoadingCount({ stages, maxRate: 30 });
  count.report("download", 1);
  count.report("compile", 1);
  assert.ok(count.step(0.1) <= 3);
  let last = count.shown();
  for (let i = 0; i < 50; i++) {
    const next = count.step(1 / 60);
    assert.ok(next >= last && next - last <= 1, `jumped from ${last} to ${next}`);
    last = next;
  }
});

test("longestHold finds a stage that needs splitting", () => {
  const count = createLoadingCount({ stages, maxRate: 1000 });
  count.report("download", 0.1);
  count.step(0.1);
  for (let i = 0; i < 8; i++) count.step(0.5); // nothing reported for four seconds
  assert.ok(count.longestHold() >= 3.9, `longestHold was ${count.longestHold()}`);
  count.report("download", 0.6);
  count.step(0.1);
  assert.ok(count.longestHold() >= 3.9);
});

test("durations are recorded per finished stage for the next visit", () => {
  let t = 0;
  const count = createLoadingCount({ stages, now: () => t });
  count.report("download", 0);
  t = 4;
  count.report("download", 1);
  count.report("compile", 0.5);
  assert.deepEqual(count.durations(), { download: 4 });
  assert.throws(() => count.report("missing", 1), /unknown loading stage/);
});

test("a stage first reported at completion is timed from the stage before it", () => {
  let t = 0;
  const count = createLoadingCount({ stages, now: () => t });
  count.report("download", 0);
  t = 5;
  count.report("download", 1);
  t = 14; // the compile reports nothing until it is done
  count.report("compile", 1);
  assert.deepEqual(count.durations(), { download: 5, compile: 9 });

  // And on the next visit the compile carries most of the weight, so the count does not
  // stand at 99 through it.
  const next = createLoadingCount({ stages, previous: count.durations() });
  next.report("download", 1);
  assert.ok(next.truth() < 50, `truth after the download was ${next.truth()}`);
});

test("begin() starts a stage's clock without reporting progress", () => {
  let t = 0;
  const count = createLoadingCount({ stages, now: () => t });
  t = 2;
  count.begin("compile");
  t = 7;
  count.report("compile", 1);
  assert.deepEqual(count.durations(), { compile: 5 });
});

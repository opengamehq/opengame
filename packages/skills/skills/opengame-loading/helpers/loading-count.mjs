/**
 * A loading count that tells the truth. Copy this file into the game; it imports nothing
 * and touches no page element. It turns the stages of a boot into one number that only
 * rises, rises in small steps, never reads 100 until the game says play can start, and
 * reports how long it ever stood still, so a stage that needs splitting is found by a
 * number rather than by a player.
 *
 *   import { createLoadingCount } from "./loading-count.mjs";
 *
 *   const saved = JSON.parse(localStorage.getItem("boot-times") ?? "{}");
 *   const count = createLoadingCount({
 *     stages: [{ name: "shell", weight: 2e6 }, { name: "world", weight: 40e6 }, { name: "shaders", weight: 8e6 }],
 *     previous: saved,                        // last visit's seconds per stage, if any
 *   });
 *   count.report("world", bytesSoFar / worldBytes);  // as chunks arrive
 *   count.begin("shaders");                           // a stage with nothing to report until done
 *   count.report("shaders", 1);
 *   count.ready();                                    // only when a run can start
 *   const shown = count.step(dt);                     // each frame; draw this number
 *   localStorage.setItem("boot-times", JSON.stringify(count.durations()));
 *
 * Weights are bytes (or any cost) on a first visit. When the previous visit timed every
 * stage, its seconds become the weights, because the wait a player sits through is time,
 * and a compile that downloads nothing can be most of it.
 */

export function createLoadingCount({
  stages,
  previous = {},
  maxRate = 30,
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000,
} = {}) {
  if (!Array.isArray(stages) || stages.length === 0) throw new Error("createLoadingCount needs at least one stage");
  const timed = stages.every((stage) => Number(previous[stage.name]) > 0);
  const weights = new Map(stages.map((stage) => [stage.name, Math.max(0, timed ? Number(previous[stage.name]) : Number(stage.weight ?? 1))]));
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0) || 1;
  const fraction = new Map(stages.map((stage) => [stage.name, 0]));
  const started = new Map();
  const finished = new Map();
  const created = now();
  let isReady = false;
  let shownExact = 0;
  let shown = 0;
  let still = 0;
  let longest = 0;

  function known(name) {
    if (!fraction.has(name)) throw new Error(`unknown loading stage "${name}"`);
  }

  /** Start a stage's clock before it has progress to report (a compile, a scene build). */
  function begin(name) {
    known(name);
    if (!started.has(name)) started.set(name, now());
  }

  function report(name, value) {
    known(name);
    const clamped = Math.min(1, Math.max(0, Number(value) || 0));
    if (!started.has(name)) {
      // A stage whose first report is its completion did its work unseen. Time it from the
      // last stage that finished before it (or from the start of the boot), never from
      // now, or it would weigh nothing next visit and the count would stand still through it.
      const before = [...finished.values()].reduce((latest, end) => Math.max(latest, end), created);
      started.set(name, clamped >= 1 ? before : now());
    }
    // A stage never goes back: a retry that restarts a download keeps the count where it was.
    if (clamped > fraction.get(name)) fraction.set(name, clamped);
    if (fraction.get(name) >= 1 && !finished.has(name)) finished.set(name, now());
  }

  /** The true share of the work done, as a percentage; 99 at most until ready(). */
  function truth() {
    if (isReady) return 100;
    let done = 0;
    for (const [name, weight] of weights) done += weight * fraction.get(name);
    return Math.min(99, (100 * done) / total);
  }

  /** Advance the shown number toward the truth by at most maxRate points a second. */
  function step(dt) {
    const seconds = Math.max(0, Number(dt) || 0);
    const target = truth();
    const before = shown;
    if (shownExact < target) shownExact = Math.min(target, shownExact + maxRate * seconds);
    shown = Math.max(shown, Math.floor(shownExact + 1e-9));
    if (shown === before && !isReady) {
      still += seconds;
      longest = Math.max(longest, still);
    } else {
      still = 0;
    }
    return shown;
  }

  /** Seconds each finished stage took, to pass back as `previous` on the next visit. */
  function durations() {
    const out = {};
    for (const [name, end] of finished) out[name] = Math.max(1e-3, end - started.get(name));
    return out;
  }

  return {
    begin,
    report,
    ready() { isReady = true; },
    truth,
    step,
    shown: () => shown,
    durations,
    /** The longest the shown number stood still before ready(), in seconds. */
    longestHold: () => longest,
    weightedBy: timed ? "previous visit" : "given weights",
  };
}

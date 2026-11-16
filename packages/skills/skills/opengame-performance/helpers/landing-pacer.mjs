/**
 * Pace frames by when they land on the GPU, not by when they were begun. Copy this file
 * into the game; it imports nothing. On a GPU shared with another program (a screen
 * recorder, a second browser), the browser keeps handing out animation frames while the
 * GPU falls behind, so frames begun are not frames seen and each picture reaches the
 * screen older than the last. This holds the next frame while too much is in flight, and
 * records the age of every frame that lands, which is the number a player feels.
 *
 *   import { createLandingPacer } from "./landing-pacer.mjs";
 *
 *   const pacer = createLandingPacer();               // two in flight, 50 ms oldest
 *   renderer.setAnimationLoop((t) => {
 *     if (!pacer.canBegin()) return;                  // skip; carry the time to the next frame
 *     const dt = pacer.begin();                       // seconds since the last begun frame
 *     update(dt);
 *     renderer.render(scene, camera);
 *     pacer.submitted(renderer.backend.device.queue.onSubmittedWorkDone());
 *   });
 *   pacer.stats();                                    // { landed, p50, p95 } picture age in ms
 *
 * Measured on Last Contact beside a second uncapped browser on the same GPU: unpaced, 40
 * frames a second landed, each 3.5-4.6 s old; paced, 20-28 a second, 38-45 ms old. On a
 * quiet GPU the pacer changed frame counts by under 2%.
 */

export function createLandingPacer({
  maxInFlight = 2,
  maxAgeMs = 50,
  keep = 600,
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
} = {}) {
  const inFlight = []; // begin times of frames submitted and not yet landed, oldest first
  const ages = [];
  let lastBegin = null;
  let pending = null; // begin time of a frame begun but not yet submitted
  let held = 0;
  let failed = 0;

  /** False while maxInFlight frames are out and the oldest is at least maxAgeMs old. */
  function canBegin() {
    if (inFlight.length < maxInFlight) return true;
    const ok = now() - inFlight[0] < maxAgeMs;
    if (!ok) held++;
    return ok;
  }

  /** Mark a frame as begun; returns seconds since the last begun frame, so held time is carried. */
  function begin() {
    const t = now();
    const dt = lastBegin === null ? 0 : (t - lastBegin) / 1000;
    lastBegin = t;
    pending = t;
    return dt;
  }

  /** Pass the promise that resolves when this frame's GPU work is done. */
  function submitted(landed) {
    const started = pending ?? now();
    pending = null;
    inFlight.push(started);
    const settle = () => {
      const index = inFlight.indexOf(started);
      if (index >= 0) inFlight.splice(index, 1);
    };
    // A frame whose promise rejects (a lost device, a failed submit) still leaves the
    // queue, or two failures would hold every later frame. It records no age, because
    // nothing landed, and is counted apart.
    Promise.resolve(landed).then(() => {
      settle();
      ages.push(now() - started);
      if (ages.length > keep) ages.shift();
    }, () => { settle(); failed++; });
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  }

  function stats() {
    const sorted = [...ages].sort((a, b) => a - b);
    return { landed: ages.length, inFlight: inFlight.length, held, failed, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
  }

  return { canBegin, begin, submitted, stats };
}

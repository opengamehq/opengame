/**
 * Camera and hit-feel primitives that stay correct at any frame time. Copy this file
 * into the game; it imports nothing and touches no scene object. Each piece returns
 * numbers the game adds to its camera or its simulation step, so aim, collision and
 * where a shot goes stay the game's own truth.
 *
 *   import { spring, damp, createTrauma, createHitstop, selfTest } from "./spring.js";
 *
 *   const recoil = { x: 0, v: 0 };          // one per axis
 *   recoil.v += kick;                        // on a shot
 *   camera.rotation.x += spring(recoil, 0, 22, dt);
 *
 *   const shake = createTrauma();            // shake.add(0.3) on an impact
 *   const o = shake.update(dt, { aiming });  // o.yaw, o.pitch, o.roll in radians
 *
 *   const stop = createHitstop();            // stop.hold(0.05) on a kill
 *   const simDt = stop.step(dt);             // simulate with simDt, render with dt
 *
 * Run `selfTest()` once after editing this file. It plants the integrator this file
 * exists to replace and fails unless that planted version is caught.
 */

/**
 * A critically damped spring, solved in closed form. `state` is `{ x, v }` and is
 * updated in place; the new position is returned. Exact for a constant target, so the
 * result after one second is the same at 30 fps, 144 fps or one 50 ms hitch.
 * `omega` is the angular frequency in radians per second: higher is stiffer.
 */
export function spring(state, target, omega, dt) {
  const d = state.x - target;
  const e = Math.exp(-omega * dt);
  const c = state.v + omega * d;
  state.x = target + (d + c * dt) * e;
  state.v = (state.v - c * omega * dt) * e;
  return state.x;
}

/** Frame-rate independent approach toward a target, for FOV kicks and blends. */
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

/**
 * Trauma-squared shake. Events add trauma between 0 and 1; trauma decays linearly;
 * the shake is trauma squared, so small hits barely move the view and big ones do.
 * Three detuned sines per axis read as noise without allocating or seeding anything.
 * Defaults are Der Koloss's reference configuration; tune per game.
 */
export const TRAUMA_DEFAULTS = Object.freeze({
  decayPerSecond: 1.6, hz: 30, amplitude: { yaw: 0.038, pitch: 0.032, roll: 0.024 }, aimingKeeps: 0.25,
});

export function createTrauma(tuning = TRAUMA_DEFAULTS) {
  let trauma = 0, t = 0;
  return {
    add(amount) { trauma = Math.min(1, trauma + Math.max(0, amount)); },
    get trauma() { return trauma; },
    update(dt, { aiming = false } = {}) {
      trauma = Math.max(0, trauma - dt * tuning.decayPerSecond);
      t += dt * tuning.hz;
      const s = trauma * trauma * (aiming ? tuning.aimingKeeps : 1);
      return {
        yaw: (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 3.7) * 0.4) * tuning.amplitude.yaw * s,
        pitch: (Math.cos(t * 1.7) * 0.6 + Math.cos(t * 4.3) * 0.4) * tuning.amplitude.pitch * s,
        roll: (Math.sin(t * 2.3) * 0.6 + Math.sin(t * 5.1) * 0.4) * tuning.amplitude.roll * s,
      };
    },
  };
}

/**
 * Hitstop: a short freeze of the SIMULATION on a kill or a heavy hit. The render loop
 * and input keep running, so the frame holds while the game still answers the mouse.
 * `step(dt)` returns the time the simulation should advance this frame; a freeze that
 * ends part-way through a frame hands back the remainder rather than swallowing it.
 */
export function createHitstop() {
  let remaining = 0;
  return {
    hold(seconds) { remaining = Math.max(remaining, seconds); },
    get frozen() { return remaining > 0; },
    step(dt) {
      if (remaining <= 0) return dt;
      const spent = Math.min(remaining, dt);
      remaining -= spent;
      return dt - spent;
    },
  };
}

/** The integrator this file replaces: semi-implicit Euler on the same spring. */
function eulerSpring(state, target, omega, dt) {
  const a = -omega * omega * (state.x - target) - 2 * omega * state.v;
  state.v += a * dt;
  state.x += state.v * dt;
  return state.x;
}

/** Runs a spring from a recoil kick for `seconds` at a fixed `dt`. */
function settle(step, omega, dt, seconds) {
  const state = { x: 0, v: 1 };
  let peak = 0;
  for (let time = 0; time < seconds - 1e-9; time += dt) peak = Math.max(peak, Math.abs(step(state, 0, omega, dt)));
  return { final: Math.abs(state.x), peak };
}

/**
 * The two properties the game relies on, measured against `step`:
 *  - stable: a recoil kick returns to rest within a second, even at a 50 ms frame;
 *  - frame-rate independent: the pose after half a second is the same at 30 and 144 fps.
 * Returns a list of failures; empty means the properties hold.
 */
export function springProperties(step, omega = 22) {
  const failures = [];
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 1 / 20]) {
    const { final, peak } = settle(step, omega, dt, 1);
    if (!(final < 1e-3) || !(peak < 1)) failures.push(`unstable at ${Math.round(1 / dt)} fps: final ${final.toExponential(2)}, peak ${peak.toFixed(3)}`);
  }
  const slow = settle(step, omega, 1 / 30, 0.5).final, fast = settle(step, omega, 1 / 150, 0.5).final;
  if (Math.abs(slow - fast) > 1e-6) failures.push(`frame-rate dependent: ${slow.toExponential(3)} at 30 fps, ${fast.toExponential(3)} at 150 fps`);
  return failures;
}

/**
 * Plants the Euler spring first and requires the properties to catch it, then checks
 * this file's spring, trauma and hitstop. Returns `{ ok, examined, failures }`.
 */
export function selfTest() {
  const failures = [];
  let examined = 0;
  const planted = springProperties(eulerSpring); examined++;
  if (!planted.length) failures.push("planted Euler spring was not caught; the property check is broken");
  const real = springProperties(spring); examined++;
  failures.push(...real.map((f) => `spring: ${f}`));

  const shake = createTrauma(); shake.add(1); examined++;
  let last = 0;
  for (let i = 0; i < 120; i++) last = Math.abs(shake.update(1 / 60).yaw);
  if (shake.trauma > 0 || last !== 0) failures.push("trauma was still shaking the view two seconds after a full hit");

  const stop = createHitstop(); stop.hold(0.05); examined++;
  let simulated = 0;
  for (let i = 0; i < 6; i++) simulated += stop.step(1 / 60);
  if (Math.abs(simulated - (6 / 60 - 0.05)) > 1e-9) failures.push(`hitstop simulated ${simulated.toFixed(4)} s of 0.05 s after a 0.05 s hold`);
  return { ok: failures.length === 0, examined, failures };
}

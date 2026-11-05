/**
 * A fixed pool of real lights standing in for any number of authored ones.
 *
 * Three.js compiles the light count into every lit shader. Add a point light, remove
 * one, or toggle `visible`, and every material recompiles on the next frame: a stall in
 * the middle of play. So the game creates `size` real lights once, never changes how
 * many exist, and lets this pool decide each frame which authored sources they show.
 *
 *   import { createLightPool, selfTest } from "./light-pool.js";
 *   const pool = createLightPool({ size: 6 });
 *   const real = Array.from({ length: pool.size }, () => { const l = new THREE.PointLight(0xffffff, 0); scene.add(l); return l; });
 *   // each frame, with sources = [{ id, x, y, z, intensity, range, color }]
 *   pool.update(dt, sources, camera.position).forEach((slot, i) => {
 *     real[i].position.set(slot.x, slot.y, slot.z);
 *     real[i].intensity = slot.intensity;     // 0 when empty: never toggle visible
 *     real[i].distance = slot.range;
 *     if (slot.color !== undefined) real[i].color.set(slot.color);
 *   });
 *
 * Two behaviours make a pool watchable rather than a flicker machine:
 *  - hysteresis: a waiting source replaces a shown one only when it scores clearly
 *    higher, so two lamps of similar strength do not trade places every frame;
 *  - handover at zero: a replaced slot fades out, moves on the frame its intensity is
 *    exactly zero, then fades in at the new source. A lit light never teleports.
 *
 * Defaults are Der Koloss's reference configuration (about 68 authored lamps shown
 * through a handful of real lights). Run `selfTest()` after editing; it plants a pool
 * without each behaviour and fails unless the planted defect is measured.
 */

export const POOL_DEFAULTS = Object.freeze({ size: 6, hysteresis: 1.7, fadeSeconds: 0.25 });

/** How much one source matters at the viewer: intensity over distance, windowed to its range. */
export function contribution(source, viewer) {
  const dx = source.x - viewer.x, dy = source.y - viewer.y, dz = source.z - viewer.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const range = source.range > 0 ? source.range : Infinity;
  const ratio = range === Infinity ? 0 : d2 / (range * range);
  const window = Math.max(0, 1 - ratio * ratio) ** 2;
  return (source.intensity * window) / Math.max(d2, 1);
}

export function createLightPool(options = {}) {
  const { size, hysteresis, fadeSeconds } = { ...POOL_DEFAULTS, ...options };
  if (!Number.isInteger(size) || size < 1) throw new Error("size must be a positive integer");
  const slots = Array.from({ length: size }, () => ({ id: null, next: null, fade: 0, x: 0, y: 0, z: 0, range: 0, color: undefined, base: 0 }));
  const out = Array.from({ length: size }, () => ({ sourceId: null, x: 0, y: 0, z: 0, intensity: 0, range: 0, color: undefined }));
  const rate = fadeSeconds > 0 ? 1 / fadeSeconds : Infinity;

  function place(slot, source) {
    slot.x = source.x; slot.y = source.y; slot.z = source.z;
    slot.range = source.range ?? 0; slot.color = source.color; slot.base = source.intensity;
  }

  return {
    size,
    /** Advances fades and assignments. Returns `size` slots every call, empty ones at intensity 0. */
    update(dt, sources, viewer) {
      const byId = new Map();
      const scored = [];
      for (const source of sources) {
        if (source.enabled === false || !(source.intensity > 0)) continue;
        byId.set(source.id, source);
        scored.push({ source, score: contribution(source, viewer) });
      }
      scored.sort((a, b) => b.score - a.score);
      const shown = new Set(slots.map((slot) => slot.next ?? slot.id).filter((id) => id !== null));
      const scoreOf = new Map(scored.map((entry) => [entry.source.id, entry.score]));

      // Fill empty slots, then let clearly stronger waiting sources displace the weakest.
      for (const { source, score } of scored) {
        if (shown.has(source.id) || score <= 0) continue;
        const empty = slots.find((slot) => slot.id === null && slot.next === null);
        if (empty) { empty.next = source.id; shown.add(source.id); continue; }
        let weakest = null, weakestScore = Infinity;
        for (const slot of slots) {
          if (slot.next !== null) continue; // already handing over
          const s = scoreOf.get(slot.id) ?? 0;
          if (s < weakestScore) { weakest = slot; weakestScore = s; }
        }
        if (weakest && score > weakestScore * hysteresis) { weakest.next = source.id; shown.add(source.id); }
      }

      slots.forEach((slot, i) => {
        const current = slot.id !== null ? byId.get(slot.id) : undefined;
        // A source that vanished or fell to nothing fades out where it stands.
        const leaving = slot.next !== null || (slot.id !== null && !current);
        if (leaving) {
          slot.fade = Math.max(0, slot.fade - dt * rate);
          if (slot.fade === 0) {
            // The handover frame: intensity is exactly zero, so moving now cannot be seen.
            const incoming = slot.next !== null ? byId.get(slot.next) : undefined;
            slot.id = incoming ? incoming.id : null;
            slot.next = null;
            if (incoming) place(slot, incoming); else slot.base = 0;
          }
        } else if (current) {
          place(slot, current); // a source that genuinely moves is followed
          slot.fade = Math.min(1, slot.fade + dt * rate);
        }
        const o = out[i];
        o.sourceId = slot.id; o.x = slot.x; o.y = slot.y; o.z = slot.z; o.range = slot.range; o.color = slot.color;
        o.intensity = slot.id === null ? 0 : slot.base * slot.fade;
      });
      return out;
    },
  };
}

/**
 * Drives `makePool` along a walk past a row of lamps, then parks the viewer inside a
 * ring of near-equal lamps whose strengths wobble, and measures what a player would see:
 *  - countChanges: frames where the number of real lights changed (a shader recompile);
 *  - litTeleports: a lit real light jumping more than 0.25 m to a different source;
 *  - pops: a real light's intensity changing by more than half its source in one frame;
 *  - reassignments: how often a real light changed which source it shows.
 */
export function measurePool(makePool, { frames = 600, dt = 1 / 60 } = {}) {
  const lamps = Array.from({ length: 24 }, (_, i) => ({ id: `lamp${i}`, x: i * 4, y: 3, z: (i % 2) * 6 - 3, intensity: 40, range: 12 }));
  const ring = Array.from({ length: 8 }, (_, k) => ({ id: `ring${k}`, x: -30 + 5 * Math.cos(k * Math.PI / 4), y: 3, z: 5 * Math.sin(k * Math.PI / 4), intensity: 40, range: 30 }));
  const pool = makePool();
  let previous = null, countChanges = 0, litTeleports = 0, pops = 0, reassignments = 0;
  for (let f = 0; f < frames; f++) {
    const walking = f < frames / 2;
    const viewer = walking ? { x: (f / (frames / 2)) * 92, y: 1.7, z: 0 } : { x: -30, y: 1.7, z: 0 };
    ring.forEach((lamp, k) => { lamp.intensity = 40 * (1 + 0.1 * Math.sin(f * 0.9 + k * 1.7)); });
    const slots = pool.update(dt, walking ? lamps : ring, viewer).map((slot) => ({ ...slot }));
    if (previous) {
      if (slots.length !== previous.length) countChanges++;
      slots.forEach((slot, i) => {
        const before = previous[i];
        if (!before) return;
        if (slot.sourceId !== before.sourceId && slot.sourceId !== null) reassignments++;
        const moved = Math.hypot(slot.x - before.x, slot.y - before.y, slot.z - before.z);
        if (moved > 0.25 && slot.intensity > 0 && slot.sourceId !== before.sourceId) litTeleports++;
        if (Math.abs(slot.intensity - before.intensity) > 20) pops++;
      });
    }
    previous = slots;
  }
  return { countChanges, litTeleports, pops, reassignments };
}

/** A pool that returns only the lights it is using: the shader-recompile defect. */
function plantedShrinkingPool() {
  const inner = createLightPool();
  return { size: inner.size, update: (dt, sources, viewer) => inner.update(dt, sources, viewer).filter((slot) => slot.intensity > 0) };
}

/** The obvious pool: slot i shows the i-th strongest source, at full strength. */
function plantedRankedPool() {
  const size = POOL_DEFAULTS.size;
  return {
    size,
    update(dt, sources, viewer) {
      const ranked = sources.map((source) => ({ source, score: contribution(source, viewer) })).sort((a, b) => b.score - a.score);
      return Array.from({ length: size }, (_, i) => {
        const s = ranked[i]?.source;
        return s ? { sourceId: s.id, x: s.x, y: s.y, z: s.z, intensity: s.intensity, range: s.range, color: s.color } : { sourceId: null, x: 0, y: 0, z: 0, intensity: 0, range: 0 };
      });
    },
  };
}

/**
 * Plants each defect and requires the measurement to catch it, then measures the real
 * pool. Returns `{ ok, examined, failures }`.
 */
export function selfTest() {
  const failures = [];
  const real = measurePool(() => createLightPool());
  const shrinking = measurePool(plantedShrinkingPool);
  const ranked = measurePool(plantedRankedPool);
  const instant = measurePool(() => createLightPool({ fadeSeconds: 0 }));
  const twitchy = measurePool(() => createLightPool({ hysteresis: 1 }));
  if (!(shrinking.countChanges > 0)) failures.push("planted shrinking pool was not caught by the count check");
  if (!(ranked.litTeleports > 0)) failures.push("planted ranked pool was not caught by the teleport check");
  if (!(instant.pops > 0)) failures.push("planted pool without fades was not caught by the pop check");
  if (!(twitchy.reassignments > real.reassignments * 2)) failures.push(`planted pool without hysteresis reassigned ${twitchy.reassignments} times against ${real.reassignments}; the flicker check is not discriminating`);
  if (real.countChanges) failures.push(`light count changed ${real.countChanges} times; shaders would recompile`);
  if (real.litTeleports) failures.push(`${real.litTeleports} lit lights jumped to another source`);
  if (real.pops) failures.push(`${real.pops} lights popped by more than half their strength in one frame`);
  if (!(real.reassignments > 0)) failures.push("the walk never reassigned a light, so the handover was not exercised");
  return { ok: failures.length === 0, examined: 5, failures, measured: { real, shrinking, ranked, instant, twitchy } };
}

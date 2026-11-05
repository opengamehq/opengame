import { sanitizeGameEventProps } from './game-events.js';

/** Shared by the API and offline SDK. Small fields still accept addresses, so
 * size limits alone are not privacy checks. The value filter remains a coarse
 * safeguard, not a promise that arbitrary game-supplied text is non-personal. */
export function validateScoreMeta(raw, policy) {
  if (raw === undefined || raw === null) return { ok: true, meta: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'meta must be an object' };
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const expected = Object.hasOwn(policy.keys, key) ? policy.keys[key] : undefined;
    if (expected === undefined) return { ok: false, reason: `meta key not allowed: ${key}` };
    if (typeof value !== expected) return { ok: false, reason: `meta.${key} must be a ${expected}` };
    if (expected === 'string') {
      if (value.length > policy.maxStringLength) return { ok: false, reason: `meta.${key} is longer than ${policy.maxStringLength}` };
      const safe = sanitizeGameEventProps({ [key]: value }, { keys: [key], bytesMax: policy.maxBytes,
        stringCharsMax: policy.maxStringLength, digitRunMin: policy.digitRunMin });
      if (!Object.hasOwn(safe, key)) return { ok: false, reason: `meta.${key} contains a private contact value` };
    } else if (expected === 'number' && !Number.isFinite(value)) return { ok: false, reason: `meta.${key} must be finite` };
    out[key] = value;
  }
  if (new TextEncoder().encode(JSON.stringify(out)).byteLength > policy.maxBytes) {
    return { ok: false, reason: `meta is larger than ${policy.maxBytes} bytes` };
  }
  return { ok: true, meta: out };
}

/** Classification is advisory: every score is still a claim made by the game.
 * Keep the existing outlier receipt semantics identical in local and hosted play. */
export function classifyGameScore(value, board, tolerance) {
  if (!Number.isFinite(value)) return { state: 'rejected', stored: 0 };
  const max = board.plausible_max, min = board.plausible_min;
  if (max !== null && value > max) return { state: value > max * tolerance ? 'rejected' : 'clamped', stored: max };
  if (min !== null && value < min) return { state: value * tolerance < min ? 'rejected' : 'clamped', stored: min };
  return { state: 'ok', stored: value };
}

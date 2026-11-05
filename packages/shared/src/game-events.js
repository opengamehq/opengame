/** One sanitizer on both sides of the SDK boundary. The parent must enforce this
 * even for a game that never imports the SDK. These are coarse privacy filters,
 * not a guarantee that arbitrary strings contain no personal information. */
export function sanitizeGameEventProps(props, policy) {
  const out = {};
  if (!props || typeof props !== 'object') return out;
  const digitRun = new RegExp(`\\p{Nd}{${policy.digitRunMin},}`, 'u');
  const emailLike = value => value.split(/\s+/u).some(word => word.split('@').some((domain, index, parts) => {
    const dot = domain.indexOf('.', 1);
    return index > 0 && parts[index - 1].length > 0 && dot > 0 && dot < domain.length - 1;
  }));
  for (const key of policy.keys) {
    if (!Object.hasOwn(props, key)) continue;
    let value = props[key];
    const bounds = policy.numericBounds?.[key];
    if (bounds && (typeof value !== 'number' || !Number.isFinite(value) || value < bounds[0] || value > bounds[1])) continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Math.abs(value) >= 10 ** (policy.digitRunMin - 1)) continue;
    } else if (typeof value === 'string') {
      if (value.length > policy.bytesMax) continue;
      const normalized = value.normalize('NFKC');
      if (normalized.length > policy.bytesMax || emailLike(normalized) || digitRun.test(normalized)) continue;
      value = value.slice(0, policy.stringCharsMax);
    } else if (typeof value !== 'boolean') continue;
    const candidate = { ...out, [key]: value };
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > policy.bytesMax) continue;
    out[key] = value;
  }
  return out;
}

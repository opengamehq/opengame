const identifier = (value, cap) => typeof value === 'string' && value.length <= cap.lobbyIdCharsMax
  && /^[a-z][a-z0-9_]*$/.exec(value)?.[0] === value && !['__proto__', 'constructor', 'prototype'].includes(value);
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)));

export function readLobbyAllowlist(value, cap) {
  if (!Array.isArray(value) || !value.length || value.length > cap.lobbySettingsMax) return null;
  const keys = new Set(), rows = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [key, choices, initial] = entry;
    if (!identifier(key, cap) || keys.has(key) || !Array.isArray(choices) || !choices.length || choices.length > cap.lobbyChoicesMax
      || !choices.every(value => identifier(value, cap)) || new Set(choices).size !== choices.length || !identifier(initial, cap) || !choices.includes(initial)) return null;
    keys.add(key); rows.push(Object.freeze([key, Object.freeze([...choices]), initial]));
  }
  return Object.freeze(rows);
}

export function lobbyAllowlist(config, cap) {
  const value = readLobbyAllowlist(config.settings.map(setting => [setting.key, setting.choices.map(choice => choice.id), setting.default]), cap);
  if (!value) throw new Error('Invalid room settings.');
  return value;
}

/** Full replacements avoid a host changing one setting against an older revision. */
export function readLobbySelection(value, allowlist) {
  if (!record(value) || Object.keys(value).length !== allowlist.length) return null;
  const parsed = Object.create(null);
  for (const [key, choices] of allowlist) {
    if (!Object.hasOwn(value, key) || typeof value[key] !== 'string' || !choices.includes(value[key])) return null;
    parsed[key] = value[key];
  }
  return Object.freeze(parsed);
}

export function defaultLobbySelection(allowlist) {
  return Object.freeze(Object.fromEntries(allowlist.map(([key, , initial]) => [key, initial])));
}

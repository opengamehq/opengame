/**
 * The TEXT table, as a view of limits' `text` that reads a cap only when somebody asks for it.
 *
 * WHY A VIEW AND NOT A COPY. limits.ts and limits-browser.ts both built TEXT with
 * `Object.fromEntries(Object.entries(raw.text)...)` when the module loaded. That lists every
 * text cap and reads each one, in every process that imports either module, whether or not it
 * ever uses a cap. A traced full records reads of the limits files by key (round 108A,
 * scripts/test-limit-keys.mjs), so it charged about 1,800 test files with the whole `text`
 * table, and a pull request that added one cap made all of them stale until the next traced
 * full: two such merges on 23 Nov 2026 each staled about 4,800 suite-seconds, the week's two
 * largest, where 47 of its 57 limits edits staled under 300 (round 142A). As a view, a file is
 * charged with the caps it reads, and a listing (Object.keys, a spread, JSON.stringify) is
 * charged only where one happens.
 *
 * What it answers is what the copy answered: every key of `text` that does not start with `_`,
 * each the same object, listed in the same order, with Object.prototype behind it. It cannot be
 * written to, which the copy could be and nothing did; a write throws in strict code rather than
 * changing a cap for one module, and so do Object.freeze and Object.preventExtensions.
 * structuredClone refuses a Proxy, so a caller that needs a plain copy spreads it first
 * (`{ ...TEXT }`), and util.inspect (console.log of the table itself) prints `{}`; a single cap
 * prints as it always did. No caller did any of these on 24 Nov 2026.
 */
export function textTable<T extends object>(text: Record<string, unknown>): T {
  const has = Object.prototype.hasOwnProperty;
  const own = (key: PropertyKey): key is string => typeof key === "string" && !key.startsWith("_") && has.call(text, key);
  // The target stays empty: every own key comes from `text`, and anything else (toString,
  // hasOwnProperty, a symbol) falls through to Object.prototype as it did on the copy.
  return new Proxy({} as T, {
    get: (target, key, receiver) => (own(key) ? text[key] : Reflect.get(target, key, receiver)),
    has: (target, key) => own(key) || Reflect.has(target, key),
    ownKeys: () => Object.keys(text).filter(key => !key.startsWith("_")),
    getOwnPropertyDescriptor: (_target, key) => (own(key) ? { value: text[key], writable: false, enumerable: true, configurable: true } : undefined),
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
    setPrototypeOf: () => false,
  });
}

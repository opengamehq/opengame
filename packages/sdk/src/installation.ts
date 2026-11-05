/** Bundled copies share only capabilities installed by this SDK major. Public
 * OpenGame properties belong to creators too, and are not an installation record. */
declare const __SDK_MAJOR__: number;
const key = Symbol.for('opengame.sdk');
type Installation = { major: number; capabilities: Record<string, unknown> };
const scope = globalThis as typeof globalThis & { [key]?: Installation };
function capabilities(): Record<string, unknown> | undefined {
  if (typeof __SDK_MAJOR__ === 'undefined' || !Object.hasOwn(scope, key)) return;
  const record = scope[key];
  if (record && Object.hasOwn(record, 'major') && record.major === __SDK_MAJOR__ && Object.hasOwn(record, 'capabilities')) return record.capabilities;
}
export function installed<T>(name: string): T | undefined {
  const current = capabilities();
  return current && Object.hasOwn(current, name) ? current[name] as T : undefined;
}
export function install<T>(name: string, value: T, reset = false): T {
  if (typeof __SDK_MAJOR__ === 'undefined') return value;
  scope[key] = Object.freeze({ major: __SDK_MAJOR__, capabilities: Object.freeze({ ...(reset ? {} : capabilities()), [name]: value }) });
  return value;
}

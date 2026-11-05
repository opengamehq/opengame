import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import { webcrypto } from 'node:crypto';
import { afterEach } from 'node:test';
const activeHarnesses = new Set();
afterEach(() => {
  for (const h of activeHarnesses) h.og.dispose();
  activeHarnesses.clear();
});
const bundle = readFileSync(new URL('../dist/opengame.js', import.meta.url), 'utf8');
const fullBundle = () => readFileSync(new URL('../dist/opengame-global.js', import.meta.url), 'utf8');
export const limits = JSON.parse(readFileSync(new URL('../../shared/limits.json', import.meta.url), 'utf8'));
export function harness({ full = false, embedded = true, isolated = false, origin = 'https://game.opengame.gg', referrer = 'https://opengame.io/g/test', storage = new Map(), fetcher = async () => { throw new Error('unexpected network'); }, locks, console, beforeLoad, sampled = false, script, ancestors } = {}) {
  const messages = [], listeners = new Map(), captureListeners = new Map(), timers = new Map(), deadlines = new Map(); let serial = 0, elapsed = 0;
  const add = (type, fn, options) => {
    if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn);
    if (!captureListeners.has(type)) captureListeners.set(type, new Set());
    if (options === true || options?.capture) captureListeners.get(type).add(fn);
  };
  const remove = (type, fn, options) => {
    const capture = options === true || options?.capture === true;
    if (capture !== Boolean(captureListeners.get(type)?.has(fn))) return;
    listeners.get(type)?.delete(fn); captureListeners.get(type)?.delete(fn);
  };
  const fire = (type, event = {}) => { for (const fn of listeners.get(type) ?? []) fn(event); };
  const fireFromTarget = (type, target, init = {}) => {
    let stopped = false;
    const event = { type, ...init, stopPropagation() { stopped = true; } };
    for (const fn of captureListeners.get(type) ?? []) fn(event);
    target(event);
    if (!stopped) for (const fn of listeners.get(type) ?? []) if (!captureListeners.get(type)?.has(fn)) fn(event);
  };
  // `ancestors` is location.ancestorOrigins, which Chromium and Safari fill and Firefox does not have.
  const location = Object.assign(new URL(origin), ancestors ? { ancestorOrigins: ancestors } : {});
  const win = { crossOriginIsolated: isolated, postMessage: (data, target) => messages.push({ data, target }), location, addEventListener: add, removeEventListener: remove,
    document: { referrer, visibilityState: 'visible', addEventListener: add, removeEventListener: remove } };
  win.parent = embedded ? { postMessage: (data, target, transfer = []) => messages.push({ data, target, ports: transfer }) } : win;
  const calls = [];
  win.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  win.navigator = { locks };
  const frames = new Map();
  win.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
  win.cancelAnimationFrame = id => frames.delete(id);
  win.performance = { memory: { usedJSHeapSize: 32 * 1024 * 1024 } };
  const controlledMath = Object.create(Math);
  controlledMath.random = () => sampled ? 0 : 1;
  const epoch = Date.now();
  class ClockDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(epoch + elapsed); }
    static now() { return epoch + elapsed; }
  }
  const controlledAbortSignal = {
    abort: reason => AbortSignal.abort(reason),
    any: signals => AbortSignal.any(signals),
    timeout: delay => {
      const controller = new AbortController();
      deadlines.set(++serial, { at: elapsed + delay, fn: () => controller.abort(new DOMException('Timed out', 'TimeoutError')) });
      return controller.signal;
    },
  };
  win.__OG_DEV__ = 1;
  const context = { window: win, URL, URLSearchParams, TextEncoder, TextDecoder, Date: ClockDate, AbortController, AbortSignal: controlledAbortSignal, MessageChannel, crypto: webcrypto,
    Math: controlledMath,
    fetch: async (url, init) => { calls.push({url: String(url),init}); return fetcher(url, init); },
    setTimeout: (fn, delay) => { timers.set(++serial, { fn, delay, at: elapsed + delay, interval: false }); return serial; },
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { timers.set(++serial, { fn, delay, at: elapsed + delay, interval: true }); return serial; },
    clearInterval: id => timers.delete(id), ...(console ? { console } : {}) };
  beforeLoad?.(context);
  // `script` loads another build, such as a historical one a published game still carries.
  const source = script ?? (full ? fullBundle() : bundle);
  vm.runInNewContext(source, context);
  const send = (data, source = win.parent, origin = 'https://opengame.io') => fire('message', { data: { og: 1, ...data }, source, origin });
  const advance = milliseconds => {
    const end = elapsed + milliseconds;
    while (true) {
      const next = [...timers.entries(), ...deadlines.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next; elapsed = timer.at;
      if (timer.interval) timer.at += timer.delay; else { timers.delete(id); deadlines.delete(id); }
      timer.fn();
    }
    elapsed = end;
  };
  const replyTicket = data => messages.find(message => message.data.type === 'rtc' && message.data.rid === data.rid)?.ports[0]?.postMessage({ og: 1, ...data });
  const frame = now => { const current = [...frames.values()]; frames.clear(); for (const fn of current) fn(now); };
  const h = { replyTicket, advance, frame, frames, ...context.OpenGame, get global() { return context.OpenGame; }, context,
    run: source => vm.runInNewContext(source, context),
    reload: () => vm.runInNewContext(source, context), loadLegacy: () => vm.runInNewContext(bundle, context), win, messages, listeners, timers, fire, fireFromTarget, send, calls, storage };
  activeHarnesses.add(h);
  return h;
}

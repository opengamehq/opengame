/**
 * `js/og-platform.js`, the file the Studio template and the Originals ship, rebuilt on the
 * SDK so a game can move to one implementation of the protocol by replacing one file.
 *
 *   cp node_modules/@opengamehq/sdk/dist/og-platform.js js/og-platform.js
 *
 * The legacy export names remain available. When replacing the old file:
 *
 * - The handshake, ready, session, mute, fullscreen and analytics are the SDK's. `ogEvent`
 *   becomes `og.track`, so a game's events reach its creator stats through og-api instead
 *   of the page's PostHog series, which the bridge keeps only for files like the old one.
 *   Startup events wait in a bounded queue for the first analytics grant.
 * - A loopback parent is trusted only when the game is also on loopback. Serve both
 *   locally when developing; a production game frame cannot use a localhost parent.
 * - This file includes the core and reuses an installed SDK of the same major version,
 *   including the injected global. It asks again for session state if the injected
 *   handshake finished before the adapter loaded.
 * - Legacy activity messages use the core's checked parent listener.
 * - `ogSessionToken` and `ogAuthHeaders` remain for existing games. New code can submit
 *   and read scores through `og.leaderboard(key)` without handling the session token.
 *
 * Studio ships the generated copy of this adapter. `og` exposes the same client to
 * new game code; legacy helpers remain for the existing engine and audio modules.
 */
export { og } from './index.js';
import { og } from './index.js';

export const OG_API = 'https://api.opengame.gg';
export const OG_ENABLED: boolean = true;
/** Compatibility list of parent origins. The SDK validates trust using the
 * current game origin and the message source. */
export const OG_PARENT_ORIGINS = Object.freeze([
  'https://opengame.io', 'https://admin.opengame.io',
  'http://localhost:4590', 'http://127.0.0.1:4590',
  'http://localhost:4591', 'http://127.0.0.1:4591',
]);
const embedded = (() => { try { return typeof window !== 'undefined' && window.parent !== window; } catch { return true; } })();

let sessionToken: string | null = null;
let pageUrl: string | null = null;
let readySent = false;
let active = true;
let holding = false;
const sessionWaiters: (() => void)[] = [];
const activityWatchers = new Set<(active: boolean) => void>();
const managedMedia = new WeakSet<Element>();
const quietedMedia: HTMLMediaElement[] = [];
const quietedAnimations: Animation[] = [];

if (embedded) {
  og.onParentMessage((data) => {
    if (data.type === 'session') {
      if (typeof data.token === 'string' && data.token) sessionToken = data.token;
      else if (data.token === null) sessionToken = null;
      if (typeof data.page === 'string' && /^(https:\/\/|http:\/\/localhost[:/]|http:\/\/127\.0\.0\.1[:/])/.test(data.page)) pageUrl = data.page;
      while (sessionWaiters.length) sessionWaiters.shift()!();
    } else if (data.type === 'play') {
      /* The person pressed Play on the page that boots this game under its poster. The old
         file turned that into this event, and Studio's main.js and both Originals unlock
         their audio on it: the press is a gesture on the page that `allow="autoplay"`
         hands to the frame. Without it a switched game stays silent until a click of its own. */
      window.dispatchEvent(new CustomEvent('og:play'));
    } else if (data.type === 'activity' && typeof data.active === 'boolean') {
      if (data.active !== active) { active = data.active; updateHolding(); }
    }
  });
  /* The injected global (/_og/sdk.js) asks the page for the session as it loads, and the
     page usually answers before this module runs, so this listener missed the session
     and, for a frame held under the poster, the activity rest. The page answers every
     ready with both again, so a client already connected asks once more. */
  if (og.env.connected) og.postToParent({ type: 'ready', phase: 'init' });
  void og.init();
}

export function ogUrl(path: string): string | null { return OG_ENABLED ? OG_API + path : null; }
export function ogEvent(name: string, props?: Record<string, unknown>): void { og.track(String(name), props ?? {}); }
export function ogReady(): void {
  if (readySent) return;
  readySent = true;
  og.ready();
  updateHolding();
}
export function ogSessionToken(): string | null { return sessionToken; }
export function ogAwaitSession(timeoutMs = 4000): Promise<boolean> {
  if (!embedded) return Promise.resolve(false);
  if (sessionToken || pageUrl) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    sessionWaiters.push(() => { clearTimeout(timer); resolve(true); });
  });
}
export function ogPageUrl(): string | null { return pageUrl; }
export function ogIsEmbedded(): boolean { return embedded; }
export function ogHostLabel(): string | null {
  if (typeof location === 'undefined') return null;
  return /^([a-z0-9-]+)\.opengame\.gg$/.exec(location.hostname)?.[1] ?? null;
}
export function ogIsFullscreen(): boolean {
  if (typeof document !== 'undefined' && document.fullscreenElement) return true;
  return og.fullscreen.active;
}
export function ogOnFullscreenChange(fn: (active: boolean) => void): () => void {
  let first = true;
  // The SDK calls a new listener at once with the current state; the old file did not.
  return og.fullscreen.onChange((value) => { if (first) { first = false; return; } fn(value); });
}
export function ogIsHostMuted(): boolean { return og.audio.muted; }
export function ogOnHostMute(fn: (muted: boolean) => void): () => void { return og.audio.onHostMute(fn); }
export function ogAuthHeaders(): Record<string, string> { return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}; }

/* The activity rest Studio relies on: told it is not the surface in use, after ready, the
   game holds its animation-frame callbacks and pauses the media and CSS animations it
   does not manage, and the last frame stays on screen. The same rules as the old file. */
export function ogIsActive(): boolean { return !holding; }
export function ogOnActivity(fn: (active: boolean) => void): () => void { activityWatchers.add(fn); fn(!holding); return () => { activityWatchers.delete(fn); }; }
export function ogManageMedia<T extends Element>(element: T): T { managedMedia.add(element); return element; }

function updateHolding() {
  const next = !active && readySent;
  if (next === holding) return;
  holding = next;
  if (holding) quiet(); else wake();
  for (const fn of activityWatchers) { try { fn(!holding); } catch (error) { console.warn('[og] activity:', error); } }
}
function quiet() {
  if (typeof document === 'undefined') return;
  for (const element of Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video'))) {
    if (!element.paused && !managedMedia.has(element)) { element.pause(); quietedMedia.push(element); }
  }
  for (const animation of document.getAnimations?.() ?? []) {
    if (animation.playState === 'running') { animation.pause(); quietedAnimations.push(animation); }
  }
}
function wake() {
  for (const element of quietedMedia.splice(0)) if (element.paused && element.isConnected) element.play()?.catch?.(() => {});
  for (const animation of quietedAnimations.splice(0)) if (animation.playState === 'paused') animation.play();
  governor?.wake();
}
function reportLater(error: unknown) {
  if (typeof reportError === 'function') reportError(error);
  else setTimeout(() => { throw error; });
}
const governor = (() => {
  if (typeof window === 'undefined' || !embedded || typeof window.requestAnimationFrame !== 'function') return null;
  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 0x40000000, pump = 0;
  let running: Map<number, FrameRequestCallback> | null = null;
  function run(now: number, paint: boolean) {
    pump = 0;
    if (holding && !paint) return;
    running = new Map(queue);
    queue.clear();
    for (const [id, callback] of running) {
      if (!running.has(id)) continue;
      running.delete(id);
      try { callback(now); } catch (error) { reportLater(error); }
    }
    running = null;
  }
  const schedule = (paint: boolean) => { if (!pump && queue.size) pump = nativeRequest((now) => run(now, paint)); };
  window.requestAnimationFrame = function requestAnimationFrame(callback: FrameRequestCallback) {
    if (typeof callback !== 'function') return nativeRequest(callback);
    const id = ++nextId;
    queue.set(id, callback);
    if (!holding) schedule(false);
    return id;
  };
  window.cancelAnimationFrame = function cancelAnimationFrame(id: number) {
    if (!queue.delete(id) && !running?.delete(id)) nativeCancel(id);
  };
  window.addEventListener('resize', () => { if (holding) schedule(true); });
  return { wake() { schedule(false); } };
})();

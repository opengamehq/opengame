import { Achievements } from './achievements.js';
import { discard, readJson } from './response.js';
import { runtimeHealth, type RuntimePolicy } from './runtime-health.js';
export type { Achievement, AchievementUnlock, AchievementResult } from './achievements.js';
import { installed, install } from './installation.js';
import { externalGameLink } from "@opengame/shared/game-links";
import { readAvatarLook } from "@opengame/shared/avatar-look";
import { readCharacterRecipe } from "@opengame/shared/character-look-wire";
import { sanitizeGameEventProps, type GameEventPolicy } from "@opengame/shared/game-events";
import { Leaderboards, type Leaderboard, type LeaderboardConfig } from "./leaderboards.js";
export type { Leaderboard, LeaderboardPage, ScoreEntry, ScoreMeta, ScoreReceipt } from "./leaderboards.js";
/** `dev.player` chooses the local mock's identity, so a game can be checked as a
 * guest, a signed-in player, or an account that has not claimed a handle yet.
 * `?og-dev-player=guest|signed-in|no-handle` on the page URL does the same. The
 * signed-in player shares an avatar with a look and a character, as a hosted player
 * who has turned on profile sharing does. */
export type DevPlayer = 'guest' | 'signed-in' | 'no-handle';
/** Options for the first `init` call. `manifest` supplies local board settings;
 * `dev.player` selects the local identity. Later calls reuse initialization. */
export type InitOptions = { manifest?: unknown; dev?: { player?: DevPlayer } };

/** The SDK leaves the game loop and rendering context to the game. The injected
 * global starts the hosted handshake on load; `init` starts lifecycle and health
 * reporting, and `dispose` removes listeners and timers. */
declare const __SDK_CONFIG__: {
  runtime: RuntimePolicy;
  batchMax: number; batchBytesMax: number; eventsMax: number; eventTimeoutMs: number; achievementIdCharsMax: number;
  leaderboards: LeaderboardConfig;
  eventPolicy: GameEventPolicy; handshakeRetryMs: number; parentOrigins: string[]; developmentParentOrigins: string[]; rateWindowMs: number;
  externalLinkUrlCharsMax: number; externalLinkConfirmationMs: number;
  version: string; handshakeTimeoutMs: number; sessionPendingTimeoutMs: number; eventBatchMs: number; eventsPerMinute: number;
  eventNameMax: number; eventBytesMax: number; eventKeys: readonly string[]; eventsApiOrigin: string;
};
export type Capability = 'identity' | 'leaderboards' | 'analytics' | 'external-links' | 'avatar';
/** Current connection state and services available to this game. Check
 * `capabilities` before using a service; previews can have fewer services. */
export type Environment = Readonly<{ embedded: boolean; connected: boolean; preview: boolean; sdkVersion: string; capabilities: readonly Capability[] }>;
/** `look` is the head and `character` the body and clothes, each a recipe string in
 * OpenGame's stored format. `character` is present only when `look` is. */
export type AvatarRecipe = Readonly<{ seed: number; palette: string; look?: string; character?: string }>;
/** The game's player identity. `id` is scoped to this game. Profile sharing controls
 * `handle`, `ogNumber` and `avatar`, independently of `signedIn`. Null fields are valid
 * for guests, withheld profiles and unavailable sessions. Previews withhold profiles. */
export type Player = Readonly<{ id: string | null; handle: string | null; ogNumber: number | null; signedIn: boolean; avatar?: AvatarRecipe | null }>;
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string; reason?: string };
type Listener<T> = (value: T) => void;
const hostedParents = __SDK_CONFIG__.parentOrigins;
const capabilityNames = new Set<Capability>(['identity', 'leaderboards', 'analytics', 'external-links', 'avatar']);
const emptyPlayer: Player = Object.freeze({ id: null, handle: null, ogNumber: null, signedIn: false });
const loopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
/** Local identities. The guest has no handle, as a hosted guest has none. */
const devPlayers: Record<DevPlayer, Player> = {
  guest: Object.freeze({ id: 'dev-guest', handle: null, ogNumber: null, signedIn: false }),
  'signed-in': Object.freeze({ id: 'dev-account', handle: 'dev', ogNumber: 1, signedIn: true, avatar: Object.freeze({ seed: 1, palette: 'sky',
    look: 'circle.classic.white', character: 'c4.classic.regular.hoodie.jeans.cape-watch.retro.avatar.avatar.avatar.avatar' }) }),
  'no-handle': Object.freeze({ id: 'dev-account', handle: null, ogNumber: null, signedIn: true }),
};
function eventId(): string {
  // getRandomValues also exists on HTTP LAN pages, where randomUUID may not.
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const random = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const time = Date.now().toString(16).padStart(12, '0');
  return `${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(0, 3)}-${(8 + (bytes[9]! & 3)).toString(16)}${random.slice(3, 6)}-${random.slice(6, 18)}`;
}
type QueuedEvent = { token: string | null; eventId: string; occurredAt: string; name: string; props: Record<string, string | number | boolean> };

/** A local parent is trusted only by a local game. A published game must never
 * acquire a localhost exception just because a developer uses the same SDK. */
export function trustedParent(origin: string, gameOrigin: string): boolean {
  if (hostedParents.includes(origin)) return true;
  try {
    const parent = new URL(origin), game = new URL(gameOrigin);
    return (parent.protocol === 'http:' || parent.protocol === 'https:') && loopback(parent.hostname) &&
      (game.protocol === 'http:' || game.protocol === 'https:') && loopback(game.hostname) && parent.origin === origin;
  } catch { return false; }
}
function notify<T>(listeners: Set<Listener<T>>, value: T) {
  for (const listener of listeners) { try { listener(value); } catch { /* A game callback cannot break the bridge. */ } }
}
function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>, current: T) { listeners.add(listener); try { listener(current); } catch { /* isolate game callbacks */ } return () => { listeners.delete(listener); }; }
const avatarPalettes = new Set(['paper', 'ink', 'sky', 'meadow', 'coral', 'iris', 'honey', 'tide']);
function readAvatar(value: unknown, outfit: unknown): AvatarRecipe | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const avatar = value as Record<string, unknown>;
  // An absent or unreadable look is left out of the result, so a key count that
  // differs from the message's refuses the whole avatar: a malformed look and any key
  // this reader does not know, alike. The outfit arrives beside the avatar, because
  // SDKs built before it refuse an avatar holding a key they do not know, and it
  // joins the result only with a look.
  const look = readAvatarLook(avatar.look), character = look && readCharacterRecipe(outfit);
  const recipe = { seed: Number(avatar.seed), palette: avatar.palette as string, ...(look ? { look } : {}) };
  return Object.keys(avatar).length !== Object.keys(recipe).length || !Number.isSafeInteger(avatar.seed) || recipe.seed < 0 ||
    !avatarPalettes.has(recipe.palette) ? null : Object.freeze(character ? { ...recipe, character } : recipe);
}
function readPlayer(value: unknown, allowAvatar = false): Player | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id || typeof p.signedIn !== 'boolean' ||
    !(p.handle === null || typeof p.handle === 'string') ||
    !(p.ogNumber === null || (Number.isSafeInteger(p.ogNumber) && Number(p.ogNumber) > 0))) return null;
  const avatar = allowAvatar && p.signedIn ? readAvatar(p.avatar, p.character) : null;
  return Object.freeze({ id: p.id, handle: p.handle as string | null, ogNumber: p.ogNumber as number | null, signedIn: p.signedIn, ...(avatar ? { avatar } : {}) });
}

let greeted = false;
/**
 * Once a page, in the developer's own console, the local mock says what it is pretending:
 * who is playing, where scores go, and the one switch that changes the player. Without
 * it a game running locally looks connected and nothing says the scores are in
 * localStorage. Only on localhost or a file, so a game hosted somewhere other than
 * OpenGame never writes to its players' consoles.
 *
 * Words only, and short ones. pf/cli-mascot drew the default character beside this as a
 * 32-cell PNG, and on the launch candidate, where the core already measured 9,950 bytes
 * of a 10,240 budget, the face and the first wording came
 * to 10,834. The budget is limits.json's and stays where it is; console copy shares it with runtime checks.
 */
function greet(win: Window, player: DevPlayer) {
  if (greeted) return;
  try {
    const { protocol, hostname } = win.location;
    // A developer's own test runner pretends to be localhost too, once per test file.
    if (protocol !== 'file:' && !loopback(hostname) || /jsdom|happy-?dom/i.test(win.navigator?.userAgent ?? '')) return;
  } catch { return; }
  greeted = true;
  const guest = player === 'signed-in';
  globalThis.console?.info?.(`OpenGame SDK ${__SDK_CONFIG__.version}: local mock
Playing as ${guest ? '@dev, signed in' : player === 'guest' ? 'a guest' : 'an account with no handle yet'}. Add ?og-dev-player=${guest ? 'guest' : 'signed-in'} to switch.
Scores stay in this browser.`);
}

class Client {
  private win: Window | undefined;
  private localMode = false;
  private sessionToken: string | null = null;
  /** Who the session is for, never the credential. A token rotated for the same
   * player is a silent swap: reads in flight still count. */
  private account = '';
  private devPlayer: DevPlayer = 'guest';
  /** @internal For the og-platform.js adapter alone (src/og-platform.ts): every message
   * the trusted parent sends, after this client's own origin and source checks, so the
   * adapter can answer the parts of the old protocol the SDK does not model (activity
   * rest) without a second implementation of who to trust. */
  onParentMessage(listener: (data: Record<string, unknown>) => void) { this.parentListeners.add(listener); return () => { this.parentListeners.delete(listener); }; }
  /** @internal The same adapter's way to speak the old protocol to the trusted parent. */
  postToParent(message: Record<string, unknown>): Result { return this.send(message); }
  private readonly parentListeners = new Set<(data: Record<string, unknown>) => void>();
  private readonly boards = new Leaderboards(() => ({ win: this.win, local: this.localMode,
    token: this.sessionToken, enabled: this.capabilities.includes("leaderboards"), preview: this.env.preview, disposed: this.disposed }), () => this.init());
  private parentOrigin: string | null = null;
  private initialization: Promise<Environment> | null = null;
  private settle: ((env: Environment) => void) | null = null;
  private extendedHandshake = false;
  private handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  private initRetry: ReturnType<typeof setInterval> | undefined;
  private readyRetry: ReturnType<typeof setInterval> | undefined;
  private readyDeadline: ReturnType<typeof setTimeout> | undefined;
  private batchTimer: ReturnType<typeof setInterval> | undefined;
  private readySent = false;
  private readyReported = false;
  private readyElapsed = 0;
  private inputReported = false;
  private attentionReported = false;
  private health: ReturnType<typeof runtimeHealth> | undefined;
  private bootedAt = Date.now();
  private sessionGeneration = 0;
  // Only the first, never-authorized startup window may acquire a later token.
  private startupOpen = true;
  private disposed = false;
  private hostPaused = false;
  private held = false;
  private readonly playWaiters = new Set<(result: Result) => void>();
  private paused = false;
  private muted = false;
  private full = false;
  private playerValue: Player = emptyPlayer;
  private environment: Environment = Object.freeze({ embedded: false, connected: false, preview: false, sdkVersion: __SDK_CONFIG__.version, capabilities: Object.freeze([]) });
  private readonly playerListeners = new Set<Listener<Player>>();
  private readonly muteListeners = new Set<Listener<boolean>>();
  private readonly pauseListeners = new Set<Listener<boolean>>();
  private readonly fullscreenListeners = new Set<Listener<boolean>>();
  private cancelLink: ((error: string) => void) | null = null;
  readonly achievements = new Achievements(
    () => ({ token: this.sessionToken, preview: this.env.preview, disposed: this.disposed, generation: this.sessionGeneration }));
  private events: QueuedEvent[] = [];
  private flushing = false;
  private eventsRecorded = 0;
  private eventTimes: number[] = [];

  get env(): Environment { return this.environment; }
  get capabilities(): readonly Capability[] { return this.environment.capabilities; }
  /** Current player, sign-in action and subscription. `onChange` calls the listener
   * immediately, then on player changes, and returns an unsubscribe function.
   * Subscribe while loading to receive identity from the injected handshake. */
  readonly player = (() => { const client = this; return {
    get id() { return client.playerValue.id; },
    get handle() { return client.playerValue.handle; },
    get ogNumber() { return client.playerValue.ogNumber; },
    get signedIn() { return client.playerValue.signedIn; },
    get avatar() { return client.playerValue.avatar ?? null; },
    onChange: (listener: Listener<Player>) => subscribe(this.playerListeners, listener, this.playerValue),
    /* No credential() here, deliberately. There was one, documented as something to
       verify on the game's own server, and a published game cannot reach a server of
       its own: connect-src on opengame.gg names this platform's API and broker only,
       and the plan refuses games that need one. It also handed game code the bearer
       token for this game's scores. The Ed25519 key set stays, for the Workers. When
       creator server keys and an egress path exist, this comes back with them, and
       with a verifier that checks gid, exp and preview. */
    requestSignIn: (): Result => {
      if (!this.capabilities.includes('identity')) return { ok: false, error: 'unavailable' };
      if (!this.localMode) return this.send({ type: 'sign-in' });
      // The local mock signs in at once, so onChange can be exercised offline.
      if (!this.playerValue.signedIn) this.setLocalPlayer('signed-in');
      return { ok: true, value: undefined };
    },
  }; })();
  readonly audio = (() => { const client = this; return {
    get muted() { return client.muted; },
    onHostMute: (listener: Listener<boolean>) => subscribe(this.muteListeners, listener, this.muted),
  }; })();
  readonly fullscreen = (() => { const client = this; return {
    get active() { return client.full; },
    request: (): Result => this.send({ type: 'fullscreen' }),
    onChange: (listener: Listener<boolean>) => subscribe(this.fullscreenListeners, listener, this.full),
  }; })();
  onPause(listener: Listener<boolean>) { return subscribe(this.pauseListeners, listener, this.paused); }

  /** Call directly from a click or key handler. The parent displays the destination;
   * the player then chooses Open site or Keep playing in the parent's own dialog. */
  openLink(url: string): Promise<Result> {
    if (this.disposed) return Promise.resolve({ ok: false, error: 'disposed' });
    if (!this.capabilities.includes('external-links') || !this.parentOrigin) return Promise.resolve({ ok: false, error: 'unavailable' });
    const href = externalGameLink(url, __SDK_CONFIG__.externalLinkUrlCharsMax, [this.parentOrigin, this.win?.location.origin ?? '']);
    if (!href) return Promise.resolve({ ok: false, error: 'invalid_request' });
    if (!this.win?.navigator.userActivation?.isActive) return Promise.resolve({ ok: false, error: 'gesture_required' });
    if (this.cancelLink) return Promise.resolve({ ok: false, error: 'busy' });
    return new Promise(resolve => {
      const { port1, port2 } = new MessageChannel();
      let settled = false;
      const finish = (result: Result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); port1.close(); port2.close(); this.cancelLink = null; resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), __SDK_CONFIG__.externalLinkConfirmationMs + __SDK_CONFIG__.handshakeRetryMs);
      this.cancelLink = error => finish({ ok: false, error });
      port1.onmessage = event => {
        const reply = event.data;
        if (!reply || reply.og !== 1 || reply.type !== 'open-link' || typeof reply.ok !== 'boolean') return;
        finish(reply.ok ? { ok: true, value: undefined } : { ok: false, error: typeof reply.error === 'string' ? reply.error : 'cancelled' });
      };
      port1.onmessageerror = () => finish({ ok: false, error: 'invalid_response' });
      const sent = this.send({ type: 'open-link', url: href }, [port2]);
      if (!sent.ok) finish(sent);
    });
  }

  /** @internal Human waiting under the warm poster has no network deadline. */
  waitForPlay(signal?: AbortSignal): Promise<Result> {
    if (this.disposed) return Promise.resolve({ ok: false, error: 'disposed' });
    if (!this.held) return Promise.resolve({ ok: true, value: undefined });
    return new Promise(resolve => {
      const finish = (result: Result) => { this.playWaiters.delete(finish); signal?.removeEventListener('abort', cancel); resolve(result); };
      const cancel = () => finish({ ok: false, error: 'cancelled' });
      this.playWaiters.add(finish);
      if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    });
  }
  private finishPlayWaiters(result: Result) { for (const finish of this.playWaiters) finish(result); }

  leaderboard(key: string): Leaderboard { return this.boards.board(key); }

  /**
   * @internal Ask the page for the session now, before the game calls `init`.
   *
   * The injected global calls this as it loads (global/bridge.ts), so the player is
   * asked for while the game's own scripts and engine are still downloading, and is
   * usually in hand before the game first reads `og.player`. A native engine that
   * cannot call `init` until its runtime has booted, which can be a minute for a large
   * WebAssembly game, used to start the handshake only then, so its loading screen and
   * first menu showed the default character (OG Clash, 28 Oct 2026).
   *
   * Transport only: the trusted listener and the init probe, which is what the page
   * answers with the session. No input, error or frame-rate collector starts here,
   * because a game that never calls `init` must not begin reporting analytics because
   * the platform injected this file. `init` adopts whatever has already arrived.
   *
   * Only on a hosted origin. Elsewhere an unanswered handshake ends in the local mock,
   * and that has to wait for the options the game passes to `init`.
   */
  connect(): void {
    const win = typeof window === 'undefined' ? undefined : window;
    if (this.win || this.disposed || !win || win.parent === win || !this.boards.isHostedOrigin(win.location.hostname)) return;
    this.attach(win);
    this.handshake();
  }
  private attach(win: Window | undefined) {
    const embedded = Boolean(win && win.parent !== win);
    this.win = win;
    this.environment = Object.freeze({ ...this.environment, embedded, preview: Boolean(win && /^p-[a-z2-7]{52}\./.test(win.location.hostname)) });
    if (embedded) win!.addEventListener('message', this.receive);
  }
  private handshake() {
    clearTimeout(this.handshakeTimer); clearInterval(this.initRetry);
    this.handshakeTimer = setTimeout(() => this.finish(), __SDK_CONFIG__.handshakeTimeoutMs);
    // Ready with an init phase remains readable by the original frame protocol.
    // New parents wait for the playable phase before recording readiness.
    const probe = () => this.send({ type: 'ready', phase: 'init', sdk: __SDK_CONFIG__.version, isolated: this.win?.crossOriginIsolated === true });
    this.initRetry = setInterval(probe, __SDK_CONFIG__.handshakeRetryMs);
    probe();
  }
  /** Initialize lifecycle listeners and event reporting, reusing any handshake the
   * injected SDK started during loading. Resolves with the available environment,
   * including when hosted services are unavailable. Outside OpenGame hosting, an
   * unanswered handshake uses the local mock. The first call sets the options. */
  init(options: InitOptions = {}): Promise<Environment> {
    if (this.initialization) return this.initialization;
    if (this.disposed) return Promise.resolve(this.environment);
    this.boards.configure(options.manifest);
    if (options.dev?.player && Object.hasOwn(devPlayers, options.dev.player)) this.devPlayer = options.dev.player;
    if (!this.win) this.attach(typeof window === 'undefined' ? undefined : window);
    const win = this.win;
    const embedded = this.environment.embedded;
    this.initialization = new Promise(resolve => { this.settle = resolve; });
    win?.document.addEventListener('visibilitychange', this.visibility);
    // First-input analytics is separate from the canonical host runtime's
    // repeated advisory input messages. Never duplicate that control producer.
    win?.addEventListener('pointerdown', this.firstInput, true);
    win?.addEventListener('keydown', this.firstInput, true);
    if (win) this.health = runtimeHealth(win, __SDK_CONFIG__.runtime,
      () => this.readySent && (this.localMode || Boolean(this.sessionToken)) && this.capabilities.includes('analytics') && !this.paused && !this.held,
      (name, props) => this.track(name, props).ok);
    this.visibility();
    if (!win || !embedded) { this.finish(); return this.initialization; }
    win.addEventListener('pagehide', this.flush);
    this.batchTimer ??= setInterval(this.flush, __SDK_CONFIG__.eventBatchMs);
    /* After `connect`, the page has usually answered already, and the game starts with
       its player. A handshake still under way is adopted rather than restarted, so the
       page is asked once and its deadline still counts from the first probe. A page that
       said the session is still being verified gets one more full pending wait from
       here, bounded: the pending notice is honoured only once, so this cannot be
       extended again however many notices follow. */
    if (this.environment.connected) this.finish();
    else if (this.extendedHandshake) { clearTimeout(this.handshakeTimer); this.handshakeTimer = setTimeout(() => this.finish(), __SDK_CONFIG__.sessionPendingTimeoutMs); }
    else if (this.initRetry === undefined) this.handshake();
    return this.initialization;
  }
  /** Report that the game is playable, after assets and controls are ready.
   * Starts initialization if needed. Repeated calls have no effect. */
  ready(): void {
    if (this.readySent || this.disposed) return;
    void this.init();
    this.readySent = true;
    this.readyElapsed = Date.now() - this.bootedAt;
    this.reportReady();
    if (!this.win) return;
    if (this.win.parent === this.win) {
      // The measurement harness also runs games directly. This local message
      // reports playability without involving an external page or service.
      try { this.win.postMessage({ og: 1, type: 'ready', phase: 'playable', sdk: __SDK_CONFIG__.version, isolated: this.win.crossOriginIsolated === true }, this.win.location.origin); } catch { /* opaque file origins need no host */ }
      return;
    }
    const probe = () => this.send({ type: 'ready', phase: 'playable', sdk: __SDK_CONFIG__.version, isolated: this.win?.crossOriginIsolated === true });
    this.readyRetry = setInterval(probe, __SDK_CONFIG__.handshakeRetryMs);
    this.readyDeadline = setTimeout(() => clearInterval(this.readyRetry), __SDK_CONFIG__.handshakeTimeoutMs);
    probe();
  }
  private finish() {
    if (!this.disposed && this.win && !this.environment.connected && !this.boards.isHostedOrigin() &&
      (this.win as Window & { __OG_DEV__?: unknown }).__OG_DEV__ === 1) {
      this.localMode = true;
      let url: URL | null = null;
      try { url = new URL(this.win.location.href); } catch { /* opaque documents keep the defaults */ }
      const requested = url?.searchParams.get('og-dev-player');
      if (requested && Object.hasOwn(devPlayers, requested)) this.devPlayer = requested as DevPlayer;
      this.setLocalPlayer(this.devPlayer);
      greet(this.win, this.devPlayer);
    }
    clearTimeout(this.handshakeTimer); clearInterval(this.initRetry); this.initRetry = undefined;
    this.settle?.(this.environment); this.settle = null;
  }
  private setLocalPlayer(kind: DevPlayer) {
    const next = devPlayers[kind];
    if (this.playerValue === next) return;
    // Avatar access follows the player, as it does on OpenGame, so a game can check
    // its "Your OG" path offline and still see the capability missing for a guest.
    this.environment = Object.freeze({ ...this.environment, capabilities: Object.freeze((['identity', 'leaderboards', 'analytics'] as Capability[]).concat(next.avatar ? 'avatar' : [])) });
    this.devPlayer = kind;
    this.playerValue = next;
    this.account = `local:${next.id}:${next.signedIn}`;
    notify(this.playerListeners, next);
  }
  private send(message: Record<string, unknown>, transfer?: Transferable[]): Result {
    const win = this.win;
    if (!win || win.parent === win || this.disposed) return { ok: false, error: 'unavailable' };
    if (transfer) {
      if (!this.parentOrigin) return { ok: false, error: 'unavailable' };
      try { win.parent.postMessage({ ...message, og: 1 }, this.parentOrigin, transfer); }
      catch { return { ok: false, error: 'unavailable' }; }
      return { ok: true, value: undefined };
    }
    let targets = this.parentOrigin ? [this.parentOrigin] : [...hostedParents,
      ...__SDK_CONFIG__.developmentParentOrigins.filter(origin => trustedParent(origin, win.location.origin))];
    /* The referrer, or else location.ancestorOrigins, is only a routing hint, under the same
       allowlist as replies. OpenGame frames are loaded with no referrer, so on the live site
       the hint was empty and every message went to each trusted parent in turn; the browser
       dropped the ones that were not the parent and logged a postMessage warning for each,
       in every hosted game's console (area F, 1 Nov 2026). ancestorOrigins names the
       embedding page without a referrer in Chromium and Safari. Firefox has neither, and
       keeps the fixed production allowlist. */
    try {
      const hint = new URL(win.document.referrer || (win.location as Location & { ancestorOrigins?: ArrayLike<string> }).ancestorOrigins?.[0] || '').origin;
      if (!this.parentOrigin && trustedParent(hint, win.location.origin)) targets = [hint];
    } catch { /* no hint: the fixed production allowlist */ }
    for (const origin of targets) { try { win.parent.postMessage({ ...message, og: 1 }, origin); } catch { /* Keep playing if the parent goes away. */ } }
    return { ok: true, value: undefined };
  }
  private receive = (event: MessageEvent) => {
    const win = this.win;
    if (!win || event.source !== win.parent || !trustedParent(event.origin, win.location.origin) ||
      (this.parentOrigin && event.origin !== this.parentOrigin)) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.og !== 1) return;
    for (const listener of this.parentListeners) { try { listener(data); } catch { /* isolate the adapter */ } }
    if (data.type === 'session-pending') {
      // Only a trusted parent can extend initialization, and only once. Repeated
      // notices cannot leave a game waiting forever during an auth outage. Before
      // `init`, the early handshake from `connect` is the one being extended.
      if ((this.settle || !this.initialization) && !this.extendedHandshake) {
        this.extendedHandshake = true;
        this.parentOrigin = event.origin;
        // The parent pushes the session when it is verified. Probing on would spend
        // the parent's ready budget that the playable signal still needs.
        clearInterval(this.initRetry);
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = setTimeout(() => this.finish(), __SDK_CONFIG__.sessionPendingTimeoutMs);
      }
    } else if (data.type === 'session-request') {
      this.send({ type: 'ready', phase: 'init', sdk: __SDK_CONFIG__.version, isolated: win.crossOriginIsolated === true });
    } else if (data.type === 'ready-ack' && data.phase === 'playable') {
      clearInterval(this.readyRetry); clearTimeout(this.readyDeadline);
    } else if (data.type === 'session') {
      if (!(typeof data.token === 'string' || data.token === null)) return;
      const preview = this.environment.preview || data.preview === true;
      const capabilities: Capability[] = Array.isArray(data.capabilities)
        ? [...new Set<Capability>(data.capabilities.filter((c: Capability) => capabilityNames.has(c)))]
        : ['leaderboards', 'analytics'];
      let available = capabilities.filter(c => !(preview && (c === 'identity' || c === 'avatar')));
      const player = readPlayer(data.player, available.includes('avatar')) ?? emptyPlayer;
      if (!player.avatar) available = available.filter(c => c !== 'avatar');
      // A parent that names the player lets a rotated token pass silently. One
      // that does not leaves no way to tell a new account from a new credential.
      const account = player.id !== null
        ? JSON.stringify(['player', player.id, player.signedIn, data.token !== null, preview])
        : JSON.stringify(['token', data.token, preview]);
      // Capability removal first, so a pending request reports why it ended.
      if (!available.includes('external-links')) this.cancelLink?.('unavailable');
      if (this.localMode || account !== this.account) {
        this.cancelLink?.('session_changed');
        this.finishPlayWaiters({ ok: false, error: 'session_changed' });
        this.boards.cancel('session_changed');
      }
      const tokenChanged = this.sessionToken !== data.token;
      const accountChanged = this.account !== account;
      const analyticsChanged = available.includes('analytics') !== this.capabilities.includes('analytics');
      if (tokenChanged || accountChanged || preview !== this.env.preview || analyticsChanged) this.sessionGeneration++;
      // Credential rotation for a named player does not create a second first input.
      if (accountChanged) { this.attentionReported = false; this.inputReported = false; }
      this.account = account;
      this.sessionToken = data.token;
      if (!available.includes('analytics')) {
        this.events = this.events.filter(event => event.token !== null);
        this.startupOpen = false;
      } else if (data.token && this.startupOpen) {
        for (const event of this.events) if (event.token === null) event.token = data.token;
      }
      if (data.token) this.startupOpen = false;
      if (tokenChanged || accountChanged || analyticsChanged) this.health?.reset();
      this.localMode = false;
      this.held = data.held === true;
      if (!this.held) this.finishPlayWaiters({ ok: true, value: undefined });
      this.parentOrigin = event.origin;
      if (!available.includes('leaderboards')) this.boards.cancel('leaderboards_unavailable');
      this.environment = Object.freeze({ ...this.environment, connected: true, preview, capabilities: Object.freeze(available) });
      if (JSON.stringify(player) !== JSON.stringify(this.playerValue)) { this.playerValue = player; notify(this.playerListeners, player); }
      this.finish();
      this.reportReady();
    } else if (data.type === 'mute' && typeof data.muted === 'boolean' && this.muted !== data.muted) {
      this.muted = data.muted; notify(this.muteListeners, this.muted);
    } else if (data.type === 'activity' && typeof data.active === 'boolean') {
      this.hostPaused = !data.active; this.visibility();
    } else if (data.type === 'fullscreen' && typeof data.active === 'boolean' && this.full !== data.active) {
      this.full = data.active; notify(this.fullscreenListeners, this.full);
    } else if (data.type === 'play') { this.held = false; this.finishPlayWaiters({ ok: true, value: undefined }); this.hostPaused = false; this.visibility(); }
  };
  private reportReady = () => {
    if (this.readySent && !this.readyReported && (this.localMode || this.sessionToken) && this.capabilities.includes('analytics') && this.track('sdk_ready', { duration_ms: this.readyElapsed }).ok) this.readyReported = true;
    this.reportAttention();
    this.health?.resume();
  };
  private reportAttention = () => {
    if (!this.readySent || !this.sessionToken || this.paused || this.held || !this.capabilities.includes('analytics')) return false;
    if (!this.attentionReported && this.track('attention_coverage', { result: 'sdk_v1' }).ok) this.attentionReported = true;
    return this.attentionReported;
  };
  private firstInput = (event: Event) => {
    if (!event.isTrusted || this.disposed) return;
    if (this.reportAttention() && !this.inputReported && this.track('first_input', { duration_ms: Date.now() - this.bootedAt }).ok) this.inputReported = true;
  };
  private visibility = () => {
    const paused = this.hostPaused || this.win?.document.visibilityState === 'hidden';
    if (paused !== this.paused) { this.paused = paused; notify(this.pauseListeners, paused); }
    this.reportAttention();
    this.health?.resume();
  };
  /** Record a custom event after calling `init`. During startup, valid events wait
   * in a bounded queue for the first analytics session. Success means queued locally,
   * not stored by the server. Batches go to the events API with the game's session;
   * in the local mock, validated events are printed with `console.debug` at flush. */
  track(name: string, props: Record<string, unknown> = {}): Result {
    const startup = this.startupOpen && this.initialization && !this.sessionToken;
    // A session from the early handshake is not a grant to record: events start at init.
    if (this.disposed || !this.initialization || (!this.localMode && !startup && (!this.sessionToken || !this.capabilities.includes('analytics')))) return { ok: false, error: 'unavailable' };
    if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name) || name.length > __SDK_CONFIG__.eventNameMax) return { ok: false, error: 'invalid_event' };
    let clean = sanitizeGameEventProps(props, __SDK_CONFIG__.eventPolicy);
    if (name === 'attention_coverage') {
      if (clean.result !== 'sdk_v1') return { ok: false, error: 'invalid_event' };
      clean = { result: 'sdk_v1' };
    }
    // Do not bypass the shared sanitizer while its numeric policy is pending.
    if (name === 'runtime_performance' && (typeof clean.fps !== 'number' || typeof clean.sample_rate !== 'number')) return { ok: false, error: 'invalid_event' };
    if (new TextEncoder().encode(JSON.stringify({ name, props: clean })).byteLength > __SDK_CONFIG__.eventBytesMax) return { ok: false, error: 'invalid_event' };
    const now = Date.now();
    this.eventTimes = this.eventTimes.filter(time => time > now - __SDK_CONFIG__.rateWindowMs);
    if (this.eventTimes.length >= __SDK_CONFIG__.eventsPerMinute || this.eventsRecorded >= __SDK_CONFIG__.eventsMax) return { ok: false, error: 'rate_limited' };
    let id: string;
    try { id = eventId(); } catch { return { ok: false, error: 'unavailable' }; }
    const event = { name, props: clean, token: this.sessionToken, eventId: id, occurredAt: new Date(now).toISOString() };
    const { token: _token, ...wire } = event;
    if (new TextEncoder().encode(JSON.stringify({ events: [wire] })).byteLength > __SDK_CONFIG__.batchBytesMax) return { ok: false, error: 'invalid_event' };
    this.eventTimes.push(now); this.eventsRecorded++; this.events.push(event);
    if (!this.batchTimer) this.batchTimer = setInterval(this.flush, __SDK_CONFIG__.eventBatchMs);
    return { ok: true, value: undefined };
  }
  private flush = () => {
    if (!this.events.length || this.flushing) return;
    if (this.localMode) {
      const batch = this.events.splice(0);
      if (typeof globalThis.console?.debug === 'function') globalThis.console.debug('[opengame] events', batch);
      return;
    }
    const token = this.events[0]?.token;
    if (!token) return;
    const batch: Omit<QueuedEvent, 'token'>[] = [];
    for (const { token: owner, ...event } of this.events) {
      if (owner !== token || batch.length >= __SDK_CONFIG__.batchMax) break;
      if (new TextEncoder().encode(JSON.stringify({ events: [...batch, event] })).byteLength > __SDK_CONFIG__.batchBytesMax) break;
      batch.push(event);
    }
    if (!batch.length) return;
    const ids = new Set(batch.map(event => event.eventId));
    // Settlement can only remove captured IDs, never a new prefix after cleanup.
    const retire = (done: Set<string>) => {
      if (!this.disposed) this.events = this.events.filter(event => event.token !== token || !done.has(event.eventId));
    };
    this.flushing = true;
    void (async () => {
      try {
        const signal = AbortSignal.timeout(__SDK_CONFIG__.eventTimeoutMs);
        const response = await fetch(new URL('/v1/events', __SDK_CONFIG__.eventsApiOrigin), {
          method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', keepalive: true,
          signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }),
        });
        if (!response.ok) {
          if ([400, 401, 403, 404, 410, 413, 422].includes(response.status)) retire(ids);
          discard(response); return;
        }
        // 202/queued is not a durable receipt. Retrying requires the canonical
        // stable-ID API; rollout remains held until that sink is integrated.
        if (response.status === 202) { discard(response); return; }
        const result = await readJson(response, __SDK_CONFIG__.batchBytesMax, signal) as Record<string, unknown>;
        if (!result || typeof result !== 'object' || Array.isArray(result) || result.queued === true) return;
        // These types describe the wire fields; every value is checked below.
        // Defaults apply only to absent counts, never null or other JSON values.
        const { accepted, refused = 0, limited = 0, acceptedIds } = result as {
          accepted: number; refused?: number; limited?: number; acceptedIds?: unknown;
        };
        if (![accepted, refused, limited].every(count => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= batch.length) ||
          accepted + refused + limited > batch.length) return;
        if (refused > 0 && result.limited === undefined) return;
        if (acceptedIds !== undefined && (!Array.isArray(acceptedIds) || acceptedIds.length !== accepted ||
          new Set(acceptedIds).size !== acceptedIds.length || !acceptedIds.every(id => typeof id === 'string' && ids.has(id)))) return;
        const complete = accepted + refused === batch.length && limited === 0;
        if (complete || acceptedIds !== undefined) retire(complete ? ids : new Set(acceptedIds as string[]));
        // Counts alone cannot identify a partially accepted or filtered batch.
        // A session transition never rebinds these IDs or their captured token.
      } catch { /* The interval retries the same bounded IDs after an ambiguous failure. */ }
      finally { this.flushing = false; }
    })();
  };
  dispose(): void {
    if (this.disposed) return;
    this.cancelLink?.('disposed');
    this.finishPlayWaiters({ ok: false, error: 'disposed' });
    this.flush(); this.events = []; this.disposed = true; this.sessionGeneration++; this.sessionToken = null; this.boards.cancel("disposed"); this.finish(); clearInterval(this.batchTimer); clearInterval(this.readyRetry); clearTimeout(this.readyDeadline);
    this.win?.removeEventListener('message', this.receive);
    this.win?.removeEventListener('pagehide', this.flush);
    this.win?.removeEventListener('pointerdown', this.firstInput, true);
    this.win?.removeEventListener('keydown', this.firstInput, true);
    this.health?.stop();
    this.win?.document.removeEventListener('visibilitychange', this.visibility);
    this.playerListeners.clear(); this.muteListeners.clear(); this.pauseListeners.clear(); this.fullscreenListeners.clear(); this.parentListeners.clear();
  }
}
export type OpenGameClient = Client;
const existing = installed<{ OpenGameClient: typeof Client; og: Client }>('core');
const core = existing && Object.hasOwn(existing, 'og') && Object.hasOwn(existing, 'OpenGameClient')
  && typeof existing.OpenGameClient === 'function' && existing.og instanceof existing.OpenGameClient
  ? existing : install('core', { OpenGameClient: Client, og: new Client() }, true);
export const { OpenGameClient, og } = core;

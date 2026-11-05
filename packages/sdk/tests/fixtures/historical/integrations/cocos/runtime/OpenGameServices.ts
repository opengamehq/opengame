import type { Achievement, AchievementUnlock, Environment, InitOptions, LeaderboardPage, OpenGameGlobal, OutgoingData, PhaseOptions, Player, Properties, Result, RoomEvents, RoomOptions, ScoreEntry, ScoreMeta, ScoreReceipt, SDKRoom, SendResult } from './types';

const failed = (error: string): Result<never> => ({ ok: false, error });
const success = <T>(value: T): Result<T> => ({ ok: true, value });
export type ServiceState = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'disposed';
  environment: Environment | null; player: Player | null; paused: boolean; muted: boolean; fullscreen: boolean;
}>;

/** Owns only its listeners and rooms. The SDK's singleton outlives scene changes. */
export class OpenGameServices {
  private sdk: OpenGameGlobal | null = null;
  private initialization: Promise<Result<Environment>> | null = null;
  private disposed = false;
  private roomGeneration = 0;
  private readonly pending = new Set<AbortController>();
  private readonly rooms = new Set<OpenGameRoom>();
  private readonly subscriptions: (() => void)[] = [];
  private readonly observers = new Set<(state: ServiceState) => void>();
  private value: ServiceState = { status: 'idle', environment: null, player: null, paused: false, muted: false, fullscreen: false };
  get state(): ServiceState { return Object.freeze({ ...this.value, environment: this.sdk?.env ?? null }); }
  /** The SDK has no environment event; the bootstrap calls this each frame. */
  refreshEnvironment(): void {
    if (this.disposed || !this.sdk || this.sdk.env === this.value.environment) return;
    this.update({ environment: this.sdk.env });
  }
  observe(listener: (state: ServiceState) => void): () => void {
    if (this.disposed) return () => {};
    this.observers.add(listener);
    this.notify(listener);
    return () => { this.observers.delete(listener); };
  }
  private notify(listener: (state: ServiceState) => void): void {
    try { void Promise.resolve(listener(this.state)).catch(() => {}); } catch { /* Keep engine listeners isolated. */ }
  }
  private update(change: Partial<ServiceState>): void {
    this.value = Object.freeze({ ...this.value, ...change });
    for (const listener of this.observers) this.notify(listener);
  }
  failure(error: unknown): Result<never> {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    const entry = this.sdk?.errorCatalogue.find(item => item.code === code);
    if (entry) return { ok: false, error: entry.code, reason: entry.hint, retryable: entry.retryable };
    if (code === 'disposed' || code === 'unavailable' || code === 'cancelled' || code === 'closed') return failed(code);
    return failed(this.disposed ? 'disposed' : 'invalid_request');
  }
  private requireSDK(): OpenGameGlobal {
    if (this.disposed) throw { code: 'disposed' };
    if (!this.sdk) throw { code: 'unavailable' };
    return this.sdk;
  }
  init(options?: InitOptions): Promise<Result<Environment>> {
    if (this.disposed) return Promise.resolve(failed('disposed'));
    if (this.initialization) return this.initialization;
    const sdk = (globalThis as typeof globalThis & { OpenGame?: OpenGameGlobal }).OpenGame;
    if (!sdk?.init || !sdk.multiplayer) {
      this.update({ status: 'unavailable' });
      return Promise.resolve(failed('unavailable'));
    }
    this.sdk = sdk;
    let settle!: (result: Result<Environment>) => void;
    this.initialization = new Promise(resolve => { settle = resolve; });
    this.update({ status: 'loading' });
    const attach = (register: () => () => void): void => {
      if (this.disposed) return;
      const off = register();
      if (this.disposed) off(); else this.subscriptions.push(off);
    };
    void this.call<Environment>(() => {
      attach(() => sdk.player.onChange(player => this.update({ player })));
      attach(() => sdk.onPause(paused => this.update({ paused })));
      attach(() => sdk.audio.onHostMute(muted => this.update({ muted })));
      attach(() => sdk.fullscreen.onChange(fullscreen => this.update({ fullscreen })));
      if (this.disposed) return failed('disposed');
      return sdk.init(options).then(environment => {
        if (this.disposed) return failed('disposed');
        this.update({ status: 'ready', environment: sdk.env });
        return success(environment);
      });
    }).then(result => {
      if (!result.ok && !this.disposed) {
        for (const off of this.subscriptions.splice(0)) off();
        this.update({ status: 'unavailable' });
      }
      settle(result);
    });
    return this.initialization;
  }
  private call<T>(action: () => Result<T> | Promise<Result<T>>): Promise<Result<T>> {
    // Invoke on this stack to preserve activation for links/fullscreen/sign-in.
    if (this.disposed) return Promise.resolve(failed('disposed'));
    try {
      return Promise.resolve(action()).then(result => this.disposed ? failed('disposed') : result, error => this.failure(error));
    } catch (error) { return Promise.resolve(this.failure(error)); }
  }
  ready(): Result {
    if (this.disposed) return failed('disposed');
    if (this.state.status !== 'ready') return failed('unavailable');
    this.requireSDK().ready();
    return success(undefined);
  }
  track(name: string, props?: Properties): Promise<Result> { return this.call(() => this.requireSDK().track(name, props)); }
  signIn(): Promise<Result> { return this.call(() => this.requireSDK().player.requestSignIn()); }
  fullscreen(): Promise<Result> { return this.call(() => this.requireSDK().fullscreen.request()); }
  openLink(url: string): Promise<Result> { return this.call(() => this.requireSDK().openLink(url)); }
  submit(key: string, score: number, meta?: ScoreMeta): Promise<Result<ScoreReceipt>> { return this.call(() => this.requireSDK().leaderboard(key).submit(score, meta)); }
  top(key: string, limit?: number): Promise<Result<LeaderboardPage>> { return this.call(() => this.requireSDK().leaderboard(key).top(limit === undefined ? undefined : { limit })); }
  me(key: string): Promise<Result<ScoreEntry | null>> { return this.call(() => this.requireSDK().leaderboard(key).me()); }
  around(key: string): Promise<Result<LeaderboardPage>> { return this.call(() => this.requireSDK().leaderboard(key).around()); }
  // Ids are declared in opengame.json. An unlock is the game's claim, labelled game_reported.
  unlockAchievement(id: string): Promise<Result<AchievementUnlock>> { return this.call(() => this.requireSDK().achievements.unlock(id)); }
  achievements(): Promise<Result<Achievement[]>> { return this.call(() => this.requireSDK().achievements.list()); }
  host(options: RoomOptions & { maxPlayers?: number } = {}): Promise<Result<OpenGameRoom | null>> { return this.connect('host', undefined, options); }
  join(code: string, options: RoomOptions = {}): Promise<Result<OpenGameRoom | null>> { return this.connect('join', code, options); }
  joinInvite(options: RoomOptions = {}): Promise<Result<OpenGameRoom | null>> { return this.connect('joinInvite', undefined, options); }
  private connect(kind: 'host' | 'join' | 'joinInvite', code: string | undefined, options: RoomOptions & { maxPlayers?: number }): Promise<Result<OpenGameRoom | null>> {
    return this.call(async () => {
      const sdk = this.requireSDK();
      const controller = new AbortController();
      const generation = this.roomGeneration;
      const signal = options.signal;
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      this.pending.add(controller);
      try {
        if (controller.signal.aborted) return failed('cancelled');
        const args = { ...options, signal: controller.signal };
        const raw = await (kind === 'host' ? sdk.multiplayer.host(args)
          : kind === 'join' ? sdk.multiplayer.join(code!, args) : sdk.multiplayer.joinInvite(args));
        if (this.disposed || controller.signal.aborted || generation !== this.roomGeneration) { raw?.close(); return failed('cancelled'); }
        if (!raw) return success(null);
        if (raw.isClosed) return failed('closed');
        const room = new OpenGameRoom(raw, this, () => this.rooms.delete(room));
        this.rooms.add(room);
        return success(room);
      } finally {
        signal?.removeEventListener('abort', cancel);
        this.pending.delete(controller);
      }
    });
  }
  closeAllRooms(): void {
    this.roomGeneration++;
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
    for (const room of [...this.rooms]) room.close();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closeAllRooms();
    for (const off of this.subscriptions.splice(0)) off();
    this.update({ status: 'disposed' });
    this.observers.clear();
    // Do not call OpenGame.dispose(): other scenes may share this singleton.
  }
}

/** A scene-owned facade; all packets and validation remain in the SDK room. */
export class OpenGameRoom {
  private readonly subscriptions = new Set<() => void>();
  private cleaned = false;
  constructor(private readonly raw: SDKRoom, private readonly owner: OpenGameServices, private readonly release: () => void) {
    this.subscriptions.add(raw.on('close', () => this.cleanup()));
  }
  get code() { return this.raw.code; }
  get role() { return this.raw.role; }
  get local() { return this.raw.local; }
  get inviteUrl() { return this.raw.inviteUrl; }
  get maxPlayers() { return this.raw.maxPlayers; }
  get maxPacketBytes() { return this.raw.maxPacketBytes; }
  get self() { return this.raw.self; }
  get peers() { return this.raw.peers; }
  get phaseState() { return this.raw.phaseState; }
  get readyState() { return this.raw.readyState; }
  get isClosed() { return this.raw.isClosed; }
  on<K extends keyof RoomEvents>(name: K, listener: (...args: RoomEvents[K]) => void): () => void {
    if (this.cleaned) return () => {};
    // The SDK replays joins/readiness synchronously. A listener may close this
    // facade before raw.on returns, so dispose the returned listener in that case.
    const off = this.raw.on(name, (...args: RoomEvents[K]) => {
      try { void Promise.resolve(listener(...args)).catch(() => {}); } catch { /* A game listener cannot interrupt room cleanup. */ }
    });
    if (this.cleaned) { off(); return () => {}; }
    this.subscriptions.add(off);
    return () => { off(); this.subscriptions.delete(off); };
  }
  private action<T>(callback: () => T): Result<T> {
    if (this.cleaned) return failed('closed');
    try { return success(callback()); } catch (error) { return this.owner.failure(error); }
  }
  ready(value = true): Result { return this.action(() => this.raw.ready(value)); }
  phase(name: string | null, options?: PhaseOptions) { return this.action(() => this.raw.phase(name, options)); }
  now(): number { return this.raw.now(); }
  stats(peer?: string) { return peer === undefined ? this.raw.stats() : this.raw.stats(peer); }
  send(data: OutgoingData, reliable = true): Result<SendResult> { return this.action(() => this.raw.send(data, { reliable })); }
  sendTo(peer: string, data: OutgoingData, reliable = true): Result<SendResult> {
    if (typeof peer !== 'string' || !peer) return failed('invalid_peer');
    return this.action(() => this.raw.send(data, { peer, reliable }));
  }
  disconnectPeer(peer: string): Result { return this.action(() => this.raw.disconnectPeer(peer)); }
  close(): void {
    if (this.cleaned) return;
    try { this.raw.close(); } finally { this.cleanup(); }
  }
  private cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.release();
    // Close listeners must all receive the final reason before their removal.
    // SDK dispatch is synchronous; defer only listener removal, never transport close.
    void Promise.resolve().then(() => {
      for (const off of this.subscriptions) off();
      this.subscriptions.clear();
    });
  }
}

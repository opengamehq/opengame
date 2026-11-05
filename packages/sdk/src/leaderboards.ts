import { classifyGameScore, validateScoreMeta } from '@opengame/shared/game-scores';
import type { Result } from './index.js';
import { discard, readJson } from './response.js';

import type { ScoreMeta } from './score-meta.js';
export type { ScoreMeta } from './score-meta.js';
export type ScoreEntry = Readonly<{ name: string | null; score: number; meta: ScoreMeta; createdAt: string; rank: number; isMe: boolean }>;
export type ScoreReceipt = Readonly<{ score: number; state: 'ok' | 'clamped' | 'rejected'; best: boolean; preview: boolean }>;
export type LeaderboardPage = Readonly<{ entries: readonly ScoreEntry[]; order: 'asc' | 'desc'; preview: boolean; source: 'game_reported' }>;
/** A board declared in `opengame.json`. Hosted requests use the current game session;
 * the local mock stores scores in this browser. Preview scores stay in that preview. */
export interface Leaderboard {
  /** Submit a finite score and optional metadata. The receipt reports whether the
   * value was accepted, clamped or rejected; only accepted scores appear on the board. */
  submit(value: number, meta?: ScoreMeta): Promise<Result<ScoreReceipt>>;
  /** Read the highest-ranked entries in the board's configured sort order. */
  top(options?: { limit?: number }): Promise<Result<LeaderboardPage>>;
  /** Read this player's accepted entry, or null if there is none. */
  me(): Promise<Result<ScoreEntry | null>>;
  /** Read entries around this player's rank. */
  around(): Promise<Result<LeaderboardPage>>;
}
type Board = { key: string; order: 'asc' | 'desc'; min?: number; max?: number };
type View = 'top' | 'me' | 'around';
type StoredScore = { entry: ScoreEntry; state: ScoreReceipt['state'] };
export interface LeaderboardConfig {
  apiOrigin: string; timeoutMs: number; responseBytesMax: number; manifestBytesMax: number;
  keyCharsMax: number; boardCountMax: number; readMax: number; readDefault: number; radius: number;
  clampTolerance: number; metaPolicy: { keys: Readonly<Record<string, string>>; maxStringLength: number; maxBytes: number; digitRunMin: number };
}
export interface LeaderboardContext {
  win: Window | undefined; local: boolean; enabled: boolean; token: string | null; preview: boolean; disposed: boolean;
}
/** Read where used rather than passed in, so build.mjs can fold each scalar bound
 * into its call site. As a constructor field the policy shipped as an object and
 * every read paid for `this.config`, about 130 bytes gzip of the core's budget. */
declare const __SDK_CONFIG__: { leaderboards: LeaderboardConfig };
const fail = (error: string, reason: string): Result<never> => ({ ok: false, error, reason });
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The local adapter follows the same result and validation contracts as the
 * hosted service. It never substitutes local scores after a hosted request fails. */
export class Leaderboards {
  private generation = 0;
  private cancellation = 'session_changed';
  private suppliedManifest: unknown;
  private rawManifest: Promise<Result<unknown>> | null = null;
  private manifest: Promise<Result<Board[]>> | null = null;
  private readonly requests = new Set<AbortController>();
  constructor(private readonly context: () => LeaderboardContext,
    private readonly initialize: () => Promise<unknown>) {}
  isHostedOrigin(hostname = this.context().win?.location.hostname): boolean {
    const suffix = new URL(__SDK_CONFIG__.leaderboards.apiOrigin).hostname.replace(/^api\./, '');
    return hostname === suffix || Boolean(hostname?.endsWith(`.${suffix}`));
  }
  configure(manifest: unknown) { this.suppliedManifest = manifest; }
  cancel(reason: string) { this.generation++; this.cancellation = reason; for (const request of this.requests) request.abort(reason); }
  board(key: string): Leaderboard {
    return Object.freeze({
      submit: (value: number, meta?: ScoreMeta) => this.submit(key, value, meta),
      top: (options?: { limit?: number }) => this.read(key, 'top', options?.limit),
      me: async () => { const page = await this.read(key, 'me'); return page.ok ? { ok: true as const, value: page.value.entries[0] ?? null } : page; },
      around: () => this.read(key, 'around'),
    });
  }
  private validKey(key: string) { return typeof key === 'string' && key.length <= __SDK_CONFIG__.leaderboards.keyCharsMax && /^[a-z0-9][a-z0-9_-]*$/.test(key); }
  private async state(key: string): Promise<Result<LeaderboardContext & { generation: number }>> {
    if (!this.validKey(key)) return fail('invalid_board', 'Use a board key declared in opengame.json.');
    await this.initialize();
    const state = this.context();
    if (state.disposed || !state.win || !state.enabled) return fail('unavailable', state.disposed ? 'disposed' : 'leaderboards_unavailable');
    if (!state.local && !state.token) return fail('unavailable', 'session_unavailable');
    return { ok: true, value: { ...state, generation: this.generation } };
  }
  private host(state: LeaderboardContext): string | null {
    const suffix = new URL(__SDK_CONFIG__.leaderboards.apiOrigin).hostname.replace(/^api\./, '');
    const hostname = state.win!.location.hostname;
    if (!hostname.endsWith(`.${suffix}`)) return null;
    const label = hostname.slice(0, -(suffix.length + 1));
    return /^[a-z0-9][a-z0-9-]*$/.test(label) ? label : null;
  }
  private async json(url: URL, init: RequestInit, bytesMax: number, generation = this.generation): Promise<Result<unknown>> {
    if (generation !== this.generation || this.context().disposed) return fail("unavailable", this.cancellation);
    const controller = new AbortController(); this.requests.add(controller);
    const timer = setTimeout(() => controller.abort('timeout'), __SDK_CONFIG__.leaderboards.timeoutMs);
    try {
      const response = await fetch(url, { ...init, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (controller.signal.aborted) throw new Error('cancelled');
      if (!response.ok) {
        discard(response);
        // Stable codes are useful to agents and games; never copy an untrusted
        // HTML error page or a server's diagnostic payload into the game UI.
        if (response.status === 404) return fail('board_unavailable', 'board_not_found');
        if (response.status === 401 || response.status === 403) return fail('unavailable', 'session_rejected');
        if (response.status === 429) return fail('rate_limited', 'Try again after the rate-limit window.');
        return fail(response.status >= 500 ? 'unavailable' : 'invalid_request', `http_${response.status}`);
      }
      if (Number(response.headers.get('content-length')) > bytesMax || !response.body) {
        discard(response);
        return fail('unavailable', 'invalid_response');
      }
      return { ok: true, value: await readJson(response, bytesMax, controller.signal) };
    } catch (error) {
      return fail('unavailable', controller.signal.aborted ? String(controller.signal.reason)
        : (error as Error | undefined)?.message === 'response_too_large' ? 'response_too_large' : 'network_or_invalid_response');
    } finally { clearTimeout(timer); this.requests.delete(controller); }
  }
  /** The raw local manifest, read once. */
  manifestInput(): Promise<Result<unknown>> {
    if (this.rawManifest) return this.rawManifest;
    this.rawManifest = (async (): Promise<Result<unknown>> => {
      if (this.suppliedManifest !== undefined) return { ok: true, value: this.suppliedManifest };
      const win = this.context().win;
      if (!win) return fail('unavailable', 'local_manifest_unavailable');
      const result = await this.json(new URL('./opengame.json', win.location.href), { cache: 'no-store' }, __SDK_CONFIG__.leaderboards.manifestBytesMax);
      return result.ok ? result : fail('unavailable', 'local_manifest_unavailable');
    })();
    void this.rawManifest.then(result => { if (!result.ok) this.rawManifest = null; });
    return this.rawManifest;
  }
  private async definitions(): Promise<Result<Board[]>> {
    if (this.manifest) return this.manifest;
    this.manifest = (async () => {
      const raw = await this.manifestInput();
      if (!raw.ok) return raw;
      const input = raw.value;
      if (!object(input) || (input.leaderboards !== undefined && !Array.isArray(input.leaderboards))) return fail('invalid_manifest', 'Invalid leaderboard declarations.');
      const rows = (input.leaderboards ?? []) as unknown[];
      if (rows.length > __SDK_CONFIG__.leaderboards.boardCountMax) return fail('invalid_manifest', 'Too many leaderboard declarations.');
      const boards: Board[] = [];
      for (const row of rows) {
        if (!object(row) || typeof row.key !== 'string' || !this.validKey(row.key) || (row.order !== 'asc' && row.order !== 'desc') ||
          (row.min !== undefined && !finite(row.min)) || (row.max !== undefined && !finite(row.max)) ||
          (finite(row.min) && finite(row.max) && row.min > row.max) || boards.some(board => board.key === row.key)) {
          return fail('invalid_manifest', 'Invalid leaderboard declarations.');
        }
        boards.push({ key: row.key, order: row.order, ...(finite(row.min) ? { min: row.min } : {}), ...(finite(row.max) ? { max: row.max } : {}) });
      }
      return { ok: true as const, value: boards };
    })();
    const result = await this.manifest;
    if (!result.ok) this.manifest = null;
    return result;
  }
  private async localBoard(key: string): Promise<Result<Board>> {
    const definitions = await this.definitions();
    if (!definitions.ok) return definitions;
    const board = definitions.value.find(item => item.key === key);
    return board ? { ok: true, value: board } : fail('board_unavailable', 'Declare this board in opengame.json.');
  }
  private storageKey(key: string) { return `og:dev:leaderboard:v1:${new URL('./opengame.json', this.context().win!.location.href).pathname}:${key}`; }
  private stored(board: Board): StoredScore | null {
    const raw = this.context().win!.localStorage.getItem(this.storageKey(board.key));
    if (!raw) return null;
    if (raw.length > __SDK_CONFIG__.leaderboards.responseBytesMax) throw new Error('invalid local score');
    const data: unknown = JSON.parse(raw);
    if (!object(data) || typeof data.definition !== 'string') throw new Error('invalid local score');
    if (data.definition !== JSON.stringify(board)) return null;
    if (!object(data.entry) || (data.state !== 'ok' && data.state !== 'clamped' && data.state !== 'rejected')) throw new Error('invalid local score');
    const entry = this.entry(data.entry, true);
    if (!entry) throw new Error('invalid local score');
    return { entry, state: data.state };
  }
  private entry(row: unknown, local = false): ScoreEntry | null {
    if (!object(row) || !finite(row.score) || !Number.isSafeInteger(row.rank) || Number(row.rank)<1 ||
      !(row.player_name === null || typeof row.player_name === 'string') || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) return null;
    const meta = validateScoreMeta(row.meta, __SDK_CONFIG__.leaderboards.metaPolicy);
    if (!meta.ok) return null;
    return Object.freeze({ name: row.player_name, score: row.score, meta: meta.meta, createdAt: row.created_at,
      rank: Number(row.rank), isMe: local || row.is_me === true });
  }
  private async read(key: string, view: View, requested?: number): Promise<Result<LeaderboardPage>> {
    if (requested !== undefined && (!Number.isSafeInteger(requested) || requested<1)) return fail('invalid_limit', 'Use a positive integer limit.');
    const limit = Math.min(requested ?? __SDK_CONFIG__.leaderboards.readDefault, __SDK_CONFIG__.leaderboards.readMax);
    const checked = await this.state(key); if (!checked.ok) return checked;
    const state = checked.value;
    if (state.generation !== this.generation || this.context().disposed) return fail("unavailable", this.cancellation);
    if (state.local) {
      const board = await this.localBoard(key); if (!board.ok) return board;
      if (this.context().disposed || !this.context().local) return fail('unavailable', 'session_changed');
      try {
        const stored = this.stored(board.value);
        const entry = stored?.state === "ok" ? stored.entry : null;
        return { ok: true, value: { entries: entry ? [entry] : [], order: board.value.order, preview: false, source: 'game_reported' } };
      } catch { return fail('unavailable', 'local_storage_unavailable'); }
    }
    const host = this.host(state); if (!host) return fail('unavailable', 'unsupported_game_origin');
    const url = new URL('/v1/scores', __SDK_CONFIG__.leaderboards.apiOrigin);
    // A preview's host label is its capability, and a query string is logged in places a
    // header is not. The API already knows the label from this frame's Origin, so a
    // preview read leaves it out; a published game's label is public and stays.
    url.search = new URLSearchParams(state.preview ? { board: key, view, limit: String(limit) }
      : { board: key, host, view, limit: String(limit) }).toString();
    const result = await this.json(url, { headers: { Authorization: `Bearer ${state.token}` }, cache: view === 'top' ? 'default' : 'no-store' }, __SDK_CONFIG__.leaderboards.responseBytesMax, state.generation);
    if (!result.ok) return result;
    if (this.context().disposed || state.generation !== this.generation || !this.context().enabled) return fail('unavailable', 'session_changed');
    const data = result.value, max = view === 'top' ? limit : view === 'me' ? 1 : 2*__SDK_CONFIG__.leaderboards.radius+1;
    if (!object(data) || data.board !== key || data.source !== 'game_reported' || (data.direction !== 'asc' && data.direction !== 'desc') ||
      Boolean(data.preview) !== state.preview || !Array.isArray(data.entries) || data.entries.length > max) return fail('unavailable', 'invalid_response');
    const entries: ScoreEntry[] = [];
    for (const row of data.entries) { const entry = this.entry(row); if (!entry) return fail('unavailable', 'invalid_response'); entries.push(entry); }
    if (view !== 'top' && entries.length && entries.filter(entry => entry.isMe).length !== 1) return fail('unavailable', 'invalid_response');
    return { ok: true, value: { entries, order: data.direction, preview: state.preview, source: 'game_reported' } };
  }
  private async submit(key: string, value: number, rawMeta?: ScoreMeta): Promise<Result<ScoreReceipt>> {
    if (!finite(value)) return fail('invalid_score', 'Use a finite number.');
    const meta = validateScoreMeta(rawMeta, __SDK_CONFIG__.leaderboards.metaPolicy);
    if (!meta.ok) return fail('invalid_meta', meta.reason);
    const checked = await this.state(key); if (!checked.ok) return checked;
    const state = checked.value;
    if (state.generation !== this.generation || this.context().disposed) return fail("unavailable", this.cancellation);
    if (state.local) {
      const board = await this.localBoard(key); if (!board.ok) return board;
      const persist = (): Result<ScoreReceipt> => {
        if (this.context().disposed || !this.context().local) return fail('unavailable', 'session_changed');
        const result = classifyGameScore(value, { plausible_min: board.value.min ?? null, plausible_max: board.value.max ?? null }, __SDK_CONFIG__.leaderboards.clampTolerance);
        const current = this.stored(board.value);
        const better = current && (board.value.order === 'asc' ? result.stored<current.entry.score : result.stored>current.entry.score);
        const best = !current || (result.state !== 'rejected' && (current.state === 'rejected' ||
          (result.state === 'ok' && current.state !== 'ok') || (result.state === current.state && Boolean(better))));
        if (best) this.context().win!.localStorage.setItem(this.storageKey(key), JSON.stringify({ definition: JSON.stringify(board.value), state: result.state,
          entry: { player_name: 'dev', score: result.stored, meta: meta.meta, created_at: new Date().toISOString(), rank: 1 } }));
        return { ok: true, value: { state: result.state, score: result.stored, best, preview: false } };
      };
      try {
        const locks = state.win!.navigator?.locks;
        if (!locks) return persist();
        const controller = new AbortController(); this.requests.add(controller);
        const timer = setTimeout(() => controller.abort('timeout'), __SDK_CONFIG__.leaderboards.timeoutMs);
        try { return await locks.request(this.storageKey(key), { signal: controller.signal }, persist); }
        finally { clearTimeout(timer); this.requests.delete(controller); }
      } catch { return fail('unavailable', 'local_storage_unavailable'); }
    }
    if (!this.host(state)) return fail('unavailable', 'unsupported_game_origin');
    const result = await this.json(new URL('/v1/scores', __SDK_CONFIG__.leaderboards.apiOrigin), { method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: key, value, meta: meta.meta }) }, __SDK_CONFIG__.leaderboards.responseBytesMax, state.generation);
    if (!result.ok) return result;
    if (this.context().disposed || state.generation !== this.generation || !this.context().enabled) return fail('unavailable', 'session_changed');
    const data = result.value;
    if (!object(data) || data.ok !== true || !finite(data.stored) || typeof data.best !== 'boolean' ||
      (data.state !== 'ok' && data.state !== 'clamped' && data.state !== 'rejected') || Boolean(data.preview) !== state.preview) return fail('unavailable', 'invalid_response');
    return { ok: true, value: { score: data.stored, state: data.state, best: data.best, preview: state.preview } };
  }
}

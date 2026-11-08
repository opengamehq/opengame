import { classifyGameScore, isReservedScoreLabel, validateScoreMeta } from '@opengame/shared/game-scores';
import { BOARD_FORMATS, crossCheckBoards, filterParam, parseBoardShape, resolveSort, validateRunStats, validateRunTags, worse } from '@opengame/shared/game-boards';
import type { Result } from './index.js';
import { discard, readJson } from './response.js';

import type { ScoreMeta } from './score-meta.js';
export type { ScoreMeta } from './score-meta.js';
/** `imported` is true for a score brought over from the game's own leaderboard from
 * before it was on OpenGame. No player posted it here, so show it apart from live scores.
 * It is false from an older API. `stats` holds the run's numbers for the board's columns
 * and `tags` its variants, such as `{ mode: 'coop' }`; both are empty from an older API
 * and on a run that sent none. Like the score, every stat is the game's claim. */
export type ScoreEntry = Readonly<{ name: string | null; score: number; stats: Readonly<Record<string, number>>; tags: Readonly<Record<string, string>>;
  meta: ScoreMeta; createdAt: string; rank: number; isMe: boolean; imported: boolean }>;
/** `ignored` names what the board dropped, such as `stats.headshots` for a stat it does not
 * declare. The run still counts; the stat is not stored. */
export type ScoreReceipt = Readonly<{ score: number; state: 'ok' | 'clamped' | 'rejected'; best: boolean; preview: boolean; ignored: readonly string[] }>;
/** How a value reads: `duration_ms` and `duration_s` as a time, `percent` as 0 to 100. */
export type LeaderboardFormat = 'number' | 'integer' | 'duration_ms' | 'duration_s' | 'percent' | 'distance_m';
/** A stat beside the score. `order` is the direction that ranks first when the board is
 * sorted by it, and only a `sortable` column can be. On a career board each column also says
 * how it aggregates the source board's runs: `agg` with `of` (`score` or a source column, or
 * null for a count of every run) and `where`, or a `ratio` of two earlier columns `of:
 * [numerator, denominator]` times `scale`, shown once `requires` is met. */
export type LeaderboardColumn = Readonly<{ key: string; label: string; format: LeaderboardFormat; order: 'asc' | 'desc'; sortable: boolean;
  /** The fixed decimals every value in the column is drawn with, when the board declares them. */
  decimals?: number;
  agg?: 'count' | 'sum' | 'max' | 'min' | 'avg' | 'ratio'; of?: string | readonly string[] | null;
  where?: Readonly<{ of: string; op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte'; value: number }> | null; scale?: number;
  requires?: Readonly<{ column: string; atLeast: number }> | null }>;
export type LeaderboardVariant = Readonly<{ key: string; label: string; values: readonly Readonly<{ key: string; label: string }>[] }>;
/** What the board declares, for drawing it. `keep` is `best` when a player appears once,
 * by their best run, `runs` when every kept run is a row, and `career` when each row adds up
 * a player's accepted runs on the board named `from`, the score by `scoreAgg`. A career board
 * is read like any other and never submitted to. */
export type LeaderboardShape = Readonly<{ label: string | null; scoreLabel: string | null; format: LeaderboardFormat; keep: 'best' | 'runs' | 'career';
  from?: string; scoreAgg?: 'sum' | 'count' | 'max' | 'min';
  columns: readonly LeaderboardColumn[]; variants: readonly LeaderboardVariant[] }>;
/** `total` is how many rows the board holds under this filter, or null from an older API.
 * `sort` is `score` or the column the page is ranked by, and `filter` the tags it is
 * narrowed to (empty is every run). `shape` is null from an older API. */
export type LeaderboardPage = Readonly<{ entries: readonly ScoreEntry[]; order: 'asc' | 'desc'; preview: boolean; source: 'game_reported';
  total: number | null; offset: number; sort: string; filter: Readonly<Record<string, string>>; shape: LeaderboardShape | null }>;
/** A finished run: the score, and optionally a number for each of the board's columns and
 * a value for each of its variants. */
export type LeaderboardRun = { value: number; stats?: Record<string, number>; tags?: Record<string, string>; meta?: ScoreMeta };
/** `sort` is `score` (the default) or a sortable column's key; `filter` names a value for
 * any of the board's variants, such as `{ mode: 'solo' }`. */
export type LeaderboardQuery = { sort?: string; filter?: Record<string, string> };
/** A board declared in `opengame.json`. Hosted requests use the current game session;
 * the local mock stores scores in this browser. Preview scores stay in that preview. */
export interface Leaderboard {
  /** Submit a finite score and optional metadata. The receipt reports whether the
   * value was accepted, clamped or rejected; only accepted scores appear on the board. */
  submit(value: number, meta?: ScoreMeta): Promise<Result<ScoreReceipt>>;
  /** Submit a run with its stats and tags. A stat outside its column's bounds is judged as
   * the score is, and the run takes the worse state of the two. */
  submitRun(run: LeaderboardRun): Promise<Result<ScoreReceipt>>;
  /** Read the highest-ranked entries, in the board's order or the sorted column's. `offset`
   * skips that many rows, for a second page. */
  top(options?: LeaderboardQuery & { limit?: number; offset?: number }): Promise<Result<LeaderboardPage>>;
  /** Read this player's accepted entry, or null if there is none. */
  me(options?: LeaderboardQuery): Promise<Result<ScoreEntry | null>>;
  /** Read entries around this player's rank. */
  around(options?: LeaderboardQuery): Promise<Result<LeaderboardPage>>;
}
type Shape = Exclude<ReturnType<typeof parseBoardShape>, { ok: false }>['shape'];
type View = 'top' | 'me' | 'around';
type StoredScore = { entry: ScoreEntry; state: ScoreReceipt['state'] };
type Query = LeaderboardQuery & { limit?: number; offset?: number };
export interface LeaderboardConfig {
  apiOrigin: string; timeoutMs: number; responseBytesMax: number; manifestBytesMax: number;
  keyCharsMax: number; boardCountMax: number; readMax: number; readDefault: number; radius: number; offsetMax: number;
  clampTolerance: number; statsBytesMax: number; metaPolicy: { keys: Readonly<Record<string, string>>; maxStringLength: number; maxBytes: number; digitRunMin: number; reservedLabels?: readonly string[] };
}
export interface LeaderboardContext {
  win: Window | undefined; local: boolean; enabled: boolean; token: string | null; preview: boolean; disposed: boolean;
}
/** Read where used rather than passed in, so build.mjs can fold each scalar bound
 * into its call site. As a constructor field the policy shipped as an object and
 * every read paid for `this.config`, about 130 bytes gzip of the core's budget. */
/* boardCaps (LIMITS.platform.manifest's board caps, which parseBoardShape reads) is typed
   here rather than in LeaderboardConfig, because that interface ships in the package's
   declarations and the parser's types belong to a workspace package nobody can install. */
declare const __SDK_CONFIG__: { leaderboards: LeaderboardConfig & { boardCaps: Parameters<typeof parseBoardShape>[1] } };
const fail = (error: string, reason: string): Result<never> => ({ ok: false, error, reason });
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** A record of one value type, frozen, or null. Absent reads as empty, which is what an
 * older API and a run without stats both send. */
function record<T>(value: unknown, is: (item: unknown) => item is T): Readonly<Record<string, T>> | null {
  if (value === undefined || value === null) return Object.freeze({});
  if (!object(value) || !Object.values(value).every(is)) return null;
  return Object.freeze({ ...value } as Record<string, T>);
}
const text = (value: unknown): value is string => typeof value === 'string';
/* A filter goes into the query string as `key:value,key:value`, so a key or value that
   could hold a comma or a colon would be a different filter on the wire. These are the
   shapes parseBoardShape allows a variant key and value to have. */
const TAG_KEY = /^[a-z][a-z0-9_]*$/, TAG_VALUE = /^[a-z0-9][a-z0-9_-]*$/;
/** The public part of a parsed board: what a page draws. Column bounds stay out, as og-api
 * leaves them out, because they are a moderation threshold rather than something to show. */
const publicShape = ({ key: _key, order: _order, min: _min, max: _max, runsPerPlayer: _runs, columns, ...shape }: Shape): LeaderboardShape =>
  Object.freeze({ ...shape, columns: Object.freeze(columns.map(({ min: _min, max: _max, ...column }) => Object.freeze(column))) });

/** The local adapter follows the same result and validation contracts as the
 * hosted service. It never substitutes local scores after a hosted request fails. */
export class Leaderboards {
  private generation = 0;
  private cancellation = 'session_changed';
  private suppliedManifest: unknown;
  private rawManifest: Promise<Result<unknown>> | null = null;
  private manifest: Promise<Result<Shape[]>> | null = null;
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
      submit: (value: number, meta?: ScoreMeta) => this.submit(key, { value, meta }),
      submitRun: (run: LeaderboardRun) => object(run) ? this.submit(key, run) : Promise.resolve(fail('invalid_score', 'Pass a run object with a finite value.')),
      top: (options?: Query) => this.read(key, 'top', options),
      me: async (options?: LeaderboardQuery) => { const page = await this.read(key, 'me', options); return page.ok ? { ok: true as const, value: page.value.entries[0] ?? null } : page; },
      around: (options?: LeaderboardQuery) => this.read(key, 'around', options),
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
  /* The local boards, read by parseBoardShape: the reading og-api, the deploy check and the
     manifest schema share, so a declaration the mock accepts is one a deploy accepts, and
     its reason is the one `opengame check` prints. This used to be a check of its own here,
     which knew key, order and bounds and nothing that came after them. */
  private async definitions(): Promise<Result<Shape[]>> {
    if (this.manifest) return this.manifest;
    this.manifest = (async () => {
      const raw = await this.manifestInput();
      if (!raw.ok) return raw;
      const input = raw.value;
      if (!object(input) || (input.leaderboards !== undefined && !Array.isArray(input.leaderboards))) return fail('invalid_manifest', 'Invalid leaderboard declarations.');
      const rows = (input.leaderboards ?? []) as unknown[];
      if (rows.length > __SDK_CONFIG__.leaderboards.boardCountMax) return fail('invalid_manifest', 'Too many leaderboard declarations.');
      const boards: Shape[] = [];
      for (const row of rows) {
        const parsed = parseBoardShape(row, __SDK_CONFIG__.leaderboards.boardCaps);
        if (!parsed.ok) return fail('invalid_manifest', parsed.reason);
        if (boards.some(board => board.key === parsed.shape.key)) return fail('invalid_manifest', `${parsed.shape.key} is declared twice.`);
        boards.push(parsed.shape);
      }
      // A career board's source, and what its columns read from it, as a deploy checks them.
      const crossed = crossCheckBoards(boards);
      return crossed ? fail('invalid_manifest', crossed) : { ok: true as const, value: boards };
    })();
    const result = await this.manifest;
    if (!result.ok) this.manifest = null;
    return result;
  }
  private async localBoard(key: string): Promise<Result<Shape>> {
    const definitions = await this.definitions();
    if (!definitions.ok) return definitions;
    const board = definitions.value.find(item => item.key === key);
    return board ? { ok: true, value: board } : fail('board_unavailable', 'Declare this board in opengame.json.');
  }
  private storageKey(key: string) { return `og:dev:leaderboard:v1:${new URL('./opengame.json', this.context().win!.location.href).pathname}:${key}`; }
  /* What decides whether a stored local score still belongs to the board: everything but
     the words, so renaming a column keeps the score and changing a bound or a variant
     starts the board fresh, as changing the order always has. */
  private definition(board: Shape) { const { label: _label, scoreLabel: _scoreLabel, format: _format, ...meaning } = board; return JSON.stringify(meaning); }
  private stored(board: Shape): StoredScore | null {
    const raw = this.context().win!.localStorage.getItem(this.storageKey(board.key));
    if (!raw) return null;
    if (raw.length > __SDK_CONFIG__.leaderboards.responseBytesMax) throw new Error('invalid local score');
    const data: unknown = JSON.parse(raw);
    if (!object(data) || typeof data.definition !== 'string') throw new Error('invalid local score');
    if (data.definition !== this.definition(board)) return null;
    if (!object(data.entry) || (data.state !== 'ok' && data.state !== 'clamped' && data.state !== 'rejected')) throw new Error('invalid local score');
    const entry = this.entry(data.entry, true);
    if (!entry) throw new Error('invalid local score');
    return { entry, state: data.state };
  }
  private entry(row: unknown, local = false): ScoreEntry | null {
    if (!object(row) || !finite(row.score) || !Number.isSafeInteger(row.rank) || Number(row.rank)<1 ||
      !(row.player_name === null || typeof row.player_name === 'string') || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) return null;
    const meta = validateScoreMeta(row.meta, __SDK_CONFIG__.leaderboards.metaPolicy);
    const stats = record(row.stats, finite), tags = record(row.tags, text);
    if (!meta.ok || !stats || !tags) return null;
    return Object.freeze({ name: row.player_name, score: row.score, stats, tags, meta: meta.meta, createdAt: row.created_at,
      rank: Number(row.rank), isMe: local || row.is_me === true, imported: row.imported === true });
  }
  /** The board's shape as og-api sends it, or null when the answer did not say (an older API),
   * or false when what it said is not a board. Read tolerantly, not with parseBoardShape: this
   * SDK ships inside published game versions that never change, so a field og-api adds later,
   * or a cap raised after this build, must not turn every read into invalid_response. Known
   * fields of the right type are kept, anything else is ignored, and a format this build does
   * not know reads as a plain number. */
  private shape(raw: unknown): LeaderboardShape | null | false {
    if (raw === undefined || raw === null) return null;
    if (!object(raw) || !['best', 'runs', 'career'].includes(raw.keep as string) || !Array.isArray(raw.columns) || !Array.isArray(raw.variants)) return false;
    const label = (value: unknown) => (typeof value === 'string' ? value : null);
    const format = (value: unknown) => (BOARD_FORMATS as readonly unknown[]).includes(value) ? value as LeaderboardShape['format'] : 'number';
    /* A career column's aggregate is passed through as og-api describes it, field by field
       and only in the types it has: it says how a number was made, for a page to show, and
       nothing in this SDK computes with it. */
    const columns = raw.columns.filter(object).filter(column => text(column.key) && text(column.label)).map(({ agg, of, where, scale, requires, ...column }) => Object.freeze({
      key: column.key as string, label: column.label as string, format: format(column.format),
      order: column.order === 'asc' ? 'asc' as const : 'desc' as const, sortable: column.sortable !== false,
      ...(Number.isSafeInteger(column.decimals) && (column.decimals as number) >= 0 && (column.decimals as number) <= 4 ? { decimals: column.decimals as number } : {}),
      ...(text(agg) ? { agg, of: text(of) || Array.isArray(of) ? of : null, ...(agg === 'ratio'
        ? { scale: finite(scale) ? scale : 1, requires: object(requires) ? requires : null } : { where: object(where) ? where : null }) } : {}) }));
    const variants = raw.variants.filter(object).filter(variant => text(variant.key) && text(variant.label) && Array.isArray(variant.values)).map(variant => Object.freeze({
      key: variant.key as string, label: variant.label as string,
      values: Object.freeze((variant.values as unknown[]).filter(object).filter(value => text(value.key) && text(value.label))
        .map(value => Object.freeze({ key: value.key as string, label: value.label as string }))) }));
    return Object.freeze({ label: label(raw.label), scoreLabel: label(raw.scoreLabel), format: format(raw.format), keep: raw.keep,
      ...(text(raw.from) ? { from: raw.from } : {}), ...(text(raw.scoreAgg) ? { scoreAgg: raw.scoreAgg } : {}),
      columns: Object.freeze(columns), variants: Object.freeze(variants) }) as LeaderboardShape;
  }
  private async read(key: string, view: View, options: Query = {}): Promise<Result<LeaderboardPage>> {
    const requested = options.limit, offset = options.offset ?? 0, filter = options.filter ?? {};
    if (requested !== undefined && (!Number.isSafeInteger(requested) || requested<1)) return fail('invalid_limit', 'Use a positive integer limit.');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > __SDK_CONFIG__.leaderboards.offsetMax || (offset && view !== 'top')) {
      return fail('invalid_query', `offset is a whole number from 0 to ${__SDK_CONFIG__.leaderboards.offsetMax}, on top() only.`);
    }
    if (options.sort !== undefined && (typeof options.sort !== 'string' || !TAG_KEY.test(options.sort))) return fail('invalid_query', 'sort is score or a sortable column key.');
    if (!object(filter) || Object.entries(filter).some(([name, value]) => !TAG_KEY.test(name) || typeof value !== 'string' || !TAG_VALUE.test(value))) {
      return fail('invalid_query', 'filter names a variant key and one of its value keys, such as { mode: "solo" }.');
    }
    const sort = options.sort ?? 'score', wanted = filterParam(filter);
    const limit = Math.min(requested ?? __SDK_CONFIG__.leaderboards.readDefault, __SDK_CONFIG__.leaderboards.readMax);
    const checked = await this.state(key); if (!checked.ok) return checked;
    const state = checked.value;
    if (state.generation !== this.generation || this.context().disposed) return fail("unavailable", this.cancellation);
    if (state.local) {
      const board = await this.localBoard(key); if (!board.ok) return board;
      if (this.context().disposed || !this.context().local) return fail('unavailable', 'session_changed');
      // Refused for the reasons og-api refuses them, so a query that works here works hosted.
      if (!resolveSort(sort, board.value)) return fail('invalid_query', `${sort} is not a sortable column of this board.`);
      const tags = validateRunTags(filter, board.value.variants); if (!tags.ok) return fail('invalid_query', tags.reason);
      try {
        /* Locally a board keeps one entry, this browser's best score, whatever the board's
           keep rule: there is one player, and a mock that kept every run would be a second
           ranking to get right. Sorting one row changes nothing, a filter shows it or not,
           and any offset is past it. */
        const stored = this.stored(board.value);
        // `total` counts the match before paging, as hosted does, so a pager's count holds on page two.
        const match = stored?.state === "ok" && Object.entries(filter).every(([name, value]) => stored.entry.tags[name] === value) ? stored.entry : null;
        const entry = offset ? null : match;
        return { ok: true, value: { entries: entry ? [entry] : [], order: board.value.order, preview: false, source: 'game_reported',
          total: match ? 1 : 0, offset, sort, filter: Object.freeze({ ...filter }), shape: publicShape(board.value) } };
      } catch { return fail('unavailable', 'local_storage_unavailable'); }
    }
    const host = this.host(state); if (!host) return fail('unavailable', 'unsupported_game_origin');
    const url = new URL('/v1/scores', __SDK_CONFIG__.leaderboards.apiOrigin);
    // A preview's host label is its capability, and a query string is logged in places a
    // header is not. The API already knows the label from this frame's Origin, so a
    // preview read leaves it out; a published game's label is public and stays. Paging,
    // sort and filter are sent only when asked for, so a plain read is the request an
    // older API already answered.
    const query = new URLSearchParams(state.preview ? { board: key, view, limit: String(limit) } : { board: key, host, view, limit: String(limit) });
    if (offset) query.set('offset', String(offset));
    if (options.sort !== undefined) query.set('sort', sort);
    if (wanted) query.set('filter', wanted);
    url.search = query.toString();
    const result = await this.json(url, { headers: { Authorization: `Bearer ${state.token}` }, cache: view === 'top' ? 'default' : 'no-store' }, __SDK_CONFIG__.leaderboards.responseBytesMax, state.generation);
    if (!result.ok) return result;
    if (this.context().disposed || state.generation !== this.generation || !this.context().enabled) return fail('unavailable', 'session_changed');
    const data = result.value, max = view === 'top' ? limit : view === 'me' ? 1 : 2*__SDK_CONFIG__.leaderboards.radius+1;
    if (!object(data) || data.board !== key || data.source !== 'game_reported' || (data.direction !== 'asc' && data.direction !== 'desc') ||
      Boolean(data.preview) !== state.preview || !Array.isArray(data.entries) || data.entries.length > max) return fail('unavailable', 'invalid_response');
    /* An API from before sort and filter ignores both and answers the whole board by score.
       Shown as the page asked for, that would be co-op runs under a Solo tab, so the page
       has to say back what it applied, and a read that asked for nothing reads absent as
       nothing. */
    const echoed = record(data.filter, text), shape = this.shape(data.shape);
    if (!echoed || filterParam(echoed) !== wanted || (data.sort ?? 'score') !== sort || (data.offset ?? 0) !== offset || shape === false ||
      !(data.total === undefined || data.total === null || (Number.isSafeInteger(data.total) && Number(data.total) >= 0))) return fail('unavailable', 'invalid_response');
    const entries: ScoreEntry[] = [];
    for (const row of data.entries) { const entry = this.entry(row); if (!entry) return fail('unavailable', 'invalid_response'); entries.push(entry); }
    if (view !== 'top' && entries.length && entries.filter(entry => entry.isMe).length !== 1) return fail('unavailable', 'invalid_response');
    return { ok: true, value: { entries, order: data.direction, preview: state.preview, source: 'game_reported',
      total: typeof data.total === 'number' ? data.total : null, offset, sort, filter: echoed, shape } };
  }
  private async submit(key: string, run: LeaderboardRun): Promise<Result<ScoreReceipt>> {
    const { value } = run;
    if (!finite(value)) return fail('invalid_score', 'Use a finite number.');
    const meta = validateScoreMeta(run.meta, __SDK_CONFIG__.leaderboards.metaPolicy);
    if (!meta.ok) return fail('invalid_meta', meta.reason);
    /* A reserved label ("Before OpenGame"). og-api refuses it on every write, so refusing it
       here too keeps local play and hosted play giving the same answer, with the reason. */
    if (isReservedScoreLabel(meta.meta.label, __SDK_CONFIG__.leaderboards.metaPolicy.reservedLabels)) {
      return fail('invalid_meta', 'meta.label is reserved for imported scores');
    }
    // The shape a hosted board checks against its columns and variants. A value that is
    // not a number, or a tag that is not a string, is wrong for every board.
    if (!record(run.stats, finite)) return fail('invalid_run', 'stats maps column keys to finite numbers.');
    if (!record(run.tags, text)) return fail('invalid_run', 'tags maps variant keys to value keys.');
    const checked = await this.state(key); if (!checked.ok) return checked;
    const state = checked.value;
    if (state.generation !== this.generation || this.context().disposed) return fail("unavailable", this.cancellation);
    if (state.local) {
      const board = await this.localBoard(key); if (!board.ok) return board;
      // og-api refuses a run posted to a career board before any write; so does the mock.
      if (board.value.from) return fail('invalid_run', `${key} is a career board, fed by ${board.value.from}; submit runs there.`);
      // validateRunStats and validateRunTags are og-api's own checks, so a stat the board
      // does not declare is dropped and named here exactly as it is hosted.
      const stats = validateRunStats(run.stats, board.value.columns, { clampTolerance: __SDK_CONFIG__.leaderboards.clampTolerance, statsBytesMax: __SDK_CONFIG__.leaderboards.statsBytesMax });
      if (!stats.ok) return fail('invalid_run', stats.reason);
      const tags = validateRunTags(run.tags, board.value.variants);
      if (!tags.ok) return fail('invalid_run', tags.reason);
      const persist = (): Result<ScoreReceipt> => {
        if (this.context().disposed || !this.context().local) return fail('unavailable', 'session_changed');
        const scored = classifyGameScore(value, { plausible_min: board.value.min, plausible_max: board.value.max }, __SDK_CONFIG__.leaderboards.clampTolerance);
        const result = { stored: scored.stored, state: worse(scored.state, stats.state) };
        const current = this.stored(board.value);
        const better = current && (board.value.order === 'asc' ? result.stored<current.entry.score : result.stored>current.entry.score);
        const best = !current || (result.state !== 'rejected' && (current.state === 'rejected' ||
          (result.state === 'ok' && current.state !== 'ok') || (result.state === current.state && Boolean(better))));
        if (best) this.context().win!.localStorage.setItem(this.storageKey(key), JSON.stringify({ definition: this.definition(board.value), state: result.state,
          entry: { player_name: 'dev', score: result.stored, stats: stats.stats, tags: tags.tags, meta: meta.meta, created_at: new Date().toISOString(), rank: 1 } }));
        return { ok: true, value: { state: result.state, score: result.stored, best, preview: false, ignored: Object.freeze(stats.ignored) } };
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
    // stats and tags go only when the run has them, so submit(value, meta) is the body it
    // always was and an og-api from before runs reads it unchanged.
    const result = await this.json(new URL('/v1/scores', __SDK_CONFIG__.leaderboards.apiOrigin), { method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: key, value, meta: meta.meta, stats: run.stats, tags: run.tags }) }, __SDK_CONFIG__.leaderboards.responseBytesMax, state.generation);
    if (!result.ok) return result;
    if (this.context().disposed || state.generation !== this.generation || !this.context().enabled) return fail('unavailable', 'session_changed');
    const data = result.value;
    if (!object(data) || data.ok !== true || !finite(data.stored) || typeof data.best !== 'boolean' ||
      (data.state !== 'ok' && data.state !== 'clamped' && data.state !== 'rejected') || Boolean(data.preview) !== state.preview) return fail('unavailable', 'invalid_response');
    return { ok: true, value: { score: data.stored, state: data.state, best: data.best, preview: state.preview,
      ignored: Object.freeze(Array.isArray(data.ignored) ? data.ignored.filter(text) : []) } };
  }
}

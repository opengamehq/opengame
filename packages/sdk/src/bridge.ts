import { installed, install } from './installation.js';
import { og, type InitOptions, type OpenGameClient, type Result, type ScoreMeta } from './index.js';
import { describeError, isCatalogued } from './errors.js';
import { legacyRoomBridge, roomRequest } from './legacy-multiplayer.js';

declare const __BRIDGE_CONFIG__: { argsBytesMax: number };

export type BridgeEvent = 'player' | 'pause' | 'mute' | 'fullscreen';
/** Operations accepted by `request`. Achievement calls use the same published-game
 * session as `og.achievements`; native adapters receive their results as JSON. */
export type BridgeOperation = 'init' | 'track' | 'openLink' | 'fullscreen' | 'signIn'
  | 'board.submit' | 'board.top' | 'board.me' | 'board.around'
  | 'achievements.unlock' | 'achievements.list';
export type BridgeHandler = (kind: 'result' | 'event', id: number, name: string, json: string, bytes?: Uint8Array) => void;

/** Native callers copy strings across their FFI. No engine owns a session:
 * validation stays in the core. */
export interface OpenGameBridge {
  readonly version: string;
  /** Replaces the previous handler; current player, pause, mute and fullscreen
   * state is replayed immediately. */
  setHandler(handler: BridgeHandler | null): void;
  /** Always returns before its result handler runs, including malformed calls.
   * Results use the core's { ok, value } / { ok: false, error, reason? } shape. */
  request(op: BridgeOperation, args: string): number;
  env(): string;
  player(): string;
  ready(): void;
}

const success = (value: unknown = null): Result<unknown> => ({ ok: true, value });
const invalid = (): Result<never> => ({ ok: false, error: 'invalid_request' });
function failure(error: unknown): Result<never> {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
  return code && isCatalogued(code) ? { ok: false, error: code, reason: describeError(code).hint } : invalid();
}
function bounded(json: string): string {
  if (typeof json !== 'string' || json.length > __BRIDGE_CONFIG__.argsBytesMax || new TextEncoder().encode(json).byteLength > __BRIDGE_CONFIG__.argsBytesMax) throw new Error();
  return json;
}
const operations = new Set<BridgeOperation>(['init', 'track', 'openLink', 'fullscreen', 'signIn',
  'board.submit', 'board.top', 'board.me', 'board.around', 'achievements.unlock', 'achievements.list']);
function argumentsObject(json: string): Record<string, unknown> {
  const value: unknown = JSON.parse(bounded(json));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}
function string(value: unknown): string { if (typeof value !== 'string') throw new Error(); return value; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(); return value; }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}

export function createBridge(client: OpenGameClient): OpenGameBridge {
  let handler: BridgeHandler | null = null, generation = 0, requestId = 0;
  const current = new Map<BridgeEvent, unknown>();
  const emit = (kind: 'result' | 'event', id: number, name: string, value: unknown) => {
    try {
      const pending = handler?.(kind, id, name, JSON.stringify(value)) as unknown;
      if (pending && typeof (pending as PromiseLike<unknown>).then === 'function') void Promise.resolve(pending).catch(() => {});
    } catch { /* An engine callback cannot interrupt core cleanup or other results. */ }
  };
  const snapshot = (name: BridgeEvent, value: unknown) => { current.set(name, value); emit('event', 0, name, value); };
  client.player.onChange(value => snapshot('player', value));
  client.onPause(value => snapshot('pause', value));
  client.audio.onHostMute(value => snapshot('mute', value));
  client.fullscreen.onChange(value => snapshot('fullscreen', value));

  const execute = async (op: BridgeOperation, args: Record<string, unknown>): Promise<Result<unknown>> => {
    switch (op) {
      case 'init': return success(await client.init(args as InitOptions));
      case 'track': return client.track(string(args.name), args.props === undefined ? {} : object(args.props));
      case 'openLink': return client.openLink(string(args.url));
      case 'fullscreen': return client.fullscreen.request();
      case 'signIn': return client.player.requestSignIn();
      case 'board.submit': return client.leaderboard(string(args.key)).submit(number(args.score), args.meta === undefined ? undefined : object(args.meta) as ScoreMeta);
      case 'board.top': return client.leaderboard(string(args.key)).top(args.limit === undefined ? undefined : { limit: number(args.limit) });
      case 'board.me': return client.leaderboard(string(args.key)).me();
      case 'board.around': return client.leaderboard(string(args.key)).around();
      case 'achievements.unlock': return client.achievements.unlock(string(args.id));
      case 'achievements.list': return client.achievements.list();
      default: return invalid();
    }
  };
  return Object.freeze({
    version: client.env.sdkVersion,
    setHandler(next: BridgeHandler | null) {
      const owner = ++generation;
      handler = typeof next === 'function' ? next : null;
      for (const [name, value] of current) {
        if (owner !== generation) break;
        emit('event', 0, name, value);
      }
    },
    request(op: BridgeOperation, json: string) {
      const id = ++requestId, owner = generation;
      let pending: Promise<Result<unknown>>;
      // A room operation comes from an engine exported before multiplayer left the SDK, and
      // gets the answers legacy-multiplayer.ts gives the script API rather than invalid_request.
      const room = typeof op === 'string' && op.startsWith('room.') ? roomRequest(op) : null;
      try { pending = operations.has(op) ? execute(op, argumentsObject(json)) : Promise.resolve(room ?? invalid()); } catch (error) { pending = Promise.resolve(failure(error)); }
      void pending.then(value => { if (owner === generation) emit('result', id, op, value); },
        error => { if (owner === generation) emit('result', id, op, failure(error)); });
      return id;
    },
    env: () => JSON.stringify(client.env),
    player: () => JSON.stringify(client.player),
    ready: () => client.ready(),
    // Not in OpenGameBridge, on purpose: see legacy-multiplayer.ts.
    ...legacyRoomBridge,
  });
}

export const bridge: OpenGameBridge = installed<OpenGameBridge>('bridge') ?? install('bridge', createBridge(og));

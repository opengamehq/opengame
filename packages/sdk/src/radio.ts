/**
 * OG Radio in a game: browse OpenGame's radio stations and songs, and play them for the
 * player while they play.
 *
 * The OpenGame page plays the music, with the player's own radio volume. The game asks for
 * stations and songs, and sends play, pause, skip, shuffle, repeat and volume. It hears
 * back what is playing through `onChange`. The game never receives audio, so the radio
 * needs nothing from the game's audio graph or its content security policy, and the music
 * keeps playing in the site's player when the player leaves the game.
 *
 * - `stations()` lists the stations, A to Z, each with its song count and genres.
 * - `tracks({ station, genre, q })` lists songs A to Z by title, within All radios
 *   (`station: 'all'`, the default), one station, or one station's genre. `q` searches
 *   within that scope, ignoring case and accents.
 * - `play()`, `pause()`, `next()`, `previous()`, `setShuffle()`, `setRepeat()` and
 *   `setVolume()` control the radio. Anything that makes sound must be called from the
 *   player's click or key press, and is refused as `muted` while the player has silenced
 *   the game on OpenGame. Pausing and turning the volume down always work.
 * - `mountPicker(element)` draws a complete, themeable radio picker into an element.
 *
 * Every call returns `{ ok: false, error }` rather than throwing. Outside OpenGame, and in
 * the local mock, the radio is `unavailable`: there is no page to play it.
 */
import { og, type Result } from './index.js';
import { installed, install } from './installation.js';
import { mountRadioPicker, type RadioPicker, type RadioPickerOptions } from './radio-picker.js';
export type { RadioPicker, RadioPickerOptions, RadioTheme } from './radio-picker.js';

declare const __RADIO_CONFIG__: { requestTimeoutMs: number; tracksPageMax: number; queryCharsMax: number; idCharsMax: number; offsetMax: number; handshakeTimeoutMs: number };

/** One of a station's genres. `count` is how many of its songs are in it. */
export type RadioGenre = Readonly<{ id: string; label: string; count: number }>;
/**
 * A station. `name` is its full name ("OG Pixel Radio") and `label` the short one a list
 * shows ("Pixel"). `genres` are A to Z by label. `palette` is its colours, dark to light.
 */
export type RadioStation = Readonly<{ id: string; name: string; label: string; count: number; genres: readonly RadioGenre[]; palette: readonly [string, string, string] }>;
/**
 * A song. `id` is `<station>/<song>` and is what `play({ track })` takes. `duration` is
 * null until the song plays, and `art` is null because OG Radio songs have no cover art:
 * colour a song with its station's `palette`. `attribution` is a ready-made now-playing
 * line; a game does not have to credit the music.
 */
export type RadioTrack = Readonly<{
  id: string; title: string; station: string; stationName: string; genre: string | null; genreLabel: string | null;
  duration: number | null; art: string | null; palette: readonly [string, string, string]; attribution: string;
}>;
/**
 * Which songs to list. `station` is a station id or `'all'` (All radios, the default).
 * `genre` is one of that station's genre ids, and needs a station. `q` searches titles
 * within the scope. `offset` and `limit` page the list; a page holds at most 200 songs.
 */
export type RadioTrackQuery = { station?: string; genre?: string; q?: string; offset?: number; limit?: number };
/** A page of songs A to Z by title. `total` counts every song in the scope and search. */
export type RadioTrackPage = Readonly<{ items: readonly RadioTrack[]; total: number; offset: number }>;
/**
 * What the radio is doing. `available` says whether this page offers the radio at all.
 * `station`, `genre`, `track`, `volume`, `shuffle` and `repeat` are null until your game has
 * played the radio, so it never learns what the player chose elsewhere or what another game
 * left playing. `volume` is the radio's volume, 0 to 1, in steps of 0.05. `position` and
 * `duration` are seconds, as of the last change.
 */
export type RadioState = Readonly<{
  available: boolean; playing: boolean; loading: boolean; shuffle: boolean | null; repeat: boolean | null; volume: number | null;
  station: string | null; genre: string | null; track: RadioTrack | null; position: number | null; duration: number | null;
}>;
/**
 * What `play` starts. With no target it resumes the radio as it was. `{ track }` plays that song,
 * and Next then stays on its station, or within `genre` when one is given. `{ station }`
 * tunes a station, or one of its genres, and starts it.
 */
export type RadioPlayTarget = { track?: string; station?: string; genre?: string };

export type Radio = {
  /** Whether this page offers the radio. False outside OpenGame and in the local mock. */
  readonly available: boolean;
  /** The last state the page reported. */
  readonly state: RadioState;
  /** Calls the listener now and on every change. Returns an unsubscribe function. */
  onChange(listener: (state: RadioState) => void): () => void;
  stations(): Promise<Result<readonly RadioStation[]>>;
  tracks(query?: RadioTrackQuery): Promise<Result<RadioTrackPage>>;
  /** From a click or key press. */
  play(target?: RadioPlayTarget): Promise<Result>;
  pause(): Promise<Result>;
  /** From a click or key press. */
  next(): Promise<Result>;
  /** From a click or key press. Restarts the song when it is more than three seconds in. */
  previous(): Promise<Result>;
  /** From a click or key press. */
  setShuffle(on: boolean): Promise<Result>;
  /** From a click or key press. Repeats the song that is playing. */
  setRepeat(on: boolean): Promise<Result>;
  /** 0 to 1, in steps of 0.05. Turning it up needs a click or key press, and goes no higher
   * than the player last set it on OpenGame; turning it down never needs a press. A volume a
   * game sets goes back to the player's when the game closes, and is never remembered. */
  setVolume(level: number): Promise<Result>;
  /** Draw the radio picker into `element`. Call `destroy()` on the result to remove it. */
  mountPicker(element: HTMLElement, options?: RadioPickerOptions): RadioPicker;
};

const config = __RADIO_CONFIG__;
const triple = (value: unknown): value is [string, string, string] =>
  Array.isArray(value) && value.length === 3 && value.every(each => typeof each === 'string' && each.length <= 32);
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length <= max;
const nullable = <T>(value: unknown, check: (value: unknown) => value is T): value is T | null => value === null || check(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const seconds = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/* The page is trusted (the core has checked the message's origin and source), and its
   answers are still read field by field, so a page from another version can never hand a
   game something its types do not promise. */
function readTrack(value: unknown): RadioTrack | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Record<string, unknown>;
  if (!text(t.id, config.idCharsMax) || !text(t.title) || !text(t.station, config.idCharsMax) || !text(t.stationName) ||
    !nullable(t.genre, text) || !nullable(t.genreLabel, text) || !nullable(t.duration, seconds) || !nullable(t.art, text) ||
    !triple(t.palette) || !text(t.attribution, 400)) return null;
  return Object.freeze({ id: t.id, title: t.title, station: t.station, stationName: t.stationName, genre: t.genre, genreLabel: t.genreLabel,
    duration: t.duration, art: t.art, palette: Object.freeze([...t.palette]) as unknown as [string, string, string], attribution: t.attribution });
}
function readStation(value: unknown): RadioStation | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (!text(s.id, config.idCharsMax) || !text(s.name) || !text(s.label) || !count(s.count) || !triple(s.palette) || !Array.isArray(s.genres)) return null;
  const genres: RadioGenre[] = [];
  for (const g of s.genres as unknown[]) {
    const genre = g as Record<string, unknown> | null;
    if (!genre || typeof genre !== 'object' || !text(genre.id, config.idCharsMax) || !text(genre.label) || !count(genre.count)) return null;
    genres.push(Object.freeze({ id: genre.id, label: genre.label, count: genre.count }));
  }
  return Object.freeze({ id: s.id, name: s.name, label: s.label, count: s.count, genres: Object.freeze(genres), palette: Object.freeze([...s.palette]) as unknown as [string, string, string] });
}
function readPage(value: unknown): RadioTrackPage | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (!Array.isArray(p.items) || p.items.length > config.tracksPageMax || !count(p.total) || !count(p.offset)) return null;
  const items = p.items.map(readTrack);
  return items.every(Boolean) ? Object.freeze({ items: Object.freeze(items as RadioTrack[]), total: p.total, offset: p.offset }) : null;
}
const quiet: RadioState = Object.freeze({ available: false, playing: false, loading: false, shuffle: null, repeat: null, volume: null,
  station: null, genre: null, track: null, position: null, duration: null });
function readState(value: unknown, available: boolean): RadioState | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  const track = s.track === null ? null : readTrack(s.track);
  const flag = (value: unknown): value is boolean | null => value === null || typeof value === 'boolean';
  if (typeof s.playing !== 'boolean' || typeof s.loading !== 'boolean' || !flag(s.shuffle) || !flag(s.repeat) ||
    !(s.volume === null || (typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1)) || !nullable(s.station, text) || !nullable(s.genre, text) ||
    (s.track !== null && !track) || !nullable(s.position, seconds) || !nullable(s.duration, seconds)) return null;
  return Object.freeze({ available, playing: s.playing, loading: s.loading, shuffle: s.shuffle, repeat: s.repeat, volume: s.volume,
    station: s.station, genre: s.genre, track, position: s.position, duration: s.duration });
}

function createRadio(): Radio {
  const pending = new Map<string, (result: Result<unknown>) => void>();
  const listeners = new Set<(state: RadioState) => void>();
  const waiting = new Set<() => void>();
  let capable = false;
  let sessionSeen = false;
  let current = quiet;
  let sequence = 0;
  // A prefix of its own, so two copies of this module in one game never share an id.
  const prefix = Math.random().toString(36).slice(2, 8);

  const embedded = () => { try { return typeof window !== 'undefined' && window.parent !== window; } catch { return true; } };
  const publish = (next: RadioState) => {
    current = next;
    for (const listener of listeners) { try { listener(next); } catch { /* a game's callback cannot break the radio */ } }
  };
  const settleAll = (error: string) => { for (const [rid, settle] of pending) { pending.delete(rid); settle({ ok: false, error }); } };

  og.onParentMessage(data => {
    if (data.type === 'session') {
      sessionSeen = true;
      const offered = Array.isArray(data.capabilities) && data.capabilities.includes('radio');
      for (const resume of waiting) resume();
      if (offered === capable) return;
      capable = offered;
      if (!offered) settleAll('unavailable');
      publish(offered ? Object.freeze({ ...current, available: true }) : quiet);
    } else if (data.type === 'radio' && typeof data.rid === 'string') {
      const settle = pending.get(data.rid);
      if (!settle) return;
      pending.delete(data.rid);
      settle(data.ok === true ? { ok: true, value: data.value } : { ok: false, error: typeof data.error === 'string' && /^[a-z_]{1,40}$/.test(data.error) ? data.error : 'invalid_response' });
    } else if (data.type === 'radio-state' && capable) {
      const next = readState(data.state, true);
      if (next) publish(next);
    }
  });

  /* The page's session says whether it offers the radio. A call made while the game is
     still loading waits for that answer, as long as the handshake would, rather than
     failing because it asked first. */
  const connected = (): Promise<boolean> => {
    if (sessionSeen || og.env.connected) return Promise.resolve(true);
    if (!embedded()) return Promise.resolve(false);
    return new Promise(resolve => {
      const done = (value: boolean) => { clearTimeout(timer); waiting.delete(resume); resolve(value); };
      const resume = () => done(true);
      const timer = setTimeout(() => done(false), config.handshakeTimeoutMs);
      waiting.add(resume);
    });
  };

  async function request(op: string, args: Record<string, unknown> = {}): Promise<Result<unknown>> {
    if (!await connected()) return { ok: false, error: 'unavailable' };
    /* A copy of this module loaded after the session (a game's own bundle beside the
       injected SDK) has not seen the capability. It asks anyway; the page answers
       `unavailable` if it does not offer the radio. */
    if (sessionSeen && !capable) return { ok: false, error: 'unavailable' };
    const rid = `r${prefix}${(++sequence).toString(36)}`;
    return new Promise(resolve => {
      const timer = setTimeout(() => { pending.delete(rid); resolve({ ok: false, error: 'timeout' }); }, config.requestTimeoutMs);
      pending.set(rid, result => {
        clearTimeout(timer);
        if (!sessionSeen && result.ok && !capable) { capable = true; publish(Object.freeze({ ...current, available: true })); }
        resolve(result);
      });
      const sent = og.postToParent({ type: 'radio', rid, op, ...args });
      if (!sent.ok) pending.get(rid)?.(sent);
    });
  }
  /* What makes sound is refused here first while the page has the game muted, so a game
     that ignores og.audio hears the same answer the page would give. */
  const sounding = (op: string, args?: Record<string, unknown>): Promise<Result> => og.audio.muted
    ? Promise.resolve({ ok: false, error: 'muted' })
    : request(op, args).then(result => result.ok ? { ok: true, value: undefined } : result);
  /* The same shapes the page reads, so a call it would drop unanswered is refused here at once
     as invalid_request, rather than waiting out the timeout (Greptile, 8 Nov 2026): a station
     or genre id is a lowercase slug, and a song's id is `<station>/<song>`. */
  const fits = (value: unknown, pattern: RegExp) => typeof value === 'string' && value.length <= config.idCharsMax && pattern.test(value);
  const id = (value: unknown) => fits(value, /^[a-z0-9][a-z0-9-]*$/);
  const songId = (value: unknown) => fits(value, /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/);

  const radio: Radio = {
    get available() { return capable; },
    get state() { return current; },
    onChange(listener) {
      listeners.add(listener);
      try { listener(current); } catch { /* isolate the game's callback */ }
      return () => { listeners.delete(listener); };
    },
    async stations() {
      const result = await request('stations');
      if (!result.ok) return result;
      const stations = Array.isArray(result.value) ? result.value.map(readStation) : null;
      return stations && stations.every(Boolean) ? { ok: true, value: Object.freeze(stations as RadioStation[]) } : { ok: false, error: 'invalid_response' };
    },
    async tracks(query = {}) {
      const { station = 'all', genre, q, offset, limit } = query;
      if (!id(station) || (genre !== undefined && (!id(genre) || station === 'all')) || (q !== undefined && (typeof q !== 'string' || q.length > config.queryCharsMax)) ||
        (offset !== undefined && !(Number.isSafeInteger(offset) && offset >= 0 && offset <= config.offsetMax)) ||
        (limit !== undefined && !(Number.isSafeInteger(limit) && limit >= 1))) return { ok: false, error: 'invalid_request' };
      const result = await request('tracks', { station, ...(genre !== undefined ? { genre } : {}), ...(q ? { q } : {}),
        ...(offset !== undefined ? { offset } : {}), ...(limit !== undefined ? { limit: Math.min(limit, config.tracksPageMax) } : {}) });
      if (!result.ok) return result;
      const page = readPage(result.value);
      return page ? { ok: true, value: page } : { ok: false, error: 'invalid_response' };
    },
    play(target = {}) {
      const { track, station, genre } = target;
      if ((track !== undefined && !songId(track)) || (station !== undefined && (!id(station) || station === 'all')) ||
        (genre !== undefined && (!id(genre) || (!track && !station))))
        return Promise.resolve({ ok: false, error: 'invalid_request' });
      return sounding('play', { ...(track ? { track } : {}), ...(station ? { station } : {}), ...(genre ? { genre } : {}) });
    },
    pause: () => request('pause').then(result => result.ok ? { ok: true, value: undefined } : result),
    next: () => sounding('next'),
    previous: () => sounding('previous'),
    setShuffle: on => typeof on === 'boolean' ? sounding('shuffle', { on }) : Promise.resolve({ ok: false, error: 'invalid_request' }),
    setRepeat: on => typeof on === 'boolean' ? sounding('repeat', { on }) : Promise.resolve({ ok: false, error: 'invalid_request' }),
    setVolume(level) {
      if (typeof level !== 'number' || !Number.isFinite(level)) return Promise.resolve({ ok: false, error: 'invalid_request' });
      const clamped = Math.min(1, Math.max(0, level));
      // Down is always allowed, even muted: it only ever makes less sound.
      if (current.volume !== null && clamped <= current.volume) return request('volume', { level: clamped }).then(result => result.ok ? { ok: true, value: undefined } : result);
      return sounding('volume', { level: clamped });
    },
    mountPicker: (element, options) => mountRadioPicker(radio, element, options),
  };
  return radio;
}

/* One radio per installed SDK, as there is one client: a game's own bundle and the
   injected global share it, so a reply reaches the copy that asked. */
export const radio: Radio = installed<Radio>('radio') ?? install('radio', createRadio());

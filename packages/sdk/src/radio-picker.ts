/**
 * The radio picker: OG Radio's stations, genres and songs in one panel a game drops into
 * its own menu, so each game does not build its own.
 *
 * Laid out like OG Snipers' in-game radio: All radios and then each station down the left,
 * with their song counts; a search field, the station's genres as chips and a numbered A to
 * Z song list on the right; play, previous, next, shuffle, repeat and volume along the
 * bottom. The search looks within what is selected: All radios, a station, or a station's
 * genre.
 *
 * It draws inside a shadow root, so a game's own CSS cannot reach in and break it, and it
 * is styled from outside two ways: the `theme` option or CSS custom properties on any
 * ancestor (`--og-radio-accent` and the rest, listed on `RadioTheme`), and `::part()` for
 * anything further (`panel`, `stations`, `station`, `search`, `genres`, `genre`, `list`,
 * `song`, `controls`, `control`, `volume`, `status`).
 *
 * Keys, while focus is inside it: `/` searches, the arrows move through stations and songs,
 * Enter plays, Space plays or pauses, N and P skip, S shuffles, R repeats, and - and =
 * turn the volume down and up. They stop at the picker, so the game does not also act on a
 * letter typed into the search.
 */
import type { Radio, RadioState, RadioStation, RadioTrack } from './radio.js';

/** Colours and shape. Each is a CSS value, and each is also read from a custom property. */
export type RadioTheme = {
  /** `--og-radio-bg`, the panel. */ background: string;
  /** `--og-radio-surface`, rows and fields. */ surface: string;
  /** `--og-radio-text`. */ text: string;
  /** `--og-radio-muted`, counts and secondary text. */ muted: string;
  /** `--og-radio-accent`, the playing song, the play button and shuffle or repeat when on. */ accent: string;
  /** `--og-radio-accent-text`, text on the accent. */ accentText: string;
  /** `--og-radio-border`. */ border: string;
  /** `--og-radio-radius`, the panel's corners; rows and chips follow it. */ radius: string;
  /** `--og-radio-font`. */ font: string;
};
export type RadioPickerOptions = {
  /** `'dark'` (the default), `'light'`, or your own values over the dark theme. */
  theme?: 'dark' | 'light' | Partial<RadioTheme>;
  /** The heading. Defaults to "Music". Set it to an empty string to hide it. */
  title?: string;
  /** Turn the keyboard shortcuts off. Arrow keys, Enter and Tab keep working. */
  shortcuts?: boolean;
};
export type RadioPicker = {
  /** The element the picker drew itself into, inside the one you passed. */
  readonly element: HTMLElement;
  /** Focus the search field. */
  focus(): void;
  /** Remove the picker and stop listening. */
  destroy(): void;
};

const DARK: RadioTheme = { background: '#111214', surface: '#1c1d21', text: '#f4f2ee', muted: '#a19d96', accent: '#0054ff',
  accentText: '#ffffff', border: 'rgba(255,255,255,.1)', radius: '16px', font: 'Geist, system-ui, -apple-system, "Segoe UI", sans-serif' };
const LIGHT: RadioTheme = { ...DARK, background: '#fbfaf8', surface: '#f0eee9', text: '#1b1a18', muted: '#67635c', border: 'rgba(0,0,0,.1)' };
const VARS: Record<keyof RadioTheme, string> = { background: 'bg', surface: 'surface', text: 'text', muted: 'muted', accent: 'accent',
  accentText: 'accent-text', border: 'border', radius: 'radius', font: 'font' };

const CSS = `
:host{all:initial;display:block;min-height:0;height:100%}
*{box-sizing:border-box}
.panel{height:100%;display:flex;flex-direction:column;gap:12px;padding:16px;font:14px/1.4 var(--f);color:var(--t);background:var(--b);
border:1px solid var(--line);border-radius:var(--r);-webkit-font-smoothing:antialiased}
header{display:flex;align-items:baseline;gap:8px}
.eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--m)}
h2{margin:0;font-size:16px;font-weight:600}
.body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(132px,30%) 1fr;gap:12px}
nav,.main{min-height:0;display:flex;flex-direction:column;gap:8px}
ul,ol{list-style:none;margin:0;padding:0;overflow:auto;min-height:0;scrollbar-width:thin}
nav ul{flex:1}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
button:focus-visible,input:focus-visible{outline:2px solid var(--a);outline-offset:2px}
.row{width:100%;display:flex;align-items:center;gap:10px;min-height:36px;padding:6px 10px;border-radius:calc(var(--r) * .5);text-align:left}
.row:hover{background:var(--s)}
.station[aria-current=true]{background:var(--s);font-weight:600}
.song[aria-current=true]{background:var(--a);color:var(--at)}
.song[aria-current=true] .n{color:inherit;opacity:.8}
.grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.n{color:var(--m);font-variant-numeric:tabular-nums;font-size:12px}
.song .n{min-width:2.5em;text-align:right}
.meta{color:var(--m);font-size:12px;white-space:nowrap}
.song[aria-current=true] .meta{color:inherit;opacity:.8}
input[type=search]{width:100%;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--s);color:var(--t);font:inherit}
input[type=search]::placeholder{color:var(--m)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{min-height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--line);font-size:12px}
.chip[aria-pressed=true]{background:var(--t);color:var(--b);border-color:var(--t)}
.list{flex:1}
.more{align-self:center;min-height:32px;padding:0 14px;border-radius:999px;border:1px solid var(--line);font-size:12px}
.empty,.status{margin:0;color:var(--m);font-size:12px}
.status:empty{display:none}
footer{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--line)}
.ctl{width:36px;height:36px;display:grid;place-items:center;border-radius:999px}
.ctl:hover{background:var(--s)}
.ctl[aria-pressed=true]{color:var(--a)}
.ctl.play{background:var(--a);color:var(--at)}
svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.now{flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--m)}
.now b{color:var(--t);font-weight:500}
.vol{display:flex;align-items:center;gap:6px;color:var(--m)}
input[type=range]{width:96px;accent-color:var(--a)}
input[type=range]:disabled{opacity:.4}
@media (max-width:480px){.body{grid-template-columns:1fr}nav ul{max-height:30vh}}
@media (prefers-reduced-motion:no-preference){.row,.chip,.ctl{transition:background-color 120ms ease,color 120ms ease}}
`;

const ICONS: Record<string, string> = {
  previous: '<path d="M19 20 9 12l10-8zM5 19V5"/>', next: '<path d="m5 4 10 8-10 8zM19 5v14"/>',
  play: '<path d="m7 4 13 8-13 8z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', repeat: '<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7"/>',
};

const MESSAGES: Record<string, string> = {
  unavailable: 'OG Radio plays when this game runs on OpenGame.',
  gesture_required: 'Press again to play.',
  muted: "This game's sound is off on OpenGame. Turn it on to hear the radio.",
  busy: 'Too many requests at once. Try again in a moment.',
  timeout: 'OpenGame did not answer. Try again.',
};

type Scope = { station: string; genre?: string };

export function mountRadioPicker(radio: Radio, element: HTMLElement, options: RadioPickerOptions = {}): RadioPicker {
  const doc = element.ownerDocument;
  const host = doc.createElement('div');
  host.setAttribute('data-og-radio', '');
  const base = options.theme === 'light' ? LIGHT : DARK;
  const theme: RadioTheme = { ...base, ...(typeof options.theme === 'object' ? options.theme : {}) };
  /* Each value is a fallback under the matching custom property, so a game can theme the
     picker from its own stylesheet as well as through the option. */
  for (const key of Object.keys(VARS) as (keyof RadioTheme)[]) {
    if (typeof options.theme === 'object' && typeof options.theme[key] === 'string') host.style.setProperty(`--og-radio-${VARS[key]}`, theme[key]);
  }
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `:host{--b:var(--og-radio-bg,${base.background});--s:var(--og-radio-surface,${base.surface});--t:var(--og-radio-text,${base.text});`
    + `--m:var(--og-radio-muted,${base.muted});--a:var(--og-radio-accent,${base.accent});--at:var(--og-radio-accent-text,${base.accentText});`
    + `--line:var(--og-radio-border,${base.border});--r:var(--og-radio-radius,${base.radius});--f:var(--og-radio-font,${base.font})}` + CSS;
  root.append(style);

  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]) => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  };
  const icon = (name: string) => { const span = make('span', { 'aria-hidden': 'true' }); span.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`; return span; };
  const control = (name: string, label: string, pressable = false) => {
    const button = make('button', { type: 'button', class: `ctl ${name}`, part: 'control', 'aria-label': label, ...(pressable ? { 'aria-pressed': 'false' } : {}) }, icon(name));
    return button;
  };

  const title = options.title ?? 'Music';
  const header = make('header', {}, make('span', { class: 'eyebrow' }, 'OG Radio'), ...(title ? [make('h2', {}, title)] : []));
  const stationList = make('ul', { role: 'list' });
  const nav = make('nav', { part: 'stations', 'aria-label': 'Stations' }, stationList);
  const search = make('input', { type: 'search', part: 'search', autocomplete: 'off', spellcheck: 'false', maxlength: '64' });
  const chips = make('div', { class: 'chips', part: 'genres', role: 'group', 'aria-label': 'Genres' });
  const list = make('ol', { class: 'list', part: 'list', 'aria-label': 'Songs, A to Z' });
  const more = make('button', { type: 'button', class: 'more' }, 'Show more songs');
  const empty = make('p', { class: 'empty', role: 'status' });
  const main = make('section', { class: 'main', 'aria-label': 'Songs' }, search, chips, list, more, empty);
  const previous = control('previous', 'Previous song'), play = control('play', 'Play'), next = control('next', 'Next song');
  const shuffle = control('shuffle', 'Shuffle', true), repeat = control('repeat', 'Repeat song', true);
  const volume = make('input', { type: 'range', min: '0', max: '100', step: '5', part: 'volume', 'aria-label': 'Radio volume' });
  const now = make('p', { class: 'now', 'aria-live': 'polite' });
  const status = make('p', { class: 'status', part: 'status', role: 'status' });
  const footer = make('footer', { part: 'controls' }, previous, play, next, shuffle, repeat, make('span', { class: 'vol' }, icon('volume'), volume), now);
  const panel = make('div', { class: 'panel', part: 'panel', role: 'region', 'aria-label': 'OG Radio' }, header, make('div', { class: 'body' }, nav, main), footer, status);
  root.append(panel);
  element.append(host);

  let stations: readonly RadioStation[] = [];
  let scope: Scope = { station: 'all' };
  let songs: RadioTrack[] = [];
  let total = 0;
  let generation = 0;
  let loading = false;
  let destroyed = false;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let state: RadioState = radio.state;

  const say = (error: string | null) => { status.textContent = error ? MESSAGES[error] ?? 'That did not work. Try again.' : ''; };
  const act = (call: Promise<{ ok: boolean; error?: string }>) => { say(null); void call.then(result => { if (!destroyed) say(result.ok ? null : result.error ?? null); }); };
  const scopeName = () => scope.station === 'all' ? 'All radios' : stations.find(each => each.id === scope.station)?.label ?? 'this station';

  /* One button in each list takes Tab; the arrows move between the rest. */
  function rove(container: HTMLElement, selector: string, target: HTMLElement | null) {
    for (const each of Array.from(container.querySelectorAll<HTMLElement>(selector))) each.tabIndex = each === target ? 0 : -1;
  }
  function moveIn(container: HTMLElement, selector: string, event: KeyboardEvent) {
    const items = Array.from(container.querySelectorAll<HTMLElement>(selector));
    const at = items.indexOf(root.activeElement as HTMLElement);
    if (at < 0) return false;
    const to = event.key === 'ArrowDown' ? at + 1 : event.key === 'ArrowUp' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -2;
    if (to === -2) return false;
    const target = items[Math.max(0, Math.min(items.length - 1, to))];
    rove(container, selector, target);
    target?.focus();
    return true;
  }

  function drawStations() {
    const rows = [{ id: 'all', label: 'All radios', count: stations.reduce((sum, each) => sum + each.count, 0) }, ...stations];
    stationList.replaceChildren(...rows.map(each => {
      const button = make('button', { type: 'button', class: 'row station', part: 'station', 'data-id': each.id, 'aria-current': String(scope.station === each.id) },
        make('span', { class: 'grow' }, each.label), make('span', { class: 'n' }, String(each.count)));
      return make('li', {}, button);
    }));
    rove(stationList, 'button', stationList.querySelector('[aria-current=true]'));
  }
  function drawChips() {
    const station = stations.find(each => each.id === scope.station);
    chips.hidden = !station?.genres.length;
    if (!station) { chips.replaceChildren(); return; }
    const chip = (id: string | undefined, label: string) => make('button', { type: 'button', class: 'chip', part: 'genre', ...(id ? { 'data-id': id } : {}),
      'aria-pressed': String(scope.genre === id) }, label);
    chips.replaceChildren(chip(undefined, 'All genres'), ...station.genres.map(each => chip(each.id, each.label)));
    search.placeholder = `Search ${scopeName()}`;
  }
  function drawSongs(from = 0) {
    const playing = state.track?.id;
    const rows = songs.slice(from).map((song, index) => {
      const meta = scope.station === 'all' ? stations.find(each => each.id === song.station)?.label ?? '' : scope.genre ? '' : song.genreLabel ?? '';
      const button = make('button', { type: 'button', class: 'row song', part: 'song', 'data-id': song.id, 'aria-current': String(song.id === playing),
        'aria-label': `Play ${song.title}${meta ? `, ${meta}` : ''}` }, make('span', { class: 'n' }, String(from + index + 1)), make('span', { class: 'grow' }, song.title),
        ...(meta ? [make('span', { class: 'meta' }, meta)] : []));
      button.tabIndex = -1;
      return make('li', {}, button);
    });
    if (from === 0) list.replaceChildren(...rows); else list.append(...rows);
    if (!list.querySelector('button[tabindex="0"]')) rove(list, 'button', list.querySelector('[aria-current=true]') ?? list.querySelector('button'));
    more.hidden = songs.length >= total;
    const query = search.value.trim();
    empty.textContent = songs.length ? '' : loading ? '' : query ? `No songs in ${scopeName()} match "${query}".` : 'No songs here.';
  }

  async function load(append = false) {
    /* More of a list only once the list itself has arrived: a page asked for while a new
       scope was loading took the old list's length as its offset and appended the new
       station's songs to the old station's (Greptile, 8 Nov 2026). */
    if (append && loading) return;
    const ticket = ++generation;
    loading = true;
    const result = await radio.tracks({ station: scope.station, ...(scope.genre ? { genre: scope.genre } : {}),
      ...(search.value.trim() ? { q: search.value.trim() } : {}), offset: append ? songs.length : 0 });
    if (destroyed || ticket !== generation) return;
    loading = false;
    if (!result.ok) { say(result.error); if (!append) { songs = []; total = 0; drawSongs(); } return; }
    say(null);
    const from = append ? songs.length : 0;
    songs = append ? songs.concat(result.value.items) : [...result.value.items];
    total = result.value.total;
    drawSongs(from);
  }
  function choose(next: Scope) {
    scope = next;
    search.value = '';
    search.setAttribute('aria-label', `Search songs in ${scopeName()}`);
    search.placeholder = `Search ${scopeName()}`;
    songs = []; total = 0; more.hidden = true;
    drawStations(); drawChips();
    void load();
  }
  function drawState(next: RadioState) {
    state = next;
    play.replaceChildren(icon(next.playing ? 'pause' : 'play'));
    play.setAttribute('aria-label', next.playing ? 'Pause' : 'Play');
    shuffle.setAttribute('aria-pressed', String(next.shuffle === true));
    repeat.setAttribute('aria-pressed', String(next.repeat === true));
    /* The volume is not shown until the radio has played, as the page does not say it. */
    volume.disabled = next.volume === null;
    if (next.volume !== null && root.activeElement !== volume) volume.value = String(Math.round(next.volume * 100));
    now.replaceChildren(...(next.track ? [make('b', {}, next.track.title), ` ${next.track.stationName}`] : [next.available ? 'Choose a song to play.' : '']));
    for (const row of Array.from(list.querySelectorAll<HTMLElement>('button.song'))) row.setAttribute('aria-current', String(row.dataset.id === next.track?.id));
  }
  const togglePlay = () => {
    if (state.playing) act(radio.pause());
    else act(scope.station !== 'all' && !state.track ? radio.play({ station: scope.station, ...(scope.genre ? { genre: scope.genre } : {}) }) : radio.play());
  };
  const playSong = (id: string) => act(radio.play({ track: id, ...(scope.genre ? { genre: scope.genre } : {}) }));
  /* Nothing to nudge until the page says the volume, which it does once the radio has played. */
  const nudge = (by: number) => { if (state.volume !== null) act(radio.setVolume(Math.min(1, Math.max(0, state.volume + by)))); };

  const listeners: [EventTarget, string, EventListener][] = [];
  const on = <E extends Event>(target: EventTarget, type: string, handler: (event: E) => void) => {
    target.addEventListener(type, handler as EventListener); listeners.push([target, type, handler as EventListener]);
  };
  on<MouseEvent>(stationList, 'click', event => {
    const id = (event.target as Element).closest<HTMLElement>('button')?.dataset.id;
    if (id && id !== scope.station) choose({ station: id });
  });
  on<MouseEvent>(chips, 'click', event => {
    const button = (event.target as Element).closest<HTMLElement>('button');
    if (button && button.dataset.id !== scope.genre) choose({ station: scope.station, ...(button.dataset.id ? { genre: button.dataset.id } : {}) });
  });
  on<MouseEvent>(list, 'click', event => {
    const button = (event.target as Element).closest<HTMLElement>('button');
    if (button?.dataset.id) { rove(list, 'button', button); playSong(button.dataset.id); }
  });
  on(search, 'input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => void load(), 150); });
  on(more, 'click', () => void load(true));
  on(list, 'scroll', () => { if (!loading && songs.length < total && list.scrollTop + list.clientHeight > list.scrollHeight - 200) void load(true); });
  on(previous, 'click', () => act(radio.previous()));
  on(next, 'click', () => act(radio.next()));
  on(play, 'click', togglePlay);
  on(shuffle, 'click', () => act(radio.setShuffle(!state.shuffle)));
  on(repeat, 'click', () => act(radio.setRepeat(!state.repeat)));
  on(volume, 'input', () => act(radio.setVolume(Number(volume.value) / 100)));
  /* Keys stop here, so a letter typed into the search does not also move the player. */
  for (const type of ['keyup', 'keypress']) on(host, type, event => event.stopPropagation());
  on<KeyboardEvent>(host, 'keydown', event => {
    event.stopPropagation();
    const target = root.activeElement as HTMLElement | null;
    if (target === search) {
      if (event.key === 'Escape' && search.value) { search.value = ''; void load(); event.preventDefault(); }
      else if (event.key === 'ArrowDown') { (list.querySelector<HTMLElement>('button[tabindex="0"]') ?? list.querySelector('button'))?.focus(); event.preventDefault(); }
      return;
    }
    if (target && stationList.contains(target) && moveIn(stationList, 'button', event)) {
      const id = (root.activeElement as HTMLElement | null)?.dataset.id;
      if (id && id !== scope.station) {
        choose({ station: id });
        /* Drawing the list again replaced the button that had focus; the arrows keep moving
           from the new one, and keys stay in the picker (Greptile, 8 Nov 2026). */
        stationList.querySelector<HTMLElement>('[aria-current=true]')?.focus();
      }
      event.preventDefault(); return;
    }
    if (target && list.contains(target) && moveIn(list, 'button', event)) { event.preventDefault(); return; }
    if (options.shortcuts === false || event.altKey || event.ctrlKey || event.metaKey || target === volume) return;
    const key = event.key.toLowerCase();
    const shortcut: Record<string, () => void> = {
      '/': () => search.focus(), n: () => act(radio.next()), p: () => act(radio.previous()),
      s: () => act(radio.setShuffle(!state.shuffle)), r: () => act(radio.setRepeat(!state.repeat)),
      '-': () => nudge(-0.1), '=': () => nudge(0.1), '+': () => nudge(0.1),
      ' ': () => togglePlay(),
    };
    // Space on a button presses that button, as it should.
    if (key === ' ' && target?.tagName === 'BUTTON') return;
    if (shortcut[key]) { shortcut[key](); event.preventDefault(); }
  });

  const unsubscribe = radio.onChange(drawState);
  search.setAttribute('aria-label', 'Search songs in All radios');
  search.placeholder = 'Search All radios';
  drawStations(); drawChips();
  void radio.stations().then(result => {
    if (destroyed) return;
    if (!result.ok) { say(result.error); empty.textContent = ''; more.hidden = true; return; }
    stations = result.value;
    drawStations(); drawChips();
    void load();
  });

  return {
    element: host,
    focus: () => search.focus(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(searchTimer);
      unsubscribe();
      for (const [target, type, handler] of listeners) target.removeEventListener(type, handler);
      host.remove();
    },
  };
}

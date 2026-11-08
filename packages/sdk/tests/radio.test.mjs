import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, limits } from './harness.mjs';

/**
 * og.radio, the game's half of the radio bridge. The page's half, which plays the radio and
 * decides what a game may do, lives with opengame.io and has tests of its own. These
 * hold the SDK to believing only the page it handshook with, to failing cleanly when the
 * page says no or says nothing, and to staying quiet while the page has the game muted.
 */
const station = { id: 'pixel', name: 'OG Pixel Radio', label: 'Pixel', count: 2, palette: ['#000336', '#6114e4', '#56c1e1'],
  genres: [{ id: '16bit', label: '16-bit', count: 1 }, { id: '8bit', label: '8-bit', count: 1 }] };
const song = { id: 'pixel/cartridge-dawn', title: 'Cartridge Dawn', station: 'pixel', stationName: 'OG Pixel Radio', genre: '8bit', genreLabel: '8-bit',
  duration: null, art: null, palette: ['#000336', '#6114e4', '#56c1e1'], attribution: 'Cartridge Dawn, OG Pixel Radio, OpenGame' };
/** The harness runs the SDK in its own realm, so results are compared by value, not prototype. */
const same = (actual, expected, message) => assert.deepEqual({ ...actual }, expected, message);
const flush = () => new Promise(resolve => setImmediate(resolve));
const radioRequests = h => h.messages.filter(message => message.data.type === 'radio');
function hosted(capabilities = ['leaderboards', 'radio']) {
  const h = harness({ full: true });
  h.send({ type: 'session', token: 'grant', capabilities });
  return h;
}
async function lastRequest(h) {
  await flush();
  const request = radioRequests(h).at(-1);
  assert.ok(request, 'a radio request was posted');
  return request;
}

test('the radio is on the injected global and on its client, and offered only when the page says so', async () => {
  const h = hosted();
  assert.equal(h.global.radio, h.global.og.radio);
  assert.equal(h.global.radio.available, true);
  assert.equal(h.global.radio.state.available, true);

  const without = hosted(['leaderboards']);
  assert.equal(without.global.radio.available, false);
  same(await without.global.radio.stations(), { ok: false, error: 'unavailable' });
  assert.equal(radioRequests(without).length, 0, 'a page that did not offer the radio is never asked');
});

test('outside a frame, as in the local mock, the radio is unavailable and asks nobody', async () => {
  const h = harness({ full: true, embedded: false, origin: 'http://localhost:4592' });
  await h.global.og.init();
  assert.equal(h.global.radio.available, false);
  same(await h.global.radio.tracks(), { ok: false, error: 'unavailable' });
  assert.equal(radioRequests(h).length, 0);
});

test('requests go to the parent the session came from, and only its answer, from its window, settles them', async () => {
  const h = hosted();
  const pending = h.global.radio.stations();
  const request = await lastRequest(h);
  assert.equal(request.target, 'https://opengame.io');
  assert.equal(request.data.op, 'stations');
  assert.match(request.data.rid, /^[A-Za-z0-9_-]{1,64}$/);

  const reply = { type: 'radio', rid: request.data.rid, ok: true, value: [station] };
  h.send(reply, h.win.parent, 'https://opengame.gg.evil.example');
  h.send(reply, { postMessage() {} }, 'https://opengame.io');
  h.send({ ...reply, rid: 'someone-else' });
  h.send({ ...reply, og: 2 });
  let settled = false;
  void pending.then(() => { settled = true; });
  await flush();
  assert.equal(settled, false, 'a forged origin, a forged source, another rid and another protocol are all ignored');

  h.send(reply);
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.value[0].label, 'Pixel');
  assert.equal(Object.isFrozen(result.value[0]), true);
});

test('an answer that does not have the promised shape is refused rather than handed to the game', async () => {
  const h = hosted();
  const stations = h.global.radio.stations();
  const asked = await lastRequest(h);
  h.send({ type: 'radio', rid: asked.data.rid, ok: true, value: [{ ...station, count: -1 }] });
  same(await stations, { ok: false, error: 'invalid_response' });

  const page = h.global.radio.tracks({ station: 'pixel' });
  const pageAsked = await lastRequest(h);
  h.send({ type: 'radio', rid: pageAsked.data.rid, ok: true, value: { items: [{ ...song, palette: 'red' }], total: 1, offset: 0 } });
  same(await page, { ok: false, error: 'invalid_response' });

  const refused = h.global.radio.tracks({ station: 'pixel' });
  const refusedAsked = await lastRequest(h);
  h.send({ type: 'radio', rid: refusedAsked.data.rid, ok: false, error: '<img src=x>' });
  same(await refused, { ok: false, error: 'invalid_response' }, 'an error code is a code, or nothing');
});

test('tracks sends only the scope, the search and the page, and checks them first', async () => {
  const h = hosted();
  same(await h.global.radio.tracks({ station: 'all', genre: '8bit' }), { ok: false, error: 'invalid_request' }, 'a genre belongs to a station');
  same(await h.global.radio.tracks({ q: 'x'.repeat(limits.platform.sdk.radio.queryCharsMax + 1) }), { ok: false, error: 'invalid_request' });
  same(await h.global.radio.tracks({ offset: -1 }), { ok: false, error: 'invalid_request' });
  same(await h.global.radio.tracks({ offset: limits.platform.sdk.radio.offsetMax + 1 }), { ok: false, error: 'invalid_request' });
  same(await h.global.radio.tracks({ station: 'Pixel' }), { ok: false, error: 'invalid_request' }, 'ids are lowercase slugs');
  for (const target of [{ track: 'foo' }, { track: 'pixel/Zap' }, { station: 'all' }, { genre: '8bit' }, { track: 'https://evil.example/x.mp3' }]) {
    same(await h.global.radio.play(target), { ok: false, error: 'invalid_request' }, `${JSON.stringify(target)} is refused at once, not left to time out`);
  }
  assert.equal(radioRequests(h).length, 0);

  const pending = h.global.radio.tracks({ station: 'pixel', genre: '8bit', q: 'dawn', limit: 10_000 });
  const request = await lastRequest(h);
  assert.deepEqual(Object.keys(request.data).sort(), ['genre', 'limit', 'og', 'op', 'q', 'rid', 'station', 'type']);
  assert.equal(request.data.limit, limits.platform.sdk.radio.tracksPageMax, 'a page is never asked for past the cap');
  h.send({ type: 'radio', rid: request.data.rid, ok: true, value: { items: [song], total: 1, offset: 0 } });
  const result = await pending;
  assert.equal(result.value.items[0].id, 'pixel/cartridge-dawn');
  assert.equal(result.value.total, 1);
});

test('while the page has the game muted, nothing that makes sound is even asked, and turning it down still is', async () => {
  const h = hosted();
  h.send({ type: 'radio-state', state: { playing: false, loading: false, shuffle: true, repeat: false, volume: 0.5, station: null, genre: null, track: null, position: null, duration: null } });
  h.send({ type: 'mute', muted: true });
  for (const call of [() => h.global.radio.play(), () => h.global.radio.play({ track: song.id }), () => h.global.radio.next(),
    () => h.global.radio.previous(), () => h.global.radio.setShuffle(false), () => h.global.radio.setRepeat(true), () => h.global.radio.setVolume(0.9)]) {
    same(await call(), { ok: false, error: 'muted' });
  }
  assert.equal(radioRequests(h).length, 0, 'the page never hears a request to make sound from a muted game');

  const quieter = h.global.radio.setVolume(0.2);
  const down = await lastRequest(h);
  assert.deepEqual([down.data.op, down.data.level], ['volume', 0.2]);
  h.send({ type: 'radio', rid: down.data.rid, ok: true, value: null });
  same(await quieter, { ok: true, value: undefined });

  const pause = h.global.radio.pause();
  const paused = await lastRequest(h);
  assert.equal(paused.data.op, 'pause');
  h.send({ type: 'radio', rid: paused.data.rid, ok: true, value: null });
  assert.equal((await pause).ok, true);

  h.send({ type: 'mute', muted: false });
  const play = h.global.radio.play({ track: song.id, genre: '8bit' });
  const asked = await lastRequest(h);
  assert.deepEqual([asked.data.op, asked.data.track, asked.data.genre], ['play', song.id, '8bit']);
  h.send({ type: 'radio', rid: asked.data.rid, ok: false, error: 'gesture_required' });
  same(await play, { ok: false, error: 'gesture_required' }, "the page's refusal reaches the game as it was given");
});

test('now playing comes only from the trusted page, is read field by field, and reaches every listener', async () => {
  const h = hosted();
  const seen = [];
  const stop = h.global.radio.onChange(state => seen.push(state));
  const state = { playing: true, loading: false, shuffle: true, repeat: false, volume: 0.3, station: 'pixel', genre: '8bit', track: song, position: 12, duration: 120 };
  h.send({ type: 'radio-state', state }, { postMessage() {} });
  h.send({ type: 'radio-state', state }, h.win.parent, 'https://evil.example');
  h.send({ type: 'radio-state', state: { ...state, volume: 7 } });
  assert.equal(seen.length, 1, 'only the call at subscription, before anything trusted and well formed arrived');
  h.send({ type: 'radio-state', state });
  assert.equal(seen.length, 2);
  h.send({ type: 'radio-state', state: { ...state, station: null, genre: null, track: null, volume: null, position: null, duration: null } });
  assert.equal(seen.length, 3, 'before the radio has played, the page names no station, song or volume, and that is a valid state');
  assert.equal(h.global.radio.state.volume, null);
  h.send({ type: 'radio-state', state });
  assert.equal(seen.length, 4);
  assert.equal(h.global.radio.state.track.title, 'Cartridge Dawn');
  assert.equal(h.global.radio.state.playing, true);
  stop();
  h.send({ type: 'radio-state', state: { ...state, playing: false } });
  assert.equal(seen.length, 4);

  h.send({ type: 'session', token: 'grant', capabilities: ['leaderboards'] });
  assert.equal(h.global.radio.available, false);
  assert.equal(h.global.radio.state.track, null, 'a page that withdraws the radio leaves nothing of it behind');
});

test('a page that never answers times out, and withdrawing the radio settles what was waiting', async () => {
  const h = hosted();
  const waiting = h.global.radio.stations();
  await flush();
  h.advance(limits.platform.sdk.radio.requestTimeoutMs);
  same(await waiting, { ok: false, error: 'timeout' });

  const again = h.global.radio.stations();
  await flush();
  h.send({ type: 'session', token: 'grant', capabilities: [] });
  same(await again, { ok: false, error: 'unavailable' });
});

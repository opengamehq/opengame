import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBridge } from '../dist/bridge.js';
import { harness, limits } from './harness.mjs';

function fixture() {
  const calls = [], callbacks = {}, events = [];
  const player = { id: 'game-specific-id', handle: null, ogNumber: null, signedIn: false, avatar: null };
  const ok = value => ({ ok: true, value });
  const listen = key => fn => { callbacks[key] = fn; fn(key === 'player' ? player : false); return () => {}; };
  const client = {
    env: { sdkVersion: 'test', embedded: false, connected: false, preview: false, capabilities: [] },
    player: { ...player, onChange: listen('player'), requestSignIn: () => { calls.push(['signIn']); return ok(null); } },
    onPause: listen('pause'), audio: { onHostMute: listen('mute') },
    fullscreen: { onChange: listen('fullscreen'), request: () => { calls.push(['fullscreen']); return ok(null); } },
    init: async options => { calls.push(['init', options]); return client.env; },
    ready: () => calls.push(['ready']), track: (...args) => { calls.push(['track', ...args]); return ok(null); },
    openLink: async url => { calls.push(['openLink', url]); return ok(null); },
    leaderboard: key => Object.fromEntries(['submit', 'top', 'me', 'around'].map(method => [method, async (...args) => {
      calls.push([`board.${method}`, key, ...args]); return ok(method);
    }])),
    achievements: {
      unlock: async id => { calls.push(['achievements.unlock', id]); return ok({ achievementId: id, unlocked: true }); },
      list: async (...args) => { calls.push(['achievements.list', ...args]); return ok([]); },
    },
  };
  const bridge = createBridge(client);
  bridge.setHandler((kind, id, name, json, bytes) => events.push({ kind, id, name, value: JSON.parse(json), bytes }));
  const request = async (op, args = {}) => {
    const id = bridge.request(op, JSON.stringify(args));
    assert.ok(!events.some(event => event.kind === 'result' && event.id === id), 'results cannot overtake the returned id');
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const result = events.find(event => event.kind === 'result' && event.id === id);
    assert.ok(result, `result for ${op}`); return result;
  };
  return { client, calls, events, callbacks, bridge, request };
}


test('achievement operations reach the client the JavaScript global uses, with the id unchanged', async () => {
  const f = fixture();
  const unlocked = (await f.request('achievements.unlock', { id: 'first_win' })).value;
  assert.deepEqual(unlocked, { ok: true, value: { achievementId: 'first_win', unlocked: true } });
  assert.deepEqual(f.calls.at(-1), ['achievements.unlock', 'first_win']);
  assert.deepEqual((await f.request('achievements.list')).value, { ok: true, value: [] });
  // list takes nothing: arguments a native caller sends anyway are not forwarded.
  assert.deepEqual(f.calls.at(-1), ['achievements.list']);
  // A malformed id that is still a string is the core's to refuse, so the native
  // answer is the same invalid_achievement a JavaScript caller gets.
  f.client.achievements.unlock = async id => { f.calls.push(['achievements.unlock', id]); return { ok: false, error: 'invalid_achievement' }; };
  assert.deepEqual((await f.request('achievements.unlock', { id: 'Not An Id' })).value, { ok: false, error: 'invalid_achievement' });
  assert.deepEqual(f.calls.at(-1), ['achievements.unlock', 'Not An Id']);
});


test('a thrown code the SDK does not catalogue reaches a native game as invalid_request, never as itself', async () => {
  const f = fixture();
  f.client.track = () => { throw Object.assign(new Error('internal'), { code: 'ERR_INTERNAL_DETAIL' }); };
  assert.deepEqual((await f.request('track', { name: 'level_up' })).value, { ok: false, error: 'invalid_request' });
  // A catalogued one keeps its code and the catalogue's hint.
  f.client.track = () => { throw Object.assign(new Error('gone'), { code: 'disposed' }); };
  const known = (await f.request('track', { name: 'level_up' })).value;
  assert.equal(known.error, 'disposed');
  assert.match(known.reason, /dispose/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../dist/bridge.js';
import { harness } from './harness.mjs';

const page = 'https://opengame.io/g/x7v3bsunz6';
async function hosted(session) {
  const h = harness();
  const ready = h.og.init();
  h.send({ type: 'session', token: 'grant', capabilities: ['analytics'], ...session });
  await ready;
  return h;
}

test('an invite is the game page with ?join=, and the code a player arrived with is read back', async () => {
  const h = await hosted({ page, join: 'QWERTY' });
  assert.equal(h.og.invite.code, 'QWERTY');
  assert.equal(h.og.invite.link('K7P2M9XA'), `${page}?join=K7P2M9XA`);
  assert.equal(h.og.invite.link('aBcD_efG-hIJklMnOPqr12'), `${page}?join=aBcD_efG-hIJklMnOPqr12`);
});

test('no code means null, and a code the page would change gets no link', async () => {
  const h = await hosted({ page });
  assert.equal(h.og.invite.code, null);
  for (const code of ['qwerty', 'AB-CD', 'ABC', 'A'.repeat(13), '', 42]) assert.equal(h.og.invite.link(code), null);
});

test('a page on another origin, or not a game page, is not an invite page', async () => {
  // Studio names its session page, which a friend cannot open: not an invite page either.
  for (const other of ['https://evil.example/g/x7v3bsunz6', 'https://game.opengame.gg/', 'https://opengame.io/studio/abc', 'https://opengame.io/games', 'https://opengame.io/g/x/y', 'javascript:alert(1)', 42, null]) {
    const h = await hosted({ page: other, join: 'QWERTY' });
    assert.equal(h.og.invite.link('QWERTY'), null, String(other));
    h.og.dispose();
  }
});

test('a malformed join is dropped, and a message from an untrusted sender changes nothing', async () => {
  const h = await hosted({ page, join: 'x'.repeat(30) });
  assert.equal(h.og.invite.code, null);
  h.send({ type: 'session', token: 'grant', capabilities: ['analytics'], page: 'https://evil.example/', join: 'EVILONE' }, h.win.parent, 'https://evil.example');
  h.send({ type: 'session', token: 'grant', capabilities: ['analytics'], page: 'https://evil.example/', join: 'EVILONE' }, {}, 'https://opengame.io');
  assert.equal(h.og.invite.code, null);
  assert.equal(h.og.invite.link('QWERTY'), `${page}?join=QWERTY`);
});

test('before the session, outside OpenGame, there is no link', () => {
  const h = harness();
  assert.equal(h.og.invite.code, null);
  assert.equal(h.og.invite.link('QWERTY'), null);
});

test('the local mock reads ?join= from its own page and links back to it', async () => {
  const h = harness({ embedded: false, origin: 'http://localhost:4592/game/?join=ab12cd&og-dev-player=guest#menu' });
  await h.og.init();
  assert.equal(h.og.invite.code, 'AB12CD');
  // With the other id's dev player, so the second tab is a different player.
  assert.equal(h.og.invite.link('ZZZZZZ'), 'http://localhost:4592/game/?join=ZZZZZZ&og-dev-player=signed-in');
  const second = harness({ embedded: false, origin: h.og.invite.link('ZZZZZZ') });
  await second.og.init();
  assert.equal(second.og.invite.code, 'ZZZZZZ');
  assert.notEqual(second.og.player.id, h.og.player.id);
  assert.equal(second.og.invite.link('ZZZZZZ'), 'http://localhost:4592/game/?join=ZZZZZZ&og-dev-player=guest');
});

test('a local guest who signs in invites a guest, not the player they now are', async () => {
  const h = harness({ embedded: false, origin: 'http://localhost:4592/game/' });
  await h.og.init();
  assert.equal(h.og.invite.link('ZZZZZZ'), 'http://localhost:4592/game/?og-dev-player=signed-in&join=ZZZZZZ');
  await h.og.player.requestSignIn();
  assert.equal(h.og.player.signedIn, true);
  assert.equal(h.og.invite.link('ZZZZZZ'), 'http://localhost:4592/game/?og-dev-player=guest&join=ZZZZZZ');
});

test('native engines read the same code and link through the bridge', async () => {
  const links = [];
  const client = {
    env: { sdkVersion: 'test' }, player: { onChange: () => () => {} }, onPause: () => () => {},
    audio: { onHostMute: () => () => {} }, fullscreen: { onChange: () => () => {} },
    invite: { code: 'QWERTY', link: code => { links.push(code); return code === 'QWERTY' ? `${page}?join=QWERTY` : null; } },
  };
  const bridge = createBridge(client), results = new Map();
  bridge.setHandler((kind, id, name, json) => { if (kind === 'result') results.set(id, JSON.parse(json)); });
  const ask = async (op, args) => { const id = bridge.request(op, JSON.stringify(args)); for (let i = 0; i < 8; i++) await Promise.resolve(); return results.get(id); };
  assert.deepEqual(await ask('invite.code', {}), { ok: true, value: 'QWERTY' });
  assert.deepEqual(await ask('invite.link', { code: 'QWERTY' }), { ok: true, value: `${page}?join=QWERTY` });
  assert.deepEqual(await ask('invite.link', { code: 'nope' }), { ok: true, value: null });
  assert.deepEqual(await ask('invite.link', { code: 7 }), { ok: false, error: 'invalid_request' });
  assert.deepEqual(links, ['QWERTY', 'nope']);
});

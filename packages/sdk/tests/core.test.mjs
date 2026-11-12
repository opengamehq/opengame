import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, limits } from './harness.mjs';

test('startup events use the bounded SDK queue and wait for an explicit analytics grant', async () => {
  const h = harness({ fetcher: async (_url, init) => Response.json({ accepted: JSON.parse(init.body).events.length }) });
  h.og.init();
  assert.equal(h.og.track('level_start', { level: 1 }).ok, true);
  h.fire('pagehide'); assert.equal(h.calls.length, 0);
  h.send({ type: 'session', token: 'startup-grant', capabilities: ['analytics'] });
  h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls[0].init.headers.Authorization, 'Bearer startup-grant');
  assert.equal(JSON.parse(h.calls[0].init.body).events[0].name, 'level_start');
  h.og.dispose();

  const denied = harness(); denied.og.init();
  denied.og.track('must_discard');
  denied.send({ type: 'session', token: 'denied-grant', capabilities: [] });
  denied.fire('pagehide'); assert.equal(denied.calls.length, 0);
  assert.equal(denied.og.track('still_denied').error, 'unavailable');
  denied.send({ type: 'session', token: 'later-grant', capabilities: ['analytics'] });
  denied.fire('pagehide'); assert.equal(denied.calls.length, 0, 'denied startup events cannot resurface later');
  denied.og.dispose();
});

test('ready survives a null-token grant followed by denial and a real grant', async () => {
  const h = harness({ fetcher: async (_url, init) => Response.json({ accepted: JSON.parse(init.body).events.length }) });
  h.og.init();
  h.send({ type: 'session', token: null, capabilities: ['analytics'] }); h.og.ready();
  h.send({ type: 'session', token: null, capabilities: [] });
  h.send({ type: 'session', token: 'real-grant', capabilities: ['analytics'] });
  h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(h.calls[0].init.body).events.map(event => event.name), ['sdk_ready', 'attention_coverage']);
  h.og.dispose();
});

test('runtime health samples frame cadence and heap, pauses hidden windows, and removes collectors', async () => {
  const events = [];
  const h = harness({ sampled: true, fetcher: async (_url, init) => {
    const batch = JSON.parse(init.body).events; events.push(...batch);
    return Response.json({ accepted: batch.length });
  } });
  h.og.init();
  h.send({ type: 'session', token: 'health-session', capabilities: ['analytics'] });
  assert.equal(h.frames.size, 0, 'no measurement before playable');
  h.og.ready();
  for (let at = 0; at <= limits.analytics.runtime.sampleWindowMs; at += 20) h.frame(at);
  h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  const sample = events.find(event => event.name === 'runtime_performance');
  assert.equal(sample.props.fps, 50);
  assert.equal(sample.props.heap_mb, 32);
  assert.equal(sample.props.sample_rate, limits.analytics.runtime.sampleRate);
  h.win.document.visibilityState = 'hidden'; h.fire('visibilitychange');
  h.advance(limits.analytics.runtime.sampleIntervalMs);
  assert.equal(h.frames.size, 0, 'hidden windows do not start a sample');
  h.og.dispose();
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.get('error').size, 0);
});

test('attention coverage starts at playable authorized input and follows session changes', async () => {
  const batches = [];
  const h = harness({ fetcher: async (_url, init) => {
    const events = JSON.parse(init.body).events;
    batches.push({ token: init.headers.Authorization, events });
    return Response.json({ accepted: events.length });
  } });
  h.og.init();
  h.fire('pointerdown', { isTrusted: true });
  h.send({ type: 'session', token: 'attention-a', capabilities: ['analytics'], held: true });
  h.og.ready();
  h.fire('keydown', { isTrusted: true }); h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(batches.flatMap(batch => batch.events).some(event => event.name === 'attention_coverage' || event.name === 'first_input'), false);
  h.send({ type: 'play' });
  let stoppedTargets = 0;
  for (const type of ['pointerdown', 'keydown']) h.fireFromTarget(type, event => { stoppedTargets++; event.stopPropagation(); }, { isTrusted: true });
  h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  const first = batches.flatMap(batch => batch.events);
  assert.deepEqual(first.filter(event => event.name === 'attention_coverage').map(event => event.props), [{ result: 'sdk_v1' }]);
  assert.equal(first.filter(event => event.name === 'first_input').length, 1);
  assert.equal(stoppedTargets, 2, 'both controls stop propagation after the SDK capture listener');
  h.send({ type: 'session', token: 'attention-b', capabilities: ['analytics'] });
  h.fire('keydown', { isTrusted: true }); h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  const second = batches.filter(batch => batch.token === 'Bearer attention-b').flatMap(batch => batch.events);
  assert.equal(second.filter(event => event.name === 'attention_coverage').length, 1);
  assert.equal(second.filter(event => event.name === 'first_input').length, 1);
  h.og.dispose();
  assert.equal(h.listeners.get('pointerdown').size, 0);
  assert.equal(h.listeners.get('keydown').size, 0);
});

test('reserved host coverage is rejected locally and a terminal mixed acknowledgement leaves appended events queued', async () => {
  const replies = [];
  const h = harness({ fetcher: async () => new Promise(resolve => replies.push(resolve)) });
  h.og.init(); h.send({ type: 'session', token: 'mixed-ack', capabilities: ['analytics'] });
  for (const props of [{ result: 'host_v1' }, { result: 'sdk_v2' }, {}]) {
    assert.equal(h.og.track('attention_coverage', props).error, 'invalid_event');
  }
  h.og.track('before_one'); h.og.track('before_two'); h.fire('pagehide');
  const original = JSON.parse(h.calls[0].init.body).events;
  assert.deepEqual(original.map(event => event.name), ['before_one', 'before_two']);
  h.og.track('appended');
  replies[0](Response.json({ accepted: 1, refused: 1, limited: 0 }));
  await new Promise(resolve => setImmediate(resolve));
  h.fire('pagehide');
  const remaining = JSON.parse(h.calls[1].init.body).events;
  assert.deepEqual(remaining.map(event => event.name), ['appended']);
  assert.equal(original.some(event => event.eventId === remaining[0].eventId), false);
  replies[1](Response.json({ accepted: 1 }));
  await new Promise(resolve => setImmediate(resolve));
  h.fire('pagehide'); assert.equal(h.calls.length, 2);
  h.og.dispose();
});

test('ambiguous or partial mixed acknowledgements retain the exact original event IDs', async () => {
  for (const response of [
    { accepted: 0, refused: 1, limited: 1 }, { accepted: 1, refused: 1, limited: 1 },
    { accepted: -1, refused: 3, limited: 0 }, { accepted: 1.5, refused: 0.5, limited: 0 },
    { accepted: 1, refused: -1, limited: 0 }, { accepted: 1, refused: 2, limited: 0 },
    { accepted: 1, refused: 1 }, { accepted: 1, refused: null, limited: 0 },
    { accepted: 1, refused: false, limited: 0 },
  ]) {
    let attempt = 0;
    const h = harness({ fetcher: async () => Response.json(attempt++ === 0 ? response : { accepted: 2 }) });
    h.og.init(); h.send({ type: 'session', token: 'partial-ack', capabilities: ['analytics'] });
    h.og.track('first'); h.og.track('second'); h.fire('pagehide');
    const original = JSON.parse(h.calls[0].init.body).events;
    await new Promise(resolve => setImmediate(resolve));
    h.fire('pagehide');
    assert.deepEqual(JSON.parse(h.calls[1].init.body).events, original);
    await new Promise(resolve => setImmediate(resolve));
    h.og.dispose();
  }
});

test('browsers without heap measurements leave the heap property absent', async () => {
  for (const memory of [undefined, { usedJSHeapSize: NaN }, { usedJSHeapSize: Infinity }, { usedJSHeapSize: -1 }]) {
    const events = [];
    const h = harness({ sampled: true, fetcher: async (_url, init) => {
      const batch = JSON.parse(init.body).events; events.push(...batch);
      return Response.json({ accepted: batch.length });
    } });
    h.win.performance.memory = memory;
    h.og.init(); h.send({ type: 'session', token: 'heap-missing', capabilities: ['analytics'] }); h.og.ready();
    for (let at = 0; at <= limits.analytics.runtime.sampleWindowMs; at += 20) h.frame(at);
    h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
    const sample = events.find(event => event.name === 'runtime_performance');
    assert.ok(sample);
    assert.equal(Object.hasOwn(sample.props, 'heap_mb'), false);
    h.og.dispose();
  }
});

test('held and hidden startup begin health sampling when Play resumes without another session', () => {
  const h = harness({ sampled: true });
  h.win.document.visibilityState = 'hidden';
  h.og.init();
  h.send({ type: 'session', token: 'held-health', held: true, capabilities: ['analytics'] });
  h.og.ready();
  assert.equal(h.frames.size, 0);
  h.win.document.visibilityState = 'visible'; h.fire('visibilitychange');
  assert.equal(h.frames.size, 0, 'still held by the poster');
  h.send({ type: 'play' });
  assert.equal(h.frames.size, 1, 'Play starts the sampler with the existing session');
  h.og.dispose(); assert.equal(h.frames.size, 0);
});

test('a hidden interval is discarded from an in-progress performance window', async () => {
  const events = [];
  const h = harness({ sampled: true, fetcher: async (_url, init) => {
    const batch = JSON.parse(init.body).events; events.push(...batch);
    return Response.json({ accepted: batch.length });
  } });
  h.og.init(); h.send({ type: 'session', token: 'visible-health', capabilities: ['analytics'] }); h.og.ready();
  h.frame(0); h.frame(20);
  h.win.document.visibilityState = 'hidden'; h.fire('visibilitychange');
  assert.equal(h.frames.size, 0);
  h.win.document.visibilityState = 'visible'; h.fire('visibilitychange');
  for (let at = 100000; at <= 100000 + limits.analytics.runtime.sampleWindowMs; at += 20) h.frame(at);
  h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.find(event => event.name === 'runtime_performance').props.fps, 50);
});

test('credential revocation cannot assign waiting events to an outstanding previous-account batch', async () => {
  let finish;
  const h = harness({ fetcher: async () => new Promise(resolve => { finish = resolve; }) });
  h.og.init(); h.send({ type: 'session', token: 'account-a', capabilities: ['analytics'] });
  h.og.track('before'); h.fire('pagehide');
  h.og.track('tail_a');
  h.send({ type: 'session', token: null, capabilities: ['analytics'] });
  assert.equal(h.og.track('between').error, 'unavailable'); h.fire('pagehide');
  assert.equal(h.calls.length, 1);
  assert.deepEqual(JSON.parse(h.calls[0].init.body).events.map(event => event.name), ['before']);
  finish(Response.json({ accepted: 1 })); await new Promise(resolve => setImmediate(resolve));
  h.fire('pagehide');
  assert.deepEqual(JSON.parse(h.calls[1].init.body).events.map(event => event.name), ['tail_a']);
  finish(Response.json({ accepted: 1 })); await new Promise(resolve => setImmediate(resolve));
  h.fire('pagehide'); assert.equal(h.calls.length, 2, 'revoked-gap observations were not admitted');
  h.send({ type: 'session', token: 'account-b', capabilities: ['analytics'] });
  h.og.track('after'); h.fire('pagehide');
  assert.equal(h.calls[2].init.headers.Authorization, 'Bearer account-b');
  assert.deepEqual(JSON.parse(h.calls[2].init.body).events.map(event => event.name), ['after']);
  finish(Response.json({ accepted: 1 })); await new Promise(resolve => setImmediate(resolve));
  h.og.dispose();
});

test('startup diagnostics wait for a session and carry fixed categories without private text', async () => {
  const events = [];
  const h = harness({ fetcher: async (_url, init) => {
    const batch = JSON.parse(init.body).events; events.push(...batch);
    return Response.json({ accepted: batch.length });
  } });
  h.og.init();
  h.fire('error', { type: 'error', target: h.win, filename: '/private/token-secret.js',
    error: { name: 'TypeError', message: 'player@example.com', stack: 'secret stack' } });
  assert.equal(h.calls.length, 0);
  h.send({ type: 'session', token: 'health-session', capabilities: ['analytics'] });
  h.fire('pagehide'); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events[0].props, { result: 'type_error', step: 'exception' });
  assert.doesNotMatch(JSON.stringify(events), /private|secret|example/);
  assert.equal(h.og.track('runtime_performance', { fps: '50', heap_mb: -1, sample_rate: 2 }).error, 'invalid_event');
  h.og.dispose();
});
test('import has no listeners or timers; standalone init resolves without a four-second wait', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ embedded: false, origin: 'http://localhost:4592' });
  assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  const a = h.og.init(), b = h.og.init(); assert.equal(a, b);
  const env = await a;
  assert.equal(env.embedded, false); assert.equal(env.connected, false); assert.equal(h.og.player.id, 'dev-guest');
  assert.equal(h.og.player.handle, null, 'a local guest has no handle, as a hosted guest has none');
  assert.equal(h.timers.size, 0); assert.equal(h.messages.length, 0);
  // No credential: a game has no server of its own to show one to, and the token is a bearer.
  assert.deepEqual(Object.keys(h.og.player), ['id', 'handle', 'ogNumber', 'signedIn', 'avatar', 'onChange', 'stats', 'requestSignIn']);
  h.og.ready(); h.og.ready();
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].target, h.win.location.origin);
  assert.equal(h.messages[0].data.phase, 'playable');
  h.og.dispose(); assert.equal(h.listeners.get('visibilitychange').size, 0);
});
test('only the exact parent origin and window may negotiate; ready marks the playable phase once', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); const initialization = h.og.init();
  assert.equal(h.messages[0].data.phase, 'init'); assert.equal(h.messages[0].target, 'https://opengame.io');
  for (const [source, origin] of [[{}, 'https://opengame.io'], [h.win.parent, 'https://opengame.io.evil.test'], [h.win.parent, 'http://localhost:4590']]) {
    h.send({ type: 'session', token: 'test-only', capabilities: ['identity'] }, source, origin);
    assert.equal(h.og.env.connected, false);
  }
  const updates = []; h.og.player.onChange(player => updates.push(player));
  h.send({ type: 'session', token: 'test-only', player: { id: 'per-game', handle: 'orbit', ogNumber: 42, signedIn: true }, capabilities: ['identity', 'analytics', 'unknown'] });
  assert.equal((await initialization).connected, true);
  assert.equal(h.og.player.handle, 'orbit'); assert.equal(updates.length, 2);
  assert.equal('credential' in h.og.player, false, 'the session token stays inside the SDK');
  assert.deepEqual(Array.from(h.og.capabilities), ['identity', 'analytics']);
  h.og.ready(); h.og.ready(); assert.equal(h.messages.filter(m => m.data.phase === 'playable').length, 1);
  assert.ok(h.messages[0].data.sdk);
  assert.equal(h.og.player.requestSignIn().ok, true);
  assert.equal(h.messages.at(-1).data.type, 'sign-in');
  h.og.dispose(); assert.equal(h.timers.size, 0);
});
test('private previews require offered multiplayer and a second allowed origin cannot replace the parent', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ origin: `https://p-${'a'.repeat(52)}.opengame.gg` }); h.og.init();
  h.send({ type: 'session', token: 'test-only', capabilities: ['leaderboards'] });
  assert.equal(h.og.env.preview, true); assert.deepEqual(Array.from(h.og.capabilities), ['leaderboards']);
  h.send({ type: 'session', token: 'other', capabilities: ['identity'] }, h.win.parent, 'https://admin.opengame.io');
  assert.deepEqual(Array.from(h.og.capabilities), ['leaderboards']); h.og.dispose();
});
test('loopback exceptions require a loopback game, including no-referrer development frames', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ origin: 'http://localhost:4592', referrer: '' }); const done = h.og.init();
  assert.ok(h.messages.some(m => m.target === 'http://localhost:4590'));
  h.send({ type: 'session', token: null }, h.win.parent, 'http://localhost:4590');
  assert.equal((await done).connected, true);
  assert.equal(h.trustedParent('http://localhost:4590', 'https://game.opengame.gg'), false);
  assert.equal(h.trustedParent('http://localhost.evil.test:4590', 'http://localhost:4592'), false);
  assert.equal(h.trustedParent('http://127.0.0.1:4590', 'http://[::1]:4592'), true);
  assert.equal(h.trustedParent('null', 'http://localhost:4592'), false); h.og.dispose();
});
test('the handshake has a fixed deadline and dispose settles a pending initialization', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); const done = h.og.init();
  const deadline = [...h.timers.values()].find(timer => !timer.interval);
  assert.equal(deadline.delay, limits.platform.sdk.handshakeTimeoutMs); deadline.fn();
  assert.equal((await done).connected, false); h.og.dispose();
  const next = harness(); const pending = next.og.init(); next.og.dispose();
  assert.equal((await pending).connected, false); assert.equal(next.timers.size, 0);
});
test('pause combines visibility with the host, and broken callbacks do not break other listeners', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init(); const pauses = [], muted = [], full = [];
  h.og.onPause(() => { throw Error('game callback'); }); const off = h.og.onPause(value => pauses.push(value));
  h.og.audio.onHostMute(value => muted.push(value)); h.og.fullscreen.onChange(value => full.push(value));
  h.send({ type: 'activity', active: false });
  h.win.document.visibilityState = 'hidden'; h.fire('visibilitychange');
  h.send({ type: 'activity', active: true });
  assert.deepEqual(pauses, [false, true]);
  h.win.document.visibilityState = 'visible'; h.fire('visibilitychange');
  assert.deepEqual(pauses, [false, true, false]); off();
  h.send({ type: 'mute', muted: true }); h.send({ type: 'mute', muted: 'false' });
  h.send({ type: 'fullscreen', active: true });
  assert.deepEqual(muted, [false, true]); assert.deepEqual(full, [false, true]);
  assert.equal(h.og.audio.muted, true); assert.equal(h.og.fullscreen.active, true); h.og.dispose();
});
test('events are bounded, allowlisted and sent to the events API, never through the page budget', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const requests = [];
  const h = harness({ fetcher: async (url, init) => { requests.push({ url: String(url), init }); return Response.json({ accepted: JSON.parse(init.body).events.length }, { status: 202 }); } });
  h.og.init(); h.send({ type: 'session', token: 'test-only-private', capabilities: ['analytics', 'multiplayer'] });
  assert.equal(h.og.track('level_done', { level: 2, mode: 'person@example.com@', score: '123456789012', email: 'must-not-leave', token: 'must-not-leave' }).ok, true);
  assert.equal(h.og.track('Invalid name').ok, false);
  for (let n = 1; n < limits.platform.sdk.eventsPerSessionPerMinute; n++) assert.equal(h.og.track('jump').ok, true);
  assert.equal(h.og.track('jump').error, 'rate_limited');
  assert.equal(requests.length, 0, 'admission waits for the bounded flush cadence');
  h.fire('pagehide');
  assert.equal(requests.length, 1, 'one batch per flush');
  const [{ url, init }] = requests;
  assert.equal(url, `${limits.allowedGameOrigins.api}/v1/events`);
  assert.equal(init.headers.Authorization, 'Bearer test-only-private');
  assert.equal(init.credentials, 'omit'); assert.equal(init.keepalive, true);
  const body = JSON.parse(init.body);
  assert.equal(body.events.length, Math.min(limits.platform.sdk.eventsPerSessionPerMinute, limits.analytics.batchEventsMax));
  assert.deepEqual(Object.keys(body.events[0].props), ['level']);
  // Nothing analytics does may reach the parent, whose message budget lobby tickets need.
  assert.equal(h.messages.filter(m => m.data.type === 'event').length, 0);
  assert.equal(JSON.stringify(h.messages).includes('test-only-private'), false);
  h.og.dispose(); assert.equal(requests.length, 1);
});

test('events wait for a session and the local mock validates them without a network', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const requests = [];
  const h = harness({ fetcher: async (url, init) => { requests.push({ url: String(url), init }); return Response.json({ accepted: JSON.parse(init.body).events.length }, { status: 202 }); } });
  h.og.init(); h.send({ type: 'session', token: null, capabilities: ['analytics'] });
  assert.equal(h.og.track('wave_cleared', { level: 3 }).ok, true);
  h.fire('pagehide'); assert.equal(requests.length, 0, 'no session, no request');
  h.send({ type: 'session', token: 'later-session', capabilities: ['analytics'] });
  h.fire('pagehide'); assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].init.body).events[0].name, 'wave_cleared'); h.og.dispose();
  const local = harness({ embedded: false, origin: 'http://localhost:4592' }); await local.og.init();
  assert.ok(local.og.capabilities.includes('analytics'));
  assert.equal(local.og.track('Bad Name').error, 'invalid_event');
  assert.equal(local.og.track('wave_cleared', { level: 3 }).ok, true);
  [...local.timers.values()].find(t => t.interval).fn();
  assert.equal(local.calls.length, 0); local.og.dispose(); assert.equal(local.timers.size, 0);
});

test('the local mock can be a guest, a signed-in player or an account without a handle', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  for (const [kind, expected] of [['guest', { id: 'dev-guest', handle: null, signedIn: false }], ['signed-in', { id: 'dev-account', handle: 'dev', signedIn: true }], ['no-handle', { id: 'dev-account', handle: null, signedIn: true }]]) {
    const option = harness({ embedded: false, origin: 'http://localhost:4592' }); await option.og.init({ dev: { player: kind } });
    assert.deepEqual({ id: option.og.player.id, handle: option.og.player.handle, signedIn: option.og.player.signedIn }, expected); option.og.dispose();
    const query = harness({ embedded: false, origin: `http://localhost:4592/game/?og-dev-player=${kind}` }); await query.og.init();
    assert.equal(query.og.player.id, expected.id); query.og.dispose();
  }
  const h = harness({ embedded: false, origin: 'http://localhost:4592' }); await h.og.init();
  const seen = []; h.og.player.onChange(player => seen.push(player.signedIn));
  assert.equal(h.og.player.requestSignIn().ok, true);
  assert.deepEqual(seen, [false, true]); assert.equal(h.og.player.handle, 'dev');
  assert.equal(h.messages.filter(m => m.data.type === 'sign-in').length, 0); h.og.dispose();
});

test('a trusted pending notice stops the init probe so the ready budget survives', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  const probe = [...h.timers.values()].find(t => t.interval && t.delay === limits.platform.sdk.handshakeRetryMs);
  assert.ok(probe);
  h.send({ type: 'session-pending' });
  assert.equal([...h.timers.values()].includes(probe), false);
  const before = h.messages.length; h.advance(limits.play.sessionRefreshTimeoutMs);
  assert.equal(h.messages.filter((m, i) => i >= before && m.data.type === 'ready').length, 0); h.og.dispose();
});

test('late subscribers receive the held state and handshake probes stop at acknowledgement', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); const initialized = h.og.init();
  const probe = [...h.timers.values()].find(t => t.interval && t.delay === limits.platform.sdk.handshakeRetryMs);
  const initialCount = h.messages.length; probe.fn(); assert.ok(h.messages.length > initialCount);
  h.send({ type: 'mute', muted: true }); h.send({ type: 'activity', active: false });
  h.send({ type: 'session', token: null }); await initialized;
  assert.equal([...h.timers.values()].some(t => t === probe), false);
  const pauses = [], mutes = [];
  h.og.onPause(value => pauses.push(value)); h.og.audio.onHostMute(value => mutes.push(value));
  assert.deepEqual(pauses, [true]); assert.deepEqual(mutes, [true]);
  h.og.ready();
  const retry = [...h.timers.values()].find(t => t.interval && t.delay === limits.platform.sdk.handshakeRetryMs);
  retry.fn(); assert.equal(h.messages.filter(m => m.data.phase === 'playable').length, 2);
  h.send({ type: 'ready-ack', phase: 'playable' });
  assert.equal([...h.timers.values()].some(t => t === retry), false); h.og.dispose();
});

test('a parent load probe reopens the session handshake without restarting gameplay', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); const initialized = h.og.init();
  h.send({ type: 'session', token: 'guest', player: { id: 'guest', handle: null, ogNumber: null, signedIn: false } });
  await initialized; h.og.ready(); h.send({ type: 'ready-ack', phase: 'playable' });
  const before = h.messages.length, timersBefore = h.timers.size;
  h.send({ type: 'session-request' }, {}, 'https://opengame.io');
  h.send({ type: 'session-request' }, h.win.parent, 'https://hostile.invalid');
  assert.equal(h.messages.length, before);
  const changes = []; h.og.player.onChange(value => changes.push(value));
  h.send({ type: 'session-request' });
  assert.equal(h.messages.length, before + 1);
  assert.equal(h.messages.at(-1).data.phase, 'init');
  assert.equal(h.messages.at(-1).target, 'https://opengame.io');
  h.send({ type: 'session', token: 'account', player: { id: 'account', handle: 'fixture', ogNumber: 42, signedIn: true } });
  assert.equal(changes.length, 2); assert.equal(h.og.player.id, 'account');
  assert.equal(h.messages.filter(m => m.data.phase === 'playable').length, 1);
  assert.equal(h.timers.size, timersBefore); h.og.dispose();
});


test('trusted pending verification survives the normal deadline and delivers the verified init result', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); let settled = false;
  const initialized = h.og.init().then(env => { settled = true; return env; });
  h.send({ type: 'session-pending' });
  h.advance(limits.platform.sdk.handshakeTimeoutMs + 1000);
  await Promise.resolve(); assert.equal(settled, false);
  h.send({ type: 'session', token: 'verified', player: { id: 'account', signedIn: true, handle: null, ogNumber: 42 }, capabilities: ['identity', 'leaderboards'] });
  assert.equal((await initialized).connected, true);
  assert.equal(h.og.player.id, 'account'); assert.equal(h.og.player.signedIn, true);
  h.og.dispose(); assert.equal(h.timers.size, 0);
});

test('foreign or repeated pending notices cannot leave initialization waiting indefinitely', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const foreign = harness(); const ordinary = foreign.og.init();
  foreign.send({ type: 'session-pending' }, {}, 'https://opengame.io');
  foreign.send({ type: 'session-pending' }, foreign.win.parent, 'https://hostile.invalid');
  foreign.advance(limits.platform.sdk.handshakeTimeoutMs);
  assert.equal((await ordinary).connected, false); foreign.og.dispose();
  const h = harness(); const pending = h.og.init(); h.send({ type: 'session-pending' });
  const budget = limits.play.sessionRefreshTimeoutMs + limits.platform.sdk.handshakeRetryMs;
  h.advance(budget - 1); h.send({ type: 'session-pending' }); h.advance(1);
  assert.equal((await pending).connected, false);
  h.og.dispose(); assert.equal(h.timers.size, 0);
});


test('external links require a capability and active gesture; confirmation replies use only the request port', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  h.send({ type: 'session', token: 'test-only', capabilities: [] });
  assert.equal((await h.og.openLink('https://example.com/credits')).error, 'unavailable');
  h.send({ type: 'session', token: 'test-only', capabilities: ['external-links'] });
  assert.equal((await h.og.openLink('https://example.com/credits')).error, 'gesture_required');
  h.win.navigator.userActivation = { isActive: true };
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://name:password@example.com', 'https://%65xample.com', 'https://example.com\\@evil.test', 'https://opengame.io/settings']) {
    assert.equal((await h.og.openLink(url)).error, 'invalid_request', url);
  }
  const pending = h.og.openLink('https://example.com/credits');
  const request = h.messages.at(-1);
  assert.equal(request.data.type, 'open-link'); assert.equal(request.target, 'https://opengame.io');
  assert.equal((await h.og.openLink('https://another.example')).error, 'busy');
  // A window message is not a confirmation for this document's private request.
  h.send({ type: 'open-link', ok: true });
  request.ports[0].postMessage({ og: 1, type: 'open-link', ok: false, error: 'cancelled' });
  assert.equal((await pending).error, 'cancelled');
  const accepted = h.og.openLink('https://example.com/credits');
  h.messages.at(-1).ports[0].postMessage({ og: 1, type: 'open-link', ok: true });
  assert.equal((await accepted).ok, true);
  const disposed = h.og.openLink('https://example.com/credits'); h.og.dispose();
  assert.equal((await disposed).error, 'disposed');
});

test('external link confirmation expires and capability removal cancels it', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  h.send({ type: 'session', token: 'test-only', capabilities: ['external-links'] });
  h.win.navigator.userActivation = { isActive: true };
  const timed = h.og.openLink('https://example.com');
  h.advance(limits.platform.sdk.externalLinkConfirmationMs + limits.platform.sdk.handshakeRetryMs);
  assert.equal((await timed).error, 'timeout');
  const revoked = h.og.openLink('https://example.com');
  h.send({ type: 'session', token: 'test-only', capabilities: [] });
  assert.equal((await revoked).error, 'unavailable'); h.og.dispose();
});


test('avatars require a valid consented capability and preserve the separate player id', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  const player = { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true, avatar: { seed: 3, palette: 'paper' } };
  h.send({ type: 'session', token: 'test-only', player, capabilities: ['identity'] });
  assert.equal(h.og.player.avatar, null);
  h.send({ type: 'session', token: 'test-only', player, capabilities: ['identity', 'avatar'] });
  assert.deepEqual({ ...h.og.player.avatar }, { seed: 3, palette: 'paper' });
  assert.equal(h.og.player.id, 'per-game'); assert.ok(Object.isFrozen(h.og.player.avatar));
  for (const avatar of [{ seed: -1, palette: 'paper' }, { seed: 3, palette: 'unknown' }, { seed: 3, palette: 'paper', url: 'https://evil.test' }]) {
    h.send({ type: 'session', token: 'test-only', player: { ...player, avatar }, capabilities: ['avatar'] });
    assert.equal(h.og.player.avatar, null); assert.equal(h.og.capabilities.includes('avatar'), false);
  }
  h.send({ type: 'session', token: 'test-only', player: { ...player, signedIn: false }, capabilities: ['avatar'] });
  assert.equal(h.og.player.avatar, null); h.og.dispose();
});

test('chosen avatar looks survive the parent bridge only while avatar access is offered', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  const changes = []; h.og.player.onChange(player => changes.push(player));
  const player = { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true };
  for (const look of ['circle.classic.white', 'circle.classic.white.none', 'circle.classic.white.none.female',
    'circle.classic.paper.none.male', 'futureface.classic.white.futurehat',
    'circle.classic.white.none.female.beard.ink.brown']) {
    const avatar = { seed: 3, palette: 'paper', look };
    h.send({ type: 'session', token: 'test-only', player: { ...player, avatar }, capabilities: ['identity', 'avatar'] });
    assert.deepEqual({ ...h.og.player.avatar }, avatar);
    assert.equal(changes.at(-1).avatar.look, look);
    assert.equal(h.og.player.id, 'per-game');
    assert.ok(Object.isFrozen(h.og.player.avatar));
  }
  const avatar = { seed: 3, palette: 'paper', look: 'circle.classic.white.none.female' };
  h.send({ type: 'session', token: 'test-only', player: { ...player, avatar }, capabilities: ['identity'] });
  assert.equal(h.og.player.avatar, null, 'a later capability removal drops the chosen appearance');
  h.send({ type: 'session', token: 'test-only', player: { ...player, signedIn: false, avatar }, capabilities: ['avatar'] });
  assert.equal(h.og.player.avatar, null);
  assert.equal(h.og.capabilities.includes('avatar'), false);
  h.og.dispose();
});

test('malformed optional looks and extra avatar fields cannot grant avatar access', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  const player = { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true };
  const invalid = [undefined, null, false, [], {}, '', 'circle.classic', 'circle.classic.white.bad/accessory',
    'circle.classic.white.none.other', 'circle.classic.white.none.female.extra.more.more.extra', 'circle.classic.white.crown.goatee',
    'circle.classic.white\n', 'circle.classic.white.' + 'a'.repeat(1024), 'https://evil.test/avatar'];
  for (const look of invalid) {
    h.send({ type: 'session', token: 'test-only', player: { ...player, avatar: { seed: 3, palette: 'paper', look } }, capabilities: ['avatar'] });
    assert.equal(h.og.player.avatar, null, String(look));
    assert.equal(h.og.capabilities.includes('avatar'), false, String(look));
  }
  h.send({ type: 'session', token: 'test-only', player: { ...player, avatar: { seed: 3, palette: 'paper', look: 'circle.classic.white', url: 'https://evil.test' } }, capabilities: ['avatar'] });
  assert.equal(h.og.player.avatar, null); assert.equal(h.og.capabilities.includes('avatar'), false);
  h.og.dispose();
});

test('private previews withhold chosen avatars even when a parent offers one', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ origin: `https://p-${'a'.repeat(52)}.opengame.gg` }); h.og.init();
  h.send({ type: 'session', token: 'test-only', player: { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true,
    avatar: { seed: 3, palette: 'paper', look: 'circle.classic.white.none.female' } }, capabilities: ['identity', 'avatar'] });
  assert.equal(h.og.player.avatar, null);
  assert.equal(h.og.capabilities.includes('avatar'), false);
  assert.equal(h.og.capabilities.includes('identity'), false);
  h.og.dispose();
});

test('a shared character recipe joins the look, under the same avatar access', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  const player = { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true };
  const avatar = { seed: 3, palette: 'paper', look: 'circle.classic.white.none.female' };
  for (const character of ['c3.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar',
    'c4.classic.regular.hoodie.jeans.cape-watch.retro.blue.ink.chalk.avatar', 'c1.classic.regular.tee.shorts.none',
    // A version this SDK predates still arrives; the game's own parser decides whether it can draw it.
    'c9.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar.glitter']) {
    h.send({ type: 'session', token: 'test-only', player: { ...player, avatar, character }, capabilities: ['identity', 'avatar'] });
    assert.deepEqual({ ...h.og.player.avatar }, { ...avatar, character }, character);
    assert.ok(Object.isFrozen(h.og.player.avatar));
    assert.ok(h.og.capabilities.includes('avatar'));
    assert.equal('character' in h.og.player, false, 'the outfit is part of the avatar, not a player field');
  }
  const character = 'c3.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar';
  h.send({ type: 'session', token: 'test-only', player: { ...player, avatar, character }, capabilities: ['identity'] });
  assert.equal(h.og.player.avatar, null, 'without avatar access the outfit is withheld with the face');
  h.send({ type: 'session', token: 'test-only', player: { ...player, signedIn: false, avatar, character }, capabilities: ['avatar'] });
  assert.equal(h.og.player.avatar, null);
  h.send({ type: 'session', token: 'test-only', player: { ...player, avatar: { seed: 3, palette: 'paper' }, character }, capabilities: ['avatar'] });
  assert.deepEqual({ ...h.og.player.avatar }, { seed: 3, palette: 'paper' }, 'an outfit without a face is not kept');
  h.og.dispose();
});

test('a malformed character recipe is dropped and the face stays; one inside the avatar refuses it', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  const player = { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true };
  const avatar = { seed: 3, palette: 'paper', look: 'circle.classic.white' };
  const valid = 'c3.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar';
  for (const character of [null, false, 3, [valid], {}, '', 'c3', 'c3.classic.regular.hoodie.jeans', 'C3.classic.regular.hoodie.jeans.cape',
    'c3.classic.regular.hoodie.jeans.cape\n', 'c3.classic.regular.hoodie.jeans.cape--watch', 'c3.Classic.regular.hoodie.jeans.cape',
    `c3.classic.regular.hoodie.jeans${'.cape'.repeat(60)}`, 'https://evil.test/character.glb']) {
    h.send({ type: 'session', token: 'test-only', player: { ...player, avatar, character }, capabilities: ['avatar'] });
    assert.deepEqual({ ...h.og.player.avatar }, avatar, String(character));
    assert.ok(h.og.capabilities.includes('avatar'), String(character));
  }
  // Inside the avatar is the shape every older SDK refuses, so this one refuses it too:
  // a parent that sends it there is not one this SDK was built against.
  h.send({ type: 'session', token: 'test-only', player: { ...player, avatar: { ...avatar, character: valid } }, capabilities: ['avatar'] });
  assert.equal(h.og.player.avatar, null);
  assert.equal(h.og.capabilities.includes('avatar'), false);
  h.og.dispose();
});

test('a game built before the outfit existed keeps the face when the page shares an outfit', async () => {
  const historical = readFileSync(new URL('./fixtures/historical/opengame-5e12458bd.js', import.meta.url), 'utf8');
  for (const script of [historical, undefined]) {
    const h = harness({ script }); h.og.init();
    const avatar = { seed: 3, palette: 'paper', look: 'circle.classic.white' };
    h.send({ type: 'session', token: 'test-only', capabilities: ['identity', 'avatar'],
      player: { id: 'per-game', handle: 'mira', ogNumber: 7, signedIn: true, avatar, character: 'c3.classic.regular.hoodie.jeans.cape.retro.avatar.avatar.avatar.avatar' } });
    assert.equal(h.og.player.avatar?.look, avatar.look, script ? 'historical build' : 'current build');
    assert.ok(h.og.capabilities.includes('avatar'));
    h.og.dispose();
  }
});

test('the signed-in local mock wears a full OG, and avatar access follows the mock player', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const expected = { seed: 1, palette: 'sky', look: 'circle.classic.white', character: 'c4.classic.regular.hoodie.jeans.cape-watch.retro.avatar.avatar.avatar.avatar' };
  for (const start of [{ dev: { player: 'signed-in' } }, 'http://localhost:4592/game/?og-dev-player=signed-in']) {
    const h = typeof start === 'string' ? harness({ embedded: false, origin: start }) : harness({ embedded: false, origin: 'http://localhost:4592' });
    await h.og.init(typeof start === 'string' ? undefined : start);
    assert.deepEqual({ ...h.og.player.avatar }, expected);
    assert.ok(Object.isFrozen(h.og.player.avatar));
    assert.ok(h.og.capabilities.includes('avatar'));
    h.og.dispose();
  }
  for (const kind of ['guest', 'no-handle']) {
    const h = harness({ embedded: false, origin: 'http://localhost:4592' }); await h.og.init({ dev: { player: kind } });
    assert.equal(h.og.player.avatar, null, kind); assert.equal(h.og.capabilities.includes('avatar'), false, kind);
    h.og.dispose();
  }
  const h = harness({ embedded: false, origin: 'http://localhost:4592' }); await h.og.init();
  const seen = []; h.og.player.onChange(player => seen.push(player.avatar?.character ?? null));
  assert.equal(h.og.player.requestSignIn().ok, true);
  assert.deepEqual(seen, [null, expected.character]);
  assert.ok(h.og.capabilities.includes('avatar'), 'signing in offline grants avatar access, as a hosted sign-in with sharing on does');
  assert.deepEqual(['identity', 'leaderboards', 'analytics'].filter(name => h.og.capabilities.includes(name)), ['identity', 'leaderboards', 'analytics']);
  assert.equal(h.og.capabilities.includes('multiplayer'), false);
  h.og.dispose();
});


test('a warm parent-held lobby waits for Play without a network deadline', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  h.send({ type: 'session', token: 'test-only', held: true, capabilities: ['multiplayer', 'lobby-controls'] });
  let done = false; const pending = h.og.waitForPlay().then(result => { done = true; return result; });
  h.advance(60 * limits.platform.sdk.lobbyRequestTimeoutMs); await Promise.resolve();
  assert.equal(done, false);
  h.send({ type: 'play' }); assert.equal((await pending).ok, true); h.og.dispose();
});

test('a parent-held lobby supports cancellation and client disposal', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness(); h.og.init();
  h.send({ type: 'session', token: 'test-only', held: true, capabilities: ['multiplayer', 'lobby-controls'] });
  const controller = new AbortController(), cancelled = h.og.waitForPlay(controller.signal); controller.abort();
  assert.equal((await cancelled).error, 'cancelled');
  const disposed = h.og.waitForPlay(); h.og.dispose(); assert.equal((await disposed).error, 'disposed');
});

test('the local mock says once, in the developer console, what it is pretending; a hosted game never does', async () => {
  const said = [];
  const console = { info: (...args) => said.push(args), debug: () => {} };
  const local = harness({ embedded: false, origin: 'http://localhost:4592/?og-dev-player=signed-in', console });
  await local.og.init();
  assert.equal(said.length, 1);
  const [text] = said[0];
  assert.match(text, /OpenGame SDK \d+\.\d+\.\d+/);
  assert.match(text, /Playing as @dev, signed in\. Add \?og-dev-player=guest/);
  assert.match(text, /Scores stay in this browser\.$/);
  assert.doesNotMatch(text, /—/, 'no em dashes in a sentence a person reads');
  assert.equal(said[0].length, 1, 'words only: the face did not fit the core budget');
  local.og.dispose();
  // Somewhere that is neither OpenGame nor the developer's own machine: a game hosted
  // elsewhere runs the mock for its players, and their consoles are not ours to write in.
  const elsewhere = harness({ embedded: false, origin: 'https://games.example.com/', console });
  await elsewhere.og.init();
  assert.equal(said.length, 1);
  elsewhere.og.dispose();
});

test('ambiguous delivery retries identical event ids and does not treat queued as accepted', async () => {
  const requests = [];
  let calls = 0;
  const h = harness({ fetcher: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    if (++calls === 1) throw new Error('connection lost after dispatch');
    return Response.json({ accepted: JSON.parse(init.body).events.length }, { status: calls === 2 ? 202 : 200 });
  } });
  const initialized = h.og.init();
  h.send({ type: 'session', token: 'test-only-private', capabilities: ['analytics'] });
  await initialized;
  assert.equal(h.og.track('level_start', { level: 1 }).ok, true);
  h.fire('pagehide');
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  h.advance(limits.analytics.flushIntervalMs);
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.match(requests[0].events[0].eventId, /^[0-9a-f-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(requests[0].events[0].occurredAt)));
  h.advance(limits.analytics.flushIntervalMs);
  await new Promise(setImmediate);
  assert.equal(requests.length, 3, 'HTTP 202 retains the original batch');
  assert.deepEqual(requests[2], requests[0]);
  h.advance(limits.analytics.flushIntervalMs);
  await new Promise(setImmediate);
  assert.equal(requests.length, 3, 'the later complete receipt retires the batch');
  h.og.dispose();
});

test('achievements validate replies and never send game or player identity', async () => {
  let malformed = false;
  const h = harness({ fetcher: async (_url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer achievements-test');
    assert.equal(init.credentials, 'omit');
    if (malformed) return Response.json({ ok: true });
    if (init.method === 'POST') {
      assert.deepEqual(JSON.parse(init.body), { achievement: 'first_win' });
      return Response.json({ achievementId: 'first_win', unlocked: true, firstUnlock: true, unlockedAt: new Date().toISOString(), source: 'game_reported' });
    }
    return Response.json([]);
  } });
  h.og.init(); h.send({ type: 'session', token: 'achievements-test', capabilities: ['analytics'] });
  assert.equal((await h.og.achievements.list()).ok, true);
  const unlocked = await h.og.achievements.unlock('first_win');
  assert.equal(unlocked.value.firstUnlock, true);
  malformed = true;
  assert.equal((await h.og.achievements.unlock('first_win')).error, 'invalid_response');
  h.og.dispose();
  assert.equal((await h.og.achievements.list()).error, 'disposed');
  const preview = harness({ origin: `https://p-${'a'.repeat(52)}.opengame.gg` });
  preview.og.init(); preview.send({ type: 'session', token: 'preview-test', capabilities: ['analytics'] });
  assert.equal((await preview.og.achievements.unlock('first_win')).error, 'unavailable_in_preview');
  assert.equal(preview.calls.length, 0);
  preview.og.dispose();
});


test('achievement ids match creator definitions including digit prefixes and hyphens', async () => {
  const h = harness({ fetcher: async (_url, init) => Response.json({ achievementId: JSON.parse(init.body).achievement,
    unlocked: true, firstUnlock: true, unlockedAt: new Date().toISOString(), source: 'game_reported' }) });
  h.og.init(); h.send({ type: 'session', token: 'achievement-contract', capabilities: ['analytics'] });
  assert.equal((await h.og.achievements.unlock('1-boss')).ok, true);
  assert.equal((await h.og.achievements.unlock('x'.repeat(limits.analytics.achievementIdCharsMax + 1))).error, 'invalid_achievement');
  h.og.dispose();
});

/* The injected global asks the page for the player as it loads, not when the game calls
   init. OG Clash, a WebAssembly game whose engine took most of a minute to boot, showed
   its default character on the first menu because nothing asked until then. */
const sharingPlayer = { id: 'per-game', handle: 'fate', ogNumber: 7, signedIn: true,
  avatar: { seed: 3, palette: 'paper', look: 'circle.classic.white' },
  character: 'c4.classic.regular.hoodie.jeans.cape-watch.retro.avatar.avatar.avatar.avatar' };
const collectors = ['pointerdown', 'keydown', 'error', 'unhandledrejection', 'visibilitychange', 'pagehide'];
test('the injected global has the player before the game calls init, and init adopts it', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ full: true });
  assert.deepEqual(h.messages.map(m => [m.data.type, m.data.phase, m.target]), [['ready', 'init', 'https://opengame.io']],
    'the script asks as it loads');
  assert.deepEqual([...h.listeners.keys()], ['message'], 'transport only: no input, error or visibility collector before init');
  const changes = []; h.og.player.onChange(player => changes.push(player.avatar?.look ?? null));
  h.send({ type: 'session', token: 'test-only', player: sharingPlayer, capabilities: ['identity', 'avatar', 'leaderboards', 'analytics'] });
  assert.equal(h.og.env.connected, true);
  assert.equal(h.og.player.avatar.look, 'circle.classic.white');
  assert.equal(h.og.player.avatar.character, sharingPlayer.character, 'the outfit arrives with the look');
  assert.deepEqual(changes, [null, 'circle.classic.white']);
  assert.equal(JSON.parse(h.bridge.player()).avatar.look, 'circle.classic.white', 'a native engine reads it without its own handshake');
  assert.equal([...h.timers.values()].some(t => t.interval && t.delay === limits.platform.sdk.handshakeRetryMs), false, 'probing stopped at the answer');
  const before = h.messages.length;
  const env = await h.og.init();
  assert.equal(env.connected, true); assert.equal(h.og.player.handle, 'fate');
  assert.equal(h.messages.length, before, 'init does not ask again for what it already has');
  for (const type of ['pointerdown', 'keydown', 'visibilitychange']) assert.ok(h.listeners.get(type)?.size, `${type} starts at init`);
  h.og.dispose();
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.get('message').size, 0);
});

test('a game that loads the injected global and never calls init reports nothing', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ full: true, sampled: true, fetcher: async () => { throw new Error('nothing may be sent'); } });
  h.send({ type: 'session', token: 'test-only', player: sharingPlayer, capabilities: ['identity', 'analytics', 'leaderboards'] });
  for (const type of collectors) assert.equal(h.listeners.get(type)?.size ?? 0, 0, `${type} is not collected`);
  h.fire('error', { type: 'error', error: new TypeError('boom'), target: h.win });
  h.advance(limits.analytics.runtime.sampleIntervalMs + limits.platform.sdk.eventBatchMs);
  assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
  h.og.dispose();
});

test('outside a hosted frame the injected global waits for init and its options', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const standalone = harness({ full: true, embedded: false, origin: 'http://localhost:4592' });
  assert.equal(standalone.listeners.size, 0); assert.equal(standalone.timers.size, 0); assert.equal(standalone.messages.length, 0);
  standalone.og.dispose();
  // A frame on somebody else's site ends an unanswered handshake in the local mock, and the
  // mock's player is an init option, so nothing may decide it before the game's call.
  const elsewhere = harness({ full: true, origin: 'https://game.example.test', referrer: '' });
  assert.equal(elsewhere.listeners.size, 0); assert.equal(elsewhere.messages.length, 0);
  const env = elsewhere.og.init({ dev: { player: 'signed-in' } });
  elsewhere.advance(limits.platform.sdk.handshakeTimeoutMs);
  assert.equal((await env).connected, false); assert.equal(elsewhere.og.player.handle, 'dev');
  elsewhere.og.dispose();
});

test('a private preview drops identity from a session that arrives before init', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ full: true, origin: `https://p-${'a'.repeat(52)}.opengame.gg` });
  assert.equal(h.messages.length, 1);
  h.send({ type: 'session', token: 'test-only', player: sharingPlayer, capabilities: ['identity', 'avatar', 'leaderboards'] });
  assert.equal(h.og.env.preview, true);
  assert.equal(h.og.player.avatar, null); assert.deepEqual(Array.from(h.og.capabilities), ['leaderboards']);
  await h.og.init(); assert.equal(h.og.player.avatar, null); h.og.dispose();
});

test('a page still verifying the session before init gives the game one bounded wait', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const pending = limits.play.sessionRefreshTimeoutMs + limits.platform.sdk.handshakeRetryMs;
  const probes = h => h.messages.filter(m => m.data.type === 'ready' && m.data.phase === 'init').length;
  // The answer arrives while init waits on it.
  const h = harness({ full: true });
  h.send({ type: 'session-pending' });
  h.advance(limits.platform.sdk.handshakeTimeoutMs);
  assert.equal(probes(h), 1, 'the pending notice stops the probe, so the ready budget survives');
  let settled = false; const env = h.og.init().then(value => { settled = true; return value; });
  await Promise.resolve(); assert.equal(settled, false); assert.equal(probes(h), 1);
  h.send({ type: 'session', token: 'test-only', player: sharingPlayer, capabilities: ['identity', 'avatar'] });
  assert.equal((await env).connected, true); assert.equal(h.og.player.avatar.look, 'circle.classic.white');
  h.og.dispose();
  // No answer: init settles at the pending deadline, once, and is not extended again.
  const late = harness({ full: true });
  late.send({ type: 'session-pending' });
  late.advance(pending);
  const waited = late.og.init(); late.send({ type: 'session-pending' });
  late.advance(pending);
  assert.equal((await waited).connected, false);
  assert.equal(probes(late), 1); assert.equal(late.timers.size, 1, 'only the event batch timer remains');
  late.og.dispose(); assert.equal(late.timers.size, 0);
});

test('init during the early handshake adopts it: one probe, and the deadline counts from the first', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ full: true });
  h.advance(limits.platform.sdk.handshakeTimeoutMs - 1000);
  const probes = () => h.messages.filter(m => m.data.type === 'ready' && m.data.phase === 'init').length;
  const before = probes();
  let settled = false; const env = h.og.init().then(value => { settled = true; return value; });
  assert.equal(probes(), before, 'init does not send a second immediate probe');
  h.advance(1000);
  assert.equal((await env).connected, false); assert.equal(settled, true);
  h.og.dispose(); assert.equal(h.timers.size, 0);
});

test('the og-platform.js adapter loaded after the injected global gets the session the global already has', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const { transformSync } = await import('esbuild');
  const adapter = transformSync(readFileSync(new URL('../dist/og-platform.js', import.meta.url), 'utf8'), { format: 'iife', globalName: '__ogAdapter' }).code;
  const h = harness({ full: true });
  const session = { type: 'session', token: 'early-token', join: 'ABCDE', player: sharingPlayer, capabilities: ['identity', 'leaderboards', 'analytics'] };
  h.send(session);
  assert.equal(h.og.env.connected, true, 'the page answered the early handshake before the adapter ran');
  const before = h.messages.length;
  h.run(adapter);
  const asked = h.messages.slice(before).filter(m => m.data.type === 'ready' && m.data.phase === 'init');
  assert.equal(asked.length, 1, 'the adapter, having missed that answer, asks the page once more');
  assert.equal(asked[0].target, 'https://opengame.io');
  h.send(session);
  assert.equal(h.context.__ogAdapter.ogSessionToken(), 'early-token');
  assert.equal(h.context.__ogAdapter.ogJoinCode, undefined);
  assert.equal(await h.context.__ogAdapter.ogAwaitSession(10), true);
  h.og.dispose();
});

test('a session from the early handshake is not a grant to record events before init', { timeout: limits.platform.sdk.lobbyRequestTimeoutMs * 2 }, async () => {
  const h = harness({ full: true });
  h.send({ type: 'session', token: 'test-only', player: sharingPlayer, capabilities: ['identity', 'analytics'] });
  assert.deepEqual({ ...h.og.track('level_start', { level: 1 }) }, { ok: false, error: 'unavailable' });
  await h.og.init();
  assert.equal(h.og.track('level_start', { level: 1 }).ok, true);
  h.og.dispose();
});

test('a no-referrer frame addresses only the parent its ancestors name, when that parent is trusted', async () => {
  // Area F, 1 Nov 2026: every hosted frame posted its handshake to each trusted parent in
  // turn, and the browser logged a postMessage warning for every one that was not it.
  const embedded = harness({ referrer: '', ancestors: ['https://opengame.io'] }); embedded.og.init();
  const targets = new Set(embedded.messages.filter(m => m.data.og === 1).map(m => m.target));
  assert.deepEqual([...targets], ['https://opengame.io']);
  embedded.og.dispose();
  // An ancestor outside the allowlist is never a target, and the list is used as before.
  const framed = harness({ referrer: '', ancestors: ['https://evil.example'] }); framed.og.init();
  const listed = new Set(framed.messages.filter(m => m.data.og === 1).map(m => m.target));
  assert.ok(!listed.has('https://evil.example'));
  assert.ok(listed.has('https://opengame.io') && listed.has('https://admin.opengame.io'));
  framed.og.dispose();
  // A browser without ancestorOrigins keeps the list too.
  const plain = harness({ referrer: '' }); plain.og.init();
  assert.ok(new Set(plain.messages.map(m => m.target)).size > 1);
  plain.og.dispose();
});

test('the page global carries the error catalogue the GDevelop and RPG Maker plugins read', () => {
  // They read OpenGame.errorCatalogue for a failure's hint and to tell a known code from an
  // unknown one. It left with the multiplayer module, and their tests passed on a fake.
  const h = harness({ full: true });
  const catalogue = h.og.errorCatalogue;
  assert.ok(Array.isArray(catalogue) && catalogue.length > 5, 'the global has the catalogue');
  assert.ok(catalogue.every(entry => typeof entry.code === 'string' && typeof entry.hint === 'string'));
  assert.ok(catalogue.some(entry => entry.code === 'rate_limited'));
});

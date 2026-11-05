import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, limits } from './harness.mjs';
// Source-only integration: these tests are UNRUN until the parent rebuilds all bundles.

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
  h.fire('pointerdown');
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
    { accepted: 1, refused: 0, limited: -1 }, { accepted: 1, refused: 0, limited: 0.5 },
    { accepted: 1, refused: 0, limited: null }, { accepted: 1, refused: 0, limited: 2 },
    { accepted: 1 }, { accepted: 0 }, { queued: true }, { ok: true },
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

const settle = () => new Promise(resolve => setImmediate(resolve));
const session = (h, token, extra = {}) => h.send({ type: 'session', token, capabilities: ['analytics'], ...extra });
const rows = call => JSON.parse(call.init.body).events;

test('loss of A cannot bind gap observations to B; rotated tokens retain exact original batches', async () => {
  const replies = [];
  const h = harness({ fetcher: () => new Promise(resolve => replies.push(resolve)) });
  h.og.init(); session(h, 'a', { player: { id: 'a', signedIn: true, handle: null, ogNumber: null } });
  h.og.track('a_first'); h.fire('pagehide');
  h.og.track('a_tail'); session(h, null);
  assert.equal(h.og.track('revoked_gap').error, 'unavailable');
  session(h, 'b'); h.og.track('b_first');
  replies.shift()(Response.json({ accepted: 1 })); await settle(); h.fire('pagehide');
  assert.equal(h.calls[1].init.headers.Authorization, 'Bearer a');
  assert.deepEqual(rows(h.calls[1]).map(row => row.name), ['a_tail']);
  replies.shift()(Response.json({ accepted: 1 })); await settle(); h.fire('pagehide');
  assert.equal(h.calls[2].init.headers.Authorization, 'Bearer b');
  assert.deepEqual(rows(h.calls[2]).map(row => row.name), ['b_first']);
  replies.shift()(Response.json({ accepted: 1 })); await settle();
});

test('same-player refresh does not reset first-input coverage or lifetime admissions', async () => {
  const h = harness({ fetcher: async (_url, init) => Response.json({ accepted: JSON.parse(init.body).events.length }) });
  h.og.init(); const player = { id: 'same-player', signedIn: true, handle: null, ogNumber: null };
  session(h, 'first-token', { player }); h.og.ready(); h.fire('keydown', { isTrusted: true });
  h.fire('pagehide'); await settle();
  session(h, 'rotated-token', { player }); h.fire('pointerdown', { isTrusted: true }); h.fire('pagehide');
  assert.equal(h.calls.length, 1, 'rotation neither duplicates first input nor coverage');
  let admitted = rows(h.calls[0]).length;
  while (admitted < limits.analytics.eventsPerSessionMax) {
    h.advance(limits.platform.sdk.rateWindowMs); await settle();
    while (admitted < limits.analytics.eventsPerSessionMax && h.og.track('bounded').ok) admitted++;
  }
  h.advance(limits.platform.sdk.rateWindowMs); await settle(); session(h, 'third-token', { player });
  assert.equal(h.og.track('over_lifetime').error, 'rate_limited');
});

test('accepted IDs retire only captured members; malformed IDs and oversized receipts retain exact retries', async () => {
  for (const reply of [
    () => Response.json({ accepted: 1, acceptedIds: ['foreign'] }),
    events => Response.json({ accepted: 2, acceptedIds: [events[0].eventId, events[0].eventId] }),
    () => new Response('{broken'),
    () => new Response(' '.repeat(limits.analytics.batchBytesMax + 1)),
    () => Response.json({ accepted: 2 }, { status: 202 }),
  ]) {
    let attempt = 0;
    const h = harness({ fetcher: async (_url, init) => attempt++ ? Response.json({ accepted: 2 }) : reply(JSON.parse(init.body).events) });
    h.og.init(); session(h, 'receipt-test'); h.og.track('one'); h.og.track('two'); h.fire('pagehide');
    const original = rows(h.calls[0]); await settle();
    h.advance(limits.analytics.flushIntervalMs); await settle();
    assert.deepEqual(rows(h.calls[1]), original); h.og.dispose();
  }
  let attempt = 0;
  const h = harness({ fetcher: async (_url, init) => {
    const events = JSON.parse(init.body).events;
    return Response.json(attempt++ ? { accepted: events.length } : { accepted: 1, limited: 1, acceptedIds: [events[1].eventId] });
  } });
  h.og.init(); session(h, 'partial'); h.og.track('one'); h.og.track('two'); h.fire('pagehide');
  const original = rows(h.calls[0]); await settle(); h.fire('pagehide'); await settle();
  assert.deepEqual(rows(h.calls[1]), [original[0]]);
});

test('denial and new admission during flight do not let a previous receipt splice the new queue', async () => {
  const replies = [];
  const h = harness({ fetcher: () => new Promise(resolve => replies.push(resolve)) });
  h.og.init(); session(h, 'a'); h.og.track('original'); h.fire('pagehide');
  session(h, null, { capabilities: [] }); session(h, 'b'); h.og.track('new_owner');
  replies.shift()(Response.json({ accepted: 1 })); await settle(); h.fire('pagehide');
  assert.deepEqual(rows(h.calls[1]).map(row => row.name), ['new_owner']);
  assert.equal(h.calls[1].init.headers.Authorization, 'Bearer b');
  replies.shift()(Response.json({ accepted: 1 })); await settle();
});

test('terminal HTTP replies retire captured rows; transient failures retry unchanged without a hot loop', async () => {
  for (const status of [400, 401, 403, 404, 410, 413, 422, 429, 500]) {
    const h = harness({ fetcher: async () => new Response(null, { status }) });
    h.og.init(); session(h, 'status-test'); h.og.track('one'); h.fire('pagehide'); await settle();
    assert.equal(h.calls.length, 1);
    h.advance(limits.analytics.flushIntervalMs); await settle();
    assert.equal(h.calls.length, status === 429 || status === 500 ? 2 : 1);
    if (h.calls.length > 1) assert.deepEqual(rows(h.calls[1]), rows(h.calls[0]));
    h.og.dispose();
  }

});

test('encoded batches obey byte and row limits, including identity and timestamp overhead', async () => {
  const h = harness({ fetcher: async (_url, init) => Response.json({ accepted: JSON.parse(init.body).events.length }) });
  h.og.init(); session(h, 'bytes');
  for (let i = 0; i < limits.platform.sdk.eventsPerSessionPerMinute; i++) h.og.track('payload', { level: i });
  for (let i = 0; i < 3; i++) { h.fire('pagehide'); await settle(); }
  assert.equal(h.calls.flatMap(rows).length, limits.platform.sdk.eventsPerSessionPerMinute);
  for (const call of h.calls) {
    assert.ok(rows(call).length <= limits.analytics.batchEventsMax);
    assert.ok(new TextEncoder().encode(call.init.body).byteLength <= limits.analytics.batchBytesMax);
  }
});

test('the SDK captures trusted first-input analytics and never duplicates host advisory input', async () => {
  for (const full of [false, true]) {
    const h = harness({ full, fetcher: async (_url, init) => Response.json({ accepted: JSON.parse(init.body).events.length }) });
    h.og.init(); session(h, 'input', { held: true }); h.og.ready();
    h.fire('keydown', { isTrusted: true }); h.send({ type: 'play' });
    h.fire('keydown', { isTrusted: false }); h.fire('pagehide'); await settle();
    assert.equal(h.calls.flatMap(rows).filter(row => row.name === 'first_input').length, 0);
    h.win.document.visibilityState = 'hidden'; h.fire('visibilitychange'); h.fire('pointerdown', { isTrusted: true });
    h.win.document.visibilityState = 'visible'; h.fire('visibilitychange');
    h.fireFromTarget('keydown', event => event.stopPropagation(), { isTrusted: true });
    h.fire('pointerdown', { isTrusted: true }); h.fire('pagehide'); await settle();
    assert.equal(h.calls.flatMap(rows).filter(row => row.name === 'first_input').length, 1);
    assert.equal(h.messages.filter(row => row.data.type === 'input').length, 0);
    h.og.dispose(); h.fire('keydown', { isTrusted: true });
    assert.equal(h.listeners.get('keydown').size, 0);
  }
});

test('achievement A -> B -> A and dispose cannot publish a stale success', async () => {
  for (const dispose of [false, true]) {
    let reply;
    const h = harness({ fetcher: () => new Promise(resolve => { reply = resolve; }) });
    h.og.init(); session(h, 'a'); const result = h.og.achievements.list();
    session(h, 'b'); session(h, 'a'); if (dispose) h.og.dispose();
    reply(Response.json([]));
    assert.equal((await result).error, dispose ? 'disposed' : 'session_changed');
  }
});

test('achievement chunked responses are bounded during reading and cancel the stream', async () => {
  let cancelled = false;
  const h = harness({ fetcher: async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(limits.platform.sdk.scoreResponseBytesMax + 1)); },
    cancel() { cancelled = true; },
  })) });
  h.og.init(); session(h, 'size');
  assert.equal((await h.og.achievements.list()).error, 'invalid_response');
  assert.equal(cancelled, true);
});

test('HTTP LAN crypto without randomUUID preserves unique IDs and playable readiness', async () => {
  const h = harness({ embedded: false, origin: 'http://192.168.1.9:4592', beforeLoad(context) {
    const crypto = context.crypto;
    context.crypto = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  } });
  await h.og.init();
  assert.equal(h.og.track('one').ok, true); assert.equal(h.og.track('two').ok, true);
  assert.doesNotThrow(() => h.og.ready());
  assert.equal(h.messages.filter(message => message.data.phase === 'playable').length, 1);
  const local = [];
  const next = harness({ embedded: false, origin: 'http://192.168.1.9:4592', console: { debug: (_label, rows) => local.push(...rows) }, beforeLoad(context) {
    const crypto = context.crypto; context.crypto = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  } });
  await next.og.init(); next.og.track('one'); next.og.track('two'); next.advance(limits.analytics.flushIntervalMs);
  assert.equal(new Set(local.map(row => row.eventId)).size, 2);
  for (const row of local) assert.match(row.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('missing crypto returns a Result and cannot interrupt playable readiness', async () => {
  const h = harness({ embedded: false, origin: 'http://192.168.1.9:4592', beforeLoad(context) { context.crypto = undefined; } });
  await h.og.init(); assert.equal(h.og.track('one').error, 'unavailable');
  assert.doesNotThrow(() => h.og.ready()); h.og.ready();
  assert.equal(h.messages.filter(message => message.data.phase === 'playable').length, 1);
});

test('request deadlines abort stalled headers and body reads; retries retain the original IDs', async () => {
  for (const stall of ['headers', 'body']) {
    let aborted = 0, cancelled = 0;
    const h = harness({ fetcher: (_url, init) => {
      if (stall === 'headers') return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => { aborted++; reject(init.signal.reason); }, { once: true });
      });
      init.signal.addEventListener('abort', () => { aborted++; }, { once: true });
      return Promise.resolve(new Response(new ReadableStream({ cancel() { cancelled++; } })));
    } });
    h.og.init(); session(h, 'deadline'); h.og.track('one'); h.fire('pagehide'); await settle();
    const original = rows(h.calls[0]);
    h.advance(limits.analytics.requestTimeoutMs - 1); await settle();
    assert.equal(aborted, 0); assert.equal(h.calls[0].init.signal.aborted, false);
    h.advance(1); await settle();
    assert.equal(aborted, 1); assert.equal(h.calls[0].init.signal.aborted, true);
    if (stall === 'body') assert.equal(cancelled, 1);
    h.fire('pagehide'); await settle();
    assert.equal(h.calls.length, 2, 'the expired in-flight guard was released');
    assert.deepEqual(rows(h.calls[1]), original);
    h.advance(limits.analytics.requestTimeoutMs); await settle(); h.og.dispose();
  }
});

test('achievement deadlines settle stalled headers and body reads', async () => {
  for (const stall of ['headers', 'body']) {
    let cancelled = 0, done = false;
    const h = harness({ fetcher: (_url, init) => stall === 'headers'
      ? new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
      : Promise.resolve(new Response(new ReadableStream({ cancel() { cancelled++; } }))) });
    h.og.init(); session(h, 'deadline'); const result = h.og.achievements.list().then(value => { done = true; return value; });
    await settle(); h.advance(limits.analytics.requestTimeoutMs - 1); await settle(); assert.equal(done, false);
    h.advance(1); await settle(); assert.equal(done, true);
    assert.equal((await result).error, 'network');
    if (stall === 'body') assert.equal(cancelled, 1);
    h.og.dispose();
  }
});

test('diagnostics observed without analytics cannot be replayed on a later same-token grant', async () => {
  const h = harness({ fetcher: async (_url, init) => Response.json({ accepted: JSON.parse(init.body).events.length }) });
  h.og.init(); session(h, 'same', { capabilities: [] });
  h.fire('error', { type: 'error', error: { name: 'TypeError' }, target: h.win });
  session(h, 'same'); h.fire('pagehide'); await settle();
  assert.equal(h.calls.flatMap(rows).some(row => row.name === 'runtime_error'), false);
});


test('unlock responses require every receipt field', async () => {
  const receipt = { achievementId: 'first_win', unlocked: true, firstUnlock: true,
    unlockedAt: '2026-10-21T00:00:00.000Z', source: 'game_reported' };
  for (const key of Object.keys(receipt)) {
    const partial = { ...receipt }; delete partial[key];
    const h = harness({ fetcher: async () => Response.json(partial) });
    h.og.init(); session(h, 'receipt-fields');
    assert.equal((await h.og.achievements.unlock('first_win')).error, 'invalid_response', key);
    h.og.dispose();
  }
});


test('complete accepted-ID receipts retire both accepted and mixed terminal batches', async () => {
  for (const mixed of [false, true]) {
    const h = harness({ fetcher: async (_url, init) => {
      const events = JSON.parse(init.body).events;
      return Response.json({ accepted: mixed ? 1 : events.length, refused: mixed ? 1 : 0, limited: 0,
        acceptedIds: events.slice(0, mixed ? 1 : events.length).map(event => event.eventId) });
    } });
    h.og.init(); session(h, 'complete'); h.og.track('one'); h.og.track('two');
    h.fire('pagehide'); await settle(); h.fire('pagehide');
    assert.equal(h.calls.length, 1);
    h.og.dispose();
  }
});

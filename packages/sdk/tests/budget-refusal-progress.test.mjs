import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

// Exercise the real frozen SDK bundle and queue against the public API receipt
// contract. Collector/API durability is tested with real SQLite in
// infra/analytics-worker/test/api-composed.test.ts; these are HTTP response
// fixtures, not a substitute collector or a claim about provider delivery.
const settle = () => new Promise(resolve => setImmediate(resolve));
const rows = call => JSON.parse(call.init.body).events;
const session = (h, token) => h.send({ type: 'session', token, capabilities: ['analytics'] });

for (const budget of ['session', 'property']) {
  test(`${budget} budget disposition retires exactly the captured batch and permits a later valid row`, async () => {
    let finish;
    const h = harness({ fetcher: async (_url, init) => {
      const events = JSON.parse(init.body).events;
      if (!finish) return new Promise(resolve => {
        finish = () => resolve(Response.json({ accepted: 1, refused: 1, limited: 0, acceptedIds: [events[1].eventId] }));
      });
      return Response.json({ accepted: events.length, refused: 0, limited: 0, acceptedIds: events.map(row => row.eventId) });
    } });
    h.og.init(); session(h, 'original-token');
    assert.equal(h.og.track('budget_refused').ok, true);
    assert.equal(h.og.track('valid_sibling').ok, true);
    h.fire('pagehide');
    assert.equal(h.calls.length, 1);
    const captured = rows(h.calls[0]);
    assert.equal(new Set(captured.map(row => row.eventId)).size, 2);
    session(h, 'later-token');
    assert.equal(h.og.track('later_valid').ok, true);
    finish(); await settle();
    h.fire('pagehide'); await settle();
    assert.equal(h.calls.length, 2);
    assert.deepEqual(rows(h.calls[1]).map(row => row.name), ['later_valid']);
    assert.equal(h.calls[0].init.headers.Authorization, 'Bearer original-token');
    assert.equal(h.calls[1].init.headers.Authorization, 'Bearer later-token');
    assert.equal(captured.some(row => row.eventId === rows(h.calls[1])[0].eventId), false);
    h.fire('pagehide'); await settle();
    assert.equal(h.calls.length, 2);
    h.og.dispose();
  });
}

test('ambiguous admission retains original IDs, occurrence and token until a complete disposition arrives', async () => {
  let attempt = 0;
  const h = harness({ fetcher: async (_url, init) => {
    const events = JSON.parse(init.body).events;
    if (attempt++ === 0) return Response.json({ error: 'analytics_unavailable', accepted: 0, refused: 0, limited: 0, acceptedIds: [] }, { status: 503 });
    return Response.json({ accepted: 1, refused: 1, limited: 0, acceptedIds: [events[1].eventId] });
  } });
  h.og.init(); session(h, 'captured-token');
  h.og.track('budget_refused'); h.og.track('already_admitted');
  h.fire('pagehide'); await settle();
  session(h, 'refreshed-token');
  h.fire('pagehide'); await settle();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(rows(h.calls[1]), rows(h.calls[0]));
  assert.equal(h.calls[1].init.headers.Authorization, 'Bearer captured-token');
  h.fire('pagehide'); await settle();
  assert.equal(h.calls.length, 2, 'complete disposition retires both captured rows');
  h.og.dispose();
});

test('a limited disposition does not falsely retire the budget-refused prefix', async () => {
  let complete = false;
  const h = harness({ fetcher: async (_url, init) => {
    const events = JSON.parse(init.body).events;
    return Response.json(complete
      ? { accepted: 0, refused: events.length, limited: 0, acceptedIds: [] }
      : { accepted: 0, refused: 1, limited: 1, acceptedIds: [] });
  } });
  h.og.init(); session(h, 'quota-token');
  h.og.track('budget_refused'); h.og.track('temporarily_limited');
  h.fire('pagehide'); await settle();
  complete = true;
  h.fire('pagehide'); await settle();
  assert.deepEqual(rows(h.calls[1]), rows(h.calls[0]));
  h.fire('pagehide'); await settle();
  assert.equal(h.calls.length, 2);
  h.og.dispose();
});

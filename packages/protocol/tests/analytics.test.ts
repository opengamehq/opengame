import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '@opengame/shared';
import { AnalyticsFiltersRemovedError, refuseFilters, parseAnalyticsQuery, analyticsReportSchema, storedAnalyticsReportSchema, windowRange, latestCompleteWeek, previousPeriod, nextPeriod,
  parseAnalyticsWindow, windowLabel, isoWeeksInYear, AnalyticsRangeError, windowReceiptCutoff, weekAt, windowRefusal } from '../src/analytics';

const now = new Date('2026-10-22T12:00:00Z');

test('ISO weeks start on the Monday of the week holding 4 January, and only some years have a week 53', () => {
  assert.equal(windowRange({ kind: 'week', period: '2026-W01' }).from, '2025-12-29');
  assert.equal(windowRange({ kind: 'week', period: '2026-W53' }).from, '2026-12-28');
  assert.equal(windowRange({ kind: 'week', period: '2026-W53' }).to, '2027-01-03');
  assert.equal(windowRange({ kind: 'week', period: '2020-W53' }).from, '2020-12-28');
  assert.equal(isoWeeksInYear(2025), 52);
  assert.throws(() => windowRange({ kind: 'week', period: '2025-W53' }), AnalyticsRangeError);
  assert.throws(() => windowRange({ kind: 'week', period: '2026-W00' }), AnalyticsRangeError);
  assert.throws(() => windowRange({ kind: 'week', period: '2026-43' }), AnalyticsRangeError);
  // Weeks run Monday to Sunday and are half-open UTC instants.
  const week = windowRange({ kind: 'week', period: '2026-W43' });
  assert.deepEqual([week.from, week.to, week.start, week.end, week.id],
    ['2026-10-19', '2026-10-25', '2026-10-19T00:00:00.000Z', '2026-10-26T00:00:00.000Z', 'week:2026-W43']);
});

// Weeks only, 22 Oct 2026. Days, months and all time were offered beside weeks for a
// day, and every check between windows that nest was walked round in attack review.
test('days, months and all time are refused by name, and the message says to choose a week', () => {
  for (const params of ['window=day', 'window=day&period=2026-10-21', 'window=month&period=2026-09', 'window=all', 'window=fortnight']) {
    assert.throws(() => parseAnalyticsWindow(new URLSearchParams(params), now), (error: Error) => error instanceof AnalyticsRangeError && /window=week/.test(error.message) && /2026-W43/.test(error.message), params);
    assert.throws(() => parseAnalyticsQuery(new URLSearchParams(params), now), AnalyticsRangeError, params);
  }
  assert.throws(() => windowRange({ kind: 'day', period: '2026-10-21' }), AnalyticsRangeError);
  assert.throws(() => windowRange({ kind: 'month', period: '2026-09' }), AnalyticsRangeError);
  assert.throws(() => windowRange({ kind: 'all', period: null }), AnalyticsRangeError);
});

test('only complete, settled weeks are readable, and the newest one is the default', () => {
  // 22 Oct at noon: week 42 ended on the 19th at midnight, past the settle time.
  assert.equal(latestCompleteWeek(now).period, '2026-W42');
  // Monday 19 Oct at 03:00: week 42 has ended but not settled, so week 41 is the newest.
  assert.equal(latestCompleteWeek(new Date(`2026-10-19T0${LIMITS.analytics.windowSettleHours - 1}:00:00Z`)).period, '2026-W41');
  assert.equal(latestCompleteWeek(new Date(`2026-10-19T0${LIMITS.analytics.windowSettleHours}:00:00Z`)).period, '2026-W42');
  assert.equal(parseAnalyticsWindow(new URLSearchParams(), now).id, 'week:2026-W42');
  assert.equal(parseAnalyticsWindow(new URLSearchParams('window=week'), now).id, 'week:2026-W42');
  assert.throws(() => parseAnalyticsWindow(new URLSearchParams('window=week&period=2026-W43'), now), /not complete/);
  // 1 August 2026 is a Saturday, so the week holding it starts before analytics did.
  assert.throws(() => parseAnalyticsWindow(new URLSearchParams('window=week&period=2026-W31'), now), /starts in the week of/);
  assert.equal(parseAnalyticsWindow(new URLSearchParams('window=week&period=2026-W32'), now).from, '2026-08-03');
  assert.match(windowRefusal(windowRange({ kind: 'week', period: '2026-W32' }), new Date(Date.parse(now.toISOString()) + (LIMITS.analytics.windowPeriodsBackMax + 1) * 7 * 86_400_000)) ?? '', /weeks back/);
  assert.equal(windowReceiptCutoff(windowRange({ kind: 'week', period: '2026-W42' })), `2026-10-19T0${LIMITS.analytics.windowSettleHours}:00:00.000Z`);
  assert.equal(weekAt('2026-10-25T23:59:59Z').period, '2026-W43');
  assert.equal(weekAt('2026-10-26T00:00:00Z').period, '2026-W44');
});

test('the old range and timezone parameters are refused, not snapped, and say what replaced them', () => {
  for (const params of ['from=2026-10-01&to=2026-10-07', 'from=2026-10-01', 'to=2026-10-07', 'timezone=America/New_York',
    'window=year', 'window=week&period=2026-W42&period=2026-W41', 'window=all&period=2026-10', 'window=day&funnel=a,b']) {
    assert.throws(() => parseAnalyticsQuery(new URLSearchParams(params), now), (error: Error) => error instanceof AnalyticsRangeError && /window|period/i.test(error.message), params);
  }
  assert.equal(parseAnalyticsQuery(new URLSearchParams('timezone=UTC'), now).window.period, '2026-W42');
});

test('previous and next weeks step across year boundaries, week 53 included', () => {
  assert.equal(previousPeriod(windowRange({ kind: 'week', period: '2026-W01' })).period, '2025-W52');
  assert.equal(nextPeriod(windowRange({ kind: 'week', period: '2026-W53' })).period, '2027-W01');
  assert.equal(previousPeriod(windowRange({ kind: 'week', period: '2027-W01' })).period, '2026-W53');
  assert.equal(nextPeriod(windowRange({ kind: 'week', period: '2025-W52' })).period, '2026-W01');
});

test('a query is its week: from and to are the week days, with a funnel and nothing else', () => {
  const query = parseAnalyticsQuery(new URLSearchParams('window=week&period=2026-W40&funnel=start,complete'), now);
  assert.equal('filters' in query, false); assert.deepEqual(query.funnel, ['start', 'complete']);
  assert.deepEqual([query.from, query.to, query.timezone], ['2026-09-28', '2026-10-04', 'UTC']);
  assert.equal(windowLabel(windowRange({ kind: 'week', period: '2026-W42' })), 'Week 42 · Oct 12 to 18, 2026 · UTC');
  assert.equal(windowLabel(windowRange({ kind: 'week', period: '2026-W01' })), 'Week 1 · Dec 29, 2025 to Jan 4, 2026 · UTC');
});

// Filters were removed on 23 Oct 2026. Every one is refused by name, checked before
// the week so the answer does not depend on which week was asked for, and never dropped.
test('a filter parameter is refused with filters_removed, whatever the week', () => {
  for (const params of ['window=week&period=2026-W40&country=US', 'country=US', 'build=b1', 'source=direct', 'surface=gallery', 'device=mobile',
    'event=a', 'property=level&value=1', 'value=1', 'drill=key', 'window=all&country=US', 'country=']) {
    assert.throws(() => parseAnalyticsQuery(new URLSearchParams(params), now), (error: Error) => error instanceof AnalyticsFiltersRemovedError && error.code === 'filters_removed'
      && error.message === 'Filters were removed to protect player privacy. Use the breakdown rows in the weekly report instead.', params);
  }
  // A JSON body names them in one object, and clients written before the removal send it empty.
  assert.doesNotThrow(() => refuseFilters({ window: 'week', filters: {} }));
  for (const body of [{ filters: { country: 'US' } }, { country: 'US' }, { filters: 'country=US' }]) assert.throws(() => refuseFilters(body), AnalyticsFiltersRemovedError);
  assert.equal(analyticsReportSchema.safeParse({ ...base, filters: { country: 'US' } }).success, false, 'a fresh report never names a filter');
});

const empty = { plays: null, players: null, playtimeSeconds: null, averagePlaytimeSeconds: null, returningPlayers: null, likes: null, livePlayers: null, peakPlayers: null };
const week = windowRange({ kind: 'week', period: '2026-W40' });
const base = { apiVersion: '1', gameId: '11111111-1111-4111-8111-111111111111', from: week.from, to: week.to, timezone: 'UTC', minPlayers: 5, filters: {}, summary: empty,
  window: { kind: 'week', period: '2026-W40', start: week.start, end: week.end },
  comparison: { from: '2026-09-21', to: '2026-09-27', summary: empty, eligible: false }, daily: [], breakdowns: { source: [], surface: [], country: [], device: [], build: [] }, events: [], retention: [], survival: [], performance: [],
  freshness: { dataSince: null, updatedAt: null, completeThrough: null, partial: true, source: 'postgres', quality: 'legacy', unavailable: [] } };

test('report validation rejects contradictory privacy, identity, window and timestamp claims', () => {
  assert.equal(analyticsReportSchema.safeParse(base).success, true);
  for (const invalid of [
    { ...base, gameId: 'somebody-else' },
    { ...base, from: '2026-09-30' },
    { ...base, timezone: 'America/New_York' },
    { ...base, window: { start: week.start, end: week.end } },
    { ...base, window: { ...base.window, period: '2026-W41' } },
    { ...base, freshness: { ...base.freshness, updatedAt: 'yesterday' } },
    { ...base, summary: { ...empty, players: 1 } },
    { ...base, breakdowns: { ...base.breakdowns, country: [{ value: 'hidden', label: 'Other', plays: 7, players: null, playtimeSeconds: null, withheld: true }] } },
  ]) assert.equal(analyticsReportSchema.safeParse(invalid).success, false);
  // A fresh report drops the moving last-hour figures; a saved one still reads.
  assert.equal('recent' in analyticsReportSchema.parse({ ...base, recent: [] }), false);
});

test('reports saved before fixed windows still parse as stored snapshots', () => {
  const saved = { ...base, from: '2026-10-01', to: '2026-10-02', timezone: 'America/Los_Angeles', window: { start: '2026-10-01T07:00:00Z', end: '2026-10-03T07:00:00Z' },
    comparison: { from: '2026-09-29', to: '2026-09-30', summary: empty, eligible: false }, recent: [{ minutes: 60, plays: null, players: null }] };
  assert.equal(storedAnalyticsReportSchema.safeParse(saved).success, true);
  assert.equal(storedAnalyticsReportSchema.safeParse({ ...saved, window: undefined }).success, true);
  assert.equal(analyticsReportSchema.safeParse(saved).success, false);
  assert.equal(storedAnalyticsReportSchema.safeParse({ ...saved, summary: { ...empty, players: 2 } }).success, false);
});

// Weeks only: a cohort's day-7 and day-30 returns, and a source's seven-day return,
// fall in a later week, which a week's own cutoff cannot count. A row that still carries
// them, kept before the change or sent by a site or broker not yet deployed, is read
// with them stripped: refusing it made the site skip its own kept week in the guard.
test('day-7 and day-30 retention and a source D7 are stripped from fresh and saved reports alike', () => {
  const cohort = { day: '2026-09-28', players: 20, day1: 0.5 };
  for (const schema of [analyticsReportSchema, storedAnalyticsReportSchema]) {
    assert.deepEqual(schema.parse({ ...base, retention: [cohort] }).retention, [cohort]);
    assert.deepEqual(schema.parse({ ...base, retention: [{ ...cohort, day7: 0.1, day30: null }] }).retention, [cohort]);
  }
  const insights = { from: base.from, to: base.to, timezone: 'UTC', updatedAt: '2026-10-05T06:00:00.000Z', minPlayers: 5, discovery: [],
    sources: [{ source: 'direct', players: 20, averagePlaytimeSeconds: 30 }],
    benchmarks: { own: { status: 'unavailable', games: null, medianSeconds: null, lowerSeconds: null, upperSeconds: null }, peers: { status: 'unavailable', games: null, medianSeconds: null, lowerSeconds: null, upperSeconds: null } },
    drilldown: { builds: [], sessions: [], errors: [], selectedBuild: null, selectedSession: null }, unavailable: [] };
  const old = { ...insights, sources: [{ ...insights.sources[0], day7: 0.5, maturePlayers: 10 }] };
  for (const schema of [analyticsReportSchema, storedAnalyticsReportSchema]) assert.deepEqual(schema.parse({ ...base, insights: old }).insights!.sources, insights.sources);
});

test('nested counts and conversion rates cannot expose suppressed complements', () => {
  const report = { ...base, summary: { ...empty, players: 20 }, freshness: { ...base.freshness, source: 'clickhouse', quality: 'exact' } };
  for (const change of [
    { survival: [{ seconds: 0, players: 20, share: 1 }, { seconds: 30, players: 10, share: .5 }, { seconds: 60, players: 9, share: .45 }] },
    { funnels: [{ name: 'test', steps: [{ name: 'a', players: 20, conversion: 1 }, { name: 'b', players: 10, conversion: .5 }, { name: 'c', players: 9, conversion: .45 }] }] },
    { funnels: [{ name: 'test', steps: [{ name: 'a', players: 20, conversion: 1 }, { name: 'b', players: null, conversion: .45 }] }] },
    { survival: [{ seconds: 0, players: null, share: .5 }] },
  ]) assert.equal(analyticsReportSchema.safeParse({ ...report, ...change }).success, false);
  assert.equal(storedAnalyticsReportSchema.safeParse({ ...report, recent: [{ minutes: 60, plays: 5, players: 5 }, { minutes: 2880, plays: 6, players: 6 }] }).success, false);
  assert.equal(analyticsReportSchema.safeParse({ ...report, funnels: [{ name: 'test', steps: [{ name: 'a', players: 20, conversion: 1 }, { name: 'b', players: 10, conversion: .5 }, { name: 'c', players: 5, conversion: .25 }] }] }).success, true);
});

test('a repeated step in a row is collapsed, so [a, b] and [a, a, b] are one question', () => {
  assert.deepEqual(parseAnalyticsQuery(new URLSearchParams('window=week&period=2026-W40&funnel=a,a,b'), now).funnel, ['a', 'b']);
  assert.deepEqual(parseAnalyticsQuery(new URLSearchParams('window=week&period=2026-W40&funnel=a,b,a,b'), now).funnel, ['a', 'b', 'a', 'b']);
  assert.throws(() => parseAnalyticsQuery(new URLSearchParams('window=week&period=2026-W40&funnel=a,a'), now));
});

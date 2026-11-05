import { z } from "./zod";
import { ANALYTICS_KINDS, ANALYTICS_WINDOW_KINDS, LIMITS, REMOVED_ANALYTICS_FILTERS, type AnalyticsQuery, type AnalyticsReport, type AnalyticsWindow } from "@opengame/shared/browser";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}, "Use a real calendar date in YYYY-MM-DD format.");
const timezone = z.string().refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Use an IANA timezone.");
const step = z.string().min(1).max(LIMITS.play.frameEventBytesMax).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
/* ---------------------------------------------------------------------------
 * Weeks.
 *
 * A creator used to choose any from, any to and any timezone. Two ranges one day
 * apart differ by whoever played only on the extra day, two timezones an hour
 * apart by whoever played in that hour, and no check of one report closes that
 * while the range is free, because a reader can always skip the neighbour that
 * would have been checked (findings x10-sec-r1 H1 and H2).
 *
 * The first fix was a fixed menu of UTC days, ISO weeks, calendar months and all
 * time, with checks between every pair that nest or overlap. Four attack rounds
 * on that branch each found a way past those checks, every one of them in the
 * nesting: a day beside its week in one filter cell, a week across two months,
 * all time stepped a day at a time, the order two neighbours were kept in. So a
 * creator now reads complete ISO weeks and nothing else. Weeks are disjoint, so
 * no window lies inside or across another and the whole class is gone rather
 * than checked; what is left is one week read many ways, which the read checks
 * against that week's kept reports (apps/web/src/lib/analytics/read.ts). A week
 * is readable once it is complete and settled, so every read of it counts the
 * same receipts. The narrowing was made on 22 Oct 2026.
 * ------------------------------------------------------------------------- */
const DAY = 86_400_000, WEEK = 7 * DAY;
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
const settleMs = () => LIMITS.analytics.windowSettleHours * 3_600_000;
const EXAMPLE = "2026-W43";

/** Thrown for a window a reader may not ask for. Routes answer it as 400
 * invalid_range with this message, which names the parameters that replaced
 * from, to and timezone, so an old script is told what to change. */
export class AnalyticsRangeError extends Error {
  readonly code = "invalid_range";
  constructor(message = `Choose window=week and a period such as ${EXAMPLE}. Analytics covers complete ISO weeks in UTC, and no longer accepts days, months, all time, from, to or a timezone.`) {
    super(message); this.name = "AnalyticsRangeError";
  }
}

/** Monday of ISO week one, which is the week holding 4 January. */
function isoYearStart(year: number): number {
  const fourth = Date.UTC(year, 0, 4);
  return fourth - ((new Date(fourth).getUTCDay() + 6) % 7) * DAY;
}
/** 52 or 53. A year has 53 when its last Monday-to-Sunday run still holds its Thursday. */
export function isoWeeksInYear(year: number): number {
  return Math.round((isoYearStart(year + 1) - isoYearStart(year)) / WEEK);
}
function isoWeekOf(time: number): string {
  const thursday = time + (3 - ((new Date(time).getUTCDay() + 6) % 7)) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  return `${year}-W${String(1 + Math.floor((thursday - isoYearStart(year)) / WEEK)).padStart(2, "0")}`;
}

export type AnalyticsWindowRange = AnalyticsWindow & {
  /** Canonical identity: week:2026-W43. */
  id: string;
  /** Inclusive UTC days, Monday and Sunday. */
  from: string; to: string;
  /** Half-open UTC instants. */
  start: string; end: string;
};
/** The days a week covers. Throws on a period that is not a real ISO week,
 * 2025-W53 included, which does not exist. */
export function windowRange(window: { kind: string; period: string | null }): AnalyticsWindowRange {
  if (window.kind !== "week") throw new AnalyticsRangeError();
  const match = /^(\d{4})-W(\d{2})$/.exec(window.period ?? "");
  const year = Number(match?.[1]), week = Number(match?.[2]);
  if (!match || week < 1 || week > isoWeeksInYear(year)) throw new AnalyticsRangeError(`Choose an ISO week as YYYY-Www, such as ${EXAMPLE}.`);
  const start = isoYearStart(year) + (week - 1) * WEEK;
  return { kind: "week", period: window.period!, id: `week:${window.period}`, from: isoDay(start), to: isoDay(start + WEEK - DAY),
    start: new Date(start).toISOString(), end: new Date(start + WEEK).toISOString() };
}
/** The ISO week a from and to name, when they are exactly one in UTC, and null for any
 * other range or zone. A Studio broker or template deployed before weeks only names a
 * week this way, and so does this branch's broker when it talks to a site deployed
 * before it, while the two halves of a split deploy disagree. */
export function exactWeek(from: unknown, to: unknown, timezone: unknown = "UTC"): AnalyticsWindowRange | null {
  if (typeof from !== "string" || typeof to !== "string" || timezone !== "UTC" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  const start = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(start)) return null;
  const week = weekAt(new Date(start));
  return week.from === from && week.to === to ? week : null;
}
/** The query the Studio route reads from a broker of either age. Every broker names its
 * week as a from and a to in UTC with an empty `filters`, the shape the site before weeks
 * only takes; a from and to that are exactly one ISO week become that week, any other
 * range or zone is null, and a filter throws AnalyticsFiltersRemovedError. A query that
 * already names its window is parsed as it stands. */
export function studioWeekQuery(raw: Record<string, unknown>): AnalyticsQuery | null {
  refuseFilters(raw);
  const rest = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "filters"));
  const week = rest.window === undefined ? exactWeek(rest.from, rest.to, rest.timezone ?? "UTC") : null;
  const parsed = analyticsQuerySchema.safeParse(week ? { ...rest, window: { kind: week.kind, period: week.period }, timezone: "UTC" } : rest);
  return parsed.success ? parsed.data as AnalyticsQuery : null;
}
/** Sent by a broker that reads week reports. A request without it is from a broker
 * deployed before weeks only, which parses the older report shape, and is answered with
 * preWeeksReport. */
export const STUDIO_WEEKS_HEADER = "x-opengame-analytics-weeks";
/** A week report in the shape a site deployed before weeks only sent, for a broker
 * deployed before it. That broker's schema requires day7 and day30 on every cohort and
 * on every source, and a number of events on every event row: the cohort and source
 * rates are null, as they are unmeasurable inside one week, and an event row whose count
 * is withheld is left out, as that broker never received such a row. Delete once the
 * broker is deployed. */
export function preWeeksReport(report: AnalyticsReport): Record<string, unknown> {
  const events = report.events.filter(row => typeof row.events === "number").map(row => row.properties
    ? { ...row, properties: row.properties.filter(property => typeof property.events === "number") } : row);
  return { ...report, events,
    retention: report.retention.map(row => ({ ...row, day7: null, day30: null })),
    ...(report.insights ? { insights: { ...report.insights, sources: report.insights.sources.map(row => ({ ...row, day7: null, maturePlayers: null })) } } : {}) };
}
/** The ISO week holding a UTC instant. */
export function weekAt(instant: string | Date): AnalyticsWindowRange {
  return windowRange({ kind: "week", period: isoWeekOf(new Date(instant).getTime()) });
}
/** Whether every receipt this week will ever count has had time to land. */
export function windowComplete(window: { end: string }, now = new Date()): boolean {
  return now.getTime() >= Date.parse(window.end) + settleMs();
}
/** The receipt cutoff every read of this week uses, for ever. A second read of
 * one week cannot differ from the first by whoever arrived late in between. */
export function windowReceiptCutoff(window: { end: string }): string {
  return new Date(Date.parse(window.end) + settleMs()).toISOString();
}
/** The newest week that is complete and settled. */
export function latestCompleteWeek(now = new Date()): AnalyticsWindowRange {
  return previousPeriod(weekAt(new Date(now.getTime() - settleMs())));
}
export function previousPeriod(window: { start: string }): AnalyticsWindowRange {
  return weekAt(new Date(Date.parse(window.start) - DAY));
}
export function nextPeriod(window: { end: string }): AnalyticsWindowRange {
  return weekAt(window.end);
}
/** A reader may ask for a complete week that starts on or after the first day of
 * analytics and is at most windowPeriodsBackMax weeks old. Null is yes. */
export function windowRefusal(window: AnalyticsWindowRange, now = new Date()): string | null {
  if (!windowComplete(window, now)) return "This week is not complete yet. Choose an earlier one.";
  if (window.from < LIMITS.analytics.windowsFromDay) return `Analytics starts in the week of ${LIMITS.analytics.windowsFromDay}. Choose a later week.`;
  const back = Math.round((Date.parse(latestCompleteWeek(now).start) - Date.parse(window.start)) / WEEK);
  if (back > LIMITS.analytics.windowPeriodsBackMax) return `Choose a week at most ${LIMITS.analytics.windowPeriodsBackMax} weeks back.`;
  return null;
}

/** The sentence every reader gives for a filter, word for word: the API, the CLI,
 * the MCP server and Studio's broker. */
export const ANALYTICS_FILTERS_REMOVED = "Filters were removed to protect player privacy. Use the breakdown rows in the weekly report instead.";
/** What the stats route says to a CLI or analytics MCP older than
 * analytics.reportsMinimumCliVersion. Old versions print a refusal's message as it
 * is, so this sentence is the whole of what somebody holding an old tarball reads:
 * why it stopped working, and the exact command that fixes it. */
export const ANALYTICS_CLI_OUTDATED = "Analytics reports now cover one week, and filters were removed to protect player privacy, so this version cannot read them. Update the OpenGame CLI to 0.3.1 or newer and the analytics MCP to 0.2.0 or newer, then run the same command.";
/** Thrown for any filter parameter. Routes answer it as 400 filters_removed. A
 * filter is refused rather than ignored, because a script that asked for one
 * country and quietly received every country would report the wrong numbers. */
export class AnalyticsFiltersRemovedError extends Error {
  readonly code = "filters_removed";
  constructor() { super(ANALYTICS_FILTERS_REMOVED); this.name = "AnalyticsFiltersRemovedError"; }
}

type Input = URLSearchParams | Record<string, string | string[] | undefined>;
const toParams = (input: Input): URLSearchParams => input instanceof URLSearchParams ? input : new URLSearchParams(Object.entries(input).flatMap(([key, value]) =>
  value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(item => [key, item])));
/** Refuses the parameters weeks replaced. Only the settings page snaps an old
 * address to a week, and it says so on the page; an API caller is refused, so a
 * script asking for one range never quietly receives another. */
export function refuseLegacyRange(input: Input): void {
  const params = toParams(input);
  if (params.has("from") || params.has("to")) throw new AnalyticsRangeError(`from and to are no longer accepted. Choose window=week and a period such as ${EXAMPLE}.`);
  const zone = params.getAll("timezone");
  if (zone.length > 1 || (zone.length === 1 && zone[0] !== "UTC")) throw new AnalyticsRangeError(`Analytics covers ISO weeks in UTC. Leave timezone out, or set it to UTC, and choose window=week and a period such as ${EXAMPLE}.`);
}
/** Refuses every parameter a filtered report used to take, `drill` included, which
 * picked one build's sessions out of the insights. */
export function refuseFilters(input: Input | Record<string, unknown>): void {
  const names = input instanceof URLSearchParams ? [...input.keys()] : Object.keys(input).filter(name => (input as Record<string, unknown>)[name] !== undefined);
  // A JSON body names them inside one object. An empty one asks for nothing, and
  // clients written before the removal send it on every request.
  const nested = !(input instanceof URLSearchParams) && "filters" in input && (input as Record<string, unknown>).filters !== undefined &&
    (typeof (input as Record<string, unknown>).filters !== "object" || (input as Record<string, unknown>).filters === null || Object.keys((input as Record<string, unknown>).filters as object).length > 0);
  if (nested || names.some(name => (REMOVED_ANALYTICS_FILTERS as readonly string[]).includes(name) || name === "drill")) throw new AnalyticsFiltersRemovedError();
}
/** ?window=week&period=2026-W43. No period, or no window at all, is the newest
 * complete week. Any other window is refused by name, so a script written for
 * days or months learns what replaced them rather than receiving a week. */
export function parseAnalyticsWindow(input: Input, now = new Date()): AnalyticsWindowRange {
  const params = toParams(input);
  refuseLegacyRange(params);
  for (const key of ["window", "period"]) if (params.getAll(key).length > 1) throw new AnalyticsRangeError(`Use ${key} once.`);
  const kind = params.get("window") ?? "week", period = params.get("period");
  if (kind !== "week") throw new AnalyticsRangeError(`window=${kind.slice(0, 20)} is not available. Choose window=week and a period such as ${EXAMPLE}. Analytics covers complete ISO weeks only.`);
  const window = period === null ? latestCompleteWeek(now) : windowRange({ kind, period });
  const refusal = windowRefusal(window, now);
  if (refusal) throw new AnalyticsRangeError(refusal);
  return window;
}

const windowSchema = z.object({ kind: z.enum(ANALYTICS_WINDOW_KINDS), period: z.string() }).strict();
const queryObject = z.object({
  window: windowSchema, from: date, to: date, timezone: z.literal("UTC"),
  funnel: z.array(step).min(2).max(LIMITS.analytics.funnelStepsMax).optional(),
}).strict();
/** The window is a real, allowed week and from and to are exactly its days. */
function queryIssues(value: z.infer<typeof queryObject>, context: z.RefinementCtx, now: Date) {
  let window: AnalyticsWindowRange;
  try { window = windowRange(value.window); }
  catch (error) { context.addIssue({ code: "custom", path: ["window"], message: (error as Error).message }); return; }
  if (window.from !== value.from || window.to !== value.to) context.addIssue({ code: "custom", path: ["from"], message: "from and to must be the week's own days." });
  const refusal = windowRefusal(window, now);
  if (refusal) context.addIssue({ code: "custom", path: ["window"], message: refusal });
  if (value.funnel && canonicalFunnel(value.funnel).length < 2) context.addIssue({ code: "custom", path: ["funnel"], message: "A funnel needs two different steps in a row." });
}
/** A funnel with the same step twice in a row asks who did that step twice, and
 * beside the funnel without the repeat it differences: [a, b] against [a, a, b]
 * is whoever did a only once before b, with nobody acting against the check.
 * Repeats in a row are collapsed, so those two are one query and one report.
 * Other funnels that nest, such as [a, c] beside [a, b, c], are checked against
 * each other when the second is read (funnelKey in apps/web/src/lib/analytics). */
export function canonicalFunnel(steps: readonly string[]): string[] {
  return steps.filter((step, index) => index === 0 || step !== steps[index - 1]);
}
export const analyticsQuerySchema = queryObject.superRefine((value, context) => queryIssues(value, context, new Date()));

/** The one boundary every creator API parses. A filter is an
 * AnalyticsFiltersRemovedError, checked first so its answer does not depend on the
 * week; a window refusal is an AnalyticsRangeError; a bad funnel is a zod error. */
export function parseAnalyticsQuery(input: Input, now = new Date()): AnalyticsQuery {
  const params = toParams(input);
  refuseFilters(params);
  const window = parseAnalyticsWindow(params, now);
  const funnel = canonicalFunnel(params.getAll("funnel").flatMap(value => value.split(",")));
  return queryObject.superRefine((value, context) => queryIssues(value, context, now)).parse({
    window: { kind: window.kind, period: window.period }, from: window.from, to: window.to, timezone: "UTC", ...(funnel.length ? { funnel } : {}),
  }) as AnalyticsQuery;
}
/** The week a parsed query names, with its instants. */
export function queryWindow(query: Pick<AnalyticsQuery, "window">): AnalyticsWindowRange {
  return windowRange(query.window);
}
/** How the stats page and the report mail name a week: "Week 43 · Oct 19 to 25, 2026 · UTC". */
export function windowLabel(window: AnalyticsWindowRange): string {
  const day = (value: string, year = false) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  const sameYear = window.from.slice(0, 4) === window.to.slice(0, 4), sameMonth = window.from.slice(0, 7) === window.to.slice(0, 7);
  const end = sameMonth ? `${Number(window.to.slice(8))}, ${window.to.slice(0, 4)}` : day(window.to, true);
  return `Week ${Number(window.period.slice(6))} · ${day(window.from, !sameYear)} to ${end} · UTC`;
}

export function analyticsDay(instant: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function analyticsRangeInstants(query: { from: string; to: string; timezone: string }): { start: string; end: string } {
  const boundary = (day: string) => {
    // Searching dates instead of subtracting a fixed offset handles DST, including
    // zones whose clock changes at midnight and dates that were skipped entirely.
    const center = Date.parse(`${day}T00:00:00Z`);
    let low = center - 2 * 86_400_000, high = center + 2 * 86_400_000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (analyticsDay(new Date(middle), query.timezone) < day) low = middle + 1;
      else high = middle;
    }
    return new Date(low).toISOString();
  };
  return { start: boundary(query.from), end: boundary(new Date(Date.parse(query.to) + 86_400_000).toISOString().slice(0, 10)) };
}

const number = z.number().finite().nonnegative();
export const analyticsInstantSchema = z.iso.datetime({ offset: true });
const instant = analyticsInstantSchema;
const ratio = z.number().finite().min(0).max(1).nullable();
const metric = number.nullable();
const summary = z.object({ plays: metric, players: metric, playtimeSeconds: metric, averagePlaytimeSeconds: metric,
  returningPlayers: metric, likes: metric, livePlayers: metric, peakPlayers: metric });
const breakdown = z.object({ value: z.string(), label: z.string(), plays: metric, players: metric, playtimeSeconds: metric, withheld: z.boolean() });
const signalCoverage = z.object({ status: z.enum(["observed", "partial", "unavailable", "withheld"]),
  eligiblePlayers: metric, measuredPlayers: metric, reason: z.string(), provenance: z.enum(["sdk", "host", "game_reported"]) }).strict();
const engagementSignal = z.object({ players: metric, events: metric, share: ratio, coverage: signalCoverage }).strict();
export const analyticsSignalsSchema = z.object({
  heapMb: z.object({ p50: metric, p90: metric, statistic: z.literal("per_player_mean"), coverage: signalCoverage }).strict(),
  firstInput: engagementSignal, idle: engagementSignal, pause: engagementSignal, mute: engagementSignal,
  fullscreen: engagementSignal, leaderboard: engagementSignal,
}).strict();
// Strict nested objects deliberately reject capabilities, even if an internal
// caller accidentally passes the interactive drilldown result to an exporter.
const benchmark = z.object({ status: z.enum(["available", "insufficient", "unavailable"]), games: metric,
  medianSeconds: metric, lowerSeconds: metric, upperSeconds: metric }).strict();
// A source's seven-day return and its matured cohort were dropped on 22 Oct 2026 with
// every other figure a week cannot measure inside itself. A row that still carries them
// is read with them stripped rather than refused, the way the report drops the last-hour
// figures: a week kept before the change still has to reach the guard and be served,
// since a kept row that fails to parse is skipped by both, and the broker and the site
// deploy separately, so each has to read what the other sends while one is behind. The
// row is not strict for the same reason, and stripping still keeps anything else out.
const sourceRow = z.object({ source: z.string(), players: metric, averagePlaytimeSeconds: metric });
export const analyticsInsightsSchema = z.object({
  from: date, to: date, timezone, updatedAt: instant, minPlayers: z.literal(LIMITS.platform.sdk.analyticsGroupMin),
  discovery: z.array(z.object({ surface: z.string(), impressions: metric, pageViews: metric, plays: metric, clickThrough: ratio, playThrough: ratio }).strict()),
  sources: z.array(sourceRow),
  benchmarks: z.object({ own: benchmark, peers: benchmark }).strict(),
  drilldown: z.object({
    builds: z.array(z.object({ label: z.string(), players: number, plays: number, averagePlaytimeSeconds: metric }).strict()),
    sessions: z.array(z.object({ label: z.string(), players: number, sessions: number }).strict()),
    errors: z.array(z.object({ category: z.string(), kind: z.string(), players: number, errors: number }).strict()),
    selectedBuild: z.string().nullable(), selectedSession: z.string().nullable(),
  }).strict(), unavailable: z.array(z.string()),
}).strict();
const reportWindow = z.object({ kind: z.enum(ANALYTICS_WINDOW_KINDS), period: z.string(), start: instant, end: instant }).strict();
// A saved report may predate weeks, or name a day or month from the branch that
// offered them, and still has to export and drain for the ninety days it is kept.
const savedWindow = z.object({ kind: z.string().optional(), period: z.string().nullable().optional(), start: instant, end: instant });
/** One shape, read two ways. A report made now names its fixed window and is in
 * UTC, and the live figures that moved with the clock are gone from it. A report
 * saved before 22 Oct 2026 may carry a viewer timezone, a bare start and end, or
 * the last-hour figures, and it still has to export and drain for the ninety
 * days it is kept, so stored snapshots are read with the second. */
function reportSchema(fresh: boolean) {
  const shape = z.object({
  apiVersion: z.string(), gameId: z.uuid(), from: date, to: date, timezone: fresh ? z.literal("UTC") : timezone, minPlayers: z.literal(LIMITS.platform.sdk.analyticsGroupMin),
  // Always empty on a fresh report (see AnalyticsReport.filters). A snapshot saved
  // before 23 Oct 2026 may name the filters it was made under; nothing reads them, and
  // such a snapshot is no longer exported or drained (readSnapshot in analytics-reports).
  filters: (fresh ? z.object({}).strict() : z.record(z.string(), z.string())) as unknown as z.ZodType<Record<string, never>>, summary,
  funnel: z.array(step).min(2).max(LIMITS.analytics.funnelStepsMax).optional(),
  window: fresh ? reportWindow : savedWindow.optional(),
  comparison: z.object({ from: date, to: date, summary, eligible: z.boolean() }),
  daily: z.array(z.object({ day: date, plays: metric, players: metric, playtimeSeconds: metric, partial: z.boolean() })),
  breakdowns: z.object({ source: z.array(breakdown), surface: z.array(breakdown), country: z.array(breakdown), device: z.array(breakdown), build: z.array(breakdown) }),
  events: z.array(z.object({ day: date.optional(), name: z.string(), events: metric, players: metric, shareOfPlayers: ratio,
    source: z.literal("game_reported"), properties: z.array(z.object({ key: z.string(), value: z.string(), events: metric, players: metric })).optional() })),
  // A cohort's return the next day, inside its own week. Day-7 and day-30 returns fall
  // in a later week, which a week's own cutoff cannot count, so they are gone; a row
  // that still carries them, always empty, is read with them stripped (see sourceRow).
  retention: z.array(z.object({ day: date, players: metric, day1: ratio })),
  survival: z.array(z.object({ seconds: number, players: metric, share: ratio })),
  performance: z.array(z.object({ buildId: z.string(), plays: number, readyP50Ms: metric, readyP90Ms: metric, errorsPer100Plays: metric, fpsP50: metric })),
  signals: analyticsSignalsSchema.optional(),
  insights: analyticsInsightsSchema.optional(),
  preview: z.array(z.object({ eventId: z.string(), occurredAt: instant, kind: z.enum(ANALYTICS_KINDS), name: z.string(), props: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])) })).optional(),
  funnels: z.array(z.object({ name: z.string(), steps: z.array(z.object({ name: z.string(), players: metric, conversion: ratio })) })).optional(),
  freshness: z.object({ receiptWatermark: instant.nullable().optional(), dataSince: instant.nullable(), updatedAt: instant.nullable(), completeThrough: instant.nullable(), partial: z.boolean(),
    source: z.enum(["clickhouse", "postgres"]), quality: z.enum(["exact", "estimated", "legacy"]), unavailable: z.array(z.string()) }),
 });
  // Reports saved before 22 Oct 2026 may carry the last-hour figures. A fresh one
  // drops them on parse, since the object is not strict.
  const object = (fresh ? shape : shape.extend({ recent: z.array(z.object({ minutes: number, plays: metric, players: metric })).optional() })) as typeof shape;
  return object.superRefine((report, context) => {
  const issue = (path: (string|number)[], message: string) => context.addIssue({ code: "custom", path, message });
  if (report.from > report.to) issue(["to"], "Report dates are reversed.");
  if (fresh && report.window?.kind) {
    try {
      const own = windowRange({ kind: report.window.kind, period: report.window.period ?? null });
      if (own.from !== report.from || own.to !== report.to || own.start !== new Date(report.window.start).toISOString() || own.end !== new Date(report.window.end).toISOString())
        issue(["window"], "A report describes exactly its window's days.");
    } catch { issue(["window"], "A report names a real window."); }
  }
  if (report.comparison.from > report.comparison.to || (report.window ? report.comparison.to > report.from : report.comparison.to >= report.from)) issue(["comparison"], "The comparison must precede this range.");
  if(report.window && Date.parse(report.window.start)>=Date.parse(report.window.end)) issue(["window"],"The interval must have positive duration.");
  const count = (value: number|null, path:(string|number)[]) => {
    if (value !== null && (!Number.isInteger(value) || value < report.minPlayers)) issue(path, "Small player groups must be withheld.");
  };
  count(report.summary.players,["summary","players"]);
  count(report.summary.returningPlayers,["summary","returningPlayers"]);
  count(report.summary.livePlayers,["summary","livePlayers"]);
  count(report.summary.peakPlayers,["summary","peakPlayers"]);
  count(report.comparison.summary.players,["comparison","summary","players"]);
  report.daily.forEach((row,index)=>{
    if (row.day<report.from || row.day>report.to) issue(["daily",index,"day"], "Day is outside the report range.");
    count(row.players,["daily",index,"players"]);
  });
  for (const [dimension,rows] of Object.entries(report.breakdowns)) rows.forEach((row,index)=>{
    if (row.withheld && [row.plays,row.players,row.playtimeSeconds].some(value=>value!==null)) issue(["breakdowns",dimension,index], "Withheld cells cannot carry metrics.");
    count(row.players,["breakdowns",dimension,index,"players"]);
  });
  report.events.forEach((row,index)=>{
    count(row.players,["events",index,"players"]);
    row.properties?.forEach((property,p)=>count(property.players,["events",index,"properties",p,"players"]));
  });
  report.retention.forEach((row,index)=>count(row.players,["retention",index,"players"]));
  report.survival.forEach((row,index)=>count(row.players,["survival",index,"players"]));
  const recent = "recent" in report ? (report.recent as { minutes: number; plays: number | null; players: number | null }[] | undefined) : undefined;
  recent?.forEach((row,index)=>count(row.players,["recent",index,"players"]));
  report.funnels?.forEach((row,index)=>row.steps.forEach((step,s)=>count(step.players,["funnels",index,"steps",s,"players"])));
  const nested = (values:(number|null)[],path:(string|number)[],total?:number|null) => {
    const visible = [...values,...(total === undefined ? [] : [total])].filter((value):value is number=>value!==null);
    if (visible.some((a,i)=>visible.slice(i+1).some(b=>a!==b && Math.abs(a-b)<report.minPlayers))) {
      issue(path,"Nested counts must withhold complementary groups below the privacy threshold.");
    }
  };
  nested(recent?.map(row=>row.players) ?? [],["recent"]);
  recent?.forEach((row,index)=>{
    if(row.players===null && row.plays!==null) issue(["recent",index],"Withheld player windows cannot carry play counts.");
  });
  nested(report.survival.map(row=>row.players),["survival"],report.summary.players);
  report.survival.forEach((row,index)=>{
    if(row.players===null && row.share!==null) issue(["survival",index,"share"],"Withheld survival counts cannot carry shares.");
  });
  report.funnels?.forEach((row,index)=>{
    nested(row.steps.map(step=>step.players),["funnels",index],report.summary.players);
    row.steps.forEach((step,s)=>{
      if((step.players===null || row.steps[0]?.players===null) && step.conversion!==null) issue(["funnels",index,"steps",s,"conversion"],"Withheld funnel counts cannot carry conversion rates.");
    });
  });
  if (report.signals) for (const [key, signal] of Object.entries(report.signals)) {
    const path = ["signals", key];
    const coverage = signal.coverage;
    count(coverage.eligiblePlayers, [...path,"coverage","eligiblePlayers"]);
    count(coverage.measuredPlayers, [...path,"coverage","measuredPlayers"]);
    nested([coverage.measuredPlayers], [...path,"coverage"], coverage.eligiblePlayers);
    if (coverage.eligiblePlayers !== null && coverage.measuredPlayers !== null && coverage.measuredPlayers > coverage.eligiblePlayers)
      issue(path,"Measured audience cannot exceed the eligible audience.");
    if (coverage.status === "observed" && (coverage.measuredPlayers === null || coverage.measuredPlayers !== coverage.eligiblePlayers))
      issue(path,"Observed coverage requires the complete eligible audience.");
    const hidden = coverage.status === "unavailable" || coverage.status === "withheld";
    if (hidden && coverage.measuredPlayers !== null) issue(path,"Unavailable or withheld coverage cannot carry measured audience counts.");
    if ("players" in signal) {
      if (key === "leaderboard" && signal.share !== null) issue(path,"Accepted score receipts have no proven historical participation denominator.");
      count(signal.players, [...path,"players"]);
      nested([signal.players],path,coverage.measuredPlayers);
      if (signal.players !== null && (coverage.measuredPlayers === null || signal.players > coverage.measuredPlayers))
        issue(path,"Participants must belong to the measured audience.");
      if (signal.events !== null && (!Number.isInteger(signal.events) || signal.players === null || signal.events < signal.players))
        issue(path,"Event counts must include every observed participant.");
      if ((hidden || signal.players === null) && (signal.events !== null || signal.share !== null))
        issue(path,"Withheld participants cannot carry event counts or rates.");
      if (signal.share !== null && (coverage.measuredPlayers === null || signal.players === null || Math.abs(signal.share-signal.players/coverage.measuredPlayers)>1e-9))
        issue(path,"Participation uses the measured audience denominator.");
    } else if ((hidden || coverage.measuredPlayers === null) && (signal.p50 !== null || signal.p90 !== null)) {
      issue(path,"Heap quantiles require a reportable measured audience.");
    }
  }
  const insights=report.insights;
  if (insights) {
    if (insights.from!==report.from || insights.to!==report.to || insights.timezone!==report.timezone)
      issue(["insights"],"Insights must describe the canonical report range.");
    insights.discovery.forEach((row,i)=>{
      for(const key of ["impressions","pageViews","plays"] as const) count(row[key],["insights","discovery",i,key]);
      nested([row.impressions,row.pageViews,row.plays],["insights","discovery",i]);
      nested([row.plays],["insights","discovery",i,"plays"],report.summary.players);
      if ((row.impressions===null || row.pageViews===null) && row.clickThrough!==null) issue(["insights","discovery",i],"Withheld stages cannot carry rates.");
      if ((row.pageViews===null || row.plays===null) && row.playThrough!==null) issue(["insights","discovery",i],"Withheld stages cannot carry rates.");
      if (row.impressions!==null && row.pageViews!==null && row.pageViews>row.impressions || row.pageViews!==null && row.plays!==null && row.plays>row.pageViews)
        issue(["insights","discovery",i],"Discovery stages must be nested.");
      if (row.clickThrough!==null && row.impressions!==null && row.pageViews!==null && Math.abs(row.clickThrough-row.pageViews/row.impressions)>1e-9 ||
          row.playThrough!==null && row.pageViews!==null && row.plays!==null && Math.abs(row.playThrough-row.plays/row.pageViews)>1e-9)
        issue(["insights","discovery",i],"Discovery rates must use their released stages.");
    });
    insights.sources.forEach((row,i)=>{
      count(row.players,["insights","sources",i,"players"]);
    });
    for (const [key,rows] of Object.entries(insights.drilldown)) if(Array.isArray(rows)) rows.forEach((row,i)=>count(row.players,["insights","drilldown",key,i,"players"]));
    for(const [key,value] of Object.entries(insights.benchmarks)) {
      count(value.games,["insights","benchmarks",key,"games"]);
      if(value.status!=="available" && [value.games,value.medianSeconds,value.lowerSeconds,value.upperSeconds].some(v=>v!==null))
        issue(["insights","benchmarks",key],"Unavailable benchmarks cannot carry values.");
    }
  }
});
}
export const analyticsReportSchema = reportSchema(true);
export const storedAnalyticsReportSchema = reportSchema(false);


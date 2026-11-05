import { LIMITS } from "@opengame/shared";
import type { AnalyticsReport } from "@opengame/shared/analytics";
import { latestCompleteWeek, windowRange, type AnalyticsWindowRange } from "@opengame/protocol";

export const gameId = "11111111-1111-4111-8111-111111111111";
export const testToken = "ogt_0123456789abcdef_" + "A".repeat(43);

/** A report for one week, shaped the way the API answers now: the week named,
 * UTC, and the comparison ending where the week starts. The fixture follows the
 * clock rather than a fixed week, because the server's default is the newest
 * complete week and a test of that default has to agree with it on any day. */
export function reportFor(window: AnalyticsWindowRange): AnalyticsReport {
  const days = (Date.parse(window.end) - Date.parse(window.start)) / 86_400_000;
  const comparisonTo = new Date(Date.parse(window.start) - 86_400_000).toISOString().slice(0, 10);
  const comparisonFrom = new Date(Date.parse(window.start) - days * 86_400_000).toISOString().slice(0, 10);
  return {
    apiVersion: LIMITS.platform.apiVersion, gameId, from: window.from, to: window.to, timezone: "UTC",
    minPlayers: LIMITS.platform.sdk.analyticsGroupMin, filters: {},
    window: { kind: window.kind, period: window.period, start: window.start, end: window.end },
    summary: { plays: 27, players: 15, playtimeSeconds: 900, averagePlaytimeSeconds: 60, returningPlayers: null, likes: 6, livePlayers: null, peakPlayers: 7 },
    comparison: { from: comparisonFrom, to: comparisonTo, eligible: false,
      summary: { plays: null, players: null, playtimeSeconds: null, averagePlaytimeSeconds: null, returningPlayers: null, likes: null, livePlayers: null, peakPlayers: null } },
    daily: [{ day: window.to, plays: 27, players: 15, playtimeSeconds: 900, partial: true }],
    breakdowns: { source: [], surface: [], country: [{ value: "US", label: "United States", plays: 27, players: 15, playtimeSeconds: 900, withheld: false }], device: [], build: [] },
    events: [{ name: "level_end", events: 8, players: null, shareOfPlayers: null, source: "game_reported" }],
    retention: [], survival: [], performance: [],
    preview: [{ eventId: "test", occurredAt: `${window.to}T12:00:00Z`, kind: "custom", name: "level_end", props: { level: "one" } }],
    funnels: [{ name: "Progress", steps: [{ name: "level_end", players: null, conversion: null }] }],
    freshness: { dataSince: `${window.from}T00:00:00Z`, updatedAt: `${window.to}T12:00:00Z`, completeThrough: window.end, partial: true, source: "postgres", quality: "legacy", unavailable: ["performance"] },
  };
}

/** What the API answers with no window or period: the newest complete week. */
export const report: AnalyticsReport = reportFor(latestCompleteWeek());

export function reportForQuery(query: URLSearchParams): AnalyticsReport {
  const funnel = query.get("funnel")?.split(",");
  const period = query.get("period");
  const window = period === null ? latestCompleteWeek() : windowRange({ kind: "week", period });
  return { ...reportFor(window),
    ...(funnel ? { funnel, funnels: [{ name: "Requested funnel", steps: funnel.map(name => ({ name, players: null, conversion: null })) }] } : {}) };
}

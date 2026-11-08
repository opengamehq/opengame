/** The trusted collector fills identity fields after validating the session. Game code
 * supplies event IDs, time and allowlisted properties; it never supplies ownership. */
export const ANALYTICS_KINDS = ["play", "session_start", "session_checkpoint", "session_end", "heartbeat", "impression", "page_view", "custom", "ready", "error", "performance", "attention", "score", "achievement", "share", "remix"] as const;
export type AnalyticsKind = typeof ANALYTICS_KINDS[number];
export type AnalyticsEvent = {
  schemaVersion: 1;
  eventId: string;
  kind: AnalyticsKind;
  occurredAt: string;
  receivedAt: string;
  gameId: string;
  buildId: string | null;
  sessionId: string;
  playerId: string;
  audience: "public" | "preview";
  source: "studio" | "upload" | "legacy";
  surface: string;
  referrerHost: string;
  country: string;
  device: string;
  name: string;
  value: number;
  props: Record<string, string | number | boolean>;
  sampleRate: number;
  provenance: "live" | "legacy";
};

/** One creator's profile opened by somebody else, as the warehouse receives it. Its own
 * shape rather than an AnalyticsEvent, because that one is a game's from end to end: a
 * game id, a game-scoped player, a session, and a collector that routes it to the game's
 * Durable Object. This has no game and, on purpose, no visitor at all: the creator by
 * handle and OG number, read by the database when it counted the visit, the time, and the
 * referrer in one of three words. Written by record_profile_visit
 * (20261107120000_profile_visits.sql) and accepted by og-analytics' /ingest/profile-views. */
export const PROFILE_VIEW_REFERRER_CLASSES = ["direct", "opengame", "external"] as const;
export type ProfileViewEvent = {
  schemaVersion: 1;
  eventId: string;
  name: "profile_viewed";
  occurredAt: string;
  creatorHandle: string;
  ogNumber: number;
  referrerClass: typeof PROFILE_VIEW_REFERRER_CLASSES[number];
};

/** The query parameters creator reports used to be filtered by, named so every
 * reader can refuse them by name. Caller-chosen filters were removed on 23 Oct 2026
 * ("no creator filters"): each filtered read was one more figure of a
 * week a reader could subtract from the unfiltered one, and five rounds of attack
 * review kept finding a subtraction the checks between them missed. A week is now
 * one unfiltered report with its breakdown rows. */
export const REMOVED_ANALYTICS_FILTERS = ["build", "surface", "source", "country", "device", "event", "property", "value"] as const;
/** Creators read complete ISO weeks in UTC and nothing else: see the decision
 * log, "Weeks only". A period is an ISO week such as 2026-W43. Days, months and
 * all time were offered for a day and are gone, because windows that nest are
 * where every attack on the checks between them was found. */
export const ANALYTICS_WINDOW_KINDS = ["week"] as const;
export type AnalyticsWindowKind = typeof ANALYTICS_WINDOW_KINDS[number];
export type AnalyticsWindow = { kind: AnalyticsWindowKind; period: string };
/** from and to are the inclusive UTC days the week covers. The query's from
 * and to must equal them, so a caller cannot widen a week by naming one and
 * passing other dates beside it. */
export type AnalyticsQuery = { window: AnalyticsWindow; from: string; to: string; timezone: "UTC"; funnel?: string[] };
/** The window a report describes, as its period and its half-open UTC instants.
 * Reports saved before 22 Oct 2026 carry only start and end, and some none. */
export type AnalyticsReportWindow = { kind?: string; period?: string | null; start: string; end: string };
export type AnalyticsSummary = {
  plays: number | null; players: number | null; playtimeSeconds: number | null;
  averagePlaytimeSeconds: number | null; returningPlayers: number | null;
  likes: number | null; livePlayers: number | null; peakPlayers: number | null;
};
export type AnalyticsBreakdown = { value: string; label: string; plays: number | null; players: number | null; playtimeSeconds: number | null; withheld: boolean };
export type AnalyticsDaily = { day: string; plays: number | null; players: number | null; playtimeSeconds: number | null; partial: boolean };
export type AnalyticsCustomEvent = { day?: string; name: string; events: number | null; players: number | null; shareOfPlayers: number | null; source: "game_reported"; properties?: { key: string; value: string; events: number | null; players: number | null }[] };
/** Coverage describes observed instrumentation, never the absence of an event.
 * A browser without heap support and an older SDK are unmeasured, not zero. */
export type AnalyticsSignalCoverage = {
  status: "observed" | "partial" | "unavailable" | "withheld";
  eligiblePlayers: number | null; measuredPlayers: number | null;
  reason: string; provenance: "sdk" | "host" | "game_reported";
};
export type AnalyticsEngagementSignal = {
  players: number | null; events: number | null; share: number | null;
  coverage: AnalyticsSignalCoverage;
};
export type AnalyticsSignals = {
  heapMb: { p50: number | null; p90: number | null; statistic: "per_player_mean"; coverage: AnalyticsSignalCoverage };
  firstInput: AnalyticsEngagementSignal; idle: AnalyticsEngagementSignal;
  pause: AnalyticsEngagementSignal; mute: AnalyticsEngagementSignal;
  fullscreen: AnalyticsEngagementSignal; leaderboard: AnalyticsEngagementSignal;
};
/** Exportable insight values contain no expiring owner-bound drill capability. */
export type AnalyticsBenchmark = { status: "available" | "insufficient" | "unavailable"; games: number | null; medianSeconds: number | null; lowerSeconds: number | null; upperSeconds: number | null };
export type AnalyticsInsights = {
  from: string; to: string; timezone: string; updatedAt: string; minPlayers: number;
  discovery: { surface: string; impressions: number | null; pageViews: number | null; plays: number | null; clickThrough: number | null; playThrough: number | null }[];
  sources: { source: string; players: number | null; averagePlaytimeSeconds: number | null }[];
  benchmarks: { own: AnalyticsBenchmark; peers: AnalyticsBenchmark };
  drilldown: {
    builds: { label: string; players: number; plays: number; averagePlaytimeSeconds: number | null }[];
    sessions: { label: string; players: number; sessions: number }[];
    errors: { category: string; kind: string; players: number; errors: number }[];
    selectedBuild: string | null; selectedSession: string | null;
  };
  unavailable: string[];
};
export type AnalyticsReport = {
  apiVersion: string; gameId: string; from: string; to: string; timezone: string; minPlayers: number;
  /** Always empty. Kept on the wire because CLIs and Studio brokers already
   * installed read it, and a report without it fails their schema. */
  filters: Record<string, never>; summary: AnalyticsSummary;
  funnel?: string[];
  window?: AnalyticsReportWindow;
  comparison: { from: string; to: string; summary: AnalyticsSummary; eligible: boolean };
  daily: AnalyticsDaily[];
  breakdowns: Record<"source" | "surface" | "country" | "device" | "build", AnalyticsBreakdown[]>;
  events: AnalyticsCustomEvent[];
  /** day1 is the share of the cohort that came back the next day, inside the week. */
  retention: { day: string; players: number | null; day1: number | null }[];
  survival: { seconds: number; players: number | null; share: number | null }[];
  performance: { buildId: string; plays: number; readyP50Ms: number | null; readyP90Ms: number | null; errorsPer100Plays: number | null; fpsP50: number | null }[];
  signals?: AnalyticsSignals;
  insights?: AnalyticsInsights;
  preview?: { eventId: string; occurredAt: string; kind: AnalyticsKind; name: string; props: Record<string, string | number | boolean> }[];
  funnels?: { name: string; steps: { name: string; players: number | null; conversion: number | null }[] }[];
  freshness: { receiptWatermark?: string | null; dataSince: string | null; updatedAt: string | null; completeThrough: string | null; partial: boolean; source: "clickhouse" | "postgres"; quality: "exact" | "estimated" | "legacy"; unavailable: string[] };
};

/** CSV and Parquet use this one projection of the optional canonical sections.
 * It traverses named fields only; an interactive capability can never become an
 * export column merely because a future caller attaches it to a build row. */
export function analyticsExtensionRows(report: AnalyticsReport): { section: string; label: string; metric: string; value: string | number | null }[] {
  const rows: { section:string; label:string; metric:string; value:string|number|null }[]=[];
  const add=(section:string,label:string,metric:string,value:string|number|null)=>rows.push({section,label,metric,value});
  if(report.signals) for(const [key,signal] of Object.entries(report.signals)) {
    if('players' in signal) for(const metric of ['players','events','share'] as const) add('signals',key,metric,signal[metric]);
    else {add('signals',key,'p50',signal.p50);add('signals',key,'p90',signal.p90);add('signals',key,'statistic',signal.statistic);}
    for(const metric of ['status','eligiblePlayers','measuredPlayers','reason','provenance'] as const) add('signal_coverage',key,metric,signal.coverage[metric]);
  }
  const insights=report.insights;
  if(insights) {
    for(const row of insights.discovery) for(const metric of ['impressions','pageViews','plays','clickThrough','playThrough'] as const) add('discovery',row.surface,metric,row[metric]);
    for(const row of insights.sources) for(const metric of ['players','averagePlaytimeSeconds'] as const) add('source_quality',row.source,metric,row[metric]);
    for(const [label,row] of Object.entries(insights.benchmarks)) for(const metric of ['status','games','medianSeconds','lowerSeconds','upperSeconds'] as const) add('baseline',label,metric,row[metric]);
    for(const row of insights.drilldown.builds) for(const metric of ['players','plays','averagePlaytimeSeconds'] as const) add('insight_build',row.label,metric,row[metric]);
    for(const row of insights.drilldown.sessions) for(const metric of ['players','sessions'] as const) add('insight_session',row.label,metric,row[metric]);
    for(const row of insights.drilldown.errors) for(const metric of ['players','errors'] as const) add('insight_error',`${row.category}:${row.kind}`,metric,row[metric]);
    add('insight_context','diagnostics','selectedBuild',insights.drilldown.selectedBuild);
    add('insight_context','diagnostics','selectedSession',insights.drilldown.selectedSession);
    add('insight_coverage','updatedAt','value',insights.updatedAt);
    for(const note of insights.unavailable) add('insight_coverage','unavailable','reason',note);
  }
  return rows;
}

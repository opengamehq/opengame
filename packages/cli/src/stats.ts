import { resolve } from "node:path";
import { CREATOR_TOKEN_PATTERN, gameIdentifierSchema, analyticsReportSchema, windowLabel, windowRange } from "@opengame/protocol";
import type { AnalyticsReport } from "@opengame/shared/analytics";
import { LIMITS } from "@opengame/shared";
import { analyticsOptionsSchema, analyticsParams, refuseRemovedFilters, windowProblem, RANGE_NOT_SUPPORTED, RETIRED_RANGE_OPTIONS, WINDOW_NOT_OFFERED, type AnalyticsOptions } from "./analytics-contract";
import { activeToken } from "./credentials";
import { Api } from "./http";
import { readProject } from "./project";
import { readGame } from "./games";
import { CliError, type Output } from "./output";

export function redactAnalyticsText(text: string): string {
  return text.replace(new RegExp(CREATOR_TOKEN_PATTERN.source.replace(/^\^/, "").replace("(?![\\s\\S])", ""), "g"), "[token]");
}

/** Both front ends refuse from, to and timezone before anything else is checked, so
 * the answer to an old script is the same from the terminal and from an assistant. */
export function refuseRetiredRange(options: object, message = RANGE_NOT_SUPPORTED): void {
  if (RETIRED_RANGE_OPTIONS.some(key => Object.hasOwn(options, key))) throw new CliError("range_not_supported", message, 2);
}
/** A window other than week is named before the schema sees it, with invalid_range, the
 * code the API answers with for the same request, so a script written for days or
 * months hears that weeks replaced them rather than that its flags are malformed. */
export function refuseRetiredWindow(options: object, message = WINDOW_NOT_OFFERED): void {
  const window = (options as { window?: unknown }).window;
  if (typeof window === "string" && window !== "week") throw new CliError("invalid_range", message, 2);
}

export function analyticsSearch(options: AnalyticsOptions): string {
  refuseRetiredRange(options);
  refuseRetiredWindow(options);
  refuseRemovedFilters(options);
  const parsed = analyticsOptionsSchema.safeParse(options);
  if (!parsed.success) throw new CliError("invalid_query", "Use --window week, a --period such as 2026-W43, and a --funnel of event names. Run opengame stats --help.", 2);
  // invalid_range is the code the API answers with for the same mistake, so a script
  // reads one code whichever side noticed first.
  const problem = windowProblem(parsed.data);
  if (problem) throw new CliError("invalid_range", problem, 2);
  const query = analyticsParams(parsed.data).toString();
  return query ? `?${query}` : "";
}

/** Both front ends use the same authenticated read. The default window and period
 * remain the server's decision, so terminal and assistant reads cannot quietly
 * disagree about which week has settled. */
export async function readAnalytics(options: AnalyticsOptions & { game?: string }, settings: { root?: string; tokenStdin?: boolean; signal?: AbortSignal } = {}): Promise<AnalyticsReport> {
  const { game, ...query } = options;
  const search = analyticsSearch(query);
  if (game !== undefined && !gameIdentifierSchema.safeParse(game).success) throw new CliError("invalid_game", "Use a game ID from opengame games.", 2);
  const api = new Api();
  try {
    const id = game ?? (await readProject(settings.root ?? process.cwd(), api.origin)).gameId;
    if (!id) throw new CliError("not_linked", "Supply --game <id>, or run opengame link --game <id> in this folder.", 2, { next: "opengame games" });
    const active = await activeToken(api.origin, Boolean(settings.tokenStdin));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    api.tokenSource = active.source;
    const signal = settings.signal ? AbortSignal.any([settings.signal, AbortSignal.timeout(LIMITS.analytics.queryTimeoutMs)]) : AbortSignal.timeout(LIMITS.analytics.queryTimeoutMs);
    const raw = await api.json(`/api/v1/games/${encodeURIComponent(id.toLowerCase())}/stats${search}`, { token: active.token, signal });
    const report = analyticsReportSchema.safeParse(raw);
    if (!report.success || (id.includes("-") && report.data.gameId !== id.toLowerCase()) ||
      report.data.window?.kind !== (query.window ?? "week") || (query.period !== undefined && report.data.window?.period !== query.period) ||
      query.funnel?.length !== report.data.funnel?.length ||
      query.funnel?.some((step, index) => report.data.funnel?.[index] !== step)) {
      throw new CliError("invalid_response", "The analytics response could not be read. Update the CLI or retry later.", 5);
    }
    return JSON.parse(redactAnalyticsText(JSON.stringify(report.data))) as AnalyticsReport;
  } catch (error) {
    if (error instanceof CliError) throw new CliError(redactAnalyticsText(error.code) === error.code ? error.code : "api_error", redactAnalyticsText(error.message), error.exitCode,
      { retry: error.retry, retryAfterSeconds: error.retryAfterSeconds, next: error.next ? redactAnalyticsText(error.next) : undefined });
    throw error;
  } finally { await api.close(); }
}

const number = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
/** "Week 43 · Oct 19 to 25, 2026 · UTC", the label the stats page and the report mail
 * use. A report without a named window is one saved before fixed windows, which still
 * gets its days and zone rather than nothing. */
export function reportWindowLabel(report: AnalyticsReport): string {
  const window = report.window;
  if (window?.kind) {
    try { return windowLabel(windowRange({ kind: window.kind, period: window.period ?? null })); }
    catch { /* fall through to the bare days */ }
  }
  return `${report.from} to ${report.to} (${report.timezone}, inclusive)`;
}

/** "90 s", or "Unavailable" with no unit after it: the line used to read "Unavailable s". */
const seconds = (value: number | null) => value === null ? "Unavailable" : `${number(value)} s`;
/** A report's unavailable list mixes field names ("livePlayers") with whole sentences the
 * server wrote. Joined with commas they read "Try again later., livePlayers"; the
 * sentences stand alone and the names are said as words. */
function unavailableLines(items: readonly string[]): string[] {
  const sentences = items.filter(item => /\s/.test(item));
  const fields = items.filter(item => !/\s/.test(item)).map(item => item.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[:_]/g, " ").toLowerCase());
  return [...sentences, ...(fields.length ? [`Not available this week: ${fields.join(", ")}.`] : [])];
}

/** `title` is the game's name, when the caller has it; the id stands in otherwise. */
export function analyticsText(report: AnalyticsReport, title?: string): string {
  const s = report.summary;
  const lines = [`Stats for ${title ? `${title.replace(/\s+/g, " ")} (${report.gameId})` : report.gameId}`, reportWindowLabel(report), "",
    `Plays: ${number(s.plays)}  Players: ${number(s.players)}  Returning players: ${number(s.returningPlayers)}`,
    `Playtime: ${seconds(s.playtimeSeconds)}  Average / player: ${seconds(s.averagePlaytimeSeconds)}`,
    `Live players: ${number(s.livePlayers)}  Peak players: ${number(s.peakPlayers)}  Likes: ${number(s.likes)}`,
    "", `Source: ${report.freshness.source}; quality: ${report.freshness.quality}; updated: ${report.freshness.updatedAt ?? "unknown"}.`,
    `Complete through: ${report.freshness.completeThrough ?? "unknown"}.${report.freshness.partial ? " This window includes provisional data." : ""}`,
    `Cells below ${report.minPlayers} players are withheld. Unavailable values are not zero.`];
  lines.push(...unavailableLines(report.freshness.unavailable));
  if (report.events.length) lines.push("", "Custom events (game-reported):", ...report.events.map(event => `  ${event.name}: ${number(event.events)} events, ${number(event.players)} players`));
  if (report.signals) {
    lines.push("", "Engagement and SDK observations:");
    for (const [name,value] of Object.entries(report.signals)) {
      const measurement='players' in value ? `${number(value.players)} players; ${number(value.events)} events` : `heap p50 ${number(value.p50)} MiB; p90 ${number(value.p90)} MiB (per-player mean)`;
      lines.push(`  ${name}: ${measurement}. Coverage: ${value.coverage.status}; ${number(value.coverage.measuredPlayers)} / ${number(value.coverage.eligiblePlayers)} players. ${value.coverage.reason}`);
    }
  }
  if(report.insights) {
    lines.push("", "Discovery and source quality:",...report.insights.discovery.map(row=>`  ${row.surface}: ${number(row.impressions)} saw, ${number(row.pageViews)} opened, ${number(row.plays)} played`),
      ...report.insights.sources.map(row=>`  ${row.source}: ${number(row.players)} players; average playtime ${row.averagePlaytimeSeconds===null?'Unavailable':`${number(row.averagePlaytimeSeconds)} s`}`));
    for(const [kind,value] of Object.entries(report.insights.benchmarks)) lines.push(`  ${kind} baseline: ${value.status}; median ${number(value.medianSeconds)} s`);
    const drill=report.insights.drilldown;
    lines.push("",`Grouped diagnostics: ${drill.selectedBuild ?? 'No reportable build'}; ${drill.selectedSession ?? 'No reportable session group'}`,
      ...drill.builds.map(row=>`  ${row.label}: ${number(row.players)} players, ${number(row.plays)} plays`),
      ...drill.sessions.map(row=>`  ${row.label}: ${number(row.players)} players, ${number(row.sessions)} sessions`),
      ...drill.errors.map(row=>`  ${row.category} (${row.kind}, game-reported): ${number(row.players)} players, ${number(row.errors)} errors`));
    for(const note of report.insights.unavailable) lines.push(`  ${note}`);
  }
  lines.push("", "Use --json for the full canonical report, including coverage, grouped diagnostics, retention and performance.");
  return lines.join("\n");
}

export async function statsCommand(target: string | undefined, flags: Record<string, string | boolean>, output: Output) {
  const isGame = target !== undefined && gameIdentifierSchema.safeParse(target).success;
  if (isGame && flags.game) throw new CliError("ambiguous_game", "Supply a positional game ID or --game, not both.", 2);
  const options: Record<string, unknown> = {};
  for (const key of ["window", "period"]) if (typeof flags[key] === "string") options[key] = flags[key];
  if (typeof flags.funnel === "string") options.funnel = flags.funnel.split(",").map(step => step.trim());
  const report = await readAnalytics({ ...options, game: isGame ? target : typeof flags.game === "string" ? flags.game : undefined },
    { root: resolve(isGame ? "." : target ?? "."), tokenStdin: Boolean(flags["token-stdin"]) });
  output.emit({ type: "result", command: "stats", data: { ...report, message: analyticsText(report, output.json ? undefined : await gameTitle(report.gameId)) } });
}

/** The game's name for the readable header, best effort: the figures do not wait on it,
 * and JSON output, which carries gameId, never asks. */
async function gameTitle(gameId: string): Promise<string | undefined> {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, false);
    if (!active) return undefined;
    return (await readGame(api, active.token, gameId)).title;
  } catch { return undefined; }
  finally { await api.close(); }
}

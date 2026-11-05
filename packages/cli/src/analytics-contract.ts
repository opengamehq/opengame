import { z } from "zod";
import { ANALYTICS_WINDOW_KINDS } from "@opengame/shared";
import { AnalyticsFiltersRemovedError, AnalyticsRangeError, analyticsQuerySchema, refuseFilters, windowRange } from "@opengame/protocol";
import { CliError } from "./output";

/** Filters were removed from creator reports on 23 Oct 2026. A flag or argument that
 * names one is refused with the API's own code and sentence, never dropped: a script
 * that asked for one country and quietly read every country would report it wrong. */
export function refuseRemovedFilters(options: object): void {
  try { refuseFilters(options as Record<string, unknown>); }
  catch (error) { if (error instanceof AnalyticsFiltersRemovedError) throw new CliError(error.code, error.message, 2); throw error; }
}

/** The names fixed windows replaced on 22 Oct 2026. They are refused by name rather
 * than reported as unknown, so a script written against the old range is told which
 * two options took their place instead of being sent to read the help. */
export const RETIRED_RANGE_OPTIONS = ["from", "to", "timezone"] as const;
export const RANGE_NOT_SUPPORTED = "Analytics now reads complete ISO weeks in UTC. Replace from, to and timezone with --window week and --period such as 2026-W43. Leave --period out for the newest complete week.";
/** The same answer for the MCP tool, whose arguments have no dashes. */
export const RANGE_NOT_SUPPORTED_ARGUMENTS = "Analytics now reads complete ISO weeks in UTC. Replace from, to and timezone with window week and period such as 2026-W43. Leave period out for the newest complete week.";
/** Days, months and all time were offered beside weeks for one day, 22 Oct 2026, and
 * withdrawn because the checks between windows that nest kept being walked round. A
 * script that asks for one is told what replaced it rather than handed a week. */
export const WINDOW_NOT_OFFERED = "Analytics reads complete ISO weeks only. Use --window week and --period such as 2026-W43, or leave both out for the newest complete week.";
export const WINDOW_NOT_OFFERED_ARGUMENTS = "Analytics reads complete ISO weeks only. Use window week and period such as 2026-W43, or leave both out for the newest complete week.";

/** Window and period stay optional on the wire: which week is the newest complete one
 * depends on the clock, and the server's clock is the one every reader of a week has
 * to share. */
export const analyticsOptionsSchema = z.object({
  window: z.enum(ANALYTICS_WINDOW_KINDS).optional().describe("Always week, one ISO week from Monday to Sunday in UTC. Other values return invalid_range."),
  period: z.string().max(10).optional().describe("Which week, such as 2026-W43. Omit for the newest complete week."),
  funnel: analyticsQuerySchema.shape.funnel,
}).strict().superRefine((value, context) => {
  if (value.funnel?.some(step => step.includes(","))) context.addIssue({ code: "custom", message: "Funnel steps cannot contain commas." });
});
export type AnalyticsOptions = z.infer<typeof analyticsOptionsSchema>;

/** The window rules a caller can be told about without a clock: a period has to be a
 * real ISO week. Whether a week is complete yet, or too far back, is the server's
 * answer, so a laptop whose clock is an hour out cannot refuse a week the API would
 * serve. Returns the refusal message, or null. */
export function windowProblem(options: AnalyticsOptions): string | null {
  if (options.period === undefined) return null;
  try { windowRange({ kind: "week", period: options.period }); return null; }
  catch (error) { return error instanceof AnalyticsRangeError ? error.message : new AnalyticsRangeError().message; }
}

export function analyticsParams(options: AnalyticsOptions): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["window", "period"] as const) {
    if (options[key] !== undefined) params.set(key, options[key]);
  }
  if (options.funnel) params.set("funnel", options.funnel.join(","));
  return params;
}

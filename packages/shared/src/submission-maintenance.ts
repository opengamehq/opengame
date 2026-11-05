import { LIMITS } from "./limits-browser";

/** The same server-only environment setting covers every review intake in both apps.
 * Environment is supplied by callers so this module never reads process.env in a client bundle. */
export function submissionMaintenance(environment: Readonly<Record<string, string | undefined>>, legacyJam = false) {
  if (environment.OPENGAME_SUBMISSIONS_PAUSED !== "1" && !(legacyJam && environment.JAM_MUTATIONS_PAUSED === "1")) return null;
  const retryAfterSeconds = LIMITS.platform.submit.maintenanceRetryAfterSeconds;
  return {
    code: "submission_intake_paused" as const,
    error: "Submissions are briefly paused.",
    detail: "Your game and saved request are still here. Try again in a few minutes.",
    retry: "later" as const,
    retryAfterSeconds,
    headers: { "cache-control": "private, no-store", "retry-after": String(retryAfterSeconds) },
  };
}

export function submissionMaintenanceResponse(maintenance: NonNullable<ReturnType<typeof submissionMaintenance>>) {
  return Response.json({ error: maintenance.error,
    message: `${maintenance.error} ${maintenance.detail}`, detail: maintenance.detail,
    conflict: "paused", retry: maintenance.retry, retryAfterSeconds: maintenance.retryAfterSeconds },
    { status: 503, headers: maintenance.headers });
}

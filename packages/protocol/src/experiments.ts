import { z } from "./zod";

const transition = { experimentId: z.uuid(), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) };
/** Studio can consume a server-selected creator intent in its current run, evaluate or end an
 * experiment. Creating arbitrary candidates, starting traffic and publishing
 * remain creator actions; no tool argument supplies authority or an intent run. */
export const studioExperimentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }).strict(),
  z.object({ action: z.literal("create_from_intent") }).strict(),
  z.object({ action: z.literal("evaluate"), ...transition }).strict(),
  z.object({ action: z.literal("rollback"), ...transition }).strict(),
]);

/** The database's refusals of a Studio experiment action that no retry can change,
 * each with the sentence the agent reads. Every other failure reads as "could not be
 * confirmed", which invites a retry, and for these that sends an agent round the same
 * refusal until its run ends. Only these names leave the database: its other messages
 * can carry row values. The Worker forwards a name from this table, opengame.io answers
 * with its row in ERRORS, and the broker reads the sentence it hands the agent from here
 * rather than from the route's body. */
export const studioExperimentRefusals = {
  // Also the answer for an intent that publication voided, which can never stage.
  experiment_intent_not_staged: { status: 409, message: "There is no approved experiment request from the creator to act on. Do not retry until the creator submits one and it passes review." },
  studio_experiment_forbidden: { status: 403, message: "Studio cannot take this experiment action. Do not retry it; the creator can make this change on OpenGame." },
  // 409 rather than the 403 its 42501 arrives as: the Worker normalises a run mismatch
  // to 409 at its boundary, and the supervisor and broker check the status they get.
  studio_experiment_run_mismatch: { status: 409, message: "This experiment request names a different Studio run. Do not retry it from this run." },
  experiment_studio_run_closed: { status: 409, message: "This Studio run has ended. Do not retry the experiment action from it." },
} as const satisfies Record<string, { status: number; message: string }>;
export type StudioExperimentRefusal = keyof typeof studioExperimentRefusals;

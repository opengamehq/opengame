import { z } from "./zod";
import { reviewFindingSchema } from "./findings";
import type { ReviewHold } from "./review";
import type { ReleaseStatus } from "./status";

/**
 * A submission as the API returns it, and as the CLI, the private game page and the
 * emails describe it. The states are the database's (`platform_submissions.state`);
 * `SUBMISSION_STATUS` maps each to the one status sentence every surface prints.
 */
export const SUBMISSION_STATES = ["needs_certification", "playtesting", "waiting", "review", "approved",
  "awaiting_details", "publishing", "published", "returned", "blocked", "withdrawn", "superseded"] as const;
export type SubmissionState = typeof SUBMISSION_STATES[number];

export const SUBMISSION_STATUS: Record<SubmissionState, ReleaseStatus> = {
  needs_certification: "needs_certification",
  playtesting: "playtesting",
  waiting: "waiting",
  review: "review",
  approved: "approved",
  awaiting_details: "awaiting_details",
  publishing: "publishing",
  published: "published",
  returned: "returned",
  blocked: "refused",
  withdrawn: "withdrawn",
  superseded: "superseded",
};

/** The status a creator reads for a submission. Its state's, except a `waiting` one held
 * by the launch policy, which is not an outage and reads "On hold". The state stays
 * `waiting` in the database and on the wire, so an older client still parses it. */
export function submissionStatus(submission: { state: SubmissionState; hold?: ReviewHold | null }): ReleaseStatus {
  return submission.state === "waiting" && submission.hold ? "held" : SUBMISSION_STATUS[submission.state];
}

/**
 * The first CLI that knows `awaiting_details` (the one flow, 20261105180100). An older one
 * parses a submission's state against the list it shipped with and stops on an unknown one,
 * so the server shows it this state as `needs_certification`, which it knows and which is the
 * creator's to act on. The server's `submissionForCli` says why.
 */
export const AWAITING_DETAILS_SINCE_CLI = "0.3.4";

/** States that are still moving. A CLI waiting on a submission stops at anything else,
 * awaiting_details included: that one waits for the creator, in a browser, and the CLI
 * prints where (`certifyUrl`). */
export const SUBMISSION_OPEN: readonly SubmissionState[] = ["playtesting", "waiting", "review", "approved", "publishing"];

export const submissionSchema = z.object({
  id: z.uuid(),
  ref: z.string().regex(/^SUB-\d+$/),
  state: z.enum(SUBMISSION_STATES),
  releaseId: z.uuid(),
  gameId: z.uuid(),
  gamePublicId: z.string(),
  submittedAt: z.string(),
  certifiedAt: z.string().nullable(),
  jam: z.object({
    slug: z.string(), name: z.string(), entryId: z.uuid(),
    tracks: z.array(z.object({ key: z.string(), kind: z.enum(["theme", "sponsor"]), name: z.string() })),
  }).nullable(),
  /** Present while the person still has to certify, or since the one flow
   * (20261105180100) to confirm the details and statements of a release that went to
   * review without them. Always a browser page. */
  certifyUrl: z.url().nullable(),
  /** The private game page, where the status strip shows the same state. */
  gameUrl: z.url(),
  /** With a person: how many submissions are ahead of this one. */
  queuePosition: z.number().int().nonnegative().nullable(),
  /** The decision's reason or the findings, once there is one to show. Each finding is a
   * repair finding (fix, verify, retry, fault, certainty), the same shape a deploy's
   * findings have, plus the reviewer-facing `message` older clients printed. A finding
   * from an older server has only `check` and `message`, which still parses. */
  outcome: z.object({
    decision: z.enum(["publish", "return", "block"]),
    reason: z.string().nullable(),
    findings: z.array(z.union([reviewFindingSchema, z.object({ check: z.string().nullable(), message: z.string() })])),
    appealable: z.boolean(),
  }).nullable(),
  /** Once published: the public game page, which is now the address to share, and
   * whether the gallery lists it (see LISTING). Null before then. */
  live: z.object({ url: z.url(), listed: z.boolean() }).nullable().default(null),
  /** When superseded: the submission that replaced it, which may be the same release
   * (renewed after the statements were reworded) or a newer one. */
  replacedBy: z.object({ id: z.uuid(), ref: z.string().regex(/^SUB-\d+$/), releaseId: z.uuid() }).nullable().default(null),
  /** A replay of an earlier request under the same key, or the same release already submitted. */
  replayed: z.boolean().default(false),
  existing: z.boolean().default(false),
  /** Set on a `waiting` submission held by the launch policy rather than by an outage:
   * every check has finished. Placement holds retry the whole playtest within its
   * attempt limit; other verification holds wait for the binding. `passed` is false
   * when a check that did not pass is held
   * with it. Null for every other wait, and absent from an older server. */
  hold: z.object({ reason: z.enum(["verification", "placement"]), passed: z.boolean() }).nullable().default(null),
});
export type Submission = z.infer<typeof submissionSchema>;

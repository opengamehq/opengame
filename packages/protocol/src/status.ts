import { ERRORS } from "./errors";

export const RELEASE_STATUS = {
  uploading: { label: "Uploading", message: "Uploading your game.", icon: "upload" },
  scanning: { label: "Checking", message: "Checking your upload.", icon: "scan" },
  // How a finished deploy ended. operationOutcome in findings.ts answers with one of
  // these five keys, so the strip, the upload page, Your games and the CLI name a
  // refused deploy the same way. "Blocked" and "Needs a fix" were two names for it.
  blocked: { label: "Needs a fix", message: "A check refused this build. Fix the findings, then deploy again.", icon: "warning" },
  stopped: { label: "Stopped on our side", message: "This deploy stopped on our side. Your game does not need to change. Run opengame deploy again later.", icon: "clock" },
  needs_choice: { label: "Needs your choice", message: "This deploy needs a choice from you before it can go further.", icon: "warning" },
  interrupted: { label: "Stopped", message: "This deploy stopped. Run opengame deploy again later; if it stops the same way, the fault is ours.", icon: "warning" },
  expired: { label: "Expired", message: "This upload expired before it finished. Run opengame deploy to start again.", icon: "clock" },
  draft: { label: "Draft", message: "Only you can see this game.", icon: "lock" },
  needs_certification: { label: "Certification needed", message: "Confirm your rights to submit this release.", icon: "check" },
  playtesting: { label: "Playtesting", message: "Playtesting your game on our test machine.", icon: "play" },
  waiting: { label: "Waiting on a check", message: "A checking service is unavailable. We will retry; you do not need to change your game.", icon: "clock" },
  // The launch policy's hold (reviewHold in review.ts): the checks are done and nothing is
  // retried, so the sentence above, which promises a retry, was the wrong one for it. A
  // submission is never stored as this; submissionStatus reads it off a waiting one. No
  // time is given because none is known: it lifts when the test machine is verified.
  held: { label: "On hold", message: "Your game passed the checks. We are keeping it here while we finish verifying our test machine. You do not need to change your game, and it moves on by itself once that is done.", icon: "clock" },
  // Not "is checking": the same sentence sits beside "3 releases are ahead of yours".
  // No person in the creator's words (launch E2E judges, J-opus-3, J-astra-5): publication
  // waits for nobody since 12 Nov 2026, and "With a person" told every creator otherwise.
  review: { label: "In review", message: "This release is still in review. You do not need to do anything.", icon: "clock" },
  // "Returned with fixes" until 14 Nov 2026 (judges' pass, J-opus-H7): it read as a parcel
  // coming back. The chip says what the build needs.
  returned: { label: "Needs changes", message: "Read the findings, then deploy an updated release.", icon: "warning" },
  approved: { label: "Approved", message: "This release passed review. It goes live when it is published.", icon: "check" },
  // The one flow (20261105180100): review said publish, and the creator has not yet
  // confirmed the details and the statements. Nothing of ours is pending, so it is the
  // creator's next step, said as one.
  awaiting_details: { label: "Ready to publish", message: "Your game passed review. Confirm its details to publish it.", icon: "check" },
  // Between the decision and the game loading at its address: the scanned files are being
  // copied to where players get them. Ours, and a minute or two, so it waits like a check.
  publishing: { label: "Publishing", message: "Approved. We are copying it to where players get it.", icon: "upload" },
  refused: { label: "Not accepted", message: "This release was not accepted. The reason is below.", icon: "warning" },
  // Two ways here, and the release does not know which: the creator withdrew it, or the
  // game came off the gallery before it went live and platform_close_publication closed it.
  withdrawn: { label: "Withdrawn", message: "This release left review before it went live. You withdrew it, or the game came off the gallery first.", icon: "archive" },
  superseded: { label: "Replaced", message: "A newer release of this game was submitted instead.", icon: "archive" },
  published: { label: "Published", message: "Your game is live.", icon: "check" },
  // A published game that is no longer served. Its newest submission still says
  // "published", because unpublishing does not touch the review that put it live, so a
  // surface that ranked by submission alone told an unpublished game it was live. The
  // owner's own unpublish and a moderator's pull are two different next steps, so they
  // are two entries. "Off the gallery" is the legacy shelf's word for the first one.
  off_gallery: { label: "Off the gallery", message: "You took this game off the gallery. Nothing is deleted, and Your games is where it goes back up.", icon: "archive" },
  // No mail goes out when we pull a game (the console has no template for it), so this
  // names the address rather than an email that never arrives.
  pulled: { label: "Taken down", message: "We took this game off the gallery. Write to team@opengame.io to ask why, or to ask for it back.", icon: "warning" },
  // A release that was live and is not now: a newer one replaced it, or the game came
  // off the gallery. Its submission still reads "published" for the same reason.
  previously_live: { label: "Previously live", message: "This release was live once. Players are not given it now.", icon: "archive" },
  taken_down: { label: "Unavailable", message: "Nobody can play this game now, including you. If you did not delete it, write to team@opengame.io.", icon: "warning" },
  cleaned: { label: "History only", message: "This release is no longer playable. Its checks are kept here.", icon: "archive" },
} as const;
export type ReleaseStatus = keyof typeof RELEASE_STATUS;

/**
 * What "Needs changes" asks of the creator, for the release it is about.
 *
 * The constant above is the usual case. Two others read wrong under it: a return a person
 * made with a note and no automated findings ("Read the findings" over a page that had
 * none), and a return with newer releases deployed since, where deploying is done and
 * the step left is to submit one of them. The strip, the workspace, the jam entry page
 * and `opengame status` all say it through here.
 */
export function returnedMessage(input: { findings: number; release?: string | null; newer?: string | null }): string {
  const what = input.findings > 0 ? "the findings" : "the reviewer's note";
  const short = (id: string) => id.slice(0, 8);
  if (input.newer && input.newer !== input.release) {
    // The one flow: a newer ready release is already in review by itself.
    return `${input.release ? `Release ${short(input.release)} was returned. ` : ""}Read ${what}. Release ${short(input.newer)} is newer and goes to review by itself.`;
  }
  return input.findings > 0 ? RELEASE_STATUS.returned.message : `Read ${what}, then deploy an updated release.`;
}

/** What "On hold" says, for the hold it is about: a hold over a check that did not pass
 * must not say the game passed, and must not promise there is nothing to change. Only a
 * hold that says outright that everything passed gets the sentence that says so; one
 * that cannot be read is told the checks finished, which is true of every hold. */
export function heldMessage(hold: { passed: boolean; reason?: string } | null | undefined): string {
  if (hold?.reason === "placement") return "Publication is waiting for a check we could not run on that test machine.";
  return hold?.passed === true ? RELEASE_STATUS.held.message
    : "The checks have finished. We are keeping the results here while we finish verifying our test machine. Your game moves on by itself once that is done.";
}

/**
 * Whether the gallery lists a published game. A published platform game is unlisted
 * until an owner allows platform games on the gallery (the owner's decision, private
 * only). Said beside "Published" wherever a creator sees it, because "your game is live"
 * alone would send them looking for it on the gallery.
 */
export const LISTING = {
  unlisted: { label: "Unlisted", message: "Only people with the link can play it. It is not on the gallery, your profile or a jam list." },
  listed: { label: "Listed", message: "It is on the gallery and your profile." },
} as const;

/** Upload operations exist before a release does. Keep their progress language
 * shared by the terminal and the browser without implying a completed check. */
export const OPERATION_STATUS = {
  uploading: { label: "Uploading", message: "Waiting for your archive to finish uploading." },
  queued: { label: "Queued", message: "Your upload is queued for checks." },
  checking: { label: "Checking", message: "Checking your upload." },
  ready: { label: "Ready", message: "Your private release is ready." },
  // A finished operation is named by operationOutcome from RELEASE_STATUS. These two are
  // only the fallback for a surface with no outcome to hand, in the same words.
  failed: { label: RELEASE_STATUS.interrupted.label, message: RELEASE_STATUS.interrupted.message },
  expired: { label: RELEASE_STATUS.expired.label, message: RELEASE_STATUS.expired.message },
} as const;
export type OperationState = keyof typeof OPERATION_STATUS;


/** Every code the database can leave on a failed or expired operation has a
 * sentence, in the one error table in errors.ts beside its exit code. A test reads
 * the migrations and fails on any code without one, because the fallback below is
 * what an agent would otherwise have to act on. */
export function operationErrorMessage(code: string | null): string | undefined {
  return code && Object.hasOwn(ERRORS, code) ? ERRORS[code]!.message : undefined;
}

/** For a code newer than this copy: still a sentence and still names the code.
 * It says what errorExit says about an unknown code, which is "ours, later": it
 * must not tell an agent to change a game nothing has shown to be wrong. When
 * the findings do name a change, operationOutcome says so instead. */
export function operationErrorText(code: string | null): string {
  return operationErrorMessage(code) ?? (code
    ? `The deploy stopped with ${code.replace(/[^a-z0-9_]/gi, "").slice(0, 64) || "an unknown reason"}. Run opengame deploy again later; if it stops the same way, the fault is ours.`
    : "The deploy stopped without a reason. Run opengame deploy again; if it stops the same way, the fault is ours.");
}

/** Codes that have a sentence. Exported for the coverage test only. */
export const OPERATION_ERROR_CODES = Object.keys(ERRORS).filter(code => ERRORS[code]!.message !== undefined);

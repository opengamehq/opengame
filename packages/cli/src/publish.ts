import { setTimeout as sleep } from "node:timers/promises";
import { GENRE_SLUGS, LIMITS } from "@opengame/shared";
import { EXIT, SUBMISSION_OPEN, submissionSchema, type Submission } from "@opengame/protocol";
import { trustedBrowserUrl } from "./browser";
import { activeToken } from "./credentials";
import { linkedGameId, readGame, refuseRemoved } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, terminalText } from "./output";
import { emitReview, followReview, reviewLine } from "./submit";

type Flags = Record<string, string | boolean>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = (value: string | boolean | undefined) => typeof value === "string" ? value.split(",").map(v => v.trim()).filter(Boolean) : [];

/** What the server takes (lib/platform/one-flow.ts, `ownerAnswersSchema`). Left out, each is
 * what the deploy's page would have sent had its Confirm and publish been pressed as it was. */
export interface PublishAnswers {
  title?: string; tagline?: string; description?: string; keepOwnWords?: boolean;
  genre?: string; subgenre?: string | null; controller?: boolean;
  jam?: { track: string; models: string[]; sponsors: string[]; sponsorEmails: Record<string, string> } | null;
}

/** The flags `publish` and `deploy --publish` share, read into answers. Refused here when a
 * value cannot be one the server takes, before anything is sent. */
export function publishAnswers(flags: Flags): PublishAnswers {
  const answers: PublishAnswers = {};
  for (const field of ["title", "tagline", "description"] as const) if (typeof flags[field] === "string") answers[field] = flags[field] as string;
  if (flags["keep-words"]) answers.keepOwnWords = true;
  /* No auto here: leaving the flag out is Auto where the deploy left the genre to it, and keeps
     the genre the creator deployed with otherwise, which is what the page starts on. */
  if (typeof flags.genre === "string") {
    if (!(GENRE_SLUGS as readonly string[]).includes(flags.genre)) throw new CliError("invalid_flag", `Use --genre with one of ${GENRE_SLUGS.join(", ")}. Leave it out to keep the genre the game was deployed with, or review's choice when that was Auto.`, EXIT.input);
    answers.genre = flags.genre;
  }
  if (typeof flags.subgenre === "string") answers.subgenre = flags.subgenre === "none" ? null : flags.subgenre;
  if (typeof flags.controller === "string") {
    if (flags.controller !== "yes" && flags.controller !== "no") throw new CliError("invalid_flag", "Use --controller yes or --controller no.", EXIT.input);
    answers.controller = flags.controller === "yes";
  }
  const jamFlags = ["track", "models", "sponsor", "sponsor-email"].filter(name => flags[name] !== undefined);
  if (flags["no-jam"] && jamFlags.length) throw new CliError("conflicting_flags", `Use --no-jam to publish to the gallery, or ${jamFlags.map(f => `--${f}`).join(", ")} to enter the jam, not both.`, EXIT.input);
  if (flags["no-jam"]) answers.jam = null;
  else if (jamFlags.length) {
    if (typeof flags.track !== "string") throw new CliError("jam_answers_required", "Name the jam track with --track. opengame jams <slug> lists them.", EXIT.input);
    const sponsors = list(flags.sponsor);
    const sponsorEmails: Record<string, string> = {};
    for (const pair of list(flags["sponsor-email"])) {
      // At the first "=", so an address with one of its own keeps the rest of it.
      const at = pair.indexOf("=");
      const sponsor = at < 0 ? "" : pair.slice(0, at).trim(), email = at < 0 ? "" : pair.slice(at + 1).trim();
      if (!sponsor || !email) throw new CliError("invalid_flag", "Use --sponsor-email sponsor=email, separated by commas for several, as in --sponsor-email fal=you@example.com.", EXIT.input);
      sponsorEmails[sponsor] = email;
    }
    const missing = sponsors.filter(sponsor => !sponsorEmails[sponsor]);
    if (missing.length) throw new CliError("jam_answers_required", `Add the email of the account you used at ${missing.join(" and ")}, so its team can verify the entry: --sponsor-email ${missing[0]}=you@example.com.`, EXIT.input);
    answers.jam = { track: flags.track, models: list(flags.models), sponsors, sponsorEmails };
  }
  return answers;
}

/**
 * `opengame publish`: confirm the details of a release that passed review and put it live, as
 * Confirm and publish does on the deploy's page, through the same confirmation on the server.
 * Nobody attests to anything since 16 Nov 2026, so the step that kept publishing in a browser is
 * a form of details, which flags answer. The linked game's newest review, or --game's; --release
 * names which, and is refused when that is not the one waiting. With --wait it follows a review
 * still running and publishes the moment it passes. It then follows the publication until the
 * game is live and prints the address to share.
 */
export async function publishCommand(root: string, flags: Flags, output: Output) {
  const api = new Api();
  try {
    const answers = publishAnswers(flags);
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    const release = typeof flags.release === "string" ? flags.release.toLowerCase() : null;
    if (release !== null && !uuid.test(release)) throw new CliError("invalid_release", "Use the releaseId from opengame status --json with --release.", EXIT.input);
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    const id = requested ?? await linkedGameId(api, token, root);
    if (!id) throw new CliError("not_linked", "Run this in a linked folder, or name the game with opengame publish --game <id>.", EXIT.input);
    const result = await publishGame(api, token, id, { release, answers, wait: Boolean(flags.wait), output });
    output.emit({ type: "result", command: "publish", data: result });
  } finally { await api.close(); }
}

/** The result `publish` prints, and `deploy --publish` adds its deploy's fields to. */
export interface Published { submission: Submission; done: boolean; url: string; live: Submission["live"]; next: string | null; message: string }

/**
 * Publishes the game's newest release waiting on its creator, and follows it until it is live.
 * `release` is the one meant, when the caller knows it (deploy --publish, --release); the game's
 * newest review is read until it is that release's, since the deploy that made it sends it to
 * review a moment after it is ready. `wait` follows a review still running.
 */
export async function publishGame(api: Api, token: string, gameId: string, options: { release: string | null; answers: PublishAnswers; wait: boolean; output: Output; page?: string }): Promise<Published> {
  const { release, answers, wait, output } = options;
  const reviewDeadline = Date.now() + LIMITS.platform.review.decisionDeadlineSeconds * 2000;
  /* A ready deploy goes to review within the minute (the review clock submits any a reader did
     not), so a named release with no review two minutes on is one that will not get one: a QA
     game, a build the jam cannot take. Its deploy's page says why. */
  let current = await newestReview(api, token, gameId, release, Date.now() + Math.min(wait ? 120_000 : LIMITS.platform.operations.pollIntervalMs * 15, reviewDeadline - Date.now()), output, options.page);
  if ((SUBMISSION_OPEN as readonly string[]).includes(current.state) && current.state !== "awaiting_details" && current.state !== "publishing") {
    if (!wait) throw new CliError("review_pending", `${terminalText(reviewLine(current))} Run opengame publish --wait to publish it the moment it passes.`, 5, { retry: "later", next: "opengame publish --wait" });
    current = await followReview(api, token, current, output, reviewDeadline);
  }
  if (current.state === "awaiting_details") {
    let raw: Record<string, unknown>;
    try { raw = await api.json(`/api/v1/submissions/${encodeURIComponent(current.id)}/publish`, { token, body: answers }); }
    catch (error) {
      if (error instanceof ApiError && (error.status === 404 && error.code !== "submission_not_found" || error.code === "api_unavailable")) {
        throw new CliError("publish_unavailable", `This OpenGame server cannot publish from the CLI yet. Confirm the details on the deploy's page: ${current.certifyUrl ?? current.gameUrl}`, 5, { retry: "after-fix" });
      }
      throw error;
    }
    current = parse(raw.submission, api.origin);
  }
  // Publishing copies the reviewed files to where players get them: seconds, usually.
  if (current.state === "publishing") current = await followReview(api, token, current, output, Date.now() + LIMITS.platform.operations.watchTimeoutMs);
  return outcome(current, output);
}

/** The game's newest review, once it is `release`'s when that is named, read until `deadline`.
 * A game read that leaves the review out is a read that failed on our side (a token that can
 * publish can read it), so it is read again rather than called a missing permission. */
async function newestReview(api: Api, token: string, gameId: string, release: string | null, deadline: number, output: Output, page?: string): Promise<Submission> {
  let said = false;
  for (;;) {
    const game = await readGame(api, token, gameId);
    refuseRemoved(game);
    const review = game.submission;
    if (review && (!release || review.releaseId === release)) return review;
    if (Date.now() >= deadline) {
      if (review === undefined) throw new CliError("temporarily_unavailable", "OpenGame could not read this game's review just now. Run the same command again.", 5, { retry: "later" });
      if (release && page) throw new CliError("release_not_waiting", `Release ${release.slice(0, 8)} has not gone to review. Its deploy's page says why: ${page}`, EXIT.input, { next: "opengame status" });
      if (!review) throw new CliError("nothing_to_publish", "This game has no release in review or waiting to publish. Run opengame deploy to upload one; it goes to review by itself.", EXIT.input, { next: "opengame deploy" });
      throw new CliError("release_not_waiting", `Release ${release!.slice(0, 8)} is not this game's newest review, which is release ${review.releaseId.slice(0, 8)} (${terminalText(reviewLine(review))}). Run opengame publish without --release to publish that one.`, EXIT.input, { next: "opengame publish" });
    }
    if (!said && release) { said = true; await output.face(); output.emit({ type: "progress", stage: "review:starting", message: "Waiting for review to start." }); }
    await sleep(LIMITS.platform.operations.pollIntervalMs);
  }
}

function parse(value: unknown, origin: string): Submission {
  const parsed = submissionSchema.safeParse(value);
  if (!parsed.success) throw new CliError("invalid_response", "The server's answer could not be read. Run opengame status to see whether the game is live.", 5);
  if (parsed.data.certifyUrl) parsed.data.certifyUrl = trustedBrowserUrl(parsed.data.certifyUrl, origin);
  return parsed.data;
}

/** Where the publication stands, as one result: live with its address, still publishing, or
 * the reason it is not going live, as an error with the command that moves it on. */
function outcome(current: Submission, output: Output): Published {
  if (current.state === "published") {
    const url = current.live?.url ?? current.gameUrl;
    return { submission: current, done: true, url, live: current.live, next: null,
      message: `${current.ref}: published. ${current.live?.listed === false ? "It is live, unlisted. " : ""}Share ${url}` };
  }
  if (current.state === "publishing") {
    return { submission: current, done: false, url: current.gameUrl, live: null, next: "opengame status --watch",
      message: `${current.ref}: still publishing. Run opengame status --watch to follow it, or open ${current.gameUrl}` };
  }
  if (current.state === "returned" || current.state === "blocked") {
    const lines = emitReview(current, output);
    throw new CliError(current.state === "returned" ? "release_returned" : "release_blocked", [`${terminalText(reviewLine(current))} Nothing was published.`, ...lines].join("\n"), EXIT.check,
      { retry: "after-fix", next: current.state === "returned" ? "opengame deploy" : "opengame status" });
  }
  if ((SUBMISSION_OPEN as readonly string[]).includes(current.state)) {
    throw new CliError("review_pending", `${terminalText(reviewLine(current))} Run opengame publish --wait to publish it the moment it passes.`, 5, { retry: "later", next: "opengame publish --wait" });
  }
  throw new CliError("nothing_to_publish", `${terminalText(reviewLine(current))} Nothing was published.`, EXIT.input, { next: "opengame status" });
}

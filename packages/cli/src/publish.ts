import { setTimeout as sleep } from "node:timers/promises";
import { GENRE_SLUGS, LIMITS } from "@opengame/shared";
import { BANNER_STYLE_CHOICES, EXIT, SUBMISSION_OPEN, deploymentPath, gameDetailsApiPath, gameDetailsSchema, submissionSchema, type CreatorGame, type OperationSummary, type Submission } from "@opengame/protocol";
import { trustedBrowserUrl } from "./browser";
import { activeToken } from "./credentials";
import { linkedGameId, readGame, refuseRemoved } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, terminalText } from "./output";
import { emitReview, followReview, reviewLine } from "./submit";
import { playersFlags } from "./auto";

type Flags = Record<string, string | boolean>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = (value: string | boolean | undefined) => typeof value === "string" ? value.split(",").map(v => v.trim()).filter(Boolean) : [];

/** What the server takes (lib/platform/one-flow.ts, `ownerAnswersSchema`). Left out, each is
 * what the deploy's page would have sent had its Confirm and publish been pressed as it was. */
export interface PublishAnswers {
  title?: string; tagline?: string; description?: string; keepOwnWords?: boolean;
  genre?: string; subgenre?: string | null; controller?: boolean;
  /** How the game is played (17 Nov 2026), as opengame.json's `players` says it. */
  players?: { mode: "single" } | { mode: "private" | "online"; min: number; max: number };
  /** How the game's house banner is drawn (22 Nov 2026). */
  bannerStyle?: BannerStyleChoice;
  jam?: { track: string; models: string[]; sponsors: string[]; sponsorEmails: Record<string, string> } | null;
}

export type BannerStyleChoice = (typeof BANNER_STYLE_CHOICES)[number];

/** `--banner-style`, for publish, deploy --publish and details alike: one of the two the
 * server takes, refused here so a typo costs no request. */
export function bannerStyleFlag(value: string | boolean): BannerStyleChoice {
  if (typeof value === "string" && (BANNER_STYLE_CHOICES as readonly string[]).includes(value)) return value as BannerStyleChoice;
  throw new CliError("invalid_flag", "Use --banner-style directed or --banner-style classic. Directed is art directed in several passes; classic is one picture made from the game's frames.", EXIT.input);
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
  // Auto is what leaving the flags out already means: what opengame.json said, or review's reading.
  const players = playersFlags(flags);
  if (players !== undefined && players !== "auto") answers.players = players;
  if (flags["banner-style"] !== undefined) answers.bannerStyle = bannerStyleFlag(flags["banner-style"]);
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

/** The result `publish` prints, and `deploy --publish` adds its deploy's fields to. `version`
 * is the number players see for the live release, when the server says it. `already` is a
 * release that was live before this command ran, so nothing was published by it. */
export interface Published { submission: Submission; done: boolean; url: string; live: Submission["live"]; next: string | null; message: string;
  version: number | null; already: boolean }

/** A deploy still on its way to review: uploading, queued or being checked. */
const IN_FLIGHT: readonly OperationSummary["state"][] = ["uploading", "queued", "checking"];

/**
 * The game's newest deploy, when it is newer than the review the game reports. The game read
 * names its newest standing review, and an update still being checked has none yet, so the
 * review it names is the version before: on 18 Nov 2026 `opengame publish` run during a
 * queued update answered "SUB-1455: published", the first version's result, which reads as
 * the update being live. A deploy that failed or expired is not on its way anywhere.
 */
function newerDeploy(game: CreatorGame): OperationSummary | null {
  const operation = game.latestOperation;
  if (!operation || operation.state === "failed" || operation.state === "expired") return null;
  if (IN_FLIGHT.includes(operation.state)) return operation;
  return operation.releaseId && operation.releaseId !== game.submission?.releaseId ? operation : null;
}

/** " Version 3 stays live until then." when the game is live, with its number when the server
 * says it; nothing for a game that is not live. `tail` ends the sentence. */
function liveNow(game: CreatorGame, tail = " until then"): string {
  const live = game.publication;
  if (live?.state !== "published") return "";
  return `${live.version ? ` Version ${live.version}` : " The version players have now"} stays live${tail}.`;
}

/**
 * What to say while the newest deploy is not reviewed yet, and the command that moves it on.
 * An update of a live game goes live by itself once review passes (one-flow.ts), so only a
 * first publish is told to wait on publish.
 */
function stillComing(game: CreatorGame, operation: OperationSummary, line: string): CliError {
  const updating = game.publication?.state === "published";
  const then = updating ? " It goes live by itself once it passes review. Run opengame status --watch to follow it."
    : " Run opengame publish --wait to publish it the moment it passes review.";
  return new CliError("review_pending", `${line}${liveNow(game)}${then}`, 5,
    { retry: "later", next: updating ? "opengame status --watch" : "opengame publish --wait" });
}

const short = (id: string | null | undefined) => id ? `Release ${id.slice(0, 8)}` : "Your newest deploy";

/**
 * Publishes the game's newest release waiting on its creator, and follows it until it is live.
 * `release` is the one meant, when the caller knows it (deploy --publish, --release); the game's
 * newest review is read until it is that release's, since the deploy that made it sends it to
 * review a moment after it is ready. `wait` follows a review still running. With no release
 * named, a deploy newer than the game's review is the one meant: still being checked, it is
 * said as such (or followed, with `wait`), and never answered with the review before it.
 */
export async function publishGame(api: Api, token: string, gameId: string, options: { release: string | null; answers: PublishAnswers; wait: boolean; output: Output; page?: string }): Promise<Published> {
  const { answers, wait, output } = options;
  let { release, page } = options;
  const named = release !== null;
  const reviewDeadline = Date.now() + LIMITS.platform.review.decisionDeadlineSeconds * 2000;
  /* With no release named: a deploy that passed its checks and has no review yet, which the
     review clock sends to review within the minute, and the newest deploy when it failed. Each
     is said beside a release that is already live, so "nothing new" never hides either. */
  let unreviewed: OperationSummary | null = null;
  let failed: OperationSummary | null = null;
  let known: CreatorGame | null = null;
  if (release === null) {
    let game = await readGame(api, token, gameId);
    refuseRemoved(game);
    let newer = newerDeploy(game);
    const followed = Boolean(newer && IN_FLIGHT.includes(newer.state));
    if (newer && IN_FLIGHT.includes(newer.state)) {
      const line = `${short(newer.releaseId)} is still being checked, so it has not gone to review yet.`;
      if (!wait) throw stillComing(game, newer, line);
      await output.face();
      output.emit({ type: "progress", stage: "deploy:checking", message: "Waiting for your newest deploy's checks." });
      const deadline = Math.min(reviewDeadline, Date.now() + LIMITS.platform.operations.watchTimeoutMs);
      while (newer && IN_FLIGHT.includes(newer.state) && Date.now() < deadline) {
        await sleep(LIMITS.platform.operations.pollIntervalMs);
        game = await readGame(api, token, gameId);
        refuseRemoved(game);
        newer = newerDeploy(game);
      }
      if (newer && IN_FLIGHT.includes(newer.state)) throw stillComing(game, newer, `${short(newer.releaseId)} is still being checked after ${Math.round(LIMITS.platform.operations.watchTimeoutMs / 60_000)} minutes, so it has not gone to review yet.`);
      const latest = game.latestOperation;
      if (latest && (latest.state === "failed" || latest.state === "expired")) {
        throw new CliError("nothing_to_publish", `${short(latest.releaseId)}, your newest deploy, did not pass its checks, so nothing was published.${liveNow(game, "")} Run opengame status to read why.`, EXIT.input, { next: "opengame status" });
      }
    }
    /* Followed here, so the release is the one meant: its review is read until it arrives.
       Found ready without waiting, it is only said, so a ready release that never goes to
       review (a QA build, one the jam cannot take) cannot hold up an older one waiting on
       its creator, which publish has always published. */
    const latest = game.latestOperation;
    /* The deploy followed is the newest one, even once its review is the game's and so no
       longer "newer" than it: an update can pass review and go live while it is watched. */
    const followedTo = followed ? newer ?? (latest?.releaseId && latest.state === "ready" ? latest : null) : null;
    if (followedTo?.releaseId) { release = followedTo.releaseId; page ??= api.origin + deploymentPath(followedTo.id); }
    else if (newer?.releaseId) unreviewed = newer;
    if (latest && (latest.state === "failed" || latest.state === "expired")) failed = latest;
    known = game;
  }
  /* A ready deploy goes to review within the minute (the review clock submits any a reader did
     not), so a named release with no review two minutes on is one that will not get one: a QA
     game, a build the jam cannot take. Its deploy's page says why. */
  let current = await newestReview(api, token, gameId, release, Date.now() + Math.min(wait ? 120_000 : LIMITS.platform.operations.pollIntervalMs * 15, reviewDeadline - Date.now()), output, page);
  // Live before this command ran. Never for a named release: deploy --publish names its own,
  // and an update of a live game can go live by itself before the first read here.
  /* Not for a release this command followed, either: one it waited on through its checks can
     reach published before the first read here (Greptile on opengamehq/opengame#21). */
  let already = !named && release === null && current.state === "published";
  if (already && unreviewed?.releaseId && unreviewed.releaseId !== current.releaseId) {
    if (!wait) {
      throw new CliError("review_pending", `${short(unreviewed.releaseId)} passed its checks and goes to review within a minute.${known ? liveNow(known) : ""} It goes live by itself once it passes review. Run opengame status --watch to follow it.`, 5,
        { retry: "later", next: "opengame status --watch" });
    }
    /* --wait follows it, as it follows an update still being checked: the release is the one
       meant now, and its review is read until it arrives (Greptile on opengamehq/opengame#21).
       Only here, past a live release, so an older release waiting on its creator is still the
       one a bare publish takes. */
    release = unreviewed.releaseId;
    page ??= api.origin + deploymentPath(unreviewed.id);
    current = await newestReview(api, token, gameId, release, Date.now() + Math.min(120_000, reviewDeadline - Date.now()), output, page);
    already = false;
  }
  if ((SUBMISSION_OPEN as readonly string[]).includes(current.state) && current.state !== "awaiting_details" && current.state !== "publishing") {
    if (!wait) throw await pending(api, token, gameId, current);
    current = await followReview(api, token, current, output, reviewDeadline);
  }
  // Whether the answers reached the server: only the details step sends them.
  let answered = false;
  if (current.state === "awaiting_details") {
    answered = true;
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
  if ((SUBMISSION_OPEN as readonly string[]).includes(current.state) && current.state !== "publishing") throw await pending(api, token, gameId, current);
  const result = outcome(current, output, current.state === "published" ? await liveVersion(api, token, gameId, current.releaseId) : null, already);
  if (already && failed) result.message += ` Your newest deploy${failed.releaseId ? `, release ${failed.releaseId.slice(0, 8)},` : ""} did not pass its checks: run opengame status to read why.`;
  /* An update of a live game publishes by itself once it passes review, and a release already
     live has no details step, so the publish never carried the banner style: `deploy --publish
     --banner-style classic` on an update reported success and saved nothing (Greptile on
     opengamehq/opengame#27). It is saved through the Details tab's own save, as `opengame
     details --banner-style` does, and only once the release is going live, so a release that
     is returned or blocked leaves the style as it was. */
  if (answers.bannerStyle && !answered) result.message += await saveBannerStyle(api, token, gameId, current.gamePublicId, answers.bannerStyle, result.message);
  return result;
}

export const BANNER_STYLE_NAMES: Record<BannerStyleChoice, string> = { directed: "Directed", classic: "Classic" };

/** A server from before 22 Nov 2026 refuses a body with a banner style as not one it takes, in
 * either of the two sentences it had. Nothing was saved: its schema refuses the whole body. */
export function refusesBannerStyle(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.code === "invalid_request"
    && (error.data.message === "Send a title, a tagline or a description, as text." || error.data.message === "Send a title, a tagline, a description or the models, as text.");
}

/** What the banner does after a save that named its style: redrawn on a live game whose style
 * changed, kept on one already in that style, and drawn that way at the first publish otherwise. */
export function bannerSentence(style: BannerStyleChoice, saved: { live: boolean; bannerRedrawing?: boolean | undefined }): string {
  const name = BANNER_STYLE_NAMES[style].toLowerCase();
  return saved.bannerRedrawing ? ` Its banner is being redrawn in the ${name} style, in a few minutes, and the current one stays until then.`
    : saved.live ? ` Its banner keeps the ${name} style.` : ` Its banner will be drawn in the ${name} style when it is published.`;
}

/** Saves `style` as the game's banner style after a publish that could not carry it, and says
 * what the banner does now. The release is live either way, so a refusal says that first. */
async function saveBannerStyle(api: Api, token: string, gameId: string, publicId: string, style: BannerStyleChoice, published: string): Promise<string> {
  const page = `${api.origin}/settings/games/${encodeURIComponent(publicId)}`;
  // Name the game: a publish can target one other than the folder's own (--game), and a bare
  // `opengame details` would pick the folder's game instead.
  const next = `opengame details --game ${gameId} --banner-style ${style}`;
  const readBack = `opengame details --game ${gameId}`;
  let raw: unknown;
  try { raw = await api.json(gameDetailsApiPath(gameId), { token, method: "PATCH", body: { bannerStyle: style } }); }
  catch (error) {
    if (refusesBannerStyle(error) || error instanceof ApiError && error.code === "api_unavailable") {
      throw new CliError("edit_unavailable", `${published} This OpenGame server cannot change a game's banner style from the CLI yet, so the style was not saved. Choose it on the Details tab: ${page}`, 5, { retry: "after-fix" });
    }
    if (error instanceof CliError) {
      throw new CliError(error.code, `${published} The banner style was not saved: ${error.message} Run ${next} to save it.`, error.exitCode,
        { ...(error.retry ? { retry: error.retry } : {}), next });
    }
    throw error;
  }
  const parsed = gameDetailsSchema.safeParse(raw);
  if (!parsed.success) throw new CliError("invalid_response", `${published} The banner style was saved, but the answer could not be read. Run ${readBack} to see it.`, 5, { next: readBack });
  return bannerSentence(style, parsed.data);
}

/** A review still running, said with the version that stays live meanwhile and the command
 * that moves it on: an update of a live game publishes by itself once it passes. */
async function pending(api: Api, token: string, gameId: string, current: Submission): Promise<CliError> {
  const game = await readGame(api, token, gameId).catch(() => null);
  const line = terminalText(reviewLine(current));
  if (game && game.publication?.state === "published" && game.publication.releaseId !== current.releaseId) {
    return new CliError("review_pending", `${line}${liveNow(game)} It goes live by itself once it passes review. Run opengame status --watch to follow it.`, 5,
      { retry: "later", next: "opengame status --watch" });
  }
  return new CliError("review_pending", `${line} Run opengame publish --wait to publish it the moment it passes.`, 5, { retry: "later", next: "opengame publish --wait" });
}

/** The number players see for `releaseId` once it is the live one, or null when the server
 * does not say (an older one) or the read fails: the publish happened either way. */
async function liveVersion(api: Api, token: string, gameId: string, releaseId: string): Promise<number | null> {
  try {
    const live = (await readGame(api, token, gameId)).publication;
    return live?.state === "published" && live.releaseId === releaseId ? live.version ?? null : null;
  } catch { return null; }
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
      if (release && page) throw new CliError("release_not_waiting", `Release ${release.slice(0, 8)} has not gone to review.${liveNow(game, "")} Its deploy's page says why: ${page}`, EXIT.input, { next: "opengame status" });
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

/** Where the publication stands, as one result: live with its address and version number,
 * still publishing, or the reason it is not going live, as an error with the command that
 * moves it on. A release live before the command ran is said as already live. */
function outcome(current: Submission, output: Output, version: number | null, already: boolean): Published {
  if (current.state === "published") {
    const url = current.live?.url ?? current.gameUrl;
    const which = `${version ? `version ${version}, ` : ""}release ${current.releaseId.slice(0, 8)}`;
    const unlisted = current.live?.listed === false ? " It is unlisted: playable by its link, on no gallery." : "";
    return { submission: current, done: true, url, live: current.live, next: null, version, already,
      message: already ? `${current.ref}: already live as ${which}. Nothing new to publish.${unlisted} Share ${url}`
        : `${current.ref}: published. ${which[0]!.toUpperCase()}${which.slice(1)} is live.${unlisted} Share ${url}` };
  }
  if (current.state === "publishing") {
    return { submission: current, done: false, url: current.gameUrl, live: null, next: "opengame status --watch", version: null, already: false,
      message: `${current.ref}: still publishing release ${current.releaseId.slice(0, 8)}. Run opengame status --watch to follow it, or open ${current.gameUrl}` };
  }
  if (current.state === "returned" || current.state === "blocked") {
    const lines = emitReview(current, output);
    throw new CliError(current.state === "returned" ? "release_returned" : "release_blocked", [`${terminalText(reviewLine(current))} Nothing was published.`, ...lines].join("\n"), EXIT.check,
      { retry: "after-fix", next: current.state === "returned" ? "opengame deploy" : "opengame status" });
  }
  throw new CliError("nothing_to_publish", `${terminalText(reviewLine(current))} Nothing was published.`, EXIT.input, { next: "opengame status" });
}

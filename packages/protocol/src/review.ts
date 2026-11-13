import { z } from "./zod";
import type { ReceiptState } from "./release";

/** Review policy keeps safety clearance, platform retries and quality judgements
 * separate. Small playable attempts are welcome. A quality return requires two
 * independently sourced model families and corroborating runtime evidence; neither
 * an old depth score nor a classifier's confidence is a calibrated probability.
 * Public automation remains gated independently by the submission writer. */

/** The checks a submitted release needs, by the names the playtest stage writes. */
export const REVIEW_CHECKS = {
  /** Deploy-time safety. A failure here means the bytes are never served. Only the archive
   * check since 12 Nov 2026: it refuses native executables, and the malware scan, the
   * credential scan and image moderation are retired (RETIRED_CHECKS). */
  safety: ["archive"],
  /** Deterministic packaging and attributed runtime failures return with a fix. */
  eligibility: ["preflight", "engine", "desktop", "gpu-boot", "gpu-network", "gpu-runtime"],
  /** Evidence a person weighs. Never decisive on its own, and never waved through either.
   * Only the resize probe since 12 Nov 2026: `text-policy` and `image-flags` are retired. */
  flags: ["gpu-desktop"],
  /** The playtests, cheapest first. */
  playtest: ["bot-playtest", "agent-playtest"],
} as const;

/**
 * Checks that are no longer run or required, since 12 Nov 2026 (limits.json
 * platform.deploy.minimalChecks). A release reviewed before then has
 * receipts for them, some failed or held for a person; they are read past here and in the
 * database's publication gate, so none of them holds a release up or sends it back. The
 * malware scan, the credential checks (secrets, and text-source's key-in-text answer),
 * image moderation and its flags, and the text policy questions.
 */
export const RETIRED_CHECKS: readonly string[] = ["malware", "secrets", "images", "image-flags", "text-policy", "text-source"];

export function isRetiredCheck(check: string): boolean {
  return RETIRED_CHECKS.includes(check);
}

const REQUIRED_CHECKS: readonly string[] = [...REVIEW_CHECKS.safety, ...REVIEW_CHECKS.eligibility, ...REVIEW_CHECKS.flags, ...REVIEW_CHECKS.playtest];

/** A flag check's receipt that a person has to look at: one that flagged (`failed`) or
 * could not decide (`inconclusive`). The console's flags section and its findings list split on this,
 * so a check added to `flags` reaches the console without a second list there. */
export function flaggedForPerson(receipt: { check: string; state: string }): boolean {
  return (REVIEW_CHECKS.flags as readonly string[]).includes(receipt.check) && (receipt.state === "failed" || receipt.state === "inconclusive");
}

export interface ReviewReceipt {
  check: string;
  state: ReceiptState;
  /** One sentence of what was seen, from the receipt's evidence, when there is one. */
  observed?: string | null;
  /** The receipt's own fix sentence, when it carries one. */
  fix?: string | null;
  /** Written in shadow mode (the text policy, whose calibration failed): evidence for a
   * person to read, never awaited and never decisive. */
  shadow?: boolean;
  /** Attribution comes from the trusted runner, never from the uploaded game. */
  fault?: "game" | "platform" | "unknown";
  certainty?: "certain" | "heuristic";
  retry?: "now" | "after-fix" | "later" | "never";
  controllerSource?: string;
  evidence?: unknown;
}

export interface ReviewPlaytest {
  tier: number | null;
  confidence: number | null;
  /** Historical runner summary, retained as evidence; not a publication gate. */
  recommendation: string | null;
  /** The bot reached play: input changed the screen. */
  botReachedPlay: boolean | null;
  /** The agent never got past the first screen. */
  agentStuck: boolean | null;
  /** Scorecard lines worth acting on ("no fail state", "one mechanic"). */
  shallow: string[];
  quality?: QualityEvidence | null;
}

export interface QualityJudgement {
  verdict: "real-attempt" | "not-game" | "trivial" | "unknown";
  confidence: number;
  family: string;
  provider: string;
  model: string;
  promptVersion: string;
  requestedModel?: string;
  modelVersion?: string;
  servingProvider?: string | null;
  providerRequestId?: string | null;
  /** Hash of the evidence supplied directly to this model. */
  evidenceDigest: string;
  /** How sure the code review is that the game is made for a phone held upright (9:16). */
  mobilePortrait?: number;
  /** How sure the code review is that it does not run on a supported web runtime or engine. */
  unsupportedRuntime?: number;
  source: "code" | "runtime";
  reasons: string[];
}

export interface QualityEvidence {
  primary: QualityJudgement | null;
  confirming: QualityJudgement | null;
  runtime: {
    boot: ReceiptState;
    input: ReceiptState;
    network: ReceiptState;
    output: ReceiptState;
    /** Direct runtime observations, not a summary copied from either model. */
    corroborates: "not-game" | "trivial" | null;
    evidenceDigest: string;
  };
  /** Stored for later evaluation only. Never counted as a third independent vote. */
  advisory?: unknown;
}

const judgementSchema = z.object({
  verdict: z.enum(["real-attempt", "not-game", "trivial", "unknown"]), confidence: z.number().min(0).max(1),
  family: z.string().trim().min(1), provider: z.string().trim().min(1), model: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1), evidenceDigest: z.string().trim().min(1), source: z.enum(["code", "runtime"]),
  reasons: z.array(z.string()),
  requestedModel: z.string().optional(), modelVersion: z.string().optional(), servingProvider: z.string().nullable().optional(), providerRequestId: z.string().nullable().optional(),
  /* Since 13 Nov 2026 the code review also says how sure it is that the game is made for a phone
     held upright (9:16) rather than a browser, and that it does not run on a web engine, a web
     export, WebAssembly or a supported game engine. The database refuses publication on either at
     the policy's primary confidence (20261113030000); kept here so a parse does not drop them. */
  mobilePortrait: z.number().min(0).max(1).optional(), unsupportedRuntime: z.number().min(0).max(1).optional(),
});
const receiptStateSchema = z.enum(["passed", "failed", "inconclusive", "not run", "provider unavailable"]);
const qualitySchema = z.object({
  primary: judgementSchema.nullable(), confirming: judgementSchema.nullable(),
  runtime: z.object({ boot: receiptStateSchema, input: receiptStateSchema, network: receiptStateSchema, output: receiptStateSchema,
    corroborates: z.enum(["not-game", "trivial"]).nullable(), evidenceDigest: z.string().trim().min(1) }),
  advisory: z.unknown().optional(),
});

/** Invalid or old persisted evidence cannot enable a shortcut or a quality return. */
export function parseQualityEvidence(value: unknown): QualityEvidence | null {
  const result = qualitySchema.safeParse(value);
  return result.success ? result.data : null;
}

export interface ReviewPolicy {
  /** Nobody is waiting to answer what the engine would otherwise leave for a person, so
   * the engine answers it itself (`answerForAPerson`). limits.json, review.autonomous. */
  autonomous?: boolean;
  /** Whether limits.json lets a passing answer publish without a person
   * (review.automaticPublishing). The engine does not read it; it is recorded so the
   * database can tell a release it held from one the switch held, which decides whether
   * the team is mailed (20261106001500_review_person_notify). */
  automaticPublishing?: boolean;
  /** Held and inconclusive evidence requires a person, including quality checks. */
  requireAllChecksPassed?: boolean;
  /** The review's target, from the upload. Measured and alerted on, never a verdict: the
   * engine does not read it (`recommend`). Carried so a recorded recommendation names the
   * target it was made under. limits.json, review.decisionDeadlineSeconds. */
  decisionDeadlineSeconds?: number;
  marketplaceBarTier: number | null;
  confidenceMin: number | null;
  providerWaitSeconds: number;
  /** limits.json, platform.review.codeReview.verdictWaitSeconds. Read by the publication decision
   * from 20261113170000 until 20261113300000, which waits for a stored verdict however long it
   * takes and reads this no more; still carried so a recorded recommendation names it. */
  codeReviewWaitSeconds?: number;
  launchPolicy?: {
    version: string;
    runtimeAttestationVerified: boolean;
    runtimeAttestedClouds?: readonly string[];
    runtimeAttestationSource: string;
    quality: { primaryConfidenceMin: number; confirmingConfidenceMin: number; provisional: boolean };
    sampling: { randomRate: number; closeCallMin: number; closeCallMax: number; dailyMax: number; pendingMax: number };
  };
}

export interface ReviewInput {
  receipts: readonly ReviewReceipt[];
  /** Null when the immutable release manifest could not be read, which waits for a
   * retry. Otherwise it is whether the manifest declares `multiplayer.mode: "p2p"`, and
   * that no longer changes anything: SDK multiplayer was removed, the playtest stopped
   * writing the multiplayer smoke, and a p2p release is reviewed exactly like a solo one.
   * Old manifests and 20261027170200_game_kinds still say p2p, so the mode is accepted
   * and read, never required. Until 5 Nov 2026 it added a `multiplayer-smoke` check that
   * nothing wrote any more, so every p2p release waited on it and then, autonomously, was
   * returned with "submit the game again", for ever (review of #904). */
  multiplayer: boolean | null;
  playtest: ReviewPlaytest | null;
  /** A jam entry stays in the jam whatever its tier: judges score depth themselves. */
  jam: boolean;
  /** Seconds the review has been open, from the upload (the web's `reviewClockStart`), for
   * the provider wait: past `providerWaitSeconds` a missing check reads `check_timeout`. */
  waitedSeconds: number;
  /** The playtest's own row could not be read this time. A fault of ours, not a run that
   * has not finished: `playtest` is null either way, and only this tells them apart. */
  playtestUnreadable: boolean;
  policy: ReviewPolicy;
}

export type ReviewOutcome = "pending" | "waiting" | "publish" | "person" | "return" | "block";

export interface ReviewReason {
  code: "safety_failed" | "eligibility_failed" | "broken_in_playtest" | "check_running" | "provider_unavailable"
    | "provider_timeout" | "check_timeout" | "playtest_unreadable" | "inconclusive" | "flagged" | "agent_unsure" | "bar_uncalibrated" | "no_score"
    | "low_confidence" | "near_bar" | "below_bar" | "jam_entry" | "clear_pass"
    | "safety_hold" | "platform_retry" | "quality_disagreement" | "quality_confirmed" | "runtime_unverified" | "runtime_placement"
    | "runtime_failed_run" | "content_returned";
  check?: string;
  /** What a creator or reviewer reads. Plain sentences, no internal names. */
  message: string;
}

export interface Recommendation {
  engineVersion: 1;
  quality: QualityEvidence | null;
  outcome: ReviewOutcome;
  reasons: ReviewReason[];
  /** One sentence for a decision reason, an email or a log line. */
  summary: string;
  tier: number | null;
  confidence: number | null;
  policy: ReviewPolicy;
}

function state(receipts: readonly ReviewReceipt[], check: string): ReviewReceipt | undefined {
  return receipts.find(r => r.check === check);
}

function say(receipt: ReviewReceipt, fallback: string) {
  return receipt.observed?.trim() || fallback;
}

/** A positive source read and complete independent runtime checks permit skipping
 * only the exploratory agent. Missing runtime evidence never qualifies. */
export function canSkipExploration(quality: QualityEvidence | null | undefined, confidenceMin: number): boolean {
  if (!quality || quality.primary?.verdict !== "real-attempt" || quality.primary.source !== "code") return false;
  return validJudgement(quality.primary) && quality.primary.confidence >= confidenceMin && runtimePassed(quality);
}

function validJudgement(judge: QualityJudgement): boolean {
  return Number.isFinite(judge.confidence) && judge.confidence >= 0 && judge.confidence <= 1
    && [judge.family, judge.provider, judge.model, judge.promptVersion, judge.evidenceDigest].every(s => typeof s === "string" && s.trim().length > 0);
}

function runtimePassed(quality: QualityEvidence): boolean {
  return [quality.runtime.boot, quality.runtime.input, quality.runtime.network, quality.runtime.output].every(s => s === "passed")
    && Boolean(quality.runtime.evidenceDigest);
}

/** Two model families agreeing that an upload is not a game, or trivial, with the runner's
 * own measurement agreeing too. The runtime gates are read from the receipts, after the
 * verification hold has unwrapped what the GPU run measured, rather than from the copy in
 * the quality evidence, which carries the hold's "inconclusive" and so could never pass
 * while the hold stood. A bot that could not show input answering is allowed: a landing
 * page, a still image or a to-do list never answers a game's input, and requiring it ruled
 * out exactly the uploads this return exists for. A bot that found the game broken has
 * already returned it as a failure, and a boot, network or runtime that did not pass is a
 * different finding, so none of those can be called "not a game". */
function qualityReturn(quality: QualityEvidence | null | undefined, policy: ReviewPolicy, receipts: readonly ReviewReceipt[]): boolean {
  if (!quality || !policy.launchPolicy || !quality.runtime.evidenceDigest) return false;
  const measured = (check: string) => state(receipts, check)?.state;
  const ran = (s: ReceiptState | undefined) => s === "passed" || s === "inconclusive";
  if (!["gpu-boot", "gpu-network", "gpu-runtime"].every(c => measured(c) === "passed") || !ran(measured("bot-playtest"))) return false;
  // A bot that did not boot is inconclusive, but it never played, so there was nothing for
  // the runner to corroborate: playtest_bot.corroboration answers null for it. A
  // corroboration beside one came from signals the guest wrote, not from a measurement.
  if (botNotBooted(state(receipts, "bot-playtest"))) return false;
  // Nor beside an agent playtest the controller filed for a person (D38, D39): the quality
  // shortcut is a finished answer only when nothing is waiting on a person's judgement of
  // play, and a missing scorecard is exactly that (review of #796, RII-1). Only the agent's
  // receipt is read, because the controller writes that one whole; the mark on any other
  // receipt could have come from the guest (review-kk), and a guest must not be able to
  // turn a valid return into a person.
  if (leftForAPerson(state(receipts, "agent-playtest"))) return false;
  if (quality.runtime.boot !== "passed" || quality.runtime.network !== "passed" || !ran(quality.runtime.input) || !ran(quality.runtime.output)) return false;
  const { primary, confirming, runtime } = quality;
  if (!primary || !confirming || !validJudgement(primary) || !validJudgement(confirming)) return false;
  const settings = policy.launchPolicy.quality;
  return (primary.verdict === "not-game" || primary.verdict === "trivial") && primary.verdict === confirming.verdict
    && primary.source === "code" && confirming.source === "runtime"
    && primary.family !== confirming.family && primary.evidenceDigest !== confirming.evidenceDigest
    && runtime.evidenceDigest !== primary.evidenceDigest
    // The runner measures only "trivial", nothing but motion (playtest_bot.corroboration),
    // which agrees with "not a game" as much as with "trivial".
    && (runtime.corroborates === primary.verdict || runtime.corroborates === "trivial" && primary.verdict === "not-game")
    && primary.confidence >= settings.primaryConfidenceMin && confirming.confidence >= settings.confirmingConfidenceMin;
}

/** The fix every not-a-game return gives, in the mail and in the agent's finding. */
/* The reviews' own reasons come first and say what was missing. This asks for no more
   than the review does: its prompt (the pipeline's quality review) passes a small
   classic game, a short puzzle or a toy with several things to try, and returns only a
   starter or a single interaction. "A goal, a way to fail, and something that changes"
   asked for more than that, so a toy that would pass was told to become something else. */
export const QUALITY_FIX = "Add something a player can do that the game responds to, beyond a single interaction. A short puzzle, a small classic game or a toy with several things to try is enough. Then deploy again.";
// Said when neither review gave a reason, and as a waiting reason. "With runtime evidence"
// and "a real playable attempt" were the review's own vocabulary, not a creator's.
const QUALITY_NONE = "Two separate reviews, one of the code and one of the game being played, found nothing a player can play yet.";
// Model text in a mail: a few reasons from each review, each kept to a readable length.
const QUALITY_REASONS_EACH = 3, QUALITY_REASON_CHARS = 300;

/** A model's sentence cut to `max` characters at the last space before it, so the mail
 * never ends a reason halfway through a word. A single word longer than half the limit
 * is cut where it falls, since there is no better place. */
function clip(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max - 1).join("");
  const space = head.lastIndexOf(" ");
  return (space > max / 2 ? head.slice(0, space) : head).replace(/[\s,;:.\-]+$/, "") + "…";
}

/**
 * What a creator reads when two reviews found no playable game yet: each review's own
 * reasons, the code read's first, then what to do. The return email prints these lines
 * and nothing else (sendPlatformNotice), and until 5 Nov 2026 it carried only the code
 * read's reasons with no fix, so the play review's, which say what was on screen, never
 * reached the creator, and nothing told them what would pass. Trimmed, deduplicated
 * across the two reviews, and capped, so one long answer cannot fill the mail.
 */
function qualityReasons(quality: QualityEvidence): ReviewReason[] {
  const seen = new Set<string>();
  const said = [quality.primary, quality.confirming].flatMap(judge => (judge?.reasons ?? [])
    .map(reason => reason.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, QUALITY_REASONS_EACH))
    .filter(reason => !seen.has(reason.toLowerCase()) && Boolean(seen.add(reason.toLowerCase())))
    .map(reason => clip(reason, QUALITY_REASON_CHARS));
  const found = said.length ? said : [QUALITY_NONE];
  return [...found, QUALITY_FIX].map(message => ({ code: "quality_confirmed", check: "agent-playtest", message }));
}

const measuredSchema = z.object({ state: receiptStateSchema, evidence: z.object({
  observed: z.string().optional(), fix: z.string().optional(), fault: z.string().optional(),
  certainty: z.string().optional(), retry: z.string().optional(),
}).passthrough().optional() });

function runtimeAttested(receipt: ReviewReceipt | undefined, policy: ReviewPolicy): boolean {
  const cloud = receipt?.evidence && typeof receipt.evidence === "object"
    ? (receipt.evidence as { observedCloud?: unknown }).observedCloud : null;
  return policy.launchPolicy?.runtimeAttestationVerified === true && typeof cloud === "string"
    && ["CLOUD_PROVIDER_AWS", "CLOUD_PROVIDER_GCP", "CLOUD_PROVIDER_OCI"].includes(cloud)
    && policy.launchPolicy.runtimeAttestedClouds?.includes(cloud) === true;
}

const GUEST_CHECKS = ["gpu-boot", "gpu-network", "gpu-runtime", "gpu-desktop", "bot-playtest", "agent-playtest"];

function runtimeGroupAttested(receipts: ReviewReceipt[], policy: ReviewPolicy): boolean {
  const group = GUEST_CHECKS.map(check => state(receipts, check));
  const proof = group.map(r => r?.evidence && typeof r.evidence === "object"
    ? r.evidence as { guestGenerationId?: unknown; observedCloud?: unknown } : null);
  const generation = proof[0]?.guestGenerationId;
  const cloud = proof[0]?.observedCloud;
  return typeof generation === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(generation)
    && group.every((receipt, i) => runtimeAttested(receipt, policy)
      && proof[i]?.guestGenerationId === generation && proof[i]?.observedCloud === cloud);
}

/**
 * Whether the database would play this release again as a placement retry: the predicate
 * private.platform_runtime_group_retryable answers for the scheduler and for the
 * reviewer's Re-run checks, read over the receipts as stored. Gate on with coverage, at
 * least one guest receipt, and either a group that is not one covered guest (a runtime
 * from a controller other than the bound one counts as not one guest) or a runtime the
 * controller filed as its own placement gap.
 *
 * Launch decision D55. The engine used to reach its placement hold only through the
 * one-guest test after `unfinished` had let it through, so four shapes the database retries
 * read as an outage or a timeout instead: the controller's pre-binding wrapper on a cloud
 * covered since, the same wrapper with no generation, a runtime head with no receipt, and
 * a wrapper whose inner measurement names another cloud. Below the attempt cap that only
 * mislabelled them; at the cap nothing retried them automatically, the console offered no
 * Re-run checks, and the database refused a person's approval, so the release sat with no
 * control at all although the reset it needed was one press away (review-ss SS-1).
 *
 * This only labels a hold. Nothing here unwraps a stored measurement or counts it as a
 * pass, and every shape it answers true for is one the publication check refuses.
 */
function placementRetryable(receipts: readonly ReviewReceipt[], policy: ReviewPolicy): boolean {
  const launch = policy.launchPolicy;
  if (!launch?.runtimeAttestationVerified || !launch.runtimeAttestedClouds?.length) return false;
  const runtime = state(receipts, "gpu-runtime");
  const bound = runtime?.controllerSource !== undefined && runtime.controllerSource === launch.runtimeAttestationSource;
  const gap = bound && runtime?.state === "inconclusive" && runtime.fault === "platform" && runtime.retry === "later";
  const oneGuest = bound && runtimeGroupAttested([...receipts], policy);
  return GUEST_CHECKS.some(check => state(receipts, check)) && (!oneGuest || gap);
}

/**
 * A receipt the controller filed as a gap of ours only because the machine that measured
 * it is not verified yet, read as what it is while that is still true. Null for anything
 * else, which is then read as written.
 *
 * While limits.json says the isolated runtime is unverified, the controller does not drop
 * what the GPU run measured: it files the gpu-runtime receipt as "inconclusive, platform,
 * retry later" with the real receipt inside it as `measured` (browser_isolation.py). Read
 * as written, that is an outage, so every playtest that finished under the launch policy
 * was a platform retry, the hold below was never reached, and the creator was told a
 * checking service was down.
 *
 * Only ever applied while the matching placement is unverified, and the hold below answers
 * every such release itself (held, or returned for a confirmed failure), so nothing read
 * through here can publish. Once the gate and this guest's cloud are verified, a stored
 * gap reads as written and needs a new measurement. The worker and database allow
 * that retry within the attempt limit; a reviewer can start a fresh set after it.
 *
 * Exported for the console, which shows a reviewer the measurement this reads rather than
 * the wrapper: the engine returned releases for runtime errors that the reviewer's page
 * listed only as "Waiting on us", with the errors nowhere on it.
 *
 * The third argument is no longer read. It selected the multiplayer smoke's own hold, which
 * went with SDK multiplayer; it stays optional so the console's existing call compiles.
 */
export function heldForVerification(receipt: ReviewReceipt, policy: ReviewPolicy, _multiplayer?: boolean | null): ReviewReceipt | null {
  if (receipt.state !== "inconclusive" || receipt.fault !== "platform") return null;
  if (receipt.check === "gpu-runtime" && !runtimeAttested(receipt, policy)
    && receipt.controllerSource !== undefined && receipt.controllerSource === policy.launchPolicy?.runtimeAttestationSource) {
    const evidence = receipt.evidence && typeof receipt.evidence === "object" ? (receipt.evidence as { measured?: unknown }).measured : undefined;
    const measured = measuredSchema.safeParse(evidence);
    // No readable measurement is a gap of ours whatever the policy says.
    if (!measured.success) return null;
    const m = measured.data.evidence ?? {};
    const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) => allowed.find(a => a === value);
    return { check: receipt.check, state: measured.data.state, evidence: { ...measured.data.evidence, observedCloud: (receipt.evidence as { observedCloud?: unknown }).observedCloud, guestGenerationId: (receipt.evidence as { guestGenerationId?: unknown }).guestGenerationId }, controllerSource: receipt.controllerSource,
      observed: m.observed ?? null, fix: m.fix ?? null,
      fault: pick(m.fault, ["game", "platform", "unknown"] as const), certainty: pick(m.certainty, ["certain", "heuristic"] as const),
      retry: pick(m.retry, ["now", "after-fix", "later", "never"] as const) };
  }
  return null;
}

/** The bot's receipt for a game the GPU check saw draw and the bot, on a fresh load, could
 * not (playtest.bot_not_booted_receipt). The pipeline retries that on every attempt but the
 * last, so a stored one is the last attempt's answer, and it is a person's to read: nobody
 * can tell from here whether the game boots only some of the time or our second browser
 * failed. */
function botNotBooted(receipt: ReviewReceipt | undefined): boolean {
  const evidence = receipt?.evidence && typeof receipt.evidence === "object" ? receipt.evidence as { booted?: unknown } : null;
  return receipt?.state === "inconclusive" && receipt.fault === "unknown" && evidence?.booted === false;
}

/**
 * The agent's receipt beside a bot that did not boot, read as what it is: no model played
 * because the bot could not, which waits for the person the bot's receipt sends it to.
 *
 * Until 31 Oct 2026 the isolated controller filed that receipt as "no controller-verified
 * provider scorecard", a gap of ours, and the engine answered "a platform check needs a
 * retry" after the last attempt had been spent, so the release waited for a run that never
 * came (cli-2's Northwind, panel-codex PC-03). The controller now files it as an answer of
 * its own; this reads receipts it stored the old way the same, so those releases move on
 * the next sweep rather than needing a re-run. A model that did answer, or failed to, is
 * left as written: only an agent that never played is explained by the bot.
 *
 * Nothing read through here can publish. The bot's receipt is inconclusive, and every path
 * to publication needs it to have passed: `unresolved` sends it to a person, and the
 * verification hold lists it and says the game did not pass.
 *
 * Exported for the console, which shows a reviewer the receipt as the engine read it: it
 * labelled the old shape "platform fault" and "Waiting on us" beside a release the engine
 * had already sent to that reviewer (FPR-2). The sentences are the controller's own for
 * the new shape, so a stored row and a new one read alike.
 *
 * The same gap beside a bot that did boot is read here too, as the person's receipt the
 * controller files for it now (`leftForAPerson`, launch decision D39). Stored on an attempt
 * before the last, it was settled and not rerunnable, so nothing played it again and the
 * release read "a platform check needs a retry" for good (FPR-4). Only the controller's
 * own sentence for it is matched: the controller writes the whole agent receipt, so the
 * guest cannot put it there, and a person is the only place it leads.
 */
export function keptOutByBot(receipt: ReviewReceipt, bot: ReviewReceipt | undefined): ReviewReceipt {
  if (receipt.check !== "agent-playtest") return receipt;
  const gap = receipt.state === "inconclusive" && receipt.fault === "platform";
  if (botNotBooted(bot)) {
    if (receipt.state !== "not run" && !gap) return receipt;
    return { ...receipt, state: "inconclusive", fault: "unknown", certainty: "heuristic", retry: "never",
      observed: "The bot could not load the game on the last attempt, so the agent playtest did not run.",
      fix: "Nothing to change in the game yet; a person looks at the bot playtest first." };
  }
  const evidence = receipt.evidence && typeof receipt.evidence === "object" ? receipt.evidence as Record<string, unknown> : {};
  if (!gap || (receipt.observed ?? evidence.observed) !== "No controller-verified provider scorecard.") return receipt;
  return { ...receipt, state: "inconclusive", fault: "unknown", certainty: "heuristic", retry: "never",
    observed: "The agent playtest returned no scorecard, so no model has rated the game.",
    fix: "A person checks this at review.", evidence: { ...evidence, forAPerson: true } };
}

/**
 * A receipt the isolated controller filed for a person because nothing plays it again
 * (playtest.left_for_a_person): a gap of ours on the last attempt (launch decision D38),
 * or an agent playtest that returned no scorecard on any attempt (D39). Every other check
 * that is not passed already reaches a person through `unresolved`; this is what the
 * agent's playtest needs, because a model's own "inconclusive" there does not stop
 * publication, and one that never scored the game would have published with nobody,
 * model or person, having judged its play. The controller writes the whole agent receipt
 * itself, so the mark is never the guest's. An exploration skip still takes the agent out
 * of `required` beside it (FPR-6, kept on purpose): the skip was calibrated for a release
 * whose code review and runtime already answer what the agent would have.
 */
function leftForAPerson(receipt: ReviewReceipt | undefined): boolean {
  const evidence = receipt?.evidence && typeof receipt.evidence === "object" ? receipt.evidence as { forAPerson?: unknown } : null;
  return receipt?.state === "inconclusive" && evidence?.forAPerson === true;
}

/**
 * The runtime receipt of a playtest whose last attempt ended `failed` (FPR-5): the web
 * files every check that run left unwritten as a person's (`leftForAPerson` in
 * apps/web/src/lib/platform/review.ts), and no guest wrote any of them, so it carries the
 * person's mark and no controller source. Every runtime receipt a controller files has
 * one, the person's ones included (browser_isolation.py), so a guest cannot produce this.
 *
 * It needs its own hold (launch decision D54). Under the one-guest rule (D52) it was read as
 * a placement hold, so with the gate on the creator read "a check we could not run on that
 * test machine" about a run that errored, and it left the person queue D38 and D39 send it
 * to. It never publishes and is never retried automatically: a person plays it, rejects
 * it, or uses Re-run checks for a fresh attempt set within D50's cap.
 */
function failedRun(receipt: ReviewReceipt | undefined): boolean {
  return leftForAPerson(receipt) && receipt?.controllerSource === undefined;
}

/** What the creator reads when the last attempt at a playtest ended on our side and
 * nobody is there to play it instead. A return rather than a wait, because a wait with no
 * person behind it is for ever; a new submission is a new playtest. */
const FAILED_RUN_RETURN = "Our playtest stopped on our side after every retry, before it could judge your game. Submit it again to rerun the checks.";

/**
 * A receipt that did not pass and still need not stop publication: the agent's own
 * playtest and the resize probe's guess, which the database's publication check
 * (private.platform_runtime_group_ready) already lets through unpassed, a static engine
 * name the runtime outweighs. Everything
 * else that did not pass returns.
 *
 * Nothing this lets through is a check the database requires. The reverse does not hold,
 * on purpose: the database also asks for runtime attestation, no uninspected files and no
 * rights at stake, and a publish it refuses goes to
 * the console's review lane with the engine's "publish" beside it. That lane is where the
 * team settles what only a person may (a live mod relabelled as a game, Bevy's winit hold, anything
 * before the test machine is verified); nothing there blocks the creator's answer.
 */
function softForPublication(receipt: ReviewReceipt): boolean {
  if (["agent-playtest", "gpu-desktop", "engine"].includes(receipt.check)) return true;
  return receipt.check === "gpu-runtime" && winitHeld(receipt);
}

/**
 * Bevy's winit startup throw ("Using exceptions for control flow, don't mind me"), which
 * the controller files as a heuristic runtime failure for somebody to look at (D56, D59),
 * read by the same rule as private.platform_runtime_winit_held: every uncaught error is
 * one of those throws, and nothing crashed. Answered "publish" rather than returned, so a
 * Bevy game is not sent back for its engine's habit; the database still publishes it only
 * on a person's word, because a game can write this receipt's shape (20261031185417), so it
 * reaches the console's lane. The bot's playtest still has to have passed beside it.
 */
function winitHeld(receipt: ReviewReceipt): boolean {
  const e = receipt.evidence && typeof receipt.evidence === "object" ? receipt.evidence as Record<string, unknown> : {};
  const holds = e.winitHolds;
  return receipt.state === "failed" && receipt.fault === "unknown" && receipt.certainty === "heuristic" && receipt.retry === "never"
    && typeof holds === "number" && Number.isInteger(holds) && holds >= 1 && holds <= 999_999
    && e.uncaughtErrorCount === holds && (e.pageCrashes === undefined || e.pageCrashes === 0)
    && Array.isArray(e.errors) && e.errors.length <= holds;
}

/**
 * The engine's answer for one submission.
 *
 * Nothing is returned for lateness alone (review lane decision 3, 5 Nov 2026). From 3 Nov
 * a review still open at `decisionDeadlineSeconds` was returned to the creator as
 * `check_timeout`, on the owner's "no game takes more than 10-15 minutes regardless of
 * everything". Measured that week, what is still missing at fifteen minutes is almost
 * always ours (a scanner, a provider, a queue), so a return handed the creator a chore for
 * our outage and a second review for the same bytes. The deadline is now a target the web
 * measures from the upload and the team is alerted on (`providerWaitSeconds`, through
 * `sweepReviews`); the review keeps running and `reconcile_platform` retries our checks.
 *
 * `check_timeout` stays a reason: `unfinished` below still says it past
 * `providerWaitSeconds`, on a wait, and submissions returned with it between 3 and 5 Nov
 * keep reading back through findings.ts and the CLI.
 */
export function recommend(input: ReviewInput): Recommendation {
  return decide(input);
}

function decide(input: ReviewInput): Recommendation {
  const { playtest, policy } = input;
  const read = input.receipts.filter(r => !isRetiredCheck(r.check)).map(r => heldForVerification(r, policy) ?? r);
  const receipts = read.map(r => keptOutByBot(r, state(read, "bot-playtest")));
  const skipped = Boolean(policy.launchPolicy && canSkipExploration(playtest?.quality, policy.launchPolicy.quality.primaryConfidenceMin));
  // The same checks whatever the manifest's multiplayer mode says. A `multiplayer-smoke`
  // receipt left from before the smoke was removed is in no list, so it decides nothing.
  const required = REQUIRED_CHECKS.filter(c => !(skipped && c === "agent-playtest"));
  const done = (outcome: ReviewOutcome, reasons: ReviewReason[], summary: string): Recommendation => {
    if (outcome === "publish" && policy.requireAllChecksPassed) {
      const unresolved = REQUIRED_CHECKS.map(check => state(input.receipts, check) ?? { check, state: "not run" as const })
        .filter(receipt => receipt.state !== "passed" || receipt.shadow);
      if (unresolved.length) {
        outcome = "person";
        reasons = unresolvedReasons(unresolved);
        summary = "An automated check needs a person before publication.";
      }
    }
    return { engineVersion: 1, quality: playtest?.quality ?? null, outcome, reasons, summary,
      tier: playtest?.tier ?? null, confidence: playtest?.confidence ?? null, policy };
  };

  const unsafe = REVIEW_CHECKS.safety.map(c => state(receipts, c)).filter((r): r is ReviewReceipt => r?.state === "failed" && r.fault !== "platform");
  if (unsafe.length) return done("block", unsafe.map(r => ({ code: "safety_failed", check: r.check, message: say(r, "A safety check failed.") })),
    "A safety check failed, so this release is not served.");
  const safetyUnknown = REVIEW_CHECKS.safety.filter(c => state(receipts, c)?.state !== "passed");
  if (safetyUnknown.length) return done("waiting", safetyUnknown.map(check => ({ code: "safety_hold", check,
    message: "Safety clearance is incomplete. This release stays on hold while the check is retried or reviewed." })),
    "Safety clearance is incomplete. Nothing needs changing until the evidence is reviewed.");

  if (input.multiplayer === null) return done("waiting", [{ code: "platform_retry", message: "The release manifest could not be read. We will read it again; there is nothing to fix in the game." }],
    "The release manifest needs a retry. Nothing needs changing in the game.");

  /* A confirmed game failure is a finished answer, so it is read before anything asks
     whether the checks are done, and before either verification hold: those holds keep a
     release from being PUBLISHED, and a return publishes nothing. Read after them, the
     "not run" receipts the pipeline writes downstream of the failure looked like checks
     still running, and a game whose boot drew nothing read "Playtesting" for an hour and
     then "a checking service is unavailable", where with the runtime verified the same
     receipts are returned with their fixes at once. `gpu-desktop` is a flag for a person when it is the resize probe's guess, and a
     confirmed failure only when the runner measured the picture's layout box: a phone
     column or a small fixed canvas, which needs nobody to decide (checks.screen_fill). */
  const failures = required.map(c => state(receipts, c)).filter((r): r is ReviewReceipt => Boolean(r && r.state === "failed"));
  const definite = failures.filter(r => ["preflight", "desktop"].includes(r.check) && r.fault !== "platform"
    || r.check !== "engine" && r.fault === "game" && r.certainty === "certain"
      && (REVIEW_CHECKS.eligibility as readonly string[]).concat("bot-playtest", "gpu-desktop").includes(r.check));
  if (definite.length) return done("return", definite.map(r => ({ code: r.check === "bot-playtest" ? "broken_in_playtest" : "eligibility_failed", check: r.check,
    message: r.fix?.trim() || say(r, "A game failure was confirmed. Read the finding before uploading a fix.") })),
    "A game failure was confirmed. The findings say what to fix.");

  /* Not a game, or trivial, confirmed by two model families and the runner's own
     measurement, is a finished answer for the same reason a confirmed failure is: a return
     publishes nothing, so neither verification hold has anything to protect from it. Read
     after the hold, it was a reason attached to "waiting" and a landing page sat in the
     queue beside real games until somebody verified a test machine. A jam entry stays in
     the jam whatever it is, for the judges, so it goes on to the checks below.
     Two things keep it from jumping a queue it should wait in. A check that has no answer
     because of us is retried first: returned beside it, the creator's only finding read
     "nothing to change in the game". And a flag a person was promised (an image the
     deploy said a person would look at) is still looked at, so it goes to the checks
     below as it always did. While limits.json calls the quality thresholds provisional
     (uncalibrated against a labelled set), a confirmed verdict goes to a person with the
     evidence rather than to the creator; that flag had no reader until this did. */
  const quality = playtest?.quality;
  const ourGap = required.some(c => { const r = state(receipts, c); return r?.state === "provider unavailable" || r?.fault === "platform" && r.state !== "passed"; });
  const promised = receipts.some(r => !r.shadow && flaggedForPerson(r));
  if (!input.jam && !ourGap && !promised && qualityReturn(quality, policy, receipts)) {
    const reasons = qualityReasons(quality!);
    if (policy.launchPolicy?.quality.provisional && (!policy.autonomous || policy.requireAllChecksPassed)) return done("person", reasons,
      "Two separate reviews, backed by what the playtest measured, found nothing a player can play yet. The review's thresholds are still provisional, so a person confirms it.");
    return done("return", reasons, "Two separate reviews, backed by what the playtest measured, found nothing a player can play yet.");
  }

  /* Checks that have not answered yet, or answered with a fault of ours. Asked before
     either verification hold below as well as in its usual place, because a hold read
     first turned every playtest still in its queue into "waiting", and the creator was
     told a checking service was down while their game was simply being played.
     A "not run" with the game's fault on it, beside a failure that is also the game's,
     is an answer, not a check in a queue: the pipeline writes one for every stage that
     failure gave nothing to work on (a boot that drew no frame, a bot that found the
     game broken), and nothing runs it again until a new release. Counted as missing, a
     game the bot failed on a heuristic sat at "Still running" until the timeout instead
     of reaching a person. Without the failure beside it, it explains nothing and still
     counts as missing, so it can never stand in for a check that passed.
     Under the verification hold (`excuse`), which publishes nothing and reports every
     check that did not pass, any failure of the game's excuses it. On the verified path
     only a failure that `unresolved` sends to a person does: that list leaves out the
     agent's playtest and an engine check the runtime outweighs, so a "not run" excused by
     a failure on either let a release publish with a failure beside it that nobody read.
     Until 31 Oct 2026 nothing excused one there at all, and a boot that drew nothing,
     which D2 sends to a person, sat at "this check has not finished" for good. */
  const gameFailed = failures.some(r => r.fault === "game");
  const failedForPerson = failures.some(r => r.fault === "game" && r.check !== "agent-playtest" && r.check !== "engine");
  const unfinished = (excuse = false): Recommendation | null => {
    const missing = required.filter(c => { const r = state(receipts, c); return !r || r.state === "not run" && !(r.fault === "game" && (excuse ? gameFailed : failedForPerson)); });
    const unavailable = required.filter(c => { const r = state(receipts, c); return r?.state === "provider unavailable" || r?.fault === "platform" && r.state !== "passed"; });
    if (input.playtestUnreadable || unavailable.length) return done("waiting", [
      ...(input.playtestUnreadable ? [{ code: "playtest_unreadable" as const, check: "agent-playtest", message: "We could not read the playtest result. It will be retried." }] : []),
      ...unavailable.map(check => ({ code: "platform_retry" as const, check, message: "A check could not finish on our side. We will retry it; there is nothing to fix in the game." })),
    ], "A platform check needs a retry. This is not a game failure.");
    const late = input.waitedSeconds >= policy.providerWaitSeconds;
    if (missing.length) return done(late ? "waiting" : "pending",
      missing.map(check => ({ code: late ? "check_timeout" : "check_running", check,
        message: late ? "This check has not finished. We will retry or inspect the run." : "Still running." })),
      "Required checks have not finished.");
    return null;
  };

  // Heuristic runtime failures need investigation, never an automatic request to rewrite
  // the game. Safety and content flags likewise stay held until their evidence is settled.
  // Only called once `unfinished` has found every required receipt.
  const unresolved = () => {
    const runtimeCompatible = ["gpu-boot", "gpu-network", "gpu-runtime", "bot-playtest", "gpu-desktop"]
      .every(check => state(receipts, check)?.state === "passed");
    return required.filter(c => c !== "agent-playtest" || leftForAPerson(state(receipts, c))).map(c => state(receipts, c)!)
      // A static engine name is not a browser compatibility measurement. Once the
      // attested browser actually booted and responded, its direct evidence takes over.
      .filter(r => r.state !== "passed" && !(r.check === "engine" && runtimeCompatible));
  };
  const unresolvedReasons = (list: ReviewReceipt[]): ReviewReason[] => list.map(r => ({ code: r.state === "failed" ? "flagged" : "inconclusive", check: r.check,
    message: say(r, "A check needs review before this release can be published.") }));

  /* What a hold on the test machine may call a pass is every check, not the subset
     `unresolved` sends to a person: that one leaves out the agent's playtest and an engine
     check the runtime outweighs, because on a verified machine neither stops publication
     by itself. Said to a creator as "your game passed the checks", it told one whose agent
     playtest failed, or whom two quality reviews had found not to be a game yet, that
     nothing needed changing. The quality verdict counts only when it found a playable
     attempt. The agent's playtest is counted here even when a quality score would allow it
     to be skipped (`required` then leaves it out): only a receipt that passed, or the skip
     the pipeline itself recorded, is a pass. On the unverified machine the pipeline does
     not skip, so a score alone said "passed" over an agent playtest that failed. */
  const held = (first: ReviewReason): ReviewReason[] => {
    const agent = state(receipts, "agent-playtest");
    const recordedSkip = agent?.state === "not run" && Boolean(agent.evidence && typeof agent.evidence === "object"
      && (agent.evidence as { explorationSkipped?: unknown }).explorationSkipped === true);
    const counted = required.includes("agent-playtest") || recordedSkip ? required : [...required, "agent-playtest"];
    const notPassed = counted.map(c => state(receipts, c) ?? { check: c, state: "not run" as const }).filter(r => r.state !== "passed");
    const q = playtest?.quality;
    const playable = Boolean(q?.primary && validJudgement(q.primary) && q.primary.verdict === "real-attempt" && (!q.confirming || q.confirming.verdict === "real-attempt"));
    return [first, ...unresolvedReasons(notPassed),
      ...(playable ? [] : [qualityReturn(q, policy, receipts)
        ? { code: "quality_confirmed" as const, check: "agent-playtest", message: QUALITY_NONE }
        : { code: "quality_disagreement" as const, check: "agent-playtest", message: "The quality review did not find a playable attempt, or did not finish." }])];
  };
  const placementHold = () => done("waiting", held({ code: "runtime_placement", check: "gpu-runtime",
    message: "We could not run a verified check on that test machine." }),
  /* Facts only, here and in the reason (D57 amended). Whether another run is coming, and
     whether a re-run would be accepted, is the database's answer, which the console shows
     beside this. A sentence naming the button read as an instruction on pages that, rightly,
     drew no button, and "waiting for another run" stood beside a release whose re-runs were
     spent. */
  "Publication is waiting for a check we could not run on that test machine.");
  /* A jam entry is the exception, here and in `forAPerson`: returned near the close it
     could not come back in (reenter_jam_entry answers `closed`), so a failure of ours, or
     a heuristic the engine cannot be sure of, would take a game out of the jam. Those go
     to the console's review lane, where the team answers them during the jam. */
  const failedRunReview = () => policy.autonomous && !policy.requireAllChecksPassed && !input.jam
    ? done("return", [{ code: "runtime_failed_run", check: "gpu-runtime", message: FAILED_RUN_RETURN }],
      "Our playtest stopped on our side. Submit the game again to rerun the checks.")
    : done("person", [{ code: "runtime_failed_run", check: "gpu-runtime",
      message: "The playtest could not finish on our side, so there is no scorecard. Play the game yourself before deciding." },
    ...unresolvedReasons(unresolved())], "The playtest could not finish on our side. A person reviews the release.");
  /* The one place a finished review used to stop and wait for somebody. With
     review.autonomous on, nobody is coming, so the engine answers the same receipts the
     way the database would let it: what `publicationReady` says may publish does, and
     everything else goes back to the creator with what was seen. */
  const forAPerson = (list: ReviewReceipt[]) => {
    if (!policy.autonomous || policy.requireAllChecksPassed) return done("person", unresolvedReasons(list), "A person reviews the unresolved check evidence.");
    const stopping = list.filter(r => !softForPublication(r));
    if (stopping.length && input.jam) return done("person", unresolvedReasons(stopping),
      "A check did not pass. The team reviews this jam entry so it is not taken out of the jam by mistake.");
    if (stopping.length) return done("return", unresolvedReasons(stopping),
      "A check did not pass. Fix what the findings describe, then submit again.");
    // Said as it is when the one runtime error was Bevy's startup throw, which the
    // console's lane reads beside a receipt that did not pass.
    const winit = list.some(r => r.check === "gpu-runtime");
    return done("publish", [{ code: "quality_disagreement", message: winit
      ? "Safety checks passed, and the only runtime error was Bevy's startup throw. The remaining notes do not block publication."
      : "Safety and runtime checks passed. The remaining notes are about quality and do not block publication." }],
      "Safety and runtime checks passed. Small playable attempts are welcome.");
  };

  /* A guest group the database would play again as a placement retry is that hold,
     whatever else the receipts look like (D55, `placementRetryable`). Only a wait on the
     guest's own receipts gives way to it, and only once every one of them has a head: a
     first run still writing has some missing, and is still running rather than waiting
     for another machine. A check outside the guest, or a playtest row we could not read,
     is reported as before. A failed run keeps its own hold (D54). Gate on with coverage
     only, so with the gate off nothing here runs. */
  const runtime = state(receipts, "gpu-runtime");
  if (placementRetryable(input.receipts, policy)) {
    const open = unfinished(true);
    const guestWait = !input.playtestUnreadable && GUEST_CHECKS.every(check => state(input.receipts, check))
      && Boolean(open?.reasons.every(r => r.check !== undefined && GUEST_CHECKS.includes(r.check)));
    if (open && !guestWait) return open;
    return failedRun(runtime) ? failedRunReview() : placementHold();
  }

  /* Until OpenGame has verified its own test machine (the isolated runtime), nothing its
     checks say can move a release, so every finished one is held. That is ours and has no retry: it lifts when
     limits.json verifies the cloud this guest observed. `runtime_unverified` is how a reader tells
     it from an outage (reviewHold below), and any check that did not pass rides along
     so a creator is never told a game passed when it did not. */
  const groupAttested = runtimeGroupAttested(receipts, policy);
  const sandboxUnverified = !runtimeAttested(runtime, policy)
    || Boolean(policy.launchPolicy?.runtimeAttestationVerified && !groupAttested);
  if (sandboxUnverified || !runtime?.controllerSource || runtime.controllerSource !== policy.launchPolicy?.runtimeAttestationSource) {
    const open = unfinished(sandboxUnverified);
    if (open) return open;
    /* With nobody to hold a finished release for, the engine answers it on what was
       measured, and the database stays the one that decides whether an unverified machine's
       pass may publish: platform_record_recommendation asks runtime attestation and the
       guest group's readiness itself, and sends a publish it refuses to the console. A
       return publishes nothing, so nothing a hold protects is at stake in one. */
    if (policy.autonomous) {
      if (failedRun(runtime) || leftForAPerson(runtime)) return failedRunReview();
    }
    // Gate on only: with the gate off every release waits under the D4 hold below, as before.
    else if (policy.launchPolicy?.runtimeAttestationVerified && failedRun(runtime)) return failedRunReview();
    else if (sandboxUnverified) {
      // Gate on with no coverage reaches this too: every cloud is uncovered then.
      if (policy.launchPolicy?.runtimeAttestationVerified && !groupAttested) return placementHold();
      const reasons = held({ code: "runtime_unverified", check: "gpu-runtime",
        message: "The checks ran on a test machine OpenGame has not finished verifying, so the release is held until it has." });
      return done("waiting", reasons, reasons.length > 1 ? "The checks finished. The release is held until OpenGame finishes verifying its test machine."
        : "The checks passed. The release is held until OpenGame finishes verifying its test machine; nothing needs changing in the game.");
    }
    /* A runtime receipt left for a person carries no controller's attestation because no
       controller measured anything: the playtest's last attempt ended without receipts
       (evaluateSubmission). Held here, it waited on a verification that run could never
       give (FPR-5). It cannot publish: it is inconclusive, so `unresolved` names it. */
    else if (leftForAPerson(runtime)) return forAPerson(unresolved());
    else return done("waiting", [{ code: "safety_hold", check: "gpu-runtime", message: "The isolated runtime has not completed independent verification. Publication stays on hold." }],
      "Runtime verification is incomplete. Nothing needs changing in the game.");
  }

  const open = unfinished();
  if (open) return open;

  const notPassed = unresolved();
  if (notPassed.length) return forAPerson(notPassed);

  // Anything else this confirmed was returned above, before the holds.
  if (input.jam && qualityReturn(quality, policy, receipts)) return done("publish", [{ code: "jam_entry", message: "The safety and runtime checks passed. The jam judges assess the game itself." }],
    "The checks passed. This entry can remain in the jam.");
  return done("publish", [{ code: "quality_disagreement", message: "Safety and runtime checks passed. Uncertain quality judgements do not prevent publication." }],
    "Safety and runtime checks passed. Small playable attempts are welcome.");
}

/** A wait that is OpenGame's own verification hold rather than an outage: the checks
 * have finished, nothing is retried, and the release moves once the test machine is
 * verified. `passed` is true only when every check passed, the agent's playtest, the
 * engine check and the quality verdict included; anything held with it makes it false. */
export interface ReviewHold { reason: "verification" | "placement"; passed: boolean }

/**
 * Whether a stored recommendation is the verification hold. Read from the jsonb on the
 * submission row, so it takes anything and answers null for an older or unreadable one,
 * which then reads as the ordinary wait it was recorded as. The creator's surfaces and
 * the console both ask here, so they cannot draw the line in two places.
 */
export function reviewHold(recommendation: unknown): ReviewHold | null {
  const r = recommendation && typeof recommendation === "object" ? recommendation as { outcome?: unknown; reasons?: unknown } : null;
  if (r?.outcome !== "waiting" || !Array.isArray(r.reasons)) return null;
  const codes = r.reasons.map(reason => reason && typeof reason === "object" ? (reason as { code?: unknown }).code : null);
  if (!codes.includes("runtime_unverified") && !codes.includes("runtime_placement")) return null;
  return { reason: codes.includes("runtime_placement") ? "placement" : "verification",
    passed: codes.every(code => code === "runtime_unverified" || code === "runtime_placement") };
}

/** Whether a stored recommendation sent a failed playtest run to a person (D54). Not a
 * `reviewHold`: it is with a person, not waiting, and the console offers Re-run checks
 * beside it rather than a placement message. */
export function failedRunHold(recommendation: unknown): boolean {
  const r = recommendation && typeof recommendation === "object" ? recommendation as { outcome?: unknown; reasons?: unknown } : null;
  return r?.outcome === "person" && Array.isArray(r.reasons)
    && r.reasons.some(reason => reason && typeof reason === "object" && (reason as { code?: unknown }).code === "runtime_failed_run");
}

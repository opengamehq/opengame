import { z } from "./zod";
import { RELEASE_STATUS, operationErrorText } from "./status";
import { ERRORS, type ErrorRow } from "./errors";
import type { ReceiptState } from "./release";
import { QUALITY_FIX, REVIEW_CHECKS } from "./review";
import { engineLabel } from "./engine";
import { LIMITS } from "@opengame/shared/browser";

/* With review.autonomous on, nobody confirms anything later: the automatic review reads
   these receipts when the game is submitted and publishes or returns on them. Every
   sentence below that promised a person says that instead (3 Nov 2026). */
const AUTONOMOUS = LIMITS.platform.review.autonomous === true;
const AUTOMATIC_LATER = "When you submit, we check this again. If it still has no answer, the release comes back to you with this finding.";
// Checks whose inconclusive answer publishes all the same (softForPublication in review.ts).
const SOFT_CHECKS: readonly string[] = ["agent-playtest", "gpu-desktop", "text-policy"];
// The controller's sentence for a receipt it filed for a person (playtest.PERSON_FIX).
const PERSON_FIX = /^A person checks this at review\.?$/;
// Returns the review engine makes for a failure of ours, and what a creator does about one.
const OUR_RETURNS = new Set(["check_timeout", "runtime_failed_run"]);
const OUR_RETURN_FIX = "Nothing to change in your game. Run opengame submit to rerun the checks.";

/* The uncalibrated text classifier is advisory. A shadow mark cannot hide image,
   runtime or eligibility findings, or a guest could suppress the evidence that
   prevents publication by attaching an advisory label to its own result. */
const SHADOWABLE: readonly string[] = ["text-policy"];
const shadowed = (check: string, evidence: unknown) => SHADOWABLE.includes(check) && isShadowEvidence(evidence);

/**
 * The repair finding is the one thing an agent reads to decide what to do next,
 * so it has exactly one producer for server results: this file. The website, the
 * CLI's `--json` and human output, and the console all render what it returns.
 *
 * Shape is the platform contract and is additive only. `certainty` exists so an
 * agent does not rewrite a working game over a guess; `fault` exists so it does
 * not rewrite one over our outage.
 */
export const FINDING_STATES = ["failed", "inconclusive", "provider unavailable", "not run"] as const;
export const repairFindingSchema = z.object({
  release: z.string().nullable(),
  check: z.string().min(1).max(80),
  checkVersion: z.string().min(1).max(80),
  state: z.enum(FINDING_STATES),
  certainty: z.enum(["certain", "heuristic"]),
  fault: z.enum(["game", "platform", "unknown"]),
  evidence: z.object({
    observed: z.string().min(1),
    file: z.string().optional(),
    request: z.string().optional(),
    frame: z.string().optional(),
  }),
  fix: z.string().min(1),
  verify: z.string().min(1),
  retry: z.enum(["now", "after-fix", "later", "never"]),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  docs: z.string().optional(),
});
export type RepairFinding = z.infer<typeof repairFindingSchema>;

/** A receipt as the server selects it: the head attempt's result for one check. */
export interface FindingReceipt {
  releaseId: string;
  check: string;
  checkVersion: string;
  state: ReceiptState;
  evidence: unknown;
}

const LIMIT = { observed: 400, fix: 500, path: 300, perReceipt: 8, total: 40 } as const;

/** Paths and titles in evidence are authored by whoever built the game. Keep
 * them as data: one line, bounded, and with no terminal or bidi controls. The
 * marks and zero-width characters (U+200B to U+200F, U+061C) go too: they
 * reorder or hide text as well as the embeddings and isolates do. */
export const INVISIBLE_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]+/g;
function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(INVISIBLE_CONTROLS, " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return [...text].length > max ? [...text].slice(0, max - 1).join("") + "…" : text;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function seconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(Math.ceil(value), 86_400) : undefined;
}

/** What each check is called in a sentence, and what to say when it fails and we
 * have nothing more specific. Unknown checks still read as a sentence. */
const CHECKS: Record<string, { label: string; observed: string; fix: string; passed: string; serverOnly?: boolean; inconclusiveBlocks?: string }> = {
  // An archive warning nobody can clear fails the deploy (archive_warning_unreviewed),
  // and no person is told, so "a person will confirm this" would be untrue here.
  archive: { label: "archive", passed: "The archive opened cleanly.",  observed: "The archive could not be opened safely.",
    fix: "Let opengame deploy build the archive from your build folder rather than uploading a hand-made ZIP.",
    inconclusiveBlocks: "Remove or replace the files the archive check warned about, then deploy again." },
  malware: { label: "malware scan", passed: "The malware scan found nothing.",  observed: "The malware scanner flagged a file in this build.", serverOnly: true,
    fix: "Rebuild from clean sources and remove anything you did not write or install from a trusted package." },
  secrets: { label: "secrets scan", passed: "No credentials were found in the build.",  observed: "A file in this build looks like it holds a credential.",
    fix: "Remove the credential from the build. If it is real, rotate it." },
  preflight: { label: "packaging check", passed: "The build meets the packaging rules.",  observed: "The build does not meet the packaging rules.",
    fix: "Run opengame check and fix what it reports." },
  engine: { label: "engine check", passed: "It runs as a Three.js game.",  observed: "This build does not look like a Three.js game.",
    fix: "Export a Three.js build of your game." },
  desktop: { label: "desktop layout check", passed: "It fits a desktop window.",  observed: "This build uses a layout that does not fit a desktop window.",
    fix: "Remove any portrait lock and let the game resize with the window." },
  // An image the safety check held fails the deploy too (image_needs_review), whether
  // moderation flagged a category the content policy does not serve or the vision check
  // was unsure about a minor. No clearance exists to wait for, so replacing the image is
  // the only way forward. The receipt's own sentences name which; this is the fallback.
  images: { label: "image review", passed: "Every image passed review.",  observed: "An image in this build was flagged by the image check.", serverOnly: true,
    fix: "Replace or remove the flagged image.",
    inconclusiveBlocks: "Replace the held image with a different one, then deploy again." },
  "text-policy": { label: "text review", passed: "The text review found nothing to change.",  observed: "Some text in this game was flagged by the text policy.", serverOnly: true,
    fix: "Reword the flagged text in opengame.json or in the game." },
};
/** The submit-time checks. Their receipts carry their own sentences, so only the name
 * is needed here: what a check is called when it did not run, or in the console's list
 * of checks that passed. */
const SUBMIT_LABELS: Record<string, string> = {
  "gpu-boot": "boot check", "gpu-network": "network check", "gpu-desktop": "desktop sizes check", "gpu-runtime": "runtime check",
  "bot-playtest": "bot playtest", "agent-playtest": "agent playtest", "image-flags": "flagged images check",
};
function copy(check: string) {
  if (Object.hasOwn(CHECKS, check)) return CHECKS[check]!;
  const label = Object.hasOwn(SUBMIT_LABELS, check) ? SUBMIT_LABELS[check]! : `${check} check`;
  return {
    label, observed: `The ${label} did not pass.`, passed: `The ${label} passed.`, serverOnly: true,
    fix: "Read the evidence, change what it names, then deploy again.",
  };
}

/**
 * The checks a release passed, one sentence each, in the order given. The workspace
 * lists these above the findings so a person reads what was checked as well as what
 * failed; everything that did not pass is a finding from `receiptFindings` and is not
 * repeated here. Shadow evidence is left out like everywhere else.
 */
export function passedChecks(receipts: readonly FindingReceipt[]): { check: string; sentence: string }[] {
  return receipts.filter(receipt => receipt.state === "passed" && !shadowed(receipt.check, receipt.evidence))
    .map(receipt => ({ check: receipt.check, sentence: noImages(receipt) ? "There are no images in this build to review."
      : receipt.check === "engine" && detectedEngine(receipt.evidence) ? `We detected ${detectedEngine(receipt.evidence)}.` : copy(receipt.check).passed }));
}

/**
 * "Phaser 3.90.0", read from the preflight the engine receipt carries, or undefined when
 * the scan named nothing. The sentences for this check used to be about Three.js alone,
 * so a passed Phaser build read "It runs as a Three.js game", and an undecided one said
 * only that the check "could not decide", with the engine it HAD found sitting unread in
 * the same receipt. The version is read out of the game's own bytes, so it is cleaned
 * like any other text a game wrote.
 */
function detectedEngine(evidence: unknown): string | undefined {
  const engine = object(object(object(evidence)?.preflight)?.engine);
  const name = clean(engine?.name, 60);
  if (!name) return undefined;
  return engineLabel({ name, version: clean(engine?.version, 40) ?? null }) ?? undefined;
}
/** The pipeline's stock sentence for an engine receipt with no row of its own. */
const UNDECIDED = /could not decide this upload automatically/i;

/** An image review that passed because there was nothing to look at. "Every image passed
 * review" was printed for the starter template, which has none, and read as a review that
 * had happened. The receipt lists the attempts it made, so an empty list is the tell. */
function noImages(receipt: FindingReceipt): boolean {
  const evidence = receipt.evidence as { imageAttemptIds?: unknown } | null;
  return receipt.check === "images" && Array.isArray(evidence?.imageAttemptIds) && evidence.imageAttemptIds.length === 0;
}

/** The checks whose inconclusive result blocks the deploy rather than waiting for a
 * person. scripts/docs-gen.mjs reads this so the repair-loop guide names each of them:
 * the guide and the deploy skill said "a person confirms" every inconclusive check. */
export const INCONCLUSIVE_BLOCKS: readonly string[] = Object.keys(CHECKS).filter(check => CHECKS[check]!.inconclusiveBlocks);

/** What a check is called in a sentence. The same name every finding uses for it. */
export function receiptLabel(check: string): string {
  return copy(check).label;
}

/** How a finding's extra paths are introduced in its fix. Anything not listed is "Also". */
const MORE_LEAD: Record<string, string> = { "missing-ref": "Not found", "root-ambiguous": "Candidates" };

/**
 * The preflight's `more` list as the opening of a fix, or "" when there is none. The CLI's
 * local check and the server's receipt both build a finding from the same preflight row,
 * and the CLI keeps one of two findings with the same sentence, the server's. When only
 * the CLI wrote the names, they vanished from the terminal the moment the receipt arrived.
 *
 * `more` is where the preflight lists what it found when one name is not enough. It leads
 * the fix rather than joining `observed`, which stays the one stable sentence an AGENTS.md
 * can quote: the paths carry a bundler's per-build hashes.
 *
 * WHAT THE LIST MEANS DEPENDS ON THE CHECK, and the lead-in has to say which. Only for a
 * missing reference is it files that are absent. For two possible roots it is the
 * candidates, for a credential the other places one was found, for a name rule the other
 * names that break it. All of these were once led by "Not found:", so an agent was told to
 * restore a/index.html and b/index.html when both were present and the problem was that
 * there were two.
 */
export function moreLead(code: string, more: unknown): string {
  const list = [...new Set(Array.isArray(more) ? more.filter((item): item is string => typeof item === "string") : [])];
  if (!list.length) return "";
  return `${MORE_LEAD[code] ?? "Also"}: ${list.slice(0, 10).join("; ")}${list.length > 10 ? "; and more" : ""}. `;
}

// Static preflight findings travel inside the preflight evidence. Each derived
// receipt owns a slice of them, so one finding is reported under one check.
const PREFLIGHT_CODES: Record<string, (code: string) => boolean> = {
  secrets: code => ["credential", "credential-in-file", "possible-secret"].includes(code),
  engine: code => code === "platform-engine",
  desktop: code => code === "platform-desktop",
  preflight: code => !["credential", "credential-in-file", "possible-secret", "platform-engine", "platform-desktop"].includes(code),
};

interface Detail { observed?: string; file?: string; fix?: string }

/** Pre-contract evidence: the receipt holds the scanner's own rows. Read only the
 * sentence and the file. Scanner internals, signatures and digests stay out. */
function legacyDetails(check: string, state: ReceiptState, evidence: Record<string, unknown>): Detail[] {
  const preflight = object(evidence.preflight);
  if (preflight && Object.hasOwn(PREFLIGHT_CODES, check) && Array.isArray(preflight.findings)) {
    const wanted = state === "failed" ? "blocker" : "warning";
    return preflight.findings.map(object).filter((row): row is Record<string, unknown> =>
      Boolean(row && typeof row.code === "string" && PREFLIGHT_CODES[check]!(row.code) && row.severity === wanted))
      .map(row => ({ observed: clean(row.title, LIMIT.observed),
        fix: clean(moreLead(row.code as string, row.more) + (typeof row.detail === "string" ? row.detail : ""), LIMIT.fix),
        file: clean(typeof row.path === "string" ? row.path + (Number.isSafeInteger(row.line) ? `:${row.line}` : "") : undefined, LIMIT.path) }));
  }
  const row = object(evidence.check);
  const detail = object(row?.detail);
  if (check === "archive" && detail && Array.isArray(detail.findings)) {
    return detail.findings.map(object).filter((item): item is Record<string, unknown> => Boolean(item && item.severity !== "info" && item.severity !== "note"))
      .map(item => ({ observed: clean(item.message, LIMIT.observed),
        file: clean(typeof item.path === "string" ? item.path + (Number.isSafeInteger(item.line) ? `:${item.line}` : "") : undefined, LIMIT.path) }));
  }
  return [];
}

/** Contract evidence, written by the pipeline: one sentence, a place, and what to
 * do. A receipt may also carry several such rows under `findings`. */
function contractRows(evidence: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(evidence.findings) ? evidence.findings.map(object).filter(Boolean) as Record<string, unknown>[] : [evidence];
}
function contractDetails(check: string, evidence: Record<string, unknown>): (Detail & { row: Record<string, unknown> })[] {
  // Shadow evidence is recorded, never shown, whether the receipt or one row says so.
  return contractRows(evidence).filter(row => typeof row.observed === "string" && !shadowed(check, row)).map(row => ({ row,
    observed: clean(row.observed, LIMIT.observed), fix: clean(row.fix, LIMIT.fix),
    file: clean(row.file, LIMIT.path) }));
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : undefined;
}

/**
 * Turn the selected receipts of one release into repair findings.
 *
 * Only `passed` satisfies a gate, so every other state becomes a finding, with
 * two exceptions: a receipt the pipeline marks as shadow evidence (text policy
 * runs that way until it is calibrated) is never shown as something to fix, and
 * a check that did not run because another check already refused the build is
 * not reported as our outage.
 */
export function receiptFindings(receipts: readonly FindingReceipt[], options: { stage?: "deploy" | "review"; ended?: boolean } = {}): RepairFinding[] {
  // A deploy that has finished is retried by nobody: our outage on one is a redeploy
  // later, and "We will retry this check" under "Stopped on our side" was untrue.
  const ended = options.ended === true;
  // After review the change goes out as a new release that has to be submitted again;
  // "deploy, then status" would leave an agent watching a preview nobody reviews.
  const reviewed = options.stage === "review";
  const refused = receipts.some(receipt => receipt.state === "failed" && !shadowed(receipt.check, receipt.evidence));
  const findings: RepairFinding[] = [];
  for (const receipt of receipts) {
    if (receipt.state === "passed" || shadowed(receipt.check, receipt.evidence)) continue;
    if (receipt.state === "not run" && refused) continue;
    const evidence = object(receipt.evidence) ?? {};
    const text = copy(receipt.check);
    const fromContract = contractDetails(receipt.check, evidence);
    // Every row was shadow evidence: there is nothing here a creator acts on.
    if (!fromContract.length && contractRows(evidence).some(row => typeof row.observed === "string")) continue;
    const details: (Detail & { row?: Record<string, unknown> })[] = fromContract.length ? fromContract : legacyDetails(receipt.check, receipt.state, evidence);
    const platform = receipt.state === "provider unavailable" || receipt.state === "not run";
    const blocks = receipt.state === "inconclusive" ? text.inconclusiveBlocks : undefined;
    for (const detail of (details.length ? details : [{}]).slice(0, LIMIT.perReceipt)) {
      const row = detail.row ?? {};
      const fault = pick(row.fault, ["game", "platform", "unknown"] as const)
        ?? (platform ? "platform" : receipt.state === "inconclusive" && !blocks ? "unknown" : "game");
      const retry = pick(row.retry, ["now", "after-fix", "later", "never"] as const)
        ?? (fault === "platform" ? "later" : receipt.state === "inconclusive" && !blocks ? "never" : "after-fix");
      const certainty = pick(row.certainty, ["certain", "heuristic"] as const)
        ?? (receipt.state === "inconclusive" ? "heuristic" : "certain");
      // An undecided engine says what was found and who settles it, once. The receipt's
      // own words were three sentences, two of them saying a person would confirm it.
      const undecided = receipt.check === "engine" && receipt.state === "inconclusive" && (!detail.observed || UNDECIDED.test(detail.observed));
      const named = undecided ? detectedEngine(evidence) : undefined;
      // The playtest is what says a build runs, whoever decides the release, so the engine
      // name is a note in either mode. The manual mode's "a reviewer confirms the engine
      // before publishing" promised every creator a person checking their game.
      const observed = undecided
          ? (named ? `We detected ${named}. We test whether it runs in the playtest, so the engine name is only a note.`
            : "We could not tell which engine made this build. We test whether it runs in the playtest, so this is only a note.")
        : detail.observed ?? (platform
        ? `The ${text.label} ${receipt.state === "not run" ? "has not run yet" : "was unavailable"}.`
        : receipt.state === "inconclusive" ? `The ${text.label} could not confirm this build from its files alone.` : text.observed);
      // Our outage never asks for a code change, whatever the row says. A row that says
      // "nothing to change" keeps its own words, though: on a deploy the outage ended,
      // "We will retry this check" was untrue, and the receipt's "Deploy again later" was right.
      const fix = undecided ? "Your game does not need to change."
        : fault === "platform" ? (detail.fix && /^Nothing to change\b/i.test(detail.fix) ? detail.fix
          : ended ? "Nothing to change in your game. Run opengame deploy again later." : "Nothing to change in your game. We will retry this check.")
        // The pipeline's own sentence usually already says a reviewer confirms it; adding
        // ours after it read "A reviewer will confirm the engine before publication. A
        // person will confirm this before publication" in one breath.
        : retry === "never" && receipt.state === "inconclusive" && AUTONOMOUS
          // An engine name the playtest outweighs never returns a game (softForPublication).
          ? receipt.check === "engine" ? "You can leave this as it is. We test whether the game runs in the playtest."
          // A soft check never stops a publication, even one the controller filed for a
          // person (softForPublication): a run that stopped on our side returns the release
          // through gpu-runtime's own receipt, so this one only says what it is.
          : SOFT_CHECKS.includes(receipt.check) ? "This does not block publication."
          : detail.fix && PERSON_FIX.test(detail.fix) ? AUTOMATIC_LATER
          : detail.fix && !/before publication|at review|a person|a reviewer/i.test(detail.fix) ? `${detail.fix.replace(/\s*$/, "")} ${AUTOMATIC_LATER}` : AUTOMATIC_LATER
        : retry === "never" && receipt.state === "inconclusive" ? detail.fix
          ? (/before publication|at review/i.test(detail.fix) ? `${detail.fix.replace(/\s*$/, "")} Nothing has to change now.`.replace(/(Nothing has to change now\.)\s*\1$/, "$1") : `${detail.fix} A person will confirm this before publication, so nothing has to change now.`)
          : "A person will confirm this before publication, so nothing has to change now."
        : detail.fix ?? blocks ?? text.fix;
      const request = clean(row.request, LIMIT.path);
      const frame = clean(row.frame, LIMIT.path);
      const wait = seconds(row.retryAfterSeconds) ?? seconds(row.retryAfter) ?? seconds(evidence.retryAfterSeconds) ?? seconds(evidence.retryAfter);
      const docs = clean(row.docs, LIMIT.path);
      findings.push({
        release: receipt.releaseId, check: receipt.check, checkVersion: receipt.checkVersion,
        state: receipt.state, certainty, fault,
        evidence: { observed, ...(detail.file ? { file: detail.file } : {}), ...(request ? { request } : {}), ...(frame ? { frame } : {}) },
        fix,
        verify: fault === "platform" && ended ? "opengame deploy"
          : fault === "platform" || retry === "never" ? "opengame status --watch"
          : reviewed ? "opengame deploy, then opengame submit with the new release"
          : text.serverOnly ? "opengame deploy, then opengame status --watch" : "opengame check, then opengame deploy",
        retry, ...(retry === "later" && wait !== undefined ? { retryAfterSeconds: wait } : {}),
        ...(docs ? { docs } : {}),
      });
    }
  }
  const order = { game: 0, unknown: 2, platform: 1 } as const;
  return findings.sort((a, b) => Number(a.state !== "failed") - Number(b.state !== "failed") || order[a.fault] - order[b.fault])
    .slice(0, LIMIT.total);
}
/** A review finding: the repair finding an agent acts on, plus the reviewer-facing
 * sentence older clients printed (`message`), which stays so they keep working. */
export type ReviewFinding = RepairFinding & { message: string };
export const reviewFindingSchema = repairFindingSchema.extend({ message: z.string() });

/**
 * The findings of a returned submission, through the same mapper as a deploy's.
 *
 * The decision engine's reasons name a check and say one sentence. They reached agents
 * as `{ check, message }` while a deploy's findings carried fix, verify, retry, fault and
 * certainty, so an agent repairing a returned game could not tell a heuristic return from
 * a certain one, or our fault from the game's. Each reason is now read back to the
 * receipt that produced it, when that receipt did not pass, so the file, request and
 * fault the pipeline wrote come with it. A reason with no such receipt (the playtest
 * judged the game too shallow while its own receipt passed) becomes a receipt-shaped row
 * here and goes through the same mapper, marked heuristic, because a depth judgement is
 * a model's reading of play rather than a fact about a file.
 */
export function reviewFindings(releaseId: string, reasons: readonly { code: string; check?: string; message: string }[],
  receipts: readonly FindingReceipt[]): ReviewFinding[] {
  const rows: FindingReceipt[] = [];
  const said = new Map<string, string>();
  for (const reason of reasons) {
    const check = reason.check ?? "review";
    if (!said.has(check)) said.set(check, reason.message);
    /* A return of ours (the deadline, or a playtest that stopped on our side) is never
       read back to the check's receipt: that receipt says a retry is coming or a person
       will look, and the submission has ended with neither. Made here as our fault, with
       the one command that starts the checks again. */
    if (OUR_RETURNS.has(reason.code)) {
      if (!rows.some(row => row.check === check)) rows.push({ releaseId, check, checkVersion: receipts.find(item => item.check === check)?.checkVersion ?? "1",
        state: "inconclusive", evidence: { observed: reason.message, fault: "platform", certainty: "certain", retry: "now", fix: OUR_RETURN_FIX } });
      continue;
    }
    const receipt = receipts.find(item => item.check === check && item.state !== "passed" && !shadowed(item.check, item.evidence));
    if (receipt) { if (!rows.includes(receipt)) rows.push(receipt); continue; }
    // A not-a-game return ends on its fix as a line of its own, for the mail. Here every
    // shallow row already carries it as its fix, so it is not a finding by itself.
    if (reason.code === "quality_confirmed" && reason.message === QUALITY_FIX) continue;
    const shallow = reason.code === "below_bar" || reason.code === "quality_confirmed";
    rows.push({ releaseId, check, checkVersion: receipts.find(item => item.check === check)?.checkVersion ?? "1", state: "failed",
      evidence: { observed: reason.message, fault: "game", certainty: shallow ? "heuristic" : "certain", retry: "after-fix",
        fix: shallow ? QUALITY_FIX : reason.message } });
  }
  /* A row made from a reason says that reason as its observed sentence, so it is its own
     message: several shallow-play reasons share one check, and keying by check printed the
     first one for all of them. A finding read back to a receipt keeps the reason's words. */
  const made = new Set(rows.filter(row => !receipts.includes(row)).map(row => row.check));
  return receiptFindings(rows, { stage: "review" }).map(finding => ({ ...finding,
    ...(finding.fault === "platform" && finding.fix === OUR_RETURN_FIX ? { verify: "opengame submit" } : {}),
    message: made.has(finding.check) ? finding.evidence.observed : said.get(finding.check) ?? finding.evidence.observed }));
}

/** Evidence written in shadow mode: recorded for a person, never a reason to wait or refuse. */
export function isShadowEvidence(evidence: unknown): boolean {
  const value = object(evidence);
  return value?.shadow === true || value?.mode === "shadow";
}

/** Where a pending operation is, in words, and whose move it is. */
export const operationStageSchema = z.object({
  code: z.enum(["upload", "queued", "preparing", "scanning", "waiting", "images", "text", "ready", "failed", "expired"]),
  label: z.string().min(1),
  message: z.string().min(1),
  waitingOn: z.enum(["you", "opengame", "nobody"]),
  fault: z.enum(["game", "platform", "unknown"]).nullable(),
  since: z.string().optional(),
});
export type OperationStage = z.infer<typeof operationStageSchema>;

const STAGE_COPY: Record<OperationStage["code"], Omit<OperationStage, "code" | "since" | "fault">> = {
  upload: { label: "Uploading", message: "Waiting for your archive to finish uploading. Run opengame deploy to resume it.", waitingOn: "you" },
  queued: { label: "Queued", message: "Queued for checks. Nothing to do.", waitingOn: "opengame" },
  preparing: { label: "Preparing", message: "Preparing your release. Nothing to do.", waitingOn: "opengame" },
  scanning: { label: "Checking", message: "Checking files, malware and secrets. Nothing to do.", waitingOn: "opengame" },
  waiting: { label: RELEASE_STATUS.waiting.label, message: RELEASE_STATUS.waiting.message, waitingOn: "opengame" },
  images: { label: "Checking images", message: "Reviewing the images in your build. Nothing to do.", waitingOn: "opengame" },
  text: { label: "Checking text", message: "Reviewing your title, description and in-game text. Nothing to do.", waitingOn: "opengame" },
  ready: { label: "Ready", message: "Your private preview is ready.", waitingOn: "nobody" },
  failed: { label: RELEASE_STATUS.blocked.label, message: RELEASE_STATUS.blocked.message, waitingOn: "you" },
  expired: { label: RELEASE_STATUS.expired.label, message: RELEASE_STATUS.expired.message, waitingOn: "you" },
};
const SCAN_CHECKS = ["archive", "malware", "secrets", "preflight", "engine", "desktop"];

/**
 * A presentation of the readiness function's progress, read from the same durable
 * receipts it writes. It never decides readiness; `platform_finalize_deploy` does.
 */
// The readiness function's own pending stages, which pipeline-ready persists as
// platform_operations.check_stage. When present they are the better answer.
const CHECK_STAGES: Record<string, OperationStage["code"]> = {
  candidate: "preparing", "receipt-contract": "scanning", storage: "scanning", scan: "scanning",
  "scan-evidence": "waiting", "credential-coverage": "waiting", images: "images", "text-policy": "text",
};

export function operationStage(operation: { state: string; hasCandidate: boolean; updatedAt?: string; checkStage?: string | null; error?: string | null;
  /** A check's provider answered "unavailable" on its newest try and the check is
   * retrying it. Only the image review records that before its receipt exists. */
  providerDown?: boolean }, receipts: readonly FindingReceipt[], findings: readonly RepairFinding[] = []): OperationStage {
  const make = (code: OperationStage["code"], fault: OperationStage["fault"] = null): OperationStage =>
    ({ code, ...STAGE_COPY[code], fault, ...(operation.updatedAt ? { since: operation.updatedAt } : {}) });
  if (operation.state === "uploading") return make("upload");
  if (operation.state === "queued") return make("queued");
  if (operation.state === "ready") return make("ready");
  if (operation.state === "expired") return make("expired");
  if (operation.state === "failed") {
    // Whose move it is comes from the one outcome rule the CLI's exit code and
    // the website's copy also read, never from the receipts' states alone: an
    // outage leaves receipts "provider unavailable", which no state filter sees.
    const outcome = operationOutcome({ state: "failed", error: operation.error ?? null }, findings)!;
    const fault = outcome.fault === "game" || outcome.fault === "platform" || outcome.fault === "unknown" ? outcome.fault : null;
    return { ...make("failed", fault), label: outcome.label, ...FAILED_STAGE[outcome.fault] };
  }
  if (!operation.hasCandidate) return make("preparing");
  const persisted = operation.checkStage && Object.hasOwn(CHECK_STAGES, operation.checkStage) ? CHECK_STAGES[operation.checkStage]! : null;
  const states = new Map(receipts.filter(receipt => !shadowed(receipt.check, receipt.evidence)).map(receipt => [receipt.check, receipt.state]));
  if (persisted === "waiting" || operation.providerDown || [...states.values()].some(state => state === "provider unavailable" || state === "not run")) return make("waiting", "platform");
  if (persisted) return make(persisted);
  if (!SCAN_CHECKS.every(check => states.has(check))) return make("scanning");
  if (!states.has("images")) return make("images");
  return make("text");
}

/**
 * Each check a deploy runs, and where it is: the list on a deployment's page, in the
 * order the release's receipt contract names them. It reads the same receipts as
 * `operationStage` and `receiptFindings` and decides nothing; a failure's reason and
 * fix are the findings' to say, so a row carries only its name and state.
 *
 * "running" is the stage's own claim about which checks it is on, so the file checks
 * are running together while the stage is scanning, and the image review while it is
 * on images. Skipped is a check that had not answered when the deploy ended.
 *
 * An answer short of passed is named the way its finding is labelled (`findingLabel`),
 * so a row cannot contradict the finding above it. An inconclusive archive or image
 * blocks the deploy and is "failed" here, as its finding is a Blocker. Any other
 * inconclusive answer, and a shadow receipt, goes to a person: "advisory". Our outage is
 * "held" while the deploy is still going and "stopped" once it has ended, since nobody is
 * retrying a check on a finished deploy.
 */
export type CheckProgressState = "pending" | "running" | "passed" | "failed" | "held" | "stopped" | "advisory" | "skipped";
export interface CheckProgress { check: string; label: string; state: CheckProgressState }
export function checkProgress(wanted: readonly { check: string }[], receipts: readonly FindingReceipt[], stage: OperationStage["code"]): CheckProgress[] {
  const ended = stage === "ready" || stage === "failed" || stage === "expired";
  const running = (check: string) => stage === "scanning" ? SCAN_CHECKS.includes(check)
    : stage === "images" ? check === "images" : stage === "text" ? check === "text-policy" : false;
  return wanted.map(({ check }) => {
    const label = copy(check).label;
    const named = label.charAt(0).toUpperCase() + label.slice(1);
    const receipt = receipts.find(item => item.check === check);
    const state: CheckProgressState = !receipt ? ended ? "skipped" : running(check) ? "running" : "pending"
      : receipt.state === "passed" ? "passed"
      : shadowed(check, receipt.evidence) ? "advisory"
      : receipt.state === "failed" ? "failed"
      : receipt.state === "inconclusive" ? INCONCLUSIVE_BLOCKS.includes(check) ? "failed" : "advisory"
      : ended ? "stopped" : "held";
    return { check, label: named, state };
  });
}

/** What a finding asks of the person, in the words every surface uses: the CLI,
 * the upload page, the private page and the console. An inconclusive result
 * the game has to answer is a blocker: an archive warning that fails the deploy,
 * or an image the safety check held, which the pipeline marks
 * `retry: "after-fix"` because no clearance exists for it to wait for. One a
 * person will settle later (`retry: "never"`) is not. */
export type FindingLabel = "Blocker" | "Check with a person" | "Waiting on us" | "Stopped on our side" | "Worth a look";
/** `ended`: the deploy the finding belongs to has finished. Our fault on a finished deploy
 * is not something to wait on, because nobody is retrying it: the creator deploys again
 * later. It was labelled "Waiting on us" under a strip saying the deploy had stopped, so
 * it takes the strip's own words (RELEASE_STATUS.stopped). */
export function findingLabel(finding: Pick<RepairFinding, "fault" | "state" | "retry"> & { check?: string }, options: { ended?: boolean } = {}): FindingLabel {
  if (finding.fault === "platform") return options.ended ? "Stopped on our side" : "Waiting on us";
  // A playtest that could not decide sends the release to a person (`recommend` in
  // review.ts pushes an "inconclusive" reason and nothing else), so it blocks nothing.
  // The bot's "no control changed the screen" carries retry "after-fix" because its fix
  // is the creator's to try, and that alone made the console print "Blocker" in red over
  // a release that went on to a person and was published.
  if (finding.state === "inconclusive" && finding.check !== undefined && (REVIEW_CHECKS.playtest as readonly string[]).includes(finding.check)) return AUTONOMOUS ? "Worth a look" : "Check with a person";
  // A local warning the deploy carried past: inconclusive, the game's to judge,
  // and nothing to wait for. It was labelled "Blocker" over a fix that said
  // "ignore this", on a deploy that went on to be ready.
  if (finding.state === "inconclusive" && finding.fault === "game" && finding.retry === "now") return "Worth a look";
  // Autonomous, nobody is coming to check it: the automatic review reads it at submission.
  if (finding.retry === "never" || (finding.state === "inconclusive" && finding.fault !== "game" && finding.retry !== "after-fix")) return AUTONOMOUS ? "Worth a look" : "Check with a person";
  return "Blocker";
}

/**
 * How a finished deploy ended, decided once for every surface: the CLI's exit
 * code, retry and next command, the API's `next`, the stage label, the upload
 * page and the private strip all read this. They used to decide it three ways,
 * each from the receipts' states, and an outage (receipts left "provider
 * unavailable", none "failed") read as "fix your game" on all three.
 *
 * The error code the database wrote is the stronger evidence, because it is
 * written by the function that decided. A finding the game must answer outranks
 * it, since that is something concrete to change. With neither, it is ours:
 * nothing has shown the game to be wrong.
 */
export type OutcomeFault = "game" | "platform" | "input" | "unknown";
export interface OperationOutcome {
  code: string; fault: OutcomeFault; exit: ErrorRow["exit"]; retry: ErrorRow["retry"];
  next: string | null; message: string; label: string;
  /** Additive. The RELEASE_STATUS entry `label` is taken from, for its dithered icon. */
  status: OutcomeStatus;
}
export type OutcomeStatus = "blocked" | "stopped" | "needs_choice" | "interrupted" | "expired";
const GAME_ROW: ErrorRow = { exit: 1, retry: "after-fix" };
const OURS_ROW: ErrorRow = { exit: 5, retry: "later" };
const NOT_YOURS = "Your game does not need to change.";
// Codes whose way forward is a specific command rather than a plain redeploy.
const NEXT_FOR: Record<string, string> = {
  metadata_conversion_required: "opengame deploy --metadata=local",
  invalid_metadata_revision: "opengame pull",
  cover_source_unavailable: "opengame deploy --metadata=local",
  // A cover the game already had, carried by the deploy and now unreadable (20261105220000).
  cover_unavailable: "opengame deploy --metadata=local",
};
const FAILED_STAGE: Record<OutcomeFault, Pick<OperationStage, "message" | "waitingOn">> = {
  game: { message: RELEASE_STATUS.blocked.message, waitingOn: "you" },
  platform: { message: RELEASE_STATUS.stopped.message, waitingOn: "you" },
  input: { message: RELEASE_STATUS.needs_choice.message, waitingOn: "you" },
  unknown: { message: RELEASE_STATUS.interrupted.message, waitingOn: "you" },
};

export function operationOutcome(operation: { state: string; error: string | null }, findings: readonly RepairFinding[]): OperationOutcome | null {
  if (operation.state !== "failed" && operation.state !== "expired") return null;
  const code = operation.error ?? (operation.state === "failed" ? "deploy_failed" : "deploy_expired");
  const outcome = (fault: OutcomeFault, row: ErrorRow, next: string | null, message: string, status: OutcomeStatus): OperationOutcome =>
    ({ code, fault, exit: row.exit, retry: row.retry, next, message, label: RELEASE_STATUS[status].label, status });
  // An expired deploy never reached a verdict. Starting again is the whole fix.
  if (operation.state === "expired") return outcome("unknown", { exit: 5, retry: "now" }, "opengame deploy", operationErrorText(code), "expired");
  const row = operation.error !== null && Object.hasOwn(ERRORS, operation.error) ? ERRORS[operation.error]! : null;
  const blockers = findings.filter(finding => findingLabel(finding) === "Blocker");
  const fix = NEXT_FOR[code] ?? (blockers.some(finding => finding.verify.startsWith("opengame check")) ? "opengame check" : "opengame deploy");
  if (blockers.length) {
    return outcome("game", GAME_ROW, fix, row?.exit === 1 ? operationErrorText(code)
      : `The deploy stopped with ${code.replace(/[^a-z0-9_]/gi, "").slice(0, 64)}. The findings name what to change; fix them, then run ${fix}.`, "blocked");
  }
  const onlyOurs = findings.length > 0 && findings.every(finding => finding.fault === "platform");
  if (row?.exit === 5 || ((row === null || row.exit === 1) && onlyOurs)) {
    const text = operationErrorText(code);
    return outcome("platform", OURS_ROW, "opengame deploy", text.includes("does not need to change") ? text : `${text} ${NOT_YOURS}`, "stopped");
  }
  if (row?.exit === 2) return outcome("input", row, NEXT_FOR[code] ?? "opengame deploy", operationErrorText(code), "needs_choice");
  if (row?.exit === 1) return outcome("game", GAME_ROW, fix, operationErrorText(code), "blocked");
  return outcome("unknown", row ?? OURS_ROW, "opengame deploy", operationErrorText(code), "interrupted");
}

/** The one command that moves an operation forward, for the API's `next`, the
 * upload page and the CLI. Null when there is nothing to run. */
export function operationNext(operation: { state: string; error: string | null }, findings: readonly RepairFinding[]): string | null {
  if (operation.state === "uploading") return "opengame deploy";
  if (operation.state === "queued" || operation.state === "checking") return "opengame status --watch";
  return operationOutcome(operation, findings)?.next ?? null;
}

/** Findings grouped by the file they name, files first, in the order received. */
export function groupFindings<T extends Pick<RepairFinding, "evidence">>(findings: readonly T[]): { file: string | null; findings: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const finding of findings) {
    const file = finding.evidence.file?.replace(/:\d+$/, "") ?? "";
    groups.set(file, [...groups.get(file) ?? [], finding]);
  }
  return [...groups].sort(([a], [b]) => Number(a === "") - Number(b === "")).map(([file, items]) => ({ file: file || null, findings: items }));
}

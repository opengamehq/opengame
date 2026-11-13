import { LIMITS } from "@opengame/shared/browser";
import type { CheckProgress } from "./findings";
import { heldMessage } from "./status";
import { isRetiredCheck } from "./review";
import type { Submission } from "./submission";

export type DeployStepId = "upload" | "checks" | "review" | "details" | "publish" | "live";
export type DeployStepState = "waiting" | "running" | "done" | "held" | "failed";
export interface UploadReceipt {
  doneBytes: number; totalBytes: number; doneFiles: number | null; totalFiles: number | null;
  /** Reused content counts as received, but never as transfer speed. */
  reusedBytes?: number;
  sampledAt: string;
  unit?: "files" | "unique files";
}
export interface StageTiming { lowSeconds: number; highSeconds: number; samples: number }
export type StageTimings = Partial<Record<"checks" | "review" | "publish", StageTiming>>;
export interface DeploymentProgressInput {
  state: "uploading" | "queued" | "checking" | "ready" | "failed" | "expired";
  stage?: string; observedAt?: string; lapsed?: boolean; removed?: boolean;
  checks?: readonly CheckProgress[];
  submission?: Pick<Submission, "state" | "submittedAt" | "outcome" | "hold" | "live"> | null;
  upload?: UploadReceipt | null;
  timings?: StageTimings;
  /** Server timestamps for whole stages, not the last check's updated_at. */
  started?: Partial<Record<DeployStepId, string>>;
  elapsed?: Partial<Record<DeployStepId, number>>;
  problem?: string | null;
  unsubmitted?: { sentence: string; settled: boolean } | null;
  cannotConfirm?: string | null;
  reviewReadFailed?: boolean;
  reviewAhead?: number;
}
export interface DeployStep {
  id: DeployStepId; label: string; state: DeployStepState; detail: string;
  since?: string; timing?: StageTiming; elapsedSeconds?: number;
}
/* What the review step says while it decides (20261113300000). A game is not published until the
   automatic code review has a verdict, and the pipeline keeps asking until it does, so this is
   the honest state: it is being checked, by us, automatically, and usually quickly. Never "in
   review" or anything that reads as a person deciding (13 Nov 2026). The two states it
   replaced said "review is still deciding" and "The playtest is waiting on us", the second of
   them wrong since the playtest stopped deciding anything on 12 Nov 2026. */
const CHECKING = "Checking your game. This usually takes under a minute. We’ll update this page; you don’t need to send it again.";

const LABELS: Record<DeployStepId, string> = { upload: "Upload", checks: "Checks", review: "Review", details: "Details", publish: "Publish", live: "Live" };

/** The terminal and the deployment page follow these same facts. A private preview is
 * ready before publication, so it must never complete the Live row on its own. */
export function deploymentSteps(input: DeploymentProgressInput): DeployStep[] {
  const { state, submission, checks = [] } = input;
  const steps = new Map<DeployStepId, DeployStep>();
  const put = (id: DeployStepId, status: DeployStepState, detail: string) => steps.set(id, {
    id, label: LABELS[id], state: status, detail,
    ...(Number.isFinite(input.elapsed?.[id]) && input.elapsed![id]! >= 0 ? { elapsedSeconds: input.elapsed![id] } : {}),
    ...(input.started?.[id] ? { since: input.started[id] } : {}),
    ...(input.timings?.[id as keyof StageTimings] ? { timing: input.timings[id as keyof StageTimings] } : {}),
  });
  const upload = state === "uploading" ? "running" : state === "expired" && !checks.some(check => !["pending", "skipped"].includes(check.state)) ? "failed" : "done";
  put("upload", upload, upload === "done" ? "All files received." : "Your files, sent securely.");
  put("checks", "waiting", "File types, engine and packaging.");
  put("review", "waiting", "An automatic quality review, with a playtest alongside.");
  /* Details is always a step, so the count holds still: it was drawn only while owed, and
     confirming it took "3 of 6" to "3 of 5" (launch E2E judges, J-opus-13). */
  const owesDetails = submission?.state === "awaiting_details" || submission?.state === "needs_certification";
  const confirmed = ["approved", "publishing", "published"].includes(submission?.state ?? "");
  put("details", owesDetails ? "held" : confirmed ? "done" : "waiting", owesDetails ? "Confirm your game’s details below to continue."
    : confirmed ? "Your details are confirmed." : "Your game’s details and statements, confirmed by you.");
  put("publish", "waiting", "Make this version available to players.");
  put("live", "waiting", "Your game, ready to play and share.");
  // Only the file checks reach this list since 12 Nov 2026; a retired check's row on an
  // older release is left out rather than shown as a step nobody runs.
  const safety = checks.filter(check => !isRetiredCheck(check.check));
  const safetyDone = safety.length > 0 && safety.every(check => ["passed", "advisory"].includes(check.state));
  if (state === "queued") put("checks", "waiting", "Your upload arrived. Waiting for a check slot.");
  if (state === "checking") {
    put("checks", safetyDone ? "done" : "running", safetyDone ? "File checks passed." : "Checking file types, engine and packaging.");
    if (input.stage === "waiting" || checks.some(check => check.state === "held")) {
      const id = safetyDone ? "review" : "checks";
      const check = checks.find(check => check.state === "held");
      put(id, "held", `${check ? `The ${check.label.toLowerCase()} check` : "A check"} is unavailable. Your upload is saved. We’ll retry it; you don’t need to send it again.`);
    }
  }
  if (state === "ready") {
    put("checks", "done", "File checks passed.");
    put("review", "running", CHECKING);
    if (input.reviewReadFailed) put("review", "held", "Review status could not be read. Your build is saved. We’ll try again.");
    if (input.unsubmitted) put("review", input.unsubmitted.settled ? "held" : "waiting", input.unsubmitted.sentence);
  }
  if (submission) {
    if (["awaiting_details", "needs_certification", "approved", "publishing", "published"].includes(submission.state))
      put("review", "done", "Your game passed review.");
    if (["waiting", "review"].includes(submission.state))
      put("review", submission.hold ? "held" : "running", submission.hold
        ? heldMessage(submission.hold) + (submission.hold.reason === "placement" ? " We’ll retry it; you don’t need to upload again." : "")
        : CHECKING);
    if (submission.state === "needs_certification") put("review", "waiting", "Review starts after you confirm the required details.");
    if (["returned", "blocked", "withdrawn", "superseded"].includes(submission.state)) put("details", "waiting", "Nothing to confirm for this build.");
    if (["returned", "blocked", "withdrawn", "superseded"].includes(submission.state))
      put("review", "failed", (submission.outcome?.reason ? `${submission.outcome.reason} Read the findings below for what to change or how to appeal.` : null) ?? (submission.state === "superseded" ? "A newer deployment replaced this one. Open your game’s deployments."
        : submission.state === "withdrawn" ? "This submission was withdrawn. Deploy again when you’re ready." : "This build needs a change before it can go live. Read the findings below, then deploy an updated build."));
    if (["approved", "publishing"].includes(submission.state)) put("publish", "running", "Publishing this version. Your game’s address stays the same.");
    if (submission.state === "published") {
      put("publish", "done", "This version is published.");
      put("live", "done", "Your game is live. Play it or share it with someone.");
    }
  }
  if (["failed", "expired"].includes(state) || input.lapsed) {
    put("details", "waiting", "Nothing to confirm for this build.");
    const uploadFailed = state === "uploading" || (state === "expired" && !checks.some(check => !["pending", "skipped"].includes(check.state)));
    put(uploadFailed ? "upload" : "checks", "failed", input.problem ?? (uploadFailed
      ? "The upload stopped before it finished. Resume from the CLI, or drop your build again."
      : "A check stopped this deployment. Read the findings below, then deploy again."));
  }
  if (submission?.state === "playtesting" && (input.reviewAhead ?? 0) > 0) put("review", "waiting", "Your playtest is queued. It starts as soon as a slot is free.");
  if (owesDetails && input.cannotConfirm) {
    put("details", "failed", input.cannotConfirm);
    if (submission?.state === "needs_certification") put("review", "held", "Review did not start because this release cannot be certified.");
    put("publish", "held", "This release cannot be published from here.");
    put("live", "held", "This release is still private.");
  }
  if (input.removed) {
    for (const step of steps.values()) if (step.state !== "done") {
      step.state = "held"; step.detail = "This deployment stopped after the game was removed.";
    }
    put("live", "held", "Nobody can play this game now. Open your game’s settings for details.");
  }
  return [...steps.values()];
}

/** Estimates stay broad. The upper measured range is a stop point, not a promise that
 * a queued job, a retry or a human review will finish on a countdown.
 *
 * A stage measured in seconds says so. Every answer used to round up to whole minutes, so
 * a publish that takes 3 to 9 s (13 Nov 2026, the last 22 publications) read "Usually a
 * minute", and while this morning's hung publications were still in the window it read
 * "Usually 30 to 64 min" over a step that finishes in ten seconds (J-sol-G4). Those runs
 * have left the window since; the words now follow measured seconds when that is what the
 * window holds. A burst of slow runs will still show as slow, which is what it measures. */
export function stageEta(step: DeployStep, now: number): string | null {
  if (!["running", "waiting"].includes(step.state) || !step.timing) return null;
  const { lowSeconds, highSeconds, samples } = step.timing;
  if (samples < LIMITS.platform.deployProgress.minimumSamples || !Number.isFinite(lowSeconds) || !Number.isFinite(highSeconds) || lowSeconds <= 0 || highSeconds < lowSeconds) return null;
  if (step.state === "running" && !step.since) return null;
  const elapsed = step.state === "running" && step.since ? Math.max(0, (now - Date.parse(step.since)) / 1000) : 0;
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed >= highSeconds) return "Taking longer than usual";
  const left = highSeconds - elapsed;
  if (left <= 15) return "A few seconds";
  if (left < 60) return "Under a minute";
  const low = Math.max(1, Math.ceil((lowSeconds - elapsed) / 60));
  const high = Math.max(low, Math.ceil((highSeconds - elapsed) / 60));
  return high === 1 ? "About a minute" : low === high ? `About ${high} min` : `About ${low} to ${high} min`;
}

export interface TransferEstimate { bytesPerSecond: number; remaining: string }

/** Average a window of actual arrivals. Time alone never decreases the remaining
 * estimate; a new receipt must carry new bytes. Reuse is not network movement. */
export function transferEstimate(samples: readonly UploadReceipt[], now: number): TransferEstimate | null {
  const policy = LIMITS.platform.deployProgress;
  const last = samples.at(-1);
  if (!last || !Number.isFinite(now) || !Number.isFinite(last.totalBytes) || !Number.isFinite(last.doneBytes) || last.totalBytes <= 0 || last.doneBytes >= last.totalBytes) return null;
  const end = Date.parse(last.sampledAt);
  if (!Number.isFinite(end) || now < end || now - end > policy.rateStaleMs) return null;
  const window = samples.filter(sample => Date.parse(sample.sampledAt) >= end - policy.rateWindowSeconds * 1000);
  if (window.length < policy.rateSamplesMin) return null;
  const first = window[0]!;
  const seconds = (end - Date.parse(first.sampledAt)) / 1000;
  if (seconds < policy.rateMinimumSeconds) return null;
  for (let i = 0; i < window.length; i++) {
    const sample = window[i]!;
    const physical = sample.doneBytes - (sample.reusedBytes ?? 0);
    const previous = window[i - 1];
    if (!Number.isFinite(physical) || physical < 0 || sample.totalBytes !== last.totalBytes
      || (previous && (Date.parse(sample.sampledAt) <= Date.parse(previous.sampledAt)
        || physical < previous.doneBytes - (previous.reusedBytes ?? 0)))) return null;
  }
  const bytes = last.doneBytes - (last.reusedBytes ?? 0) - first.doneBytes + (first.reusedBytes ?? 0);
  const bytesPerSecond = bytes / seconds;
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  const minutes = Math.ceil((last.totalBytes - last.doneBytes) / bytesPerSecond / 60);
  return { bytesPerSecond, remaining: minutes <= 1 ? "less than a minute left" : `about ${minutes} min left` };
}

export function uploadPercent(upload: UploadReceipt): number {
  return upload.totalBytes > 0 ? Math.floor(Math.max(0, Math.min(1, upload.doneBytes / upload.totalBytes)) * 100) : upload.totalFiles !== null && upload.totalFiles > 0 && upload.doneFiles === upload.totalFiles ? 100 : 0;
}

export interface StageSample { stage: "checks" | "review" | "publish"; seconds: number; byteSize: number; fileCount: number }
/** A fixed setup share keeps a tiny game from receiving a near-zero estimate. Model
 * weights live in limits.json; durations come only from completed server stages. */
export function stageTimingsFromSamples(samples: readonly StageSample[], target: { byteSize: number; fileCount: number }): StageTimings {
  const policy = LIMITS.platform.deployProgress;
  if (!Number.isFinite(target.byteSize) || target.byteSize <= 0 || !Number.isFinite(target.fileCount) || target.fileCount <= 0) return {};
  const work = (size: { byteSize: number; fileCount: number }) => policy.setupWeight
    + policy.byteWeight * Math.max(0, size.byteSize) / policy.referenceBytes
    + policy.fileWeight * Math.max(0, size.fileCount) / policy.referenceFiles;
  const result: StageTimings = {};
  for (const stage of ["checks", "review", "publish"] as const) {
    const values = samples.filter(sample => sample.stage === stage && Number.isFinite(sample.seconds) && sample.seconds > 0 && Number.isFinite(sample.byteSize) && sample.byteSize > 0 && Number.isFinite(sample.fileCount) && sample.fileCount > 0)
      .map(sample => sample.seconds * Math.min(policy.scaleMax, Math.max(policy.scaleMin, work(target) / work(sample))))
      .sort((a, b) => a - b);
    if (values.length < policy.minimumSamples) continue;
    result[stage] = { lowSeconds: values[Math.floor((values.length - 1) * .5)]!, highSeconds: values[Math.ceil((values.length - 1) * .9)]!, samples: values.length };
  }
  return result;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentSteps, stageEta, stageTimingsFromSamples, transferEstimate, uploadPercent, type DeploymentProgressInput, type UploadReceipt } from "../src/deployment-progress";

const now = Date.parse("2026-11-12T06:00:00Z");
const base: DeploymentProgressInput = { state: "uploading" };
const states = (input: DeploymentProgressInput) => Object.fromEntries(deploymentSteps(input).map(step => [step.id, step.state]));
const submission = (state: NonNullable<DeploymentProgressInput["submission"]>["state"]) => ({ state, submittedAt: new Date(now).toISOString(), outcome: null, hold: null, live: null });

test("upload, checks and private preview never claim a live game", () => {
  assert.deepEqual(states(base), { upload: "running", checks: "waiting", review: "waiting", details: "waiting", publish: "waiting", live: "waiting" });
  assert.equal(states({ state: "checking" }).checks, "running");
  assert.equal(states({ state: "ready" }).live, "waiting");
  assert.equal(states({ state: "ready" }).review, "running");
});
test("the file checks are the archive and the preflight, and a retired row is not a step", () => {
  const running: DeploymentProgressInput = { state: "checking", checks: [{ check: "archive", label: "Archive check", state: "passed" }, { check: "preflight", label: "Bundle check", state: "running" }] };
  assert.equal(states(running).checks, "running"); assert.equal(states(running).review, "waiting");
  // An older release's malware or image row, still running when the scanners were retired,
  // neither holds the file checks open nor starts the review.
  const old: DeploymentProgressInput = { state: "checking", checks: [{ check: "archive", label: "Archive check", state: "passed" },
    { check: "malware", label: "Malware scan", state: "running" }, { check: "images", label: "Images", state: "running" }] };
  assert.equal(states(old).checks, "done"); assert.equal(states(old).review, "waiting");
  const words = JSON.stringify(deploymentSteps({ state: "checking", checks: [] }));
  assert.doesNotMatch(words, /malware|secret|image/i);
});
/* Launch E2E judges, 13 Nov 2026 (J-opus-13): Details was drawn only while owed, so
   confirming it took the count from "3 of 6" to "3 of 5". It is always a step now. */
test("details is always a step, so the count never changes under the creator", () => {
  assert.equal(states({ state: "checking" }).details, "waiting");
  assert.equal(states({ state: "ready", submission: submission("awaiting_details") }).details, "held");
  assert.equal(states({ state: "ready", submission: submission("publishing") }).details, "done");
  assert.equal(states({ state: "ready", submission: submission("published") }).details, "done");
  for (const state of ["playtesting", "awaiting_details", "publishing", "published"] as const)
    assert.equal(deploymentSteps({ state: "ready", submission: submission(state) }).length, 6, state);
  assert.equal(states({ state: "ready", submission: submission("published") }).live, "done");
});
test("a held, refused, expired or removed build has a static recovery state", () => {
  // Publication never waits for a person (12 Nov 2026), so the timeline never says one is needed
  // (launch E2E, B-3). Since 20261113300000 it waits for the automatic review's verdict, and an
  // undecided build says it is being checked, never "in review" (13 Nov 2026).
  for (const state of ["waiting", "review"] as const) {
    assert.equal(states({ state: "ready", submission: submission(state) }).review, "running", state);
    const detail = deploymentSteps({ state: "ready", submission: submission(state) }).find(s => s.id === "review")!.detail;
    assert.match(detail, /^Checking your game\. This usually takes under a minute\./, state);
    assert.doesNotMatch(detail, /person|reviewer|in review|playtest/i, state);
  }
  assert.match(deploymentSteps({ state: "ready" }).find(s => s.id === "review")!.detail, /^Checking your game/);
  assert.equal(states({ state: "ready", submission: submission("returned") }).review, "failed");
  assert.equal(states({ state: "expired" }).upload, "failed");
  assert.equal(states({ state: "uploading", lapsed: true }).upload, "failed");
  assert.equal(states({ state: "ready", removed: true, submission: submission("published") }).live, "held");
});
test("sparse measurements show no ETA; estimates use broad minutes and stop at overrun", () => {
  const step = deploymentSteps({ state: "checking", started: { checks: new Date(now - 30_000).toISOString() }, timings: { checks: { lowSeconds: 90, highSeconds: 180, samples: 3 } } }).find(s => s.id === "checks")!;
  // Words, not an en dash: "About 39–45 min" was read aloud and judged as a symbol (launch E2E, J-opus-E7).
  assert.equal(stageEta(step, now), "About 1 to 3 min");
  assert.equal(stageEta(step, now + 150_000), "Taking longer than usual");
  assert.equal(stageEta({ ...step, timing: { ...step.timing!, samples: 1 } }, now), null);
  assert.equal(stageEta({ ...step, state: "held" }, now), null);
});
test("a stage measured in seconds is described in seconds, not rounded up to a minute", () => {
  // Publishing takes 3 to 9 s; it read "Usually a minute", and "30 to 64 min" while hung runs were in the window (J-sol-G4).
  const publish = (lowSeconds: number, highSeconds: number) => deploymentSteps({ state: "checking", timings: { publish: { lowSeconds, highSeconds, samples: 22 } } }).find(s => s.id === "publish")!;
  assert.equal(publish(5, 9).state, "waiting");
  assert.equal(stageEta(publish(5, 9), now), "A few seconds");
  assert.equal(stageEta(publish(20, 45), now), "Under a minute");
  assert.equal(stageEta(publish(50, 70), now), "About 1 to 2 min");
});
test("measurements scale with bytes and files, with bounded setup and no invented durations", () => {
  const samples = [100, 120, 180].map(seconds => ({ stage: "checks" as const, seconds, byteSize: 1024 ** 3, fileCount: 5000 }));
  const same = stageTimingsFromSamples(samples, samples[0]!);
  assert.deepEqual(same.checks, { lowSeconds: 120, highSeconds: 180, samples: 3 });
  assert.ok(stageTimingsFromSamples(samples, { byteSize: 4 * 1024 ** 3, fileCount: 25000 }).checks!.lowSeconds > same.checks!.lowSeconds);
  assert.deepEqual(stageTimingsFromSamples(samples.slice(0, 2), samples[0]!), {});
});
test("transfer feedback needs enough arrivals, averages bursts and never counts down on time alone", () => {
  const sample = (doneBytes: number, seconds: number, reusedBytes = 0): UploadReceipt => ({ doneBytes, totalBytes: 1000, doneFiles: 1, totalFiles: 10, reusedBytes, sampledAt: new Date(now + seconds * 1000).toISOString() });
  const samples = [sample(100, -4), sample(200, -2), sample(300, 0)];
  assert.equal(transferEstimate(samples.slice(1), now), null);
  assert.deepEqual(transferEstimate(samples, now), { bytesPerSecond: 50, remaining: "less than a minute left" });
  assert.deepEqual(transferEstimate(samples, now + 10000), transferEstimate(samples, now));
  assert.equal(transferEstimate(samples, now + 31000), null);
  assert.equal(transferEstimate([sample(100, -4, 100), sample(200, -2, 200), sample(300, 0, 300)], now), null);
  assert.equal(transferEstimate([sample(100, -4), sample(300, -2), sample(200, 0)], now), null);
  assert.equal(transferEstimate([...samples.slice(0, 2), { ...samples[2]!, sampledAt: "not a time" }], now), null);
  assert.equal(transferEstimate([sample(0, -4), sample(200, -2), sample(300, 0)], now)?.bytesPerSecond, 75);
  assert.equal(transferEstimate(samples.map(s => ({ ...s, totalBytes: 10000 })), now)?.remaining, "about 4 min left");
  assert.equal(uploadPercent({ ...samples[2]!, doneBytes: 1200 }), 100);
});
test("elapsed times remain optional and never accept invalid durations", () => {
  const steps = deploymentSteps({ state: "ready", elapsed: { checks: 72, review: -1, publish: NaN } });
  assert.equal(steps.find(s => s.id === "checks")?.elapsedSeconds, 72);
  assert.equal(steps.find(s => s.id === "review")?.elapsedSeconds, undefined);
  assert.equal(steps.find(s => s.id === "publish")?.elapsedSeconds, undefined);
});
test("held review names the actual hold and a failed review keeps its recovery instruction", () => {
  const hold = deploymentSteps({ state: "ready", submission: { ...submission("waiting"), hold: { reason: "placement", passed: false } } });
  assert.match(hold.find(s => s.id === "review")!.detail, /test machine/);
  assert.match(hold.find(s => s.id === "review")!.detail, /retry/);
  const failed = deploymentSteps({ state: "ready", submission: { ...submission("returned"), outcome: { decision: "return", reason: "The start button does not respond.", findings: [], appealable: false } } });
  assert.match(failed.find(s => s.id === "review")!.detail, /start button/);
  assert.match(failed.find(s => s.id === "review")!.detail, /what to change or how to appeal/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentSteps, stageEta, stageTimingsFromSamples, transferEstimate, uploadPercent, type DeploymentProgressInput, type UploadReceipt } from "../src/deployment-progress";

const now = Date.parse("2026-11-12T06:00:00Z");
const base: DeploymentProgressInput = { state: "uploading" };
const states = (input: DeploymentProgressInput) => Object.fromEntries(deploymentSteps(input).map(step => [step.id, step.state]));
const submission = (state: NonNullable<DeploymentProgressInput["submission"]>["state"]) => ({ state, submittedAt: new Date(now).toISOString(), outcome: null, hold: null, live: null });

test("upload, checks and private preview never claim a live game", () => {
  assert.deepEqual(states(base), { upload: "running", checks: "waiting", review: "waiting", publish: "waiting", live: "waiting" });
  assert.equal(states({ state: "checking" }).checks, "running");
  assert.equal(states({ state: "ready" }).live, "waiting");
  assert.equal(states({ state: "ready" }).review, "running");
});
test("overlapped content review does not complete unfinished safety checks", () => {
  const input: DeploymentProgressInput = { state: "checking", checks: [{ check: "malware", label: "Malware", state: "running" }, { check: "images", label: "Images", state: "running" }] };
  assert.equal(states(input).checks, "running"); assert.equal(states(input).review, "running");
});
test("details exists only while the creator owes them", () => {
  assert.equal(states({ state: "ready", submission: submission("awaiting_details") }).details, "held");
  assert.equal(states({ state: "ready", submission: submission("publishing") }).details, undefined);
  assert.equal(states({ state: "ready", submission: submission("published") }).live, "done");
});
test("a held, refused, expired or removed build has a static recovery state", () => {
  assert.equal(states({ state: "ready", submission: submission("review") }).review, "held");
  assert.equal(states({ state: "ready", submission: submission("returned") }).review, "failed");
  assert.equal(states({ state: "expired" }).upload, "failed");
  assert.equal(states({ state: "uploading", lapsed: true }).upload, "failed");
  assert.equal(states({ state: "ready", removed: true, submission: submission("published") }).live, "held");
});
test("sparse measurements show no ETA; estimates use broad minutes and stop at overrun", () => {
  const step = deploymentSteps({ state: "checking", started: { checks: new Date(now - 30_000).toISOString() }, timings: { checks: { lowSeconds: 90, highSeconds: 180, samples: 3 } } }).find(s => s.id === "checks")!;
  assert.equal(stageEta(step, now), "About 1–3 min");
  assert.equal(stageEta(step, now + 150_000), "Taking longer than usual");
  assert.equal(stageEta({ ...step, timing: { ...step.timing!, samples: 1 } }, now), null);
  assert.equal(stageEta({ ...step, state: "held" }, now), null);
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

import { test } from "node:test";
import assert from "node:assert/strict";
import { terminalDeploymentChecklist } from "../src/deployment-progress";
import { deploymentSteps, type DeploymentProgressInput } from "@opengame/protocol";

test("terminal checklist mirrors the deployment page's stages", () => {
  for (const state of ["uploading", "queued", "checking", "ready", "failed", "expired"] as const) {
    const input: DeploymentProgressInput = { state };
    const line = terminalDeploymentChecklist(input);
    for (const step of deploymentSteps(input)) assert.ok(line.includes(step.label));
    assert.equal(line.includes("Live [x]"), false);
  }
});
// Details is always a step since 13 Nov 2026, so the page's count holds still (J-opus-13).
test("the terminal completes Live only after publication and ticks Details once confirmed", () => {
  const submission = { state: "awaiting_details" as const, submittedAt: "2026-11-12T06:00:00Z", outcome: null, live: null, hold: null };
  assert.match(terminalDeploymentChecklist({ state: "ready", submission }), /Details \[! \]/);
  const published = terminalDeploymentChecklist({ state: "ready", submission: { ...submission, state: "published" } });
  assert.match(published, /Live \[x\]/);
  assert.match(published, /Details \[x\]/);
});

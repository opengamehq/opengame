import test from "node:test";
import assert from "node:assert/strict";
import { assessEvidence } from "../skills/opengame-verification/helpers/browser-evidence.mjs";

const criteria = { movementMin: 0.2, frameP95MsMax: 25 };
const good = { before: [0, 0, 0], after: [1, 0, 0], framesMs: Array(100).fill(16), pageErrors: [] };
test("input evidence detects a stuck player even if the camera could still move", () => {
  assert.equal(assessEvidence(good, criteria).ok, true);
  assert.equal(assessEvidence({ ...good, after: [...good.before] }, criteria).ok, false);
});
test("slow frames, missing evidence and browser exceptions fail the measurement", () => {
  assert.equal(assessEvidence({ ...good, framesMs: Array(100).fill(40) }, criteria).ok, false);
  assert.equal(assessEvidence({ ...good, pageErrors: ["Missing level"] }, criteria).ok, false);
  assert.throws(() => assessEvidence({ ...good, framesMs: [] }, criteria));
  assert.throws(() => assessEvidence({ ...good, after: null }, criteria));
});

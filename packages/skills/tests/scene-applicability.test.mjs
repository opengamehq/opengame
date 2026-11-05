import test from "node:test";
import assert from "node:assert/strict";
import { runSceneAudit, formatReport } from "../skills/opengame-scene-audit/helpers/scene-audit.js";

test("a level with no stairs needs an explicit omission reason rather than an empty pass", () => {
  const scene = { parts: [], routes: [], groundY: 0 };
  assert.equal(runSceneAudit(scene, { only: ["stairs"] }).ok, false);
  const result = runSceneAudit(scene, { only: ["stairs"], notApplicable: { stairs: "This level has no stairs or ramps" } });
  assert.equal(result.ok, true);
  assert.equal(result.checks[0].examined, 0);
  assert.match(formatReport(result), /not applicable: This level has no stairs or ramps/);
  assert.equal(runSceneAudit(scene, { only: ["stairs"], notApplicable: { stairs: "  " } }).ok, false);
});

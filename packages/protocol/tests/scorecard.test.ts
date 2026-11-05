import test from "node:test";
import assert from "node:assert/strict";
import { scorecardView } from "../src/scorecard";

test("a stored scorecard reads back in the pipeline's order, without scores or tier", () => {
  const view = scorecardView({
    dimensions: {
      effort: { score: 2, evidence: [{ frame: 3, action: null, observed: "The starter scene is unchanged." }] },
      works: { score: 4, evidence: [{ frame: 1, action: 0, observed: "Space started a run." }] },
      someday: { score: 3, evidence: [{ frame: 2, action: 1, observed: "A dimension this copy does not know." }] },
    },
    tier: 2, confidence: 0.8, blocked: null, summary: "  A small loop. ", gaps: ["No restart."],
  })!;
  assert.deepEqual(view.dimensions.map(d => d.key), ["works", "effort"]);
  assert.equal(view.dimensions[0]!.evidence[0]!.action, 0);
  assert.equal(view.summary, "A small loop.");
  assert.equal(JSON.stringify(view).includes("tier"), false);
  assert.equal(scorecardView(null), null);
  assert.equal(scorecardView({ dimensions: {} }), null);
});

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

test("judge scores never reach the creator's view, even from a scorecard that wrongly carries them", () => {
  // The pipeline keeps them off the scorecard (platform_playtests.judge_scores, review lane
  // decision 7), and the creator's read selects the scorecard column alone. This is the
  // third wall: a row written by something else, with the scores inside the scorecard, is
  // read through the allow-list above and loses them.
  const judge = { overall: { score: 9, reason: "Judges only." }, aaaCloseness: { score: 7, reason: "Judges only." } };
  const view = scorecardView({
    dimensions: {
      works: { score: 4, evidence: [{ frame: 1, action: 0, observed: "Space started a run.", judge }], judge },
    },
    tier: 3, confidence: 0.7, blocked: null, summary: "A small loop.", gaps: ["No restart."],
    judge, judgeScores: { judge, performance: { score: 8 } }, judge_scores: { judge },
  })!;
  const text = JSON.stringify(view);
  assert.equal(view.dimensions.length, 1);
  for (const word of ["judge", "Judges only", "aaaCloseness", "performance", "\"score\""]) {
    assert.equal(text.includes(word), false, `${word} reached the creator's view: ${text}`);
  }
});

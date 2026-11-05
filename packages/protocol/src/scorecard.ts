import { z } from "./zod";

/**
 * The agent playtest's scorecard as a person reads it: seven dimensions, each resting on
 * lines that cite the frame and the action they were seen in. The shape is the one
 * `parse_scorecard` in apps/pipeline/opengame_pipeline/playtest_agent.py refuses to write
 * anything but, so this only has to read it back, and it reads leniently: a scorecard
 * from a later pipeline with a dimension this copy does not know still shows the ones it
 * does, rather than taking the workspace down.
 *
 * The questions are the pipeline's own, shortened to the first sentence, because they are
 * what the agent was asked and so what its evidence answers. The depth tier and the
 * confidence are not part of this view on purpose: the marketplace bar is not calibrated
 * yet, and a creator handed a number nobody has calibrated argues with the number.
 */
export const SCORECARD_DIMENSIONS = [
  { key: "works", label: "It plays", question: "Can a new player start and play without getting stuck?" },
  { key: "coreLoop", label: "Core loop", question: "Is there a goal and something to do repeatedly that has outcomes?" },
  { key: "systems", label: "Systems", question: "How many mechanics change the player's decisions?" },
  { key: "challenge", label: "Challenge", question: "Does it get harder, unlock things, or change over time?" },
  { key: "content", label: "Content", question: "How much distinct content appears in a few minutes?" },
  { key: "feedback", label: "Feedback", question: "Sound, menus, a HUD, hit feedback, restart." },
  { key: "effort", label: "Effort", question: "Custom work, or an unchanged starter?" },
] as const;

const evidence = z.object({ frame: z.number().int().nonnegative(), action: z.number().int().nonnegative().nullable().optional(), observed: z.string().min(1) });
const stored = z.object({
  dimensions: z.record(z.string(), z.object({ evidence: z.array(evidence).max(12) }).loose()),
  summary: z.string().nullable().optional(),
  gaps: z.array(z.string()).max(12).optional(),
  blocked: z.string().nullable().optional(),
}).loose();

export interface ScorecardLine { frame: number; action: number | null; observed: string }
export interface ScorecardView {
  dimensions: { key: string; label: string; question: string; evidence: ScorecardLine[] }[];
  summary: string | null;
  gaps: string[];
  /** What stopped play, when something did: controls, menu or crash. */
  blocked: string | null;
}

export function scorecardView(raw: unknown): ScorecardView | null {
  const parsed = stored.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  const dimensions = SCORECARD_DIMENSIONS.flatMap(d => {
    const row = value.dimensions[d.key];
    return row && row.evidence.length ? [{ key: d.key, label: d.label, question: d.question,
      evidence: row.evidence.map(line => ({ frame: line.frame, action: line.action ?? null, observed: line.observed })) }] : [];
  });
  if (!dimensions.length) return null;
  return { dimensions, summary: value.summary?.trim() || null, gaps: value.gaps ?? [], blocked: value.blocked ?? null };
}

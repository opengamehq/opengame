export interface ScoreMetaPolicy { keys: Readonly<Record<string, string>>; maxStringLength: number; maxBytes: number; digitRunMin: number }
export type ScoreMetaResult = { ok: true; meta: Record<string, string | number> } | { ok: false; reason: string };
export type ScoreClassification = { state: 'ok' | 'clamped' | 'rejected'; stored: number };
export function validateScoreMeta(raw: unknown, policy: ScoreMetaPolicy): ScoreMetaResult;
export function classifyGameScore(value: number, board: { plausible_min: number | null; plausible_max: number | null }, tolerance: number): ScoreClassification;

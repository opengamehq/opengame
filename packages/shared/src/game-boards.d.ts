export type BoardFormat = 'number' | 'integer' | 'duration_ms' | 'duration_s' | 'percent' | 'distance_m';
export type BoardKeep = 'best' | 'runs' | 'career';
export type ScoreAgg = 'sum' | 'count' | 'max' | 'min';
export type ColumnAgg = 'count' | 'sum' | 'max' | 'min' | 'avg' | 'ratio';
export type WhereOp = 'eq' | 'lt' | 'lte' | 'gt' | 'gte';
export interface ColumnWhere { readonly of: string; readonly op: WhereOp; readonly value: number }
export type BoardOrder = 'asc' | 'desc';
export type ScoreState = 'ok' | 'clamped' | 'rejected';
export interface BoardColumn { readonly key: string; readonly label: string; readonly format: BoardFormat; readonly order: BoardOrder; readonly sortable: boolean; readonly min: number | null; readonly max: number | null;
  /** Fixed decimals every value is drawn with (0 to 4), when declared or defaulted. */
  readonly decimals?: number;
  /** Career boards only: how the column aggregates the source board's runs. */
  readonly agg?: ColumnAgg; readonly of?: string | readonly string[] | null; readonly where?: ColumnWhere | null; readonly scale?: number; readonly requires?: { readonly column: string; readonly atLeast: number } | null }
export interface BoardVariantValue { readonly key: string; readonly label: string }
export interface BoardVariant { readonly key: string; readonly label: string; readonly values: readonly BoardVariantValue[] }
export interface BoardShape {
  readonly key: string; readonly label: string | null; readonly order: BoardOrder; readonly min: number | null; readonly max: number | null;
  readonly scoreLabel: string | null; readonly format: BoardFormat; readonly keep: BoardKeep; readonly runsPerPlayer: number;
  readonly columns: readonly BoardColumn[]; readonly variants: readonly BoardVariant[];
  /** Career boards only. */
  readonly from?: string; readonly scoreAgg?: ScoreAgg;
}
export interface BoardShapeCaps {
  boardKeyCharsMax: number; boardLabelCharsMax: number; boardColumnsMax: number; boardColumnKeyCharsMax: number; boardColumnLabelCharsMax: number;
  boardVariantsMax: number; boardVariantValuesMax: number; boardVariantCombosMax: number; boardRunsPerPlayerMax: number;
}
export type RunTags = Record<string, string>;
export type RunStats = Record<string, number>;
export const BOARD_FORMATS: readonly BoardFormat[];
export const BOARD_KEEPS: readonly BoardKeep[];
export const SCORE_AGGS: readonly ScoreAgg[];
export const COLUMN_AGGS: readonly ColumnAgg[];
export const WHERE_OPS: readonly WhereOp[];
export function crossCheckBoards(shapes: readonly BoardShape[]): string | null;
export function publicStats(stats: Readonly<Record<string, number>> | null | undefined): Record<string, number>;
export const SCORE_SORT: 'score';
export function parseBoardShape(raw: unknown, caps: BoardShapeCaps): { ok: true; shape: BoardShape } | { ok: false; reason: string };
export function validateRunTags(raw: unknown, variants: readonly BoardVariant[]): { ok: true; tags: RunTags } | { ok: false; reason: string };
export function validateRunStats(raw: unknown, columns: readonly BoardColumn[], policy: { clampTolerance: number; statsBytesMax: number }):
  { ok: true; stats: RunStats; ignored: string[]; state: ScoreState } | { ok: false; reason: string };
export function classifyValue(value: number, min: number | null, max: number | null, tolerance: number): { state: ScoreState; stored: number };
export function worse(a: ScoreState, b: ScoreState): ScoreState;
export function variantKey(tags: RunTags | null | undefined): string;
export function resolveSort(sort: string | null | undefined, shape: Pick<BoardShape, 'order' | 'columns'>): { key: string; order: BoardOrder } | null;
export function parseFilterParam(value: string | null | undefined): RunTags | null;
export function filterParam(tags: RunTags | null | undefined): string;
export function formatBoardValue(value: number, format?: BoardFormat, decimals?: number): string;

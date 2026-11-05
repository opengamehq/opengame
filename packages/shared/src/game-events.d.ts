export interface GameEventPolicy {
  keys: readonly string[];
  bytesMax: number;
  stringCharsMax: number;
  digitRunMin: number;
  /* `[min, max]`, read as indices 0 and 1. Typed as an array rather than a pair because
     the bounds come from limits.json, and a JSON import widens every tuple to `number[]`:
     typed as a pair, each caller had to cast, and two of those casts did not compile. */
  numericBounds?: Readonly<Record<string, readonly number[]>>;
}
export function sanitizeGameEventProps(props: Record<string, unknown> | undefined, policy: GameEventPolicy): Record<string, string | number | boolean>;

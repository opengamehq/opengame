/** Types for url-host-fold.mjs, which packages/preflight's tests import. */
export declare const OUTPUT: string;
/** Every code point this runtime's URL parser folds into a host's ASCII, `""` where it drops it. */
export declare function computeFold(): Map<number, string>;
/** The table on disk as a map of code point to ASCII, `""` for one the parser drops. */
export declare function readFold(path?: string): Map<number, string>;
export declare const PROBE: string;
export declare function union(sources: [string, Map<number, string>][]): { ignored: [number, number][]; fold: [number, string][] };
export declare function render(table: { ignored: [number, number][]; fold: [number, string][] }): string;

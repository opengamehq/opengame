/**
 * The two tables the upload checkers read a URL through the way the browser assembles it
 * (packages/preflight/src/assembled.ts; the pipeline's Python reads the same files).
 *
 * `HTML_ENTITIES` is the HTML standard's named character references, `amp;` and the legacy
 * `amp` alike, as Python's `html.entities.html5` carries them. The pipeline reads its own copy,
 * and its tests hold this file to it; packages/preflight's hold every entry to what parse5
 * decodes.
 *
 * `HOST_FOLD` is every code point the URL parser turns into a host's ASCII or drops, written
 * by `node packages/shared/scripts/url-host-fold-write.mjs`; url-host-fold.mjs says why it is a
 * table.
 */
import entities from "./html-entities.json";
import fold from "./url-host-fold.json";

export const HTML_ENTITIES: Readonly<Record<string, string>> = entities;

/** Each code point the host parser folds, to the ASCII it becomes, `""` where it drops it. */
export const HOST_FOLD: ReadonlyMap<number, string> = new Map([
  ...(fold.fold as [number, string][]),
  ...(fold.ignored as [number, number][]).flatMap(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, k): [number, string] => [first + k, ""])),
]);

#!/usr/bin/env node
/**
 * Writes `src/url-host-fold.json`: every code point the URL parser turns into a host character the
 * upload scan matches, `a`-`z`, `0`-`9`, `.` and `-`, and every one it drops.
 *
 * WHY THIS EXISTS. Both upload checkers match a blocked host by its ASCII spelling, and the
 * browser does not ask for ASCII. Its URL parser maps a host through UTS 46 before it looks
 * anything up, so `https://js.ｓtripe.com/`, `https://js.𝐬tripe.com/`, `https://js.stripe。com/`
 * and `https://js.str&shy;ipe.com/` (a soft hyphen, which UTS 46 ignores) all load Stripe.
 * Measured with `new URL` on 7 Nov 2026, and the last one is what made this table part of the
 * character-reference fix rather than a separate one: decoding `&shy;` and then matching ASCII
 * would have closed one door and opened the one beside it.
 *
 * The table is the parsers' own answer, one code point at a time, rather than NFKC: the
 * pipeline runs Python 3.12, whose Unicode is older than the browser's, and the two checkers
 * have to fold the same characters to say the same thing about one bundle. Folding one code
 * point at a time is exact for this purpose, because nothing composes into ASCII.
 *
 * It is the union of what Node, Chromium and Firefox fold, because each moves on its own Unicode.
 * The first table came from Node 22 alone, and the review of 7 Nov 2026 found 61 code points
 * both browsers fold that it did not: the Hangul fillers and invisible operators, which a host
 * drops, and the outlined Latin letters of Unicode 16, which become a to z. Two engines folding
 * one code point differently stops the write, since neither answer could then stand for both.
 *
 *   node packages/shared/scripts/url-host-fold-write.mjs   write it, with Playwright's browsers
 *   node packages/shared/scripts/url-host-fold.mjs         exit 1 if this Node folds one it lacks
 *
 * The writer is a script of its own because it needs Playwright, which no package that ships
 * this one installs.
 *
 * packages/preflight/tests/assembled-urls.test.ts runs the check, so a Node whose URL parser
 * moves on fails a test rather than leaving the table behind it. A browser moving on does not
 * fail a test; run this again when Chromium or Firefox takes a new Unicode.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "url-host-fold.json");

/* The probe, as source, so a browser can run the same code Node does. */
export const PROBE = `(() => {
  const out = [];
  for (let cp = 0x80; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    let host;
    try { host = new URL("http://a" + String.fromCodePoint(cp) + "b.com/").hostname; } catch { continue; }
    if (host === "ab.com") { out.push([cp, ""]); continue; }
    const m = /^a([a-z0-9.-]+)b\\.com$/.exec(host);
    if (m) out.push([cp, m[1]]);
  }
  return out;
})()`;

/** Every code point this runtime's URL parser folds into a host's ASCII, `""` where it drops it. */
export const computeFold = () => new Map(eval(PROBE));

/** The table on disk as a map of code point to ASCII, `""` for one the parser drops. */
export function readFold(path = OUTPUT) {
  const table = JSON.parse(readFileSync(path, "utf8"));
  const out = new Map(table.fold);
  for (const [first, last] of table.ignored) for (let cp = first; cp <= last; cp += 1) out.set(cp, "");
  return out;
}

export function union(sources) {
  const all = new Map();
  for (const [name, fold] of sources) {
    for (const [cp, ascii] of fold) {
      if (all.has(cp) && all.get(cp)[0] !== ascii) throw new Error(`U+${cp.toString(16)} folds to "${all.get(cp)[0]}" in ${all.get(cp)[1]} and "${ascii}" in ${name}`);
      if (!all.has(cp)) all.set(cp, [ascii, name]);
    }
  }
  const ignored = [];
  const fold = [];
  for (const cp of [...all.keys()].sort((a, b) => a - b)) {
    const ascii = all.get(cp)[0];
    if (ascii) { fold.push([cp, ascii]); continue; }
    const last = ignored[ignored.length - 1];
    if (last && last[1] === cp - 1) last[1] = cp;
    else ignored.push([cp, cp]);
  }
  return { ignored, fold };
}

export const render = (table) =>
  `{\n  "ignored": ${JSON.stringify(table.ignored)},\n  "fold": [\n${table.fold.map((row) => `    ${JSON.stringify(row)}`).join(",\n")}\n  ]\n}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const table = readFold();
  const missing = [...computeFold()].filter(([cp, ascii]) => table.get(cp) !== ascii);
  if (missing.length) {
    console.error(`${OUTPUT} lacks ${missing.length} code points this Node folds, from U+${missing[0][0].toString(16)}. Run node packages/shared/scripts/url-host-fold-write.mjs.`);
    process.exit(1);
  }
}

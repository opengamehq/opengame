#!/usr/bin/env node
/**
 * Writes `limits.values.json`: `limits.json` with every `_`-prefixed key removed, and nothing
 * else changed.
 *
 * WHY THIS EXISTS. limits.json is two things in one file: the numbers, and the notes
 * arguing for them. On 26 Oct 2026 that was 494 notes, 357 KB of prose against 99 KB of
 * values. A bundler cannot tree-shake the keys of a JSON import, so every browser bundle
 * that reached `LIMITS` carried every note, and the notes say things a stranger should not
 * read: that day one of them told anybody reading player.js that Supabase's captcha was
 * off (#493 hotfixed the wording). The embed player, the isolated play document, the
 * studio island and one Next client chunk of 467 KB each held all 494.
 *
 * It is a projection, not a second source. Nobody edits the output; it is derived by the
 * one rule above, with no list of which keys to keep, so there is nothing in it that can
 * disagree with limits.json except staleness, and staleness is caught in three places: the test in
 * packages/shared, and `--check` in the web and admin prebuild, which is where Vercel
 * would otherwise ship old numbers beside a Python pipeline reading new ones.
 *
 *   node packages/shared/scripts/limits-values.mjs           write it (the web predev does)
 *   node packages/shared/scripts/limits-values.mjs --check   exit 1 if it is stale
 *   node packages/shared/scripts/limits-values.mjs --scan <file or dir>...
 *       exit 1 if any built output contains a note. The web postbuild runs this over
 *       public/ and .next/static, because a note can reach a bundle by a route nobody
 *       thought of (a relative import, an fs read baked in at build time) and the projection
 *       only protects the routes that use it.
 *
 * Python reads limits.json itself and never sees this file.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/* From the string rather than `new URL(..., import.meta.url)`: the studio island's tests
   import this under happy-dom, whose URL is not one node:url accepts. */
const shared = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = join(shared, "limits.json");
export const OUTPUT = join(shared, "limits.values.json");

/* The browser's share of the values: `limits.browser.json`, the same tree kept to the paths
   `limits.browser-paths.json` lists. See projectLimits below and src/limits-browser.ts. */
export const BROWSER_PATHS = join(shared, "limits.browser-paths.json");
export const BROWSER_OUTPUT = join(shared, "limits.browser.json");

const isNote = key => key.startsWith("_");

/** The value with every `_` key removed, at any depth. Arrays keep their order and length. */
export function withoutNotes(value) {
  if (Array.isArray(value)) return value.map(withoutNotes);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !isNote(key)).map(([key, inner]) => [key, withoutNotes(inner)]));
}

/** Pretty-printed so a change to a limit is a readable one-line diff here as well. */
export const render = limits => JSON.stringify(withoutNotes(limits), null, 2) + "\n";

/**
 * The values kept to `paths`, each a dotted path that keeps everything under it, in the
 * values' own key order. A `*` segment stands for every key of the object it is in, so
 * `text.*.max` keeps each text cap's number and none of the constraint names beside it.
 *
 * ONE PROJECTION FOR EVERY AUDIENCE. The CLI's npm bundles (packages/cli/build.mjs), the public
 * mirror (scripts/public-mirror.mjs) and the browser (limits.browser.json, below) each ship a
 * part of limits.json to strangers, and they cut it here, so the rule for what a listed path
 * keeps cannot differ between them. A JSON import cannot be tree-shaken, so a cut made
 * anywhere later is no cut at all: until 5 Nov 2026 every page on opengame.io that reached
 * LIMITS shipped every budget, rate limit, abuse threshold and the review policy.
 *
 * A listed path the values do not have is refused, naming `source`, because code reading it
 * would get undefined in a stranger's browser or terminal and nothing else would say so. A
 * `*` that matches nothing is refused for the same reason.
 */
export function projectLimits(values, paths, source = "the allowlist") {
  const tree = {};
  for (const path of paths) {
    const keys = path.split(".");
    let deepest = 0;
    /* Whether anything at `from` matched the rest of the path. Under a `*` a key may be
       missing from some of the objects it expands to (not every text cap has a `min`), so a
       miss there is not an error unless nothing anywhere matched. */
    const walk = (node, from, index) => {
      deepest = Math.max(deepest, index);
      if (!from || typeof from !== "object" || Array.isArray(from)) return false;
      const key = keys[index];
      const names = key === "*" ? Object.keys(from).filter(name => !isNote(name)) : Object.hasOwn(from, key) ? [key] : [];
      let any = false;
      for (const name of names) {
        if (node[name] === true) { any = true; continue; } // a shorter listed path keeps all of this
        if (index === keys.length - 1) { node[name] = true; any = true; continue; }
        const child = node[name] ?? {};
        if (walk(child, from[name], index + 1)) { node[name] = child; any = true; }
      }
      return any;
    };
    if (!walk(tree, values, 0))
      throw new Error(`${source} names ${path}, and limits.json has no ${keys.slice(0, deepest + 1).join(".")}.`);
  }
  const keep = (value, wanted) => wanted === true ? value
    : Object.fromEntries(Object.entries(value).filter(([key]) => Object.hasOwn(wanted, key)).map(([key, inner]) => [key, keep(inner, wanted[key])]));
  return keep(values, tree);
}

/**
 * The files that hold every value: limits.json, its values, limits.ts and the package root that
 * re-exports it. A browser bundle reaching any of them ships every budget, rate limit and
 * abuse threshold. The site's Next build refuses them in browser code with a Turbopack rule
 * in its Next config; the three bundles built outside Next (the embed player, the
 * isolated play client and the Studio island) use the plugins below, which the review of this
 * change asked for because nothing else stopped them at build time.
 */
export const WHOLE_LIMITS = ["limits.json", "limits.values.json", "src/limits.ts", "src/index.ts"].map(name => join(shared, name));
const refusal = file => `${relative(process.cwd(), file)} holds every value in limits.json and was pulled into a browser bundle. ` +
  "Import @opengame/shared/browser or @opengame/shared/limits.browser.json; a limit the browser needs goes in packages/shared/limits.browser-paths.json.";
/* Through realpath, because a workspace package can arrive through its node_modules link. */
const whole = file => { try { return WHOLE_LIMITS.includes(realpathSync(file)); } catch { return WHOLE_LIMITS.includes(file); } };

/** An esbuild plugin that fails the build when a module in WHOLE_LIMITS is loaded. */
export const refuseWholeLimitsEsbuild = {
  name: "refuse-whole-limits",
  setup(build) {
    build.onLoad({ filter: /[\\/]packages[\\/]shared[\\/](?:limits(?:\.values)?\.json|src[\\/](?:limits|index)\.ts)$/ },
      args => whole(args.path) ? { errors: [{ text: refusal(args.path) }] } : undefined);
  },
};

/** The same refusal as a Vite (Rollup) plugin. `pre`, because Vite's own asset plugin answers
 *  `?raw` and `?url` in its `load` hook first, and without it either suffix took the whole file
 *  into the island (independent review of #936). */
export const refuseWholeLimitsVite = {
  name: "refuse-whole-limits",
  enforce: "pre",
  load(id) { const file = id.split("?")[0]; if (whole(file)) this.error(refusal(file)); return null; },
};

/** The browser allowlist's paths, refusing a file that is not a nonempty list of them. */
export function browserPaths(file = BROWSER_PATHS) {
  const list = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(list.paths) || !list.paths.length || !list.paths.every(path => typeof path === "string" && path && !path.startsWith("_")))
    throw new Error(`${relative(process.cwd(), file)} must carry a nonempty \`paths\` list of dotted limit paths.`);
  return list.paths;
}

/** limits.browser.json as the script writes it, from limits.json and the allowlist. */
export const renderBrowser = (limits, paths = browserPaths()) =>
  JSON.stringify(projectLimits(withoutNotes(limits), paths, "packages/shared/limits.browser-paths.json"), null, 2) + "\n";

/** Every note in the file, as [path, text]. A note that is a list or an object of strings
 *  (none is today) gives one entry per string, so the scan cannot be blinded by its shape. */
export function limitsNotes(limits = JSON.parse(readFileSync(SOURCE, "utf8"))) {
  const notes = [];
  const strings = (value, path) => {
    if (typeof value === "string") notes.push([path, value]);
    else if (Array.isArray(value)) value.forEach((inner, index) => strings(inner, `${path}[${index}]`));
    else if (value !== null && typeof value === "object") for (const [key, inner] of Object.entries(value)) strings(inner, `${path}.${key}`);
  };
  (function walk(value, path) {
    if (Array.isArray(value)) return value.forEach((inner, index) => walk(inner, `${path}[${index}]`));
    if (value === null || typeof value !== "object") return;
    for (const [key, inner] of Object.entries(value)) (isNote(key) ? strings : walk)(inner, `${path}.${key}`);
  })(limits, "");
  return notes;
}

/* A minifier re-quotes strings and escapes what it likes, so the whole note is the wrong
   thing to look for. Runs of printable ASCII with no quote or backslash come through every
   bundler here unchanged; esbuild writes anything outside ASCII as \uXXXX.

   Each such run is cut into 40-character tiles, end to end, plus one ending where the run
   ends, so a copy can be found wherever in the note it starts. A tile alone is not
   evidence: measured on 26 Oct 2026, single 40-character windows matched two game titles a
   note quotes, a source path a note names, and two code comments in the island's source map
   written in the same words as a note, and each would have failed a production build. So
   only runs of 80 characters or more are tiled, since a shorter one is usually a name in
   quotes (one note quotes "The Legend of Zelda: Tears of the Kingdom", and the art
   references ship that title), and a hit counts only when the 80 characters of the run
   around the tile are there too. Any copy of about 120 consecutive characters from such a
   run is found. Until R19 the scan looked for one run near the start, and a bundle holding only
   the second half of every note passed. Measured the same day: every note has such a run,
   and nothing in the values, any built output or any app source here counts as a hit; the
   test beside this fails for a note without one. */
export const TILE = 40, SPAN = 2 * TILE;
export const CLEAN_RUN = /[ !#-&(-[\]-_a-~]{80,}/g;
const tileIndex = new WeakMap();
function tilesOf(notes) {
  let index = tileIndex.get(notes);
  if (index) return index;
  index = new Map();
  const add = (tile, entry) => { const list = index.get(tile); if (list) list.push(entry); else index.set(tile, [entry]); };
  for (const [path, note] of notes) for (const [run] of note.matchAll(CLEAN_RUN)) {
    for (let at = 0; at + TILE <= run.length; at += TILE) add(run.slice(at, at + TILE), { path, run, at });
    add(run.slice(-TILE), { path, run, at: run.length - TILE });
  }
  tileIndex.set(notes, index);
  return index;
}

/** The paths of the notes some 80 consecutive characters of which appear in `text`. */
export function notesIn(text, notes = limitsNotes()) {
  const index = tilesOf(notes), found = new Set();
  for (let at = 0; at + TILE <= text.length; at += 1) {
    const entries = index.get(text.slice(at, at + TILE));
    if (!entries) continue;
    for (const { path, run, at: offset } of entries) {
      if (found.has(path)) continue;
      const from = Math.min(offset, run.length - SPAN), begins = at - (offset - from);
      if (begins >= 0 && text.startsWith(run.slice(from, from + SPAN), begins)) found.add(path);
    }
  }
  return notes.map(([path]) => path).filter(path => found.has(path));
}

const SHIPPED = /\.(?:[cm]?js|map|json|html|txt|md)$/;
/* What Next writes for a prerendered page and serves as it is: the document, the RSC payload
   and a route handler's body. The server's own JavaScript beside them is not served, and
   does carry notes, from server code that imports infra/worker, so it is not read. */
export const PRERENDERED = /\.(?:html|rsc|body)$/;

function* files(path, shipped) {
  /* A path that is not there is a refusal, not a clean result: with the output moved (a
     NEXT_DIST_DIR, a renamed directory) the scan would read nothing and print that it
     found nothing. */
  if (!existsSync(path)) throw new Error(`${path} does not exist, so it cannot be scanned for limits.json notes`);
  if (!statSync(path).isDirectory()) { yield path; return; }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const inner = join(path, entry.name);
    if (entry.isDirectory()) yield* files(inner, shipped);
    else if (shipped.test(entry.name)) yield inner;
  }
}

/** Each file under `paths` that holds a note, with the notes it holds. A path with nothing in
 *  it to read is refused for the same reason a missing one is. */
export function scan(paths, shipped = SHIPPED) {
  const notes = limitsNotes();
  const found = [];
  let read = 0;
  for (const path of paths) {
    const before = read;
    for (const file of files(path, shipped)) {
      read += 1;
      const hits = notesIn(readFileSync(file, "utf8"), notes);
      if (hits.length) found.push({ file, notes: hits });
    }
    if (read === before) throw new Error(`${path} has no files to scan for limits.json notes, so a clean result would mean nothing`);
  }
  return Object.assign(found, { read });
}

/**
 * Limits outside the browser allowlist, looked for by key in built output. A JSON import
 * reaches a bundle, an RSC payload or a prerendered page as an object, so a leaked limit shows
 * up as its key followed by a colon. Only distinctive keys count: ten characters or more, not a
 * key the browser share keeps, not a dependency's export (VENDOR_KEYS), and never written as an
 * object key anywhere in our source (SOURCE_ROOTS: apps, packages, infra, scripts), so code that merely reads a limit by name, or has a key of
 * the same spelling, is not evidence. The postbuild runs this beside the note scan, which
 * covers what the module-graph test cannot: a server component handing a section to a client
 * one as props, which lands in the HTML and the RSC payload (review of this change, 5 Nov 2026).
 *
 * That rule alone cannot see most of the review policy, the copyright takedown thresholds or
 * the sender check, because their keys (randomRate, autoTakedownsPerHourMax, ownerChecksPerDay)
 * are spelled in code somewhere. Measured in the independent review of #936, 16 of the 45
 * excluded review-policy leaves were findable by key; with excludedLimitPairs below, 33.
 */
export function excludedLimitKeys(limits = JSON.parse(readFileSync(SOURCE, "utf8")), paths = browserPaths()) {
  const { values, keptNames, covered, source } = excludedContext(limits, paths);
  const names = new Map();
  (function walk(node, path) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, inner] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if (key.length >= 10 && !covered(at) && !keptNames.has(key) && !source.keys.has(key) && !VENDOR_KEYS.has(key)) names.set(key, at);
      walk(inner, at);
    }
  })(values, "");
  return names;
}

/**
 * The rest of the excluded limits, looked for as a key followed by its own value: each leaf
 * outside the allowlist with a key of eight characters or more and a number or string value,
 * written the ways a build writes it (JSON as Turbopack and an RSC payload carry it, and
 * minified, `.05` and `1e3`). A pair is evidence only when the browser share has no key of
 * that name with that value and no shipped source file writes the same key with the same
 * value, so `timeoutMs: 20000` in a component is not a leak of the sender check's timeout.
 * Booleans are never looked for: `enabled:!1` is in every third bundle on the web.
 * Returns key -> [{ value forms, path }].
 */
export function excludedLimitPairs(limits = JSON.parse(readFileSync(SOURCE, "utf8")), paths = browserPaths()) {
  const { values, kept, covered, source } = excludedContext(limits, paths);
  const keptPairs = new Set();
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    for (const [key, inner] of Object.entries(node)) { if (Array.isArray(node)) { walk(inner); continue; } keptPairs.add(pairId(key, inner)); walk(inner); }
  })(kept);
  const pairs = new Map();
  (function walk(node, path) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, inner] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if (inner && typeof inner === "object") { if (!Array.isArray(inner)) walk(inner, at); continue; }
      if (key.length < 8 || covered(at) || (typeof inner !== "number" && typeof inner !== "string") || inner === "") continue;
      const id = pairId(key, inner);
      if (keptPairs.has(id) || source.pairs.has(id)) continue;
      const list = pairs.get(key) ?? [];
      list.push({ forms: valueForms(inner), path: at });
      pairs.set(key, list);
    }
  })(values, "");
  return pairs;
}

const pairId = (key, value) => `${key}=${JSON.stringify(value)}`;

/** A number or string as JSON, an escaped JSON string inside a string, and a minifier write it. */
function valueForms(value) {
  if (typeof value === "string") {
    const json = JSON.stringify(value);
    return [json, `\\${json.slice(0, -1)}\\"`, `'${value.replaceAll("'", "\\'")}'`];
  }
  const forms = new Set([String(value), String(value).replace(/^(-?)0\./, "$1."), value.toExponential().replace("e+", "e").replace(/\.?0+e/, "e")]);
  return [...forms];
}

/* Where "our source" is read from, relative to the repository root, and the one directory
   under them that is skipped. Until 5 Nov 2026 the walk read the whole checkout, so its
   answer depended on which checkout: the Vercel upload drops the Python pipeline's folder,
   spikes/ and outputs/ (.vercelignore), and a file in the pipeline's Studio template writes
   `materialAnisotropy: 8`. Locally that one file excused the key, and every launch preview on
   Vercel failed this scan on a chunk that a laptop's build passed, with nothing to say why
   the two disagreed. Every build of the site has these roots, so every build now reads the
   same files. The pipeline runs on Modal and never reaches a page, so it excuses nothing.
   limits-browser.test.ts holds the skip to .vercelignore. The public mirror has no apps
   folder and writes this list empty. */
export const SOURCE_ROOTS = ["apps", "packages", "infra", "scripts"];
export const SOURCE_SKIPPED = [];

/* Keys a dependency writes into the site's own chunks, each with the module that exports it.
   The walk cannot see these because node_modules is not ours: three's TSL namespace is
   spread into a minified chunk as `materialAnisotropy:n0`, which reads exactly like the
   studio runtime's limit of that name. Each one is excused from the key-alone rule only;
   the same key followed by its limit's value is still a leak (excludedLimitPairs).
   limits-browser.test.ts holds each to the module, so one the package stops exporting goes
   from this list rather than staying as an excuse. */
export const VENDOR_KEYS = new Map([["materialAnisotropy", "three/tsl"]]);

/* The repo's own source, tests left out: every object key it writes, and every key written
   with a plain number or string beside it. Read once per process. */
let sourceOnce;
export function sourceShapes() {
  if (sourceOnce) return sourceOnce;
  const keys = new Set(), pairs = new Set();
  const repo = join(shared, "../..");
  const skipped = new Set(SOURCE_SKIPPED.map(path => join(repo, path)));
  for (const root of SOURCE_ROOTS) (function walk(dir, testing) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name === "public" || entry.name === "dist") continue;
      const path = join(dir, entry.name);
      if (skipped.has(path)) continue;
      if (entry.isDirectory()) { walk(path, testing || /^(?:tests?|__tests__|fixtures)$/.test(entry.name)); continue; }
      if (!/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name) || /^limits(?:\.values|\.browser)?\.json$/.test(entry.name)) continue;
      /* A test ships nothing, and until 5 Nov 2026 its keys counted: a fixture that wrote
         `{someLimitKey:` excused that limit on every build, and the test written for the
         three.js key below excused the key it was testing (review of this change). */
      if (testing || /\.test\.|\.spec\./.test(entry.name)) continue;
      const text = readFileSync(path, "utf8");
      for (const [, key] of text.matchAll(/(?:^|[{,\s(])["']?([A-Za-z_$][\w$-]{9,})["']?\??\s*:/gm)) keys.add(key);
      for (const [, key, number, double, single] of text.matchAll(/(?:^|[{,\s(])["']?([A-Za-z_$][\w$-]{7,})["']?\s*:\s*(?:(-?[\d.][\d._]*(?:e[-+]?\d+)?)|"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)')/gim)) {
        if (number !== undefined) { const n = Number(number.replaceAll("_", "")); if (Number.isFinite(n)) pairs.add(pairId(key, n)); }
        else pairs.add(pairId(key, double ?? single));
      }
    }
  })(join(repo, root), false);
  return (sourceOnce = { keys, pairs });
}

function excludedContext(limits, paths) {
  const values = withoutNotes(limits);
  const kept = projectLimits(values, paths);
  const keptNames = new Set();
  (function walk(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, inner] of Object.entries(node)) { keptNames.add(key); walk(inner); }
  })(kept);
  const covered = path => paths.some(allowed => {
    const a = allowed.split("."), b = path.split(".");
    return a.length <= b.length && a.every((key, index) => key === "*" || key === b[index]);
  });
  return { values, kept, keptNames, covered, source: sourceShapes() };
}

/** Each file under `paths` that holds an excluded limit, by its key alone or by key and value. */
export function scanLimits(paths, shipped = SHIPPED, names = excludedLimitKeys(), pairs = excludedLimitPairs()) {
  const found = [];
  const boundary = /^[\s,}\]\\)]/;
  for (const path of paths) for (const file of files(path, shipped)) {
    const text = readFileSync(file, "utf8"), hits = new Set();
    for (const match of text.matchAll(/[{,]\s*\\?["']?([A-Za-z_$][\w$-]{7,})\\?["']?\s*:\s*/g)) {
      const key = match[1];
      if (names.has(key)) { hits.add(names.get(key)); continue; }
      const at = match.index + match[0].length;
      for (const { forms, path: limit } of pairs.get(key) ?? []) {
        if (forms.some(form => text.startsWith(form, at) && (form.endsWith('"') || form.endsWith("'") || boundary.test(text.slice(at + form.length, at + form.length + 1)) || at + form.length === text.length))) hits.add(limit);
      }
    }
    if (hits.size) found.push({ file, limits: [...hits] });
  }
  return Object.assign(found, { names: names.size, pairs: pairs.size });
}

/* Both sides through realpath: import.meta.url has its symlinks resolved and argv[1] does not,
   so `node /tmp/x/limits-values.mjs --check` on macOS, where /tmp is a link, matched nothing,
   ran nothing and exited 0 (R19b F7). Every package script calls it by a relative path, which
   was never affected; a gate written with an absolute one would have passed silently. */
const isMain = (() => {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; } /* an importer whose argv[1] is not a file on disk */
})();
if (isMain) {
  const [mode, ...rest] = process.argv.slice(2);
  const limits = JSON.parse(readFileSync(SOURCE, "utf8"));
  /* The public mirror exports limits.browser.json already cut to its own list
     (scripts/public-mirror.mjs) and not the browser allowlist, so there it is not rewritten
     here. It writes .mirror-manifest.json at its root, which the monorepo never has; anywhere
     else a missing allowlist is an error from browserPaths, not a skipped file. */
  const mirrored = existsSync(join(shared, "../../.mirror-manifest.json"));
  const outputs = [[OUTPUT, render(limits)], ...(mirrored ? [] : [[BROWSER_OUTPUT, renderBrowser(limits)]])];
  if (mode === "--check") {
    for (const [file, expected] of outputs) {
      if (!existsSync(file) || readFileSync(file, "utf8") !== expected) {
        const from = file === BROWSER_OUTPUT ? "limits.json or limits.browser-paths.json" : "limits.json";
        console.error(`${relative(process.cwd(), file)} is out of date with ${from}, so this build would ship old limits.\n` +
          "Run `node packages/shared/scripts/limits-values.mjs` from the repo root and commit the result.");
        process.exit(1);
      }
    }
  } else if (mode === "--scan") {
    /* `--prerendered <dir>...` after the shipped paths reads only Next's prerendered pages
       under those directories (PRERENDERED above). `--allowlist`, anywhere, also refuses any
       limit outside limits.browser-paths.json. Only the site passes it: the admin console's
       client modules read the whole of limits.json, behind its sign-in, and failed every
       build once this half was made unconditional (5 Nov 2026). */
    const allowlist = rest.includes("--allowlist");
    if (allowlist) rest.splice(rest.indexOf("--allowlist"), 1);
    const split = rest.indexOf("--prerendered");
    const shipped = split < 0 ? rest : rest.slice(0, split), prerendered = split < 0 ? [] : rest.slice(split + 1);
    if (!shipped.length && !prerendered.length) { console.error("--scan needs at least one file or directory"); process.exit(2); }
    const results = [scan(shipped), scan(prerendered, PRERENDERED)];
    const found = Object.assign(results.flat(), { read: results[0].read + results[1].read });
    for (const { file, notes } of found) console.error(`${file} contains ${notes.length} limits.json notes, e.g. ${notes.slice(0, 3).join(", ")}`);
    if (found.length) {
      console.error("A bundle imported limits.json itself rather than @opengame/shared/limits.json or LIMITS. " +
        "Those resolve to limits.values.json, which carries the values and none of the notes.");
      process.exit(1);
    }
    /* The values: nothing outside limits.browser-paths.json, by whatever route. Not in the
       public mirror, which has no allowlist and ships no site. */
    if (allowlist && mirrored) { console.error("--allowlist needs limits.browser-paths.json, which the public mirror does not carry"); process.exit(2); }
    if (allowlist) {
      const names = excludedLimitKeys(), pairs = excludedLimitPairs();
      const leaks = [...scanLimits(shipped, SHIPPED, names, pairs), ...scanLimits(prerendered, PRERENDERED, names, pairs)];
      for (const { file, limits } of leaks) console.error(`${file} carries ${limits.length} limits outside limits.browser-paths.json, e.g. ${limits.slice(0, 3).join(", ")}`);
      if (leaks.length) {
        console.error("Browser code or a page reached the whole of limits.json. Client code imports @opengame/shared/browser; " +
          "a server component passes the values it needs, not a LIMITS section.");
        process.exit(1);
      }
      console.log(`no limits outside the browser allowlist (${names.size} keys alone and ${[...pairs.values()].flat().length} keys with their values looked for)`);
    }
    const named = [...shipped, ...prerendered];
    console.log(`no limits.json notes in ${found.read} files under ${named.length > 3 ? `${named.length} paths` : named.join(", ")}`);
  } else if (mode === undefined) {
    for (const [file, expected] of outputs) {
      writeFileSync(file, expected);
      console.log(`wrote ${relative(process.cwd(), file)}`);
    }
  } else {
    console.error(`unknown option ${mode}`);
    process.exit(2);
  }
}

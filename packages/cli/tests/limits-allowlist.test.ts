import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectLimits } from "../build.mjs";
import { allowlistFile, bundleInputs, limitReads } from "./limits-reads";

/* Until 5 Nov 2026 dist/cli.mjs carried every value in limits.json: abuse thresholds, rate
   limits, budgets, provider prices. build.mjs now ships only src/limits-allowlist.json's paths.
   These hold three things: the list is exactly what the bundled code reads, a list naming
   a path the values lack fails the build, and nothing outside the list reaches dist. */
const dist = fileURLToPath(new URL("../dist", import.meta.url));
const values = JSON.parse(await readFile(new URL("../../shared/limits.values.json", import.meta.url), "utf8"));
const allowed: string[] = JSON.parse(await readFile(allowlistFile, "utf8")).paths;
/* In the public repository limits.values.json is already a projection, to the limits its
   code reads, so the sections the leak check looks for are not there to find. The mirror
   writes .mirror-manifest.json at its root and the monorepo never has one. */
const mirrored = existsSync(new URL("../../../.mirror-manifest.json", import.meta.url));

const covered = (path: string) => allowed.some(kept => path === kept || path.startsWith(kept + "."));
const touches = (path: string) => allowed.some(kept => kept === path || kept.startsWith(path + ".") || path.startsWith(kept + "."));

/** Every key in a tree with its dotted path, objects only (array elements are not named). */
function* keys(node: unknown, prefix: string[] = []): Generator<{ path: string; name: string }> {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  for (const [name, inner] of Object.entries(node)) {
    yield { path: [...prefix, name].join("."), name };
    yield* keys(inner, [...prefix, name]);
  }
}

/* Sections that must never ship, named so a regression is readable. Each is checked to be
   off the list entirely and to have distinctive key names that the bundles do not hold. */
const SENSITIVE = ["auth", "email", "social", "copyright", "estate", "pipeline", "reports", "hosting",
  "platform.budget", "platform.apiLimits", "studio.usage", "studio.fastMode", "studio.webSearch", "studio.delegation",
  "platform.kaigenAssets.imageReview"];

/* Single values that must never ship: the scan's sizing and per-account scan quotas, and the
   database constraint names the text caps mirror. Each is checked to exist and to be off the
   list; a leaf has no key names under it to look for, so the bundles are searched for the
   key with a literal value beside it. */
const SENSITIVE_LEAVES = ["platform.largeGameAssets.avWorkers", "platform.largeGameAssets.scanCompute",
  "platform.largeGameAssets.scanBytesPerAccountPerDay", "platform.kaigenAssets.scanCompute",
  "platform.kaigenAssets.scanBytesPerAccountPerDay", "text.gameTitle.constraint"];

test("limits-allowlist.json is exactly what the CLI's bundled code reads", async () => {
  const { paths } = await limitReads();
  assert.deepEqual(allowed, paths, "regenerate it: node --import tsx tests/limits-reads.ts --write (from packages/cli)");
});

test("the projection keeps the listed paths whole and refuses one the values lack", () => {
  assert.deepEqual(projectLimits(values, ["bundle", "platform.apiVersion"]),
    { bundle: values.bundle, platform: { apiVersion: values.platform.apiVersion } });
  assert.deepEqual(projectLimits(values, ["bundle", "bundle.fileCountMax"]), { bundle: values.bundle });
  assert.throws(() => projectLimits(values, [...allowed, "platform.noSuchLimit"]), /has no platform\.noSuchLimit/);
  assert.throws(() => projectLimits(values, ["checks.0"]), /has no checks\.0/);
  const kept = projectLimits(values, allowed);
  for (const path of allowed) assert.notEqual(path.split(".").reduce((node: any, key) => node?.[key], kept), undefined, path);
});

test("the built bundles carry no limit outside the allowlist", async t => {
  const kept = projectLimits(values, allowed);
  const keptNames = new Set([...keys(kept)].map(row => row.name));
  // A limit that ships is an object key with a literal value in a bundle. A key name counts
  // as evidence only when nothing else bundled writes it as a key: not a kept limit, and not
  // a key in any other input esbuild reads (our code, dependencies, the other JSON files).
  // What is left can only have come from limits.json.
  const keyNames = (text: string, literal: boolean) => new Set([...text.matchAll(literal
    ? /[{,]"?([^"{},:\s]+)"?:(?=-?[\d.]|"|\{|\[|!0|!1|null|true|false)/g
    : /(?:^|[{,\s])["']?([^"'{},:\s]+)["']?\s*:/gm)].map(match => match[1]!));
  const others = new Set<string>();
  for (const file of (await bundleInputs()).filter(file => !/limits(\.values|\.browser)?\.json$/.test(file)))
    for (const name of keyNames(await readFile(file, "utf8"), false)) others.add(name);
  const distinctive = new Map<string, string>();
  for (const row of keys(values)) {
    if (!touches(row.path) && !row.name.startsWith("_") && !keptNames.has(row.name) && !others.has(row.name)) distinctive.set(row.name, row.path);
  }
  if (!mirrored) assert.ok(distinctive.size > 1000, `only ${distinctive.size} distinctive excluded key names; the check would prove little`);

  // opengame-global.js is the SDK's own build, the same bytes as @opengamehq/sdk on npm,
  // which picks its fields from limits.json by name in packages/sdk/build.mjs. It is not
  // bundled here and this list does not govern it.
  const files = (await readdir(dist, { recursive: true })).filter(file => /\.(m?js|json)$/.test(file) && file !== "opengame-global.js");
  for (const bundle of ["cli.mjs", "preflight-worker.mjs", "runtime-builder.mjs"]) assert.ok(files.includes(bundle), `build the CLI first: no dist/${bundle}`);
  const found: string[] = [];
  for (const file of files) {
    for (const name of keyNames(await readFile(join(dist, file), "utf8"), true)) if (distinctive.has(name)) found.push(`${file}: ${distinctive.get(name)}`);
  }
  assert.deepEqual(found.slice(0, 20), [], `${found.length} limits outside limits-allowlist.json reached dist`);
  t.diagnostic(`${allowed.length} allowed paths; looked for ${distinctive.size} excluded key names in ${files.length} files`);

  for (const section of mirrored ? [] : SENSITIVE) {
    assert.ok(section.split(".").reduce((node: any, key) => node?.[key], values) !== undefined, `${section} is not in limits.json any more; update SENSITIVE`);
    assert.ok(!touches(section), `${section} is on the allowlist`);
    const names = [...distinctive].filter(([, path]) => path.startsWith(section + "."));
    assert.ok(names.length > 0, `${section} has no distinctive key names to look for`);
    t.diagnostic(`${section}: ${names.length} key names absent`);
  }
});

test("the scan's sizing, its per-account quotas and the constraint names stay off the list and out of dist", async () => {
  const at = (path: string) => path.split(".").reduce((node: any, key) => node?.[key], values);
  const files = (await readdir(dist, { recursive: true })).filter(file => /\.(m?js|json)$/.test(file) && file !== "opengame-global.js");
  const texts = await Promise.all(files.map(file => readFile(join(dist, file), "utf8")));
  for (const path of mirrored ? [] : SENSITIVE_LEAVES) {
    assert.notEqual(at(path), undefined, `${path} is not in limits.json any more; update SENSITIVE_LEAVES`);
    assert.ok(!touches(path), `${path} is on the allowlist`);
  }
  assert.ok(!allowed.some(path => /\.(constraint|alsoOn|columnMax)$/.test(path)), "a text cap's constraint name is on the allowlist");
  for (const [index, text] of texts.entries()) {
    assert.doesNotMatch(text, /"?(?:avWorkers|scanCompute|scanBytesPerAccountPerDay)"?\s*:/, `${files[index]} carries the scan's sizing`);
    assert.doesNotMatch(text, /"?constraint"?\s*:\s*"[a-z_]+_(?:check|length)/, `${files[index]} carries a text cap's constraint name`);
  }
});

test("the values the CLI does read still arrive", async () => {
  const cli = await readFile(join(dist, "cli.mjs"), "utf8");
  for (const value of [values.checks[1].hint, values.platform.apiVersion, values.handle.pattern])
    assert.ok(cli.includes(String(value).slice(0, 40)) || cli.includes(JSON.stringify(value).slice(1, 41)), `${String(value).slice(0, 40)} missing from cli.mjs`);
});

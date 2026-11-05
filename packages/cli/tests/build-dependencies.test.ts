import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { resolveLockedHttpDependency, resolveCliReleaseVersion } from "../build.mjs";
import { CLI_VERSION } from "../src/version";

test("CLI and MCP builds share the release-version override and reject malformed versions", async () => {
  assert.equal(await resolveCliReleaseVersion({}), CLI_VERSION);
  assert.equal(await resolveCliReleaseVersion({ OPENGAME_RELEASE_VERSION: "1.2.3" }), "1.2.3");
  for (const value of ["", "v1.2.3", "1.2.3-beta", "01.2.3"]) {
    await assert.rejects(resolveCliReleaseVersion({ OPENGAME_RELEASE_VERSION: value }), /major.minor.patch/);
  }
});

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(join(tmpdir(), "og-cli-build-dependency-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "packages/cli");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "package.json"), JSON.stringify({ name: "@opengamehq/cli", engines: { node: ">=18.17" }, devDependencies: { undici: "^6.29.0" } }));
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ packages: {
    "packages/cli": { devDependencies: { undici: "^6.29.0" } },
    "node_modules/undici": { version: "7.29.0", engines: { node: ">=20.18.1" } },
    "packages/cli/node_modules/undici": { version: "6.29.0", engines: { node: ">=18.17" } },
  } }));
  async function install(directory: string, version: string, node: string) {
    const packageRoot = join(directory, "node_modules/undici");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "undici", version, main: "index.js", engines: { node } }));
    await writeFile(join(packageRoot, "index.js"), "module.exports = {};\n");
    return join(packageRoot, "index.js");
  }
  await install(root, "7.29.0", ">=20.18.1");
  return { root, workspace, install };
}

test("an absent workspace HTTP dependency cannot silently bundle the hoisted Node20 client", async t => {
  const { workspace } = await fixture(t);
  await assert.rejects(resolveLockedHttpDependency(workspace), /HTTP dependency does not match/);
});

test("the workspace's locked Node18 client wins over an incompatible hoisted client", async t => {
  const { workspace, install } = await fixture(t);
  const entry = await install(workspace, "6.29.0", ">=18.17");
  assert.deepEqual(await resolveLockedHttpDependency(workspace), { entry: await realpath(entry), version: "6.29.0", node: ">=18.17" });
});

test("stale versions or stronger runtime requirements cannot pass the lockfile guard", async t => {
  for (const [version, node] of [["6.28.0", ">=18.17"], ["6.29.0", ">=20.18.1"]]) {
    const { workspace, install } = await fixture(t);
    await install(workspace, version, node);
    await assert.rejects(resolveLockedHttpDependency(workspace), /HTTP dependency does not match/);
  }
});

test("the standalone runtime builder includes the canonical source validator and all producer dependencies", async t => {
  const { buildRuntimeBuilder } = await import('../build.mjs');
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { sourceDistributions } = await import('../../../scripts/engine-runtimes/source-distribution.mjs');
  const root = await mkdtemp(join(tmpdir(), 'og-cli-runtime-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outfile = join(root, 'runtime-builder.mjs');
  // Only this small bundle is built; no buildRuntime/buildRuntimes or fetch runs.
  const result = await buildRuntimeBuilder(outfile);
  // Esbuild records inputs relative to its working directory, which is the CLI
  // package in the supported test invocation. Compare repository-relative names
  // so sibling shared inputs retain their identity instead of failing on ../.
  const repository = fileURLToPath(new URL('../../../', import.meta.url));
  const inputs = Object.keys(result.metafile!.inputs).map(path => relative(repository, resolve(path)).replaceAll('\\', '/'));
  for (const suffix of [
    'scripts/build-engine-runtimes.mjs', 'scripts/engine-runtimes/archives.mjs',
    'scripts/engine-runtimes/notices.mjs', 'scripts/engine-runtimes/shells.mjs',
    'scripts/engine-runtimes/source-distribution.mjs', 'scripts/engine-runtimes/source-notices.json',
    'packages/shared/runtime-source-catalog.json', 'packages/shared/runtime-source-publications.json',
    // limits.json reaches this bundle as limits.values.json, the same numbers without the
    // notes (build.mjs, limitValuesOnly); the file itself must not be an input.
    'packages/shared/limits.values.json',
  ]) assert.ok(inputs.some(path => path.endsWith(suffix)), `Missing producer dependency: ${suffix}`);
  assert.deepEqual(inputs.filter(path => path.endsWith('packages/shared/limits.json')), [], 'the runtime builder bundled limits.json with its notes');
  assert.ok(Object.values(result.metafile!.outputs).flatMap(output => output.imports).every(row => row.external && row.path.startsWith('node:')));
  const packaged = await import(pathToFileURL(outfile).href);
  assert.equal(typeof packaged.buildRuntime, 'function');
  assert.equal(typeof packaged.renderRuntimeShell, 'function');
  assert.equal(typeof packaged.validateSourceDistributionReceipt, 'function');
  assert.deepEqual(packaged.sourceDistributions(), sourceDistributions());
  // Importing the copied bundle from a directory with no package files must
  // retain the complete validator, including its frozen unpublished state.
  for (const entry of packaged.sourceDistributions().entries) {
    const prefix = `/_og/runtime/${entry.runtime}@${entry.version}/`;
    const runtime = { id: entry.runtime, version: entry.version, prefix,
      archive: { sha256: entry.upstreamArchiveSha256 },
      sourceDistribution: { schemaVersion: 1, catalogEntrySha256: packaged.sourceEntryDigest(entry),
        companion: entry.companion, sourceIndex: entry.sourceIndex, publication: null },
      files: [...entry.runtimeFiles, ...entry.notices, entry.sourceIndex].map(row => ({ ...row, path: prefix.slice(1) + row.path })) };
    packaged.validateSourceDistributionReceipt(runtime, { requirePublished: false });
    assert.throws(() => packaged.validateSourceDistributionReceipt(runtime, { requirePublished: true }), /not published/);
  }
  const source = await readFile(outfile, 'utf8');
  assert.doesNotMatch(source, /import[^\n]+runtime-source-(?:catalog|publications)\.json/);
});

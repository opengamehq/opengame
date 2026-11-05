import { build } from "esbuild";
import { readFile, chmod, copyFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { buildRuntimes } from "../../scripts/build-engine-runtimes.mjs";
import { dirname, join } from "node:path";
import { buildSkills } from "../skills/build.mjs";
import { projectLimits as projectSharedLimits, scan } from "../shared/scripts/limits-values.mjs";
import { npmReleaseForBuild } from "../shared/npm-release.mjs";

/* The limits.json notes are for whoever edits a limit, and this package goes to strangers on
   npm. Most of the CLI reads limits through @opengame/shared, which resolves to
   limits.values.json, the same numbers without the notes; but `opengame dev` imports two
   modules from infra/worker, and the runtime builder one from scripts/engine-runtimes, and
   those import limits.json by path because the Workers and scripts read it whole. Bundled
   as they were, dist/cli.mjs and dist/runtime-builder.mjs each carried all 494 notes
   (R19, 26 Oct 2026). This sends that one file to its projection in every bundle here; the
   values are identical, so nothing the CLI does changes. */
const sharedLimits = fileURLToPath(new URL("../shared/limits.json", import.meta.url));
const sharedLimitValues = fileURLToPath(new URL("../shared/limits.values.json", import.meta.url));
/* The browser's projection (packages/shared/src/limits-browser.ts), which shared modules the
   site and the CLI both bundle read. It is a subset of the values and goes through the same
   cut, so the CLI never carries a browser limit it does not read. */
const sharedLimitBrowser = fileURLToPath(new URL("../shared/limits.browser.json", import.meta.url));
const sharedNpmRelease = fileURLToPath(new URL("../shared/npm-release.json", import.meta.url));

/* The values alone were still every abuse threshold, rate limit, budget and price the
   platform runs on, and dist/cli.mjs shipped all of them to npm because a JSON import cannot
   be tree-shaken (security review, 5 Nov 2026). The bundles get only the paths in
   src/limits-allowlist.json, each with everything under it, in the file's own key order.
   tests/limits-reads.ts works that list out from what the bundled code reads, and
   tests/limits-allowlist.test.ts fails while the two differ. A listed path the values do not
   have fails the build, because the code reading it would get undefined on a stranger's
   machine and nothing else would say so. */
export function projectLimits(values, paths) {
  try { return projectSharedLimits(values, paths, "src/limits-allowlist.json"); }
  catch (error) { throw new Error(`${error.message} Regenerate the list with \`node --import tsx tests/limits-reads.ts --write\` in packages/cli.`); }
}

/** The parts of `a` that `b` also has. Both are cuts of one tree, so a shared leaf is equal. */
export function withinBoth(a, b) {
  if (!a || typeof a !== "object" || Array.isArray(a) || !b || typeof b !== "object" || Array.isArray(b)) return a;
  return Object.fromEntries(Object.entries(a).filter(([key]) => Object.hasOwn(b, key)).map(([key, inner]) => [key, withinBoth(inner, b[key])]));
}

export async function allowedLimitPaths() {
  const list = JSON.parse(await readFile(new URL("src/limits-allowlist.json", import.meta.url), "utf8"));
  if (!Array.isArray(list.paths) || !list.paths.length || !list.paths.every(path => typeof path === "string" && path))
    throw new Error("packages/cli/src/limits-allowlist.json must carry a nonempty `paths` list of dotted limit paths.");
  return list.paths;
}

export const limitValuesOnly = {
  name: "limit-values-only",
  setup(build) {
    build.onResolve({ filter: /(?:^|\/)limits\.json$/ }, args => {
      if (args.path.startsWith("@") || join(args.resolveDir, args.path) !== sharedLimits) return undefined;
      return { path: fileURLToPath(new URL("../shared/limits.values.json", import.meta.url)) };
    });
    /* Every other JSON file of ours the bundles import (genres, game kinds, engine guides)
       carries a "$comment" or "_comment" written for whoever edits it, naming plans, people
       and private paths. Those go to strangers inside dist/ too, so they are dropped on the
       way in; no code reads them. Found by a security review on 5 Nov 2026. */
    build.onLoad({ filter: /\.json$/ }, async args => {
      if (args.path.includes("node_modules") || args.path === sharedLimits) return undefined;
      if (args.path === sharedLimitValues || args.path === sharedLimitBrowser) {
        const values = JSON.parse(await readFile(sharedLimitValues, "utf8"));
        const kept = projectLimits(values, await allowedLimitPaths());
        if (args.path === sharedLimitValues) return { contents: JSON.stringify(kept), loader: "json" };
        /* The browser file is cut to the CLI's list as well, keeping only what both hold. */
        const browser = JSON.parse(await readFile(args.path, "utf8"));
        return { contents: JSON.stringify(withinBoth(kept, browser)), loader: "json" };
      }
      const read = JSON.parse(await readFile(args.path, "utf8"));
      /* src/build-output.ts says how to get the SDK from the switch as bundled here, and the
         skills in dist/skills say how to get the CLI. A build release.mjs runs with the switch
         open reads it as published (packages/shared/npm-release.mjs says why, and
         scripts/release.mjs when); the skills' renderer reads it through the same function,
         so the bundle and the skills beside it cannot disagree. Every note in the switch is
         a `_` key, including who confirmed the npm organization, so all of them go, not only
         the two comment keys: the code imports three keys by name today, and a default import
         tomorrow would otherwise carry the rest to npm. */
      const value = args.path === sharedNpmRelease
        ? Object.fromEntries(Object.entries(npmReleaseForBuild(read, process.env)).filter(([key]) => !key.startsWith("_")))
        : read;
      const strip = item => Array.isArray(item) ? item.map(strip) : item && typeof item === "object"
        ? Object.fromEntries(Object.entries(item).filter(([key]) => key !== "$comment" && key !== "_comment").map(([key, inner]) => [key, strip(inner)]))
        : item;
      return { contents: JSON.stringify(strip(value)), loader: "json" };
    });
  },
};

/** Fails the build if anything in dist carries a note, whatever route brought it there. */
export function refuseLimitNotes(directory = fileURLToPath(new URL("dist", import.meta.url))) {
  const found = scan([directory]);
  if (found.length) throw new Error(`limits.json notes in the CLI build: ${found.map(({ file, notes }) => `${file} (${notes.length})`).join(", ")}. ` +
    "Something bundled limits.json itself; route it through limitValuesOnly in build.mjs.");
}

/** A hoisted HTTP client can require a newer Node than the CLI advertises even
 * when the package and lockfile are correct. Resolve from this workspace, compare
 * its locked metadata, and bind esbuild to that exact entry rather than letting a
 * different resolver silently bundle the hoisted version. */
export async function resolveLockedHttpDependency(directory = dirname(fileURLToPath(import.meta.url))) {
  try {
    const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    const lock = JSON.parse(await readFile(join(directory, "../../package-lock.json"), "utf8"));
    const declaration = lock.packages["packages/cli"]?.devDependencies?.undici;
    const expected = lock.packages["packages/cli/node_modules/undici"] ?? lock.packages["node_modules/undici"];
    const require = createRequire(join(directory, "package.json"));
    const installed = JSON.parse(await readFile(require.resolve("undici/package.json"), "utf8"));
    if (!declaration || declaration !== manifest.devDependencies?.undici || !expected ||
      installed.name !== "undici" || installed.version !== expected.version ||
      installed.engines?.node !== expected.engines?.node || expected.engines?.node !== manifest.engines?.node)
      throw new Error("dependency_mismatch");
    return { entry: require.resolve("undici"), version: installed.version, node: installed.engines.node };
  } catch {
    throw new Error("The CLI HTTP dependency does not match its lockfile and supported Node version. Restore this workspace's dependencies before building.");
  }
}

export async function resolveCliReleaseVersion(env = process.env) {
  const packageVersion = JSON.parse(await readFile(new URL("package.json", import.meta.url), "utf8")).version;
  const releaseVersion = env.OPENGAME_RELEASE_VERSION ?? packageVersion;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(releaseVersion)) throw new Error("Release version must be major.minor.patch.");
  return releaseVersion;
}

/** A release binds the complete producer inventory, not stale hand-written hashes.
 * Only its small receipts/templates ship; selected runtime bytes are reacquired
 * from exact archive/notice pins and checked against this inventory on demand. */
export async function buildRuntimeCatalog() {
  const scratch = await mkdtemp(join(tmpdir(), "opengame-cli-runtimes-"));
  try {
    const config = JSON.parse(await readFile(new URL("../shared/limits.json", import.meta.url), "utf8")).platform.engineRuntimes;
    const root = join(scratch, "artifacts");
    const inventory = await buildRuntimes({ config, outputDir: root, offline: process.env.OPENGAME_RUNTIME_OFFLINE === "1" });
    await mkdir(new URL("dist/runtime-shells/", import.meta.url), { recursive: true });
    for (const row of inventory.shells.files) await copyFile(join(root, row.path), new URL("dist/runtime-shells/" + row.path.split("/").at(-1), import.meta.url));
    const bytes = Buffer.from(JSON.stringify({ config, inventory }));
    await writeFile(new URL("dist/runtime-catalog.json", import.meta.url), bytes);
    await writeFile(new URL("dist/runtime-catalog.sha256", import.meta.url), createHash("sha256").update(bytes).digest("hex") + "\n");
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

// Keep the validator and its catalogue/notice dependencies in the same portable
// producer bundle used for acquisition, including on an installed Node 18 CLI.
export async function buildRuntimeBuilder(outfile = fileURLToPath(new URL("dist/runtime-builder.mjs", import.meta.url))) {
  return build({ entryPoints: [fileURLToPath(new URL("runtime-builder.mjs", import.meta.url))], outfile,
    bundle: true, platform: "node", format: "esm", target: "node18", metafile: true, plugins: [limitValuesOnly] });
}

export async function buildCli() {
  const httpDependency = await resolveLockedHttpDependency();
  const releaseVersion = await resolveCliReleaseVersion();

  await build({
    entryPoints: ["src/cli.ts"], outfile: "dist/cli.mjs", bundle: true,
    platform: "node", format: "esm", target: "node18", minify: true,
    alias: { undici: httpDependency.entry }, plugins: [limitValuesOnly],
    define: { __CLI_RELEASE_VERSION__: JSON.stringify(releaseVersion) },
    banner: { js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  await chmod("dist/cli.mjs", 0o755);
  await copyFile(new URL("src/safe-fs.py", import.meta.url), new URL("dist/safe-fs.py", import.meta.url));
  try {
    const [sdk, notice] = await Promise.all([
      readFile(new URL("../sdk/dist/opengame-global.js", import.meta.url)),
      readFile(new URL("../sdk/dist/opengame-global.js.LEGAL.txt", import.meta.url)),
    ]);
    if (!sdk.byteLength || !notice.byteLength) throw new Error("Empty SDK artifact or notice.");
    await writeFile(new URL("dist/opengame-global.js", import.meta.url), sdk);
    await writeFile(new URL("dist/opengame-global.js.LEGAL.txt", import.meta.url), notice);
  } catch { throw new Error("Build packages/sdk before packages/cli: the nonempty global SDK artifact and dependency notice are required for opengame dev."); }

  await buildRuntimeCatalog();
  await buildRuntimeBuilder();

  await build({
    entryPoints: ["src/preflight-worker.ts"], outfile: "dist/preflight-worker.mjs", bundle: true,
    platform: "node", format: "esm", target: "node18", minify: true, plugins: [limitValuesOnly],
  });

  // The skills `opengame skills add` installs ship inside the package, rendered from
  // limits.json and validated by the same build the skills package runs. A skill that
  // fails validation fails this build, so a CLI cannot be packed with one.
  const { skills } = await buildSkills({ outDir: fileURLToPath(new URL("dist/skills", import.meta.url)) });
  console.log(`Bundled ${skills.length} skills.`);
  refuseLimitNotes();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildCli();

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectBuildOutput } from "../src/build-output";
import { packagingReceipt } from "../src/packaging-receipt";
import { accountAllowance } from "../src/allowance";
import release from "../../shared/npm-release.json";
import { INSTALL_CLOSED, installsOpen } from "../../shared/npm-release.mjs";

test("output selection distinguishes Vite source from ambiguous completed exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-outputs-"));
  try {
    await writeFile(join(root, "index.html"), '<script type="module" src="/main.ts"></script>');
    await writeFile(join(root, "main.ts"), "const game: number = 1;");
    const pkg = { scripts: { build: "vite build" }, dependencies: { vite: "1" } };
    assert.equal((await detectBuildOutput(root, pkg)).output, "dist", "the Vite source index is never a completed static export");
    await mkdir(join(root, "dist")); await writeFile(join(root, "dist/index.html"), "built");
    assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
    await mkdir(join(root, "out")); await writeFile(join(root, "out/index.html"), "another export");
    await assert.rejects(detectBuildOutput(root, pkg), { code: "build_output_ambiguous" });
    assert.equal((await detectBuildOutput(root, pkg, "out")).output, "out");
    await assert.rejects(detectBuildOutput(root, pkg, "../outside"), { code: "build_output_invalid" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Vite's src/main.ts layout and its root main.js layout both build to dist", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-vite-layouts-"));
  try {
    const pkg = { scripts: { build: "vite build" }, devDependencies: { vite: "1" } };
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/main.ts"), "export {};");
    await writeFile(join(root, "index.html"), '<script type="module" src="/src/main.ts"></script>');
    assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
    await writeFile(join(root, "main.js"), "export {};");
    await writeFile(join(root, "index.html"), '<script type="module" src="./main.js"></script>');
    assert.equal((await detectBuildOutput(root, pkg)).output, "dist", "a root main.js is Vite input, not a finished export");
    assert.equal((await detectBuildOutput(root, {})).output, ".", "with no build script the same page is a static game");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("staging receipts preserve original names and change when any staged bytes change", () => {
  const tree = new Map([["dist/index.html", Buffer.from("a")], ["readme.txt", Buffer.from("not shipped")]]);
  const first = packagingReceipt(tree, ["index.html"], "dist/", [".env"]);
  assert.equal(first.files[0]?.originalPath, "dist/index.html");
  assert.deepEqual(first.changes, [{ kind: "root-stripped", path: "dist/", destination: "" }, { kind: "excluded", path: ".env" }, { kind: "excluded", path: "readme.txt" }]);
  tree.set("dist/index.html", Buffer.from("b"));
  assert.notEqual(packagingReceipt(tree, ["index.html"], "dist/", [".env"]).treeSha256, first.treeSha256);
});

test("allowance clamps excess usage and preserves reset times", () => {
  assert.deepEqual(accountAllowance({ bytes: { used: 12, max: 10, resetsAt: "2030-01-01T00:00:00Z" }, malformed: { used: "0", max: 5 } }),
    { bytes: { used: 12, max: 10, remaining: 0, resetsAt: "2030-01-01T00:00:00Z" } });
});

test("submission allowances preserve UTC limits and reset times while jam counts identify the competition", async () => {
  const { allowanceLines } = await import("../src/allowance");
  const usage = accountAllowance({ submissionsPerDay: { used: 3, max: 10, remaining: 7, resetsAt: "2030-01-01T00:00:00Z" },
    playtestsPerDay: { used: 2, max: 10, remaining: 8, resetsAt: "2030-01-01T00:00:00Z" },
    activeEntries: { used: 4, max: 5, remaining: 1, jamSlug: "fixture-jam", jamName: "Fixture jam" } });
  assert.equal(usage.submissionsPerDay!.max, 10);
  assert.equal(usage.submissionsPerDay!.remaining, 7);
  assert.equal(usage.submissionsPerDay!.resetsAt, "2030-01-01T00:00:00Z");
  assert.equal(usage.playtestsPerDay!.remaining, 8);
  assert.deepEqual(allowanceLines(usage), ["Submissions today (UTC): 7 of 10 left, more from 1 Jan 2030, 00:00 UTC",
    "Playtests in the last 24 hours: 8 of 10 left, more from 1 Jan 2030, 00:00 UTC",
    "Active entries in Fixture jam: 1 of 5 left"]);
  assert.deepEqual(allowanceLines(accountAllowance({ heldBytes: { used: 0, max: 5368709120 }, scanBytesPerDay: { used: 1610612736, max: 2147483648 } })),
    ["Storage: 5 GiB of 5 GiB left", "Uploads scanned in the last 24 hours: 512 MiB of 2 GiB left"]);
});

test("byte counts read in the limits' own binary units and never round up into room that is not there", async () => {
  const { readableBytes } = await import("../src/bytes");
  assert.equal(readableBytes(0), "0 bytes");
  assert.equal(readableBytes(1), "1 byte");
  assert.equal(readableBytes(1023), "1023 bytes");
  assert.equal(readableBytes(1024), "1 KiB");
  assert.equal(readableBytes(1048575), "1023 KiB");
  assert.equal(readableBytes(1048576), "1 MiB");
  assert.equal(readableBytes(262144000), "250 MiB");
  assert.equal(readableBytes(5368709120 - 1), "4.9 GiB");
  assert.equal(readableBytes(5368709120), "5 GiB");
  // A size refused for crossing a limit rounds the other way, so it never reads as the limit.
  assert.equal(readableBytes(262144000 + 1, "up"), "251 MiB");
  assert.equal(readableBytes(262144000, "up"), "250 MiB");
  assert.equal(readableBytes(1048576 * 9.01, "up"), "9.1 MiB");
  assert.deepEqual(accountAllowance({ malformed: { used: Number.MAX_SAFE_INTEGER + 1, max: 5 } }), {});
});

test("a build over the size limit names its heaviest folders by their whole size, not by where the walk stopped", async () => {
  const { mkdtemp, mkdir, open, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { collectFiles } = await import("../src/files");
  const root = await mkdtemp(join(tmpdir(), "og-size-"));
  try {
    // Sparse files: their size is real to lstat and costs no disk. Each is under
    // bundle.fileBytesMax (1 GiB), so only the total is over. Sorted a to h, the walk
    // crosses 5 GiB inside g/, so a walk that stopped there would never have seen h/,
    // the heaviest.
    for (const [dir, mib] of [["a", 700], ["b", 700], ["c", 700], ["d", 700], ["e", 700], ["f", 800], ["g", 900], ["h", 1000]] as const) {
      await mkdir(join(root, dir));
      const handle = await open(join(root, dir, "blob.bin"), "w");
      await handle.truncate(mib * 1048576); await handle.close();
    }
    await assert.rejects(collectFiles(root), (error: Error & { code?: string }) =>
      error.code === "bundle_limit" && error.message.includes("The largest: h/ (1000 MiB), g/ (900 MiB), f/ (800 MiB).")
      && error.message.includes("6.1 GiB uncompressed, over the 5 GiB limit"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a build one byte over the size limit is not refused as the size of the limit", async () => {
  const { mkdtemp, open, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { collectFiles } = await import("../src/files");
  const { readableBytes } = await import("../src/bytes");
  const { LIMITS } = await import("@opengame/shared");
  const max = LIMITS.bundle.uncompressedBytesMax;
  const root = await mkdtemp(join(tmpdir(), "og-edge-"));
  try {
    // In files no bigger than one may be, so it is the total that is one byte over.
    const sizes = [];
    for (let left = max + 1; left > 0; left -= LIMITS.bundle.fileBytesMax) sizes.push(Math.min(left, LIMITS.bundle.fileBytesMax));
    for (const [index, size] of sizes.entries()) {
      const handle = await open(join(root, `blob${index}.bin`), "w");
      await handle.truncate(size); await handle.close();
    }
    await assert.rejects(collectFiles(root), (error: Error & { code?: string }) => {
      const said = /The build is (.+?) uncompressed, over the (.+?) limit/.exec(error.message);
      return error.code === "bundle_limit" && said !== null && said[2] === readableBytes(max) && said[1] !== said[2];
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("a recognised nested demo cannot hide a valid root game", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-root-game-"));
  try {
    await writeFile(join(root, "index.html"), '<canvas id="game"></canvas><script src="game.js"></script>');
    await writeFile(join(root, "game.js"), "document.querySelector('canvas').getContext('2d');");
    await mkdir(join(root, "demo"));
    await writeFile(join(root, "demo/index.html"), '<script src="game.js"></script>');
    await writeFile(join(root, "demo/game.js"), "new Phaser.Game({});");
    for (const pkg of [{}, { scripts: { build: "vite build" }, dependencies: { vite: "1" } }]) {
      await assert.rejects(detectBuildOutput(root, pkg), error => {
        assert.equal((error as { code: string }).code, "build_output_ambiguous");
        const message = /^Several build folders contain index\.html: (.+)\. Run opengame init --output <folder> to choose one\.$/.exec((error as Error).message);
        assert.ok(message, "ambiguity must name its candidate folders");
        // Directory enumeration order is not the contract; both candidates,
        // with neither missing nor duplicated, must be offered to the caller.
        assert.deepEqual(message[1]!.split(", ").sort(), [".", "demo"]);
        return true;
      });
      assert.equal((await detectBuildOutput(root, pkg, ".")).output, ".");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

// A starter copied out of the repository keeps `file:../../packages/sdk`, and npm leaves a
// symlink to nothing. The build used to die inside Rollup with the cause off screen. An SDK
// that is merely not installed is now one missing dependency among others, which deploy
// installs from the lockfile (tests/build-install.test.ts).
test("a build refuses an SDK that package.json names from a path no install can reach, and says how to get it", async () => {
  const { missingDependencies } = await import("../src/build-output");
  const root = await mkdtemp(join(tmpdir(), "og-sdk-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@opengamehq/sdk": "file:../../packages/sdk" } }));
    await writeFile(join(root, "package-lock.json"), "{}");
    await assert.rejects(missingDependencies(root), (error: { code: string; exitCode: number; message: string }) =>
      error.code === "build_failed" && error.exitCode === 1 && /exists only inside the OpenGame repository/.test(error.message)
      // How to get the SDK follows packages/shared/npm-release.json, and names no archive in either state.
      && (installsOpen(release) ? error.message.includes(`npm i ${release.packages.sdk}@latest`) : error.message.includes(INSTALL_CLOSED.sdk) && !/npm i|npm install/.test(error.message))
      && !/tarball|\.tgz|archive/.test(error.message));
    await mkdir(join(root, "vendor-sdk"));
    await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "@opengamehq/sdk": "file:./vendor-sdk" } }));
    const missing = await missingDependencies(root);
    assert.deepEqual([missing?.missing, missing?.install?.command, missing?.fresh], [["@opengamehq/sdk"], "npm ci", true]);
    await mkdir(join(root, "node_modules", "@opengamehq", "sdk"), { recursive: true });
    await writeFile(join(root, "node_modules", "@opengamehq", "sdk", "package.json"), '{"name":"@opengamehq/sdk","version":"0.1.0"}');
    assert.equal(await missingDependencies(root), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

/* The layout of a real Three.js game, 11 Nov 2026: `vite build` with no config, the game's
   page at the root loading /src/main.js, and a weapons lab tool page at
   src/weapons/lab/index.html. init wrote build.output src/weapons/lab, because the root was
   dropped as Vite's input and the lab was the only index.html left. */
test("a page under src/ in a Vite game is source, not the export, and init writes dist", async () => {
  const { initProject } = await import("../src/init");
  const root = await mkdtemp(join(tmpdir(), "og-vite-nested-"));
  try {
    const pkg = { name: "karen", type: "module", scripts: { build: "vite build" }, dependencies: { three: "^0.186.1" }, devDependencies: { vite: "^8.3.4" } };
    await writeFile(join(root, "package.json"), JSON.stringify(pkg));
    await writeFile(join(root, "package-lock.json"), "{}");
    await writeFile(join(root, "index.html"), '<!doctype html><title>Karen</title><canvas></canvas><script type="module" src="/src/main.js"></script>');
    await mkdir(join(root, "src/weapons/lab"), { recursive: true });
    await writeFile(join(root, "src/main.js"), "import * as THREE from 'three'; addEventListener('keydown', () => {});");
    await writeFile(join(root, "src/weapons/lab/index.html"), '<!doctype html><title>weapons lab</title><script type="module" src="./lab.js"></script>');
    await writeFile(join(root, "src/weapons/lab/lab.js"), "import * as THREE from 'three';");
    await mkdir(join(root, "public"));
    assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
    // Built once, dist is still the answer, and the lab still is not.
    await mkdir(join(root, "dist/assets"), { recursive: true });
    await writeFile(join(root, "dist/index.html"), '<script type="module" crossorigin src="/assets/index-abc.js"></script>');
    assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
    await rm(join(root, "dist"), { recursive: true });
    // A vite.config's build.outDir is read, and the nested page still does not win.
    await writeFile(join(root, "vite.config.js"), 'export default { build: { outDir: "web-build" } };');
    assert.equal((await detectBuildOutput(root, pkg)).output, "web-build");
    await rm(join(root, "vite.config.js"));
    const result = await initProject(root, { title: "Karen", description: "A long enough description of a first-person game about weapons." });
    assert.equal(result.manifest.build?.output, "dist");
    assert.match(result.message, /export folder to dist\//);
    assert.doesNotMatch(result.message, /src\/weapons\/lab/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

/* Two layouts init read correctly at 88a2c24db and then got wrong (review, 11 Nov 2026): a
   build script that moves Vite's output to docs/, whose built page loads a hashed module from
   assets/, and esbuild bundling into src/ beside the page there. */
test("Vite output moved by the build script, and esbuild writing into src/, are still the exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-moved-output-"));
  try {
    const vite = { scripts: { build: "vite build && rm -rf docs && mv dist docs" }, devDependencies: { vite: "5" } };
    await writeFile(join(root, "index.html"), '<script type="module" src="/src/main.js"></script>');
    await mkdir(join(root, "src")); await writeFile(join(root, "src/main.js"), "export {};");
    await mkdir(join(root, "docs/assets"), { recursive: true });
    await writeFile(join(root, "docs/index.html"), '<script type="module" crossorigin src="/assets/index-BqT3x9aZ.js"></script>');
    await writeFile(join(root, "docs/assets/index-BqT3x9aZ.js"), "console.log(1);");
    assert.equal((await detectBuildOutput(root, vite)).output, "docs");
  } finally { await rm(root, { recursive: true, force: true }); }
  const esbuild = await mkdtemp(join(tmpdir(), "og-esbuild-src-"));
  try {
    await mkdir(join(esbuild, "src"));
    await writeFile(join(esbuild, "src/index.html"), '<script src="bundle.js"></script>');
    await writeFile(join(esbuild, "src/game.js"), "export {};");
    const pkg = { scripts: { build: "esbuild src/game.js --bundle --outfile=src/bundle.js" }, devDependencies: { esbuild: "0.24" } };
    assert.equal((await detectBuildOutput(esbuild, pkg)).output, "src");
    // webpack and rollup are not read either, so their src/ page stands too.
    assert.equal((await detectBuildOutput(esbuild, { scripts: { build: "webpack" }, devDependencies: { webpack: "5" } })).output, "src");
    // parcel names its output on the command line, so there src/ is its input.
    assert.equal((await detectBuildOutput(esbuild, { scripts: { build: "parcel build src/index.html --dist-dir out" }, devDependencies: { parcel: "2" } })).output, "out");
    assert.equal((await detectBuildOutput(esbuild, {})).output, "src");
  } finally { await rm(esbuild, { recursive: true, force: true }); }
});

test("one file past the per-file limit is refused by name before anything is packed", async () => {
  const { mkdtemp, open, rm, writeFile: write } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { collectFiles } = await import("../src/files");
  const { LIMITS } = await import("@opengame/shared");
  const root = await mkdtemp(join(tmpdir(), "og-file-"));
  try {
    await write(join(root, "index.html"), "<!doctype html>");
    const at = await open(join(root, "at-limit.bin"), "w");
    await at.truncate(LIMITS.bundle.fileBytesMax); await at.close();
    assert.equal((await collectFiles(root)).files.length, 2);
    const over = await open(join(root, "over.bin"), "w");
    await over.truncate(LIMITS.bundle.fileBytesMax + 1); await over.close();
    await assert.rejects(collectFiles(root), (error: Error & { code?: string }) =>
      error.code === "bundle_limit" && /^over\.bin is [\d.]+ GiB, and one file can be at most 1 GiB\./.test(error.message));
  } finally { await rm(root, { recursive: true, force: true }); }
});

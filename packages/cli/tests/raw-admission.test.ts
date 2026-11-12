import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, realpath, readFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { createArchive } from "../src/archive";
import { runPreflight, snapshotPreflightFiles, matchedRawRuntime } from "../src/preflight";
import { devSnapshot } from "../src/dev";
import { vendorCommand } from "../src/vendor";
import { Output } from "../src/output";
import { initProject } from "../src/init";
import { loadManifest } from "../src/files";
import { manifest, tempDir, spawnCli } from "./shell";
import { rawMovie, rawDos } from "./raw-fixtures";
import { runtimeFixture } from "./runtime-fixtures";

const silent = () => new Output(true, () => {});

test("ordinary worker receives binary bytes and admits parsed SWF/CWS/jsdos without an HTML entry", async () => {
  for (const [name, bytes, engine] of [["original.swf", rawMovie(), "ruffle"], ["compressed.swf", rawMovie(true), "ruffle"], ["original.jsdos", rawDos(), "jsdos"]] as const) {
    const snapshot = new Map([[name, bytes]]);
    const result = await runPreflight(snapshotPreflightFiles(snapshot));
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.hasEntryPoint, false);
    assert.deepEqual(result.include, [name]);
    const raw = matchedRawRuntime(result, snapshot);
    assert.equal(raw?.engine, engine);
    assert.equal(raw?.path, name);
    assert.equal(raw?.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(raw?.bytes, bytes.byteLength);
    assert.equal(result.checks.engine, "inconclusive");
    assert.equal(result.checks.secrets, "inconclusive", "raw admission is not a content safety verdict");
  }
});

test("matching requires eligible parser evidence over the same included bytes, never a suffix alone", async () => {
  const bytes = rawMovie(), snapshot = new Map([["title.swf", bytes]]);
  const result = await runPreflight(snapshotPreflightFiles(snapshot));
  assert.ok(matchedRawRuntime(result, snapshot));
  const raw = result.rawRuntimes![0]!;
  for (const patch of [{ complete: false }, { manualReviewRequired: true }, { bytes: bytes.length + 1 }, { sha256: "0".repeat(64) }, { path: "renamed.swf" }]) {
    assert.equal(matchedRawRuntime({ ...result, rawRuntimes: [{ ...raw, ...patch }] }, snapshot), undefined);
  }
  assert.equal(matchedRawRuntime({ ...result, rawRuntimes: [] }, snapshot), undefined);
  assert.equal(matchedRawRuntime({ ...result, rawRuntimes: [raw, raw] }, snapshot), undefined);
  assert.equal(matchedRawRuntime({ ...result, include: [] }, snapshot), undefined);
  assert.equal(matchedRawRuntime({ ...result, hasEntryPoint: true }, snapshot), undefined);
  assert.equal(matchedRawRuntime(result, new Map([...snapshot, ["index.html", Buffer.from("existing page")]])), undefined);
  const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
  assert.equal(matchedRawRuntime(result, new Map([["title.swf", changed]])), undefined);
  const noBytes = await runPreflight([{ path: "title.swf", size: bytes.length, text: async () => bytes.toString("utf8") }]);
  assert.equal(noBytes.ok, false, "a byte reader is required for parser admission");
});

test("ordinary archive packages the original raw path/bytes and records source evidence without a shell", async () => {
  for (const [name, payload] of [["My Game.swf", rawMovie(true)], ["My Game.jsdos", rawDos()]] as const) {
    const fixture = await tempDir("og-raw-archive-");
    try {
      await writeFile(join(fixture.dir, name), payload);
      const archive = await createArchive(fixture.dir, manifest, silent()); const packedBytes = readFileSync(archive.file);
      const files = unzipSync(packedBytes);
      assert.deepEqual(Object.keys(files), [name]);
      assert.deepEqual(Buffer.from(files[name]!), payload);
      assert.equal(archive.packaging.rawRuntimes?.[0]?.path, name);
      assert.equal(archive.packaging.rawRuntimes?.[0]?.sha256, createHash("sha256").update(payload).digest("hex"));
      assert.equal(archive.packaging.files[0]?.originalPath, name);
    } finally { await fixture.remove(); }
  }
});

test("invalid or renamed compressed payloads never obtain no-index admission from a manifest", async () => {
  for (const [name, payload] of [["fake.swf", Buffer.from("not a movie")], ["fake.jsdos", Buffer.from("not a DOS bundle")], ["renamed.bin", rawMovie(true)]] as const) {
    const fixture = await tempDir("og-raw-invalid-");
    try {
      await writeFile(join(fixture.dir, name), payload);
      await initProject(fixture.dir, { title: manifest.title, description: manifest.description, genre: manifest.genre,
        engine: name.endsWith(".jsdos") ? "jsdos" : "ruffle" });
      const configured = await loadManifest(fixture.dir);
      await assert.rejects(createArchive(fixture.dir, configured, silent()), { code: "check_failed" });
    } finally { await fixture.remove(); }
  }
});

test("vendor preserves admitted raw payload while deriving the reviewed canonical shell", async () => {
  const fixture = await tempDir("og-raw-vendor-");
  try {
    const root = await realpath(fixture.dir), payload = rawMovie();
    await writeFile(join(root, "title.swf"), payload);
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, sdk: { inject: false } }));
    await vendorCommand(root, { output: ".opengame/raw" }, silent(), { artifacts: runtimeFixture() });
    assert.deepEqual(await readFile(join(root, ".opengame/raw/title.swf")), payload);
    assert.match(await readFile(join(root, ".opengame/raw/index.html"), "utf8"), /title.swf/);
    assert.equal((await devSnapshot(root)).has("title.swf"), true);
  } finally { await fixture.remove(); }
});


test("bundled check and dry-run accept a parsed raw export through the ordinary CLI route", async () => {
  const fixture = await tempDir("og-raw-cli-");
  try {
    const bytes = rawMovie(true);
    await writeFile(join(fixture.dir, "original-title.swf"), bytes);
    await initProject(fixture.dir, { title: manifest.title, description: manifest.description, genre: manifest.genre, engine: "ruffle" });
    for (const args of [["check", fixture.dir, "--json"], ["deploy", fixture.dir, "--dry-run", "--json"]]) {
      const run = await spawnCli(args);
      assert.equal(run.code, 0, run.stdout + run.stderr);
      const result = JSON.parse(run.stdout);
      assert.equal(result.type, "result");
      const raw = result.data.packaging.rawRuntimes[0];
      assert.equal(raw.path, "original-title.swf");
      assert.equal(raw.sha256, createHash("sha256").update(bytes).digest("hex"));
      assert.equal(raw.complete, true);
      assert.equal(raw.manualReviewRequired, false);
    }
    await assert.rejects(readFile(join(fixture.dir, "index.html")), { code: "ENOENT" });
  } finally { await fixture.remove(); }
});

test('failed compressed decoder with raw payload never invokes raw inflation', async () => {
  const { preflight } = await import('../../preflight/src/index');
  let rawInflations = 0;
  const movie = rawMovie(true);
  const result = await preflight([
    { path: 'movie.swf', size: movie.length, text: async () => '', bytes: async () => movie },
    { path: 'game.data.gz', size: 8, text: async () => '', bytes: async () => new Uint8Array(8),
      decodedText: Object.assign(async () => { throw new Error('bad gzip'); }, { decodedByteLength: () => undefined }) },
  ], { rawInflater: async () => { rawInflations++; throw new Error('must not inflate raw after a failed decoder'); } });
  assert.equal(rawInflations, 0);
  assert.ok(result.findings.some(row => row.code === 'engine_archive_byte_limit'));
});

test('mixed compressed and raw admission shares the exact measured decoded-byte budget', async () => {
  const { preflight } = await import('../../preflight/src/index');
  const { LIMITS } = await import('@opengame/shared');
  const movie = rawMovie(true);
  let rawInflations = 0;
  const result = await preflight([
    { path: 'movie.swf', size: movie.length, text: async () => '', bytes: async () => movie },
    { path: 'game.data.gz', size: 8, text: async () => '', bytes: async () => new Uint8Array(8),
      decodedText: Object.assign(async () => 'measured output', { decodedByteLength: () => LIMITS.bundle.uncompressedBytesMax }) },
  ], { rawInflater: async () => { rawInflations++; throw new Error('no allocation remains'); } });
  assert.equal(rawInflations, 0);
  assert.ok(result.findings.some(row => row.code === 'engine_archive_byte_limit'));
});

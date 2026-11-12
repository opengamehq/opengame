import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { archiveDigest, readArchiveRange, type PackedArchive } from "../src/archive";
import { uploadArchiveParts } from "../src/archive-parts";
import { Output } from "../src/output";

/**
 * Big builds, packaged and sent without holding them in memory (11 Nov 2026, for 25,000
 * files and 5 GB). Until then the CLI kept every file of the build in a Map and built the
 * archive as one buffer beside it, so a build cost about twice its size in memory.
 *
 * The first test packs a synthetic build of a few hundred megabytes in a process of its
 * own and reads that process's peak resident memory. Held in memory the old way, the peak
 * is past the build's size; staged and streamed, it is the runtime plus a few slices. The
 * build is written under TMPDIR, which on the fleet workers is local disk.
 */

const run = promisify(execFile);
const fixture = fileURLToPath(new URL("./fixtures/pack-memory.ts", import.meta.url));
const MiB = 1024 * 1024;

async function fill(path: string, bytes: number) {
  const handle = await open(path, "w");
  try {
    // Random, so deflate cannot shrink it, in slices so the test itself stays small.
    for (let written = 0; written < bytes; written += 8 * MiB) await handle.write(randomBytes(Math.min(8 * MiB, bytes - written)));
  } finally { await handle.close(); }
}

test("packing a build several hundred megabytes large holds a few slices of it, not the build", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-big-build-"));
  const work = await mkdtemp(join(tmpdir(), "og-big-work-"));
  try {
    await writeFile(join(root, "index.html"), '<!doctype html><script src="game.js"></script>');
    await writeFile(join(root, "game.js"), "document.body.textContent = 'Play';");
    await mkdir(join(root, "levels"));
    for (let index = 0; index < 10; index++) await fill(join(root, "levels", `l${index}.bin`), 24 * MiB);
    await mkdir(join(root, "textures"));
    for (let index = 0; index < 40; index++) await fill(join(root, "textures", `t${index}.bin`), 2 * MiB);
    await mkdir(join(root, "small"));
    for (let index = 0; index < 1500; index++) await writeFile(join(root, "small", `${index}.json`), JSON.stringify({ index, pad: "x".repeat(index % 700) }));
    const buildBytes = 10 * 24 * MiB + 40 * 2 * MiB;
    const { stdout } = await run(process.execPath, ["--import", "tsx", fixture, root, work], { maxBuffer: 1 << 20, env: { ...process.env, OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1" } });
    const measured = JSON.parse(stdout.trim().split("\n").at(-1)!) as { before: number; peak: number; file: string; byteSize: number; sha256: string; fileCount: number };
    const grew = measured.peak - measured.before;
    // The build is 320 MiB. Held in memory, as before 11 Nov 2026, it grew this process
    // by 2,264 MiB (measured that day with master's src): the snapshot, the
    // checker's copies and the archive. Staged and streamed it grew 120 to 145 MiB, which
    // is the checker's worker and the one file it reads whole at a time (24 MiB here).
    assert.ok(grew < 200 * MiB, `packaging grew resident memory by ${Math.round(grew / MiB)} MiB for a ${Math.round(buildBytes / MiB)} MiB build`);
    assert.equal(measured.fileCount, 2 + 10 + 40 + 1500);
    assert.ok(measured.byteSize > buildBytes, "random bytes are stored, so the archive is at least the build");
    // The archive on disk is the one reported, and the snapshot folder is gone.
    const digest = createHash("sha256");
    const handle = await open(measured.file);
    try { for await (const chunk of handle.createReadStream()) digest.update(chunk as Buffer); } finally { await handle.close().catch(() => {}); }
    assert.equal(digest.digest("hex"), measured.sha256);
    assert.deepEqual((await readdir(work)).filter(name => name.startsWith("snapshot-")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(work, { recursive: true, force: true });
  }
});

test("a streamed archive unpacks to the build, and packing the same build twice gives the same bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-stream-build-"));
  const work = await mkdtemp(join(tmpdir(), "og-stream-work-"));
  try {
    const files: Record<string, Buffer> = {
      "index.html": Buffer.from('<!doctype html><script src="game.js"></script>'),
      "game.js": Buffer.from("document.body.textContent = 'Play';\n".repeat(50_000)),
      "art/sky.png": randomBytes(3 * MiB + 17),
      "data/empty.txt": Buffer.alloc(0),
    };
    for (const [path, bytes] of Object.entries(files)) { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), bytes); }
    const pack = async () => JSON.parse((await run(process.execPath, ["--import", "tsx", fixture, root, work], { env: { ...process.env, OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1" } })).stdout.trim().split("\n").at(-1)!) as { file: string; sha256: string; byteSize: number };
    const first = await pack(), second = await pack();
    assert.equal(first.sha256, second.sha256);
    const { readFile } = await import("node:fs/promises");
    const tree = unzipSync(await readFile(first.file));
    assert.deepEqual(Object.keys(tree).sort(), Object.keys(files).sort());
    for (const [path, bytes] of Object.entries(files)) assert.deepEqual(Buffer.from(tree[path]!), bytes, path);
    // Scripts are deflated; the picture is stored.
    assert.ok(first.byteSize < files["game.js"]!.byteLength + files["art/sky.png"]!.byteLength);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(work, { recursive: true, force: true });
  }
});

/** An archive file of `size` random bytes, with the digests packaging would have taken. */
async function packed(size: number): Promise<PackedArchive> {
  const directory = await mkdtemp(join(tmpdir(), "og-packed-"));
  const file = join(directory, "archive.zip");
  const bytes = randomBytes(size);
  await writeFile(file, bytes);
  const digest = archiveDigest();
  for (let at = 0; at < size; at += 777_777) digest.update(bytes.subarray(at, at + 777_777));
  const { sha256, blocks } = digest.finish();
  assert.equal(sha256, createHash("sha256").update(bytes).digest("hex"));
  return { file, byteSize: size, sha256, blocks };
}

test("a part is read from the archive file when its turn comes, and a resumed upload reads only the parts it sends", async () => {
  const PART = 5 * MiB;
  const archive = await packed(3 * PART + 1234);
  const reads: [number, number][] = [];
  const source = { byteLength: archive.byteSize, read: async (offset: number, length: number) => { reads.push([offset, length]); return readArchiveRange(archive, offset, length); } };
  const held = new Map<number, Buffer>();
  const sent: number[] = [];
  const descriptor = () => ({ byteSize: archive.byteSize, partBytes: PART, partCount: 4, uploadedParts: [...held.keys()].sort(), partsUrl: "/api/v1/operations/op/upload/parts" });
  const api = {
    async json(path: string, init: { body?: { parts?: number[] } }) {
      if (path.endsWith("/upload/parts")) {
        const part = init.body!.parts![0]!;
        const size = part < 4 ? PART : archive.byteSize - 3 * PART;
        return { parts: [{ partNumber: part, url: `https://storage.example/${part}`, headers: { "content-length": String(size) }, expiresInSeconds: 600 }] };
      }
      return { multipart: descriptor() };
    },
    async uploadPart(signed: { partNumber: number }, bytes: Uint8Array) { sent.push(signed.partNumber); held.set(signed.partNumber, Buffer.from(bytes)); },
  };
  try {
    // The first run had already landed parts 1 and 3; the server says so in its descriptor.
    const { readFile } = await import("node:fs/promises");
    const whole = await readFile(archive.file);
    held.set(1, whole.subarray(0, PART)); held.set(3, whole.subarray(2 * PART, 3 * PART));
    assert.equal(await uploadArchiveParts(api as never, "token", "op", source, descriptor(), new Output(true, () => {})), "uploaded");
    assert.deepEqual(sent.sort(), [2, 4]);
    assert.deepEqual(reads.sort((a, b) => a[0] - b[0]), [[PART, PART], [3 * PART, archive.byteSize - 3 * PART]]);
    assert.deepEqual(Buffer.concat([1, 2, 3, 4].map(part => held.get(part)!)), whole);
  } finally { await rm(join(archive.file, ".."), { recursive: true, force: true }); }
});

test("an archive changed on disk after packaging stops the upload instead of sending unchecked bytes", async () => {
  const archive = await packed(3 * MiB + 5);
  try {
    assert.equal((await readArchiveRange(archive, MiB + 3, 10)).byteLength, 10);
    const handle = await open(archive.file, "r+");
    try { await handle.write(Buffer.from([1, 2, 3]), 0, 3, 2 * MiB + 100); } finally { await handle.close(); }
    // The first block is untouched and still reads; the changed one is refused.
    assert.equal((await readArchiveRange(archive, 0, 100)).byteLength, 100);
    await assert.rejects(readArchiveRange(archive, 2 * MiB, 200), { code: "archive_unavailable" });
    await assert.rejects(readArchiveRange(archive, MiB, 2 * MiB), { code: "archive_unavailable" });
  } finally { await rm(join(archive.file, ".."), { recursive: true, force: true }); }
});

test("a build past the file route goes file by file through large-game-v1 when the server allows it, and as an archive when it cannot", async () => {
  const { prepareDeploy } = await import("../src/deploy");
  const { LIMITS } = await import("@opengame/shared");
  const root = await mkdtemp(join(tmpdir(), "og-auto-assets-"));
  const work = await mkdtemp(join(tmpdir(), "og-auto-work-"));
  const limit = LIMITS.platform.incrementalUpload.archiveBytesMax;
  const events: Record<string, unknown>[] = [];
  const output = new Output("jsonl", line => events.push(JSON.parse(line)));
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] }));
    await writeFile(join(root, "index.html"), '<!doctype html><script src="game.js"></script>');
    await writeFile(join(root, "game.js"), "document.body.textContent = 'Play';");
    for (let index = 0; index < 3; index++) await fill(join(root, `level${index}.bin`), 2 * MiB);
    // The real route takes 200 MiB; this build is 6 MiB, so the route is made smaller.
    (LIMITS.platform.incrementalUpload as { archiveBytesMax: number }).archiveBytesMax = 4 * MiB;
    const auto = await prepareDeploy(root, output, false, { autoAssets: true, incremental: true, workDirectory: work });
    assert.equal(auto.archive.unityAssets?.delivery, "large-game-v1");
    assert.deepEqual(auto.archive.unityAssets.assets.map(file => file.path).sort(), ["level0.bin", "level1.bin", "level2.bin"]);
    assert.ok(events.some(event => event.code === "external_assets_chosen"));
    await auto.archive.dispose();
    // Without the server's word, the same build is one archive, as before.
    const plain = await prepareDeploy(root, output, false, { incremental: true, workDirectory: work });
    assert.equal(plain.archive.unityAssets, undefined);
    assert.equal(plain.archive.incremental, null);
    await plain.archive.dispose();
    // A build whose bulk is code cannot leave the boot set, so the chosen plan falls back.
    await rm(join(root, "level0.bin")); await rm(join(root, "level1.bin")); await rm(join(root, "level2.bin"));
    await writeFile(join(root, "bulk.js"), "// " + "x".repeat(6 * MiB));
    const fallback = await prepareDeploy(root, output, false, { autoAssets: true, incremental: true, workDirectory: work });
    assert.equal(fallback.archive.unityAssets, undefined);
    assert.ok(events.some(event => event.code === "external_assets_fallback"));
    await fallback.archive.dispose();
  } finally {
    (LIMITS.platform.incrementalUpload as { archiveBytesMax: number }).archiveBytesMax = limit;
    await rm(root, { recursive: true, force: true });
    await rm(work, { recursive: true, force: true });
  }
});

/* Review of mirror #7, 12 Nov 2026: a plan deploy chose for itself has to fall back on every
   refusal that is about the plan, not only the ones the first version named. The large-game
   plan refuses a Kaigen export for its own lane, and it hashes through the Python helper,
   which Windows and some machines do not have. Either way the build used to deploy as one
   archive, and the chosen plan stopped it before upload. */
test("a big build deploy chose to send file by file goes as an archive when the plan refuses its engine or Python is missing", async () => {
  const { prepareDeploy } = await import("../src/deploy");
  const { PYTHON_CANDIDATES } = await import("../src/safe-fs");
  const { LIMITS } = await import("@opengame/shared");
  const { readFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "og-auto-refused-"));
  const work = await mkdtemp(join(tmpdir(), "og-auto-refused-work-"));
  const limit = LIMITS.platform.incrementalUpload.archiveBytesMax;
  const events: Record<string, unknown>[] = [];
  const output = new Output("jsonl", line => events.push(JSON.parse(line)));
  const kaigen = (JSON.parse(await readFile(new URL("../../preflight/tests/fixtures/engine-signatures.json", import.meta.url), "utf8")) as
    { id: string; text: string; wasm?: { base64: string }[] }[]).find(row => row.id === "kaigen" && row.wasm)!;
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] }));
    await writeFile(join(root, "index.html"), '<!doctype html><canvas id="c"></canvas><script type="module">import { createGame } from "./main.js";'
      + 'createGame({ canvas: c, wasmUrl: new URL("game.wasm", location.href).href });</script>');
    await writeFile(join(root, "main.js"), 'export function createGame(e){return new Worker(new URL("./main_worker.js",import.meta.url),{type:"module"})}');
    await writeFile(join(root, "main_worker.js"), kaigen.text);
    await writeFile(join(root, "game.wasm"), Buffer.from(kaigen.wasm![0]!.base64, "base64"));
    await mkdir(join(root, "cooked"));
    for (let index = 0; index < 3; index++) await fill(join(root, "cooked", `chunk${index}.bin`), 2 * MiB);
    (LIMITS.platform.incrementalUpload as { archiveBytesMax: number }).archiveBytesMax = 4 * MiB;
    const refused = await prepareDeploy(root, output, false, { autoAssets: true, incremental: true, workDirectory: work });
    assert.equal(refused.archive.unityAssets, undefined);
    assert.ok(events.some(event => event.code === "external_assets_fallback"), JSON.stringify(events.filter(event => event.type !== "progress")));
    await refused.archive.dispose();

    // The same deploy on a machine with no Python never chooses the plan at all.
    await rm(join(root, "game.wasm")); await rm(join(root, "main_worker.js"));
    await writeFile(join(root, "index.html"), '<!doctype html><script src="game.js"></script>');
    await writeFile(join(root, "game.js"), "document.body.textContent = 'Play';");
    await rm(join(root, "main.js"));
    events.length = 0;
    const before = PYTHON_CANDIDATES.splice(0);
    try {
      PYTHON_CANDIDATES.push(join(root, "no-python-here/python3"));
      const noPython = await prepareDeploy(root, output, false, { autoAssets: true, incremental: true, workDirectory: work });
      assert.equal(noPython.archive.unityAssets, undefined);
      assert.ok(!events.some(event => event.code === "external_assets_chosen"));
      await noPython.archive.dispose();
    } finally { PYTHON_CANDIDATES.splice(0, PYTHON_CANDIDATES.length, ...before); }
  } finally {
    (LIMITS.platform.incrementalUpload as { archiveBytesMax: number }).archiveBytesMax = limit;
    await rm(root, { recursive: true, force: true });
    await rm(work, { recursive: true, force: true });
  }
});

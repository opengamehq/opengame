// The Kaigen lane through the CLI: one asset-plan reader for every plan kind, with
// --unity-assets kept as the Unity spelling of --external-assets.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink, chmod, readFile, open } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { PYTHON_CANDIDATES } from "../src/safe-fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { gunzipSync } from "node:zlib";
import { LIMITS } from "@opengame/shared";
import { compareAssetPaths, largeAssetPlan } from "@opengame/shared/large-assets";
import { largeAssetStatement } from "@opengame/shared/large-asset-statement";
import { incrementalArchiveBytes } from "@opengame/protocol";
import { acceptedStatement, assetPlanNotices, assetPlanSummary, autoSplitAssets, parseAssetPlan, parseUnityAssetPlan, readUnityAssetPlan } from "../src/unity-assets";
import { assetPlanFlag } from "../src/deploy";
import { Api, encodeJsonBody } from "../src/http";
import { canonicalArchive, uploadMissingFiles } from "../src/incremental";
import { Output } from "../src/output";

const KAIGEN = "kaigen-assets-v1";

async function temporary(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "og-external-assets-")));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("a plan names its kind, and --unity-assets takes Unity's only", () => {
  const plan = { delivery: KAIGEN, assets: ["cooked/b.hza", "cooked/a.qoa", "oc_heads/"] };
  assert.deepEqual(parseAssetPlan(plan, false), { delivery: KAIGEN, paths: ["cooked/a.qoa", "cooked/b.hza"], folders: ["oc_heads"] });
  assert.throws(() => parseAssetPlan(plan, true), { code: "unity_assets_plan" });
  assert.throws(() => parseAssetPlan({ delivery: "horizon-assets-v1", assets: ["a.hza"] }, false), { code: "unity_assets_plan" });
  for (const path of ["main.js", "game.wasm", "game.wasm.br", "cooked/a.svg", "index.html", "_og/"]) {
    assert.throws(() => parseAssetPlan({ delivery: KAIGEN, assets: [path] }, false), { code: "unity_assets_plan" }, path);
  }
  // Unity's plan is unchanged, folders included: it never took them.
  assert.deepEqual(parseUnityAssetPlan({ assets: ["Build/game.data"] }), ["Build/game.data"]);
  assert.throws(() => parseUnityAssetPlan({ assets: ["StreamingAssets/"] }), { code: "unity_assets_plan" });
  assert.deepEqual(assetPlanFlag({ "unity-assets": "u.json" }), { plan: "u.json", unityOnly: true });
  assert.deepEqual(assetPlanFlag({ "external-assets": "k.json" }), { plan: "k.json", unityOnly: false });
  assert.throws(() => assetPlanFlag({ "external-assets": "k.json", "unity-assets": "u.json" }), { code: "conflicting_flags" });
});

test("a folder takes every eligible file beneath it and leaves code in the boot archive", async () => temporary(async root => {
  await mkdir(join(root, "cooked/world"), { recursive: true });
  await mkdir(join(root, "oc_heads"), { recursive: true });
  for (const [path, body] of [["cooked/catalog.hza", "c"], ["cooked/catalog.index", "i"], ["cooked/world/a.page000.hza", "a"],
    ["cooked/world/t_bc7.ktx", "t"], ["cooked/world/hit.qoa", "q"], ["cooked/world/loader.js", "j"], ["oc_heads/0a.glb.gz", "g"],
    ["index.html", "<canvas>"]] as const) await writeFile(join(root, path), body);
  await writeFile(join(root, "plan.json"), JSON.stringify({ delivery: KAIGEN, assets: ["cooked/", "oc_heads/"] }));
  const plan = await readUnityAssetPlan(root, root, "plan.json", { unityOnly: false });
  assert.equal(plan.delivery, KAIGEN);
  assert.deepEqual(plan.assets.map(row => row.path), ["cooked/catalog.hza", "cooked/world/a.page000.hza", "cooked/world/hit.qoa",
    "cooked/world/t_bc7.ktx", "oc_heads/0a.glb.gz"]);
  await symlink(join(root, "index.html"), join(root, "cooked/world/linked.hza"));
  await assert.rejects(readUnityAssetPlan(root, root, "plan.json", { unityOnly: false }), { code: "symlink" });
}));

test("a Kaigen plan is refused until the statement's current version is accepted", () => {
  const statement = largeAssetStatement(KAIGEN)!;
  assert.match(statement.statement, /Kaigen agreement permits me to publish/);
  assert.throws(() => acceptedStatement(KAIGEN, undefined), (error: Error & { code?: string }) =>
    error.code === "large_asset_statement_required" && error.message.includes(statement.statement) && error.message.includes(statement.version));
  assert.throws(() => acceptedStatement(KAIGEN, "0".repeat(16)), { code: "large_asset_statement_required" });
  assert.deepEqual(acceptedStatement(KAIGEN, statement.version), { key: "kaigen_publication", version: statement.version });
  assert.equal(acceptedStatement("unity-assets-v1", undefined), undefined);
  assert.throws(() => acceptedStatement("unity-assets-v1", statement.version), { code: "invalid_flag" });
});

test("check prints a Kaigen plan's statement and its version, and a Unity plan's nothing extra", () => {
  const statement = largeAssetStatement(KAIGEN)!;
  const kaigen = assetPlanNotices(KAIGEN, 3).find(notice => notice.code === "large_asset_statement");
  assert.equal(kaigen?.version, statement.version);
  assert.ok(kaigen?.message.includes(statement.statement) && kaigen.message.includes(`--accept-statement ${statement.version}`));
  assert.deepEqual(assetPlanNotices("unity-assets-v1", 3).map(notice => notice.code), ["unity_assets_local_only"]);
});

/** Runs `run` with the helper's interpreter wrapped in one that records each launch, and
 * returns how many of those launches ran safe-fs.py (the probe that finds Python is not one). */
async function launches(root: string, run: () => Promise<void>) {
  const before = PYTHON_CANDIDATES.splice(0);
  const real = before.find(candidate => spawnSync(candidate, ["-c", "import os"]).status === 0);
  assert.ok(real, "this machine needs a working Python 3 at one of the fixed paths");
  // Beside the plan, outside the folders it names, and removed with the fixture.
  const log = join(root, "launches.log"), wrapper = join(root, "python3-wrapper");
  await writeFile(log, "");
  await writeFile(wrapper, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\nexec "${real}" "$@"\n`);
  await chmod(wrapper, 0o755);
  PYTHON_CANDIDATES.push(wrapper);
  try { await run(); } finally {
    PYTHON_CANDIDATES.splice(0, Infinity, ...before);
  }
  return (await readFile(log, "utf8")).split("\n").filter(line => line.includes("safe-fs.py")).length;
}

test("check's last line counts each half once, and does not repeat the notices above it", () => {
  // Area F, 1 Nov 2026: a one-asset plan read "hashed 1 selected assets" and then, as the
  // result, "hashed 1 assets" again, and a Kaigen plan printed its statement twice.
  const statement = largeAssetStatement(KAIGEN)!;
  assert.match(assetPlanNotices("unity-assets-v1", 1)[0]!.message, /hashed 1 selected asset\./);
  assert.match(assetPlanNotices("unity-assets-v1", 2)[0]!.message, /hashed 2 selected assets\./);
  assert.equal(assetPlanSummary(1, 1), "Ready to deploy: 1 file in the boot archive and 1 asset sent separately.");
  assert.equal(assetPlanSummary(1200, 3), "Ready to deploy: 1,200 files in the boot archive and 3 assets sent separately.");
  const kaigen = assetPlanSummary(4, 2, statement);
  assert.ok(kaigen.includes(`--accept-statement ${statement.version}`));
  assert.ok(!kaigen.includes(statement.statement), "the statement is printed once, by its notice");
  assert.ok(!kaigen.includes("hashed"), "the hashing is said once, by its notice");
});

test("a plan of many files is hashed by a few helper launches, not one per file, and reports progress", async () => temporary(async root => {
  await mkdir(join(root, "cooked/world"), { recursive: true });
  const files = new Map(Array.from({ length: 40 }, (_, index) => [`cooked/world/${String(index).padStart(2, "0")}.hza`, Buffer.from(`page ${index}`.repeat(index + 1))]));
  for (const [path, bytes] of files) await writeFile(join(root, path), bytes);
  await writeFile(join(root, "plan.json"), JSON.stringify({ delivery: KAIGEN, assets: ["cooked/"] }));
  const events: { type: string; stage?: string; message?: string; files?: number; totalFiles?: number; bytes?: number; total?: number }[] = [];
  let plan: Awaited<ReturnType<typeof readUnityAssetPlan>> | undefined;
  const count = await launches(root, async () => {
    plan = await readUnityAssetPlan(root, root, "plan.json", { unityOnly: false, output: new Output("jsonl", line => events.push(JSON.parse(line))) });
  });
  assert.deepEqual(plan!.assets, [...files].map(([path, bytes]) => ({ path, byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") })));
  // The plan file, then one job for the sizes and one for the hashes.
  assert.equal(count, 3);
  const progress = events.filter(event => event.type === "progress" && event.stage === "assets");
  const total = [...files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
  assert.ok(progress.length >= 2);
  assert.equal(new Set(progress.map(event => event.message)).size, 1, "one line that moves, not a line per batch");
  assert.match(progress[0]!.message!, /^Hashing 40 external assets/);
  assert.deepEqual(progress.map(({ files, totalFiles, bytes, total }) => ({ files, totalFiles, bytes, total })).at(-1), { files: 40, totalFiles: 40, bytes: total, total });
  assert.equal(progress[0]!.bytes, 0);
}));

test("a plan over its stored-byte limit is refused from sizes alone, before any file is hashed", async () => temporary(async root => {
  // Three sparse Unity files of 400 MiB: each within the 512 MiB file limit, 1.2 GiB together.
  for (const name of ["a.data", "b.data", "c.data"]) {
    const handle = await open(join(root, name), "w");
    try { await handle.truncate(400 * 1024 * 1024); } finally { await handle.close(); }
  }
  await writeFile(join(root, "plan.json"), JSON.stringify({ assets: ["a.data", "b.data", "c.data"] }));
  const count = await launches(root, () => assert.rejects(readUnityAssetPlan(root, root, "plan.json"), { code: "unity_assets_limit" }));
  // The plan file and the sizes job. A hash job would be a third.
  assert.equal(count, 2);
}));

const LARGE = "large-game-v1";
const MIN = largeAssetPlan(LARGE)!.autoSplit!.fileBytesMin;

/** A file of `size` bytes that costs no disk: the split reads sizes from lstat only. */
async function sparse(root: string, path: string, size: number) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  const handle = await open(join(root, path), "w");
  try { await handle.truncate(size); } finally { await handle.close(); }
}

test("auto is a large-game-v1 plan only, and an explicit list still works there", () => {
  assert.deepEqual(parseAssetPlan({ delivery: LARGE, assets: "auto" }, false), { delivery: LARGE, paths: [], folders: [], auto: true });
  assert.throws(() => parseAssetPlan({ delivery: KAIGEN, assets: "auto" }, false), { code: "unity_assets_plan" });
  assert.throws(() => parseAssetPlan({ assets: "auto" }, false), { code: "unity_assets_plan" });
  assert.throws(() => parseAssetPlan({ delivery: LARGE, assets: "auto" }, true), { code: "unity_assets_plan" });
  assert.throws(() => parseAssetPlan({ delivery: LARGE, assets: "everything" }, false), { code: "unity_assets_plan" });
  assert.deepEqual(parseAssetPlan({ delivery: LARGE, assets: ["main/zone.ff", "sound/"] }, false),
    { delivery: LARGE, paths: ["main/zone.ff"], folders: ["sound"] });
  for (const path of ["index.html", "game.js", "game.wasm", "style.css", "art.svg", "game.wasm.br"]) {
    assert.throws(() => parseAssetPlan({ delivery: LARGE, assets: [path] }, false), { code: "unity_assets_plan" }, path);
  }
});

/* The cover named in opengame.json used to be held in the boot archive too. Nothing uploads
   it any more (30 Oct 2026), so a picture in the export is chosen by its size like the rest,
   and naming one in opengame.json changes nothing about the plan. */
test("auto sends every eligible file of fileBytesMin or more, and never code or opengame.json", async () => temporary(async root => {
  await writeFile(join(root, "index.html"), "<canvas>");
  await writeFile(join(root, "opengame.json"), "{}");
  await sparse(root, "game.wasm", MIN * 3);
  await sparse(root, "game.js", MIN * 2);
  await sparse(root, "main/zone.ff", MIN);
  await sparse(root, "main/small.cfg", MIN - 1);
  await sparse(root, "sound/music.ogg", MIN * 4);
  await sparse(root, "cover.png", MIN * 2);
  await sparse(root, "mods/opengame.json", MIN * 2);
  await sparse(root, "node_modules/pkg/big.bin", MIN * 2);
  const chosen = await autoSplitAssets(root, LARGE);
  assert.deepEqual(chosen, ["cover.png", "main/zone.ff", "sound/music.ogg"]);
  // The same export gives the same plan, which is what lets a deploy resume.
  assert.deepEqual(await autoSplitAssets(root, LARGE), chosen);
  await writeFile(join(root, "plan.json"), JSON.stringify({ delivery: LARGE, assets: "auto" }));
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Zombies", cover: "cover.png" }));
  const plan = await readUnityAssetPlan(root, root, "plan.json", { unityOnly: false });
  assert.equal(plan.auto, true);
  assert.deepEqual(plan.assets.map(row => row.path), chosen);
  assert.equal(plan.assets.find(row => row.path === "main/zone.ff")!.sha256, createHash("sha256").update(Buffer.alloc(MIN)).digest("hex"));
  // --external-assets auto is the same plan with no file, and only where any kind is allowed.
  const flag = await readUnityAssetPlan(root, root, "auto", { unityOnly: false });
  assert.equal(flag.delivery, LARGE);
  assert.deepEqual(flag.assets, plan.assets);
  await assert.rejects(readUnityAssetPlan(root, root, "auto", { unityOnly: true }), { code: "unity_assets_plan" });
  await symlink(join(root, "index.html"), join(root, "main/linked.pak"));
  await assert.rejects(autoSplitAssets(root, LARGE), { code: "symlink" });
}));

test("auto moves the largest small files out, ties by path, until the boot archive fits its bytes", async () => temporary(async root => {
  await writeFile(join(root, "index.html"), "<canvas>");
  const count = Math.ceil(LIMITS.platform.incrementalUpload.archiveBytesMax / (MIN - 64)) + 5;
  const rows: { path: string; byteSize: number }[] = [];
  for (let index = 0; index < count; index++) {
    // Pairs of equal sizes, so the tie-break decides which of each pair goes first.
    const row = { path: `pages/p${String(count - index).padStart(4, "0")}.dat`, byteSize: MIN - 1 - Math.floor(index / 2) };
    rows.push(row); await sparse(root, row.path, row.byteSize);
  }
  const chosen = await autoSplitAssets(root, LARGE);
  const order = [...rows].sort((a, b) => b.byteSize - a.byteSize || compareAssetPaths(a.path, b.path));
  const expected = order.slice(0, chosen.length);
  assert.deepEqual(chosen, expected.map(row => row.path).sort(compareAssetPaths));
  const boot = [{ path: "index.html", byteSize: 8 }, ...order.slice(chosen.length)];
  assert.ok(incrementalArchiveBytes(boot) <= LIMITS.platform.incrementalUpload.archiveBytesMax);
  // One fewer would not have fitted: the split moves no more than it must.
  assert.ok(incrementalArchiveBytes([...boot, order[chosen.length - 1]!]) > LIMITS.platform.incrementalUpload.archiveBytesMax);
}));

test("auto moves files out until the boot archive fits its file count", async () => temporary(async root => {
  await writeFile(join(root, "index.html"), "<canvas>");
  const paths: string[] = [];
  for (let index = 0; index < LIMITS.bundle.fileCountMax + 10; index++) paths.push(`tiles/t${index}.bin`);
  await mkdir(join(root, "tiles"));
  await Promise.all(paths.map(path => writeFile(join(root, path), "x")));
  const chosen = await autoSplitAssets(root, LARGE);
  assert.deepEqual(chosen, [...paths].sort(compareAssetPaths).slice(0, 11));
}));

test("auto refuses an export whose code alone is over the boot limit, and names it", async () => temporary(async root => {
  await writeFile(join(root, "index.html"), "<canvas>");
  await sparse(root, "build/game.js", LIMITS.bundle.archiveBytesMax);
  await sparse(root, "data/level.pak", MIN * 5);
  await assert.rejects(autoSplitAssets(root, LARGE), (error: Error & { code?: string }) =>
    error.code === "archive_limit" && error.message.includes("build/game.js") && !error.message.includes("level.pak"));
  await rm(join(root, "build/game.js"));
  await sparse(root, "data/huge.pak", LIMITS.platform.largeGameAssets.fileBytesMax + 1);
  await assert.rejects(autoSplitAssets(root, LARGE), (error: Error & { code?: string }) =>
    error.code === "unity_assets_limit" && error.message.includes("data/huge.pak"));
  await rm(join(root, "data"), { recursive: true });
  await assert.rejects(autoSplitAssets(root, LARGE), { code: "unity_assets_plan" });
}));

test("the begin body is sent as it always was below bodyBytesMax, and gzipped above it", async () => {
  const limits = { sentMax: LIMITS.platform.incrementalUpload.bodyBytesMax, decodedMax: LIMITS.platform.incrementalUpload.assetPlanBodyBytesMax };
  const small = { delivery: LARGE, assets: [{ path: "a.pak", sha256: "0".repeat(64), byteSize: 1 }] };
  assert.deepEqual(encodeJsonBody(small, limits), { body: JSON.stringify(small) });
  // The lane's largest plan, with random digests (the part that does not compress).
  const assets = Array.from({ length: LIMITS.platform.largeGameAssets.fileCountMax }, (_, index) =>
    ({ path: `main/zone/sub${index % 97}/chunk_${String(index).padStart(5, "0")}.ff`, sha256: randomBytes(32).toString("hex"), byteSize: 1048576 + index }));
  const large = encodeJsonBody({ delivery: LARGE, assets }, limits);
  assert.equal(large.encoding, "gzip");
  assert.ok(Buffer.byteLength(JSON.stringify({ delivery: LARGE, assets })) > limits.sentMax);
  assert.ok(large.body.length <= limits.sentMax);
  assert.deepEqual(JSON.parse(gunzipSync(large.body as Buffer).toString("utf8")), { delivery: LARGE, assets });
  // Over the decoded cap, or still over the sent cap once compressed, is refused before sending.
  assert.throws(() => encodeJsonBody({ pad: "x".repeat(limits.decodedMax) }, limits), { code: "unity_assets_limit" });
  assert.throws(() => encodeJsonBody({ pad: randomBytes(limits.sentMax).toString("base64") }, limits), { code: "unity_assets_limit" });
});

test("Api.json sets Content-Encoding only on a gzipped body", async () => {
  const seen: { encoding?: string; body: Buffer }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    seen.push({ encoding: req.headers["content-encoding"] as string | undefined, body: Buffer.concat(chunks) });
    res.setHeader("content-type", "application/json"); res.end("{}");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as { port: number };
  const api = new Api(`http://127.0.0.1:${address.port}`);
  try {
    const gzip = { sentMax: 1024, decodedMax: 1 << 20 };
    await api.json("/api/v1/deploys/external-assets", { body: { pad: "a".repeat(100) }, gzip });
    await api.json("/api/v1/deploys/external-assets", { body: { pad: "a".repeat(4000) }, gzip });
    assert.equal(seen[0]!.encoding, undefined);
    assert.equal(JSON.parse(seen[0]!.body.toString()).pad.length, 100);
    assert.equal(seen[1]!.encoding, "gzip");
    assert.equal(JSON.parse(gunzipSync(seen[1]!.body).toString()).pad.length, 4000);
  } finally { await api.close(); server.close(); }
});

test("a file whose upload URL is near expiry asks for the page again before its PUT", async t => {
  // One file at a time, so each later file is reached after the one before it finished; with several in flight a page
  // this small is never old enough to expire.
  const upload = LIMITS.platform.incrementalUpload as { concurrency: number };
  const concurrency = upload.concurrency;
  upload.concurrency = 1;
  t.after(() => { upload.concurrency = concurrency; });
  const boot = canonicalArchive([["index.html", Buffer.from("<canvas>")]])!;
  const blobs = ["first", "second"].map(text => Buffer.from(text));
  const assets = blobs.map((bytes, index) => ({ path: `data/${index}.pak`, sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length }));
  const files = [...boot.files, ...assets];
  const totalBytes = files.reduce((sum, file) => sum + file.byteSize, 0);
  let signed = 0;
  // A TTL of a tenth of a second, so the first PUT outlives the second file's URL.
  const pageOf = (missing: typeof assets) => ({ delivery: LARGE, inputDigest: "identity", files: { missing: missing.map(file =>
    ({ sha256: file.sha256, byteSize: file.byteSize, upload: { url: `signed-${++signed}`, expiresInSeconds: 0.1 } })),
    reusedFiles: 0, reusedBytes: 0, totalFiles: files.length, totalBytes, nextCursor: null } });
  const first = pageOf([boot.files[0]!, ...assets] as typeof assets).files;
  const used: string[] = [];
  let refreshes = 0;
  const api = {
    uploadFile: async (upload: { url: string }) => { used.push(upload.url); await new Promise(resolve => setTimeout(resolve, 150)); },
    json: async (path: string) => {
      if (path.includes("?cursor=")) { refreshes++; return pageOf(assets.slice(used.length - 1)); }
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      const file = files.find(file => path.endsWith(file.sha256))!;
      return { file: { ...file, verified: true } };
    },
  } as unknown as Api;
  await uploadMissingFiles(api, "unused", "op", boot.bytes, files, first, new Output(true, () => {}),
    { route: "assets", delivery: LARGE, inputDigest: "identity", readFile: async file => blobs[assets.findIndex(row => row.path === file.path)]! });
  // Each later file was sent on a URL signed after the one before it finished, never a stale one.
  assert.equal(refreshes, 2);
  assert.deepEqual(used, ["signed-1", "signed-4", "signed-6"]);
});

test("a page asked for ahead ages from when it arrived, not from when its files are reached", async t => {
  // The next page is asked for while this one uploads, so its URLs are already ageing when the loop gets to it. Aged
  // from when the loop adopted it instead, a slow page before it sends its files on URLs that have run out, and each
  // spends an attempt and a backoff on a 403. Nothing failed with the arrival time dropped (R42, C1).
  const upload = LIMITS.platform.incrementalUpload as { concurrency: number };
  const concurrency = upload.concurrency;
  upload.concurrency = 1;
  t.after(() => { upload.concurrency = concurrency; });
  const boot = canonicalArchive([["index.html", Buffer.from("<canvas>")]])!;
  const bytes = Buffer.from("reached late");
  const asset = { path: "data/0.pak", sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length };
  const files = [...boot.files, asset];
  const totalBytes = files.reduce((sum, file) => sum + file.byteSize, 0);
  let signed = 0, reads = 0;
  const pageOf = (missing: typeof files, expiresInSeconds: number, nextCursor: number | null) => ({ delivery: LARGE, inputDigest: "identity",
    files: { missing: missing.map(file => ({ sha256: file.sha256, byteSize: file.byteSize, upload: { url: `signed-${++signed}`, expiresInSeconds } })),
      reusedFiles: 0, reusedBytes: 0, totalFiles: files.length, totalBytes, nextCursor } });
  // The first page's file has a minute and takes 250 ms to send. The second page, asked for while it sends, has URLs
  // that last a tenth of a second, so they are past nine tenths of that by the time the loop reaches them.
  const first = pageOf([boot.files[0]!], 60, 1).files;
  const used: string[] = [];
  const api = {
    uploadFile: async (upload: { url: string }) => { used.push(upload.url); if (used.length === 1) await new Promise(resolve => setTimeout(resolve, 250)); },
    json: async (path: string) => {
      if (path.includes("?cursor=1")) { reads++; return pageOf([asset], 0.1, null); }
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      const file = files.find(file => path.endsWith(file.sha256))!;
      return { file: { ...file, verified: true } };
    },
  } as unknown as Api;
  await uploadMissingFiles(api, "unused", "op", boot.bytes, files, first, new Output(true, () => {}),
    { route: "assets", delivery: LARGE, inputDigest: "identity", readFile: async () => bytes });
  assert.equal(reads, 2, "the page was asked for ahead, and again before its file was sent");
  assert.deepEqual(used, ["signed-1", "signed-3"], "the second file went on the URL signed when it was reached, not the one asked for ahead");
});

test("small assets are hashed in batches with the same answers, and a link among them is still refused", async () => temporary(async root => {
  await writeFile(join(root, "index.html"), "<canvas>");
  const names = Array.from({ length: 40 }, (_, index) => `main/part${String(index).padStart(2, "0")}.ff`);
  await mkdir(join(root, "main"), { recursive: true });
  for (const [index, name] of names.entries()) await writeFile(join(root, name), `part ${index}`);
  await sparse(root, "main/zz_big.ff", MIN * 2);
  const listed = [...names, "main/zz_big.ff"];
  const plan = await readUnityAssetPlan(root, root, listed, { unityOnly: false, delivery: LARGE });
  assert.deepEqual(plan.assets.map(row => row.path), listed);
  for (const [index, name] of names.entries()) {
    assert.equal(plan.assets.find(row => row.path === name)!.sha256, createHash("sha256").update(`part ${index}`).digest("hex"));
  }
  await rm(join(root, names[7]!));
  await symlink(join(root, "index.html"), join(root, names[7]!));
  await assert.rejects(readUnityAssetPlan(root, root, listed, { unityOnly: false, delivery: LARGE }), { code: "build_changed" });
}));

test("a plan file that is not there is named as missing, with the folder its path is read from", async () => temporary(async root => {
  // Area F, 1 Nov 2026: a missing plan got "Use an asset plan such as ...", the sentence
  // for a plan written wrongly, so the person rewrote a plan that was fine.
  await mkdir(join(root, "game/Build"), { recursive: true });
  await writeFile(join(root, "game/index.html"), "<!doctype html><script src=Build/game.loader.js></script>");
  await assert.rejects(readUnityAssetPlan(join(root, "game"), join(root, "game"), "../plan.json"), (error: Error & { code?: string; exitCode?: number }) => {
    assert.equal(error.code, "asset_plan_missing");
    assert.equal(error.exitCode, 2);
    assert.ok(error.message.includes(join(root, "plan.json")), error.message);
    assert.ok(error.message.includes(`read from the game's folder, ${join(root, "game")}`), error.message);
    assert.doesNotMatch(error.message, /Use an asset plan such as/);
    return true;
  });
  await writeFile(join(root, "plan.json"), "{ not json");
  await assert.rejects(readUnityAssetPlan(join(root, "game"), join(root, "game"), "../plan.json"), (error: Error & { code?: string }) => error.code !== "asset_plan_missing");
}));


test("auto partitions boot bytes between the assembly and ordinary ZIP caps", async () => temporary(async root => {
  await writeFile(join(root, "index.html"), "<canvas>");
  const small = MIN / 2;
  const rows = Array.from({ length: 600 }, (_, index) => ({ path: `assets/t${index}.dat`, byteSize: small }));
  for (const row of rows) await sparse(root, row.path, row.byteSize);
  await sparse(root, "assets/large.dat", MIN * 2);
  const before = incrementalArchiveBytes([{ path: "index.html", byteSize: 8 }, ...rows]);
  assert.ok(before > LIMITS.platform.incrementalUpload.archiveBytesMax);
  assert.ok(before < LIMITS.bundle.archiveBytesMax);
  const chosen = new Set(await autoSplitAssets(root, LARGE));
  assert.ok(chosen.size > 1, "moving only the large file would leave boot above the assembly cap");
  const boot = [{ path: "index.html", byteSize: 8 }, ...rows.filter(row => !chosen.has(row.path))];
  assert.ok(incrementalArchiveBytes(boot) <= LIMITS.platform.incrementalUpload.archiveBytesMax);
}));

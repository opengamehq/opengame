import { readFileSync } from "node:fs";
// EN6 regressions, added without running tests or building the CLI in this task.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, symlink, open, realpath, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { LIMITS } from "@opengame/shared";
import { LARGE_ASSET_DELIVERIES, largeAssetLimits, validateLargeAssetFiles } from "@opengame/shared/large-assets";
import type { GameManifest } from "@opengame/protocol";
import { assertUnitySourceRoot, createUnityArchive, parseUnityAssetPlan, readSmallUnityAssets, readUnityAsset, SMALL_ASSET_BYTES, unityFileUnion, unityInputDigest } from "../src/unity-assets";
import { safeReadLargeFile, safeSnapshot, safeDirectoryIdentity } from "../src/safe-fs";
import { collectFiles } from "../src/files";
import { canonicalArchive, uploadMissingFiles } from "../src/incremental";
import { readProject, withProject } from "../src/project";
import { Output } from "../src/output";
import { runPreflight } from "../src/preflight";
import { Api, UploadInterrupted } from "../src/http";
import { replyBootstrap, startupInformation } from "./bootstrap-fixture";

const manifest: GameManifest = { title: "Unity export", description: "Explore a quiet island and collect the scattered treasures.", genre: "shooter-survival", controls: ["keyboard"] };
const silent = new Output(true, () => {});
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const asset = (path: string, bytes = Buffer.from("asset")) => ({ path, byteSize: bytes.length, sha256: digest(bytes) });

async function temporary(run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "og-unity-assets-")));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("the explicit plan accepts only individual eligible assets and preserves exact paths", () => {
  assert.deepEqual(parseUnityAssetPlan({ assets: ["StreamingAssets/sky.png", "Build/Game.data.br"] }), ["Build/Game.data.br", "StreamingAssets/sky.png"]);
  for (const assets of [[], ["Build"], ["Build/main.js"], ["Build/main.wasm"], ["index.html"], ["../game.data"], ["/game.data"],
    ["Build/game.data?x"], ["Build/game%2edata"], ["_og/game.data"], ["Build/GAME.data", "Build/game.data"], [".env/game.data"]]) {
    assert.throws(() => parseUnityAssetPlan({ assets }), { code: "unity_assets_plan" });
  }
  assert.throws(() => parseUnityAssetPlan({ assets: ["game.data"], root: "elsewhere" }), { code: "unity_assets_plan" });
});

test("the boot archive excludes exact asset paths and keeps sibling code, wasm and data", async () => temporary(async root => {
  await mkdir(join(root, "Build"));
  const files = new Map([
    ["index.html", Buffer.from('<!doctype html><script src="Build/game.js"></script>')],
    ["Build/game.js", Buffer.from('document.body.textContent = "ready";')],
    ["Build/game.wasm", Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])],
    ["Build/game.data", Buffer.from("external")], ["Build/other.data", Buffer.from("still in boot")],
  ]);
  for (const [path, bytes] of files) await writeFile(join(root, path), bytes);
  await writeFile(join(root, "plan.json"), JSON.stringify({ assets: ["Build/game.data"] }));
  const archive = await createUnityArchive(root, manifest, silent, root, "plan.json");
  const tree = unzipSync(readFileSync(archive.file));
  assert.equal(tree["Build/game.data"], undefined);
  for (const path of ["Build/game.js", "Build/game.wasm", "Build/other.data"]) assert.deepEqual(Buffer.from(tree[path]!), files.get(path));
  assert.equal(archive.fileCount, archive.incremental!.length);
  assert.deepEqual(archive.unityAssets.assets, [asset("Build/game.data", files.get("Build/game.data")!)]);
  assert.equal(archive.unityAssets.inputDigest, unityInputDigest({ sha256: archive.sha256, byteSize: archive.byteSize }, archive.unityAssets.assets));
}));

test("ordinary collection stays capped and unlisted large siblings cannot escape the boot budget", async () => temporary(async root => {
  await writeFile(join(root, "index.html"), "<!doctype html><title>Game</title>");
  const large = await open(join(root, "large.data"), "w");
  try { await large.truncate(LIMITS.bundle.uncompressedBytesMax + 1); } finally { await large.close(); }
  await assert.rejects(collectFiles(root), { code: "bundle_limit" });
  const boot = await safeSnapshot(root, { externalAssets: new Set(["large.data"]) });
  assert.deepEqual([...boot.snapshot.keys()], ["index.html"]);
  await assert.rejects(safeSnapshot(root, { externalAssets: new Set(["other.data"]) }), { code: "bundle_limit" });
}));

test("binary asset reads are bounded and reject file and ancestor symlinks", async () => temporary(async root => {
  await mkdir(join(root, "Build"));
  await writeFile(join(root, "Build", "game.data"), "1234");
  assert.equal((await safeReadLargeFile(root, "Build/game.data", 4)).toString(), "1234");
  await assert.rejects(safeReadLargeFile(root, "Build/game.data", 3), { code: "build_changed" });
  // The reader's ceiling is the largest file any lane takes (large-game-v1's since 27 Oct 2026).
  const largest = Math.max(...LARGE_ASSET_DELIVERIES.map(kind => largeAssetLimits(kind)!.fileBytesMax));
  await assert.rejects(safeReadLargeFile(root, "Build/game.data", largest + 1), { code: "build_changed" });
  await symlink(join(root, "Build", "game.data"), join(root, "linked.data"));
  await symlink(join(root, "Build"), join(root, "linked"));
  await assert.rejects(safeReadLargeFile(root, "linked.data", 4), { code: "build_changed" });
  await assert.rejects(safeReadLargeFile(root, "linked/game.data", 4), { code: "build_changed" });
}));

test("the union rejects boot/asset collisions, file-parent collisions and excess total file count", () => {
  assert.throws(() => unityFileUnion([asset("build/GAME.data")], [asset("Build/game.data")]), { code: "unity_assets_plan" });
  assert.throws(() => unityFileUnion([asset("Build")], [asset("Build/game.data")]), { code: "unity_assets_plan" });
  const boot = Array.from({ length: LIMITS.bundle.fileCountMax }, (_, index) => asset(`boot/${index}.txt`));
  assert.throws(() => unityFileUnion(boot, [asset("game.data")]), { code: "unity_assets_plan" });
});

test("same boot with different assets has a different saved identity and changed source refuses resume", async () => temporary(async root => {
  const boot = canonicalArchive([["index.html", Buffer.from("game")]])!;
  const request = { byteSize: boot.bytes.length, sha256: digest(boot.bytes), fileCount: 1, manifest, metadataRevision: null, metadata: "preserve" as const };
  const first = asset("game.data", Buffer.from("first")), second = asset("game.data", Buffer.from("other"));
  assert.notEqual(unityInputDigest(request, [first]), unityInputDigest(request, [second]));
  await withProject(root, "https://example.test", async (state, save) => {
    state.deploy = { key: "unity-test", transport: "unity-assets-v1", request,
      unityAssets: { assets: [first], inputDigest: unityInputDigest(request, [first]), sourceRoot: root } };
    await save();
  });
  assert.equal((await readProject(root, "https://example.test")).deploy?.unityAssets?.assets[0]?.sha256, first.sha256);
  await writeFile(join(root, "game.data"), "other");
  await assert.rejects(readUnityAsset(root, first), { code: "build_changed" });
  await withProject(root, "https://example.test", async (state, save) => { state.deploy!.unityAssets!.assets = [second]; await save(); });
  await assert.rejects(readProject(root, "https://example.test"), { code: "project_state" });
}));

// A large plan's saved state outgrows the 1 MiB HTTP response cap the reader used: OG Clash's 13,179-file Kaigen plan
// wrote 2.9 MB, and every resume, status and later deploy from that folder then failed with project_state.
test("a large plan's saved state reads back", async () => temporary(async root => {
  const boot = canonicalArchive([["index.html", Buffer.from("game")]])!;
  const request = { byteSize: boot.bytes.length, sha256: digest(boot.bytes), fileCount: 1, manifest, metadataRevision: null, metadata: "preserve" as const };
  const assets = Array.from({ length: 12000 }, (_, index) => ({ path: `cooked/og_clash/models/part_${String(index).padStart(5, "0")}/mesh_lod0.page000.hza`,
    byteSize: 1000 + index, sha256: digest(Buffer.from(String(index))) }));
  const delivery = "kaigen-assets-v1";
  await withProject(root, "https://example.test", async (state, save) => {
    state.deploy = { key: "kaigen-large", transport: delivery, request,
      unityAssets: { assets, inputDigest: unityInputDigest(request, assets, delivery), sourceRoot: root, delivery } };
    await save();
  });
  assert.ok((await stat(join(root, ".opengame/project.json"))).size > LIMITS.platform.http.responseBytesMax);
  assert.equal((await readProject(root, "https://example.test")).deploy?.unityAssets?.assets.length, 12000);
}));

function uploadFixture() {
  const boot = canonicalArchive([["index.html", Buffer.from("boot")]])!;
  const external = asset("game.data", Buffer.from("external"));
  const files = unityFileUnion(boot.files, [external]);
  const plan = { missing: files.map(file => ({ ...file, upload: { hash: file.sha256 } })), reusedFiles: 0, reusedBytes: 0,
    totalFiles: files.length, totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0), cursor: 0, nextCursor: null };
  return { boot, external, files, plan };
}

test("assets upload sends both partitions through asset verification and finalize", async () => {
  const { boot, external, files, plan } = uploadFixture();
  const calls: string[] = [];
  const api = {
    uploadFile: async (descriptor: { hash: string }, bytes: Uint8Array) => { assert.equal(digest(bytes), descriptor.hash); calls.push(`put:${descriptor.hash}`); },
    json: async (path: string) => {
      calls.push(path);
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      const file = files.find(file => path.endsWith(file.sha256))!;
      return { file: { sha256: file.sha256, byteSize: file.byteSize, verified: true } };
    },
  } as unknown as Api;
  await uploadMissingFiles(api, "unused", "op", boot.bytes, files, plan, silent,
    { route: "assets", inputDigest: "identity", readFile: async file => { assert.equal(file.path, external.path); return Buffer.from("external"); } });
  assert.ok(files.every(file => calls.includes(`/api/v1/operations/op/assets/${file.sha256}`)));
  assert.equal(calls.at(-1), "/api/v1/operations/op/assets/complete");
  assert.ok(calls.every(path => !path.includes("/files")));
});

test("asset progress cannot complete on an invalid server verification", async () => {
  const { boot, files, plan } = uploadFixture();
  let completed = false;
  const api = { uploadFile: async () => {}, json: async (path: string) => {
    if (path.endsWith("/complete")) completed = true;
    return { file: { ...files[0], verified: false } };
  } } as unknown as Api;
  await assert.rejects(uploadMissingFiles(api, "unused", "op", boot.bytes, files, plan, silent,
    { route: "assets", readFile: async () => Buffer.from("external") }), { code: "invalid_response" });
  assert.equal(completed, false);
});

test("an interrupted asset PUT retries the whole file with a fresh descriptor", async () => {
  const { boot, files, plan } = uploadFixture();
  let interrupted = false, refreshes = 0;
  const payloads: string[] = [];
  const api = {
    uploadFile: async (_: unknown, bytes: Uint8Array) => { payloads.push(digest(bytes)); if (!interrupted) { interrupted = true; throw new UploadInterrupted("test disconnect"); } },
    json: async (path: string) => {
      if (path.includes("?cursor=")) { refreshes++; return { files: plan, delivery: "unity-assets-v1", inputDigest: "identity" }; }
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      const file = files.find(file => path.endsWith(file.sha256))!;
      return { file: { ...file, verified: true } };
    },
  } as unknown as Api;
  await uploadMissingFiles(api, "unused", "op", boot.bytes, files, plan, silent,
    { route: "assets", inputDigest: "identity", readFile: async () => Buffer.from("external") });
  assert.equal(refreshes, 1);
  // Files go up several at a time, so the retry is not necessarily the second PUT: the interrupted bytes go up twice.
  assert.equal(payloads.filter(payload => payload === payloads[0]).length, 2);
  assert.equal(payloads.length, files.length + 1);
});

test("the CLI wire sends boot-only fields and binds repeat-key resume to the asset identity", async () => temporary(async root => {
  const run = promisify(execFile), binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
  const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
  const id = "11111111-1111-4111-8111-111111111111";
  const requests: Record<string, any>[] = [], puts = new Map<string, Buffer>();
  let origin = "", state = "uploading", expireNext = false;
  const operation = () => ({ id, state, gameId: null, releaseId: null, error: null });
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    if (req.url?.startsWith("/storage/")) {
      assert.equal(req.headers.authorization, undefined);
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks), hash = req.url.slice("/storage/".length);
      assert.equal(digest(bytes), hash); puts.set(hash, bytes); res.end(); return;
    }
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === "/api/v1/deploys/unity-assets") {
      let text = ""; for await (const chunk of req) text += chunk;
      const body = JSON.parse(text); requests.push(body); state = "uploading";
      if (expireNext) {
        expireNext = false; res.statusCode = 409;
        res.end(JSON.stringify({ error: "upload_expired", message: "The upload expired. Start a new deploy." })); return;
      }
      const files = [...body.files, ...body.assets];
      res.end(JSON.stringify({ operation: operation(), delivery: "unity-assets-v1", inputDigest: unityInputDigest(body, body.assets),
        files: { missing: files.map(file => ({ ...file, upload: { url: `${origin}/storage/${file.sha256}`,
          headers: { "content-type": "application/octet-stream", "content-length": String(file.byteSize), "if-none-match": "*" } } })),
          totalFiles: files.length, totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0), reusedFiles: 0, reusedBytes: 0, cursor: 0, nextCursor: null } }));
      return;
    }
    if (req.url === `/api/v1/operations/${id}` && req.method === "GET") {
      res.end(JSON.stringify({ operation: operation() })); return;
    }
    if (req.url === `/api/v1/operations/${id}/assets/complete`) {
      state = "queued"; res.statusCode = 202; res.end(JSON.stringify({ operation: operation() })); return;
    }
    if (req.url?.startsWith(`/api/v1/operations/${id}/assets/`)) {
      const hash = req.url.split("/").at(-1)!;
      assert.ok(puts.has(hash));
      res.end(JSON.stringify({ operation: operation(), file: { sha256: hash, byteSize: puts.get(hash)!.length, verified: true } })); return;
    }
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "unexpected_route", message: "The CLI used an unexpected test endpoint." }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await mkdir(join(root, "export", "Build"), { recursive: true });
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "export" } }));
    await writeFile(join(root, "export", "index.html"), "<!doctype html><title>Game</title>");
    await writeFile(join(root, "export", "Build", "game.data"), "first");
    await writeFile(join(root, "assets.json"), JSON.stringify({ assets: ["Build/game.data"] }));
    await mkdir(join(root, "ProjectSettings"));
    await writeFile(join(root, "ProjectSettings/ProjectVersion.txt"), "m_EditorVersion: 6000.0.42f1\n");
    for (const command of [["check"], ["deploy", "--dry-run"]]) {
      const result = await run(process.execPath, [binary, command[0]!, root, ...command.slice(1), "--unity-assets", "assets.json", "--json"], { env });
      assert.equal(JSON.parse(result.stdout).data.delivery, "unity-assets-v1");
      if (command[0] === "check") assert.equal(JSON.parse(result.stdout).data.sourceSettings.engine, "unity");
      assert.equal(requests.length, 0);
    }
    const deploy = (key: string) => run(process.execPath,
      [binary, "deploy", root, "--unity-assets", "assets.json", "--idempotency-key", key, "--no-wait", "--json"], { env });
    await deploy("unity-wire");
    assert.equal(requests.length, 1);
    assert.deepEqual(Object.keys(requests[0]!).sort(), ["assets", "byteSize", "delivery", "fileCount", "files", "manifest", "metadata", "metadataRevision", "sha256"].sort());
    assert.deepEqual(requests[0]!.files.map((file: { path: string }) => file.path), ["index.html"]);
    assert.equal(requests[0]!.fileCount, 1);
    assert.equal(requests[0]!.assets[0].path, "Build/game.data");
    const statePath = join(root, ".opengame", "project.json");
    const originalState = await readFile(statePath, "utf8"), tampered = JSON.parse(originalState);
    await mkdir(join(root, "other-export", "Build"), { recursive: true });
    await writeFile(join(root, "other-export", "Build", "game.data"), "first");
    tampered.deploy.unityAssets.sourceRoot = join(root, "other-export");
    await writeFile(statePath, JSON.stringify(tampered));
    await assert.rejects(deploy("unity-wire"), (error: unknown) => {
      const failure = error as { code: number; stdout: string };
      assert.equal(failure.code, 2); assert.match(failure.stdout, /project_state/); return true;
    });
    assert.equal(requests.length, 1, "tampered sourceRoot cannot reach upload creation");
    await writeFile(statePath, originalState);
    await writeFile(join(root, "export", "Build", "game.data"), "other");
    await assert.rejects(deploy("unity-wire"), (error: unknown) => {
      const failure = error as { code: number; stdout: string };
      assert.equal(failure.code, 1); assert.match(failure.stdout, /build_changed/); return true;
    });
    assert.equal(requests.length, 1, "a changed explicit plan cannot reach the saved operation");
    await deploy("unity-new");
    assert.equal(requests.length, 2);
    assert.equal(requests[0]!.sha256, requests[1]!.sha256);
    assert.notEqual(requests[0]!.assets[0].sha256, requests[1]!.assets[0].sha256);
    const saved = JSON.parse(await readFile(statePath, "utf8"));
    saved.deploy.uploaded = false; saved.deploy.terminal = false;
    await writeFile(statePath, JSON.stringify(saved));
    expireNext = true;
    await run(process.execPath, [binary, "deploy", root, "--no-wait", "--json"], { env });
    assert.equal(requests.length, 4, "plain resume retries expiry as a new Unity asset operation");
    assert.equal(requests[3]!.delivery, "unity-assets-v1");
    assert.deepEqual(requests[3]!.files.map((file: { path: string }) => file.path), ["index.html"]);
    assert.deepEqual(requests[3]!.assets.map((file: { path: string }) => file.path), ["Build/game.data"]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}));


test("the isolated checker uses external paths for references without admitting their bytes", async () => {
  const source = '<!doctype html><html><body><img src="StreamingAssets/sky.png"><script>fetch("Build/game.data");</script></body></html>';
  let textReads = 0;
  const files = [{ path: "index.html", size: Buffer.byteLength(source), text: async () => { textReads++; return source; } }];
  const absent = await runPreflight(files);
  assert.ok(absent.findings.some(finding => finding.code === "missing-ref"));
  const contextual = await runPreflight(files, undefined, { externalPaths: ["StreamingAssets/sky.png", "Build/game.data"] });
  assert.ok(!contextual.findings.some(finding => finding.code === "missing-ref"));
  assert.deepEqual(contextual.include, ["index.html"]);
  assert.equal(contextual.fileCount, 1);
  assert.equal(contextual.totalBytes, Buffer.byteLength(source));
  assert.equal(contextual.credentialScan?.complete, absent.credentialScan?.complete);
  assert.deepEqual(contextual.engine, absent.engine);
  assert.ok(textReads > 0, "the worker still inspects actual boot source");
});

test("resume binds the saved source to the freshly selected export, including canonical roots", async () => temporary(async root => {
  await mkdir(join(root, "export"));
  await mkdir(join(root, "other-export"));
  await writeFile(join(root, "other-export", "game.data"), "outside selected export");
  await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "export" } }));
  await assertUnitySourceRoot(root, join(root, "export"));
  await assert.rejects(assertUnitySourceRoot(root, join(root, "other-export")), { code: "project_state" });
  await symlink(join(root, "other-export"), join(root, "alias"));
  await assert.rejects(assertUnitySourceRoot(root, join(root, "alias")), { code: "project_state" });
  await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "other-export" } }));
  await assert.rejects(assertUnitySourceRoot(root, join(root, "export")), { code: "project_state" });
  await assert.rejects(safeReadLargeFile(join(root, "alias"), "game.data", 20), { code: "build_changed" });
}));

// One file at a time, so the order below is the order things happen in. The concurrent case is the next test.
const serially = async <T>(run: () => Promise<T>) => {
  const saved = LIMITS.platform.incrementalUpload.concurrency;
  (LIMITS.platform.incrementalUpload as { concurrency: number }).concurrency = 1;
  try { return await run(); } finally { (LIMITS.platform.incrementalUpload as { concurrency: number }).concurrency = saved; }
};

test("asset refresh totals include this invocation without counting verified files twice", () => serially(async () => {
  const boot = canonicalArchive([["index.html", Buffer.from("boot")]])!;
  const external = [asset("A.data", Buffer.from("aaa")), asset("B.data", Buffer.from("bb")), asset("C.data", Buffer.from("c"))];
  const files = unityFileUnion(boot.files, external);
  const totalBytes = files.reduce((sum, file) => sum + file.byteSize, 0);
  const first = { missing: external.map(file => ({ ...file, upload: { hash: file.sha256 } })), reusedFiles: 1, reusedBytes: 4,
    totalFiles: files.length, totalBytes, nextCursor: null };
  let interrupted = false;
  const uploaded: string[] = [], events: { type: string; files?: number; bytes?: number }[] = [];
  const api = {
    uploadFile: async (descriptor: { hash: string }, bytes: Uint8Array, progress: (sent: number, total: number) => void) => {
      uploaded.push(descriptor.hash); progress(bytes.length, bytes.length);
      if (!interrupted) { interrupted = true; throw new UploadInterrupted("lost response"); }
    },
    json: async (path: string) => {
      if (path.includes("?cursor=")) return { delivery: "unity-assets-v1", inputDigest: "identity", files: {
        ...first, missing: [{ ...external[1]!, upload: { hash: external[1]!.sha256 } }], reusedFiles: 3, reusedBytes: totalBytes - external[1]!.byteSize,
      } };
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      const file = files.find(file => path.endsWith(file.sha256))!;
      return { file: { ...file, verified: true } };
    },
  } as unknown as Api;
  const output = new Output("jsonl", line => events.push(JSON.parse(line)));
  await uploadMissingFiles(api, "unused", "op", boot.bytes, files, first, output, { route: "assets", inputDigest: "identity",
    readFile: async file => Buffer.from(file.path === "A.data" ? "aaa" : file.path === "B.data" ? "bb" : "c") });
  assert.deepEqual(uploaded, [external[0]!.sha256, external[1]!.sha256], "the refreshed page already verified C");
  assert.equal(events.filter(event => event.type === "progress").at(-2)?.files, 3);
  assert.ok(events.every(event => event.files === undefined || event.files <= files.length));
  assert.ok(events.every(event => event.bytes === undefined || event.bytes <= totalBytes));
}));

test("a refresh during concurrent uploads counts a file another worker is still finishing only once", async () => {
  // The race: A's answer is lost and its retry refreshes the page. By then the server has verified B, but B's worker
  // has not resumed from its verification. The refresh's total includes B, and B's worker counts B when it resumes.
  // D's progress, read once everything else has settled, is the count: boot, A, B and C, so four of five.
  const boot = canonicalArchive([["index.html", Buffer.from("boot")]])!;
  const bodies = { "A.data": "aaa", "B.data": "bb", "C.data": "c", "D.data": "dddd" } as Record<string, string>;
  const external = Object.entries(bodies).map(([path, body]) => asset(path, Buffer.from(body)));
  const [a, b, , d] = external as [ReturnType<typeof asset>, ReturnType<typeof asset>, ReturnType<typeof asset>, ReturnType<typeof asset>];
  const files = unityFileUnion(boot.files, external);
  const totalBytes = files.reduce((sum, file) => sum + file.byteSize, 0);
  const first = { missing: external.map(file => ({ ...file, upload: { hash: file.sha256 } })), reusedFiles: 1, reusedBytes: 4,
    totalFiles: files.length, totalBytes, nextCursor: null };
  const gate = () => { let open!: () => void; const shut = new Promise<void>(resolve => { open = resolve; }); return { shut, open }; };
  const aRetried = gate(), bAnswered = gate();
  let aSent = 0, aVerified = 0, dReported: number | undefined;
  const settle = async () => { for (let tick = 0; tick < 5; tick++) await new Promise(resolve => setImmediate(resolve)); };
  const api = {
    uploadFile: async (descriptor: { hash: string }, bytes: Uint8Array, progress: (sent: number, total: number) => void) => {
      if (descriptor.hash === a.sha256 && aSent++ === 0) throw new UploadInterrupted("lost response");
      if (descriptor.hash === d.sha256) {
        await bAnswered.shut; await settle();
        progress(0, bytes.length);
        dReported = events.filter(event => event.type === "progress").at(-1)?.files;
      }
    },
    json: async (path: string) => {
      if (path.includes("?cursor=")) return { delivery: "unity-assets-v1", inputDigest: "identity", files: {
        ...first, missing: [{ ...d, upload: { hash: d.sha256 } }], reusedFiles: 4, reusedBytes: totalBytes - d.byteSize,
      } };
      if (path.endsWith("/complete")) return { operation: { state: "queued" } };
      if (path.endsWith(a.sha256) && aVerified++ === 0) aRetried.open();
      // B's verification is answered only after A's retry has read the refreshed page
      if (path.endsWith(b.sha256)) { await aRetried.shut; await settle(); bAnswered.open(); }
      const file = files.find(file => path.endsWith(file.sha256))!;
      return { file: { ...file, verified: true } };
    },
  } as unknown as Api;
  const events: { type: string; files?: number; bytes?: number }[] = [];
  const output = new Output("jsonl", line => events.push(JSON.parse(line)));
  await uploadMissingFiles(api, "unused", "op", boot.bytes, files, first, output, { route: "assets", inputDigest: "identity",
    readFile: async file => Buffer.from(bodies[file.path]!) });
  assert.equal(dReported, 4, "boot, A, B and C are verified; D is still going up");
  assert.ok(events.every(event => event.files === undefined || event.files <= files.length));
});

test("non-BMP asset names use canonical UTF-8 ordering for the plan and input digest", () => {
  // UTF-16 places U+10000 before U+E000; UTF-8 byte order and PostgreSQL C
  // collation place U+E000 first. Both names are valid, unchanged asset paths.
  const before = "StreamingAssets/\uE000.png", after = "StreamingAssets/\u{10000}.png";
  const paths = parseUnityAssetPlan({ assets: [after, before] });
  assert.deepEqual(paths, [before, after]);
  const assets = paths.map(path => asset(path));
  assert.equal(validateLargeAssetFiles([...assets].reverse()), null, "UTF-16 order is not the wire order");
  const boot = { sha256: "0".repeat(64), byteSize: 123 };
  const expected = `opengame unity assets v1\n${boot.sha256} ${boot.byteSize}\n` +
    assets.map(file => `${file.sha256} ${file.byteSize} ${file.path}\n`).join("");
  assert.equal(unityInputDigest(boot, assets), digest(Buffer.from(expected)));
  assert.deepEqual(unityFileUnion([asset("index.html")], assets).map(file => file.path), [before, after, "index.html"]);
});

test('new-variant union uses UTF-8 while canonical boot files keep their existing UTF-16 order', () => {
  const boot = canonicalArchive([
    ['index.html', Buffer.from('<canvas></canvas>')],
    ['\uE000.js', Buffer.from('self.bmp=1;')],
    ['\u{10000}.js', Buffer.from('self.nonbmp=1;')],
  ])!;
  assert.deepEqual(boot.files.map(file => file.path), ['index.html', '\u{10000}.js', '\uE000.js']);
  const paths = parseUnityAssetPlan({ assets: ['\u{10000}.data', '\uE000.data'] });
  assert.deepEqual(paths, ['\uE000.data', '\u{10000}.data']);
  const assets = paths.map(path => asset(path));
  assert.equal(validateLargeAssetFiles([...assets].reverse()), null);
  assert.deepEqual(unityFileUnion(boot.files, assets).map(file => file.path),
    ['index.html', '\uE000.data', '\uE000.js', '\u{10000}.data', '\u{10000}.js']);
});

test('the archive caller forwards exact external references without putting bytes in the boot ZIP', async () => temporary(async root => {
  await mkdir(join(root, 'Build')); await mkdir(join(root, 'StreamingAssets'));
  await writeFile(join(root, 'index.html'), '<html><body><canvas></canvas><img src="StreamingAssets/sky.png"><script src="game.js"></script></body></html>');
  await writeFile(join(root, 'game.js'), 'createUnityInstance(document.querySelector("canvas"), {dataUrl:"Build/game.data"});');
  await writeFile(join(root, 'Build/game.data'), 'external data that is not claimed scanned');
  await writeFile(join(root, 'StreamingAssets/sky.png'), 'external bytes');
  await writeFile(join(root, 'assets.json'), JSON.stringify({ assets: ['Build/game.data', 'StreamingAssets/sky.png'] }));
  const archive = await createUnityArchive(root, manifest, silent, root, 'assets.json');
  const entries = unzipSync(readFileSync(archive.file));
  assert.equal(entries['Build/game.data'], undefined);
  assert.equal(entries['StreamingAssets/sky.png'], undefined);
  assert.ok(entries['index.html']); assert.ok(entries['game.js']);
  assert.deepEqual(archive.unityAssets.assets.map(file => file.path), ['Build/game.data', 'StreamingAssets/sky.png']);
}));

test('an export root replaced after identity capture is rejected before asset or boot reads', { skip: process.platform === 'win32' }, async () => temporary(async root => {
  const { rename } = await import('node:fs/promises');
  await mkdir(join(root, 'export')); await mkdir(join(root, 'outside'));
  await writeFile(join(root, 'export/game.data'), 'inside');
  await writeFile(join(root, 'outside/game.data'), 'outside');
  const selected = join(root, 'export'); const identity = await safeDirectoryIdentity(selected);
  await rename(selected, join(root, 'original')); await symlink(join(root, 'outside'), selected);
  await assert.rejects(safeReadLargeFile(selected, 'game.data', 20, identity), { code: 'build_changed' });
  await assert.rejects(safeSnapshot(selected, { externalAssets: new Set(['game.data']), rootIdentity: identity }), { code: 'build_changed' });
}));

test('new-variant plan and union share pinned Unicode casefold collision rules', () => {
  assert.throws(() => parseUnityAssetPlan({ assets: ['StreamingAssets/straße.bin', 'StreamingAssets/strasse.bin'] }), { code: 'unity_assets_plan' });
  assert.throws(() => unityFileUnion([asset('StreamingAssets/straße.bin')], [asset('StreamingAssets/strasse.bin')]), { code: 'unity_assets_plan' });
  assert.throws(() => unityFileUnion([asset('StreamingAssets/Straße')], [asset('StreamingAssets/STRASSE/level.bin')]), { code: 'unity_assets_plan' });
});

test('asset plans and cross-partition prefixes use canonical caseless matching for Greek combining pairs', () => {
  for (const [left, right] of [['\u0390', '\u03AA\u0301'], ['\u1F80\u0308', '\u1F00\u0308\u03B9']]) {
    const first = `StreamingAssets/${left}.data`, second = `StreamingAssets/${right}.data`;
    assert.throws(() => parseUnityAssetPlan({ assets: [first, second] }), { code: 'unity_assets_plan' });
    assert.throws(() => unityFileUnion([asset(first)], [asset(second)]), { code: 'unity_assets_plan' });
    assert.throws(() => unityFileUnion([asset(`StreamingAssets/${left}.data`)], [asset(`StreamingAssets/${right}.data/part.data`)]), { code: 'unity_assets_plan' });
    assert.throws(() => unityFileUnion([asset(`StreamingAssets/${right}.data/part.data`)], [asset(`StreamingAssets/${left}.data`)]), { code: 'unity_assets_plan' });
    assert.deepEqual(parseUnityAssetPlan({ assets: [first] }), [first], 'a comparison key does not replace the original path');
  }
});

test("an upload reads a page's small assets together, reads large ones alone, and hashes both before sending", async () => temporary(async root => {
  const boot = canonicalArchive([["index.html", Buffer.from("boot")]])!;
  const bytes = new Map([["a.data", Buffer.from("small a")], ["b.data", Buffer.from("small b")], ["c.data", Buffer.alloc(SMALL_ASSET_BYTES + 1, 3)]]);
  for (const [path, body] of bytes) await writeFile(join(root, path), body);
  const external = [...bytes].map(([path, body]) => asset(path, body));
  const files = unityFileUnion(boot.files, external);
  const first = { missing: external.map(file => ({ ...file, upload: { hash: file.sha256 } })), reusedFiles: 1, reusedBytes: 4,
    totalFiles: files.length, totalBytes: files.reduce((sum, file) => sum + file.byteSize, 0), nextCursor: null };
  const sent = new Map<string, string>();
  const api = {
    uploadFile: async (descriptor: { hash: string }, body: Uint8Array) => { sent.set(descriptor.hash, digest(body)); },
    json: async (path: string) => path.endsWith("/complete") ? { operation: { state: "queued" } }
      : { file: { ...files.find(file => path.endsWith(file.sha256))!, verified: true } },
  } as unknown as Api;
  const alone: string[] = [], together: string[][] = [];
  await uploadMissingFiles(api, "unused", "op", boot.bytes, files, first, silent, { route: "assets", inputDigest: "identity",
    readFile: file => { alone.push(file.path); return readUnityAsset(root, file); },
    readFiles: async ahead => { together.push(ahead.map(file => file.path)); return readSmallUnityAssets(root, ahead); } });
  assert.deepEqual(together, [["a.data", "b.data", "c.data"]], "the page's assets are offered together");
  assert.deepEqual(alone, ["c.data"], "the one over the small-file size is read on its own");
  assert.deepEqual([...sent.values()].sort(), external.map(file => file.sha256).sort());
  // Bytes read ahead are hashed against the saved plan like any others.
  await writeFile(join(root, "b.data"), "small B");
  await assert.rejects(readSmallUnityAssets(root, external), { code: "build_changed", message: /A saved asset changed/ });
  const wrong = new Map<string, Uint8Array>([...bytes].map(([path, body]) => [path, path === "a.data" ? Buffer.from("other a") : body]));
  sent.clear();
  await assert.rejects(uploadMissingFiles(api, "unused", "op", boot.bytes, files, first, silent, { route: "assets", inputDigest: "identity",
    readFiles: async () => wrong }), { code: "archive_unavailable", message: /A saved dependency changed/ });
  assert.ok(!sent.has(external[0]!.sha256), "a file read ahead with the wrong bytes is never sent");
}));

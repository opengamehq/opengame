import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { unzipSync } from "fflate";
import { createArchive } from "../src/archive";
import { withProject } from "../src/project";
import { Output } from "../src/output";
import { LIMITS } from "@opengame/shared";
import type { GameManifest } from "@opengame/protocol";
import { replyBootstrap, startupInformation } from "./bootstrap-fixture";

const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const manifest: GameManifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
const silent = new Output(true, () => {});
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);

test("archive contains exactly the checked normalized files and has a stable digest", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-archive-"));
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "index.html"), '<!doctype html><script src="game.js"></script>');
    await writeFile(join(root, "dist", "game.js"), "document.body.textContent='Play';");
    await writeFile(join(root, ".env.local"), "excluded");
    const first = await createArchive(root, manifest, silent);
    const second = await createArchive(root, manifest, silent);
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(Object.keys(unzipSync(first.bytes)).sort(), ["game.js", "index.html"]);
    assert.equal(first.fileCount, 2);
    // A cover that does not exist used to refuse the package (cover_missing). Nothing reads
    // the field now, so the archive is the same bytes with it as without it.
    await writeFile(join(root, "cover.png"), "a picture outside the build");
    for (const cover of ["missing.png", "cover.png"]) assert.equal((await createArchive(root, { ...manifest, cover }, silent)).sha256, first.sha256, cover);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("project storage refuses a symlink, a different origin and overlapping writers", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-project-"));
  const outside = await mkdtemp(join(tmpdir(), "og-project-outside-"));
  try {
    await symlink(outside, join(root, ".opengame"));
    await assert.rejects(withProject(root, "https://one.example", async () => {}), /project.json/);
    await rm(join(root, ".opengame"));
    await withProject(root, "https://one.example", async (state, save) => {
      await save();
      await assert.rejects(withProject(root, state.origin, async () => {}), /Another CLI/);
    });
    await assert.rejects(withProject(root, "https://two.example", async () => {}), (error: Error & { code?: string }) => {
      assert.equal(error.code, "project_state");
      assert.match(error.message, /deployed through https:\/\/one\.example/);
      assert.match(error.message, /OPENGAME_API_URL=https:\/\/one\.example/);
      return true;
    });
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("dry-run rejects manifest secrets and uses the actual packaging checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-dry-run-"));
  const syntheticKey = "AKIA" + "Z".repeat(16);
  try {
    await writeFile(join(root, "index.html"), "<!doctype html><title>Game</title>");
    for (const value of [{ ...manifest, description: `A game with ${syntheticKey} in its description.` },
      { ...manifest, build: { command: `AWS_ACCESS_KEY_ID=${syntheticKey} npm run build`, output: "." } }]) {
      await writeFile(join(root, "opengame.json"), JSON.stringify(value));
      await assert.rejects(run(process.execPath, [binary, "deploy", root, "--dry-run", "--jsonl"]), (error: unknown) => {
        const result = error as { stdout: string; code: number };
        // A manifest that fails validation is the game's problem (exit 1), reported as a finding in opengame.json.
        assert.equal(result.code, 1); assert.match(result.stdout, /Remove credentials/); assert.ok(!result.stdout.includes(syntheticKey));
        assert.ok(result.stdout.split("\n").filter(Boolean).map(line => JSON.parse(line)).some(event => event.type === "finding" && event.finding.evidence.file === "opengame.json"));
        return true;
      });
    }
    /* Every opengame.json written before 30 Oct 2026 may name a cover. It still passes, the
       person is told once that it can go, and a missing file is no longer a reason to stop. */
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, cover: "missing.png" }));
    const events = (await run(process.execPath, [binary, "deploy", root, "--dry-run", "--jsonl"])).stdout
      .split("\n").filter(Boolean).map(line => JSON.parse(line));
    const notices = events.filter(event => event.type === "notice" && event.code === "cover_ignored");
    assert.equal(notices.length, 1);
    assert.equal(notices[0].message, "OpenGame now makes your cover after approval, so the cover field in opengame.json is not used. You can remove it.");
    assert.ok(!events.some(event => event.type === "notice" && event.code === "cover_included"));
    await assert.rejects(readFile(join(root, ".opengame", "project.json")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bundled deploy resumes a lost PUT response without rebuilding or making another operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-"));
  let origin = ""; let uploaded = false; let puts = 0; let startupReads = 0; const keys: string[] = []; const requests: string[] = [];
  const id = "11111111-1111-4111-8111-111111111111";
  let state = "uploading"; let failureCode: string | null = null;
  let watching = false; let watchReads = 0; let queuedShown = false; let shownBeforePoll = false;
  let body: Record<string, unknown> = {};
  const op = () => ({ id, state, gameId: null, releaseId: null, error: failureCode });
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) { startupReads++; return; }
    if (req.url === "/storage") {
      assert.equal(req.headers.authorization, undefined);
      assert.equal(req.headers["if-none-match"], "*");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.length, body.byteSize);
      assert.match(Buffer.from(unzipSync(bytes)["index.html"]!).toString(), /Original/);
      uploaded = true; puts++; res.destroy(); return;
    }
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === "/api/v1/deploys") {
      let data = ""; for await (const chunk of req) data += chunk;
      requests.push(data); body = JSON.parse(data); keys.push(String(req.headers["idempotency-key"]));
      res.end(JSON.stringify({ operation: op(), ...(uploaded ? { uploaded: true } : { upload: { url: `${origin}/storage`, headers: { "content-type": "application/zip", "content-length": String(body.byteSize), "if-none-match": "*" } } }) })); return;
    }
    if (req.url === `/api/v1/operations/${id}/upload` && req.method === "PUT") state = "queued";
    // The in-run retry asks for a fresh URL. The server being unavailable for it is what
    // leaves this deploy to the next run, which is the resume this test is about.
    if (req.url === `/api/v1/operations/${id}/upload` && req.method === "POST") { res.statusCode = 503; res.end(JSON.stringify({ error: "unavailable", message: "Try again later." })); return; }
    if (watching && req.url === `/api/v1/operations/${id}` && watchReads++ > 0) {
      shownBeforePoll = queuedShown;
      state = "failed"; failureCode = "metadata_conversion_required";
    }
    res.end(JSON.stringify({ operation: op() }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Original</title>");
    await assert.rejects(run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env }), (error: unknown) => {
      const failure = error as { stdout: string; code: number };
      assert.equal(failure.code, 5); assert.match(failure.stdout, /upload_interrupted/); assert.ok(!failure.stdout.includes(token)); return true;
    });
    await writeFile(join(root, "index.html"), "<!doctype html><title>New edits</title>");
    const retry = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env });
    assert.equal(startupReads, 2, "both invocations read authenticated startup data before upload or resume");
    assert.equal(puts, 1); assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.equal(requests[0], requests[1]);
    const events = retry.stdout.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(events.at(-1).data.state, "queued");
    const timings = events.at(-1).data.timingsMs;
    assert.ok(Object.values(timings).every(value => Number.isSafeInteger(value) && Number(value) >= 0));
    assert.ok(timings.total >= timings.create);
    assert.equal(timings.prepare, undefined); assert.equal(timings.upload, undefined); assert.equal(events.at(-1).data.operationId, id);
    assert.ok(events.some(event => event.code === "resuming_deploy"));
    const saved = await readFile(join(root, ".opengame", "project.json"), "utf8");
    assert.ok(!saved.includes(token)); assert.ok(!saved.includes("/storage"));
    assert.equal((await readFile(join(root, ".gitignore"), "utf8")).trim(), ".opengame/");
    const status = await run(process.execPath, [binary, "status", root, "--jsonl"], { env });
    assert.equal(JSON.parse(status.stdout.trim()).data.state, "queued");
    watching = true;
    const watcher = run(process.execPath, [binary, "status", root, "--watch", "--jsonl"], { env });
    let streamed = "";
    watcher.child.stdout!.on("data", chunk => {
      streamed += chunk;
      queuedShown = streamed.split("\n").some(line => line.includes('"type":"progress"') && line.includes('"stage":"queued"'));
    });
    await assert.rejects(watcher, (error: unknown) => {
      const result = error as { stdout: string; code: number };
      // The fix is a flag, so this needs input (2) rather than a code change (1).
      assert.equal(result.code, 2);
      assert.match(result.stdout, /--metadata=local/);
      assert.equal(JSON.parse(result.stdout.trim().split("\n").at(-1)!).code, "metadata_conversion_required");
      return true;
    });
    assert.equal(shownBeforePoll, true, "the queued state is visible before waiting for the next status request");
    watching = false;
    state = "failed"; failureCode = "metadata_conversion_required";
    await assert.rejects(run(process.execPath, [binary, "status", root, "--jsonl"], { env }), (error: unknown) => {
      const result = error as { stdout: string; code: number };
      assert.equal(result.code, 2);
      assert.match(result.stdout, /--metadata=local/);
      return true;
    });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("a repeat deploy updates the linked game with a fresh operation and preserves website metadata by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-redeploy-"));
  const gameId = "44444444-4444-4444-8444-444444444444";
  const requests: Record<string, unknown>[] = []; const keys: string[] = [];
  let count = 0;
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    assert.equal(req.url, "/api/v1/deploys");
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body)); keys.push(String(req.headers["idempotency-key"])); count++;
    res.end(JSON.stringify({ operation: { id: `11111111-1111-4111-8111-${String(count).padStart(12, "0")}`,
      state: "ready", gameId, releaseId: `22222222-2222-4222-8222-${String(count).padStart(12, "0")}`, error: null } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>First build</title>");
    await run(process.execPath, [binary, "deploy", root, "--jsonl"], { env });
    await writeFile(join(root, "index.html"), "<!doctype html><title>Updated build</title>");
    await run(process.execPath, [binary, "deploy", root, "--jsonl"], { env });
    assert.equal(requests.length, 2); assert.equal(requests[0]!.gameId, undefined); assert.equal(requests[1]!.gameId, gameId);
    assert.equal(requests[1]!.metadata, "preserve"); assert.equal(requests[1]!.metadataRevision, null);
    assert.notEqual(requests[0]!.sha256, requests[1]!.sha256); assert.notEqual(keys[0], keys[1]);
    const saved = JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8"));
    assert.equal(saved.gameId, gameId); assert.equal(saved.deploy.terminal, true);
    assert.equal(saved.deploy.operationId, "11111111-1111-4111-8111-000000000002");
    // An opengame.json from before 30 Oct 2026 names a cover. The manifest sent leaves it
    // out, so a current CLI never asks the server to carry it, however the deploy resolves.
    await mkdir(join(root, "marketing"));
    await writeFile(join(root, "marketing", "cover.png"), "a picture");
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, cover: "marketing/cover.png" }));
    const replacement = await run(process.execPath, [binary, "deploy", root, "--metadata=local", "--jsonl"], { env });
    assert.equal(requests[2]!.metadata, "local");
    assert.equal("cover" in (requests[2]!.manifest as Record<string, unknown>), false, "the request still names the cover");
    assert.deepEqual(requests[2]!.manifest, manifest);
    const notice = replacement.stdout.trim().split("\n").map(line => JSON.parse(line)).find(event => event.code === "local_metadata_selected");
    assert.match(notice.message, /replacing the website values/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("first upload uses the checked snapshot while a retry still verifies the disk cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-snapshot-"));
  let origin = "", puts = 0;
  const id = "11111111-1111-4111-8111-111111111111";
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    if (req.url === "/storage") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      assert.match(Buffer.from(unzipSync(bytes)["index.html"]!).toString(), /Checked snapshot/);
      puts++; res.destroy(); return;
    }
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === `/api/v1/operations/${id}/upload`) { res.statusCode = 503; res.end(JSON.stringify({ error: "unavailable", message: "Try again later." })); return; }
    let data = ""; for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    // A separate writer changed the retry cache after preparation. The current
    // attempt still has its checked bytes; a later process must detect tampering.
    await writeFile(join(root, ".opengame", `${body.sha256}.zip`), Buffer.alloc(body.byteSize));
    res.end(JSON.stringify({ operation: { id, state: "uploading", gameId: null, releaseId: null, error: null },
      upload: { url: `${origin}/storage`, headers: { "content-type": "application/zip", "content-length": String(body.byteSize), "if-none-match": "*" } } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Checked snapshot</title>");
    for (const expected of ["upload_interrupted", "archive_unavailable"]) {
      await assert.rejects(run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env }), (error: unknown) => {
        assert.match((error as { stdout: string }).stdout, new RegExp(expected)); return true;
      });
    }
    assert.equal(puts, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("watching an unchanged operation does not rewrite durable project state", async () => {
  const { stat } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "og-deploy-watch-"));
  const path = join(root, ".opengame", "project.json");
  const id = "11111111-1111-4111-8111-111111111111";
  let polls = 0; const observedInodes: number[] = [];
  const op = (state: string) => ({ id, state, gameId: "22222222-2222-4222-8222-222222222222", releaseId: "33333333-3333-4333-8333-333333333333", error: null });
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === "/api/v1/deploys") { req.resume(); res.end(JSON.stringify({ operation: op("queued") })); return; }
    assert.equal(req.url, `/api/v1/operations/${id}`);
    const inode = (await stat(path)).ino;
    observedInodes.push(inode); polls++;
    res.end(JSON.stringify({ operation: op(polls < 2 ? "queued" : "ready") }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const env = { ...process.env, OPENGAME_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Watch</title>");
    const completed = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env });
    assert.equal(JSON.parse(completed.stdout.trim().split("\n").at(-1)!).data.state, "ready");
    assert.equal(polls, 2);
    assert.equal(observedInodes[0], observedInodes[1]);
    assert.equal(JSON.parse(await readFile(path, "utf8")).deploy.terminal, true);
    assert.notEqual((await stat(path)).ino, observedInodes[0]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("an interrupted upload is retried in the same run with a fresh URL, then stops clearly", async () => {
  for (const failures of [2, 3]) {
    const root = await mkdtemp(join(tmpdir(), "og-deploy-retry-"));
    let origin = "", puts = 0, posts = 0, state = "uploading";
    const id = "11111111-1111-4111-8111-111111111111";
    const op = () => ({ id, state, gameId: null, releaseId: null, error: null });
    let size = 0;
    const upload = () => ({ url: `${origin}/storage?try=${puts + 1}`, headers: { "content-type": "application/zip", "content-length": String(size), "if-none-match": "*" } });
    const server = createServer(async (req, res) => {
      if (replyBootstrap(req, res, token)) return;
      if (req.url!.startsWith("/storage")) {
        for await (const chunk of req) void chunk;
        if (++puts <= failures) { res.destroy(); return; }
        res.statusCode = 200; res.end(); return;
      }
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
      if (req.url === "/api/v1/deploys") {
        let data = ""; for await (const chunk of req) data += chunk;
        size = JSON.parse(data).byteSize;
        res.end(JSON.stringify({ operation: op(), upload: upload() })); return;
      }
      if (req.url === `/api/v1/operations/${id}/upload` && req.method === "POST") { posts++; res.end(JSON.stringify({ operation: op(), upload: upload() })); return; }
      if (req.url === `/api/v1/operations/${id}/upload` && req.method === "PUT") state = "queued";
      res.end(JSON.stringify({ operation: op() }));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
    try {
      await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
      await writeFile(join(root, "index.html"), "<!doctype html><title>Retried</title>");
      const result = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env }).then(r => ({ code: 0, stdout: r.stdout }), (e: { code: number; stdout: string }) => e);
      const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
      const retries = events.filter(event => event.code === "upload_retrying");
      if (failures < LIMITS.platform.deploy.uploadAttemptsMax) {
        assert.equal(result.code, 0, result.stdout);
        assert.equal(events.at(-1).data.state, "queued");
        assert.deepEqual([puts, posts, retries.length], [failures + 1, failures, failures]);
        assert.match(retries[0].message, /interrupted \(the connection dropped\)\. Trying again, 2 of 3\./);
      } else {
        assert.equal(result.code, 5);
        assert.equal(events.at(-1).code, "upload_interrupted");
        assert.match(events.at(-1).message, /did not finish after 3 tries; the last time the connection dropped\. Your game is fine/);
        assert.deepEqual([puts, posts], [3, 2]);
      }
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
  }
});

test("a redeploy says it goes to review by itself and replaces the older release in review", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-review-"));
  const id = "11111111-1111-4111-8111-111111111111", gameId = "22222222-2222-4222-8222-222222222222";
  const submissionId = "44444444-4444-4444-8444-444444444444", older = "55555555-5555-4555-8555-555555555555", newer = "66666666-6666-4666-8666-666666666666";
  const ready = { id, state: "ready", gameId, releaseId: newer, error: null, publicId: "orbit123", previewUrl: "/g/orbit123" };
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === `/api/v1/submissions/${submissionId}`) {
      res.end(JSON.stringify({ submission: { id: submissionId, ref: "SUB-1090", state: "review", releaseId: older, gameId, gamePublicId: "orbit123", submittedAt: "2026-10-05T12:56:11Z",
        certifiedAt: "2026-10-05T12:57:00Z", jam: null, certifyUrl: null, gameUrl: "http://localhost/g/orbit123", queuePosition: 1, outcome: null, replacedBy: null, replayed: false, existing: false } })); return;
    }
    for await (const chunk of req) void chunk;
    res.end(JSON.stringify({ operation: ready, uploaded: true }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Newer</title>");
    await mkdir(join(root, ".opengame"), { recursive: true });
    await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, gameId,
      submit: { key: "k", request: { releaseId: older, jam: null }, submissionId } }));
    const result = await run(process.execPath, [binary, "deploy", root, "--jsonl"], { env });
    const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    const notice = events.find(event => event.code === "review_continues");
    assert.equal(notice?.message, "SUB-1090 has release 55555555 in review (With a person). This release goes to review by itself and replaces it.");
    assert.equal(events.at(-1).data.state, "ready");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("an interrupted upload whose retry the server says cannot help reports the server's answer", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-retry-never-"));
  const id = "11111111-1111-4111-8111-111111111111", requestId = "77777777-7777-4777-8777-777777777777";
  let origin = "", size = 0;
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    if (req.url!.startsWith("/storage")) { for await (const chunk of req) void chunk; res.destroy(); return; }
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === `/api/v1/operations/${id}/upload` && req.method === "POST") { res.statusCode = 500; res.end(JSON.stringify({ error: "internal_error", message: "Something broke.", retry: "never", requestId })); return; }
    let data = ""; for await (const chunk of req) data += chunk;
    size = JSON.parse(data).byteSize;
    res.end(JSON.stringify({ operation: { id, state: "uploading", gameId: null, releaseId: null, error: null },
      upload: { url: `${origin}/storage`, headers: { "content-type": "application/zip", "content-length": String(size), "if-none-match": "*" } } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Never</title>");
    const failure = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env: { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" } })
      .then(() => null, (e: { stdout: string }) => e);
    const last = JSON.parse(failure!.stdout.trim().split("\n").at(-1)!);
    assert.notEqual(last.code, "upload_interrupted", "the server's answer is not hidden behind the upload's");
    assert.ok(JSON.stringify(last).includes(requestId), "its request id reaches the person");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("an oversized saved file transport starts a new direct ZIP operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-old-file-upload-"));
  const oldKey = "old-files-key";
  const oldId = "11111111-1111-4111-8111-111111111111";
  const nextId = "22222222-2222-4222-8222-222222222222";
  const keys: string[] = [];
  let origin = "";
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === "/api/v1/deploys") {
      let text = ""; for await (const part of req) text += part;
      const request = JSON.parse(text);
      assert.equal(request.files, undefined);
      keys.push(String(req.headers["idempotency-key"]));
      res.end(JSON.stringify({ operation: { id: nextId, state: "queued", gameId: null, releaseId: null, error: null } })); return;
    }
    if (req.url === `/api/v1/operations/${oldId}`) {
      res.end(JSON.stringify({ operation: { id: oldId, state: "uploading", gameId: null, releaseId: null, error: null } })); return;
    }
    assert.fail(`The obsolete file transport must not be retried: ${req.method} ${req.url}`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Current files</title>");
    await withProject(root, origin, async (state, save) => {
      state.deploy = { key: oldKey, transport: "files", operationId: oldId, request: {
        byteSize: LIMITS.platform.incrementalUpload.archiveBytesMax + 1, fileCount: 1, sha256: "a".repeat(64),
        manifest, metadata: "preserve", metadataRevision: null } };
      await save();
    });
    await assert.rejects(run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait", "--idempotency-key", oldKey], { env }),
      (error: unknown) => /without --idempotency-key/.test((error as { stdout: string }).stdout));
    const result = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env });
    const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    assert.ok(events.some(event => event.code === "upload_restarted"));
    assert.equal(keys.length, 1);
    assert.notEqual(keys[0], oldKey);
    const saved = JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8"));
    assert.equal(saved.deploy.transport, undefined);
    assert.equal(saved.deploy.operationId, nextId);
  } finally { server.close(); await rm(root, { recursive: true, force: true }); }
});


test("a saved oversized file upload recovers a remotely ready release before restarting", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-old-file-ready-"));
  const oldId = "11111111-1111-4111-8111-111111111111";
  const gameId = "22222222-2222-4222-8222-222222222222";
  const releaseId = "33333333-3333-4333-8333-333333333333";
  const remote = { id: oldId, state: "ready", gameId, releaseId, error: null,
    metadata: { revision: 3, source: "local", keptFields: [] } };
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === `/api/v1/operations/${oldId}`) { res.end(JSON.stringify({ operation: remote })); return; }
    if (req.url === `/api/v1/games/${gameId}`) { res.end(JSON.stringify({ game: { id: gameId, submission: null } })); return; }
    assert.fail(`The completed upload must not start another scan: ${req.method} ${req.url}`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Current files</title>");
    await withProject(root, origin, async (state, save) => {
      state.deploy = { key: "old-ready-key", transport: "files", operationId: oldId, request: {
        byteSize: LIMITS.platform.incrementalUpload.archiveBytesMax + 1, fileCount: 1, sha256: "a".repeat(64),
        manifest, metadata: "preserve", metadataRevision: null } };
      await save();
    });
    const result = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--no-wait"], { env });
    const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(events.at(-1).data.operationId, oldId);
    assert.equal(events.at(-1).data.state, "ready");
    assert.equal(events.some(event => event.code === "upload_restarted"), false);
    const saved = JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8"));
    assert.equal(saved.gameId, gameId);
    assert.equal(saved.metadataRevision, 3);
    assert.equal(saved.deploy.uploaded, true);
  } finally { server.close(); await rm(root, { recursive: true, force: true }); }
});

/* 28 Oct 2026: a plain deploy returns once the upload is in. With 500 MB uploads the scan
   alone outlasted the five-minute watch, so the default held a session for five minutes and
   then exited 5 with nothing decided. These pin the new default, from both sides: it reads
   the operation no further after confirming the upload, and it hands over the deploy's page
   before the bytes go, so the address exists for the whole of a long upload. */
test("a plain deploy returns once the upload is confirmed, with the deployment page as its address", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-return-"));
  const id = "11111111-1111-4111-8111-111111111111";
  let origin = "", polls = 0, size = 0;
  const seen: string[] = [];
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    seen.push(`${req.method} ${req.url}`);
    if (req.url === "/storage") { for await (const chunk of req) void chunk; res.end(); return; }
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === `/api/v1/operations/${id}/upload` && req.method === "PUT") {
      res.end(JSON.stringify({ operation: { id, state: "queued", gameId: null, releaseId: null, error: null } })); return;
    }
    if (req.url?.startsWith(`/api/v1/operations/${id}`)) { polls++; res.end(JSON.stringify({ operation: { id, state: "checking", gameId: null, releaseId: null, error: null } })); return; }
    let data = ""; for await (const chunk of req) data += chunk;
    size = JSON.parse(data).byteSize;
    res.end(JSON.stringify({ operation: { id, state: "uploading", gameId: null, releaseId: null, error: null },
      upload: { url: `${origin}/storage`, headers: { "content-type": "application/zip", "content-length": String(size), "if-none-match": "*" } } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Returns</title>");
    const started = Date.now();
    const result = await run(process.execPath, [binary, "deploy", root, "--jsonl"], { env });
    const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    const page = `${origin}/settings/deployments/${id}`;
    const notice = events.find(event => event.code === "deployment_page");
    assert.equal(notice?.url, page);
    const firstUpload = events.findIndex(event => event.type === "progress" && event.stage === "upload");
    assert.ok(firstUpload > -1, "the upload reports its progress");
    assert.ok(events.indexOf(notice) < firstUpload, "the address is given before the upload's progress");
    assert.ok(seen.indexOf("PUT /storage") > -1, "the bytes were sent");
    const last = events.at(-1);
    assert.equal(last.type, "result");
    assert.equal(last.data.done, false);
    assert.equal(last.data.url, page);
    assert.equal(last.data.deploymentUrl, page);
    assert.match(last.data.message, /you can close this terminal/);
    assert.equal(polls, 0, "nothing reads the operation after the upload is confirmed");
    assert.ok(Date.now() - started < 30_000);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

/* The one flow makes the jam entry at the details step, after review. A deploy the jam cannot
   take (a mod, the entry limit, the close) is told so when it is uploaded, once, before review
   is paid for, and the deploy itself goes on: the marketplace still takes it. */
test("a deploy the jam cannot take is told why once at upload, and still uploads", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-jam-notice-"));
  const id = "11111111-1111-4111-8111-111111111111";
  let origin = "", size = 0;
  const jamNotice = { code: "kind_not_in_jam", message: "Fixture jam takes games and worlds, so this mod cannot be entered. You can still publish it to the marketplace." };
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    if (req.url === "/storage") { for await (const chunk of req) void chunk; res.end(); return; }
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === `/api/v1/operations/${id}/upload` && req.method === "PUT") {
      res.end(JSON.stringify({ operation: { id, state: "queued", gameId: null, releaseId: null, error: null, jamNotice } })); return;
    }
    let data = ""; for await (const chunk of req) data += chunk;
    size = JSON.parse(data).byteSize;
    res.end(JSON.stringify({ operation: { id, state: "uploading", gameId: null, releaseId: null, error: null, jamNotice },
      upload: { url: `${origin}/storage`, headers: { "content-type": "application/zip", "content-length": String(size), "if-none-match": "*" } } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Jam notice</title>");
    const result = await run(process.execPath, [binary, "deploy", root, "--jsonl"], { env });
    const events = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    const notices = events.filter(event => event.code === "jam_not_entered");
    assert.equal(notices.length, 1, "said once, though both answers carry it");
    assert.equal(notices[0].message, jamNotice.message);
    assert.equal(events.at(-1).type, "result", "and the deploy carries on");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("--wait and --no-wait together are refused before anything is built", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-flags-"));
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Flags</title>");
    const failure = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait", "--no-wait"], { env: { ...process.env, OPENGAME_API_URL: "http://127.0.0.1:9", OPENGAME_TOKEN: token } })
      .then(() => null, (e: { code: number; stdout: string }) => e);
    assert.equal(failure?.code, 2);
    assert.equal(JSON.parse(failure!.stdout.trim().split("\n").at(-1)!).code, "conflicting_flags");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("--timeout on its own still waits, since a job that sets it asked how long to wait", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-deploy-timeout-"));
  const id = "11111111-1111-4111-8111-111111111111";
  let polls = 0;
  const op = (state: string) => ({ id, state, gameId: "22222222-2222-4222-8222-222222222222", releaseId: "33333333-3333-4333-8333-333333333333", error: null });
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === "/api/v1/deploys") { req.resume(); res.end(JSON.stringify({ operation: op("queued") })); return; }
    polls++; res.end(JSON.stringify({ operation: op("ready") }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const env = { ...process.env, OPENGAME_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Timeout</title>");
    const completed = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--timeout", "30"], { env });
    assert.equal(JSON.parse(completed.stdout.trim().split("\n").at(-1)!).data.state, "ready");
    assert.ok(polls >= 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { nextWatchWait } from "../src/deploy";
import { cleanEnv, events, fakeApi, reply, spawnCli, tempDir, token } from "./shell";

const gameId = "11111111-1111-4111-8111-111111111111";
const id = "33333333-3333-4333-8333-333333333333";
const cursor = "a".repeat(64);
const op = { id, gameId, state: "checking", releaseId: null, error: null };

async function runStatus(mode: "changed" | "reconnect" | "revoked" | "fatal" | "legacy" | "timeout") {
  let reads = 0;
  const times: number[] = [];
  const api = await fakeApi((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game: { id: gameId, title: "Orbit", publicId: "orbitrun01", visibility: "draft", latestOperation: op, publication: null } });
    if (!req.url?.startsWith(`/api/v1/operations/${id}`)) return;
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    assert.equal(req.method, "GET");
    assert.equal(req.headers["idempotency-key"], undefined);
    const request = new URL(req.url, api.origin);
    times.push(Date.now()); reads++;
    if (reads === 1) {
      assert.equal(request.search, "");
      return reply(res, 200, { operation: { ...op, ...(mode === "legacy" ? {} : { waitCursor: cursor }) } });
    }
    if (mode === "legacy") assert.equal(request.search, "");
    else {
      assert.equal(request.searchParams.get("after"), cursor);
      assert.ok(/^\d+$/.test(request.searchParams.get("waitMs")!));
      assert.ok(Number(request.searchParams.get("waitMs")) <= 20000);
    }
    if (mode === "revoked") return reply(res, 401, { error: "token_revoked" });
    if (mode === "fatal") return reply(res, 503, { error: "temporarily_unavailable", retry: "never", message: "Contact support." });
    if (mode === "reconnect" && reads === 2) { res.destroy(); return; }
    if (mode === "timeout") return reply(res, 200, { operation: { ...op, waitCursor: cursor } });
    return reply(res, 200, { operation: { ...op, state: "ready", releaseId: "44444444-4444-4444-8444-444444444444", ...(mode === "legacy" ? {} : { waitCursor: "b".repeat(64) }) } });
  });
  const root = await tempDir("og-status-wait-");
  try {
    await mkdir(join(root.dir, ".opengame"));
    await writeFile(join(root.dir, ".opengame/project.json"), JSON.stringify({ version: 1, origin: api.origin, gameId }));
    const result = await spawnCli(["status", root.dir, "--watch", "--timeout", mode === "timeout" ? "1.23456" : "7", "--jsonl"], {
      env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }), deadlineMs: 12000,
    });
    assert.equal(result.hung, false);
    assert.ok(!result.stdout.includes(token));
    return { result, reads, times, all: events(result.stdout), seen: api.seen };
  } finally { await api.close(); await root.remove(); }
}

test("bundled watch reconnects with authenticated cursor GETs and preserves immediate polling for old servers", async () => {
  for (const mode of ["changed", "reconnect", "legacy"] as const) {
    const { result, reads, times, all, seen } = await runStatus(mode);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.equal((all.at(-1)!.data as { state: string }).state, "ready");
    assert.equal(reads, mode === "reconnect" ? 3 : 2);
    if (mode === "legacy") assert.ok(times[1] - times[0] >= 1900);
    assert.ok(seen.every(request => request.method === "GET"), "watch never creates or replays mutations");
  }
});

test("revocation and nonretryable server failures stop watch without retrying", async () => {
  for (const mode of ["revoked", "fatal"] as const) {
    const { result, reads } = await runStatus(mode);
    assert.equal(result.code, mode === "revoked" ? 3 : 5, result.stdout);
    assert.equal(reads, 2);
    assert.match(result.stdout, mode === "revoked" ? /token_revoked/ : /Contact support/);
  }
});

test("a pace that reaches the deadline does not schedule another read", () => {
  const now = 1_000_000;
  const paced = nextWatchWait(now, now + 30, 2_000);
  assert.equal(paced.read, false);
  assert.equal(paced.waitMs, 30);
  assert.deepEqual(nextWatchWait(now, now + 5_000, 0), { read: true, waitMs: 0 });
  assert.deepEqual(nextWatchWait(now, now + 5_000, 2_000), { read: true, waitMs: 2_000 });
  assert.deepEqual(nextWatchWait(now + 5_000, now + 5_000, 2_000), { read: false, waitMs: 0 });
});

test("fractional watch deadlines remain bounded and a prematurely answered wait cannot spin", async () => {
  const { result, reads } = await runStatus("timeout");
  assert.equal(result.code, 5, result.stdout);
  assert.match(result.stdout, /checks_pending/);
  assert.ok(result.ms < 4000);
  assert.equal(reads, 2, "the unchanged immediate answer is paced until the deadline");
});


test("the watch deadline aborts a held HTTP request and closes the client", async () => {
  let disconnected = false;
  const server = createServer((req, res) => {
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game: { id: gameId, title: "Orbit", publicId: "orbitrun01", visibility: "draft", latestOperation: op, publication: null } });
    if (req.url === `/api/v1/operations/${id}`) return reply(res, 200, { operation: { ...op, waitCursor: cursor } });
    if (req.url?.startsWith(`/api/v1/operations/${id}?`)) {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      res.once("close", () => { disconnected = true; });
      return;
    }
    reply(res, 404, { error: "not_found" });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const root = await tempDir("og-status-cancel-");
  try {
    await mkdir(join(root.dir, ".opengame"));
    await writeFile(join(root.dir, ".opengame/project.json"), JSON.stringify({ version: 1, origin, gameId }));
    const run = await spawnCli(["status", root.dir, "--watch", "--timeout", "1", "--jsonl"], {
      env: cleanEnv({ OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }), deadlineMs: 5000,
    });
    assert.equal(run.hung, false);
    assert.equal(run.code, 5, run.stdout);
    assert.match(run.stdout, /checks_pending/);
    assert.ok(run.ms < 4000);
    assert.equal(disconnected, true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await root.remove();
  }
});

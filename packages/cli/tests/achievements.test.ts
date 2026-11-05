import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { readProject } from "../src/project";
import { LIMITS } from "@opengame/shared";
import { replyBootstrap, startupInformation } from "./bootstrap-fixture";

/* The manifest round trip for achievements: declared in opengame.json, checked by
   opengame check, carried by a deploy, and saved through the definitions API once the
   deploy is ready. Every request goes to a server on 127.0.0.1 that this file starts;
   nothing reaches production or a dev server on 4590. */

const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const gameId = "44444444-4444-4444-8444-444444444444";
const base = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
type Definition = { achievement_id: string; title: string; description: string; active: boolean };
type Put = { achievementId: string; title: string; description: string; active: boolean; operationId: string };
const operationId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const lines = (stdout: string) => stdout.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));

/** A platform that answers deploys as ready at once and keeps achievement definitions the
 * way the API does: one row per id, replaced in full by each PUT, never deleted. */
async function platform() {
  const definitions = new Map<string, Definition>();
  const puts: Put[] = [];
  const unexpected: string[] = [];
  let operations = 0;
  let refuse: { status: number; error: string; message?: string } | null = null;
  let rejectManifest = false;
  const operationId = () => `11111111-1111-4111-8111-${String(operations).padStart(12, "0")}`;
  const releaseId = () => `22222222-2222-4222-8222-${String(operations).padStart(12, "0")}`;
  const latest = () => ({ id: operationId(), state: "ready", gameId, releaseId: releaseId(), error: null });
  const reply = (res: ServerResponse, status: number, body: unknown) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  const read = async (req: IncomingMessage) => { let body = ""; for await (const chunk of req) body += chunk; return JSON.parse(body); };
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") return reply(res, 200, startupInformation());
    if (req.url === "/api/v1/deploys" && req.method === "POST") {
      const body = await read(req);
      // The manifest travels with the deploy, achievements included, as declared.
      assert.deepEqual(body.manifest.achievements, declaredNow);
      if (rejectManifest) return reply(res, 400, { error: "invalid_request", message: "Provide a valid manifest, byteSize, fileCount and sha256." });
      operations++;
      return reply(res, 200, { operation: latest() });
    }
    if (req.url === `/api/v1/games/${gameId}`) return reply(res, 200, { game: { id: gameId, publicId: "nightshift", title: base.title, visibility: "published", latestOperation: latest(),
      publication: { state: "published", releaseId: releaseId(), url: "https://opengame.io/g/nightshift", listed: false } } });
    if (req.url === `/api/v1/operations/${operationId()}`) return reply(res, 200, { operation: latest() });
    if (req.url === `/api/v1/games/${gameId}/achievements` && req.method === "GET") {
      return reply(res, 200, { gameId, achievements: [...definitions.values()], source: "game_reported" });
    }
    if (req.url === `/api/v1/games/${gameId}/achievements` && req.method === "PUT") {
      if (refuse) return reply(res, refuse.status, { error: refuse.error, message: refuse.message ?? "This token cannot change this game." });
      const body = await read(req) as Put;
      assert.deepEqual(Object.keys(body).sort(), ["achievementId", "active", "description", "operationId", "title"]);
      puts.push(body);
      definitions.set(body.achievementId, { achievement_id: body.achievementId, title: body.title, description: body.description, active: body.active });
      return reply(res, 200, { achievement: definitions.get(body.achievementId), source: "game_reported" });
    }
    unexpected.push(`${req.method} ${req.url}`);
    reply(res, 404, { error: "not_found", message: "Not here." });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let declaredNow: unknown;
  return {
    definitions, puts, unexpected,
    env: { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" },
    expect(achievements: unknown) { declaredNow = achievements; },
    refuse(value: typeof refuse) { refuse = value; },
    rejectManifest() { rejectManifest = true; },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

async function project(achievements?: unknown) {
  const root = await mkdtemp(join(tmpdir(), "og-achievements-"));
  await writeFile(join(root, "index.html"), "<!doctype html><title>Night shift</title>");
  await write(root, achievements);
  return root;
}
const write = (root: string, achievements?: unknown) =>
  writeFile(join(root, "opengame.json"), JSON.stringify(achievements === undefined ? base : { ...base, achievements }));

test("opengame check accepts declared achievements and names the field and the rule when one is wrong", async () => {
  const root = await project([{ id: "first_win", title: "First win", description: "Win a round." }, { id: "1-boss", title: "Beat the boss" }]);
  try {
    const accepted = spawnSync(process.execPath, [binary, "check", root, "--jsonl"], { encoding: "utf8" });
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    assert.ok(!accepted.stdout.includes("not a field"));
    const cap = LIMITS.analytics;
    const refused: [unknown, string, RegExp][] = [
      [[{ id: "First Win", title: "Win" }], "achievements.0.id", /lowercase letters, digits, hyphens and underscores/],
      [[{ id: "x".repeat(cap.achievementIdCharsMax + 1), title: "Win" }], "achievements.0.id", new RegExp(`at most ${cap.achievementIdCharsMax} characters`)],
      [[{ id: "win", title: "" }], "achievements.0.title", /Use 1 to/],
      [[{ id: "win", title: "Win", description: "d".repeat(cap.achievementDescriptionCharsMax + 1) }], "achievements.0.description", /Use 0 to/],
      [[{ id: "win", title: "Win" }, { id: "win", title: "Win twice" }], "achievements.1.id", /listed once/],
      [Array.from({ length: cap.achievementDefinitionsMax + 1 }, (_, i) => ({ id: `a${i}`, title: "A" })), "achievements", new RegExp(`at most ${cap.achievementDefinitionsMax} achievements`)],
    ];
    for (const [achievements, field, message] of refused) {
      await write(root, achievements);
      const result = spawnSync(process.execPath, [binary, "check", root, "--jsonl"], { encoding: "utf8" });
      assert.equal(result.status, 1, field);
      const finding = lines(result.stdout).find(event => event.type === "finding")?.finding;
      assert.ok(finding, field);
      assert.equal(finding.evidence.file, "opengame.json");
      assert.ok(finding.evidence.observed.startsWith(`${field}: `), finding.evidence.observed);
      assert.match(finding.evidence.observed, message);
      assert.equal(finding.fault, "game");
    }
    // A field the API owns is not the manifest's: "active" is decided by what is declared.
    await write(root, [{ id: "win", title: "Win", active: false }]);
    const active = spawnSync(process.execPath, [binary, "check", root, "--jsonl"], { encoding: "utf8" });
    assert.equal(active.status, 1);
    assert.match(active.stdout, /achievements\.0\.active is not a field/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("deploy and status save only declared ids and leave dropped achievements unchanged", async () => {
  const api = await platform();
  const first = [{ id: "first_win", title: "First win", description: "Win a round." }, { id: "boss", title: "Beat the boss" }];
  const root = await project(first);
  try {
    api.definitions.set("by_hand", { achievement_id: "by_hand", title: "Made by hand", description: "", active: true });
    api.expect(first);
    await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env });
    assert.deepEqual(api.puts, [
      { achievementId: "first_win", title: "First win", description: "Win a round.", active: true, operationId: operationId(1) },
      { achievementId: "boss", title: "Beat the boss", description: "", active: true, operationId: operationId(1) },
    ]);

    const second = [{ id: "first_win", title: "First victory", description: "Win again." }];
    await write(root, second);
    await writeFile(join(root, "index.html"), "<!doctype html><title>Second build</title>");
    api.expect(second); api.puts.length = 0;
    await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env });
    assert.deepEqual(api.puts, [{ achievementId: "first_win", title: "First victory", description: "Win again.", active: true, operationId: operationId(2) }]);
    assert.equal(api.definitions.get("boss")?.active, true);

    // Force status to retry the new manifest so its write path is exercised too.
    const path = join(root, ".opengame", "project.json");
    const state = JSON.parse(await readFile(path, "utf8"));
    delete state.achievements.saved;
    await writeFile(path, JSON.stringify(state));
    api.puts.length = 0;
    await run(process.execPath, [binary, "status", root, "--jsonl"], { env: api.env });
    assert.deepEqual(api.puts, [{ achievementId: "first_win", title: "First victory", description: "Win again.", active: true, operationId: operationId(2) }]);
    assert.deepEqual(api.definitions.get("boss"), { achievement_id: "boss", title: "Beat the boss", description: "", active: true });
    assert.equal(api.definitions.get("by_hand")?.active, true);
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(saved.achievements, { gameId, saved: saved.deploy.operationId });

    for (const empty of [[], undefined]) {
      await write(root, empty);
      await writeFile(join(root, "index.html"), `<!doctype html><title>Empty ${String(empty)}</title>`);
      api.expect(empty); api.puts.length = 0;
      await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env });
      await run(process.execPath, [binary, "status", root, "--jsonl"], { env: api.env });
      assert.deepEqual(api.puts, []);
    }
    assert.equal(api.definitions.size, 3);
    assert.deepEqual(api.unexpected, []);
  } finally { await api.close(); await rm(root, { recursive: true, force: true }); }
});

test("a game that declares no achievements makes no achievement request", async () => {
  const api = await platform();
  const root = await project();
  try {
    api.expect(undefined);
    const events = lines((await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env })).stdout);
    assert.equal(api.puts.length, 0);
    assert.ok(!events.some(event => String(event.code ?? "").startsWith("achievements_")));
    assert.equal(JSON.parse(await readFile(join(root, ".opengame", "project.json"), "utf8")).achievements, undefined);
  } finally { await api.close(); await rm(root, { recursive: true, force: true }); }
});

test("a refused save is said without failing the deploy, and opengame status saves it once", async () => {
  const api = await platform();
  const declared = [{ id: "first_win", title: "First win" }];
  const root = await project(declared);
  try {
    api.expect(declared);
    api.refuse({ status: 403, error: "insufficient_scope" });
    const deployed = lines((await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env })).stdout);
    assert.equal(deployed.at(-1).type, "result");
    const notice = deployed.find(event => event.code === "achievements_not_saved");
    assert.match(notice.message, /first_win was not saved: this token cannot change achievements, and needs the Deploy scope/);
    assert.match(notice.message, /Run opengame status to try again\./);
    assert.ok(!notice.message.includes(token));
    assert.equal(api.puts.length, 0);

    api.refuse(null);
    const status = lines((await run(process.execPath, [binary, "status", root, "--jsonl"], { env: api.env })).stdout);
    assert.ok(status.some(event => event.code === "achievements_saved"));
    assert.deepEqual(api.puts, [{ achievementId: "first_win", title: "First win", description: "", active: true, operationId: operationId(1) }]);
    // Saved once per deploy: a second status repeats nothing, so a later hand edit stands.
    await run(process.execPath, [binary, "status", root, "--jsonl"], { env: api.env });
    assert.equal(api.puts.length, 1);
    assert.deepEqual(api.unexpected, []);
  } finally { await api.close(); await rm(root, { recursive: true, force: true }); }
});

test("old project.json declared history is ignored without blocking load or status", async () => {
  const api = await platform();
  const declared = [{ id: "first_win", title: "First win" }];
  const root = await project(declared);
  try {
    api.expect(declared);
    await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env });
    const path = join(root, ".opengame", "project.json");
    const state = JSON.parse(await readFile(path, "utf8"));
    state.achievements.declared = { retired: { title: "Retired", description: "", active: true, receipt: "a".repeat(64) } };
    await writeFile(path, JSON.stringify(state));
    assert.deepEqual((await readProject(root, api.env.OPENGAME_API_URL)).achievements, { gameId, saved: state.deploy.operationId });
    // The old history is unused even when a save must be retried.
    delete state.achievements.saved;
    await writeFile(path, JSON.stringify(state));
    api.puts.length = 0;
    await run(process.execPath, [binary, "status", root, "--jsonl"], { env: api.env });
    assert.deepEqual(api.puts, [{ achievementId: "first_win", title: "First win", description: "", active: true, operationId: operationId(1) }]);
    assert.equal(JSON.parse(await readFile(path, "utf8")).achievements.declared, undefined);
    assert.deepEqual(api.unexpected, []);
  } finally { await api.close(); await rm(root, { recursive: true, force: true }); }
});

test("an older server's manifest refusal explains how to deploy achievements", async () => {
  const api = await platform();
  const declared = [{ id: "boss", title: "Boss" }];
  const root = await project(declared);
  try {
    api.expect(declared); api.rejectManifest();
    const result = await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env }).catch(error => error);
    const event = lines(result.stdout).at(-1);
    assert.equal(event.code, "achievements_unsupported");
    assert.match(event.message, /may not accept achievements.*Deploy without the achievements field, or wait for the server update/);
    assert.deepEqual(api.puts, []);
  } finally { await api.close(); await rm(root, { recursive: true, force: true }); }
});

test("an older deploy does not keep retrying over a newer one", async () => {
  const api = await platform();
  const declared = [{ id: "first_win", title: "First win" }];
  const root = await project(declared);
  const message = "A newer deploy already saved this game’s achievements, so this older one left them unchanged.";
  try {
    api.expect(declared);
    api.refuse({ status: 409, error: "achievement_deploy_superseded", message });
    const deployed = lines((await run(process.execPath, [binary, "deploy", root, "--jsonl", "--wait"], { env: api.env })).stdout);
    const notice = deployed.find(event => event.code === "achievements_not_saved");
    assert.match(notice.message, /newer deploy already saved/);
    assert.equal(notice.message.includes("Run opengame status to try again"), false);
    api.puts.length = 0;
    await run(process.execPath, [binary, "status", root, "--jsonl"], { env: api.env });
    assert.deepEqual(api.puts, []);
  } finally { await api.close(); await rm(root, { recursive: true, force: true }); }
});

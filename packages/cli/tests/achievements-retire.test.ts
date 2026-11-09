import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { CreatorGame } from "@opengame/protocol";

/**
 * `opengame achievements` and `opengame achievements retire <id>` against a stand-in server:
 * the list, what a retirement sends (the definition as the server holds it, with active
 * false), and that nothing is sent without --yes. Who may retire is the server's, and
 * the website's own route tests hold it.
 */
const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const GAME = "11111111-1111-4111-8111-111111111111";
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const game: CreatorGame = { id: GAME, publicId: "tiderunner", title: "Tide runner", visibility: "published", latestOperation: null };
type Answer = { status: number; body: unknown };

async function fake() {
  const state = { puts: [] as unknown[], answer: null as Answer | null, list: [
    { achievement_id: "first-lap", title: "First lap", description: "Finish a lap.", active: true },
    { achievement_id: "old-one", title: "Old one", description: null, active: false },
  ] };
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    let text = "";
    for await (const chunk of req) text += chunk;
    res.setHeader("content-type", "application/json");
    const send = (answer: Answer) => { res.statusCode = answer.status; res.end(JSON.stringify(answer.body)); };
    if (req.method === "GET" && (req.url === `/api/v1/games/${GAME}` || req.url === "/api/v1/games/tiderunner")) return send({ status: 200, body: { game } });
    if (req.url === `/api/v1/games/${GAME}/achievements`) {
      if (req.method === "GET") return send({ status: 200, body: { gameId: GAME, achievements: state.list, source: "game_reported" } });
      state.puts.push(JSON.parse(text));
      return send(state.answer ?? { status: 200, body: { achievement: { ...JSON.parse(text), active: false }, source: "game_reported" } });
    }
    send({ status: 404, body: { error: "not_found", message: "Not found." } });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return Object.assign(state, {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  });
}

async function linkedFolder(origin: string) {
  const root = await mkdtemp(join(tmpdir(), "og-achievements-"));
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Tide runner" }));
  await mkdir(join(root, ".opengame"));
  await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, gameId: GAME }));
  return root;
}

function cli(origin: string, cwd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1" };
  return async (...args: string[]) => {
    // A closed stdin and a deadline, so a change that asks a person fails here rather than waiting for ever.
    try { return { code: 0, event: JSON.parse((await run(process.execPath, [binary, ...args, "--jsonl"], { env, cwd, timeout: 20000 })).stdout.trim().split("\n").at(-1)!) }; }
    catch (error) {
      const failed = error as { code: number; stdout: string };
      return { code: failed.code, event: JSON.parse(failed.stdout.trim().split("\n").at(-1)!) };
    }
  };
}

test("achievements lists active and retired ones, and changes nothing", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { code, event } = await cli(server.origin, root)("achievements");
    assert.equal(code, 0);
    assert.match(event.data.message, /first-lap {2}active {2}First lap\nold-one {2}retired {2}Old one/);
    assert.deepEqual(server.puts, []);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("retire needs an id the game has and --yes from an agent, then sends the definition with active false", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const last = cli(server.origin, root);
    assert.deepEqual([(await last("achievements", "retire")).event.code], ["achievement_required"]);
    assert.deepEqual([(await last("achievements", "retire", "nope", "--yes")).event.code], ["achievement_not_found"]);
    assert.deepEqual([(await last("achievements", "remove", "first-lap")).event.code], ["arguments"]);
    const asked = await last("achievements", "retire", "first-lap");
    assert.deepEqual([asked.code, asked.event.code, asked.event.next], [2, "confirmation_required", "opengame achievements retire first-lap --yes"]);
    assert.deepEqual(server.puts, []);
    const already = await last("achievements", "retire", "old-one", "--yes");
    assert.match(already.event.data.message, /already retired/);
    assert.deepEqual(server.puts, []);
    const done = await last("achievements", "retire", "first-lap", "--yes");
    assert.equal(done.code, 0);
    assert.deepEqual(server.puts, [{ achievementId: "first-lap", title: "First lap", description: "Finish a lap.", active: false }]);
    assert.match(done.event.data.message, /^First lap is retired\. Players keep what they unlocked/);
    server.answer = { status: 403, body: { error: "insufficient_scope", message: "This token cannot do this. Create a token with the needed permission in OpenGame settings.", retry: "after-fix" } };
    const scoped = await last("achievements", "retire", "first-lap", "--yes");
    assert.deepEqual([scoped.code, scoped.event.code], [3, "insufficient_scope"]);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

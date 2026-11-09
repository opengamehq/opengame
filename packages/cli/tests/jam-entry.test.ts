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
 * `opengame jam withdraw` and `opengame jam reenter` against a stand-in server: what each
 * sends and prints, and that a withdrawal sends nothing without --yes. Who may do either is
 * the server's, and the website's own route tests hold it.
 */
const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const GAME = "11111111-1111-4111-8111-111111111111";
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const game: CreatorGame = { id: GAME, publicId: "tiderunner", title: "Tide runner", visibility: "published", latestOperation: null };
type Answer = { status: number; body: unknown };

async function fake() {
  const state = { requests: [] as { method: string; url: string }[], answer: null as Answer | null };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    state.requests.push({ method: req.method!, url: req.url! });
    res.setHeader("content-type", "application/json");
    const send = (answer: Answer) => { res.statusCode = answer.status; res.end(JSON.stringify(answer.body)); };
    if (req.method === "GET" && (req.url === `/api/v1/games/${GAME}` || req.url === "/api/v1/games/tiderunner")) return send({ status: 200, body: { game } });
    const act = req.url?.match(new RegExp(`^/api/v1/games/${GAME}/jam-entry/(withdraw|reenter)$`))?.[1];
    if (req.method === "POST" && act) {
      return send(state.answer ?? { status: 200, body: { apiVersion: "1", gameId: GAME, publicId: "tiderunner", entryId: "e1", entered: act === "reenter",
        url: "https://opengame.io/jam/entries", message: act === "reenter" ? "That entry is back in the jam, with the same reference and the same build." : "That entry is out of the jam and its place is free." } });
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
  const root = await mkdtemp(join(tmpdir(), "og-jam-entry-"));
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Tide runner" }));
  await mkdir(join(root, ".opengame"));
  await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, gameId: GAME }));
  return root;
}

function cli(origin: string, cwd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1" };
  return async (...args: string[]) => {
    try { return { code: 0, event: JSON.parse((await run(process.execPath, [binary, ...args, "--jsonl"], { env, cwd })).stdout.trim().split("\n").at(-1)!) }; }
    catch (error) {
      const failed = error as { code: number; stdout: string };
      return { code: failed.code, event: JSON.parse(failed.stdout.trim().split("\n").at(-1)!) };
    }
  };
}

test("withdraw asks an agent for --yes and sends nothing until it has it; reenter is not asked", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const last = cli(server.origin, root);
    const none = await last("jam");
    assert.deepEqual([none.code, none.event.code], [2, "jam_action_required"]);
    const asked = await last("jam", "withdraw");
    assert.deepEqual([asked.code, asked.event.code, asked.event.next], [2, "confirmation_required", "opengame jam withdraw --yes"]);
    assert.ok(!server.requests.some(r => r.method === "POST"));
    const out = await last("jam", "withdraw", "--yes");
    assert.equal(out.code, 0);
    assert.deepEqual([out.event.data.action, out.event.data.entered], ["withdraw", false]);
    assert.match(out.event.data.message, /^That entry is out of the jam/);
    const back = await cli(server.origin, tmpdir())("jam", "reenter", "--game", "tiderunner");
    assert.equal(back.code, 0);
    assert.deepEqual(server.requests.filter(r => r.method === "POST").map(r => r.url), [`/api/v1/games/${GAME}/jam-entry/withdraw`, `/api/v1/games/${GAME}/jam-entry/reenter`]);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("the server's refusal is printed in its words, with the shared table's exit", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    for (const [status, body, code, exit] of [
      [409, { error: "at_entry_limit", message: "You already have the most entries this jam takes. Withdraw one on your jam entries page before entering another game.", retry: "after-fix" }, "at_entry_limit", 2],
      [409, { error: "reenter_closed", message: "Nothing changed. That jam is not taking entries, so the entry stays withdrawn. Write to team@opengame.io if you need it back in.", retry: "never" }, "reenter_closed", 2],
      [404, { error: "jam_entry_not_found", message: "This game has no withdrawn jam entry to put back.", retry: "never" }, "jam_entry_not_found", 2],
      [403, { error: "jam_entry_held", message: "Nothing changed. This account cannot enter the jam right now, so the entry stays withdrawn. Write to team@opengame.io if you think that is wrong.", retry: "never" }, "jam_entry_held", 3],
    ] as const) {
      server.answer = { status, body };
      const refused = await cli(server.origin, root)("jam", "reenter");
      assert.deepEqual([refused.code, refused.event.code, refused.event.message], [exit, code, body.message], code);
    }
    server.answer = { status: 404, body: { error: "not_found", message: "Not found." } };
    const older = await cli(server.origin, root)("jam", "reenter");
    assert.deepEqual([older.code, older.event.code], [5, "edit_unavailable"]);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

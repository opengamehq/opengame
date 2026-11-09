import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { CreatorGame, GameRelease } from "@opengame/protocol";
import { AMBIENT, ttyWrap } from "./shell";

/**
 * `opengame releases` and `opengame rollback` against a stand-in server: what each sends,
 * what each prints, when it asks, and that nothing is sent without an answer.
 */
const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const GAME = "11111111-1111-4111-8111-111111111111";
const LIVE = "aaaaaaaa-1111-4111-8111-111111111111";
const BEFORE = "bbbbbbbb-2222-4222-8222-222222222222";
const TWIN = "bbbbbbbb-3333-4333-8333-333333333333";
const CLEANED = "cccccccc-4444-4444-8444-444444444444";
const VERSION = "dddddddd-5555-4555-8555-555555555555";
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const game: CreatorGame = { id: GAME, publicId: "tiderunner", title: "Tide runner", visibility: "published", latestOperation: null };
const row = (id: string, extra: Partial<GameRelease>): GameRelease => ({ id, short: id.slice(0, 8), versionId: null, createdAt: "2026-11-07T18:00:00.000Z",
  title: "Tide runner", status: "previously_live", label: "Previously live", live: false, newest: false, cleaned: false, ready: true, rollback: true, ...extra });

type Answer = { status: number; body: unknown };
interface Fake { origin: string; requests: { method: string; url: string }[]; releases: GameRelease[]; rollback: Answer; list: Answer | null; close(): Promise<void> }

async function fake(): Promise<Fake> {
  const state = {
    requests: [] as { method: string; url: string }[],
    releases: [row(LIVE, { status: "published", label: "Published", live: true, newest: true, rollback: false, versionId: VERSION }),
      row(BEFORE, {}), row(TWIN, {}), row(CLEANED, { status: "cleaned", label: "History only", cleaned: true, rollback: false })],
    rollback: { status: 200, body: { apiVersion: "1", gameId: GAME, publicId: "tiderunner", releaseId: BEFORE, versionId: VERSION, swapped: true, url: "https://opengame.io/g/tiderunner" } } as Answer,
    list: null as Answer | null,
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    state.requests.push({ method: req.method!, url: req.url! });
    res.setHeader("content-type", "application/json");
    const send = (answer: Answer) => { res.statusCode = answer.status; res.end(JSON.stringify(answer.body)); };
    if (req.method === "GET" && (req.url === `/api/v1/games/${GAME}` || req.url === "/api/v1/games/tiderunner")) return send({ status: 200, body: { game } });
    if (req.method === "GET" && req.url === `/api/v1/games/${GAME}/releases`) {
      return send(state.list ?? { status: 200, body: { apiVersion: "1", gameId: GAME, publicId: "tiderunner", live: true, rollbackBlocked: null, releases: state.releases } });
    }
    if (req.method === "POST" && req.url?.startsWith(`/api/v1/games/${GAME}/releases/`) && req.url.endsWith("/rollback")) return send(state.rollback);
    send({ status: 404, body: { error: "not_found", message: "Not found." } });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return Object.assign(state, {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  });
}

async function linkedFolder(origin: string) {
  const root = await mkdtemp(join(tmpdir(), "og-releases-"));
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Tide runner" }));
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(root, ".opengame"));
  await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, gameId: GAME }));
  return root;
}

function cli(origin: string, cwd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1" };
  const events = async (...args: string[]) => {
    try { return { code: 0, events: (await run(process.execPath, [binary, ...args, "--jsonl"], { env, cwd })).stdout.trim().split("\n").map(line => JSON.parse(line)) }; }
    catch (error) {
      const failed = error as { code: number; stdout: string };
      return { code: failed.code, events: failed.stdout.trim().split("\n").map(line => JSON.parse(line)) };
    }
  };
  return { env, events, last: async (...args: string[]) => { const out = await events(...args); return { code: out.code, event: out.events.at(-1) }; } };
}

test("releases lists the linked game's releases, live first, with what can go back", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    const { code, event } = await last("releases");
    assert.equal(code, 0);
    assert.equal(event.type, "result");
    assert.equal(event.command, "releases");
    assert.deepEqual(event.data.releases.map((r: GameRelease) => [r.short, r.live, r.rollback]),
      [["aaaaaaaa", true, false], ["bbbbbbbb", false, true], ["bbbbbbbb", false, true], ["cccccccc", false, false]]);
    assert.equal(event.data.url, `${server.origin}/settings/games/tiderunner`);
    assert.match(event.data.message, /^Tide runner, newest first/);
    assert.match(event.data.message, /aaaaaaaa {2}.*Live, Published/);
    assert.match(event.data.message, /bbbbbbbb {2}.*Previously live, can be made live again/);
    assert.match(event.data.message, /Make one live again with opengame rollback <release>\./);
    // Named with --game, from a folder that is not linked at all.
    const elsewhere = cli(server.origin, tmpdir());
    assert.equal((await elsewhere.last("releases", "--game", "tiderunner")).event.data.gameId, GAME);
    const unlinked = await elsewhere.last("releases");
    assert.equal(unlinked.event.code, "not_linked");
    assert.equal(unlinked.code, 2);
    // A game that is not live offers nothing, and says why; a publication on its way is said.
    server.list = { status: 200, body: { gameId: GAME, publicId: "tiderunner", live: false, rollbackBlocked: null, releases: server.releases.map(r => ({ ...r, live: false, rollback: false })) } };
    assert.match((await last("releases")).event.data.message, /Nothing can be made live again while the game is not live\./);
    server.list = { status: 200, body: { gameId: GAME, publicId: "tiderunner", live: true, rollbackBlocked: "A release is being published now. You can roll back once it is live.", releases: server.releases } };
    assert.match((await last("releases")).event.data.message, /A release is being published now\./);
    assert.ok(server.requests.every(r => r.method === "GET"));
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("rollback asks an agent for --yes and sends nothing until it has it", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    const missing = await last("rollback");
    assert.deepEqual([missing.code, missing.event.code], [2, "release_required"]);
    const asked = await last("rollback", "cccccccc");
    assert.deepEqual([asked.code, asked.event.code], [2, "confirmation_required"]);
    assert.equal(asked.event.next, "opengame rollback cccccccc --yes");
    assert.match(asked.event.message, /Add --yes/);
    assert.ok(!server.requests.some(r => r.method === "POST"), "nothing is sent without --yes");

    const done = await last("rollback", BEFORE, "--yes");
    assert.equal(done.code, 0);
    assert.deepEqual(server.requests.filter(r => r.method === "POST").map(r => r.url), [`/api/v1/games/${GAME}/releases/${BEFORE}/rollback`]);
    assert.equal(done.event.data.swapped, true);
    assert.match(done.event.data.message, /^Release bbbbbbbb is live again\. Players get it from their next load\./);
    // By the start of the version it published, and with --game from anywhere.
    const elsewhere = cli(server.origin, tmpdir());
    assert.equal((await elsewhere.last("rollback", "cccccccc", "--game", "tiderunner", "--yes")).code, 0);
    assert.equal(server.requests.filter(r => r.method === "POST").at(-1)!.url, `/api/v1/games/${GAME}/releases/${CLEANED}/rollback`);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("rollback refuses a release it cannot name, and sends nothing", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    const short = await last("rollback", "bbbb", "--yes");
    assert.deepEqual([short.code, short.event.code], [2, "invalid_release"]);
    const twin = await last("rollback", "bbbbbbbb", "--yes");
    assert.deepEqual([twin.code, twin.event.code], [2, "release_ambiguous"]);
    assert.match(twin.event.message, new RegExp(`${BEFORE}, ${TWIN}`));
    const none = await last("rollback", "eeeeeeee", "--yes");
    assert.deepEqual([none.code, none.event.code], [2, "release_not_found"]);
    const bad = await last("rollback", "../x", "--yes");
    assert.deepEqual([bad.code, bad.event.code], [2, "invalid_release"]);
    assert.ok(!server.requests.some(r => r.method === "POST"));
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

/* After host_failed the list already calls the release live, and its address is behind.
   Sending it again is the repair: the server writes the address and answers swapped:false. */
test("the live release is sent too, so running it again repairs a failed address", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    server.rollback = { status: 200, body: { apiVersion: "1", gameId: GAME, publicId: "tiderunner", releaseId: LIVE, versionId: VERSION, swapped: false, url: "https://opengame.io/g/tiderunner" } };
    // It is still a change to what players are served, so an agent still needs --yes.
    const unasked = await cli(server.origin, root).last("rollback", "aaaaaaaa");
    assert.deepEqual([unasked.code, unasked.event.code], [2, "confirmation_required"]);
    assert.ok(!server.requests.some(r => r.method === "POST"));
    const live = await cli(server.origin, root).last("rollback", "aaaaaaaa", "--yes");
    assert.equal(live.code, 0);
    assert.deepEqual(server.requests.filter(r => r.method === "POST").map(r => r.url), [`/api/v1/games/${GAME}/releases/${LIVE}/rollback`]);
    assert.match(live.event.data.message, /was already live\. Its address was written again/);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("the server's refusal is printed in its words, with the shared table's exit", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    for (const [status, body, code, exit] of [
      [409, { error: "release_never_live", message: "That release was never live, so it cannot be rolled back to. Submit it for review instead.", retry: "after-fix" }, "release_never_live", 2],
      [409, { error: "release_bytes_deleted", message: "That release’s files were cleaned up, so it cannot be served again.", retry: "never" }, "release_bytes_deleted", 2],
      [409, { error: "game_not_live", message: "This game is not live, so there is nothing to roll back. Put it back up first.", retry: "after-fix" }, "game_not_live", 2],
      [409, { error: "release_held_by_us", message: "We took the game off that release, so it cannot be made live again from here. Write to team@opengame.io to ask for another look, or submit a new release.", retry: "never" }, "release_held_by_us", 2],
      [409, { error: "publishing_in_progress", message: "A release of this game is being published right now. Roll back once it is live, in a minute or two.", retry: "later" }, "publishing_in_progress", 5],
      [403, { error: "forbidden", message: "This credential cannot change which release is live. Use a token with the submit permission, or opengame login." }, "forbidden", 3],
      [404, { error: "release_not_found", message: "That release is not one of this game’s.", retry: "after-fix" }, "release_not_found", 2],
    ] as const) {
      server.rollback = { status, body };
      const refused = await last("rollback", BEFORE, "--yes");
      assert.deepEqual([refused.code, refused.event.code], [exit, code], code);
      assert.equal(refused.event.message, body.message, code);
    }
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("a server from before these routes says to use the page rather than that the API is gone", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    server.list = { status: 404, body: { error: "not_found", message: "Not found." } };
    const { code, event } = await cli(server.origin, root).last("releases");
    assert.deepEqual([code, event.code], [5, "releases_unavailable"]);
    assert.match(event.message, /Releases tab/);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("help lists both commands, and rollback takes the release as its one argument", async () => {
  const server = await fake();
  try {
    const { last } = cli(server.origin, tmpdir());
    const help = (await last("help")).event.data;
    assert.ok(help.commands.releases && help.commands.rollback);
    assert.equal(help.commands.rollback.usage, "opengame rollback <release> [options]");
    assert.ok(help.commands.rollback.flags.some((flag: { name: string }) => flag.name === "--yes"));
    const extra = await last("rollback", BEFORE, "another");
    assert.deepEqual([extra.code, extra.event.code], [2, "arguments"]);
  } finally { await server.close(); }
});

test("a person is asked in the page's words, and no is nothing sent", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: server.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1", NO_COLOR: "1" };
    for (const key of AMBIENT) if (!["OPENGAME_TOKEN", "OPENGAME_API_URL", "NO_PROXY", "NO_COLOR"].includes(key)) delete env[key];
    const ask = async (answer: string) => {
      const [python, relay] = ttyWrap([process.execPath, binary, "rollback", "bbbbbbbb-2"]);
      const child = spawn(python, relay, { env, cwd: root, stdio: ["pipe", "pipe", "pipe"], timeout: 12000 });
      let transcript = "", answered = false;
      child.stderr.on("data", chunk => { transcript += chunk; });
      child.stdout.on("data", chunk => {
        transcript += chunk;
        if (!answered && transcript.includes("(y/N)")) { answered = true; child.stdin.write(answer); }
      });
      const [exit] = await once(child, "exit");
      return { exit, transcript };
    };
    const no = await ask("n\n");
    assert.match(no.transcript, /Make release bbbbbbbb live\? Players get it from their next load/);
    assert.match(no.transcript, /Cancelled\. Nothing changed\./);
    assert.equal(no.exit, 2);
    assert.ok(!server.requests.some(r => r.method === "POST"));
    const yes = await ask("y\n");
    assert.equal(yes.exit, 0, yes.transcript);
    assert.match(yes.transcript, /is live again/);
    assert.equal(server.requests.filter(r => r.method === "POST").length, 1);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

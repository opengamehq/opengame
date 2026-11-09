import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { CreatorGame } from "@opengame/protocol";
import { AMBIENT, ttyWrap } from "./shell";

/**
 * `opengame details` and `opengame handle` against a stand-in server: what each sends, what
 * each prints, and that a rename sends nothing without an answer. Who may do either is the
 * server's, and the website's own route tests hold it.
 */
const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const GAME = "11111111-1111-4111-8111-111111111111";
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const game: CreatorGame = { id: GAME, publicId: "tiderunner", title: "Tide runner", visibility: "published", latestOperation: null };

type Answer = { status: number; body: unknown };
interface Fake { origin: string; requests: { method: string; url: string; body: unknown }[]; answer: Answer | null; close(): Promise<void> }

async function fake(): Promise<Fake> {
  const state = { requests: [] as { method: string; url: string; body: unknown }[], answer: null as Answer | null };
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    let text = "";
    for await (const chunk of req) text += chunk;
    state.requests.push({ method: req.method!, url: req.url!, body: text ? JSON.parse(text) : null });
    res.setHeader("content-type", "application/json");
    const send = (answer: Answer) => { res.statusCode = answer.status; res.end(JSON.stringify(answer.body)); };
    if (req.method === "GET" && (req.url === `/api/v1/games/${GAME}` || req.url === "/api/v1/games/tiderunner")) return send({ status: 200, body: { game } });
    if (req.method === "GET" && req.url === `/api/v1/games/${GAME}/metadata`) {
      return send({ status: 200, body: { gameId: GAME, revision: 3, metadata: { title: "Tide runner", tagline: "Race the rain.", description: "A river game." },
        controllerSupport: false, compatibility: {}, cover: null } });
    }
    if (req.method === "PATCH" && req.url === `/api/v1/games/${GAME}/details`) {
      const body = state.requests.at(-1)!.body as Record<string, string>;
      return send(state.answer ?? { status: 200, body: { apiVersion: "1", gameId: GAME, publicId: "tiderunner", live: true, revision: 4,
        title: body.title ?? "Tide runner", tagline: body.tagline ?? "Race the rain.", description: body.description ?? "A river game.", url: "https://opengame.io/settings/games/tiderunner" } });
    }
    if (req.method === "POST" && req.url === "/api/v1/account/handle") {
      const body = state.requests.at(-1)!.body as { handle: string };
      return send(state.answer ?? { status: 200, body: { apiVersion: "1", handle: body.handle, previous: "rainmaker", url: `https://opengame.io/@${body.handle}` } });
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
  const root = await mkdtemp(join(tmpdir(), "og-edits-"));
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Tide runner" }));
  await mkdir(join(root, ".opengame"));
  await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, gameId: GAME }));
  return root;
}

function cli(origin: string, cwd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1" };
  return { last: async (...args: string[]) => {
    try { return { code: 0, event: JSON.parse((await run(process.execPath, [binary, ...args, "--jsonl"], { env, cwd })).stdout.trim().split("\n").at(-1)!) }; }
    catch (error) {
      const failed = error as { code: number; stdout: string };
      return { code: failed.code, event: JSON.parse(failed.stdout.trim().split("\n").at(-1)!) };
    }
  } };
}
const writes = (server: Fake) => server.requests.filter(r => r.method !== "GET");

test("details with no field prints the website's words and changes nothing", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { code, event } = await cli(server.origin, root).last("details");
    assert.equal(code, 0);
    assert.deepEqual([event.data.title, event.data.tagline, event.data.revision], ["Tide runner", "Race the rain.", 3]);
    assert.match(event.data.message, /^Title: Tide runner\nTagline: Race the rain\.\nDescription: A river game\./);
    assert.deepEqual(writes(server), []);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("details sends only the fields named, to the linked game or --game", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const saved = await cli(server.origin, root).last("details", "--title", "Tide runner 2", "--tagline", "Faster rain.");
    assert.equal(saved.code, 0);
    assert.deepEqual(writes(server).map(r => [r.method, r.url, r.body]), [["PATCH", `/api/v1/games/${GAME}/details`, { title: "Tide runner 2", tagline: "Faster rain." }]]);
    assert.match(saved.event.data.message, /^Saved\. Players see the new words now\./);
    const elsewhere = await cli(server.origin, tmpdir()).last("details", "--game", "tiderunner", "--description", "New.");
    assert.equal(elsewhere.code, 0);
    assert.deepEqual(writes(server).at(-1)!.body, { description: "New." });
    // The tab's empty tagline box, which the flag parser cannot take as an empty value.
    await cli(server.origin, root).last("details", "--clear-tagline");
    assert.deepEqual(writes(server).at(-1)!.body, { tagline: "" });
    const both = await cli(server.origin, root).last("details", "--clear-tagline", "--tagline", "x");
    assert.deepEqual([both.code, both.event.code], [2, "conflicting_flags"]);
    const unlinked = await cli(server.origin, tmpdir()).last("details", "--title", "x");
    assert.deepEqual([unlinked.code, unlinked.event.code], [2, "not_linked"]);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("details prints the server's refusal in its words, with the shared table's exit", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    for (const [status, body, code, exit] of [
      [400, { error: "invalid_details", message: "Keep the title under 60 characters.", retry: "after-fix" }, "invalid_details", 2],
      [403, { error: "words_refused", message: "This account can’t edit its games, so nothing was saved.", retry: "never" }, "words_refused", 3],
      [409, { error: "legacy_game_words", message: "This game’s words are changed on its entry page, so nothing was saved here.", retry: "never" }, "legacy_game_words", 2],
      [403, { error: "forbidden", message: "This credential cannot change a game’s words. Use a token with the submit permission, or opengame login." }, "forbidden", 3],
    ] as const) {
      server.answer = { status, body };
      const refused = await cli(server.origin, root).last("details", "--title", "x");
      assert.deepEqual([refused.code, refused.event.code, refused.event.message], [exit, code, body.message], code);
    }
    server.answer = { status: 404, body: { error: "not_found", message: "Not found." } };
    const older = await cli(server.origin, root).last("details", "--title", "x");
    assert.deepEqual([older.code, older.event.code], [5, "edit_unavailable"]);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("handle needs a name, and an agent without --yes sends nothing", async () => {
  const server = await fake();
  try {
    const { last } = cli(server.origin, tmpdir());
    const none = await last("handle");
    assert.deepEqual([none.code, none.event.code], [2, "handle_required_argument"]);
    const asked = await last("handle", "stormcaller");
    assert.deepEqual([asked.code, asked.event.code, asked.event.next], [2, "confirmation_required", "opengame handle stormcaller --yes"]);
    assert.deepEqual(writes(server), []);
    // Written with its @, as people write it.
    await last("handle", "@stormcaller", "--yes");
    assert.deepEqual(writes(server).map(r => r.body), [{ handle: "stormcaller" }]);
    server.requests.length = 0;
    const done = await last("handle", "stormcaller", "--yes");
    assert.equal(done.code, 0);
    assert.deepEqual(writes(server).map(r => [r.url, r.body]), [["/api/v1/account/handle", { handle: "stormcaller" }]]);
    assert.match(done.event.data.message, /^Your handle is @stormcaller\. @rainmaker still points to you\./);
    for (const [status, body, code, exit] of [
      [409, { error: "handle_unavailable", message: "That handle is already taken. Try another.", retry: "after-fix" }, "handle_unavailable", 2],
      [403, { error: "forbidden", message: "Only opengame login can rename your handle, not a token made in settings. Run opengame login, or rename it on the website." }, "forbidden", 3],
      [429, { error: "rate_limited", message: "That is a lot of handle changes for one day. Try again tomorrow.", retry: "later", retryAfterSeconds: 86400 }, "rate_limited", 4],
    ] as const) {
      server.answer = { status, body };
      const refused = await last("handle", "stormcaller", "--yes");
      assert.deepEqual([refused.code, refused.event.code, refused.event.message], [exit, code, body.message], code);
    }
  } finally { await server.close(); }
});

test("a person is asked before a rename, and no sends nothing", async () => {
  const server = await fake();
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: server.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1", NO_COLOR: "1" };
    for (const key of AMBIENT) if (!["OPENGAME_TOKEN", "OPENGAME_API_URL", "NO_PROXY", "NO_COLOR"].includes(key)) delete env[key];
    const ask = async (answer: string) => {
      const [python, relay] = ttyWrap([process.execPath, binary, "handle", "stormcaller"]);
      const child = spawn(python, relay, { env, cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"], timeout: 12000 });
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
    assert.match(no.transcript, /Rename your handle to stormcaller\?/);
    assert.equal(no.exit, 2);
    assert.deepEqual(writes(server), []);
    const yes = await ask("y\n");
    assert.equal(yes.exit, 0, yes.transcript);
    assert.equal(writes(server).length, 1);
  } finally { await server.close(); }
});

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
 * `opengame unpublish` and `opengame restore` against a stand-in server: what each sends,
 * what each prints, when it asks, and that nothing is sent without an answer. Who may do
 * either is the server's, and the website's own route tests hold it.
 */
const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const GAME = "11111111-1111-4111-8111-111111111111";
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const game: CreatorGame = { id: GAME, publicId: "tiderunner", title: "Tide runner", visibility: "published", latestOperation: null };

type Answer = { status: number; body: unknown };
interface Fake { origin: string; requests: { method: string; url: string }[]; act: Answer | null; bodies: unknown[]; close(): Promise<void> }

const done = (visibility: "unpublished" | "published" | "removed", message: string, extra = {}) => ({ status: 200, body: { apiVersion: "1", gameId: GAME, publicId: "tiderunner",
  visibility, repaired: false, artPending: false, url: "https://opengame.io/settings/games/tiderunner", message, ...extra } });

async function fake(): Promise<Fake> {
  const state = { requests: [] as { method: string; url: string }[], act: null as Answer | null, bodies: [] as unknown[] };
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    state.requests.push({ method: req.method!, url: req.url! });
    res.setHeader("content-type", "application/json");
    const send = (answer: Answer) => { res.statusCode = answer.status; res.end(JSON.stringify(answer.body)); };
    if (req.method === "GET" && (req.url === `/api/v1/games/${GAME}` || req.url === "/api/v1/games/tiderunner")) return send({ status: 200, body: { game } });
    if (req.method === "POST" && req.url === `/api/v1/games/${GAME}/unpublish`) {
      return send(state.act ?? done("unpublished", "That game is off the gallery and is no longer being served."));
    }
    if (req.method === "POST" && req.url === `/api/v1/games/${GAME}/delete`) {
      let text = "";
      for await (const chunk of req) text += chunk;
      state.bodies.push(JSON.parse(text));
      return send(state.act ?? done("removed" as never, "That game is deleted. It is off the gallery, it is not served anywhere, and its cover and screenshots have been taken off our public storage."));
    }
    if (req.method === "POST" && req.url === `/api/v1/games/${GAME}/restore`) {
      return send(state.act ?? done("published", "That game is back on the gallery, serving the version it was on when you took it down."));
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
  const root = await mkdtemp(join(tmpdir(), "og-take-down-"));
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

const posts = (server: Fake) => server.requests.filter(r => r.method === "POST").map(r => r.url);

test("an agent without --yes is refused before anything is sent, for both", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    for (const command of ["unpublish", "restore"]) {
      const asked = await last(command);
      assert.deepEqual([asked.code, asked.event.code], [2, "confirmation_required"], command);
      assert.equal(asked.event.next, `opengame ${command} --yes`);
    }
    const pinned = await cli(server.origin, tmpdir()).last("unpublish", "--game", "tiderunner");
    assert.equal(pinned.event.next, "opengame unpublish --game tiderunner --yes");
    assert.deepEqual(posts(server), []);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("unpublish and restore send one POST each for the linked game and print the website's words", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    const off = await last("unpublish", "--yes");
    assert.equal(off.code, 0);
    assert.equal(off.event.command, "unpublish");
    assert.equal(off.event.data.visibility, "unpublished");
    assert.match(off.event.data.message, /^That game is off the gallery/);
    assert.match(off.event.data.message, /\nhttps:\/\/opengame\.io\/settings\/games\/tiderunner$/);
    const back = await last("restore", "--yes");
    assert.equal(back.code, 0);
    assert.equal(back.event.data.visibility, "published");
    assert.deepEqual(posts(server), [`/api/v1/games/${GAME}/unpublish`, `/api/v1/games/${GAME}/restore`]);
    // By --game from a folder that is not linked, and not at all without one.
    const elsewhere = cli(server.origin, tmpdir());
    assert.equal((await elsewhere.last("unpublish", "--game", "tiderunner", "--yes")).code, 0);
    const unlinked = await elsewhere.last("restore", "--yes");
    assert.deepEqual([unlinked.code, unlinked.event.code], [2, "not_linked"]);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("the server's refusal is printed in its words, with the shared table's exit", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    for (const [command, status, body, code, exit] of [
      ["unpublish", 409, { error: "unpublish_refused", message: "This game is not on the gallery, so there is nothing to take off it.", retry: "never" }, "unpublish_refused", 2],
      ["restore", 409, { error: "restore_refused", message: "We took this game down, so you cannot put it back from here. Write to team@opengame.io to ask why, or to ask for it back.", retry: "never" }, "restore_refused", 2],
      ["restore", 409, { error: "no_reviewed_build", message: "There is no reviewed build to serve, so putting this back would give players a page that does not load. Write to team@opengame.io and we will sort it out.", retry: "never" }, "no_reviewed_build", 2],
      ["unpublish", 502, { error: "unpublish_incomplete", message: "Your game is no longer being served and browsers have been told to drop what they cached. The gallery has not caught up yet, so it may still be listed for a moment. Run it again, and write to team@opengame.io if that keeps happening.", retry: "now" }, "unpublish_incomplete", 5],
      ["unpublish", 503, { error: "take_down_unreachable", message: "Nothing changed and your game is exactly where it was. We could not reach the part of our system that starts and stops serving a game, which is ours to fix rather than yours. Try again in a minute.", retry: "later" }, "take_down_unreachable", 5],
      ["unpublish", 403, { error: "forbidden", message: "This credential cannot take a game down. Use a token with the submit permission, or opengame login." }, "forbidden", 3],
    ] as const) {
      server.act = { status, body };
      const refused = await last(command, "--yes");
      assert.deepEqual([refused.code, refused.event.code], [exit, code], code);
      assert.equal(refused.event.message, body.message, code);
    }
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("a server from before these routes says to use the website rather than that the API is gone", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    server.act = { status: 404, body: { error: "not_found", message: "Not found." } };
    const { code, event } = await cli(server.origin, root).last("unpublish", "--yes");
    assert.deepEqual([code, event.code], [5, "take_down_unavailable"]);
    assert.match(event.message, /Your games on the website/);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("help lists both, each with --yes and --game", async () => {
  const server = await fake();
  try {
    const help = (await cli(server.origin, tmpdir()).last("help")).event.data;
    for (const command of ["unpublish", "restore"]) {
      const flags = help.commands[command].flags.map((flag: { name: string }) => flag.name);
      assert.ok(flags.includes("--yes") && flags.includes("--game"), command);
    }
  } finally { await server.close(); }
});

test("a person is asked first, and no sends nothing", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: server.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1", NO_COLOR: "1" };
    for (const key of AMBIENT) if (!["OPENGAME_TOKEN", "OPENGAME_API_URL", "NO_PROXY", "NO_COLOR"].includes(key)) delete env[key];
    const ask = async (answer: string) => {
      const [python, relay] = ttyWrap([process.execPath, binary, "unpublish"]);
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
    assert.match(no.transcript, /Unpublish Tide runner\? It comes off the gallery/);
    assert.match(no.transcript, /Cancelled\. Nothing changed\./);
    assert.equal(no.exit, 2);
    assert.deepEqual(posts(server), []);
    const yes = await ask("y\n");
    assert.equal(yes.exit, 0, yes.transcript);
    assert.match(yes.transcript, /off the gallery/);
    assert.equal(posts(server).length, 1);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("delete needs the title typed and --yes from an agent, and sends the title as typed", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const { last } = cli(server.origin, root);
    for (const args of [["delete"], ["delete", "--yes"], ["delete", "--title", "Tide runner"]]) {
      const asked = await last(...args);
      assert.deepEqual([asked.code, asked.event.code], [2, "confirmation_required"], args.join(" "));
      // The title is the person's to type, so the refusal never prints it for an agent to copy.
      assert.doesNotMatch(JSON.stringify(asked.event), /Tide runner/i, args.join(" "));
      assert.match(asked.event.message, /tiderunner/);
    }
    assert.deepEqual(posts(server), []);
    const gone = await last("delete", "--title", "tide  RUNNER", "--yes");
    assert.equal(gone.code, 0);
    assert.equal(gone.event.data.visibility, "removed");
    assert.match(gone.event.data.message, /^That game is deleted/);
    assert.deepEqual(posts(server), [`/api/v1/games/${GAME}/delete`]);
    // The CLI does not judge the title; the server compares it against the game.
    assert.deepEqual(server.bodies, [{ title: "tide  RUNNER" }]);
    for (const [status, body, code, exit] of [
      [400, { error: "delete_title_mismatch", message: "Nothing was deleted. The title you typed does not match the game's title. Type it exactly as opengame games prints it.", retry: "after-fix" }, "delete_title_mismatch", 2],
      [409, { error: "delete_refused", message: "A reviewer has this open right now. Withdraw the entry from your jam entries first, then delete it.", retry: "never" }, "delete_refused", 2],
      [403, { error: "forbidden", message: "Only opengame login can delete a game, not a token made in settings. Run opengame login, or delete it on the website." }, "forbidden", 3],
    ] as const) {
      server.act = { status, body };
      const refused = await last("delete", "--title", "x", "--yes");
      assert.deepEqual([refused.code, refused.event.code, refused.event.message], [exit, code, body.message], code);
    }
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test("a person types the title at the prompt, and an empty answer deletes nothing", async () => {
  const server = await fake();
  const root = await linkedFolder(server.origin);
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: server.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1", NO_COLOR: "1" };
    for (const key of AMBIENT) if (!["OPENGAME_TOKEN", "OPENGAME_API_URL", "NO_PROXY", "NO_COLOR"].includes(key)) delete env[key];
    const ask = async (answer: string) => {
      const [python, relay] = ttyWrap([process.execPath, binary, "delete"]);
      const child = spawn(python, relay, { env, cwd: root, stdio: ["pipe", "pipe", "pipe"], timeout: 12000 });
      let transcript = "", answered = false;
      child.stderr.on("data", chunk => { transcript += chunk; });
      child.stdout.on("data", chunk => {
        transcript += chunk;
        if (!answered && transcript.includes("to delete it for good:")) { answered = true; child.stdin.write(answer); }
      });
      const [exit] = await once(child, "exit");
      return { exit, transcript };
    };
    const empty = await ask("\n");
    assert.match(empty.transcript, /cannot be put back/);
    assert.equal(empty.exit, 2);
    assert.deepEqual(posts(server), []);
    const typed = await ask("Tide runner\n");
    assert.equal(typed.exit, 0, typed.transcript);
    assert.deepEqual(server.bodies, [{ title: "Tide runner" }]);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

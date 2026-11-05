import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { withProject } from "../src/project";
import { Output } from "../src/output";
import { AMBIENT, ttyWrap } from "./shell";
import type { CreatorGame, GameManifest } from "@opengame/protocol";

const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const manifest: GameManifest = { title: "Local title", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
const game: CreatorGame = { id, publicId: "littleorbit", title: "Little orbit", visibility: "draft", latestOperation: null };

test("bundled discovery, linking, opening and remote status preserve local work", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-games-"));
  let current = game; let found = true; let malformed = false;
  const paths: string[] = [];
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    assert.equal(req.method, "GET"); paths.push(req.url!);
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/v1/operations/${operationId}`) { res.end(JSON.stringify({ operation: current.latestOperation })); return; }
    if (req.url?.startsWith("/api/v1/games?")) { res.end(JSON.stringify({ games: [], nextCursor: null })); return; }
    if (req.url === "/api/v1/games") { res.end(JSON.stringify({ games: [game], nextCursor: other })); return; }
    if (!found) { res.statusCode = 404; res.end(JSON.stringify({ error: "game_not_found" })); return; }
    res.end(JSON.stringify({ game: malformed ? { ...current, id: other } : current }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  const execute = async (...args: string[]) => (await run(process.execPath, [binary, ...args, "--jsonl"], { env })).stdout.trim().split("\n").map(line => JSON.parse(line));
  const failure = async (code: string, ...args: string[]) => {
    await assert.rejects(execute(...args), (error: unknown) => { const e = error as { stdout: string }; assert.equal(JSON.parse(e.stdout.trim().split("\n").at(-1)!).code, code); return true; });
  };
  const statePath = join(root, ".opengame/project.json");
  try {
    const original = JSON.stringify(manifest); await writeFile(join(root, "opengame.json"), original);
    const catalog = (await execute("games"))[0].data; assert.equal(catalog.games[0].id, id); assert.equal(catalog.nextCursor, other);
    assert.deepEqual((await execute("games", "--cursor", other))[0].data.games, []);
    assert.equal(paths.at(-1), `/api/v1/games?cursor=${other}`);
    await failure("game_required", "link", root);
    await failure("invalid_game", "link", root, "--game", "../games");
    await failure("invalid_cursor", "games", "--cursor", "../games");
    assert.equal((await execute("link", root, "--game", "littleorbit"))[0].data.gameId, id);
    assert.equal(await readFile(join(root, "opengame.json"), "utf8"), original);
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), { version: 1, origin, gameId: id });
    assert.match(await readFile(join(root, ".gitignore"), "utf8"), /\.opengame\//);
    assert.equal((await execute("link", root))[0].data.changed, false);
    assert.equal((await execute("open", root))[0].data.url, `${origin}/g/littleorbit`);
    assert.equal((await execute("status", root))[0].data.visibility, "draft");
    current = { ...game, latestOperation: { id: operationId, gameId: id, state: "checking", releaseId: null, error: null } };
    assert.equal((await execute("status", root))[0].data.operationId, operationId);
    current.latestOperation!.state = "uploading";
    assert.match((await execute("status", root))[0].data.message, /another checkout/);
    current.latestOperation!.state = "checking";
    await withProject(root, origin, async (state, save) => {
      state.deploy = { key: "finished", terminal: true, operationId: other, request: { byteSize: 64, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve", gameId: id } };
      await save();
    });
    const completedLocal = await readFile(statePath, "utf8");
    // A server from before 30 Oct 2026 can still say it kept the cover. Nothing about a
    // cover comes down on a pull any more, so the CLI does not send anybody to one for it.
    current.latestOperation!.metadata = { revision: 9, keptFields: ["title", "cover"] };
    const feedback = await execute("status", root);
    assert.equal(feedback[0].code, "website_metadata_kept");
    assert.match(feedback[0].message, /^Kept website changes to title\. Run opengame pull/);
    assert.deepEqual(feedback.at(-1).data.metadata, { revision: 9, keptFields: ["title"] });
    delete current.latestOperation!.metadata;
    assert.equal((await execute("status", root))[0].data.operationId, operationId);
    assert.equal(await readFile(statePath, "utf8"), completedLocal);
    await withProject(root, origin, async (state, save) => { delete state.deploy; await save(); });
    assert.equal((await execute("open", "--game", id))[0].data.url, `${origin}/settings/deployments/${operationId}`);
    assert.equal(JSON.parse(await readFile(statePath, "utf8")).deploy, undefined);
    current = { ...game, id: other, publicId: "othergame" };
    await failure("already_linked", "link", root, "--game", other);
    await withProject(root, origin, async (state, save) => {
      state.metadataRevision = 4;
      state.deploy = { key: "pending", request: { byteSize: 64, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: 4, metadata: "preserve", gameId: id } };
      await save();
    });
    const pending = await readFile(statePath, "utf8");
    await failure("deploy_in_progress", "link", root, "--game", other, "--replace");
    assert.equal(await readFile(statePath, "utf8"), pending);
    current = game;
    assert.equal((await execute("link", root, "--game", id))[0].data.changed, false);
    assert.equal(await readFile(statePath, "utf8"), pending);
    current = { ...game, id: other, publicId: "othergame" };
    await failure("upload_pending", "status", root);
    await withProject(root, origin, async (state, save) => { state.deploy!.terminal = true; await save(); });
    assert.equal((await execute("link", root, "--game", other, "--replace"))[0].data.gameId, other);
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), { version: 1, origin, gameId: other });
    found = false; await failure("game_not_found", "link", root, "--game", id, "--replace");
    found = true; malformed = true; await failure("invalid_response", "open", "--game", id);
    assert.ok(!(await readFile(statePath, "utf8")).includes(token));
    assert.equal(await readFile(join(root, "opengame.json"), "utf8"), original);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("terminal output strips escape commands while JSON preserves data as escaped strings", () => {
  const title = "Title\x1b[2J\x1b]52;c;YWJj\x07\rspoof";
  const lines: string[] = [];
  new Output(false, line => lines.push(line)).emit({ type: "result", command: "games", data: { message: title } });
  assert.equal(lines[0], "Titlespoof");
  new Output(true, line => lines.push(line)).emit({ type: "result", command: "games", data: { title } });
  assert.equal(JSON.parse(lines[1]!).data.title, title); assert.ok(!lines[1]!.includes("\x1b"));
});


test("a human can recover from an invalid choice and page through games in a real terminal", { skip: process.platform !== "darwin", timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "og-link-terminal-"));
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader("content-type", "application/json");
    const next = req.url?.includes("cursor=");
    res.end(JSON.stringify({ games: next ? [{ ...game, id: other, publicId: "othergame", title: "Other game" }] : [game], nextCursor: next ? null : other }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  // Whatever shell runs this suite (usually an agent's), a person's terminal has none of its markers.
  for (const key of AMBIENT) if (key !== "OPENGAME_TOKEN" && key !== "OPENGAME_API_URL" && key !== "NO_PROXY") delete env[key];
  const [python, relay] = ttyWrap([process.execPath, binary, "link", root]);
  const child = spawn(python, relay, { env, stdio: ["pipe", "pipe", "pipe"], timeout: 12000 });
  let transcript = ""; let answered = 0;
  child.stderr.on("data", chunk => { transcript += chunk; });
  const answers = ["x\n", "n\n", "1\n"];
  child.stdout.on("data", chunk => {
    transcript += chunk;
    const prompts = transcript.split("(Enter to cancel): ").length - 1;
    if (prompts > answered && answered < answers.length) child.stdin.write(answers[answered++]!);
  });
  try {
    const [code] = await once(child, "close"); assert.equal(code, 0, transcript);
    assert.match(transcript, /Choose a number from the list/);
    assert.match(transcript, /Linked to Other game/);
    assert.equal(JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8")).gameId, other);
  } finally {
    child.kill(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("the game list names a finished deploy by its outcome, in the words the website uses", async () => {
  const failed = (n: number, error: string | null) => ({ id: `1111111${n}-1111-4111-8111-111111111111`, publicId: `orbit00${n}`, title: `Orbit ${n}`, visibility: "draft",
    latestOperation: { id: `3333333${n}-3333-4333-8333-333333333333`, gameId: `1111111${n}-1111-4111-8111-111111111111`, state: "failed", releaseId: null, error } });
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ games: [failed(1, "deploy_checks_failed"), failed(2, "finalize_failed"), failed(3, null)], nextCursor: null }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
    const lines = (await run(process.execPath, [binary, "games", "--jsonl"], { env })).stdout.trim().split("\n").map(line => JSON.parse(line));
    const message: string = lines.at(-1).data.message;
    const { RELEASE_STATUS } = await import("@opengame/protocol");
    assert.match(message, new RegExp(`orbit001  Orbit 1  \\(${RELEASE_STATUS.blocked.label}\\)`), "a refused build needs a fix, as on the strip and the upload page");
    assert.match(message, new RegExp(`orbit002  Orbit 2  \\(${RELEASE_STATUS.stopped.label}\\)`), "a stop on our side says so");
    assert.match(message, new RegExp(`orbit003  Orbit 3  \\(${RELEASE_STATUS.interrupted.label}\\)`), "only a deploy with nothing to go on falls back");
  } finally { server.close(); }
});

test("the game list and status say a game is live, unlisted, and where to share it", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-published-"));
  const releaseId = "44444444-4444-4444-8444-444444444444";
  const live: CreatorGame = { ...game, visibility: "published", latestOperation: { id: operationId, gameId: id, state: "ready", releaseId, error: null },
    publication: { state: "published", releaseId, url: "https://opengame.io/g/littleorbit", listed: false } };
  let current = live;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/v1/operations/${operationId}`) { res.end(JSON.stringify({ operation: current.latestOperation })); return; }
    if (req.url === "/api/v1/games") { res.end(JSON.stringify({ games: [current], nextCursor: null })); return; }
    res.end(JSON.stringify({ game: current }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  const execute = async (...args: string[]) => (await run(process.execPath, [binary, ...args, "--jsonl"], { env })).stdout.trim().split("\n").map(line => JSON.parse(line));
  try {
    const listed = (await execute("games")).at(-1).data.message as string;
    assert.match(listed, /littleorbit  Little orbit  \(Published, unlisted\)\n    https:\/\/opengame\.io\/g\/littleorbit/);
    await withProject(root, origin, async (state, save) => { state.gameId = id; await save(); });
    const status = await execute("status", root);
    assert.equal(status[0].code, "publication");
    assert.match(status[0].message, /release 44444444 is live, unlisted\. Only people with the link can play it\..*Share https:\/\/opengame\.io\/g\/littleorbit/);
    // A deploy still running is the news on the list, as it is on the strip.
    current = { ...live, latestOperation: { ...live.latestOperation!, state: "checking" } };
    assert.match((await execute("games")).at(-1).data.message, /\(Checking\)/);
    current = { ...live, publication: { ...live.publication!, state: "publishing" } };
    assert.match((await execute("games")).at(-1).data.message, /\(Publishing\)$/m);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

for (const command of ["deployments", "open"] as const) {
  test(`${command} resolves the first nonblocking deploy without a prior status call`, async () => {
    const root = await mkdtemp(join(tmpdir(), "og-first-deploy-"));
    let ready = true;
    let ended: "failed" | "expired" | null = null;
    const paths: string[] = [];
    const releaseId = "44444444-4444-4444-8444-444444444444";
    const server = createServer((req, res) => {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      paths.push(req.url!); res.setHeader("content-type", "application/json");
      if (req.url === `/api/v1/operations/${operationId}`) {
        res.end(JSON.stringify({ operation: { id: operationId, gameId: ready ? id : null, state: ready ? "ready" : ended ?? "queued", releaseId: ready ? releaseId : null, error: null } })); return;
      }
      if (req.url === `/api/v1/games/${id}/deployments`) { res.end(JSON.stringify({ deployments: [] })); return; }
      res.end(JSON.stringify({ game: { ...game, latestOperation: { id: operationId, gameId: id, state: "ready", releaseId, error: null } } }));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
    const execute = () => run(process.execPath, [binary, command, root, "--json"], { env });
    try {
      // A first deploy has uploaded, but no candidate/game existed when it returned.
      await withProject(root, origin, async (state, save) => {
        state.deploy = { key: "first", operationId, uploaded: true, terminal: false,
          request: { byteSize: 64, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve" } };
        await save();
      });
      const result = JSON.parse((await execute()).stdout);
      assert.equal(result.ok, true); assert.equal(result.data.gameId, id);
      assert.ok(paths.includes(`/api/v1/operations/${operationId}`));
      const saved = JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8"));
      assert.equal(saved.gameId, id); assert.equal(saved.deploy.terminal, true);
      assert.equal(saved.deploy.operationId, operationId); assert.equal(saved.deploy.key, "first");
      ready = false;
      await withProject(root, origin, async (state, save) => { delete state.gameId; state.deploy!.terminal = false; await save(); });
      await assert.rejects(execute(), (error: unknown) => {
        const e = error as { code: number; stdout: string };
        assert.equal(e.code, 2); assert.equal(JSON.parse(e.stdout).code, "game_pending"); return true;
      });
      // Review of #613: a first deploy that ended never creates a game, so it must not read as "wait".
      for (const state of ["failed", "expired"] as const) {
        ended = state;
        await withProject(root, origin, async (saved, save) => { saved.deploy!.terminal = false; await save(); });
        await assert.rejects(execute(), (error: unknown) => {
          const e = error as { stdout: string };
          const body = JSON.parse(e.stdout);
          assert.equal(body.code, `deploy_${state}`, state);
          assert.match(body.message, /stopped before it created a game/, state);
          assert.doesNotMatch(body.message, /not created a game yet|opengame status/, state);
          assert.equal(body.next, "opengame deploy", state);
          return true;
        });
      }

    } finally {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}

/* Review of 5 Nov 2026: `opengame jams` and the website moved to Pacific time and this list kept
   a UTC formatter of its own, so a deploy made a minute before the deadline (11:59 pm PT on
   18 December) printed "19 Dec, 07:59 UTC", a date after the close. The JSON keeps the instant. */
test("deployments prints a deploy's time in Pacific, and keeps the ISO instant in the data", async () => {
  const createdAt = "2026-12-19T07:59:00Z";
  const row = { id: operationId, state: "ready", label: "Ready", createdAt, endedAt: null, releaseId: null,
    byteSize: null, fileCount: null, by: null, reason: null, url: "https://opengame.io/settings/deployments/x", previewUrl: null };
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/v1/games/${id}/deployments`) { res.end(JSON.stringify({ deployments: [row] })); return; }
    res.end(JSON.stringify({ game }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    const result = JSON.parse((await run(process.execPath, [binary, "deployments", "--game", id, "--jsonl"], { env })).stdout.trim().split("\n").at(-1)!);
    const facts = (result.data.message as string).split("\n")[2]!;
    assert.match(facts, /^33333333 {2}Ready {2}18 December, 11:59 pm PT$/);
    assert.doesNotMatch(result.data.message, /UTC/);
    assert.equal(result.data.deployments[0].createdAt, createdAt);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

/* Design review of the clock lane, 5 Nov 2026: a deploy made on the close to the millisecond
   printed the close's day copy, "18 December, 11:59 pm PT", in a list where a deploy is a
   moment. It prints the moment it is. */
test("deployments prints a deploy made on the close as its own time, not the close's copy", async () => {
  const createdAt = "2026-12-19T08:00:00.000Z";
  const row = { id: operationId, state: "ready", label: "Ready", createdAt, endedAt: null, releaseId: null,
    byteSize: null, fileCount: null, by: null, reason: null, url: "https://opengame.io/settings/deployments/x", previewUrl: null };
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/v1/games/${id}/deployments`) { res.end(JSON.stringify({ deployments: [row] })); return; }
    res.end(JSON.stringify({ game }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    const result = JSON.parse((await run(process.execPath, [binary, "deployments", "--game", id, "--jsonl"], { env })).stdout.trim().split("\n").at(-1)!);
    const facts = (result.data.message as string).split("\n")[2]!;
    assert.match(facts, /^33333333 {2}Ready {2}19 December, 12:00 am PT$/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

/* Security review of the re-check, 5 Nov 2026: whenPacific hands back a value it cannot read
   as an instant unchanged, so a hostile or broken API origin's createdAt reached the terminal
   raw, escape sequences and all. It goes through terminalText like every other server string. */
test("deployments never prints a server's createdAt raw to the terminal", async () => {
  const createdAt = "\u001b]0;owned\u0007\u001b[2Jnot a time";
  const row = { id: operationId, state: "ready", label: "Ready", createdAt, endedAt: null, releaseId: null,
    byteSize: null, fileCount: null, by: null, reason: null, url: "https://opengame.io/settings/deployments/x", previewUrl: null };
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/v1/games/${id}/deployments`) { res.end(JSON.stringify({ deployments: [row] })); return; }
    res.end(JSON.stringify({ game }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    const { stdout } = await run(process.execPath, [binary, "deployments", "--game", id, "--jsonl"], { env });
    const message = JSON.parse(stdout.trim().split("\n").at(-1)!).data.message as string;
    assert.doesNotMatch(message, /[\u0000-\u0008\u000b-\u001f\u007f]/, "a control character reached the terminal");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

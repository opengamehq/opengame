import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { withProject } from "../src/project";
import { createArchive } from "../src/archive";
import { Output } from "../src/output";
import type { GameManifest } from "@opengame/protocol";
import { unzipSync } from "fflate";
import { LIMITS } from "@opengame/shared";
import { replyBootstrap, startupInformation } from "./bootstrap-fixture";
const run = promisify(execFile), binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const id = "11111111-1111-4111-8111-111111111111", token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const metadata: GameManifest = { title: "Website title", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] };
/* A server from before 30 Oct 2026 still names a cover in the metadata and offers its bytes.
   A current pull brings none of it down: OpenGame makes the cover now. The checkout's own
   cover line is not website metadata any more, so it is left exactly as it was. */
test("pull preserves build settings, brings no cover down and leaves the checkout's cover line alone", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-pull-")); let changeDuringPull = false; let removed = false;
  const local = { ...metadata, title: "Local title", cover: "marketing/cover.png", sdk: "1", build: { output: "dist" } };
  const original = JSON.stringify(local);
  const paths: string[] = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    paths.push(req.url ?? "");
    res.setHeader("content-type", "application/json");
    // pull reads the game first, so a removed game is refused before its metadata is written.
    if (req.url === `/api/v1/games/${id}`) { res.end(JSON.stringify({ game: { id, publicId: "littleorbit", title: "Website title", visibility: removed ? "removed" : "draft", latestOperation: null } })); return; }
    if (changeDuringPull) await writeFile(join(root, "opengame.json"), JSON.stringify({ ...local, title: "Concurrent edit" }));
    res.end(JSON.stringify({ gameId: id, revision: 4, metadata: { ...metadata, cover: "cover.png" }, controllerSupport: false, compatibility: {},
      cover: { path: `/api/v1/games/${id}/cover?revision=4` } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  const pull = () => run(process.execPath, [binary, "pull", root, "--jsonl"], { env });
  try {
    await mkdir(join(root, "dist")); await writeFile(join(root, "dist/index.html"), "<!doctype html><title>Game</title>");
    await writeFile(join(root, "opengame.json"), original);
    await withProject(root, origin, async (state, save) => { state.gameId = id; await save(); });
    removed = true;
    await assert.rejects(pull(), (error: unknown) => { const e = error as { stdout: string; code: number }; return e.code === 2 && e.stdout.includes("game_removed"); });
    assert.equal(await readFile(join(root, "opengame.json"), "utf8"), original, "a removed game's metadata is not written");
    removed = false;
    const result = (await pull()).stdout.trim().split("\n").map(line => JSON.parse(line)).find(event => event.type === "result");
    assert.deepEqual(result.data.changes, ["title"], "the cover is not a field a pull changes");
    assert.equal("cover" in result.data, false);
    assert.ok(!paths.some(path => path.includes("/cover")), "pull asked for the cover's bytes");
    const current = JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));
    assert.equal(current.title, "Website title"); assert.deepEqual(current.build, local.build); assert.equal(current.sdk, "1");
    assert.equal(current.cover, "marketing/cover.png", "the checkout's cover line was rewritten");
    await assert.rejects(readFile(join(root, "opengame-assets")), { code: "ENOENT" });
    assert.equal(await readFile(join(root, ".opengame/manifest-before-pull.json"), "utf8"), original);
    assert.equal(JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8")).metadataRevision, 4);
    await run(process.execPath, [binary, "check", root, "--jsonl"], { env });
    changeDuringPull = true; await assert.rejects(pull(), (error: unknown) => (error as { stdout: string }).stdout.includes("manifest_changed"));
    assert.equal(JSON.parse(await readFile(join(root, "opengame.json"), "utf8")).title, "Concurrent edit");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});


/* kind and basedOn are website metadata, like genre: a reviewer corrects them on the game.
   A pull brings both down, and a game on the website takes basedOn out of the checkout,
   because a game that names a source is a manifest every later command refuses. */
test("pull brings the website's kind down, and a game there removes the checkout's basedOn", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-pull-kind-"));
  let website: Record<string, unknown> = { ...metadata, cover: undefined, kind: "game" };
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === `/api/v1/games/${id}`) { res.end(JSON.stringify({ game: { id, publicId: "littleorbit", title: "Website title", visibility: "draft", latestOperation: null } })); return; }
    res.end(JSON.stringify({ gameId: id, revision: 5, metadata: website, controllerSupport: false, compatibility: {}, cover: null }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  const pull = async () => JSON.parse((await run(process.execPath, [binary, "pull", root, "--json"], { env })).stdout);
  try {
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...metadata, cover: undefined, kind: "mod", basedOn: "Doom", build: { output: "dist" } }));
    await withProject(root, origin, async (state, save) => { state.gameId = id; await save(); });
    const toGame = await pull();
    assert.deepEqual(toGame.data.changes, ["kind", "basedOn"]);
    let current = JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));
    assert.equal(current.kind, "game");
    assert.equal("basedOn" in current, false);
    assert.deepEqual(current.build, { output: "dist" });
    website = { ...website, kind: "decomp", basedOn: "Super Mario 64" };
    assert.deepEqual((await pull()).data.changes, ["kind", "basedOn"]);
    current = JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));
    assert.deepEqual([current.kind, current.basedOn], ["decomp", "Super Mario 64"]);
    // A head written before kinds says nothing, and absent is a game, so the checkout says nothing too.
    const { kind: _kind, basedOn: _basedOn, ...before } = website;
    website = before;
    await pull();
    current = JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));
    assert.equal(current.kind, undefined);
    assert.equal(current.basedOn, undefined);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

/* The CLI half of a server change that keeps an online game's players on its head. The
   website lists this game as online multiplayer for four, and its head now says so as
   opengame.json can: p2p for four (before, it held nothing, and the pull below wrote a
   checkout with no `multiplayer`). This pins that the pull keeps what the head says and the
   default preserve deploy sends it at the pulled revision; the server's own tests pin what it
   freezes and publishes from it. A player count the manifest cannot hold is refused by name. */
test("pull then deploy of an online multiplayer game keeps its players in the manifest it sends", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-pull-online-"));
  const players = { mode: "p2p", maxPlayers: 4 } as const;
  let websitePlayers: Record<string, unknown> = players;
  const deploys: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    if (replyBootstrap(req, res, token)) return;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/limits") { res.end(JSON.stringify(startupInformation())); return; }
    if (req.url === `/api/v1/games/${id}`) { res.end(JSON.stringify({ game: { id, publicId: "littleorbit", title: "Website title", visibility: "published", latestOperation: null } })); return; }
    if (req.url === `/api/v1/games/${id}/metadata`) {
      res.end(JSON.stringify({ gameId: id, revision: 7, metadata: { ...metadata, multiplayer: websitePlayers }, controllerSupport: false, compatibility: {}, cover: null }));
      return;
    }
    assert.equal(req.url, "/api/v1/deploys");
    let body = ""; for await (const chunk of req) body += chunk;
    deploys.push(JSON.parse(body));
    res.end(JSON.stringify({ operation: { id: "11111111-1111-4111-8111-000000000001", state: "ready", gameId: id,
      releaseId: "22222222-2222-4222-8222-000000000001", error: null } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" };
  try {
    await writeFile(join(root, "index.html"), "<!doctype html><title>Game</title>");
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...metadata, multiplayer: players }));
    await withProject(root, origin, async (state, save) => { state.gameId = id; await save(); });
    const pulled = JSON.parse((await run(process.execPath, [binary, "pull", root, "--json"], { env })).stdout);
    assert.deepEqual(pulled.data.changes, [], "nothing about the players changed on the website");
    assert.deepEqual(JSON.parse(await readFile(join(root, "opengame.json"), "utf8")).multiplayer, players);
    await run(process.execPath, [binary, "deploy", root, "--jsonl"], { env });
    assert.equal(deploys.length, 1);
    assert.equal(deploys[0]!.metadata, "preserve");
    assert.equal(deploys[0]!.metadataRevision, 7, "in sync, so the server takes this manifest as it stands");
    assert.deepEqual((deploys[0]!.manifest as Record<string, unknown>).multiplayer, players);
    // Listed for more than a lobby holds: the pull names the field and the way past it, and
    // leaves the checkout as it was.
    const before = await readFile(join(root, "opengame.json"), "utf8");
    websitePlayers = { mode: "p2p", maxPlayers: LIMITS.rtc.peersPerLobbyMax + 1 };
    await assert.rejects(run(process.execPath, [binary, "pull", root, "--jsonl"], { env }), (error: unknown) => {
      const { stdout } = error as { stdout: string };
      const last = JSON.parse(stdout.trim().split("\n").at(-1)!);
      assert.equal(last.code, "metadata_conversion_required");
      assert.match(last.message, /player count/);
      assert.match(last.message, /--metadata=local/);
      return true;
    });
    assert.equal(await readFile(join(root, "opengame.json"), "utf8"), before);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

/* The cover used to be copied in from outside build.output, and refused when it was
   missing, linked, outside the project or too large. None of that applies to a field
   nothing reads: the archive is the build, and each of those names packages the same. */
test("a cover named in opengame.json is not uploaded, and nothing about its file can stop the package", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-pull-package-"));
  const picture = Buffer.from("a picture outside the build");
  try {
    await mkdir(join(root, "dist/wrapper"), { recursive: true });
    await writeFile(join(root, "dist/wrapper/index.html"), "<!doctype html><title>Game</title>");
    await writeFile(join(root, "cover.png"), picture);
    await writeFile(join(root, ".env.png"), picture);
    await symlink(join(root, "cover.png"), join(root, "linked.png"));
    await writeFile(join(root, "huge.png"), Buffer.alloc(LIMITS.platform.moderation.imageBytesMax + 1));
    const plain = await createArchive(join(root, "dist"), metadata, new Output(true, () => {}));
    assert.deepEqual(Object.keys(unzipSync(plain.bytes)), ["index.html"]);
    for (const cover of ["cover.png", ".env.png", "linked.png", "../cover.png", "huge.png", "missing.png"]) {
      const events: { type: string; code?: string; message?: string }[] = [];
      const archive = await createArchive(join(root, "dist"), { ...metadata, cover }, new Output("jsonl", line => events.push(JSON.parse(line))));
      assert.equal(archive.sha256, plain.sha256, cover);
      assert.deepEqual(events.filter(event => event.code?.startsWith("cover")).map(event => event.code), ["cover_ignored"], cover);
    }
    // A picture the game itself loads is a game file, and stays one.
    await writeFile(join(root, "dist/wrapper/index.html"), '<!doctype html><title>Game</title><img src="cover.png">');
    await writeFile(join(root, "dist/wrapper/cover.png"), picture);
    const inside = await createArchive(join(root, "dist"), { ...metadata, cover: "dist/wrapper/cover.png" }, new Output(true, () => {}));
    assert.deepEqual(Object.keys(unzipSync(inside.bytes)).sort(), ["cover.png", "index.html"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
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
const run = promisify(execFile), binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const id = "11111111-1111-4111-8111-111111111111", token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);
const cover = Buffer.from("local cover fixture"), hash = createHash("sha256").update(cover).digest("hex");
const metadata: GameManifest = { title: "Website title", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"], cover: "cover.png" };
test("pull preserves build settings, downloads a commit-ready cover and packages it outside dist", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-pull-")); let corrupt = false; let changeDuringPull = false; let removed = false;
  const local = { ...metadata, title: "Local title", cover: undefined, sdk: "1", build: { output: "dist" } };
  const original = JSON.stringify(local);
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    if (req.url?.includes("/cover?")) {
      if (changeDuringPull) await writeFile(join(root, "opengame.json"), JSON.stringify({ ...local, title: "Concurrent edit" }));
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": cover.length, "x-opengame-sha256": corrupt ? "a".repeat(64) : hash, "x-opengame-cover-extension": "png" });
      res.end(cover); return;
    }
    res.setHeader("content-type", "application/json");
    // pull reads the game first, so a removed game is refused before its metadata is written.
    if (req.url === `/api/v1/games/${id}`) { res.end(JSON.stringify({ game: { id, publicId: "littleorbit", title: "Website title", visibility: removed ? "removed" : "draft", latestOperation: null } })); return; }
    res.end(JSON.stringify({ gameId: id, revision: 4, metadata, controllerSupport: false, compatibility: {}, cover: { path: `/api/v1/games/${id}/cover?revision=4` } }));
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
    corrupt = true; await assert.rejects(pull(), (error: unknown) => (error as { stdout: string }).stdout.includes("cover_download"));
    assert.equal(await readFile(join(root, "opengame.json"), "utf8"), original);
    corrupt = false; await pull();
    const current = JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));
    assert.equal(current.title, "Website title"); assert.deepEqual(current.build, local.build); assert.equal(current.sdk, "1");
    assert.equal(current.cover, `opengame-assets/cover-${hash}.png`);
    assert.deepEqual(await readFile(join(root, current.cover)), cover);
    assert.equal(await readFile(join(root, ".opengame/manifest-before-pull.json"), "utf8"), original);
    assert.equal(JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8")).metadataRevision, 4);
    await run(process.execPath, [binary, "check", root, "--jsonl"], { env });
    const archive = await createArchive(join(root, "dist"), current, new Output(true, () => {}), root);
    assert.deepEqual(Buffer.from(unzipSync(archive.bytes)[current.cover]!), cover);
    await pull();
    changeDuringPull = true; await assert.rejects(pull(), (error: unknown) => (error as { stdout: string }).stdout.includes("manifest_changed"));
    assert.equal(JSON.parse(await readFile(join(root, "opengame.json"), "utf8")).title, "Concurrent edit");
    changeDuringPull = false;
    await rm(join(root, "opengame-assets"), { recursive: true }); await symlink(join(root, "dist"), join(root, "opengame-assets"));
    await assert.rejects(pull(), (error: unknown) => (error as { stdout: string }).stdout.includes("cover_folder"));
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

test("supplemental project covers respect normalized roots and exclusion boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-pull-package-"));
  const silent = new Output(true, () => {});
  try {
    await mkdir(join(root, "dist/wrapper"), { recursive: true });
    await writeFile(join(root, "dist/wrapper/index.html"), '<!doctype html><title>Game</title><link rel="icon" href="cover.png">');
    await writeFile(join(root, "cover.png"), cover);
    const archive = await createArchive(join(root, "dist"), metadata, silent, root);
    assert.deepEqual(Object.keys(unzipSync(archive.bytes)).sort(), ["cover.png", "index.html"]);
    assert.deepEqual(Buffer.from(unzipSync(archive.bytes)["cover.png"]!), cover);
    await writeFile(join(root, "dist/wrapper/index.html"), "<!doctype html><title>Game</title>");
    await writeFile(join(root, ".env.png"), cover);
    await assert.rejects(createArchive(join(root, "dist"), { ...metadata, cover: ".env.png" }, silent, root), /cover/);
    await symlink(join(root, "cover.png"), join(root, "linked.png"));
    await assert.rejects(createArchive(join(root, "dist"), { ...metadata, cover: "linked.png" }, silent, root), /regular file/);
    await assert.rejects(createArchive(join(root, "dist"), { ...metadata, cover: "../cover.png" }, silent, root), /cover/);
    // Over the size limit is cover_size, not a symlink or a changing build: the helper
    // reports a size refusal apart from a race.
    await writeFile(join(root, "huge.png"), Buffer.alloc(LIMITS.platform.moderation.imageBytesMax + 1));
    await assert.rejects(createArchive(join(root, "dist"), { ...metadata, cover: "huge.png" }, silent, root), { code: "cover_size" });
    await assert.rejects(createArchive(join(root, "dist"), { ...metadata, cover: "linked.png" }, silent, root), { code: "symlink" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

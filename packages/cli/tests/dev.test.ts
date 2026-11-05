import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { contractHelp, DEV_APPROVAL_TAG, devHeaders, ENGINE_CONTRACT, hostTags, injectHostTags, isHostDocument, loadDevSdk, startDevServer } from "../src/dev";
import { THREADED_TARGET } from "../src/engines";
import { contractCapabilities, edgeSdkContract, openNetworkContract, RUNTIME_CONTRACT_VERSIONS, THREADED_CONTRACT, THREADED_MOVES } from "@opengame/shared/runtime-contracts";
import { assertNoReservedRuntimePaths, collectFiles } from "../src/files";
import { CURRENT_CONTRACT, contractFor, securityHeaders } from "../../../infra/worker/src/contracts";
import { GAME_AUDIO_VERSION } from "../../../infra/worker/src/game-audio";
import { LIMITS } from "@opengame/shared";
import { binary, cleanEnv, manifest, tempDir } from "./shell";

function get(url: string, path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: string; bytes: Buffer }>((resolve, reject) => {
    // Keep the request target literal. Passing url + path through URL parsing
    // removes encoded dot segments before the server can reject them.
    const req = request(url, { path, headers, method }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => { const bytes = Buffer.concat(chunks); resolve({ status: res.statusCode!, headers: res.headers, body: bytes.toString(), bytes }); });
    }); req.on("error", reject); assert.equal(req.path, path); req.end();
  });
}

test("dev uses real contract headers and preserves older isolation behavior", () => {
  // 2027-03 since 26 Oct 2026: the open network, with eval, and no isolation.
  assert.equal(CURRENT_CONTRACT, "2027-03");
  const base = securityHeaders(contractFor(CURRENT_CONTRACT), "http://localhost:* http://127.0.0.1:*");
  const headers = devHeaders();
  for (const [name, value] of base) assert.equal(headers.get(name), value, name);
  assert.equal(headers.get("cross-origin-embedder-policy"), null);
  assert.equal(headers.get("cross-origin-opener-policy"), null);
  assert.throws(() => devHeaders("unknown"), { code: "runtime_contract_unknown" });
  assert.equal(devHeaders(ENGINE_CONTRACT).get("cross-origin-opener-policy"), "same-origin");
  assert.equal(devHeaders(ENGINE_CONTRACT).get("cross-origin-embedder-policy"), "require-corp");
});

// The open contracts, 26 Oct 2026. dev serves what og-games serves for each, so a game that
// calls an AI model or its own wss server works under `opengame dev` exactly as it will
// once published, and a threaded one is tested on the contract it will actually reach.
test("dev serves the open network and eval under the current contract, and isolation on top for a threaded one", () => {
  assert.equal(openNetworkContract(CURRENT_CONTRACT), true);
  const current = devHeaders();
  const csp = current.get("content-security-policy")!;
  assert.match(csp, /script-src [^;]*'unsafe-eval'[^;]* https:/);
  assert.match(csp, /connect-src [^;]* https: wss:/);
  assert.match(csp, /frame-src 'none'/);
  assert.equal(current.get("cross-origin-embedder-policy"), null);

  assert.equal(THREADED_TARGET, THREADED_MOVES[CURRENT_CONTRACT]);
  assert.equal(THREADED_TARGET, "2027-04");
  const threaded = devHeaders(THREADED_TARGET);
  for (const [name, value] of securityHeaders(contractFor(THREADED_TARGET), "http://localhost:* http://127.0.0.1:*")) assert.equal(threaded.get(name), value, name);
  assert.match(threaded.get("content-security-policy")!, /connect-src [^;]* https: wss:/);
  assert.match(threaded.get("content-security-policy")!, /'unsafe-eval'/);
  assert.equal(threaded.get("cross-origin-embedder-policy"), "require-corp");
  assert.equal(threaded.get("cross-origin-opener-policy"), "same-origin");
});

// 2027-02 went live on 23 Oct 2026 and dev went on serving it as a bare 2026-11 page with
// isolation headers: no SDK, because the injection test was `=== ENGINE_CONTRACT`. These
// hold dev to what og-games sends for it, header for header, and to the SDK it adds.
test("under the threaded contract dev sends og-games' isolation headers and COOP", () => {
  const capabilities = contractCapabilities(THREADED_CONTRACT)!;
  assert.equal(capabilities.crossOriginIsolated, true);
  assert.equal(capabilities.unsafeEval, false);
  const base = securityHeaders(contractFor(THREADED_CONTRACT), "http://localhost:* http://127.0.0.1:*");
  const headers = devHeaders(THREADED_CONTRACT);
  for (const [name, value] of base) assert.equal(headers.get(name), value, name);
  assert.equal(headers.get("cross-origin-embedder-policy"), "require-corp");
  assert.equal(headers.get("document-isolation-policy"), "isolate-and-require-corp");
  assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");
  assert.match(headers.get("permissions-policy")!, /cross-origin-isolated=\(self\)/);
  assert.equal(headers.get("x-runtime-contract"), THREADED_CONTRACT);
  assert.doesNotMatch(headers.get("content-security-policy")!, /'unsafe-eval'/);
});

test("dev --contract for the threaded contract serves the SDK and its notice, as og-games does", async () => {
  assert.equal(edgeSdkContract(THREADED_CONTRACT), true);
  const sdk = Buffer.from("window.OpenGame={fixture:true}"), sdkNotice = Buffer.from("notice");
  const source = "<!doctype html><title>Threads</title><script src=\"game.js\"></script>";
  const running = await startDevServer({ snapshot: new Map([["index.html", Buffer.from(source)], ["game.js", Buffer.from("1")]]), sdk, sdkNotice, contract: THREADED_CONTRACT });
  try {
    const page = await get(running.url, "/");
    assert.equal(page.body, "<!doctype html>" + DEV_APPROVAL_TAG + hostTags(true) + "<title>Threads</title><script src=\"game.js\"></script>");
    assert.equal(page.headers["cross-origin-embedder-policy"], "require-corp");
    assert.equal(page.headers["cross-origin-opener-policy"], "same-origin");
    assert.equal(page.headers["document-isolation-policy"], "isolate-and-require-corp");
    const script = await get(running.url, "/_og/sdk.js");
    assert.equal(script.status, 200);
    assert.deepEqual(script.bytes, Buffer.concat([Buffer.from("window.__OG_DEV__=1;"), sdk]));
    assert.equal(script.headers["cross-origin-embedder-policy"], "require-corp");
    assert.deepEqual((await get(running.url, "/_og/sdk.js.LEGAL.txt")).bytes, sdkNotice);
    assert.equal((await get(running.url, "/_og/host.js")).status, 200);
  } finally { await running.close(); }
});

test("help names what each contract allows from the capability table", () => {
  const help = contractHelp();
  for (const version of RUNTIME_CONTRACT_VERSIONS) assert.match(help, new RegExp(version));
  assert.match(help, new RegExp(`${ENGINE_CONTRACT} allows cross-origin isolation and eval, lets a game reach only OpenGame's own hosts, and adds the SDK to every page\\. It is deprecated`));
  assert.match(help, new RegExp(`${THREADED_CONTRACT} allows cross-origin isolation but not eval, lets a game reach only OpenGame's own hosts, and adds the SDK to every page\\. A release on 2026-11 whose scan finds threads is moved onto it automatically\\.`));
  assert.match(help, /2027-03 allows eval but not cross-origin isolation, lets a game reach any https host, and adds no SDK\./);
  assert.match(help, /2027-04 allows cross-origin isolation and eval, lets a game reach any https host, and adds the SDK to every page\. A release on 2027-03 whose scan finds threads is moved onto it automatically\./);
  assert.match(help, new RegExp(`Defaults to ${CURRENT_CONTRACT}`));
  assert.doesNotMatch(help, /experimental|not been tested|—/);
});

// The pipeline's own outputs, written by running its _inject over these inputs. Python's
// test_derived_assets.py is meant to read the same file, so a change to either side
// fails somewhere rather than drifting.
const injection = JSON.parse(await readFile(new URL("./fixtures/host-injection.json", import.meta.url), "utf8")) as {
  tags: string; documents: { name: string; path: string; input: string; output: string }[] };

test("dev injects the documents the pipeline injects, where it injects them, keeping every byte", () => {
  for (const row of injection.documents) {
    assert.equal(isHostDocument(row.path) ? injectHostTags(row.input, injection.tags) : row.input, row.output, row.name);
  }
  assert.equal(isHostDocument(".html"), false);
  assert.equal(isHostDocument("a/..htm"), true);
  assert.equal(hostTags(true), `<script src="/_og/host.js" data-og-audio="${GAME_AUDIO_VERSION}"></script><script src="/_og/sdk.js"></script>`);
  assert.equal(hostTags(false), `<script src="/_og/host.js" data-og-audio="${GAME_AUDIO_VERSION}"></script>`);
});

test("under the engine contract every served page carries the pipeline's tags, and under an older one none do", async () => {
  const snapshot = new Map(injection.documents.map(row => [row.path, Buffer.from(row.input)]));
  const sdk = { sdk: Buffer.from("window.OpenGame={fixture:true}"), sdkNotice: Buffer.from("notice") };
  const engine = await startDevServer({ snapshot, ...sdk, contract: ENGINE_CONTRACT });
  try {
    for (const row of injection.documents) {
      assert.equal((await get(engine.url, "/" + encodeURI(row.path))).body, row.output.replace(injection.tags, DEV_APPROVAL_TAG + hostTags(true)), row.name);
    }
    const host = await get(engine.url, "/_og/host.js");
    assert.equal(host.status, 200);
    assert.match(host.body, /localhost:\*/);
    assert.equal((await get(engine.url, "/_og/sdk.js")).status, 200);
  } finally { await engine.close(); }
  const older = await startDevServer({ snapshot, ...sdk, contract: CURRENT_CONTRACT });
  try {
    for (const row of injection.documents) {
      const expected = isHostDocument(row.path) ? injectHostTags(row.input, DEV_APPROVAL_TAG) : row.input;
      assert.equal((await get(older.url, "/" + encodeURI(row.path))).body, expected, row.name);
    }
    assert.equal((await get(older.url, "/_og/dev.js")).body, "window.__OG_DEV__=1;");
    assert.equal((await get(older.url, "/_og/host.js")).status, 404);
    assert.equal((await get(older.url, "/_og/sdk.js")).status, 404);
  } finally { await older.close(); }
});

test("same-origin SDK, compressed wasm, service workers and hostile request paths", async () => {
  const sdkNotice = Buffer.from("\ufeffDependency copyright — fixture\r\nPermission text.\n");
  const running = await startDevServer({ snapshot: new Map([
    ["index.html", Buffer.from('<head><script src="game.js"></script></head>')],
    ["game.wasm.gz", Buffer.from("compressed-fixture")],
    ["worker.js", Buffer.from("postMessage('ready')")],
  ]), sdk: Buffer.from("window.OpenGame={fixture:true}"), sdkNotice, port: 0, contract: ENGINE_CONTRACT });
  try {
    assert.match((await get(running.url, "/")).body, /src="\/_og\/sdk.js"/);
    assert.match((await get(running.url, "/_og/sdk.js")).body, /OpenGame/);
    const notice = await get(running.url, "/_og/sdk.js.LEGAL.txt");
    assert.equal(notice.status, 200);
    assert.deepEqual(notice.bytes, sdkNotice);
    assert.equal(Number(notice.headers["content-length"]), sdkNotice.byteLength);
    const noticeHead = await get(running.url, "/_og/sdk.js.LEGAL.txt", {}, "HEAD");
    assert.equal(noticeHead.status, 200);
    assert.equal(noticeHead.bytes.byteLength, 0);
    assert.equal(Number(noticeHead.headers["content-length"]), sdkNotice.byteLength);
    const wasm = await get(running.url, "/game.wasm.gz");
    assert.equal(wasm.headers["content-type"], "application/wasm"); assert.equal(wasm.headers["content-encoding"], "gzip");
    assert.equal((await get(running.url, "/game.wasm.gz", {}, "HEAD")).body, "");
    for (const path of ["/%2e%2e/.env", "/%2e%2e/worker.js", "/%2fetc/passwd", "/%255f%256fg/sdk.js", "/foo%5cbar"]) {
      const rejected = await get(running.url, path);
      assert.equal(rejected.status, 400, path);
      assert.equal(rejected.body, "Invalid path", path);
    }
    // A URL-aware client can erase the hostile segment before transmission.
    // Pin both outcomes: the raw target above is rejected even for a real asset,
    // while the normalized target resolves only inside the in-memory snapshot.
    const normalizedAsset = new URL("/%2e%2e/worker.js", running.url).pathname;
    assert.equal(normalizedAsset, "/worker.js");
    const worker = await get(running.url, normalizedAsset);
    assert.equal(worker.status, 200);
    assert.equal(worker.body, "postMessage('ready')");
    const normalizedSecret = new URL("/%2e%2e/.env", running.url).pathname;
    assert.equal(normalizedSecret, "/.env");
    const absentSecret = await get(running.url, normalizedSecret);
    assert.equal(absentSecret.status, 404);
    assert.equal(absentSecret.body, "File not found");
    assert.equal((await get(running.url, "/worker.js", { "service-worker": "script" })).status, 403);
    assert.equal((await get(running.url, "/", { host: "attacker.invalid" })).status, 403);
    assert.equal((await get(running.url, "/", {}, "POST")).status, 405);
    assert.equal((await get(running.url, "/.env")).status, 404);
  } finally { await running.close(); }
});

test("reserved paths fail before excluded files or empty directories hide the collision", async () => {
  assert.throws(() => assertNoReservedRuntimePaths(["_OG/sdk.js"]), { code: "reserved_runtime_path" });
  const root = await tempDir("og-reserved-");
  try {
    await writeFile(join(root.dir, "index.html"), "game"); await mkdir(join(root.dir, "_og"));
    await assert.rejects(collectFiles(root.dir), { code: "reserved_runtime_path" });
  } finally { await root.remove(); }
});

test("bundled dev emits its listening result in agent JSON and closes on SIGTERM", { timeout: 15000 }, async () => {
  const root = await tempDir("og-dev-lifecycle-");
  await writeFile(join(root.dir, "index.html"), "<head></head>");
  await writeFile(join(root.dir, "opengame.json"), JSON.stringify(manifest));
  const child = spawn(process.execPath, [binary, "dev", root.dir, "--contract", ENGINE_CONTRACT, "--json"], { env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  const closed = once(child, "close");
  let stdout = "", stderr = "";
  child.stderr.on("data", data => { stderr += data; });
  try {
    const result = await new Promise<any>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => reject(new Error(stdout + stderr)));
      child.stdout.on("data", data => { stdout += data; try { resolve(JSON.parse(stdout)); } catch { /* Wait for the complete object. */ } });
    });
    assert.equal(result.type, "result"); assert.equal(result.command, "dev");
    // 2027-01 is the one contract dev warns about, and it points at the one that replaced it.
    assert.equal(result.data.deprecated, true);
    assert.match(result.data.message, new RegExp(`${ENGINE_CONTRACT} is deprecated.*--contract ${THREADED_TARGET}`));
    assert.doesNotMatch(result.data.message, /experimental|—/);
    const url = result.data.url;
    assert.equal((await get(url, "/_og/sdk.js")).status, 200);
    assert.deepEqual((await get(url, "/_og/sdk.js.LEGAL.txt")).bytes,
      await readFile(new URL("../dist/opengame-global.js.LEGAL.txt", import.meta.url)));
    child.kill("SIGTERM");
    assert.equal((await closed)[0], 0);
    await assert.rejects(get(url, "/"));
  } finally { child.kill("SIGKILL"); await closed; await root.remove(); }
});

// The command, not just the server: the CLI decides whether to load the SDK before it starts
// one, and that decision is where 2027-02 was missed. og-games never reads the manifest, so
// `sdk.inject: false` cannot keep the SDK out of a 2027-02 page in production, and does not
// here. The deprecation warning belongs to 2027-01 alone.
test("bundled dev --contract for the threaded contract serves the SDK and isolation headers, and warns about nothing", { timeout: 15000 }, async () => {
  const root = await tempDir("og-dev-threaded-");
  await writeFile(join(root.dir, "index.html"), "<!doctype html><title>Threads</title>");
  await writeFile(join(root.dir, "opengame.json"), JSON.stringify({ ...manifest, sdk: { inject: false } }));
  const child = spawn(process.execPath, [binary, "dev", root.dir, "--contract", THREADED_CONTRACT, "--json"], { env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  const closed = once(child, "close");
  let stdout = "", stderr = "";
  child.stderr.on("data", data => { stderr += data; });
  try {
    const result = await new Promise<any>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => reject(new Error(stdout + stderr)));
      child.stdout.on("data", data => { stdout += data; try { resolve(JSON.parse(stdout)); } catch { /* Wait for the complete object. */ } });
    });
    assert.equal(result.data.runtimeContract, THREADED_CONTRACT);
    assert.equal(result.data.deprecated, false);
    assert.doesNotMatch(result.data.message, /experimental|deprecated/i);
    const url = result.data.url;
    const page = await get(url, "/");
    assert.match(page.body, /<script src="\/_og\/sdk\.js"><\/script><title>/);
    assert.equal(page.headers["cross-origin-opener-policy"], "same-origin");
    assert.equal(page.headers["cross-origin-embedder-policy"], "require-corp");
    assert.equal(page.headers["document-isolation-policy"], "isolate-and-require-corp");
    const sdk = await get(url, "/_og/sdk.js");
    assert.equal(sdk.status, 200);
    assert.deepEqual(sdk.bytes, Buffer.concat([Buffer.from("window.__OG_DEV__=1;"), await readFile(new URL("../dist/opengame-global.js", import.meta.url))]));
    assert.equal(sdk.headers["cross-origin-embedder-policy"], "require-corp");
    child.kill("SIGTERM");
    assert.equal((await closed)[0], 0);
  } finally { child.kill("SIGKILL"); await closed; await root.remove(); }
});

test("no SDK bytes means the explicit SDK opt-out keeps the host runtime and the dev approval marker", async () => {
  const source = "<!doctype html><title>Own SDK</title>";
  const running = await startDevServer({ snapshot: new Map([["index.html", Buffer.from(source)]]), sdkNotice: Buffer.from("unused notice"), contract: ENGINE_CONTRACT });
  try {
    assert.equal((await get(running.url, "/")).body, "<!doctype html>" + DEV_APPROVAL_TAG + hostTags(false) + "<title>Own SDK</title>");
    assert.equal((await get(running.url, "/_og/host.js")).status, 200);
    assert.equal((await get(running.url, "/_og/sdk.js")).status, 404);
    assert.equal((await get(running.url, "/_og/sdk.js.LEGAL.txt")).status, 404);
  } finally { await running.close(); }
});

test("injected SDK requires a nonempty notice before starting a server", async () => {
  const snapshot = new Map([["index.html", Buffer.from("<title>Game</title>")]]);
  for (const sdkNotice of [undefined, Buffer.alloc(0)]) {
    await assert.rejects(startDevServer({ snapshot, sdk: Buffer.from("fixture"), sdkNotice }), { code: "dev_sdk_missing", exitCode: 5 });
  }
  await assert.rejects(startDevServer({ snapshot, sdk: Buffer.alloc(0), sdkNotice: Buffer.from("notice") }), { code: "dev_sdk_missing", exitCode: 5 });
});

test("packaged SDK loading retains exact notice bytes and refuses missing or empty members", async () => {
  const root = await tempDir("og-sdk-notice-");
  const sdk = Buffer.from("window.OpenGame={fixture:true}");
  const sdkNotice = Buffer.from("\ufeffCopyright fixture\r\nDependency terms.\n");
  const directory = pathToFileURL(root.dir + "/");
  try {
    await writeFile(join(root.dir, "opengame-global.js"), sdk);
    await writeFile(join(root.dir, "opengame-global.js.LEGAL.txt"), sdkNotice);
    assert.deepEqual(await loadDevSdk(directory), { sdk, sdkNotice });
    for (const name of ["opengame-global.js", "opengame-global.js.LEGAL.txt"]) {
      await rm(join(root.dir, name));
      await assert.rejects(loadDevSdk(directory), { code: "dev_sdk_missing", exitCode: 5 });
      await writeFile(join(root.dir, name), Buffer.alloc(0));
      await assert.rejects(loadDevSdk(directory), { code: "dev_sdk_missing", exitCode: 5 });
      await writeFile(join(root.dir, name), name.endsWith(".txt") ? sdkNotice : sdk);
    }
  } finally { await root.remove(); }
});

// The SDK's local leaderboard reads opengame.json beside the page. dev serves the export,
// which has no such file, so every local score failed "unavailable" until dev served the
// manifest it had validated (stranger walk, 22 Oct 2026).
test("dev serves the validated manifest where the SDK's local mode looks for it, unless the export ships one", async () => {
  const declared = { ...manifest, leaderboards: [{ key: "points", order: "desc" }] } as unknown as import("@opengame/protocol").GameManifest;
  const running = await startDevServer({ snapshot: new Map([["index.html", Buffer.from("<title>Game</title>")]]), manifest: declared });
  try {
    const served = await get(running.url, "/opengame.json");
    assert.equal(served.status, 200);
    assert.match(String(served.headers["content-type"]), /json/);
    assert.deepEqual(JSON.parse(served.body).leaderboards, [{ key: "points", order: "desc" }]);
  } finally { await running.close(); }
  const own = await startDevServer({ snapshot: new Map([["index.html", Buffer.from("<title>Game</title>")], ["opengame.json", Buffer.from('{"own":true}')]]), manifest: declared });
  try { assert.equal((await get(own.url, "/opengame.json")).body, '{"own":true}'); }
  finally { await own.close(); }
});

/* A game served top-level can read its own query, and on OpenGame nothing in the play
   page's address reaches it. Dev says so when the entry document is asked for with a
   parameter of the game's own, and stays quiet for assets, an empty `?`, and the SDK's
   own local parameters and the harnesses' `mute`. */
test("dev reports a game parameter on the entry document, and only there", async () => {
  let told = 0;
  const running = await startDevServer({ snapshot: new Map([["index.html", Buffer.from("<head></head>")], ["game.js", Buffer.from("1")]]), onQueryString: () => { told++; } });
  try {
    for (const path of ["/", "/?", "/game.js?v=2", "/index.html", "/?join=ABCD", "/?og-dev-player=signed-in", "/?mute=1&join=ABCD"]) assert.equal((await get(running.url, path)).status, 200, path);
    assert.equal(told, 0);
    assert.equal((await get(running.url, "/?wave=3")).status, 200, "the page is still served");
    assert.equal((await get(running.url, "/index.html?mute=1&demo=1")).status, 200);
    assert.equal(told, 2);
  } finally { await running.close(); }
});

/* Run dev as an agent would and wait for its lines. Every wait fits inside the test's own
   timeout, so a missing notice fails the test instead of hanging it, and `finally` stops
   the child. The exit hook covers a runner that exits normally mid-test; nothing here can
   catch a runner killed by a signal. */
async function devLines(mode: "--json" | "--jsonl", paths: string[], until: (events: any[]) => boolean) {
  const root = await tempDir("og-dev-query-");
  await writeFile(join(root.dir, "index.html"), "<head></head>");
  await writeFile(join(root.dir, "opengame.json"), JSON.stringify(manifest));
  const child = spawn(process.execPath, [binary, "dev", root.dir, mode], { env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  const reap = () => child.kill("SIGKILL");
  process.once("exit", reap);
  const closed = once(child, "close");
  let stdout = "", stderr = "";
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  // Only whole lines: a write can split one, and a pretty-printed --json object spans many.
  // Only whole lines: a write can split one. Under --json stdout is the one pretty-printed
  // result and a late notice is a line on stderr.
  const lines = (text: string) => text.split("\n").slice(0, -1).filter(line => line.startsWith("{")).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const events = () => mode === "--jsonl" ? lines(stdout)
    : [...(() => { try { return [JSON.parse(stdout)]; } catch { return []; } })(), ...lines(stderr)];
  const wait = async (done: () => boolean) => {
    for (const started = Date.now(); !done(); await new Promise(resolve => setTimeout(resolve, 50))) {
      if (child.exitCode !== null || Date.now() - started > 8000) throw new Error(`gave up waiting: ${stdout}${stderr}`);
    }
  };
  try {
    await wait(() => events().some(event => event.type === "result"));
    const url = events().find(event => event.type === "result").data.url;
    for (const path of paths) await get(url, path);
    await wait(() => until(events()));
    child.kill("SIGTERM");
    assert.equal((await closed)[0], 0);
    return events();
  } finally { process.off("exit", reap); child.kill("SIGKILL"); await closed; await root.remove(); }
}

test("bundled dev tells the creator once, in --jsonl and in --json, that page parameters never reach the game", { timeout: 40000 }, async () => {
  const message = "A parameter added to the play page's address never reaches your game on OpenGame.";
  const streamed = await devLines("--jsonl", ["/?og-dev-player=guest", "/?wave=3", "/?bot=1"], events => events.some(event => event.code === "query_not_forwarded"));
  assert.deepEqual(streamed.filter(event => event.code === "query_not_forwarded").map(event => event.message), [message]);
  // --json prints its one object before any request can arrive, so stdout stays that one
  // object and the notice is a JSON line on stderr.
  const object = await devLines("--json", ["/?wave=3"], events => events.some(event => event.code === "query_not_forwarded"));
  assert.equal(object[0].type, "result");
  assert.equal(object.filter(event => event.type === "result").length, 1);
  assert.deepEqual(object.filter(event => event.code === "query_not_forwarded").map(event => event.message), [message]);
});

async function sparse(path: string, bytes: number) {
  const { open } = await import("node:fs/promises");
  const handle = await open(path, "w");
  try { await handle.truncate(bytes); } finally { await handle.close(); }
}

/* OG Clash's export is 3.1 GiB, almost all of it cooked files an asset plan keeps out of
   the upload. dev read the whole export into memory, so the ordinary limit refused it and
   said to remove what the game does not load, which is all of it. */
test("the size refusal names --external-assets when an asset plan would bring the build within the limit", async () => {
  const root = await tempDir("og-dev-limit-");
  try {
    await mkdir(join(root.dir, "cooked"));
    await writeFile(join(root.dir, "index.html"), "<title>Game</title>");
    // Over the whole-build cap in files each under the per-file cap (bundle.fileBytesMax),
    // so it is the total that a plan would bring within the limit.
    const worlds = Math.floor(LIMITS.bundle.uncompressedBytesMax / (250 * 1024 * 1024)) + 1;
    for (let index = 0; index < worlds; index += 1) await sparse(join(root.dir, `cooked/world${index}.hza`), 250 * 1024 * 1024);
    await assert.rejects(collectFiles(root.dir), (error: Error & { code?: string }) => error.code === "bundle_limit"
      && /can stay out of the upload in a Kaigen asset plan/.test(error.message) && /--external-assets/.test(error.message)
      && /https:\/\/docs\.opengame\.io\/engines\/kaigen\b/.test(error.message) && /Otherwise remove what the game does not load/.test(error.message) && !/—/.test(error.message));
    // The same weight in files no plan admits gets the old advice and nothing about plans.
    for (let index = 0; index < worlds; index += 1) await rm(join(root.dir, `cooked/world${index}.hza`));
    for (let index = 0; index < worlds; index += 1) await sparse(join(root.dir, `cooked/world${index}.js`), 250 * 1024 * 1024);
    await assert.rejects(collectFiles(root.dir), (error: Error & { code?: string }) => error.code === "bundle_limit"
      && /\. Remove what the game does not load/.test(error.message) && !/external-assets/.test(error.message));
  } finally { await root.remove(); }
});

test("one file past the per-file cap is pointed at a plan only when the plan's own cap takes it", async () => {
  const root = await tempDir("og-dev-file-limit-");
  try {
    await mkdir(join(root.dir, "Build"));
    await writeFile(join(root.dir, "index.html"), "<title>Game</title>");
    // Unity's lane takes a .data file of up to 512 MiB, so a 300 MiB one gets the plan.
    await sparse(join(root.dir, "Build/game.data"), 300 * 1024 * 1024);
    await assert.rejects(collectFiles(root.dir), (error: Error & { code?: string }) => error.code === "bundle_limit"
      && error.message.startsWith("Build/game.data is 300 MiB, and one file can be at most 256 MiB.")
      && /stay out of the upload in a Unity asset plan/.test(error.message) && /Otherwise split it/.test(error.message));
    // Kaigen's lane is 256 MiB a file too, so a 300 MiB .hza is not sent to a plan that would refuse it.
    await rm(join(root.dir, "Build/game.data"));
    await mkdir(join(root.dir, "cooked"));
    await sparse(join(root.dir, "cooked/world.hza"), 300 * 1024 * 1024);
    await assert.rejects(collectFiles(root.dir), (error: Error & { code?: string }) => error.code === "bundle_limit"
      && /^cooked\/world\.hza is 300 MiB/.test(error.message) && !/external-assets/.test(error.message) && /\. Split it/.test(error.message));
  } finally { await root.remove(); }
});

/* 30 Oct 2026, 3,001 text files beside index.html: the only plan they fit was
   large-game-v1, which names no engine, so the refusal read "in a  asset plan. If this is
   a  game, ... as  shows", with three blanks where the names go. The count is
   read from bundle.fileCountMax, because that cap is no longer 3,000. */
test("the count refusal names the large-game plan, not blanks, when only a plan for any engine fits", async () => {
  const root = await tempDir("og-dev-count-");
  try {
    await mkdir(join(root.dir, "data"));
    await writeFile(join(root.dir, "index.html"), "<title>Game</title>");
    for (let i = 0; i <= LIMITS.bundle.fileCountMax; i++) await writeFile(join(root.dir, "data", `f${i}.txt`), "x");
    await assert.rejects(collectFiles(root.dir), (error: Error & { code?: string }) => {
      assert.equal(error.code, "bundle_limit");
      assert.doesNotMatch(error.message, /\ba {2}|\bas {2}|a  asset/);
      assert.match(error.message, /large-game-v1/);
      assert.match(error.message, /--external-assets auto/);
      assert.match(error.message, /https:\/\/docs\.opengame\.io\/guides\/packaging\b/);
      assert.doesNotMatch(error.message, /apps\/docs/, "a stranger has no repository path to open");
      assert.match(error.message, /Otherwise combine or remove some/);
      return true;
    });
  } finally { await root.remove(); }
});

test("bundled dev --external-assets serves a plan's files from disk and keeps them out of the snapshot", { timeout: 30000 }, async () => {
  const root = await tempDir("og-dev-external-");
  await mkdir(join(root.dir, "cooked/world"), { recursive: true });
  await writeFile(join(root.dir, "index.html"), "<head></head>");
  await writeFile(join(root.dir, "opengame.json"), JSON.stringify(manifest));
  await writeFile(join(root.dir, "cooked/world/a.hza"), "cooked page");
  await writeFile(join(root.dir, "cooked/catalog.index"), "catalogue");
  await sparse(join(root.dir, "cooked/world/big.hza"), 300 * 1024 * 1024);
  await writeFile(join(root.dir, "kaigen-assets.json"), JSON.stringify({ delivery: "kaigen-assets-v1", assets: ["cooked/"] }));
  const child = spawn(process.execPath, [binary, "dev", root.dir, "--external-assets", "kaigen-assets.json", "--json"], { env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  const closed = once(child, "close");
  let stdout = "", stderr = "";
  child.stderr.on("data", data => { stderr += data; });
  try {
    const result = await new Promise<any>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => reject(new Error(stdout + stderr)));
      child.stdout.on("data", data => { stdout += data; try { resolve(JSON.parse(stdout)); } catch { /* Wait for the complete object. */ } });
    });
    assert.equal(result.type, "result", stdout);
    assert.equal(result.data.externalAssets, 2);
    assert.match(result.data.message, /2 files in the asset plan are read from disk when the game asks for them/);
    const url = result.data.url;
    const page = await get(url, "/cooked/world/a.hza");
    assert.equal(page.status, 200);
    assert.equal(page.body, "cooked page");
    assert.equal(page.headers["content-length"], "11");
    assert.equal(page.headers["cache-control"], "no-store", "the plan's files get the game's headers too");
    // A file the plan does not admit stays in the snapshot and is served from it.
    assert.equal((await get(url, "/cooked/catalog.index")).body, "catalogue");
    // The loopback check still comes first, and nothing outside the plan is read from disk.
    assert.equal((await get(url, "/cooked/world/a.hza", { host: "evil.test" })).status, 403);
    await writeFile(join(root.dir, "cooked/world/late.hza"), "added after start");
    assert.equal((await get(url, "/cooked/world/late.hza")).status, 404);
    // Read on request, so an edit shows and a deleted file is a 404 rather than old bytes.
    await writeFile(join(root.dir, "cooked/world/a.hza"), "cooked page, rebuilt");
    assert.equal((await get(url, "/cooked/world/a.hza")).body, "cooked page, rebuilt");
    await rm(join(root.dir, "cooked/world/a.hza"));
    assert.equal((await get(url, "/cooked/world/a.hza")).status, 404);
    child.kill("SIGTERM");
    assert.equal((await closed)[0], 0);
  } finally { child.kill("SIGKILL"); await closed; await root.remove(); }
});

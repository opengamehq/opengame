import test from "node:test";
import assert from "node:assert/strict";
import { vendorDependencies, vendorFetchFailure } from "../src/vendor";
import { CliError } from "../src/output";

const base = "https://cdn.jsdelivr.net/npm/three@1.2.3/";
const metadata = JSON.stringify({ name: "three", version: "1.2.3", license: "MIT" });

test("vendoring pins transitive paths, records license/source hashes and leaves source bytes intact", async () => {
  const original = Buffer.from(`<script type="module" src="${base}build/three.module.js"></script>`);
  const staged = new Map([["index.html", original]]);
  const requests: string[] = [];
  const bodies = new Map([[base + "package.json", metadata], [base + "LICENSE", "MIT license text"],
    [base + "build/three.module.js", 'export {x} from "./three.core.js";'], [base + "build/three.core.js", "export const x=1;"]]);
  const receipt = await vendorDependencies(staged, { fetchBytes: async url => { requests.push(url); assert.ok(bodies.has(url), url); return Buffer.from(bodies.get(url)!); } });
  assert.match(staged.get("index.html")!.toString(), /src="\/\.opengame-vendor\/three@1\.2\.3\/build\/three.module.js"/);
  assert.match(staged.get(".opengame-vendor/three@1.2.3/build/three.module.js")!.toString(), /"\/\.opengame-vendor\/three@1\.2\.3\/build\/three.core.js"/);
  assert.ok(original.toString().includes(base));
  assert.equal(receipt.length, 2);
  assert.ok(receipt.every(row => row.license === "MIT" && /^[a-f0-9]{64}$/.test(row.sourceSha256) && /^[a-f0-9]{64}$/.test(row.licenseSha256)));
  assert.deepEqual(requests, [base + "package.json", base + "LICENSE", base + "build/three.module.js", base + "build/three.core.js"]);
});

test("a pinned dependency cannot redirect transitive imports to another host or use bare imports", async () => {
  for (const source of ['import "https://attacker.invalid/x.js";', 'import "other-package";']) {
    const staged = new Map([["index.html", Buffer.from(`<script src="${base}build/main.js"></script>`)]]);
    await assert.rejects(vendorDependencies(staged, { fetchBytes: async url => Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : source) }), error => {
      assert.ok(error && typeof error === "object" && "code" in error);
      return ["vendor_source", "vendor_bare_import"].includes(String(error.code));
    });
  }
});

test("integrity hashes describe rewritten dependency bytes in the staged copy", async () => {
  const { createHash } = await import("node:crypto");
  const source = 'export {x} from "./core.js";';
  const sourceIntegrity = "sha256-" + createHash("sha256").update(source).digest("base64");
  const original = Buffer.from(`<script type="module" src="${base}main.js" integrity="${sourceIntegrity}"></script>`);
  const staged = new Map([["index.html", original]]);
  await vendorDependencies(staged, { fetchBytes: async url => Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : url.endsWith("core.js") ? "export const x=1;" : 'export {x} from "./core.js";') });
  const expected = "sha384-" + createHash("sha384").update(staged.get(".opengame-vendor/three@1.2.3/main.js")!).digest("base64");
  assert.ok(staged.get("index.html")!.toString().includes(`integrity="${expected}"`));
  assert.ok(original.toString().includes(sourceIntegrity));
});

test("stylesheets include pinned font files and module URL assets include Wasm", async () => {
  const font = Buffer.from("font fixture"), wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  const original = Buffer.from(`<link rel="stylesheet" href="${base}fonts.css"><script type="module" src="${base}decoder.js"></script>`);
  const staged = new Map([["index.html", original]]);
  const bodies = new Map<string, Uint8Array>([[base + "package.json", Buffer.from(metadata)], [base + "LICENSE", Buffer.from("MIT text")],
    [base + "fonts.css", Buffer.from('@font-face{font-family:Game;src:url(./game.woff2)}')], [base + "game.woff2", font],
    [base + "decoder.js", Buffer.from('export const asset=new URL("./decoder.wasm", import.meta.url);')], [base + "decoder.wasm", wasm]]);
  const receipt = await vendorDependencies(staged, { fetchBytes: async url => { assert.ok(bodies.has(url), url); return bodies.get(url)!; } });
  assert.match(staged.get(".opengame-vendor/three@1.2.3/fonts.css")!.toString(), /url\(\/\.opengame-vendor\/three@1\.2\.3\/game.woff2\)/);
  assert.match(staged.get(".opengame-vendor/three@1.2.3/decoder.js")!.toString(), /"\/\.opengame-vendor\/three@1\.2\.3\/decoder.wasm"/);
  assert.deepEqual([...staged.get(".opengame-vendor/three@1.2.3/game.woff2")!], [...font]);
  assert.deepEqual([...staged.get(".opengame-vendor/three@1.2.3/decoder.wasm")!], [...wasm]);
  assert.equal(receipt.length, 4);
});

test("known decoder-directory recipes include each decoder file with pinned provenance", async () => {
  const directory = base + "examples/jsm/libs/draco/";
  const staged = new Map([["index.html", Buffer.from(`<script>loader.setDecoderPath("${directory}");</script>`)]]);
  const requested: string[] = [];
  const receipt = await vendorDependencies(staged, { fetchBytes: async url => {
    requested.push(url);
    return Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : url.endsWith(".wasm") ? "wasm fixture" : "export const decoder=true;");
  } });
  assert.equal(receipt.length, 3);
  assert.ok(staged.has(".opengame-vendor/three@1.2.3/examples/jsm/libs/draco/draco_decoder.wasm"));
  assert.ok(staged.get("index.html")!.toString().includes('/.opengame-vendor/three@1.2.3/examples/jsm/libs/draco/'));
  assert.ok(requested.every(url => url.startsWith(base)));
});

test("vendoring retains the publisher's original integrity refusal", async () => {
  const original = Buffer.from(`<script type="module" src="${base}main.js" integrity="sha256-original"></script>`);
  const staged = new Map([["index.html", original]]);
  await assert.rejects(vendorDependencies(staged, { fetchBytes: async url => Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : "export const x=1;") }), { code: "vendor_integrity" });
  assert.deepEqual(staged.get("index.html"), original);
});

test("an upstream import refusal does not print its unscanned credential value", async () => {
  const secret = "sk-proj-" + "x".repeat(48);
  const original = Buffer.from(`<script type="module" src="${base}main.js"></script>`);
  const staged = new Map([["index.html", original]]);
  await assert.rejects(vendorDependencies(staged, { fetchBytes: async url => Buffer.from(
    url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : `import ${JSON.stringify(secret)};`,
  ) }), error => {
    assert.ok(error instanceof Error && "code" in error);
    assert.equal(error.code, "vendor_bare_import");
    assert.ok(!error.message.includes(secret));
    assert.ok(!JSON.stringify({ message: error.message }).includes(secret));
    return true;
  });
  assert.deepEqual(staged.get("index.html"), original);
});

test("pinned unpkg references are canonicalized to the approved CDN without redirects", async () => {
  const source = "https://unpkg.com/three@1.2.3/build/main.js";
  const staged = new Map([["index.html", Buffer.from(`<script src="${source}"></script>`)]]);
  const requests: string[] = [];
  const receipt = await vendorDependencies(staged, { fetchBytes: async url => {
    requests.push(url);
    return Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : "globalThis.game=1;");
  } });
  assert.ok(requests.every(url => url.startsWith(base)));
  assert.equal(receipt[0]!.sourceUrl, base + "build/main.js");
  assert.match(staged.get("index.html")!.toString(), /\/\.opengame-vendor\/three@1\.2\.3\/build\/main\.js/);
});

test("unpinned, encoded and dot-segment CDN references fail before any download", async () => {
  for (const url of ["https://unpkg.com/three@latest/build/main.js", "https://cdn.jsdelivr.net/npm/three@1.2.3/build/%2e%2e/main.js",
    "https://cdn.jsdelivr.net/npm/three@1.2.3/build/../main.js", "https://unpkg.com/three@1.2.3/build/main.js?token=secret"]) {
    let requests = 0;
    const source = Buffer.from(`<script src="${url}"></script>`);
    const staged = new Map([["index.html", source]]);
    await assert.rejects(vendorDependencies(staged, { fetchBytes: async () => { requests++; return Buffer.from(""); } }), { code: "vendor_source" });
    assert.equal(requests, 0);
    assert.equal(staged.size, 1);
    assert.deepEqual(staged.get("index.html"), source);
  }
});

test("a failed dependency tree leaves the entire packaging snapshot unchanged", async () => {
  const source = Buffer.from(`<script src="${base}main.js"></script>`);
  const staged = new Map([["index.html", source]]);
  await assert.rejects(vendorDependencies(staged, { fetchBytes: async url => Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : 'import "https://127.0.0.1/private.js";') }), { code: "vendor_source" });
  assert.deepEqual([...staged], [["index.html", source]]);
});

test("relative fetch in a downloaded script is refused without guessing its document base", async () => {
  for (const path of ["./decoder.wasm", "decoder.wasm", "/decoder.wasm", "../data.json"]) {
    const staged = new Map([["index.html", Buffer.from(`<script src="${base}nested/main.js"></script>`)]]);
    const original = new Map(staged);
    const requested: string[] = [];
    await assert.rejects(vendorDependencies(staged, { fetchBytes: async url => {
      requested.push(url);
      return Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : `fetch(${JSON.stringify(path)});`);
    } }), { code: "vendor_document_relative" });
    assert.ok(!requested.some(url => /decoder|data/.test(url)), "do not download a guessed companion");
    assert.deepEqual(staged, original);
  }
});

test("module URL fetches and absolute worker importScripts retain explicit URL semantics", async () => {
  const staged = new Map([["index.html", Buffer.from(`<script src="${base}main.js"></script>`)]]);
  const bodies = new Map([[base + "package.json", metadata], [base + "LICENSE", "MIT text"],
    [base + "main.js", 'fetch(new URL("./decoder.wasm", import.meta.url)); importScripts("https://cdn.jsdelivr.net/npm/three@1.2.3/worker.js");'], [base + "decoder.wasm", "wasm fixture"], [base + "worker.js", "self.onmessage=()=>{};"]]);
  await vendorDependencies(staged, { fetchBytes: async url => { assert.ok(bodies.has(url), url); return Buffer.from(bodies.get(url)!); } });
  assert.match(staged.get(".opengame-vendor/three@1.2.3/main.js")!.toString(), /new URL\("\/\.opengame-vendor\/three@1\.2\.3\/decoder\.wasm", import.meta.url\)/);
  assert.ok(staged.has(".opengame-vendor/three@1.2.3/worker.js"));
});

test("download limits apply before committing any staged file", async () => {
  const { LIMITS } = await import("@opengame/shared");
  const staged = new Map([["index.html", Buffer.from(`<script src="${base}main.js"></script>`)]]);
  await assert.rejects(vendorDependencies(staged, { fetchBytes: async () => Buffer.alloc(LIMITS.platform.vendoring.bytesPerFileMax + 1) }), { code: "vendor_limit" });
  assert.equal(staged.size, 1);
});

test("dependency sockets refuse loopback, private, link-local and mapped IPv6 destinations", async () => {
  const { publicVendorAddress } = await import("../src/vendor");
  for (const address of ["127.0.0.1", "169.254.169.254", "10.1.2.3", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001:db8::1", "not-an-ip"]) assert.equal(publicVendorAddress(address), false, address);
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700::1111"]) assert.equal(publicVendorAddress(address), true, address);
});

test("a reviewed runtime recipe includes companions and verifies their original hashes", async () => {
  const { LIMITS } = await import("@opengame/shared");
  const { createHash } = await import("node:crypto");
  const policy = LIMITS.platform.vendoring as typeof LIMITS.platform.vendoring & { runtimeRecipes?: unknown[] };
  const before = policy.runtimeRecipes;
  const main = "self.runtime={start(){}};", wasm = "wasm fixture";
  const digest = (text: string) => createHash("sha256").update(text).digest("hex");
  policy.runtimeRecipes = [{ package: "three", version: "1.2.3", path: "runtime/", files: ["main.js", "runtime.wasm"], sha256: { "main.js": digest(main), "runtime.wasm": digest(wasm) } }];
  const fetchBytes = async (url: string) => Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : url.endsWith("main.js") ? main : wasm);
  try {
    const staged = new Map([["index.html", Buffer.from(`<script src="${base}runtime/main.js"></script>`)]]);
    const receipt = await vendorDependencies(staged, { fetchBytes });
    assert.equal(receipt.length, 2);
    assert.ok(staged.has(".opengame-vendor/three@1.2.3/runtime/runtime.wasm"));
    const bad = new Map([["index.html", Buffer.from(`<script src="${base}runtime/main.js"></script>`)]]);
    await assert.rejects(vendorDependencies(bad, { fetchBytes: async url => url.endsWith("runtime.wasm") ? Buffer.from("tampered") : fetchBytes(url) }), { code: "vendor_hash" });
    assert.equal(bad.size, 1);
  } finally {
    if (before === undefined) delete policy.runtimeRecipes; else policy.runtimeRecipes = before;
  }
});


test("Babylon/fflate documentation and unused CDN strings are inert, even beside a real import", async () => {
  const inert = 'https://unpkg.com/fflate@0.8.2/';
  const real = base + "main.js";
  const html = `<!-- ${inert} --><script>/* ${inert} */ const docs="${inert}"; const unused="${real}";</script><script src="${real}"></script>`;
  const staged = new Map([["index.html", Buffer.from(html)], ["babylon.js", Buffer.from(`// ${inert}\nconst docs="${inert}";`)]]);
  const requests: string[] = [];
  await vendorDependencies(staged, { fetchBytes: async url => {
    requests.push(url);
    return Buffer.from(url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : "globalThis.game=true;");
  } });
  assert.ok(requests.every(url => url.startsWith(base)));
  assert.ok(staged.get("index.html")!.toString().includes(`const unused="${real}"`));
  assert.ok(staged.get("index.html")!.toString().includes(`const docs="${inert}"`));
  assert.equal(staged.get("babylon.js")!.toString(), `// ${inert}\nconst docs="${inert}";`);
  const onlyInert = new Map([["index.html", Buffer.from(`<script>const docs="${inert}";</script>`)] ]);
  assert.deepEqual(await vendorDependencies(onlyInert, { fetchBytes: async () => { assert.fail("inert reference was fetched"); } }), []);
});

test("dependency transport ignores an environment proxy and checks the actual destination lookup", async () => {
  const { createServer } = await import("node:http");
  const { fetch } = await import("undici");
  const { createVendorDispatcher } = await import("../src/vendor");
  let proxyRequests = 0;
  const server = createServer((_req, res) => { proxyRequests++; res.end("proxy reached"); });
  server.on("connect", (_req, socket) => { proxyRequests++; socket.destroy(); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const names = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"];
  const saved = names.map(name => process.env[name]);
  const proxy = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  for (const name of names) process.env[name] = name.toLowerCase() === "no_proxy" ? "" : proxy;
  let resolutions = 0;
  const dispatcher = createVendorDispatcher((host, callback) => {
    assert.equal(host, "cdn.jsdelivr.net"); resolutions++;
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
  });
  try {
    await assert.rejects(fetch(base + "main.js", { dispatcher, signal: AbortSignal.timeout(2000) }), error => {
      assert.match(String((error as {cause?:Error}).cause), /outside public addresses/); return true;
    });
    assert.equal(resolutions, 1);
    assert.equal(proxyRequests, 0);
  } finally {
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
    await dispatcher.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test("import maps vendor import and scope targets without rewriting unrelated JSON strings", async () => {
  const url = base + "main.js";
  const map = JSON.stringify({ imports: { three: url }, scopes: { "/demo/": { three: url } }, documentation: url });
  const staged = new Map([["index.html", Buffer.from(`<script type="importmap">${map}</script><script type="module">import "three";</script>`) ], ["game.importmap", Buffer.from(map)]]);
  await vendorDependencies(staged, { fetchBytes: async request => Buffer.from(request.endsWith("package.json") ? metadata : request.endsWith("LICENSE") ? "MIT text" : "export const game=true;") });
  const parsed = JSON.parse(staged.get("game.importmap")!.toString());
  assert.equal(parsed.imports.three, "/.opengame-vendor/three@1.2.3/main.js");
  assert.equal(parsed.scopes["/demo/"].three, parsed.imports.three);
  assert.equal(parsed.documentation, url);
  assert.match(staged.get("index.html")!.toString(), /"imports":\{"three":"\/\.opengame-vendor/);
});


test("vendor command preserves only validated linked identity and the SDK opt-out", async () => {
  const { mkdir, readFile, realpath, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tempDir, manifest } = await import("./shell");
  const { readProject } = await import("../src/project");
  const { safeReadFile } = await import("../src/safe-fs");
  const { vendorCommand } = await import("../src/vendor");
  const { Output } = await import("../src/output");
  const { apiOrigin } = await import("../src/http");
  const fixture = await tempDir("og-vendor-link-");
  const gameId = "11111111-2222-4333-8444-555555555555";
  try {
    const root = await realpath(fixture.dir);
    const configured = { ...manifest, build: { output: "." }, sdk: { inject: false } };
    await writeFile(join(root, "opengame.json"), JSON.stringify(configured));
    await writeFile(join(root, "index.html"), '<!doctype html><script src="game.js"></script>');
    await writeFile(join(root, "game.js"), "document.body.textContent='Play';");
    await mkdir(join(root, ".opengame"));
    const sourceState = { version: 1, origin: apiOrigin(), gameId, metadataRevision: 3,
      deploy: { key: "old-deploy", operationId: "11111111-2222-4333-8444-666666666666", uploaded: true,
        request: { byteSize: 10, fileCount: 2, sha256: "a".repeat(64), manifest: configured, metadataRevision: 3, metadata: "preserve", gameId } },
      submit: { key: "old-submit", request: { releaseId: "11111111-2222-4333-8444-777777777777", jam: null } } };
    await writeFile(join(root, ".opengame/project.json"), JSON.stringify(sourceState));
    await vendorCommand(root, { output: ".opengame/vendored" }, new Output(true, () => {}));
    const stage = join(root, ".opengame/vendored");
    const state = await readProject(stage, apiOrigin(), { readFile: safeReadFile });
    assert.deepEqual(state, { version: 1, origin: apiOrigin(), gameId, metadataRevision: 3 });
    assert.deepEqual(JSON.parse(await readFile(join(stage, "opengame.json"), "utf8")).sdk, { inject: false });
    assert.deepEqual(JSON.parse(await readFile(join(root, ".opengame/project.json"), "utf8")), sourceState);
    await writeFile(join(root, ".opengame/project.json"), JSON.stringify({ ...sourceState, origin: "https://other.invalid" }));
    await assert.rejects(vendorCommand(root, { output: ".opengame/wrong-origin" }, new Output(true, () => {})), { code: "project_state" });
  } finally { await fixture.remove(); }
});


test("vendor leaves the enabled SDK and its notice to platform derivation", async () => {
  const { createHash } = await import("node:crypto");
  const { readFile, realpath, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tempDir, manifest } = await import("./shell");
  const { vendorCommand } = await import("../src/vendor");
  const { Output } = await import("../src/output");
  const fixture = await tempDir("og-vendor-sdk-boundary-");
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "." }, sdk: { inject: true } }));
    const html = '<!doctype html><script src="game.js"></script>';
    await writeFile(join(root, "index.html"), html);
    await writeFile(join(root, "game.js"), "document.body.textContent='Play';");
    await vendorCommand(root, { output: ".opengame/vendored" }, new Output(true, () => {}));
    const stage = join(root, ".opengame/vendored");
    assert.equal(await readFile(join(stage, "index.html"), "utf8"), html);
    assert.deepEqual(JSON.parse(await readFile(join(stage, "opengame.json"), "utf8")).sdk, { inject: true });
    const receipt = JSON.parse(await readFile(join(stage, ".opengame/vendor-receipt.json"), "utf8"));
    assert.deepEqual(receipt.files.map((file: { path: string }) => file.path), ["game.js", "index.html"]);
    for (const file of receipt.files) {
      const bytes = await readFile(join(stage, file.path));
      assert.equal(bytes.byteLength, file.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    }
    await assert.rejects(readFile(join(stage, "_og/sdk.js")), { code: "ENOENT" });
    await assert.rejects(readFile(join(stage, "_og/sdk.js.LEGAL.txt")), { code: "ENOENT" });
  } finally { await fixture.remove(); }
});

test("relative importScripts in an imported worker library is not resolved against that library", async () => {
  const staged = new Map([["index.html", Buffer.from(`<script src="${base}nested/library.js"></script>`)]]);
  await assert.rejects(vendorDependencies(staged, { fetchBytes: async url => Buffer.from(
    url.endsWith("package.json") ? metadata : url.endsWith("LICENSE") ? "MIT text" : 'importScripts("./worker-support.js");',
  ) }), { code: "vendor_document_relative" });
  assert.equal(staged.size, 1);
});

test("a download that never gets an answer names the host and says to retry", () => {
  // Area F, 1 Nov 2026: a timed-out connection escaped as a bare TypeError and the person
  // read "The CLI hit an unexpected error".
  const failure = vendorFetchFailure(base + "build/three.module.js", Object.assign(new TypeError("fetch failed"), { cause: { code: "ETIMEDOUT" } }));
  assert.equal(failure.code, "vendor_download");
  assert.match(failure.message, /cdn\.jsdelivr\.net did not answer/);
  assert.match(failure.message, /retry/);
  const own = new CliError("vendor_limit", "over");
  assert.equal(vendorFetchFailure(base, own), own);
});

test("a second vendor replaces its own earlier export, and still never a folder it did not make", async () => {
  // Area F, 1 Nov 2026: editing the game and running opengame vendor again was refused,
  // "The staging folder already exists. Choose a new --output folder", every time.
  const { mkdir, readFile, readdir, realpath, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tempDir, manifest } = await import("./shell");
  const { vendorCommand } = await import("../src/vendor");
  const { Output } = await import("../src/output");
  const fixture = await tempDir("og-vendor-again-");
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "opengame.json"), JSON.stringify({ ...manifest, build: { output: "." } }));
    await writeFile(join(root, "index.html"), '<!doctype html><script src="game.js"></script>');
    await writeFile(join(root, "game.js"), "document.body.textContent='First';");
    const results: { data?: { replaced?: boolean } }[] = [];
    const output = new Output(true, (line: string) => { try { results.push(JSON.parse(line)); } catch { /* progress lines */ } });
    await vendorCommand(root, {}, output);
    await writeFile(join(root, "game.js"), "document.body.textContent='Second';");
    await vendorCommand(root, {}, output);
    assert.equal(await readFile(join(root, ".opengame/vendor/game.js"), "utf8"), "document.body.textContent='Second';");
    assert.deepEqual((await readdir(join(root, ".opengame"))).filter(name => name !== "vendor" && name !== ".gitignore"), [], "no staging or previous copy is left behind");
    await mkdir(join(root, "mine"));
    await writeFile(join(root, "mine/notes.txt"), "keep");
    await assert.rejects(vendorCommand(root, { output: "mine" }, output), (error: Error & { code?: string }) => error.code === "vendor_output_exists" && /did not make it/.test(error.message));
    assert.equal(await readFile(join(root, "mine/notes.txt"), "utf8"), "keep");
  } finally { await fixture.remove(); }
});

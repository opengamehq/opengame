/* An Unreal Engine 5.9 Wasm stage, laid out as a real Third Person Shipping export is (read on
   17 Nov 2026 from TPPWeb590, whose module matched its own wasm-cache.json SHA-1): the page and
   its wasm-*.js scripts at the root, the game's glue and module under <Project>/Binaries/Wasm,
   its containers under <Project>/Content/Paks, and a Brotli twin beside most files, the page
   included. The bytes here are small stand-ins; what is under test is how the check reads the
   layout. That export itself was checked, deployed to a local og-games and played. */
import "./credential-checks-on";
import test from "node:test";
import assert from "node:assert/strict";
import { brotliCompressSync } from "node:zlib";
import { latin1Bytes, preflight, type PreflightFile } from "../src/index";

const PAGE = `<!doctype html><html><head><title>Game</title><meta name="ue-sw-isolation" content="1"></head>
<body><canvas id="canvas"></canvas><div id="error" hidden><a href="https://www.google.com/chrome/">Get Chrome</a></div>
<script src="wasm-compat.js"></script><script src="wasm-prewarm.js"></script><script src="wasm-loader.js"></script></body></html>`;
const LOADER = `const unsupported = window.ueCompat ? window.ueCompat.check() : null;
fetch('wasm-manifest.json', { cache: 'no-cache' });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');`;
const COMPAT = `window.ueCompat = { check() { return null; } };
function bench() { const element = document.createElement('script'); element.src = 'wasm-bench.js'; document.head.appendChild(element); }`;
const PREWARM = `async function capture(dir) { const file = await dir.getFileHandle('webgpu-capture.json', { create: true });
  say('capture_written', { path: 'logs/webgpu-capture.json' }); }`;
const GLUE = `var Module = typeof Module != "undefined" ? Module : {};`;
// The smallest module: the header and nothing else.
const MODULE = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);

function stage(options: { decoded?: string[] } = {}): PreflightFile[] {
  const text = (path: string, body: string): PreflightFile => ({ path, size: body.length, text: async () => body });
  const binary = (path: string, bytes: Uint8Array): PreflightFile => ({ path, size: bytes.length, text: async () => "",
    bytes: async () => bytes, head: async (n: number) => bytes.subarray(0, n) });
  const twin = (path: string, plain: Uint8Array | string): PreflightFile => {
    const raw = typeof plain === "string" ? Buffer.from(plain) : Buffer.from(plain);
    const packed = new Uint8Array(brotliCompressSync(raw));
    const decodedText = Object.assign(async () => { options.decoded?.push(path); return raw.toString("latin1"); },
      { decodedByteLength: () => raw.length });
    return { path, size: packed.length, text: async () => "", bytes: async () => packed, head: async (n: number) => packed.subarray(0, n), decodedText };
  };
  return [
    text("index.html", PAGE), twin("index.html.br", PAGE),
    text("wasm-loader.js", LOADER), text("wasm-compat.js", COMPAT), text("wasm-prewarm.js", PREWARM), text("sw.js", "self.addEventListener('fetch', () => {});"),
    text("wasm-manifest.json", "[]"), twin("wasm-manifest.json.br", "[]"), text("wasm-cache.json", "[]"),
    text("Game/Binaries/Wasm/Game-Wasm-Shipping.js", GLUE),
    binary("Game/Binaries/Wasm/Game-Wasm-Shipping.wasm", MODULE), twin("Game/Binaries/Wasm/Game-Wasm-Shipping.wasm.br", MODULE),
    binary("Game/Content/Paks/Game-Wasm.pak", new Uint8Array(64)), twin("Game/Content/Paks/Game-Wasm.pak.br", new Uint8Array(64)),
    binary("Game/Content/Paks/Game-Wasm.ucas", new Uint8Array(64)),
    binary("Game/Content/Paks/Game-Wasm.utoc", new Uint8Array(64)), twin("Game/Content/Paks/Game-Wasm.utoc.br", new Uint8Array(64)),
    binary("Game/Content/ShaderArchive-Game-SF_WEBGPU_ES3_1-SP_WEBGPU_ES3_1.ushaderbytecode", new Uint8Array(64)),
    twin("Game/Content/ShaderArchive-Game-SF_WEBGPU_ES3_1-SP_WEBGPU_ES3_1.ushaderbytecode.br", new Uint8Array(64)),
  ];
}

test("an Unreal 5.9 Wasm stage is named Unreal Engine, and its Brotli twins are not archives", async () => {
  const result = await preflight(stage());
  assert.equal(result.engine?.id, "unreal");
  assert.equal(result.engine?.name, "Unreal Engine");
  assert.deepEqual(result.findings.filter(f => f.severity === "blocker").map(f => f.code), []);
  assert.ok(!result.findings.some(f => f.code === "nested-archive"));
});

test("Unreal's page copy is dropped, its sw.js is no finding, and its unfetched names are not missing", async () => {
  const result = await preflight(stage());
  // og-games hosts Epic's sw.js as the game's own worker since 17 Nov 2026.
  assert.ok(!result.findings.some(f => /service-worker|pwa/.test(f.code)));
  const missing = result.findings.find(f => f.code === "missing-ref");
  for (const name of ["wasm-bench.js", "webgpu-capture.json"]) assert.doesNotMatch(JSON.stringify(missing ?? {}), new RegExp(name.replace(".", "\\.")));
  assert.ok(!JSON.stringify(result.findings).includes("index.html.br"), "the page copy is litter, not a finding");
});

/* The twin a browser is actually sent is walked as a module of its own, not taken on the
   plain copy's word: a large twin is outside the budget compressed-asset-mismatch reads, so
   the walk is the only reader that sees its shared memory or a stamp the plain copy lacks. */
test("a .wasm.br beside its .wasm is walked as a module of its own", async () => {
  const decoded: string[] = [];
  const result = await preflight(stage({ decoded }));
  assert.ok(decoded.includes("Game/Binaries/Wasm/Game-Wasm-Shipping.wasm.br"), decoded.join(", "));
  assert.ok(!result.findings.some(f => f.code === "licence-search-incomplete"));
  assert.ok(!result.findings.some(f => f.code === "compressed-asset-mismatch"));
});

/* With the credential detector on, as these tests run it: a deploy runs it off since 12 Nov 2026. */
test("a precompressed copy of a key file is refused by its name, as the key file is", async () => {
  const page = { path: "index.html", size: 40, text: async () => "<!doctype html><title>x</title>" };
  const result = await preflight([page, { path: "credentials.json.br", size: 10, text: async () => "" }]);
  assert.ok(result.findings.some(f => f.code === "credential" && f.severity === "blocker"), JSON.stringify(result.findings.map(f => f.code)));
});

/* The real export's 140 MB module crashed `opengame check` with "invalid array length" while
   Uint8Array.from built its intermediate array. The copy now writes into one array. */
test("latin1Bytes turns one character per byte back into the same bytes, at size", () => {
  const bytes = new Uint8Array(256).map((_, i) => i);
  assert.deepEqual(latin1Bytes(Buffer.from(bytes).toString("latin1")), bytes);
  const big = "ÿ".repeat(64 * 1024 * 1024);
  const out = latin1Bytes(big);
  assert.equal(out.length, big.length);
  assert.equal(out[out.length - 1], 0xff);
});

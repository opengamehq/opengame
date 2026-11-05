/* What a real .NET 8 browser publish's loader writes, read as the check reads it. The
   snippets are copied from templates/csharp's build (`dotnet new wasmbrowser`, SDK 8.0.427,
   runtime 8.0.33, 1 Nov 2026), which was told two files were missing that nothing ever
   requests, and refused for two bare imports meant for Node. Defold's and Godot's
   equivalents are in defold-runtime-strings.test.ts and engine-runtime-strings.test.ts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, type PreflightFile } from '../src/index';

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const missing = (result: { findings: { code: string; more?: string[] }[] }) =>
  (result.findings.find((f) => f.code === 'missing-ref')?.more ?? []).map((row) => row.split(' → ')[1]);
const codes = (result: { findings: { code: string }[] }) => result.findings.map((f) => f.code);

// _framework/dotnet.js: which configured settings files to mount, and the Node-only requires.
const LOADER = 'export const dotnet={};async function boot(e,I,ae,ye,xe){'
  + 'if(e.appsettings)for(let t=0;t<e.appsettings.length;t++){const o=e.appsettings[t],n=ae(o);"appsettings.json"!==n&&n!==`appsettings.${e.applicationEnvironment}.json`||I.push({name:o,behavior:"vfs",noCache:!0,useCredentials:!0})}'
  + 'if(ye){const e=await import("process");}'
  + 'xe.require=ye?await import("module").then((e=>e.createRequire(import.meta.url))):Promise.resolve((()=>{throw new Error("require not supported")}))}';
// _framework/dotnet.runtime.<version>.<hash>.js: an error message with an apostrophe in it.
const RUNTIME = 'async function instantiate(e,w){e&&e.pendingDownloadInternal&&e.pendingDownloadInternal.response||w(!1,"Can\'t load dotnet.native.wasm");}';
const MAP = '<script type="importmap">{"imports":{"process":"./node-only.js","module":"./node-only.js"}}</script>';
const page = (head: string) => `<!doctype html><html><head>${head}</head><body><script type="module" src="./main.js"></script></body></html>`;
const build = (head: string, extra: PreflightFile[] = []) => preflight([
  file('index.html', page(head)),
  file('main.js', "import { dotnet } from './_framework/dotnet.js';"),
  file('node-only.js', "throw new Error('process and module are Node modules, and this game runs in a browser.');"),
  file('_framework/dotnet.js', LOADER),
  file('_framework/dotnet.runtime.8.0.33.xzmksj96c6.js', RUNTIME),
  file('_framework/dotnet.native.wasm', 'x'),
  ...extra,
], { authoritative: true });

test('the .NET loader, with the starter\'s import map, asks for nothing that is not there', async () => {
  const result = await build(MAP);
  assert.deepEqual(missing(result), []);
  assert.deepEqual(codes(result).filter((code) => code === 'bare-import' || code === 'missing-ref'), [], JSON.stringify(result.findings));
});

test('the same loader without the map is still refused for its bare imports', async () => {
  const result = await build('');
  const bare = result.findings.filter((f) => f.code === 'bare-import');
  assert.deepEqual(bare.map((f) => f.title).sort(), [
    '_framework/dotnet.js imports module without a local module path.',
    '_framework/dotnet.js imports process without a local module path.',
  ]);
  assert.ok(bare.every((f) => f.severity === 'blocker'));
});

test('a literal before ==, in the wrong case, keeps its blocker, and a request for the same name is still missing', async () => {
  const cased = await preflight([file('index.html', '<script src="a.js"></script>'), file('assets/hero.png', 'x'),
    file('a.js', 'if ("assets/Hero.PNG" === x) img.src = x;')]);
  assert.ok(cased.findings.some((f) => f.code === 'case-mismatch' && f.severity === 'blocker'), JSON.stringify(codes(cased)));
  const asked = await preflight([file('index.html', '<script src="a.js"></script>'),
    file('a.js', 'fetch("appsettings.json"); const kind = "level.json"; if ("skip.json" != x) q();')]);
  assert.deepEqual(missing(asked).sort(), ['appsettings.json', 'level.json']);
});

test('an apostrophe in a message is no request, and the literals beside it still are, in either quote', async () => {
  const result = await preflight([file('index.html', '<script src="a.js"></script>'),
    file('a.js', 'w("Can\'t load dotnet.native.wasm"); fetch(\'levels/one.json\'); const m = \'it"s here\'; fetch("data/two.json");')]);
  assert.deepEqual(missing(result).sort(), ['data/two.json', 'levels/one.json']);
});

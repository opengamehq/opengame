import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectEngine, detectedIds, wasmModule, withRawRuntimeEvidence, type EngineSource } from '../src/engines';
import { preflight, type PreflightFile } from '../src/index';

/* Real Emscripten 6.0.13 output, one small C program built several ways (provenance in
   the fixture's `source`). Until 5 Nov 2026 Emscripten was recognised only from a
   threaded build's PThread.terminateRuntime, which 6.0.13's threaded -O3 glue does not
   even carry, so every single-threaded C, C++ or raylib export read as custom. */
type Build = { variant: string; flags: string; text: string; base64: string };
const fixture = JSON.parse(readFileSync(new URL('./fixtures/emscripten-builds.json', import.meta.url), 'utf8')) as { builds: Build[] };
const signatures = (JSON.parse(readFileSync(new URL('./fixtures/engine-signatures.json', import.meta.url), 'utf8')) as
  { id: string; kind: string; source: string; text: string; wasm?: { base64: string }[] }[])
  .filter(row => row.id === 'emscripten' && row.kind === 'exported-game-runtime')
  .map(row => ({ variant: /-O2/.test(row.source) ? 'o2' : 'o3', flags: '', text: row.text, base64: row.wasm![0]!.base64 }));
const builds: Build[] = [...signatures, ...fixture.builds];
const bytes = (build: Build) => new Uint8Array(Buffer.from(build.base64, 'base64'));
const PATHS = ['index.html', 'index.js', 'index.wasm'];
const detect = (text: string, wasm?: Uint8Array, paths = PATHS) =>
  detectEngine(paths, [{ path: 'index.js', text }], { complete: true, ...(wasm ? { wasm: [wasmModule('index.wasm', wasm)] } : {}) });

test('every optimisation level, MODULARIZE and Closure, threaded or not, is Emscripten from glue and module', () => {
  assert.deepEqual(builds.map(build => build.variant).sort(), ['o0', 'o2', 'o3', 'o3-mod', 'o3-thread', 'os-closure']);
  for (const build of builds) {
    const report = detect(build.text, bytes(build));
    assert.equal(report.id, 'emscripten', `${build.variant}: ${JSON.stringify(report)}`);
    assert.match(report.evidence, /in index\.js and index\.wasm$/, build.variant);
    assert.deepEqual(report.also, []);
  }
});

test('the glue alone is not structural evidence, and says what it saw', () => {
  for (const build of builds) {
    const report = detect(build.text);
    assert.equal(report.id, 'custom', build.variant);
    assert.match(report.evidence, /^Emscripten's runtime glue in index\.js, but no \.wasm read beside it/, build.variant);
  }
});

test('the module has to import the way an Emscripten build does', () => {
  const glue = builds[0]!.text;
  // wasm-bindgen's module name, a module with no imports at all, and bytes that are not a module.
  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  const wbg = new Uint8Array([...header, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
    0x02, 0x0b, 0x01, 0x03, 0x77, 0x62, 0x67, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00]);
  for (const wasm of [wbg, new Uint8Array(header), new TextEncoder().encode('Aborted(')]) {
    assert.equal(detect(glue, wasm).id, 'custom', JSON.stringify(wasmModule('index.wasm', wasm)));
  }
  // A module beside the glue but with no .wasm path in the bundle is not the build's.
  assert.equal(detect(glue, bytes(builds[0]!), ['index.html', 'index.js', 'index.bin']).id, 'custom');
});

test('each of the three glue patterns is needed', () => {
  const build = builds.find(row => row.variant === 'o3')!;
  for (const [pattern, replacement] of [[/Aborted\(/g, 'Stopped('], [/Build with -sASSERTIONS|both async and sync fetching of the wasm failed/g, 'x'], [/noInitialRun/g, 'noRun']] as const) {
    assert.notEqual(detect(build.text.replace(pattern, replacement), bytes(build)).id, 'emscripten', String(pattern));
  }
});

/* A library built with Emscripten (Draco, Basis, MediaPipe) has the runtime and no main,
   so its glue never tests noInitialRun. Shipping one does not make a game Emscripten, and
   its own instantiate call is not the game's loader. */
test('an Emscripten library inside a JavaScript game names neither Emscripten nor WebAssembly', () => {
  const build = builds.find(row => row.variant === 'o3')!;
  const library = build.text.replace(/var noInitialRun=Module\["noInitialRun"\]\|\|false;if\(!noInitialRun\)callMain\(\);/, '');
  assert.ok(!/noInitialRun/.test(library));
  const report = detect(library, bytes(build), ['index.html', 'index.js', 'draco_decoder.wasm', 'index.wasm']);
  assert.equal(report.id, 'custom');
  assert.match(report.evidence, /arrived with no loader this check recognises/);
  // An ASSERTIONS build lists noInitialRun among ignored settings; that is not a main.
  assert.equal(detect(library + '\nignoredModuleProp("noInitialRun");', bytes(build)).id, 'custom');
  // The game's own loader beside the library is raw WebAssembly.
  const own = detectEngine(['index.html', 'decoder.js', 'game.js', 'decoder.wasm', 'game.wasm'],
    [{ path: 'decoder.js', text: library }, { path: 'game.js', text: 'const { instance } = await WebAssembly.instantiateStreaming(fetch("game.wasm"), imports);' }],
    { complete: true, wasm: [wasmModule('decoder.wasm', bytes(build))] });
  assert.equal(own.id, 'webassembly');
  assert.equal(own.evidence, 'game.wasm, loaded by WebAssembly.instantiateStreaming in game.js');
});

/* Ammo.js, Bullet physics built with Emscripten as a library with no main, in the copy
   three.js ships (examples/jsm/libs/ammo.wasm.js at r160, sha256 3fa63c58...f98228).
   That glue is older Emscripten, whose abort message is lower case, so until 5 Nov 2026
   its own instantiate call read as the game's loader and a plain JavaScript game with
   physics was labelled raw WebAssembly. The fixture keeps verbatim lines of that file, and
   its module imports from `a` as the real ammo.wasm.wasm does. */
const ammoFixture = JSON.parse(readFileSync(new URL('./fixtures/ammo-three-r160.json', import.meta.url), 'utf8')) as { text: string; base64: string };
const AMMO_GLUE = ammoFixture.text;
const AMMO_WASM = new Uint8Array(Buffer.from(ammoFixture.base64, 'base64'));

test('Ammo.js physics is a library, not the game: a three.js game stays three.js and plain JavaScript stays custom', () => {
  const paths = ['index.html', 'js/game.js', 'js/libs/ammo.wasm.js', 'js/libs/ammo.wasm.wasm'];
  const game: EngineSource = { path: 'js/game.js', text: 'Ammo().then(function (AmmoLib) { Ammo = AmmoLib; init(); animate(); });' };
  const ammo: EngineSource = { path: 'js/libs/ammo.wasm.js', text: AMMO_GLUE };
  const wasm = [wasmModule('js/libs/ammo.wasm.wasm', AMMO_WASM)];
  assert.deepEqual(wasm[0]!.importModules, ['a']);
  const plain = detectEngine(paths, [game, ammo], { complete: true, wasm });
  assert.equal(plain.id, 'custom', JSON.stringify(plain));
  assert.match(plain.evidence, /arrived with no loader this check recognises/);
  const three = detectEngine([...paths, 'js/three.module.js'], [game, ammo, { path: 'js/three.module.js', text: 'window.__THREE__="160";' }], { complete: true, wasm });
  assert.equal(three.id, 'threejs', JSON.stringify(three));
  assert.deepEqual(three.also, []);
  // The lower-case abort alone does not set the glue aside: the build hint has to be there
  // too. Without it the glue is no longer a whole library runtime, and its "failed to
  // asynchronously prepare wasm" still names Emscripten, so the game stays custom rather
  // than being named by the library's own instantiate call.
  const hintless = AMMO_GLUE.replace('. Build with -s ASSERTIONS=1 for more info.', '.');
  assert.match(hintless, /failed to asynchronously prepare wasm/);
  assert.equal(detectEngine(paths, [game, { ...ammo, text: hintless }], { complete: true, wasm }).id, 'custom');
});

test('Emscripten-based engines keep their own name, and Emscripten does not follow them into also', () => {
  const build = builds.find(row => row.variant === 'o3')!;
  const wasm = [wasmModule('index.wasm', bytes(build))];
  const glue: EngineSource = { path: 'index.js', text: build.text };
  const cases: [string, string[], EngineSource[]][] = [
    ['unity', ['index.html', 'Build/game.loader.js', 'Build/game.framework.js', 'Build/game.wasm'],
      [{ path: 'Build/game.loader.js', text: 'function createUnityInstance(){}' }, { ...glue, path: 'Build/game.framework.js' }]],
    ['godot', ['index.html', 'index.js', 'index.wasm', 'index.pck'], [{ path: 'index.html', text: 'const GODOT_CONFIG = {};' }, glue]],
    ['pyodide', ['index.html', 'index.js', 'pyodide.asm.wasm'], [{ path: 'main.js', text: 'await loadPyodide({ indexURL: "pyodide.asm.wasm" });' }, glue]],
    ['dotnet', ['index.html', 'index.js', 'dotnet.native.wasm'], [{ path: 'dotnet.js', text: 'mono_wasm_runtime_ready(); import("./dotnet.runtime.js")' }, glue]],
    ['love2d', ['index.html', 'index.js', 'love.wasm'], [{ path: 'love.js', text: 'var Love = (function(){ return Love.ready })' }, glue]],
  ];
  for (const [id, paths, sources] of cases) {
    const report = detectEngine(paths, sources, { complete: true, wasm });
    assert.equal(report.id, id, JSON.stringify(report));
    assert.ok(!report.also.some(engine => engine.id === 'emscripten'), `${id}: ${JSON.stringify(report.also)}`);
  }
});

test('raw WebAssembly is its own id, and custom stays the fallback without a module', () => {
  const loader = (call: string): EngineSource => ({ path: 'main.js', text: `const memory = new WebAssembly.Memory({ initial: 2 }); const r = await ${call}; r.instance.exports.start();` });
  for (const [call, named] of [
    ['WebAssembly.instantiateStreaming(fetch("game.wasm"), { env: { memory } })', 'WebAssembly.instantiateStreaming'],
    ['WebAssembly.instantiate(await (await fetch("game.wasm")).arrayBuffer(), {})', 'WebAssembly.instantiate'],
    ['WebAssembly.compileStreaming(fetch("game.wasm"))', 'WebAssembly.compileStreaming'],
    // The page has to name the module it loads (engines.ts rawWebAssembly), so the bytes come from a fetch of it.
    ['new WebAssembly.Instance(new WebAssembly.Module(await (await fetch("game.wasm")).arrayBuffer()), {})', 'new WebAssembly.Instance'],
  ] as const) {
    const report = detectEngine(['index.html', 'main.js', 'game.wasm'], [loader(call)], { complete: true });
    assert.deepEqual({ id: report.id, name: report.name, evidence: report.evidence }, { id: 'webassembly', name: 'WebAssembly', evidence: `game.wasm, loaded by ${named} in main.js` });
    assert.ok(detectedIds(report).has('webassembly'));
  }
  const call = 'WebAssembly.instantiateStreaming(fetch("game.wasm"), {})';
  assert.equal(detectEngine(['index.html', 'main.js'], [loader(call)], { complete: true }).id, 'custom', 'no .wasm, no WebAssembly');
  assert.equal(detectEngine(['index.html', 'main.js', 'game.wasm'], [loader(call)], { complete: false }).id, 'custom', 'an incomplete read guesses nothing');
  assert.equal(detectEngine(['index.html', 'main.js', 'game.wasm'], [{ path: 'main.js', text: 'requestAnimationFrame(draw);' }], { complete: true }).id, 'custom');
  // An engine wins over the fallback, and a validated raw payload replaces it.
  assert.equal(detectEngine(['index.html', 'main.js', 'game.wasm'], [loader(call), { path: 'three.js', text: 'window.__THREE__="186";' }], { complete: true }).id, 'threejs');
  const raw = withRawRuntimeEvidence(detectEngine(['index.html', 'main.js', 'game.wasm', 'game.swf'], [loader(call)], { complete: true }),
    [{ engine: 'ruffle', format: 'swf', path: 'game.swf' } as Parameters<typeof withRawRuntimeEvidence>[1][number]]);
  assert.equal(raw.id, 'ruffle');
  assert.deepEqual(raw.also, []);
});

const binaryFile = (path: string, data: Uint8Array): PreflightFile =>
  ({ path, size: data.length, bytes: async () => data, head: async (n: number) => data.subarray(0, n), text: async () => Buffer.from(data).toString('latin1') });
const textFile = (path: string, text: string): PreflightFile => ({ path, size: Buffer.byteLength(text), text: async () => text });
const PAGE = '<!doctype html><html><body><canvas id="canvas"></canvas><script src="index.js"></script></body></html>';

test('the scan names the build and moves only the threaded one', async () => {
  for (const build of builds) {
    const result = await preflight([textFile('index.html', PAGE), textFile('index.js', build.text), binaryFile('index.wasm', bytes(build))]);
    assert.equal(result.engine?.id, 'emscripten', build.variant);
    const threaded = build.variant.includes('thread');
    assert.equal(result.threaded === true, threaded, `${build.variant}: threaded ${result.threaded}`);
    assert.equal(result.findings.some(finding => finding.code === 'engine-threads'), threaded, build.variant);
  }
});

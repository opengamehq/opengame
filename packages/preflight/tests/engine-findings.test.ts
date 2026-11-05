import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { LIMITS } from '@opengame/shared';
import { engineFindings, encryptedPckFindings, sourceUsesThreads } from '../src/engine-findings';
import { type EngineId, type EngineReport, ENGINE_NAMES } from '../src/engines';
import { platformPreflight } from '../src/platform';
import { preflight, type PreflightFile } from '../src/index';
import { compressedTextReaders } from '../src/node-compression';
import { wasmFacts } from '../src/wasm-module';

const file = (path: string, text: string): PreflightFile => ({ path, size: Buffer.byteLength(text), text: async () => text });
const report = (id: EngineId = 'custom'): EngineReport => ({ id, name: ENGINE_NAMES[id], version: null, evidence: 'synthetic unit test', also: [] });
const findings = (code: string, engine: EngineId = 'custom', paths: string[] = [], extra: { path: string; text: string }[] = []) =>
  engineFindings(paths, [{ path: 'game.js', text: code }, ...extra], report(engine));
const codes = (rows: { code: string }[]) => rows.map(row => row.code);

test('thread finding reflects the active contract and ignores capability checks', () => {
  const rows = findings('const GODOT_THREADS_ENABLED = true;');
  const row = rows.find(row => row.code === 'engine-threads');
  assert.equal(row?.severity, 'note');
  assert.match(row!.detail!, /OpenGame selects when it scans the upload/);
  assert.doesNotMatch(row!.detail!, /not cross-origin isolated/);
  assert.ok(sourceUsesThreads('new WebAssembly.Memory({initial:1, maximum:2, shared:true});'));
  assert.ok(sourceUsesThreads('var PThread={};var ENVIRONMENT_IS_PTHREAD=false;'));
  assert.equal(sourceUsesThreads('const GODOT_THREADS_ENABLED=false; typeof SharedArrayBuffer !== "undefined";'), false);
});

test('service workers and modal calls are notes; comments and string examples are not calls', () => {
  assert.ok(codes(findings('navigator.serviceWorker.register("sw.js"); alert("hi");')).includes('engine-service-worker'));
  assert.ok(codes(findings('window.confirm("hi");')).includes('engine-modal-dialog'));
  assert.deepEqual(codes(findings('// alert("no");\nconst documentation="prompt(42)";')), []);
  assert.deepEqual(codes(findings('const serviceWorker = false;')), []);
  // Godot's empty default written as JSON, with the key quoted, is still the default.
  const loader = 'if (this.config.serviceWorker && navigator.serviceWorker) { navigator.serviceWorker.register(this.config.serviceWorker); }';
  const sw = (config: string) => codes(findings(`const GODOT_CONFIG = ${config};\n${loader}`, 'godot')).filter(c => c === 'engine-service-worker');
  assert.deepEqual(sw('{"serviceWorker":"","executable":"index"}'), []);
  assert.deepEqual(sw('{"serviceWorker":"index.service.worker.js","executable":"index"}'), ['engine-service-worker']);
});

test('Unity, Godot, Cocos and .NET warnings have negative cases', () => {
  assert.ok(codes(findings('const developmentBuild=true;', 'unity', ['Build/a.js.unityweb'])).includes('unity-development-build'));
  assert.ok(codes(findings('', 'unity', ['Build/a.js.unityweb'])).includes('unity-decompression-fallback'));
  assert.deepEqual(codes(findings('const developmentBuild=false;', 'unity', ['Build/a.wasm.br'])), []);
  assert.ok(codes(findings('const GODOT_CONFIG={serviceWorker:"index.service.worker.js"};', 'godot')).includes('godot-pwa'));
  assert.deepEqual(codes(findings('const GODOT_CONFIG={serviceWorker:""};', 'godot')), []);
  assert.ok(codes(findings('', 'cocos', ['web-desktop/index.html'])).includes('cocos-web-desktop'));
  assert.deepEqual(codes(findings('', 'cocos', ['web-mobile/index.html'])), []);
  assert.ok(codes(findings('', 'dotnet', [], [{ path: 'index.html', text: '<base href="/">' }])).includes('dotnet-base-href'));
  assert.deepEqual(codes(findings('', 'dotnet', [], [{ path: 'index.html', text: '<base href="./">' }])), []);
});

test('WebGPU requirement comes from inspected source and declared manifest', () => {
  const source = 'navigator.gpu.requestAdapter();';
  assert.ok(codes(findings(source)).includes('engine-webgpu-undeclared'));
  assert.deepEqual(codes(findings(source, 'custom', [], [{ path: 'opengame.json', text: '{"requires":{"renderer":"webgpu"}}' }])), []);
  assert.deepEqual(codes(findings('const text="gpu";')), []);
});

test('optional renderer probes do not require WebGPU but explicit renderer selection does', () => {
  for (const engine of ['pixijs', 'babylonjs', 'threejs', 'playcanvas'] as const) {
    assert.equal(codes(findings('navigator.gpu.requestAdapter();', engine)).includes('engine-webgpu-undeclared'), false);
    assert.ok(codes(findings('const renderer = "webgpu";', engine)).includes('engine-webgpu-undeclared'));
  }
  assert.ok(codes(findings('new BABYLON.WebGPUEngine(canvas);', 'babylonjs')).includes('engine-webgpu-undeclared'));
});

/* A warning since the network opened (26 Oct 2026). Loading an engine's runtime from a
   CDN works on 2027-03; what it costs is that the game breaks when the CDN does, and what
   a reviewer played may not be what a player gets, so `opengame vendor` is still the
   advice and the upload is not refused for skipping it. */
test('known runtime CDN fetches are warnings that point at opengame vendor, and links and local runtimes are not', async () => {
  for (const url of ['https://cdn.jsdelivr.net/npm/js-dos@8/dist/js-dos.js', 'https://unpkg.com/@ruffle-rs/ruffle@0.2/ruffle.js',
    'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js', 'https://unpkg.com/wasmoon@1.16.0/dist/index.js',
    'https://www.gstatic.com/flutter-canvaskit/hash/canvaskit.js']) {
    const result = await preflight([file('index.html', '<script src="game.js"></script>'), file('game.js', `fetch(${JSON.stringify(url)});`)]);
    const row = result.findings.find(row => row.code === 'engine-cdn-runtime');
    assert.equal(row?.severity, 'warning', url);
    assert.match(row!.detail!, /opengame vendor/);
    assert.equal(result.ok, true, url);
  }
  const local = await preflight([file('index.html', '<script src="game.js"></script>'), file('game.js', 'fetch("./runtime.js");'), file('runtime.js', '')]);
  assert.equal(local.findings.some(row => row.code === 'engine-cdn-runtime'), false);
  const link = await preflight([file('index.html', '<a href="https://unpkg.com/wasmoon@1.16.0/dist/index.js">source</a>')]);
  assert.equal(link.findings.some(row => row.code === 'engine-cdn-runtime'), false);
});

test('Unity fallback loaders are decoded before detection and credential checks', async () => {
  for (const compress of [gzipSync, brotliCompressSync]) {
    const payload = compress(Buffer.from('var unityFramework=function(){};'));
    const readers = compressedTextReaders();
    const result = await preflight([
      file('index.html', '<script src="Build/game.loader.js"></script>'),
      file('Build/game.loader.js', 'function createUnityInstance(){}'),
      { path: 'Build/game.framework.js.unityweb', size: payload.length, text: async () => payload.toString('latin1'),
        decodedText: readers('Build/game.framework.js.unityweb', payload.length, async () => payload) },
    ]);
    assert.equal(result.engine?.id, 'unity');
    assert.ok(codes(result.findings).includes('unity-decompression-fallback'));
    assert.equal(result.findings.some(row => row.code === 'nested-archive'), false);
  }
});

test('an encrypted PCK is reported from a checked header, not a filename', async () => {
  const header = new Uint8Array(24);
  header.set([0x47, 0x44, 0x50, 0x43]);
  const view = new DataView(header.buffer);
  view.setUint32(4, 2, true); view.setUint32(20, 1, true);
  const pck: PreflightFile = { path: 'game.pck', size: 24, text: async () => '', head: async length => header.slice(0, length) };
  assert.deepEqual(codes(await encryptedPckFindings([pck])), ['godot-pck-encrypted']);
  view.setUint32(20, 0, true);
  assert.deepEqual(await encryptedPckFindings([pck]), []);
  assert.deepEqual(await encryptedPckFindings([{ ...pck, head: undefined }]), []);
  view.setUint32(20, 1, true);
  assert.deepEqual(codes(await encryptedPckFindings([{ ...pck, head: undefined, bytes: async () => header }])), ['godot-pck-encrypted']);
});

test('platform engine check stays inconclusive and threaded is derived from code', async () => {
  const result = await platformPreflight([file('index.html', '<script src="game.js"></script>'),
    file('game.js', 'const GODOT_THREADS_ENABLED=true;'), file('opengame.json', '{"threaded":false}')]);
  assert.equal(result.checks.engine, 'inconclusive');
  assert.equal(result.threaded, true);
  const unreadable = await preflight([file('index.html', '<script src="game.js"></script>'), { path: 'game.js', size: 10, text: async () => { throw new Error('unreadable'); } }]);
  assert.equal(unreadable.threaded, undefined);
});

/* THREADED BUILDS IN THE SHAPES THEY ACTUALLY SHIP. `threaded` here is the field the scan
   receipt carries and private.platform_receipt_runtime_contract reads, so a shape missed
   here is a threaded game served without cross-origin isolation, which fails to start.
   The wasm bytes are written out by hand and are what wat2wasm --enable-threads emits for
   the same modules (checked 27 Oct 2026): an `env.memory` import, flags 0x03 or 0x01, and
   a module that defines its own memory. */
const wasmFile = (path: string, bytes: Uint8Array): PreflightFile =>
  ({ path, size: bytes.length, bytes: async () => bytes, text: async () => { throw new Error('binary'); } });
const WASM_HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
const importsMemory = (flags: number) => new Uint8Array([...WASM_HEADER,
  0x02, 0x10, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, flags, 0x01, 0x02]);
const SHARED_IMPORT = importsMemory(0x03), PLAIN_IMPORT = importsMemory(0x01);
const SHARED_DEFINED = new Uint8Array([...WASM_HEADER, 0x05, 0x04, 0x01, 0x03, 0x01, 0x02]);
/* (memory 1 2) and one function doing i32.atomic.load: atomics on ordinary memory are legal
   and need no isolation, so this is not a threaded module. */
const ATOMICS_UNSHARED = new Uint8Array([...WASM_HEADER, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00,
  0x05, 0x04, 0x01, 0x01, 0x01, 0x02, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfe, 0x10, 0x02, 0x00, 0x0b]);
/* A loader that names nothing about threads, as a Closure build or a hand-written fetch
   leaves it. Only the module can answer. */
const SILENT_LOADER = 'WebAssembly.instantiateStreaming(fetch("game.wasm"),{env:{memory:m}}).then(r=>r.instance.exports.main());';
const silentGame = (module: PreflightFile, extra: PreflightFile[] = []) =>
  preflight([file('index.html', '<canvas></canvas><script src="game.js"></script>'), file('game.js', SILENT_LOADER), module, ...extra]);
const threadsNote = (result: { findings: { code: string; path?: string }[] }) => result.findings.find(row => row.code === 'engine-threads');

/* Emscripten's worker.js until 3.1.58, abridged from src/worker.js: the main script only
   spawns it, and the thread names live here, quoted, as Module properties. */
const EMSCRIPTEN_WORKER = `var Module={};var initializedJS=false;self.onmessage=e=>{try{if(e.data.cmd==="load"){
Module["wasmModule"]=e.data.wasmModule;Module["wasmMemory"]=e.data.wasmMemory;Module["buffer"]=Module["wasmMemory"].buffer;
Module["ENVIRONMENT_IS_PTHREAD"]=true;importScripts(e.data.urlOrBlob)}else if(e.data.cmd==="run"){
Module["__emscripten_thread_init"](e.data.pthread_ptr,0,0,1);Module["PThread"].receiveObjectTransfer(e.data);
Module["PThread"].threadInitTLS();}}catch(ex){Atomics.store(Module["HEAPU32"],0,1);throw ex}};`;
const LOADS_WORKER = 'var Module={};function spawn(){return new Worker(locateFile("game.worker.js"))}';

test('a threaded build is seen when only its worker.js says so', async () => {
  const result = await preflight([file('index.html', '<script src="game.js"></script>'), file('game.js', LOADS_WORKER),
    file('game.worker.js', EMSCRIPTEN_WORKER)]);
  assert.equal(result.threaded, true);
  assert.equal(threadsNote(result)?.path, 'game.worker.js');
  // A hand-written worker that allocates the shared buffer itself.
  const own = await preflight([file('index.html', '<script src="game.js"></script>'), file('game.js', 'new Worker("sim.worker.js")'),
    file('sim.worker.js', 'const sab=new SharedArrayBuffer(1024);const view=new Int32Array(sab);Atomics.wait(view,0,0);')]);
  assert.equal(own.threaded, true);
});

/* Emscripten 4's single-file pthreads, from the real moderngekko.js (marcol-og, 27 Oct 2026):
   no worker file, the main script re-entered as the worker, and a memory descriptor whose
   keys emscripten quotes so Closure cannot rename them. Each new branch is asked alone,
   with PThread and ENVIRONMENT_IS_PTHREAD absent, as a Closure build leaves them. */
const MODERNGEKKO_MEMORY = `wasmMemory = new WebAssembly.Memory({
      "initial": INITIAL_MEMORY / 65536,
      // In theory we should not need to emit the maximum if we want "unlimited"
      // or 4GB of memory, but VMs error on that atm, see
      // https://github.com/emscripten-core/emscripten/issues/14130
      "maximum": 16384,
      "shared": true
    });`;
const MODERNGEKKO_WORKER = 'worker = new Worker(new URL("moderngekko.js", import.meta.url), { "type": "module", "name": "em-pthread" });';

test('emscripten single-file pthreads are seen from the quoted shared key and the em-pthread worker name', async () => {
  assert.ok(sourceUsesThreads(MODERNGEKKO_MEMORY), 'quoted "shared": true');
  assert.ok(sourceUsesThreads('a=new WebAssembly.Memory({"initial":b/65536,"maximum":32768,"shared":!0})'), 'Closure-shaped');
  assert.ok(sourceUsesThreads("a=new WebAssembly.Memory({'initial':b,'maximum':c,'shared':true})"), 'single quotes');
  assert.ok(sourceUsesThreads(MODERNGEKKO_WORKER), 'em-pthread worker name');
  assert.ok(sourceUsesThreads('var isPthread=globalThis.name=="em-pthread";'), 'the worker asking its own name');
  for (const text of [MODERNGEKKO_MEMORY, MODERNGEKKO_WORKER]) {
    assert.doesNotMatch(text, /PThread|ENVIRONMENT_IS_PTHREAD/);
    const result = await preflight([file('index.html', '<script type="module" src="moderngekko.js"></script>'), file('moderngekko.js', text)]);
    assert.equal(result.threaded, true, text.slice(0, 40));
  }
  // Still not evidence: a memory that is not shared, and the word in other company.
  assert.equal(sourceUsesThreads('new WebAssembly.Memory({"initial":1,"maximum":2,"shared":false})'), false);
  assert.equal(sourceUsesThreads('// emscripten names its workers em-pthread'), false);
});

test('the module reader sees the shared bit, as engines.py wasm_facts does', () => {
  // tests/test_threaded_receipt.py asserts the same four answers of the Python reader.
  assert.deepEqual(wasmFacts('a.wasm', SHARED_IMPORT), { path: 'a.wasm', imports: ['memory'], importModules: ['env'], customSections: [], sharedMemory: true });
  assert.equal(wasmFacts('a.wasm', SHARED_DEFINED)?.sharedMemory, true);
  assert.equal(wasmFacts('a.wasm', PLAIN_IMPORT)?.sharedMemory, false);
  assert.equal(wasmFacts('a.wasm', ATOMICS_UNSHARED)?.sharedMemory, false);
});

test('a module whose memory is shared is threaded even when the glue says nothing', async () => {
  for (const [bytes, name] of [[SHARED_IMPORT, 'imported'], [SHARED_DEFINED, 'defined']] as const) {
    const result = await silentGame(wasmFile('game.wasm', bytes));
    assert.equal(result.threaded, true, name);
    assert.equal(threadsNote(result)?.path, 'game.wasm', name);
    const platform = await platformPreflight([file('index.html', '<canvas></canvas><script src="game.js"></script>'), file('game.js', SILENT_LOADER), wasmFile('game.wasm', bytes)]);
    assert.equal(platform.threaded, true, `${name}, through platformPreflight`);
    assert.doesNotMatch(platform.findings.find(row => row.code === 'platform-engine')?.detail ?? '', /single-thread/, name);
  }
  // Ordinary memory, and atomics on ordinary memory, are not threads. Thread use stays
  // unknown rather than false beside a module, as it was before modules were asked.
  for (const bytes of [PLAIN_IMPORT, ATOMICS_UNSHARED]) {
    const result = await silentGame(wasmFile('game.wasm', bytes));
    assert.notEqual(result.threaded, true);
    assert.equal(threadsNote(result), undefined);
  }
});

test('a Godot 4.0 to 4.2 export, threads-only and with no flag in its page, is threaded', async () => {
  // Godot's own feature check asks crossOriginIsolated and SharedArrayBuffer of every
  // export; on its own that is a probe, and the threaded no-flag export is told apart
  // by its worker and its module.
  const features = 'function getMissingFeatures(){const missing=[];if(!crossOriginIsolated)missing.push("Cross Origin Isolation");if(typeof SharedArrayBuffer==="undefined")missing.push("SharedArrayBuffer");return missing}';
  const page = '<canvas id="canvas"></canvas><script src="index.js"></script><script>const GODOT_CONFIG={"executable":"index"};const engine=new Engine(GODOT_CONFIG);engine.startGame();</script>';
  const probe = await preflight([file('index.html', page), file('index.js', `var Godot=(()=>{${features}})();`), wasmFile('index.wasm', PLAIN_IMPORT)]);
  assert.notEqual(probe.threaded, true, 'the feature check alone');
  const worker = await preflight([file('index.html', page), file('index.js', `var Godot=(()=>{${features}})();`),
    file('index.worker.js', EMSCRIPTEN_WORKER), wasmFile('index.wasm', PLAIN_IMPORT)]);
  assert.equal(worker.threaded, true, 'from index.worker.js');
  const module = await preflight([file('index.html', page), file('index.js', `var Godot=(()=>{${features}})();`), wasmFile('index.wasm', SHARED_IMPORT)]);
  assert.equal(module.threaded, true, 'from index.wasm');
});

test('a threaded Unity build is seen inside its compressed framework and its compressed module', async () => {
  const loader = file('Build/game.loader.js', 'function createUnityInstance(c,o){return o}');
  const page = file('index.html', '<canvas id="unity-canvas"></canvas><script src="Build/game.loader.js"></script>');
  const framework = 'function unityFramework(Module){var ENVIRONMENT_IS_PTHREAD=Module["ENVIRONMENT_IS_PTHREAD"]||false;var PThread={unusedWorkers:[],runningWorkers:[]};}';
  const packed = (path: string, payload: Buffer): PreflightFile => {
    const readers = compressedTextReaders();
    return { path, size: payload.length, text: async () => payload.toString('latin1'), bytes: async () => new Uint8Array(payload),
      decodedText: readers(path, payload.length, async () => new Uint8Array(payload)) };
  };
  for (const [suffix, compress] of [['.br', brotliCompressSync], ['.gz', gzipSync], ['.unityweb', gzipSync]] as const) {
    const text = await preflight([page, loader, packed(`Build/game.framework.js${suffix}`, compress(Buffer.from(framework))),
      packed(`Build/game.wasm${suffix}`, compress(Buffer.from(PLAIN_IMPORT)))]);
    assert.equal(text.engine?.id, 'unity', suffix);
    assert.equal(text.threaded, true, `framework.js${suffix}`);
    const silent = await preflight([page, loader, packed(`Build/game.framework.js${suffix}`, compress(Buffer.from('function unityFramework(Module){}'))),
      packed(`Build/game.wasm${suffix}`, compress(Buffer.from(SHARED_IMPORT)))]);
    assert.equal(silent.threaded, true, `wasm${suffix}`);
    assert.equal(threadsNote(silent)?.path, `Build/game.wasm${suffix}`);
  }
});

test('a three.js bundle that feature-detects SharedArrayBuffer is not threaded', async () => {
  const detect = 'class WebGLRenderer{} const REVISION="185"; const sab = typeof SharedArrayBuffer !== "undefined" && crossOriginIsolated;';
  const result = await preflight([file('index.html', '<canvas></canvas><script src="three.js"></script>'), file('three.js', detect)]);
  assert.equal(result.threaded, false);
  assert.equal(threadsNote(result), undefined);
});

/* Fragments copied from real builds of templates/pixijs (PixiJS 8.22.0, Vite 7) with and
   without `import 'pixi.js/unsafe-eval'`, and from pixi.js's own dist/packages. The guard's
   body and its call site sit in every PixiJS 8 build; only the polyfill empties it. */
const PIXI_GUARD = 'get roundPixels(){return!!this._roundPixels}_unsafeEvalCheck(){if(!St())throw new Error("Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.")}';
const PIXI_CALL = 'this._addRunners(...e),this._unsafeEvalCheck()}async init(t={}){';
const PIXI_POLYFILLS = [
  'function Qe(){Object.assign(K.prototype,{_unsafeEvalCheck(){}}),Object.assign(Ae.prototype,{_systemCheck(){}})}',
  'Object.assign(PIXI.AbstractRenderer.prototype, {\n        // override unsafeEval check, as we don\'t need to use it\n        _unsafeEvalCheck() {\n        }\n      });',
  'Object.assign(r.prototype,{_unsafeEvalCheck:function _unsafeEvalCheck(){}});',
  'r.prototype._unsafeEvalCheck = () => {};',
];

/* pixijs-unsafe-eval went on 26 Oct 2026: every contract a new upload can reach grants
   'unsafe-eval', so the guard passes and the warning described a failure that cannot
   happen (engine-findings.ts says more). Pinned so it does not come back unasked. */
test('a PixiJS 8 build without its unsafe-eval polyfill is no longer reported', async () => {
  const missing = engineFindings(['assets/a.js', 'assets/b.js'], [{ path: 'assets/a.js', text: PIXI_GUARD }, { path: 'assets/b.js', text: PIXI_CALL }], report('pixijs'));
  assert.deepEqual(codes(missing), []);
  for (const polyfill of PIXI_POLYFILLS)
    assert.deepEqual(codes(findings(PIXI_GUARD + PIXI_CALL, 'pixijs', [], [{ path: 'assets/index.js', text: polyfill }])), [], polyfill);
  const result = await preflight([file('index.html', '<script type="module" src="./assets/index.js"></script>'),
    file('assets/index.js', `import "./r.js";${PIXI_CALL}`), file('assets/r.js', PIXI_GUARD)]);
  assert.equal(result.findings.some(row => row.code === 'pixijs-unsafe-eval'), false);
  assert.equal(result.findings.some(row => row.severity === 'blocker'), false);
});

test('a Godot GDExtension export is noted, since eval is allowed, and an ordinary export is not', async () => {
  // The three signals, each from a real public 4.x export with GDExtension (23 Oct 2026):
  // its GODOT_CONFIG, its side module, and the dynamic linker's eval in index.js.
  const config = 'const GODOT_CONFIG = {"args":[],"executable":"index","gdextensionLibs":["libgdexample.web.template_release.wasm32.wasm"]};';
  const linker = 'var func=`(${args}) => { ${body} };`;ASM_CONSTS[start]=eval(func)';
  for (const [code, paths, engine] of [
    [config, [], 'godot'], ['', ['index.side.wasm'], 'godot'], ['', ['addons/example/example.gdextension'], 'godot'],
    ['', ['.godot/extension_list.cfg'], 'godot'], [linker, [], 'godot'],
  ] as const) {
    const row = findings(code, engine, [...paths]).find(row => row.code === 'godot-gdextension-unsupported');
    assert.equal(row?.severity, 'note', `${code} ${paths}`);
    assert.match(row!.detail!, /eval\(\), which OpenGame allows/);
  }
  // An ordinary Godot export carries an empty list and none of the linker's eval; the
  // linker pattern alone outside a Godot export is not this finding's business.
  assert.ok(!codes(findings('const GODOT_CONFIG = {"executable":"index","gdextensionLibs":[]};', 'godot', ['index.wasm', 'index.pck'])).includes('godot-gdextension-unsupported'));
  // Outside a Godot export none of the three is this finding's: an Emscripten game with
  // its own side module, or one whose text merely mentions the key, is not refused here.
  for (const [code, paths] of [[linker, []], [config, []], ['', ['game.side.wasm']], ['', ['lib/x.gdextension']]] as const) {
    assert.ok(!codes(findings(code, 'emscripten', [...paths])).includes('godot-gdextension-unsupported'), `${code} ${paths}`);
  }
  // The same check every caller runs (CLI check, web, pipeline) reports it and passes it.
  const html = `<!doctype html><script src="index.js"></script><script>${config}</script>`;
  const result = await platformPreflight([file('index.html', html), file('index.js', 'var Engine={};'),
    file('index.side.wasm', 'x'), file('index.pck', 'GDPC')]);
  assert.equal(result.findings.find(row => row.code === 'godot-gdextension-unsupported')?.severity, 'note');
  assert.equal(result.findings.some(row => row.severity === 'blocker'), false, JSON.stringify(result.findings));
});

test('a Ren\'Py web export is noted for its eval, and a forged one is still refused by its archive', async () => {
  // The glue as renpy.js ships it in the 8.3.7 SDK's web export (minified, 23 Oct 2026).
  const glue = 'function _emscripten_run_script(ptr){eval(UTF8ToString(ptr))}function _emscripten_run_script_int(ptr){return eval(UTF8ToString(ptr))|0}';
  const row = findings(glue, 'renpy', ['renpy.data', 'game.zip']).find(row => row.code === 'renpy-needs-eval');
  assert.equal(row?.severity, 'note');
  assert.match(row!.title, /eval\(\)/);
  // The same glue in some other Emscripten game is that game's business.
  assert.ok(!codes(findings(glue, 'emscripten', ['game.wasm'])).includes('renpy-needs-eval'));
  // The blocker on detection used to be what kept a forged signature from getting an
  // arbitrary zip admitted as Ren'Py's game.zip. engine-archive-structure holds that door
  // now: a game.zip without a Ren'Py script under game/ is refused whatever the text says.
  // The registry's signature, from renpyweb's renpy-pre.js.
  const forged = 'var url = DEFAULT_GAME_FILENAME; window.setTimeout(function() { gameExtractAndRun(); }, 200);';
  const html = '<!doctype html><script src="game.js"></script>';
  const result = await platformPreflight([file('index.html', html), file('game.js', forged), file('game.zip', 'PK')]);
  assert.equal(result.ok, false);
  assert.ok(codes(result.findings).includes('renpy-needs-eval'));
  assert.ok(result.findings.some(row => row.code === 'engine-archive-structure' && row.severity === 'blocker' && row.path === 'game.zip'),
    JSON.stringify(result.findings));
});

test('a memory section this cannot walk says nothing about threads and keeps the imports', () => {
  const half = [0x05, 0x04, 0x02, 0x03, 0x01, 0x02];
  assert.equal(wasmFacts('a.wasm', new Uint8Array([...WASM_HEADER, ...half]))?.sharedMemory, false);
  assert.deepEqual(wasmFacts('a.wasm', new Uint8Array([...PLAIN_IMPORT, ...half])),
    { path: 'a.wasm', imports: ['memory'], importModules: ['env'], customSections: [], sharedMemory: false });
});

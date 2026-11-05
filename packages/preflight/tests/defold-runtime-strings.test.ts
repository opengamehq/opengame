/* What a real Defold web export's loader names, read as the check reads it. The snippets are
   copied from defold-pinball's export (Defold 1.x dmloader.js and its Emscripten glue,
   25 Oct 2026), which reported eight missing files and an undeclared WebGPU renderer
   while it loaded and reached Ready. Godot's equivalents are in
   engine-runtime-strings.test.ts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, type PreflightFile } from '../src/index';
import { platformPreflight } from '../src/platform';
import { defoldArchivePrefix, defoldEngineWasm } from '../src/engines';

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const binary = (path: string): PreflightFile =>
  ({ path, size: 8, bytes: async () => new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), text: async () => { throw new Error('binary'); } });
const missing = (result: { findings: { code: string; more?: string[] }[] }) =>
  (result.findings.find((f) => f.code === 'missing-ref')?.more ?? []).map((row) => row.split(' → ')[1]);

const FILTER = `var CUSTOM_PARAMETERS = {
    archive_location_filter: function( path, attempt ) {
        var url = "archive" + path;
        var suffix = "";
        // a configured suffix may carry a signature that covers the query string
        if (suffix) return url + suffix;
        return attempt ? FileLoader.addCacheBuster(url, attempt) : url;
    },
};
`;
const NAMES = `var EngineLoader = {
    getWasmName: function(exeName) {
        if (Module['isWASMPthreadSupported'])
            return exeName + '_pthread.wasm';
        return exeName + '.wasm';
    },
    getWasmJSName: function(exeName) {
        if (Module['isWASMPthreadSupported'])
            return exeName + '_pthread_wasm.js';
        return exeName + '_wasm.js';
    },
    load: function() {
        GameArchiveLoader.loadArchiveDescription('/archive_files.json');
    },
    probeWebGPUSupport: function(callback) {
        try {
            navigator.gpu.requestAdapter().then(function(adapter) {
                Module._webgpuAdapterAvailable = adapter !== null && typeof adapter !== "undefined";
                callback();
            });
        } catch (e) { callback(); }
    },
};
`;
const LOCATE = `Module["locateFile"] = function(path, scriptDirectory)
{
    // dmengine*.wasm is hardcoded in the built JS loader for WASM,
    // we need to replace it here with the correct project name.
    if (path == "dmengine.wasm" || path == "dmengine_release.wasm" || path == "dmengine_headless.wasm") {
        if (Module['isWASMPthreadSupported']) {
            path = "LanternDeep_pthread.wasm";
        } else {
            path = "LanternDeep.wasm";
        }
    }
    return scriptDirectory + path;
};
`;
const GLUE = 'var wasmBinaryFile;function findWasmBinary(){return locateFile("dmengine_release.wasm")}';
const PAGE = '<canvas id="canvas"></canvas><script src="dmloader.js"></script><script>EngineLoader.load("canvas", "LanternDeep");</script>';
const defold = (extra: PreflightFile[], omit: string[] = []) => preflight([
  file('index.html', PAGE), file('dmloader.js', FILTER + NAMES + LOCATE), file('LanternDeep_wasm.js', GLUE),
  ...[binary('LanternDeep.wasm'), file('archive/archive_files.json', '{"content":[]}')].filter((f) => !omit.includes(f.path)), ...extra]);

test('Defold\'s loader names are read the way its loader rewrites them', async () => {
  const result = await defold([]);
  assert.equal(result.engine?.id, 'defold', JSON.stringify(result.engine));
  // The threaded module is a real request on the threaded path, and this export has none.
  assert.deepEqual(missing(result), ['LanternDeep_pthread.wasm']);
});

test('a Defold export that really lost its archive list or its module is still told, by the real name', async () => {
  assert.ok(missing(await defold([], ['archive/archive_files.json'])).includes('archive/archive_files.json'));
  assert.ok(missing(await defold([], ['LanternDeep.wasm'])).includes('LanternDeep.wasm'));
});

test('the archive prefix and the engine module come from the build, page first', () => {
  assert.equal(defoldArchivePrefix([{ path: 'dmloader.js', text: FILTER }]), 'archive');
  assert.equal(defoldArchivePrefix([{ path: 'dmloader.js', text: FILTER }, { path: 'index.html', text: FILTER.replace('"archive"', '"packs"') }]), 'packs');
  assert.equal(defoldArchivePrefix([{ path: 'a.js', text: 'var url = "archive" + path;' }]), null);
  assert.equal(defoldEngineWasm([{ path: 'dmloader.js', text: LOCATE }]), 'LanternDeep.wasm');
});

test('a comparison and a suffix are not files, and an assignment still is', async () => {
  const result = await preflight([file('index.html', '<script src="a.js"></script>'),
    file('a.js', 'if (p == "skip.png" || p === "skip2.png" || p != "skip3.png") q = base + "_part.wasm"; const real = "level.json"; x = "hero.png";')]);
  assert.deepEqual(missing(result).sort(), ['hero.png', 'level.json']);
});

test('Defold\'s WebGPU probe is not a WebGPU renderer, and the same probe elsewhere still is', async () => {
  const run = (files: PreflightFile[]) => platformPreflight(files).then((result) => result.findings.some((f) => f.code === 'engine-webgpu-undeclared'));
  assert.equal(await run([file('index.html', PAGE), file('dmloader.js', FILTER + NAMES + LOCATE), binary('LanternDeep.wasm'), file('archive/archive_files.json', '{}')]), false);
  assert.equal(await run([file('index.html', '<canvas></canvas><script src="g.js"></script>'), file('g.js', 'navigator.gpu.requestAdapter().then(a => a.requestDevice());')]), true);
});

test('a path after + or ==, in the wrong case, keeps its blocker, and a missing full path its warning', async () => {
  for (const js of ['img.src = BASE + "/assets/Hero.PNG";', 'if (x === "assets/Hero.PNG") img.src = x;']) {
    const result = await preflight([file('index.html', '<script src="a.js"></script>'), file('assets/hero.png', 'x'), file('a.js', js)]);
    assert.ok(result.findings.some((f) => f.code === 'case-mismatch' && f.severity === 'blocker'), `${js} ${JSON.stringify(result.findings.map((f) => f.code))}`);
  }
  const result = await preflight([file('index.html', '<script src="a.js"></script>'), file('a.js', 'fetch(DATA + "levels/one.json");')]);
  assert.deepEqual(missing(result), ['levels/one.json']);
});

test('the archive filter is read in a bounded window, and a prefix that climbs out is ignored', () => {
  const started = performance.now();
  assert.equal(defoldArchivePrefix([{ path: 'dmloader.js', text: 'archive_location_filter:function(' + 'a'.repeat(2_000_000) }]), null);
  assert.equal(defoldArchivePrefix([{ path: 'dmloader.js', text: 'archive_location_filter:function(a '.repeat(60_000) }]), null);
  assert.ok(performance.now() - started < 2000, `${Math.round(performance.now() - started)} ms`);
  assert.equal(defoldArchivePrefix([{ path: 'index.html', text: FILTER.replace('"archive"', '".."') }]), null);
});

test('a method comparison stays no request at all, whatever the case of the file on disk', async () => {
  for (const js of ['p.endsWith("Index.js");', 'u.includes("Hero.PNG");', 'u.indexOf("assets/Hero.PNG") >= 0;']) {
    const result = await preflight([file('index.html', '<script src="a.js"></script>'), file('index.js', 'x'), file('hero.png', 'x'), file('assets/hero.png', 'x'), file('a.js', js)]);
    assert.deepEqual(result.findings.filter((f) => f.code === 'case-mismatch' || f.code === 'missing-ref').map((f) => f.code), [], js);
  }
});

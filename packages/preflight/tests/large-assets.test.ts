import test from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLE, LIMITS } from '@opengame/shared';
import { readFileSync } from 'node:fs';
import { preflight, type PreflightFile } from '../src/index';
import { platformPreflight } from '../src/platform';

const file = (path: string, text: string): PreflightFile => ({ path, size: Buffer.byteLength(text), text: async () => text });
const boot = () => [
  file('index.html', '<script src="Build/web.loader.js"></script><script>createUnityInstance(canvas, {dataUrl:"Build/web.data"})</script>'),
  file('Build/web.loader.js', 'function createUnityInstance() {}'),
  { path: 'Build/web.wasm', size: 8, text: async () => { throw Error('binary'); } },
];
const external = (size: number, path = 'Build/web.data') => ({ path, byteSize: size, sha256: 'a'.repeat(64) });
const deferred = (row: ReturnType<typeof external>): PreflightFile => ({ path: row.path, size: row.byteSize,
  text: async () => { throw Error('external bytes must remain unread'); },
  bytes: async () => { throw Error('external bytes must remain unread'); } });

test('trusted Unity external assets retain union references and explicitly defer credentials', async () => {
  // Past one ordinary file's cap and inside the Unity lane's (512 MiB). It was one byte past
  // the whole tree's cap until that went to 1 GiB on 28 Oct 2026, past the lane's own.
  const row = external(BUNDLE.fileBytesMax + 1);
  assert.ok(row.byteSize <= LIMITS.platform.largeAssets.fileBytesMax);
  const files = [...boot(), deferred(row)];
  const ordinary = await preflight(files, { authoritative: true });
  assert.ok(ordinary.findings.some(finding => finding.code === 'file-size' && finding.path === row.path));
  const result = await platformPreflight(files, { externalAssets: [row] });
  assert.equal(result.ok, true);
  assert.equal(result.engine?.id, 'unity');
  assert.equal(result.checks.secrets, 'inconclusive');
  assert.equal(result.credentialScan?.complete, false);
  assert.deepEqual(result.externalAssets, [row]);
  assert.ok(result.include.includes(row.path));
  assert.deepEqual(result.credentialScan?.files.find(file => file.path === row.path), {
    path: row.path, required: true, inspected: false,
  });
  assert.equal(result.credentialScan!.expectedFiles, result.credentialScan!.inspectedFiles + 1);
  assert.ok(!result.findings.some(finding => finding.code === 'unreadable-file'));
});

test('external metadata must match the complete canonical tree and shared bounds', async () => {
  const row = external(10);
  for (const rows of [[], [{ ...row, byteSize: 11 }], [{ ...row, path: '../web.data' }],
    [{ ...row, byteSize: LIMITS.platform.largeAssets.fileBytesMax + 1 }]]) {
    const result = await preflight([...boot(), deferred(row)], { authoritative: true, externalAssets: rows });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some(finding => finding.code === 'external-assets-invalid'));
  }
  const wrongCase = await preflight([...boot(), { ...deferred(row), path: row.path.toUpperCase() }], { externalAssets: [row] });
  assert.equal(wrongCase.ok, false);
  const duplicate = await preflight([...boot(), deferred(row), deferred(row)], { externalAssets: [row] });
  assert.equal(duplicate.ok, false);
  const noUnity = await preflight([file('index.html', '<canvas></canvas>'), deferred(row)], { authoritative: true, externalAssets: [row] });
  assert.ok(noUnity.findings.some(finding => finding.code === 'external-assets-unity-required'));
  const unreadable = boot();
  unreadable[1] = { ...unreadable[1]!, text: async () => { throw Error('unreadable boot'); } };
  const missingEvidence = await preflight([...unreadable, deferred(row)], { authoritative: true, externalAssets: [row] });
  assert.ok(missingEvidence.findings.some(finding => finding.code === 'external-assets-unity-required'));
});

test('external allowance never pays for oversized boot files', async () => {
  const row = external(10);
  const oversized = [...boot(), deferred(row), { path: 'other.bin', size: BUNDLE.uncompressedBytesMax, text: async () => '' }];
  const rejected = await preflight(oversized, { authoritative: true, externalAssets: [row] });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.findings[0]?.code, 'external-assets-invalid');
});

test('external allowance cannot hide a missing static script', async () => {
  const row = external(10);
  const files = boot();
  files[0] = file('index.html', '<script src="Build/web.loader.js"></script><script src="missing.js"></script>');
  const missing = await preflight([...files, deferred(row)], { authoritative: true, externalAssets: [row] });
  assert.equal(missing.ok, false);
  // Static scripts are required for startup; the existing reference checker
  // reports a blocking missing-import, not the warning used for runtime assets.
  assert.equal(missing.findings.find(finding => finding.code === 'missing-import')?.severity, 'blocker');
});

/* Trailer Park Warfare, 12 Nov 2026: three.js's KTX2Loader is pointed at basis/ and asks for
   basis_transcoder.wasm there, and the Emscripten glue the bundler copied into assets/ names
   the file bare. Read beside the glue, it was "not in the folder". */
test('a bare file name a loader joins to a folder is satisfied by that file anywhere in the bundle', async () => {
  const glue = 'function findWasmBinary(){var f="basis_transcoder.wasm";return locateFile(f)}';
  const files = [file('index.html', '<script type="module" src="assets/glue.js"></script>'), file('assets/glue.js', glue)];
  const absent = await preflight(files, { authoritative: true });
  assert.ok(absent.findings.some(row => row.code === 'missing-ref'), 'a name that is nowhere is still reported');
  const present = await preflight([...files, file('basis/basis_transcoder.wasm', 'wasm')], { authoritative: true });
  assert.ok(!present.findings.some(row => row.code === 'missing-ref'), JSON.stringify(present.findings));
  // A path is still resolved the way it is written.
  const pathed = await preflight([file('index.html', '<script type="module" src="assets/glue.js"></script>'),
    file('assets/glue.js', 'fetch("levels/one.json");'), file('data/one.json', '{}')], { authoritative: true });
  assert.ok(pathed.findings.some(row => row.code === 'missing-ref'));
});

test('external reference names only affect exact and case-sensitive existence checks', async () => {
  const files = [file('index.html', '<script src="main.js"></script>'),
    file('main.js', 'fetch("StreamingAssets/level.json");')];
  const plain = await preflight(files, { authoritative: true });
  assert.ok(plain.findings.some(row => row.code === 'missing-ref'));
  const exact = await preflight(files, { authoritative: true, externalPaths: ['StreamingAssets/level.json'] });
  assert.ok(!exact.findings.some(row => row.code === 'missing-ref'));
  assert.deepEqual(exact.include, plain.include);
  assert.equal(exact.totalBytes, plain.totalBytes);
  assert.equal(exact.fileCount, plain.fileCount);
  assert.deepEqual(exact.engine, plain.engine);
  assert.deepEqual(exact.credentialScan, plain.credentialScan);
  assert.equal(exact.externalAssets, undefined);
  const wrongCase = await preflight(files, { externalPaths: ['StreamingAssets/Level.json'] });
  assert.ok(wrongCase.findings.some(row => row.code === 'case-mismatch'));
  const missing = await preflight(files, { externalPaths: ['StreamingAssets/other.json'] });
  assert.ok(missing.findings.some(row => row.code === 'missing-ref'));
  for (const paths of [['../level.data'], ['/level.data'], ['level.data?token=x'], ['main.js'],
    ['StreamingAssets/level.json', 'streamingassets/LEVEL.json']]) {
    const rejected = await preflight(files, { externalPaths: paths });
    assert.equal(rejected.ok, false);
    assert.ok(rejected.findings.some(row => row.code === 'external-reference-path-invalid'));
  }
});

const caselessPairs = [
  ['\u0390', '\u03aa\u0301'],
  ['\u1f80\u0308', '\u1f00\u0308\u03b9'],
] as const;

test('external reference metadata rejects canonical caseless equality and prefixes', async () => {
  for (const [left, right] of caselessPairs) {
    for (const paths of [
      [`Build/${left}.data`, `Build/${right}.data`],
      [`Build/${left}.data`, `Build/${right}.data/child.data`],
      [`Build/${right}.data/child.data`, `Build/${left}.data`],
    ]) {
      for (const path of paths) assert.equal(path.normalize('NFC'), path);
      const result = await preflight([file('index.html', '<canvas></canvas>')], { externalPaths: paths });
      assert.equal(result.ok, false);
      assert.equal(result.findings[0]?.code, 'external-reference-path-invalid');
    }
  }
});

test('boot and external inputs reject canonical caseless overlap before reading bytes', async () => {
  for (const [left, right] of caselessPairs) {
    for (const [bootPath, assetPath] of [
      [`Build/${left}.data`, `Build/${right}.data`],
      [`Build/${left}.data`, `Build/${right}.data/child.data`],
      [`Build/${left}.data/child.data`, `Build/${right}.data`],
    ]) {
      const row = external(1, assetPath!);
      let reads = 0;
      const inputs = [...boot(), { path: bootPath!, size: 1 }, deferred(row)].map(input => ({
        ...input,
        text: async () => { reads++; throw Error('collision must be refused before reads'); },
        bytes: async () => { reads++; throw Error('collision must be refused before reads'); },
      }));
      const result = await preflight(inputs, { externalAssets: [row] });
      assert.equal(result.ok, false);
      assert.equal(result.findings[0]?.code, 'external-assets-invalid');
      assert.equal(reads, 0);
    }
  }
});

test('retained boot and reference-only names reject canonical overlap before content reads', async () => {
  for (const [left, right] of caselessPairs) {
    for (const [bootPath, referencePath] of [
      [`Build/${left}.data`, `Build/${right}.data`],
      [`Build/${left}.data`, `Build/${right}.data/child.data`],
      [`Build/${left}.data/child.data`, `Build/${right}.data`],
    ]) {
      for (const root of ['', 'dist/']) {
        let reads = 0;
        const inputs = [`${root}index.html`, `${root}${bootPath}`].map(path => ({
          path, size: 1,
          text: async () => { reads++; throw Error('collision must precede content reads'); },
          bytes: async () => { reads++; throw Error('collision must precede content reads'); },
        }));
        const result = await preflight(inputs, { externalPaths: [referencePath!] });
        assert.equal(result.ok, false);
        assert.ok(result.findings.some(row => row.code === 'external-reference-path-invalid'));
        assert.equal(result.strippedRoot, root);
        assert.equal(reads, 0);
      }
    }
  }
});

test('reference union uses retained paths after root selection and source-map exclusion', async () => {
  for (const [left, right] of caselessPairs) {
    const outsideRoot = await preflight([
      file('dist/index.html', '<canvas></canvas>'), file(`Build/${left}.data`, 'outside'),
    ], { externalPaths: [`Build/${right}.data`] });
    assert.equal(outsideRoot.strippedRoot, 'dist/');
    assert.deepEqual(outsideRoot.include, ['index.html']);
    assert.ok(!outsideRoot.findings.some(row => row.code === 'external-reference-path-invalid'));

    const excludedMap = await preflight([
      file('index.html', '<canvas></canvas>'), file(`Build/${left}.data/unused.js.map`, '{}'),
    ], { externalPaths: [`Build/${right}.data`] });
    assert.deepEqual(excludedMap.include, ['index.html']);
    assert.ok(!excludedMap.findings.some(row => row.code === 'external-reference-path-invalid'));
  }
});

test('ordinary retained paths reject Greek and ASCII file prefixes before content reads', async () => {
  for (const [left, right] of [...caselessPairs, ['assets', 'assets'], ['Assets', 'assets']]) {
    for (const reverse of [false, true]) {
      for (const root of ['', 'dist/']) {
        let reads = 0;
        const conflicts = [`${root}${left}`, `${root}${right}/save.dat`];
        if (reverse) conflicts.reverse();
        const inputs = [`${root}index.html`, ...conflicts].map(path => ({
          path, size: 1,
          text: async () => { reads++; throw Error('collision must precede content reads'); },
          bytes: async () => { reads++; throw Error('collision must precede content reads'); },
        }));
        const result = await preflight(inputs);
        assert.equal(result.ok, false);
        assert.ok(result.findings.some(row => row.code === 'case-collision'));
        assert.ok(!result.findings.some(row => row.code === 'external-reference-path-invalid'));
        assert.equal(result.strippedRoot, root);
        assert.equal(reads, 0);
      }
    }
  }
});

test('ordinary path overlap ignores outside-root and excluded files', async () => {
  const outside = await preflight([
    file('dist/index.html', '<canvas></canvas>'), file('assets', 'outside'), file('assets/save.dat', 'outside'),
  ]);
  assert.deepEqual(outside.include, ['index.html']);
  assert.ok(!outside.findings.some(row => row.code === 'case-collision'));
  const excluded = await preflight([
    file('index.html', '<canvas></canvas>'), file('assets', 'kept'), file('assets/unused.js.map', '{}'),
  ]);
  assert.deepEqual(excluded.include, ['index.html', 'assets']);
  assert.ok(!excluded.findings.some(row => row.code === 'case-collision'));
});

test('slash-dense paths are bounded before canonical prefixes or content readers', async () => {
  const path = 'a/'.repeat((64 * 1024 - 6) / 2) + 'x.data';
  const row = external(1);
  for (const mode of ['ordinary', 'references', 'assets', 'asset-metadata'] as const) {
    let reads = 0;
    const longInput = mode === 'ordinary' || mode === 'assets';
    const inputs = [...boot(), ...(longInput ? [{ path, size: 1 }] : []),
      ...(mode === 'assets' ? [deferred(row)] : [])].map(input => ({
        ...input,
        text: async () => { reads++; throw Error('overlong paths must precede reads'); },
        bytes: async () => { reads++; throw Error('overlong paths must precede reads'); },
      }));
    const result = await preflight(inputs, mode === 'references' ? { externalPaths: [path] } :
      mode === 'assets' ? { externalAssets: [row] } :
      mode === 'asset-metadata' ? { externalAssets: [external(1, path)] } : {});
    const code = mode === 'ordinary' ? 'path-too-long' : mode === 'references' ?
      'external-reference-path-invalid' : 'external-assets-invalid';
    assert.equal(result.ok, false);
    assert.equal(result.findings[0]?.code, code);
    assert.equal(reads, 0);
  }
});

test('path bounds count Unicode bytes and preserve the exact shared boundary', async () => {
  const unicodePath = (bytes: number) => {
    const remaining = bytes - Buffer.byteLength('Build/.data');
    return `Build/${'é'.repeat(Math.floor(remaining / 2))}${remaining % 2 ? 'x' : ''}.data`;
  };
  for (const bytes of [BUNDLE.pathBytesMax, BUNDLE.pathBytesMax + 1]) {
    const path = unicodePath(bytes);
    assert.equal(Buffer.byteLength(path), bytes);
    assert.ok(path.length < BUNDLE.pathBytesMax, 'the UTF-16 bound alone must not decide this fixture');
    const over = bytes > BUNDLE.pathBytesMax;
    for (const mode of ['ordinary', 'references', 'assets'] as const) {
      let reads = 0;
      const row = external(1, path);
      const inputs = [...boot(), ...(mode === 'ordinary' ? [file(path, 'data')] :
        mode === 'assets' ? [deferred(row)] : [])].map(input => ({
          ...input,
          text: async () => { reads++; return input.text?.() ?? ''; },
        }));
      const result = await preflight(inputs, mode === 'references' ? { externalPaths: [path] } :
        mode === 'assets' ? { externalAssets: [row] } : {});
      const code = mode === 'ordinary' ? 'path-too-long' : mode === 'references' ?
        'external-reference-path-invalid' : 'external-assets-invalid';
      assert.equal(result.findings.some(finding => finding.code === code), over);
      if (over) { assert.equal(result.ok, false); assert.equal(reads, 0); }
      else assert.equal(result.ok, true);
    }
  }
});

test('ordinary path bounds apply after long wrapper roots and source maps are removed', async () => {
  const wrapper = 'a/'.repeat(BUNDLE.pathBytesMax);
  const wrapped = await preflight([
    file(`${wrapper}index.html`, '<script src="game.js"></script>'),
    file(`${wrapper}game.js`, 'console.log("game");'),
  ]);
  assert.equal(wrapped.ok, true);
  assert.equal(wrapped.strippedRoot, wrapper);
  assert.deepEqual(wrapped.include, ['index.html', 'game.js']);
  assert.ok(!wrapped.findings.some(row => row.code === 'path-too-long'));

  for (const externalPaths of [undefined, ['Build/level.data']]) {
    let excludedReads = 0;
    const excluded = await preflight([
      file('index.html', '<canvas></canvas>'),
      { path: `${wrapper}unused.js.map`, size: 1,
        text: async () => { excludedReads++; throw Error('excluded source maps must not be read'); } },
    ], { externalPaths });
    assert.equal(excluded.ok, true);
    assert.deepEqual(excluded.include, ['index.html']);
    assert.ok(!excluded.findings.some(row => row.code === 'path-too-long' || row.code === 'external-reference-path-invalid'));
    assert.equal(excludedReads, 0);
  }
});

test('canonical comparison leaves original reference names and inspection metadata unchanged', async () => {
  for (const pair of caselessPairs) {
    for (const name of pair) {
      const path = `StreamingAssets/${name}.png`;
      // HTML src references accept percent-encoded Unicode and resolve it
      // through the real decoding path as a runtime asset reference.
      const reference = path.split('/').map(encodeURIComponent).join('/');
      const inputs = [file('index.html', `<script src="main.js"></script><img src="${reference}">`),
        file('main.js', 'console.log("game");')];
      const plain = await preflight(inputs);
      const referenced = await preflight(inputs, { externalPaths: [path] });
      assert.ok(plain.findings.some(row => row.code === 'missing-ref'));
      assert.ok(!referenced.findings.some(row => row.code === 'missing-ref'));
      assert.deepEqual(referenced.include, plain.include);
      assert.equal(referenced.totalBytes, plain.totalBytes);
      assert.equal(referenced.fileCount, plain.fileCount);
      assert.deepEqual(referenced.credentialScan, plain.credentialScan);
      assert.deepEqual(referenced.engine, plain.engine);
      assert.equal(referenced.externalAssets, undefined);
      assert.equal(inputs[1]?.path, 'main.js');
    }
  }
});

/* The Kaigen lane. Engine identity is routing: the synthetic Kaigen module (the engines
   test's fixture, built by fixtures/synthetic_kaigen.py with no Kaigen bytes) passes
   structural detection, and so does a copy with its licence stamp scrubbed, which is
   what a forger has. The stamp check here is the creator's early
   warning; the account grant and the upload statement are the server's admission. */
const KAIGEN_ROW = (JSON.parse(readFileSync(new URL('./fixtures/engine-signatures.json', import.meta.url), 'utf8')) as
  { id: string; text: string; wasm?: { path: string; base64: string }[] }[]).find((row) => row.id === 'kaigen' && row.wasm)!;
const KAIGEN_WASM = new Uint8Array(Buffer.from(KAIGEN_ROW.wasm![0]!.base64, 'base64'));
const scrubbed = (() => {
  const copy = Buffer.from(KAIGEN_WASM);
  const at = copy.indexOf('HZLICSTAMP1');
  assert.ok(at >= 0, 'the fixture carries the stamp');
  copy.write('XXXXXXXXXXX', at, 'latin1');
  return new Uint8Array(copy);
})();
const wasmFile = (path: string, bytes: Uint8Array): PreflightFile =>
  ({ path, size: bytes.length, bytes: async () => bytes, text: async () => { throw new Error('binary'); } });
const kaigenBoot = (wasm: Uint8Array) => [
  file('index.html', '<!doctype html><canvas id="c"></canvas><script type="module">import { createGame } from "./main.js";'
    + 'createGame({ canvas: c, wasmUrl: new URL("game.wasm", location.href).href });</script>'),
  file('main.js', 'export function createGame(e){return new Worker(new URL("./main_worker.js",import.meta.url),{type:"module"})}'),
  file('main_worker.js', KAIGEN_ROW.text), wasmFile('game.wasm', wasm)];
const KAIGEN_PLAN = 'kaigen-assets-v1';
const hza = (index: number) => ({ path: `cooked/og_clash/world/chunk${String(index).padStart(5, '0')}.hza`, byteSize: 64, sha256: 'b'.repeat(64) });

test('a Kaigen export with its licence stamp may move thousands of cooked files out of the boot tree', async () => {
  const rows = Array.from({ length: 4000 }, (_, index) => hza(index));
  const result = await preflight([...kaigenBoot(KAIGEN_WASM), ...rows.map(deferred)],
    { authoritative: true, externalAssets: rows, externalDelivery: KAIGEN_PLAN });
  assert.equal(result.engine?.id, 'kaigen', JSON.stringify(result.engine));
  assert.deepEqual(result.findings.filter(finding => finding.severity === 'blocker').map(finding => finding.code), []);
  const unity = await preflight([...kaigenBoot(KAIGEN_WASM), ...rows.slice(0, 1).map(deferred)],
    { authoritative: true, externalAssets: rows.slice(0, 1) });
  assert.ok(unity.findings.some(finding => finding.code === 'external-assets-invalid'), 'a .hza is not a Unity data file');
});

test('a forged Kaigen build without the licence stamp is refused the Kaigen lane', async () => {
  const rows = [hza(0)];
  const forged = await preflight([...kaigenBoot(scrubbed), ...rows.map(deferred)],
    { authoritative: true, externalAssets: rows, externalDelivery: KAIGEN_PLAN });
  assert.equal(forged.engine?.id, 'kaigen', 'structural detection alone is forgeable, which is why it is not admission');
  assert.ok(forged.findings.some(finding => finding.code === 'external-assets-licence-required'), JSON.stringify(forged.findings));
  const unityShaped = await preflight([...boot(), ...rows.map(deferred)],
    { authoritative: true, externalAssets: rows, externalDelivery: KAIGEN_PLAN });
  assert.ok(unityShaped.findings.some(finding => finding.code === 'external-assets-engine-required'));
});

/* The large-game lane (27 Oct 2026). A build no recognised engine made is what it is for,
   so a plain canvas page with a wasm and gigabytes of original data needs no engine at
   all; a Kaigen runtime anywhere in the boot tree sends the build to the Kaigen lane,
   whose statement this one does not collect. */
const LARGE_GAME = 'large-game-v1';
const gameData = (index: number) => ({ path: `main/zone${String(index).padStart(5, '0')}.ff`, byteSize: 64, sha256: 'c'.repeat(64) });
const decompBoot = () => [
  file('index.html', '<!doctype html><canvas id="c"></canvas><script src="game.js"></script>'),
  file('game.js', 'fetch("main/zone00000.ff").then(r => r.arrayBuffer()).then(b => console.log(b.byteLength));'),
];

test('a Kaigen runtime hidden from detection is still refused the large-game lane by its licence stamp', async () => {
  /* Review of 27 Oct 2026: quoting one glue key and renaming the worker took a real Kaigen
     export out of detection on both readers, while its wasm still carried the stamp. */
  const rows = [gameData(0)];
  const quoted = KAIGEN_ROW.text.replace(/\bjs_gpu_get_supported_compressed_formats\s*:/, '"js_gpu_get_supported_compressed_formats":');
  assert.notEqual(quoted, KAIGEN_ROW.text, 'the fixture names the glue key');
  const boot = kaigenBoot(KAIGEN_WASM).map(row => row.path === 'main_worker.js' ? file('main_worker.cjs', quoted) : row);
  const hidden = await preflight([...boot, ...rows.map(deferred)], { authoritative: true, externalAssets: rows, externalDelivery: LARGE_GAME });
  assert.notEqual(hidden.engine?.id, 'kaigen', 'detection is fooled');
  assert.deepEqual(hidden.engine?.licences, ['kaigen'], 'the stamp is still read');
  assert.ok(hidden.findings.some(finding => finding.code === 'external-assets-engine-required'), JSON.stringify(hidden.findings));
});

test('a game no engine made may move its data out of the boot tree on the large-game lane', async () => {
  const rows = Array.from({ length: 4000 }, (_, index) => gameData(index));
  const result = await preflight([...decompBoot(), ...rows.map(deferred)],
    { authoritative: true, externalAssets: rows, externalDelivery: LARGE_GAME });
  assert.deepEqual(result.findings.filter(finding => finding.severity === 'blocker').map(finding => finding.code), []);
  assert.equal(result.credentialScan?.complete, false, 'external bytes stay unread here and are scanned on the server');
  const kaigen = await preflight([...kaigenBoot(KAIGEN_WASM), ...rows.slice(0, 1).map(deferred)],
    { authoritative: true, externalAssets: rows.slice(0, 1), externalDelivery: LARGE_GAME });
  const refusal = kaigen.findings.find(finding => finding.code === 'external-assets-engine-required');
  assert.ok(refusal, JSON.stringify(kaigen.findings));
  assert.match(refusal.title, /Kaigen export/);
  const script = await preflight([...decompBoot(), deferred({ path: 'main/boot.js', byteSize: 64, sha256: 'd'.repeat(64) })],
    { authoritative: true, externalAssets: [{ path: 'main/boot.js', byteSize: 64, sha256: 'd'.repeat(64) }], externalDelivery: LARGE_GAME });
  assert.ok(script.findings.some(finding => finding.code === 'external-assets-invalid'), 'code never leaves the boot tree');
});

test('one boot file past bundle.fileBytesMax is a blocker, and one at it is not', async () => {
  const at = { path: 'Build/web.data', size: BUNDLE.fileBytesMax, text: async () => { throw Error('binary'); } };
  const fine = await preflight([...boot(), at], { authoritative: true });
  assert.ok(!fine.findings.some(finding => finding.code === 'file-size'));
  const over = await preflight([...boot(), { ...at, size: BUNDLE.fileBytesMax + 1 }, { ...at, path: 'Build/two.data', size: BUNDLE.fileBytesMax + 2 }],
    { authoritative: true });
  const finding = over.findings.find(row => row.code === 'file-size');
  assert.equal(over.ok, false);
  assert.equal(finding?.severity, 'blocker');
  assert.equal(finding?.path, 'Build/two.data');
  assert.match(finding!.title, /^Build\/two\.data is .+\. One file can be at most .+\.$/);
  assert.match(finding!.detail!, /^2 files are over it\./);
});

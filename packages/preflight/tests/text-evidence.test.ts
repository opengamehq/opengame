import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTextEvidence } from '../src/text-evidence';
import { platformPreflight } from '../src/platform';
import { LIMITS } from '@opengame/shared';
import type { PreflightFile } from '../src/index';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { compressedTextReaders } from '../src/node-compression';
import { createHash } from 'node:crypto';
import "./credential-checks-on";

const file = (path: string, source: string): PreflightFile => ({ path, size: Buffer.byteLength(source), text: async () => source, bytes: async () => new TextEncoder().encode(source) });
const page = '<html><body><canvas></canvas></body></html>';
async function collect(files: PreflightFile[]) { return collectTextEvidence(files, await platformPreflight(files)); }

test('collects decoded script literals, modules, inline handlers, template and HTML data', async () => {
  const result = await collect([
    file('index.html', page.replace('<canvas>', '<p aria-label="Join">Hello &amp; welcome</p><template><b>Later screen</b></template><button onclick="show(\'Menu\')">Start</button><script type="importmap">{"imports":{}}</script><canvas>')),
    file('game.js', 'import x from "three"; const a="\\u0050lay"; const b=`Buy ${x} coins`; import("three");'),
    file('config.json', '{"story":"A long quest"}'),
  ]);
  assert.equal(result.complete, true);
  const texts = result.records.map(row => row.text);
  for (const value of ['Hello & welcome', 'Later screen', 'aria-label=Join', 'Menu', 'Play', 'Buy ', ' coins', '{"imports":{}}', '{"story":"A long quest"}']) assert.ok(texts.includes(value), value);
  assert.ok(result.records.some(row => row.kind === 'module' && row.text === 'three'));
  assert.equal(result.files.length, 3);
});

test('no raw source escapes when authoritative credential checks fail', async () => {
  const result = await collect([file('index.html', page), file('game.js', 'const key="AKIAABCDEFGHIJKLMNOP";')]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.reasons, ['preflight_not_clear']);
});

test('unparseable scripts cannot produce a partial successful document', async () => {
  const result = await collect([file('index.html', page), file('game.js', 'window.???("hidden");')]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.records, []);
  assert.ok(result.reasons.includes('script_parse'));
});

test('long strings split without dropping text or breaking a surrogate pair', async () => {
  const source = 'x'.repeat(LIMITS.platform.textReview.recordCharsMax - 1) + '🌒finish';
  const result = await collect([file('index.html', page), file('game.js', `const s=${JSON.stringify(source)}`)]);
  assert.equal(result.complete, true);
  const parts = result.records.filter(row => row.kind === 'script-string');
  assert.equal(parts.map(row => row.text).join(''), source);
  assert.deepEqual(parts.map(row => row.part), [0, 1]);
  assert.equal(parts[0].text.length, LIMITS.platform.textReview.recordCharsMax - 1);
});

test('over budget evidence is unavailable, never a silently clipped pass', async () => {
  const result = await collect([file('index.html', page), file('game.js', `const s="${'x'.repeat(LIMITS.platform.textReview.sourceCharsMax + 1)}";`)]);
  assert.equal(result.complete, false);
  assert.ok(result.reasons.includes('source_limit'));
  assert.deepEqual(result.records, []);
});

test('binary files are inventoried without being decoded and do not prevent completion', async () => {
  const result = await collect([file('index.html', page), { path: 'image.png', size: 100, bytes: async () => new Uint8Array([137,80,78,71,13,10,26,10]), text: async () => { throw Error('binary'); } }]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.files.find(row => row.path === 'image.png'), { path: 'image.png', required: false, inspected: false });
});

test('decoded credentials are checked before records are retained', async () => {
  const result = await collect([file('index.html', page), file('game.js', 'const key="\\x41KIAABCDEFGHIJKLMNOP";')]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.records, []);
  assert.ok(result.reasons.includes('decoded_credential'));
  assert.deepEqual(result.credentialPaths, ['game.js']);
  assert.ok(!JSON.stringify(result).includes('ABCDEFGHIJKLMNOP'));
  const html = await collect([file('index.html', page.replace('<canvas>', '<p>&#65;KIAABCDEFGHIJKLMNOP</p><canvas>'))]);
  assert.equal(html.complete, false);
  assert.deepEqual(html.records, []);
});

test('Unity fallback scripts expose escaped credentials only to the private decoded check', async () => {
  for (const encode of [gzipSync, brotliCompressSync]) {
    const path = 'Build/game.framework.js.unityweb';
    const source = 'const key="\\x41KIAABCDEFGHIJKLMNOP";';
    const bytes = encode(Buffer.from(source));
    const files = [file('index.html', page),
      file('Build/game.loader.js', 'function createUnityInstance() {}'),
      { path, size: bytes.length, bytes: async () => bytes, text: async () => bytes.toString('latin1'),
        decodedText: compressedTextReaders()(path, bytes.length, async () => bytes) }];
    const preflight = await platformPreflight(files);
    assert.equal(preflight.ok, true, JSON.stringify(preflight.findings));
    assert.equal(preflight.credentialScan?.complete, true);
    const result = await collectTextEvidence(files, preflight);
    assert.equal(result.complete, false);
    assert.ok(result.reasons.includes('decoded_credential'));
    assert.deepEqual(result.credentialPaths, [path]);
    assert.deepEqual(result.records, []);
    assert.ok(!JSON.stringify(result).includes('ABCDEFGHIJKLMNOP'));
  }
});

test('text coverage includes csv, gltf and extensionless resources', async () => {
  const result = await collect([file('index.html', page), file('dialogue.csv', 'character,line\nhero,Hello'),
    file('scene.gltf', '{"extras":{"story":"Rescue the village"}}'), file('dialogue', 'Buy your first spaceship')]);
  assert.equal(result.complete, true);
  for (const path of ['dialogue.csv', 'scene.gltf', 'dialogue']) {
    assert.ok(result.records.some(row => row.path === path));
    assert.equal(result.files.find(row => row.path === path)?.inspected, true);
  }
});


test('binary suffixes cannot hide renamed text or ASCII FBX', async () => {
  const result = await collect([file('index.html', page), file('dialogue.bin', 'Buy currency'),
    file('scene.fbx', '; FBX 7.4.0 project file'), file('pretend.png', 'Login to claim a reward')]);
  assert.equal(result.complete, true);
  for (const path of ['dialogue.bin', 'scene.fbx', 'pretend.png']) assert.ok(result.records.some(row => row.path === path));
});

test('unknown binary encoding is explicitly incomplete rather than silently omitted', async () => {
  const result = await collect([file('index.html', page), { path: 'opaque.bin', size: 2,
    bytes: async () => new Uint8Array([255, 255]),
    text: async () => new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([255, 255])),
  }]);
  assert.equal(result.complete, false);
  assert.ok(result.reasons.includes('source_encoding'));
  assert.deepEqual(result.records, []);
});


test('text-decodable content is retained even with a recognizable binary prefix', async () => {
  const result = await collect([file('index.html', page), file('dialogue.mp3', 'ID3Buy currency')]);
  assert.equal(result.complete, true);
  assert.ok(result.records.some(row => row.text === 'ID3Buy currency'));
  assert.equal(result.files.find(row => row.path === 'dialogue.mp3')?.required, true);
});

function rawMovie(): PreflightFile {
  const bytes = Buffer.concat([Buffer.from('FWS\x09'), Buffer.alloc(4),
    Buffer.from([0x30, 0x0a, 0, 0xa0, 0, 12, 1, 0, 0x40, 0, 0, 0])]);
  bytes.writeUInt32LE(bytes.length, 4);
  return { path: 'game.swf', size: bytes.length, bytes: async () => bytes, text: async () => bytes.toString('utf8') };
}

test('a complete raw parser receipt permits accompanying text without passing raw credentials', async () => {
  const files = [rawMovie(), file('index.html', page), file('game.js', 'const text="Play";')];
  const preflight = await platformPreflight(files);
  assert.equal(preflight.ok, true, JSON.stringify(preflight.findings));
  assert.equal(preflight.credentialScan?.complete, false);
  assert.equal(preflight.checks.secrets, 'inconclusive');
  const result = await collectTextEvidence(files, preflight);
  assert.equal(result.complete, true);
  assert.ok(result.records.some(row => row.text === 'Play'));
  assert.deepEqual(result.files.find(row => row.path === 'game.swf'), { path: 'game.swf', required: false, inspected: false });
  assert.equal(preflight.credentialScan?.complete, false);
  assert.equal(preflight.checks.secrets, 'inconclusive');
});

test('raw-inconclusive collection still detects escaped credentials in ordinary scripts', async () => {
  const files = [rawMovie(), file('index.html', page), file('game.js', 'const secret="\\x41KIAABCDEFGHIJKLMNOP";')];
  const preflight = await platformPreflight(files);
  const result = await collectTextEvidence(files, preflight);
  assert.equal(result.complete, false);
  assert.deepEqual(result.credentialPaths, ['game.js']);
  assert.ok(result.reasons.includes('decoded_credential'));
  assert.deepEqual(result.records, []);
});

test('raw collection exception requires every receipt, count and required text read', async () => {
  const files = [rawMovie(), file('index.html', page), file('game.js', 'const text="Play";')];
  const base = await platformPreflight(files);
  for (const corrupt of [
    (p: typeof base) => { p.rawRuntimes = []; },
    (p: typeof base) => { p.rawRuntimes![0].complete = false; },
    (p: typeof base) => { p.rawRuntimes![0].manualReviewRequired = true; },
    (p: typeof base) => { p.rawRuntimes![0].bytes++; },
    (p: typeof base) => { p.credentialScan!.expectedFiles++; },
    (p: typeof base) => { p.credentialScan!.files.find(row => row.path === 'game.js')!.inspected = false; },
    (p: typeof base) => { p.credentialScan!.blocked = true; },
    (p: typeof base) => { p.findings.push({ code: 'fixture', severity: 'blocker', title: 'Held' }); },
  ]) {
    const changed = structuredClone(base);
    corrupt(changed);
    const result = await collectTextEvidence(files, changed);
    assert.equal(result.complete, false);
    assert.deepEqual(result.reasons, ['preflight_not_clear']);
    assert.deepEqual(result.records, []);
  }
});

test('verified external content is explicitly deferred without reading it into a JS string', async () => {
  const payload = Buffer.from([0, 1, 2, 3]);
  const external = { path: 'Build/game.data', sha256: createHash('sha256').update(payload).digest('hex'), byteSize: payload.length };
  const files: PreflightFile[] = [file('index.html', page),
    file('Build/game.loader.js', 'function createUnityInstance() {}'),
    { path: external.path, size: payload.length,
      bytes: async () => { throw new Error('must not read deferred payload'); },
      text: async () => { throw new Error('must not decode deferred payload'); } }];
  const result = await platformPreflight(files, { externalAssets: [external] });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.credentialScan?.complete, false);
  const evidence = await collectTextEvidence(files, result);
  assert.equal(evidence.complete, true);
  assert.deepEqual(evidence.externalAssetsDeferred, [external]);
  assert.deepEqual(evidence.files.find(row => row.path === external.path), { path: external.path, required: false, inspected: false });
  assert.equal(result.checks.secrets, 'inconclusive');
  for (const corrupt of [
    (p: typeof result) => { p.externalAssets![0].byteSize++; },
    (p: typeof result) => { p.externalAssets![0].sha256 = 'invalid'; },
    (p: typeof result) => { p.credentialScan!.inspectedFiles++; },
    (p: typeof result) => { p.credentialScan!.files.find(row => row.path === 'Build/game.loader.js')!.inspected = false; },
  ]) {
    const changed = structuredClone(result);
    corrupt(changed);
    const held = await collectTextEvidence(files, changed);
    assert.equal(held.complete, false);
    assert.deepEqual(held.reasons, ['preflight_not_clear']);
  }
});

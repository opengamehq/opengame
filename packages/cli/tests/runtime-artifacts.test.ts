import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { prepareRuntimeAssets, validateRuntimeCatalog, validateDeclaredRuntimes, runtimeArtifactSession } from '../src/runtime-artifacts';
import { vendorDependencies } from '../src/vendor';
import { ENGINE_CONTRACT, startDevServer } from '../src/dev';
import { runPreflight, snapshotPreflightFiles, matchedRawRuntime } from '../src/preflight';
import { rawMovie } from './raw-fixtures';
import { runtimeFixture, publishedRuntimeFixture } from './runtime-fixtures';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const page = '<!doctype html><html><head></head><body></body></html>';
async function rawSource(path = 'A & B.swf') {
  const snapshot = new Map([[path, rawMovie()]]);
  const raw = matchedRawRuntime(await runPreflight(snapshotPreflightFiles(snapshot)), snapshot)!;
  assert.ok(raw);
  return { snapshot, raw };
}
function get(url: string) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; bytes: Buffer }>((resolve, reject) => {
    request(url, res => { const chunks: Buffer[] = []; res.on('data', data => chunks.push(data)); res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, bytes: Buffer.concat(chunks) })); }).on('error', reject).end();
  });
}

test('catalog rejects stale version, missing companion metadata, duplicate paths and altered shell identity', async () => {
  for (const mutate of [
    (c: any) => { c.inventory.runtimes[0].version = '0.0.0'; },
    (c: any) => { c.inventory.runtimes.pop(); },
    (c: any) => { c.inventory.runtimes[0].files.push(c.inventory.runtimes[0].files[0]); },
    (c: any) => { c.inventory.runtimes[0].licenses[0].sha256 = '0'.repeat(64); },
    (c: any) => { c.inventory.shells.files[0].sourceSha256 = '0'.repeat(64); },
  ]) { const catalog = structuredClone(runtimeFixture().catalog); mutate(catalog); await assert.rejects(validateRuntimeCatalog(catalog)); }
});

test('raw shell preserves source identity and canonical script bytes, options and full companions', async () => {
  const { snapshot, raw } = await rawSource(); const artifacts = runtimeFixture();
  const pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'ruffle')!;
  const result = await prepareRuntimeAssets(snapshot, { references: [], raw, artifacts,
    runtimes: [{ id: 'ruffle', version: pin.version as '0.7.1', options: { letterbox: 'on', autoplay: 'off' } }] });
  assert.equal(snapshot.size, 1); assert.equal(result.files.size, pin.files.length + 2);
  const html = Buffer.from(result.files.get('index.html')!).toString();
  assert.match(html, /A%20%26%20B.swf/); assert.match(html, /"letterbox":"on"/);
  assert.deepEqual(result.files.get('_og/runtime-shell.js'), await artifacts.shell(artifacts.catalog.inventory.shells.files.find(row => row.target === '_og/runtime-shell.js')!));
  for (const row of pin.files) assert.equal(hash(result.files.get(row.path)!), row.sha256);
  assert.equal(result.receipts[0]!.source!.path, raw.path);
});

test('vendor translates exact aliases and keeps artifact and staged hashes without a CDN request', async () => {
  const artifacts = runtimeFixture(), pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!;
  const url = `https://unpkg.com/wasmoon@${pin.version}/dist/index.js`;
  const snapshot = new Map([['index.html', Buffer.from(`<script src="${url}"></script>`)]]);
  const receipts = await vendorDependencies(snapshot, { artifacts, fetchBytes: async () => { throw new Error('CDN must not be requested'); } });
  assert.match(snapshot.get('index.html')!.toString(), /\.opengame-vendor\/runtime\/wasmoon@/);
  const receipt = receipts.find(row => 'runtime' in row)!;
  assert.ok(receipt); assert.equal((receipt as any).files.length, pin.files.length);
  const script = (receipt as any).files.find((row: any) => row.path.endsWith('/index.js'));
  assert.notEqual(script.sha256, script.stagedSha256);
  assert.equal(snapshot.has(`.opengame-vendor/runtime/wasmoon@${pin.version}/NOTICE.txt`), true);
});

test('unknown pins, unresolved source, absent companions, tampered bytes and collisions fail without mutating input', async () => {
  for (const variant of ['version', 'legal', 'missing', 'digest', 'collision']) {
    const artifacts = runtimeFixture(), pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'ruffle')!;
    const snapshot = new Map([['index.html', Buffer.from(page)]]);
    let reference = pin.prefix + 'ruffle.js';
    if (variant === 'version') reference = '/_og/runtime/ruffle@0.0.0/ruffle.js';
    if (variant === 'legal') reference = '/' + artifacts.catalog.inventory.runtimes.find(row => row.id === 'jsdos')!.files[0]!.path;
    if (variant === 'missing' || variant === 'digest') {
      const acquire = artifacts.acquire;
      artifacts.acquire = async runtime => { const files = await acquire(runtime); if (variant === 'missing') files.delete(runtime.files[0]!.path); else files.set(runtime.files[0]!.path, Buffer.from('bad')); return files; };
    }
    if (variant === 'collision') snapshot.set('.opengame-vendor/runtime/ruffle@' + pin.version + '/ruffle.js', Buffer.from('existing'));
    const before = [...snapshot];
    await assert.rejects(prepareRuntimeAssets(snapshot, { references: [reference], vendor: true, artifacts }), { code: variant === 'version' ? 'runtime_reference' : variant === 'legal' ? 'runtime_source_unresolved' : variant === 'collision' ? 'vendor_collision' : 'runtime_artifact_missing' });
    assert.deepEqual([...snapshot], before);
  }
});

test('local dev serves parsed raw and companion bytes under the 2027 isolation headers without an SDK when opted out', async () => {
  const { snapshot } = await rawSource(); const artifacts = runtimeFixture();
  const server = await startDevServer({ snapshot, artifacts, contract: ENGINE_CONTRACT });
  try {
    const root = await get(server.url);
    assert.equal(root.status, 200); assert.equal(root.headers['cross-origin-opener-policy'], 'same-origin'); assert.equal(root.headers['cross-origin-embedder-policy'], 'require-corp');
    assert.doesNotMatch(root.bytes.toString(), /_og\/sdk.js/);
    // The rendered shell is a document of the derived tree, so it carries the host runtime as live.
    assert.match(root.bytes.toString(), /_og\/host.js/);
    assert.equal((await get(server.url + '/_og/runtime-shell.js')).status, 200);
    const pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'ruffle')!;
    const asset = await get(server.url + pin.prefix + 'companion.wasm'); assert.equal(asset.status, 200);
    assert.equal(asset.headers['content-type'], 'application/wasm');
    assert.equal(snapshot.has('index.html'), false);
  } finally { await server.close(); }
});

test('a tampered canonical shell is refused and cannot change the source tree', async () => {
  const { snapshot, raw } = await rawSource();
  const artifacts = runtimeFixture();
  artifacts.shell = async () => Buffer.from('another renderer');
  await assert.rejects(prepareRuntimeAssets(snapshot, { references: [], raw, artifacts }), { code: 'runtime_artifact_missing' });
  assert.deepEqual([...snapshot.keys()], [raw.path]);
});

test('explicit manifest selection copies companions even without a static reference', async () => {
  const artifacts = runtimeFixture(), pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!;
  const snapshot = new Map([['index.html', Buffer.from(page)]]);
  const result = await prepareRuntimeAssets(snapshot, { references: [], artifacts, runtimes: [{ id: 'wasmoon', version: pin.version as '1.16.0' }] });
  assert.equal(result.files.size, pin.files.length);
  assert.equal(result.receipts[0]!.runtime, 'wasmoon');
  assert.equal(snapshot.size, 1);
});

test('runtime localization preserves SRI refusal instead of serving bytes the page will reject', async () => {
  const artifacts = runtimeFixture(), pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!;
  const url = `https://unpkg.com/wasmoon@${pin.version}/dist/index.js`;
  const snapshot = new Map([['index.html', Buffer.from(`<script src="${url}" integrity="sha256-AAAA"></script>`)]]);
  await assert.rejects(startDevServer({ snapshot, artifacts }), { code: 'vendor_integrity' });
});

test('directory aliases are refused before they can become broken script URLs', async () => {
  const artifacts = runtimeFixture(), pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!;
  for (const reference of [pin.prefix, `https://unpkg.com/wasmoon@${pin.version}/`]) {
    await assert.rejects(prepareRuntimeAssets(new Map(), { references: [reference], artifacts }), { code: 'runtime_reference' });
  }
});

test('a raw Ruffle receipt and its shell stay attached to Ruffle with another runtime selected first', async () => {
  const { snapshot, raw } = await rawSource(); const artifacts = runtimeFixture();
  const wasmoon = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!;
  const result = await prepareRuntimeAssets(snapshot, { references: [], raw, artifacts,
    runtimes: [{ id: 'wasmoon', version: wasmoon.version as '1.16.0' }] });
  const other = result.receipts.find(row => row.runtime === 'wasmoon')!;
  const ruffle = result.receipts.find(row => row.runtime === 'ruffle')!;
  assert.equal(other.source, undefined); assert.equal(other.files.some(row => row.destination === 'index.html'), false);
  assert.equal(ruffle.source!.path, raw.path); assert.equal(ruffle.files.some(row => row.destination === 'index.html'), true);
});

test('new aliases found recursively reuse the operation runtime acquisition', async () => {
  const artifacts = runtimeFixture(), pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!;
  const original = artifacts.acquire; let calls = 0;
  artifacts.acquire = async runtime => { calls++; return original(runtime); };
  const prefix = `https://unpkg.com/wasmoon@${pin.version}/dist/`;
  const base = 'https://cdn.jsdelivr.net/npm/three@1.2.3/';
  const snapshot = new Map([['index.html', Buffer.from(`<script src="${prefix}index.js"></script><script src="${base}main.js"></script>`)]]);
  await vendorDependencies(snapshot, { artifacts, fetchBytes: async url => {
    if (url === base + 'package.json') return Buffer.from('{"name":"three","version":"1.2.3","license":"MIT"}');
    if (url === base + 'LICENSE') return Buffer.from('MIT fixture');
    if (url === base + 'main.js') return Buffer.from(`import '${prefix}companion.wasm';`);
    throw new Error('unexpected source: ' + url);
  } });
  assert.equal(calls, 1);
});

test('ordinary check rejects blocked declarations and labels permitted acquisition as deferred', async () => {
  const { inspectArchive } = await import('../src/archive');
  const { tempDir, manifest } = await import('./shell');
  const { Output } = await import('../src/output');
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = await tempDir('og-runtime-declaration-'), artifacts = runtimeFixture();
  try {
    await writeFile(join(dir.dir, 'index.html'), page);
    const jsdos = artifacts.catalog.inventory.runtimes.find(row => row.id === 'jsdos')!;
    await assert.rejects(inspectArchive(dir.dir, { ...manifest, runtimes: [{ id: 'jsdos', version: jsdos.version }] } as any, new Output(true, () => {}), { artifacts }), { code: 'runtime_source_unresolved' });
    const wasmoon = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!; const messages: string[] = [];
    await inspectArchive(dir.dir, { ...manifest, runtimes: [{ id: 'wasmoon', version: wasmoon.version }] } as any, new Output(true, value => { messages.push(value); }), { artifacts });
    assert.ok(messages.some(value => value.includes('runtime_acquisition_deferred')));
    assert.deepEqual(await (await import('node:fs/promises')).readdir(dir.dir), ['index.html']);
  } finally { await dir.remove(); }
});

test('reserved runtime paths cannot be hidden under a stripped export root', async () => {
  const { inspectArchive } = await import('../src/archive'); const { tempDir, manifest } = await import('./shell'); const { Output } = await import('../src/output');
  const { mkdir, writeFile } = await import('node:fs/promises'); const { join } = await import('node:path');
  const dir = await tempDir('og-runtime-reserved-');
  try {
    await mkdir(join(dir.dir, 'nested/_og'), { recursive: true });
    await writeFile(join(dir.dir, 'nested/index.html'), page);
    await writeFile(join(dir.dir, 'nested/_og/own.js'), 'self.bad=1;');
    for (const vendor of [false, true]) await assert.rejects(inspectArchive(dir.dir, manifest as any, new Output(true, () => {}), { vendor }), { code: 'reserved_runtime_path' });
  } finally { await dir.remove(); }
});

test('dev discovers and serves a retained runtime referenced from uppercase JS', async () => {
  const artifacts = runtimeFixture(), pin = artifacts.catalog.inventory.runtimes.find(row => row.id === 'wasmoon')!;
  const snapshot = new Map([
    ['index.html', Buffer.from('<script type="module" src="boot.JS"></script>')],
    ['boot.JS', Buffer.from(`import 'https://unpkg.com/wasmoon@${pin.version}/dist/index.js';`)],
  ]);
  const server = await startDevServer({ snapshot, artifacts });
  try {
    const script = await get(server.url + '/boot.JS');
    assert.match(script.bytes.toString(), /import "\/_og\/runtime\/wasmoon@/);
    assert.equal((await get(server.url + pin.prefix + 'index.js')).status, 200);
  } finally { await server.close(); }
});

test('vendor relocation never rewrites a raw source path containing the runtime segment', async () => {
  const { snapshot, raw } = await rawSource('assets/_og/runtime/game.swf');
  const artifacts = runtimeFixture();
  const result = await prepareRuntimeAssets(snapshot, { references: [], raw, vendor: true, artifacts });
  const html = Buffer.from(result.files.get('index.html')!).toString();
  const block = /id="og-runtime-settings" type="application\/json">([^<]+)<\/script>/.exec(html)!;
  assert.ok(block);
  const config = JSON.parse(block[1]!);
  assert.equal(config.source, '/assets/_og/runtime/game.swf');
  assert.match(config.prefix, /^\/\.opengame-vendor\/runtime\/ruffle@/);
  assert.ok(snapshot.has('assets/_og/runtime/game.swf'));
  assert.equal(result.receipts.find(row => row.runtime === 'ruffle')!.source!.path, 'assets/_og/runtime/game.swf');
});

test('the actual transport wrapper charges bytes across requests and keeps an expired operation off the network', async () => {
  const { boundedRuntimeFetcher } = await import('../src/runtime-artifacts');
  const { Response } = await import('undici');
  const bounds = runtimeFixture().catalog.config.bounds;
  const url = 'https://registry.npmjs.org/pinned-runtime.tgz';
  const budget = { bytes: bounds.expandedBytesMax - 2, deadline: Date.now() + bounds.timeoutMs };
  let requests = 0;
  const fetcher = boundedRuntimeFetcher(new Set([url]), bounds, budget, async (_url, options) => {
    requests++; assert.equal(options?.redirect, 'error');
    return new Response(new Uint8Array(2));
  });
  await fetcher(url, {});
  assert.equal(budget.bytes, bounds.expandedBytesMax);
  await assert.rejects(fetcher(url, {}), /runtime download bound/);
  assert.equal(requests, 2);
  budget.deadline = Date.now() - 1;
  await assert.rejects(fetcher(url, {}), /runtime acquisition boundary/);
  budget.deadline = Date.now() + bounds.timeoutMs;
  await assert.rejects(fetcher('https://unapproved.invalid/file', {}), /runtime acquisition boundary/);
  assert.equal(requests, 2);
});


test('prepared unpublished source rows load but declaration, custom acquisition and staging remain blocked', async () => {
  const artifacts = runtimeFixture();
  await validateRuntimeCatalog(artifacts.catalog);
  let calls = 0;
  artifacts.acquire = async () => { calls++; throw new Error('must not acquire'); };
  const session = await runtimeArtifactSession(artifacts)();
  for (const id of ['pyodide', 'flutter-canvaskit', 'jsdos']) {
    const runtime = artifacts.catalog.inventory.runtimes.find(row => row.id === id)!;
    await assert.rejects(validateDeclaredRuntimes([{ id, version: runtime.version }] as any, artifacts), { code: 'runtime_source_unresolved' });
    await assert.rejects(session.acquire(runtime), { code: 'runtime_source_unresolved' });
    for (const vendor of [false, true]) {
      const snapshot = new Map([['index.html', Buffer.from(page)]]);
      await assert.rejects(prepareRuntimeAssets(snapshot, { references: [runtime.prefix + runtime.files[0]!.path.slice(runtime.prefix.length - 1)], artifacts, vendor }), { code: 'runtime_source_unresolved' });
      assert.deepEqual([...snapshot.keys()], ['index.html']);
    }
  }
  assert.equal(calls, 0);
});

test('a complete synthetic publication passes the unchanged canonical gate without adding a source archive to the game', async t => {
  const { cli, artifacts, entries } = await publishedRuntimeFixture(t);
  await cli.validateRuntimeCatalog(artifacts.catalog);
  for (const entry of entries) {
    const runtime = artifacts.catalog.inventory.runtimes.find(row => row.id === entry.runtime)!;
    const runtimes = [{ id: runtime.id, version: runtime.version }];
    await cli.validateDeclaredRuntimes(runtimes, artifacts);
    for (const vendor of [false, true]) {
      const snapshot = new Map([['index.html', Buffer.from(page)]]);
      const result = await cli.prepareRuntimeAssets(snapshot, { references: [], artifacts, runtimes, vendor });
      const destination = (path: string) => vendor ? path.replace(/^_og\/runtime\//, '.opengame-vendor/runtime/') : path;
      assert.deepEqual([...result.files.keys()].sort(), runtime.files.map(row => destination(row.path)).sort());
      assert.deepEqual([...snapshot.keys()], ['index.html']);
      assert.ok(result.files.has(destination(runtime.prefix.slice(1) + 'SOURCE.txt')));
      assert.ok([...result.files.keys()].every(path => !path.startsWith('runtimes/sources/') && !path.endsWith('.tar.gz')));
      const receipt = result.receipts[0];
      assert.deepEqual(receipt.sourceDistribution, runtime.sourceDistribution);
      assert.deepEqual(receipt.archive, runtime.archive);
      assert.deepEqual(receipt.licenses, runtime.licenses);
      const script = receipt.files.find((row: any) => row.path.endsWith('/main.js'));
      assert.equal(script.sourceSha256, entry.runtimeFiles[0]!.sourceSha256);
      assert.equal(script.sha256, entry.runtimeFiles[0]!.sha256);
      assert.equal(script.stagedSha256, hash(result.files.get(script.destination)!));
      if (vendor) assert.notEqual(script.stagedSha256, script.sha256);
    }
    const upload = new Map([['index.html', Buffer.from(page)]]);
    const receipts = await cli.vendorDependencies(upload, { artifacts, runtimes,
      fetchBytes: async () => { throw new Error('Source archive must never be fetched'); } });
    assert.deepEqual([...upload.keys()].sort(), ['index.html', ...runtime.files.map(row => row.path.replace(/^_og\/runtime\//, '.opengame-vendor/runtime/'))].sort());
    assert.deepEqual(receipts.find((row: any) => row.runtime === runtime.id).sourceDistribution, runtime.sourceDistribution);
  }
  const jsdos = artifacts.catalog.inventory.runtimes.find(row => row.id === 'jsdos')!;
  await assert.rejects(cli.validateDeclaredRuntimes([{ id: jsdos.id, version: jsdos.version }], artifacts), { code: 'runtime_source_unresolved' });
  await assert.rejects(cli.prepareRuntimeAssets(new Map(), { references: [], artifacts, runtimes: [{ id: jsdos.id, version: jsdos.version }] }), { code: 'runtime_source_unresolved' });
});

test('synthetic published receipt rejects changed identities and publication before an injected acquirer runs', async t => {
  const { cli, artifacts } = await publishedRuntimeFixture(t);
  const id = 'pyodide';
  const changes: Array<[string, (runtime: any, catalog: any) => void]> = [
    ['missing publication', runtime => { runtime.sourceDistribution.publication = null; }],
    ['wrong public URL', runtime => { runtime.sourceDistribution.publication.publicDownload.url += '?temporary=1'; }],
    ['wrong published hash', runtime => { runtime.sourceDistribution.publication.publicDownload.sha256 = '0'.repeat(64); }],
    ['wrong stored object', runtime => { runtime.sourceDistribution.publication.object.key += '-different'; }],
    ['incomplete inspection', runtime => { runtime.sourceDistribution.publication.inspectionComplete = false; }],
    ['original member', runtime => { runtime.files[0].sourceSha256 = '0'.repeat(64); }],
    ['final member', runtime => { runtime.files[0].sha256 = '0'.repeat(64); }],
    ['upstream archive', runtime => { runtime.archive.sha256 = '0'.repeat(64); }],
    ['notice', runtime => { runtime.files.find((row: any) => row.path.endsWith('/NOTICE.txt')).sha256 = '0'.repeat(64); }],
    ['source index', runtime => { runtime.files.find((row: any) => row.path.endsWith('/SOURCE.txt')).sha256 = '0'.repeat(64); }],
    ['source URL', runtime => { runtime.sourceDistribution.companion.url += '?temporary=1'; }],
    ['extra source archive', runtime => { runtime.files.push({ ...runtime.files[0], path: runtime.prefix.slice(1) + 'source.tar.gz' }); }],
    ['snapshot publication', (_runtime, catalog) => { catalog.inventory.sourceDistributions.publications = []; }],
    ['snapshot entry', (_runtime, catalog) => { catalog.inventory.sourceDistributions.entries[0].companion.url += '?temporary=1'; }],
  ];
  for (const [name, change] of changes) {
    const catalog = structuredClone(artifacts.catalog);
    const runtime = catalog.inventory.runtimes.find(row => row.id === id)!;
    change(runtime, catalog);
    let calls = 0;
    const altered = { ...artifacts, catalog, acquire: async () => { calls++; throw new Error('must not acquire'); } };
    await assert.rejects(cli.validateDeclaredRuntimes([{ id, version: runtime.version }], altered), undefined, name);
    await assert.rejects(cli.prepareRuntimeAssets(new Map(), { references: [runtime.prefix + 'main.js'], artifacts: altered }), undefined, name);
    assert.equal(calls, 0, name);
  }
  // A cached custom acquirer must recheck the actual passed receipt as well.
  let calls = 0;
  const session = await cli.runtimeArtifactSession({ ...artifacts, acquire: async () => { calls++; return new Map(); } })();
  const valid = artifacts.catalog.inventory.runtimes.find(row => row.id === id)!;
  await session.acquire(valid);
  const altered = structuredClone(valid);
  altered.sourceDistribution!.publication!.publicDownload.url += '?changed';
  await assert.rejects(session.acquire(altered), { code: 'runtime_source_unresolved' });
  assert.equal(calls, 1);
});

import { createHash } from 'node:crypto';
import { LIMITS } from '@opengame/shared';
import { sourceDistributions, sourceDistributionRecord } from '../../../scripts/engine-runtimes/source-distribution.mjs';
import { runtimeShellArtifacts, renderRuntimeShell } from '../../../scripts/engine-runtimes/shells.mjs';
import type { RuntimeArtifacts, RuntimeCatalog } from '../src/runtime-artifacts';

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
/** Synthetic companions test plumbing, never compatibility or legal clearance.
 * Shells are the actual producer templates, so another CLI renderer cannot pass. */
export function runtimeFixture(): RuntimeArtifacts {
  const data = new Map<string, Uint8Array>();
  const shells = runtimeShellArtifacts();
  const sources = sourceDistributions();
  const runtimes = Object.entries(LIMITS.platform.engineRuntimes.runtimes).map(([id, pin]) => {
    const prefix = `/_og/runtime/${id}@${pin.version}/`;
    const entry = sources.entries.find((row: any) => row.runtime === id);
    if (entry) return { id, version: pin.version, prefix, license: pin.license,
      archive: { url: `https://registry.npmjs.org/fixture-${id}.tgz`, sha256: pin.sha256 },
      licenses: entry.notices.map((row: any) => ({ path: row.path, bytes: row.bytes, sha256: row.sha256, source: 'fixture' })),
      sourceDistribution: sourceDistributionRecord(entry),
      files: [...entry.runtimeFiles, ...entry.notices, entry.sourceIndex].map((row: any) => ({ ...row, path: prefix.slice(1) + row.path })) };
    const primary = id === 'ruffle' ? 'ruffle.js' : id === 'wasmoon' ? 'index.js' : 'main.js';
    const files = [primary, 'companion.wasm', 'NOTICE.txt'].map(path => {
      const bytes = Buffer.from(path === primary ? `globalThis.fixture = '${prefix}companion.wasm';` : path === 'NOTICE.txt' ? 'fixture notice' : '\0asm\x01\0\0\0');
      data.set(prefix.slice(1) + path, bytes);
      return { path: prefix.slice(1) + path, sha256: hash(bytes), sourceSha256: hash(bytes), bytes: bytes.length };
    });
    const notice = files.find(row => row.path.endsWith('/NOTICE.txt'))!;
    return { id, version: pin.version, prefix, license: pin.license,
      archive: { url: `https://registry.npmjs.org/fixture-${id}.tgz`, sha256: pin.sha256 },
      licenses: [{ path: 'NOTICE.txt', sha256: notice.sha256, bytes: notice.bytes, source: 'fixture' }], files };
  });
  const catalog = { config: LIMITS.platform.engineRuntimes, inventory: { schemaVersion: 1, runtimes, sourceDistributions: sources, shells: shells.receipt } } as RuntimeCatalog;
  return { catalog, acquire: async runtime => new Map(runtime.files.map(row => [row.path, data.get(row.path) ?? (() => { throw new Error('Prepared source fixture cannot acquire runtime bytes'); })()])), shell: async row => shells.files.get(row.path)!, render: async (settings, templates) => renderRuntimeShell(settings, templates) };
}

/** A private package fixture, not a publication: only JSON inputs to the real
 * producer are replaced. Its validator, serializer and CLI gates are bundled
 * unchanged, so a positive test cannot pass by substituting an always-true gate. */
export async function publishedRuntimeFixture(t: import('node:test').TestContext) {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { build } = await import('esbuild');
  const { sourceIndex, sourceEntryDigest } = await import('../../../scripts/engine-runtimes/source-distribution.mjs');
  const { resolveLockedHttpDependency } = await import('../build.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'og-cli-published-source-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifacts = runtimeFixture();
  const data = new Map<string, Uint8Array>();
  const entries = sourceDistributions().entries.map((original: any) => {
    const { runtime, version, upstreamArchiveSha256 } = original;
    const prefix = `/_og/runtime/${runtime}@${version}/`;
    const final = Buffer.from(`globalThis.sourceFixture = '${prefix}companion.wasm';`);
    const wasm = Buffer.from('\0asm\x01\0\0\0');
    const notice = Buffer.from('synthetic source companion notice\n');
    const archiveHash = hash(Buffer.from(runtime + ' synthetic companion'));
    const key = `runtimes/sources/${runtime}/${version}/${archiveHash}/${runtime}-companion.tar.gz`;
    const entry = { runtime, version, upstreamArchiveSha256,
      runtimeFiles: [
        { path: 'main.js', bytes: final.length, sha256: hash(final), sourceSha256: hash(Buffer.from('original upstream script')) },
        { path: 'companion.wasm', bytes: wasm.length, sha256: hash(wasm), sourceSha256: hash(wasm) },
      ],
      notices: [{ path: 'NOTICE.txt', bytes: notice.length, sha256: hash(notice), companionPath: 'source-delivery/NOTICE.txt' }],
      companion: { key, url: `https://media.opengame.gg/${key}`, sha256: archiveHash, bytes: 128, members: 3,
        expandedBytes: 256, memberManifestSha256: hash(Buffer.from('synthetic member manifest')), memberManifestBytes: 80 },
      sourceIndex: { path: 'SOURCE.txt', bytes: 0, sha256: '' },
    };
    const index = sourceIndex(entry);
    entry.sourceIndex = { path: 'SOURCE.txt', bytes: index.length, sha256: hash(index) };
    for (const [path, bytes] of [['main.js', final], ['companion.wasm', wasm], ['NOTICE.txt', notice], ['SOURCE.txt', index]] as const)
      data.set(prefix.slice(1) + path, bytes);
    return entry;
  });
  const publications = entries.map((entry: any) => ({ schemaVersion: 1, runtime: entry.runtime, version: entry.version,
    catalogEntrySha256: sourceEntryDigest(entry), inspectionSha256: hash(Buffer.from('synthetic complete inspection')),
    inspectionComplete: true, verifiedAt: '2026-10-21T00:00:00.000Z',
    object: { key: entry.companion.key, sha256: entry.companion.sha256, bytes: entry.companion.bytes },
    publicDownload: { url: entry.companion.url, sha256: entry.companion.sha256, bytes: entry.companion.bytes } }));
  artifacts.catalog.inventory.sourceDistributions = { schemaVersion: 1, entries, publications };
  for (const entry of entries) {
    const runtime = artifacts.catalog.inventory.runtimes.find(row => row.id === entry.runtime)!;
    runtime.sourceDistribution = { schemaVersion: 1, catalogEntrySha256: sourceEntryDigest(entry), companion: entry.companion,
      sourceIndex: entry.sourceIndex, publication: publications.find(row => row.runtime === entry.runtime)! };
    runtime.files = [...entry.runtimeFiles, ...entry.notices, entry.sourceIndex].map(row => ({ ...row, path: runtime.prefix.slice(1) + row.path }));
    runtime.licenses = entry.notices.map(row => ({ ...row, source: `companion:${entry.companion.sha256}!/${row.companionPath}` }));
  }
  const ordinaryAcquire = artifacts.acquire;
  artifacts.acquire = async runtime => entries.some(entry => entry.runtime === runtime.id)
    ? new Map(runtime.files.map(row => [row.path, data.get(row.path)!])) : ordinaryAcquire(runtime);

  // These builds execute only when the parent releases the held test lane.
  // No real catalogue/publication file, runtime payload or network is touched.
  await build({ entryPoints: [fileURLToPath(new URL('../runtime-builder.mjs', import.meta.url))],
    outfile: join(directory, 'dist/runtime-builder.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node18',
    plugins: [{ name: 'synthetic-publication-json', setup(builder) {
      builder.onLoad({ filter: /runtime-source-(?:catalog|publications)\.json$/ }, args => ({ loader: 'json',
        contents: JSON.stringify(args.path.endsWith('runtime-source-catalog.json')
          ? { schemaVersion: 1, distributions: entries } : { schemaVersion: 1, publications }) }));
    } }] });
  const http = await resolveLockedHttpDependency();
  await build({ stdin: { contents: "export * from './runtime-artifacts'; export { vendorDependencies } from './vendor';",
      resolveDir: fileURLToPath(new URL('../src/', import.meta.url)), sourcefile: 'runtime-source-fixture.ts', loader: 'ts' },
    outfile: join(directory, 'src/runtime-artifacts.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node18',
    alias: { undici: http.entry },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
  const cli = await import(pathToFileURL(join(directory, 'src/runtime-artifacts.mjs')).href);
  return { cli, artifacts, entries };
}

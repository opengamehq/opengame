import { createHash } from 'node:crypto';
import catalog from '../../packages/shared/runtime-source-catalog.json' with { type: 'json' };
import publications from '../../packages/shared/runtime-source-publications.json' with { type: 'json' };
import noticeBytes from './source-notices.json' with { type: 'json' };
import limits from '../../packages/shared/limits.json' with { type: 'json' };
import { safePath } from './archives.mjs';

const HASH = /^[a-f0-9]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonicalSourceJSON = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const sourceEntryDigest = entry => hash(canonicalSourceJSON(entry));

export function sourceDistributionEntry(id, version) {
  if (catalog.schemaVersion !== 1 || publications.schemaVersion !== 1) throw new Error('Source catalogue version');
  const matches = catalog.distributions.filter(row => row.runtime === id && row.version === version);
  if (matches.length > 1 || ['pyodide', 'flutter-canvaskit'].includes(id) && matches.length !== 1)
    throw new Error('Source catalogue identity');
  const entry = matches[0];
  if (!entry) return;
  const companion = entry.companion;
  const key = `runtimes/sources/${id}/${version}/${companion.sha256}/${id}-companion.tar.gz`;
  if (!HASH.test(entry.upstreamArchiveSha256) || !HASH.test(companion.sha256) ||
      !HASH.test(companion.memberManifestSha256) || companion.key !== key ||
      companion.url !== `https://media.opengame.gg/${key}` ||
      !['bytes', 'members', 'expandedBytes', 'memberManifestBytes'].every(name => Number.isSafeInteger(companion[name]) && companion[name] > 0))
    throw new Error('Source companion identity');
  for (const rows of [entry.runtimeFiles, entry.notices]) {
    const seen = new Set();
    if (!Array.isArray(rows) || !rows.length) throw new Error('Source catalogue files');
    for (const row of rows) {
      safePath(row.path, limits.bundle.pathBytesMax);
      if (!HASH.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || seen.has(row.path.toLowerCase()))
        throw new Error('Source catalogue file identity');
      if (rows === entry.runtimeFiles && !HASH.test(row.sourceSha256)) throw new Error('Source original member identity');
      seen.add(row.path.toLowerCase());
    }
  }
  return entry;
}

export function sourceIndex(entry) {
  return Buffer.from(`OpenGame ${entry.runtime} ${entry.version} source distribution\n\n` +
    `Download the complete source and notice companion without an account:\n${entry.companion.url}\n` +
    `SHA256: ${entry.companion.sha256}\nBytes: ${entry.companion.bytes}\n\n` +
    `Extract the companion and read source-delivery/${entry.runtime}/SOURCE.txt.\n` +
    `Its relative source paths resolve inside that extracted companion.\n` +
    `Companion member manifest SHA256: ${entry.companion.memberManifestSha256}\n` +
    `Upstream runtime archive SHA256: ${entry.upstreamArchiveSha256}\n`);
}

export function sourceDistributionRecord(entry) {
  const digest = sourceEntryDigest(entry);
  const matching = publications.publications.filter(row => row.catalogEntrySha256 === digest);
  if (matching.length > 1) throw new Error('Duplicate source publication');
  const publication = matching[0] ?? null;
  if (publication) validateSourcePublication(entry, publication);
  const index = sourceIndex(entry);
  if (entry.sourceIndex?.path !== 'SOURCE.txt' || entry.sourceIndex.bytes !== index.length || entry.sourceIndex.sha256 !== hash(index))
    throw new Error('Source index catalogue identity');
  return { schemaVersion: 1, catalogEntrySha256: digest, companion: entry.companion,
    sourceIndex: entry.sourceIndex, publication };
}

export function validateSourcePublication(entry, publication) {
  if (!publication || publication.catalogEntrySha256 !== sourceEntryDigest(entry) || publication.schemaVersion !== 1 || publication.runtime !== entry.runtime ||
      publication.version !== entry.version || !HASH.test(publication.inspectionSha256) ||
      publication.inspectionComplete !== true ||
      ['key', 'sha256', 'bytes'].some(key => publication.object?.[key] !== entry.companion[key]) ||
      ['url', 'sha256', 'bytes'].some(key => publication.publicDownload?.[key] !== entry.companion[key]) ||
      typeof publication.verifiedAt !== 'string' || !Number.isFinite(Date.parse(publication.verifiedAt)))
    throw new Error('Source publication identity');
}

/** Only catalogue-selected notice bytes enter a runtime. Source archives never
 * enter the game tree, and an unpublished companion is never an admission proof. */
export function attachSourceDistribution(id, pin, upstream, assets, licenses, bounds) {
  const entry = sourceDistributionEntry(id, pin.version);
  if (!entry) return;
  if (entry.upstreamArchiveSha256 !== pin.sha256 || upstream.size !== entry.runtimeFiles.length)
    throw new Error('Source/runtime archive mismatch');
  for (const row of entry.runtimeFiles) {
    safePath(row.path, bounds.pathBytesMax);
    const original = upstream.get(row.path), final = assets.get(row.path);
    if (!original || !final || final.length !== row.bytes || hash(original) !== row.sourceSha256 || hash(final) !== row.sha256)
      throw new Error('Source/runtime member mismatch');
  }
  const add = (path, bytes) => {
    safePath(path, bounds.pathBytesMax);
    const current = assets.get(path);
    if (current) {
      if (!current.equals(bytes)) throw new Error('Source notice conflicts with runtime');
      return;
    }
    if ([...assets.keys()].some(name => name.toLowerCase() === path.toLowerCase())) throw new Error('Source notice path collision');
    if (bytes.length > bounds.fileBytesMax || assets.size >= bounds.fileCountMax ||
        [...assets.values()].reduce((total, value) => total + value.length, bytes.length) > bounds.expandedBytesMax)
      throw new Error('Source notices exceed runtime bounds');
    assets.set(path, bytes);
  };
  for (const row of entry.notices) {
    const current = assets.get(row.path);
    const encoded = current ? undefined : noticeBytes[row.sha256];
    if (!current && (typeof encoded !== 'string' || encoded.length !== 4 * Math.ceil(row.bytes / 3)))
      throw new Error('Missing source notice');
    const bytes = current ?? Buffer.from(encoded, 'base64');
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256 || encoded && bytes.toString('base64') !== encoded || bytes.includes(0))
      throw new Error('Source notice identity');
    add(row.path, bytes);
    if (!licenses.some(license => license.path === row.path)) licenses.push({ path: row.path, sha256: row.sha256,
      bytes: row.bytes, source: `companion:${entry.companion.sha256}!/${row.companionPath}` });
  }
  add('SOURCE.txt', sourceIndex(entry));
  return sourceDistributionRecord(entry);
}

export function validateSourceDistributionReceipt(runtime, { requirePublished = true } = {}) {
  const entry = sourceDistributionEntry(runtime.id, runtime.version);
  if (!entry) return;
  if (runtime.archive?.sha256 !== entry.upstreamArchiveSha256 ||
      canonicalSourceJSON(runtime.sourceDistribution) !== canonicalSourceJSON(sourceDistributionRecord(entry)))
    throw new Error('Source distribution receipt mismatch');
  const expected = [...entry.runtimeFiles, ...entry.notices,
    { path: 'SOURCE.txt', bytes: sourceIndex(entry).length, sha256: hash(sourceIndex(entry)) }];
  if (runtime.prefix !== `/_og/runtime/${entry.runtime}@${entry.version}/` || runtime.files.length !== expected.length)
    throw new Error('Source distribution file inventory');
  for (const row of expected) {
    const matches = runtime.files.filter(file => file.path === runtime.prefix.slice(1) + row.path);
    if (matches.length !== 1 || matches[0].bytes !== row.bytes || matches[0].sha256 !== row.sha256 ||
        row.sourceSha256 && matches[0].sourceSha256 !== row.sourceSha256) throw new Error('Source distribution file mismatch');
  }
  if (requirePublished && !runtime.sourceDistribution.publication) throw new Error('Source distribution not published');
}

export const sourceDistributions = () => structuredClone({ schemaVersion: 1, entries: catalog.distributions, publications: publications.publications });

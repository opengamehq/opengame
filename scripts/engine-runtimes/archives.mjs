import { gunzipSync, inflateRawSync } from 'node:zlib';

export function safePath(value, maxBytes) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > maxBytes ||
      !/^[A-Za-z0-9_@+./-]+$/.test(value) || value.startsWith('/') ||
      value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe runtime path: ${JSON.stringify(value)}`);
  }
  return value;
}

function collector(bounds) {
  const files = new Map();
  const fileNames = new Set();
  const names = new Set();
  let bytes = 0;
  let count = 0;
  return {
    files,
    reserve(name, size, directory = false) {
      safePath(name, bounds.pathBytesMax);
      const key = name.toLowerCase();
      if (names.has(key)) throw new Error(`Duplicate runtime path: ${name}`);
      names.add(key);
      if (++count > bounds.fileCountMax) throw new Error('Runtime file count limit');
      if (size > bounds.fileBytesMax) throw new Error('Runtime member size limit');
      bytes += size;
      if (bytes > bounds.expandedBytesMax) throw new Error('Runtime expanded size limit');
      for (const parent of key.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))) {
        if (fileNames.has(parent)) throw new Error(`Runtime file/directory collision: ${name}`);
      }
      if (!directory) {
        if ([...names].some(other => other.startsWith(`${key}/`))) throw new Error(`Runtime directory/file collision: ${name}`);
        fileNames.add(key);
      }
    },
  };
}

function octal(data) {
  const text = data.toString('ascii').replace(/\0.*$/s, '').trim();
  if (!/^[0-7]+$/.test(text)) throw new Error('Invalid tar numeric field');
  const n = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(n)) throw new Error('Oversized tar field');
  return n;
}

/** Parse before writing. Links, special nodes and extension records never reach disk. */
export function readTarGzip(archive, bounds, accounting) {
  if (archive.length > bounds.downloadBytesMax) throw new Error('Runtime archive size limit');
  const raw = gunzipSync(archive, { maxOutputLength: bounds.expandedBytesMax });
  if (accounting) { accounting.decodedBytes = raw.length; accounting.entries = 0; }
  const out = collector(bounds);
  let at = 0;
  while (at + 512 <= raw.length) {
    const header = raw.subarray(at, at + 512);
    if (header.every(byte => byte === 0)) {
      if (raw.length - at < 1024 || !raw.subarray(at).every(byte => byte === 0)) throw new Error('Invalid tar terminator');
      return out.files;
    }
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(header.subarray(148, 156))) throw new Error('Tar checksum mismatch');
    const string = (start, end) => header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const prefix = string(345, 500);
    const name = `${prefix ? `${prefix}/` : ''}${string(0, 100)}`;
    const size = octal(header.subarray(124, 136));
    const type = header[156];
    if (![0, 48, 53].includes(type) || string(157, 257)) throw new Error('Unsupported tar entry (links and extensions forbidden)');
    if (type === 53 && size) throw new Error('Nonempty tar directory');
    const end = at + 512 + size;
    const next = at + 512 + Math.ceil(size / 512) * 512;
    if (size > bounds.fileBytesMax || next > raw.length) throw new Error('Truncated or oversized tar member');
    const path = type === 53 ? name.replace(/\/$/, '') : name;
    out.reserve(path, size, type === 53);
    if (accounting) accounting.entries++;
    if (type !== 53) out.files.set(path, raw.subarray(at + 512, end));
    at = next;
  }
  throw new Error('Missing tar terminator');
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZip(archive, bounds, accounting) {
  if (archive.length > bounds.downloadBytesMax) throw new Error('Runtime archive size limit');
  if (accounting) { accounting.decodedBytes = 0; accounting.entries = 0; }
  // Only classic single-disk ZIP. ZIP64 is unnecessary for these bounded distributions.
  let eocd = archive.length - 22;
  let found = false;
  for (; eocd >= Math.max(0, archive.length - 65557); eocd--) {
    if (archive.readUInt32LE(eocd) === 0x06054b50 && eocd + 22 + archive.readUInt16LE(eocd + 20) === archive.length) { found = true; break; }
  }
  if (!found || archive.readUInt16LE(eocd + 4) || archive.readUInt16LE(eocd + 6)) throw new Error('Unsupported ZIP directory');
  const count = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralStart = archive.readUInt32LE(eocd + 16);
  if (count > bounds.fileCountMax || count !== archive.readUInt16LE(eocd + 8) || centralStart + centralSize !== eocd) throw new Error('Invalid ZIP bounds');
  const out = collector(bounds);
  const spans = [];
  const entries = [];
  let at = centralStart;
  for (let index = 0; index < count; index++) {
    if (at + 46 > eocd || archive.readUInt32LE(at) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const flags = archive.readUInt16LE(at + 8);
    const method = archive.readUInt16LE(at + 10);
    const crc = archive.readUInt32LE(at + 16);
    const packedSize = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const local = archive.readUInt32LE(at + 42);
    const end = at + 46 + nameLength + extraLength + commentLength;
    if (end > eocd || (flags & ~0x0808) || ![0, 8].includes(method) || size > bounds.fileBytesMax || archive.readUInt16LE(at + 34)) throw new Error('Unsupported ZIP member');
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const unixType = (archive.readUInt32LE(at + 38) >>> 16) & 0xf000;
    if (unixType && ![0x8000, 0x4000].includes(unixType)) throw new Error('ZIP links and special nodes forbidden');
    if (local + 30 > centralStart || archive.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP local header');
    const localNameLength = archive.readUInt16LE(local + 26);
    const dataStart = local + 30 + localNameLength + archive.readUInt16LE(local + 28);
    const dataEnd = dataStart + packedSize;
    if (dataEnd > centralStart || archive.readUInt16LE(local + 6) !== flags || archive.readUInt16LE(local + 8) !== method ||
        archive.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name ||
        spans.some(([start, stop]) => local < stop && dataEnd > start)) throw new Error('Conflicting ZIP headers');
    if (!(flags & 8) && (archive.readUInt32LE(local + 14) !== crc || archive.readUInt32LE(local + 18) !== packedSize || archive.readUInt32LE(local + 22) !== size)) throw new Error('Conflicting ZIP sizes or checksum');
    spans.push([local, dataEnd]);
    const directory = name.endsWith('/');
    if (directory && size) throw new Error('Nonempty ZIP directory');
    const path = directory ? name.slice(0, -1) : name;
    // Validate every declared size and the cumulative budget before allocating
    // any inflated member, including files that asset selection will discard.
    out.reserve(path, size, directory);
    if (accounting) { accounting.entries++; accounting.decodedBytes += size; }
    entries.push({ path, directory, dataStart, dataEnd, method, size, crc });
    at = end;
  }
  if (at !== eocd) throw new Error('ZIP central directory size mismatch');
  for (const { path, directory, dataStart, dataEnd, method, size, crc } of entries) {
    const packed = archive.subarray(dataStart, dataEnd);
    // A lying header cannot borrow the per-file maximum after reserving fewer
    // bytes. zlib requires a positive bound even for a legitimate empty file.
    const bytes = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: Math.max(1, size) });
    if (bytes.length !== size || crc32(bytes) !== crc) throw new Error('ZIP member integrity mismatch');
    if (!directory) out.files.set(path, bytes);
  }
  return out.files;
}

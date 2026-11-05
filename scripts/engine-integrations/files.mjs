import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

export const hash = data => createHash('sha256').update(data).digest('hex');
export const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function safeName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') || name.startsWith('/') ||
      name.split('/').some(p => !p || p === '.' || p === '..') || /[\x00-\x1f\x7f]/.test(name)) throw new Error(`Unsafe package path: ${name}`);
  return name;
}
export async function readSafe(root, name) {
  safeName(name);
  const base = await realpath(root);
  let path = base;
  for (const part of name.split('/')) {
    path = join(path, part);
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Package symlink refused: ${name}`);
  }
  if (!(await lstat(path)).isFile()) throw new Error(`Not a regular package file: ${name}`);
  return readFile(path);
}
const excluded = new Set(['.git', '.gitignore', 'node_modules', 'dist', 'build', 'target', 'obj', 'bin', '.godot', '__pycache__', '.DS_Store']);
export async function sourceTree(root, directory) {
  safeName(directory);
  const files = new Map();
  async function walk(path) {
    // Check each directory before readdir: a symlink may otherwise escape the snapshot.
    let cursor = root;
    for (const part of path.split('/')) {
      cursor = join(cursor, part);
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`Source symlink refused: ${path}`);
    }
    for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => compare(a.name, b.name))) {
      if (excluded.has(entry.name)) continue;
      if (entry.name.startsWith('.') || /(?:\.pem|\.key|\.p12|\.pfx|\.env|\.tgz|\.nupkg|\.crate|\.zip)$/.test(entry.name)) throw new Error(`Unexpected source file: ${path}/${entry.name}`);
      const name = safeName(`${path}/${entry.name}`);
      if (entry.isDirectory()) await walk(name);
      else files.set(name, await readSafe(root, name));
    }
  }
  await walk(directory);
  return files;
}
export function inventory(files) {
  const seen = new Set();
  return [...files].sort(([a], [b]) => compare(a, b)).map(([path, data]) => {
    safeName(path);
    const folded = path.normalize('NFC').toLowerCase();
    if (seen.has(folded)) throw new Error(`Case-colliding package path: ${path}`);
    seen.add(folded);
    return { path, bytes: data.length, sha256: hash(data) };
  });
}
export const binding = files => hash(json(inventory(files)));
export async function materialize(root, files) {
  inventory(files);
  for (const [name, data] of files) {
    const path = resolve(root, safeName(name));
    if (!relative(resolve(root), path) || relative(resolve(root), path).startsWith(`..${sep}`)) throw new Error('Package path escaped staging');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx', mode: name.endsWith('.sh') ? 0o755 : 0o644 });
  }
}

// USTAR with fixed owner, mode and time. No shell, filesystem traversal, PAX
// timestamps or locale ordering can change the bytes of a source package.
export function tarGzip(files) {
  inventory(files);
  const chunks = [];
  for (const [path, data] of [...files].sort(([a], [b]) => compare(a, b))) {
    const header = Buffer.alloc(512);
    let name = path, prefix = '';
    if (Buffer.byteLength(name) > 100) {
      const split = [...path.matchAll(/\//g)].map(m => m.index).reverse().find(i => Buffer.byteLength(path.slice(0, i)) <= 155 && Buffer.byteLength(path.slice(i + 1)) <= 100);
      if (split === undefined) throw new Error(`USTAR path too long: ${path}`);
      name = path.slice(split + 1); prefix = path.slice(0, split);
    }
    header.write(name, 0, 100, 'utf8');
    const octal = (value, at, width) => {
      const text = value.toString(8).padStart(width - 1, '0') + '\0';
      if (text.length > width) throw new Error('USTAR numeric overflow');
      header.write(text, at, width, 'ascii');
    };
    octal(path.endsWith('.sh') ? 0o755 : 0o644, 100, 8);
    octal(0, 108, 8); octal(0, 116, 8); octal(data.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header[156] = 48;
    header.write('ustar\0', 257, 6); header.write('00', 263, 2); header.write(prefix, 345, 155, 'utf8');
    const checksum = header.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ';
    header.write(checksum, 148, 8, 'ascii');
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]), { level: 9, mtime: 0 });
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  inventory(files);
  if (files.size > 65535) throw new Error('ZIP64 required');
  const locals = [], central = []; let offset = 0;
  for (const [path, data] of [...files].sort(([a], [b]) => compare(a, b))) {
    const name = Buffer.from(path), crc = crc32(data);
    if (name.length > 65535 || data.length > 0xffffffff) throw new Error('ZIP64 required');
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12); // 1980-01-01, stored, UTF-8.
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x314, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8); record.writeUInt16LE(33, 14); record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE((0o100644 << 16) >>> 0, 38); record.writeUInt32LE(offset, 42);
    locals.push(local, name, data); central.push(record, name); offset += local.length + name.length + data.length;
  }
  const records = Buffer.concat(central), end = Buffer.alloc(22);
  if (offset + records.length > 0xffffffff) throw new Error('ZIP64 required');
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(records.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, records, end]);
}

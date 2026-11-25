/**
 * safe-fs.py's jobs, run in-process by Node, for Windows.
 *
 * The CLI reads a creator's build through a Python helper that walks each path from a held
 * directory descriptor with O_NOFOLLOW, so a folder swapped for a link mid-read can never
 * redirect a read or a write. That helper needs POSIX: openat, O_NOFOLLOW, O_DIRECTORY. On
 * Windows none of those exist, and the CLI only ever looked for Python at fixed POSIX paths, so
 * `opengame init`, `dev`, `vendor` and anything else that read a project stopped on "This
 * command needs Python 3 on macOS or Linux", whatever was installed (reported on 25 Nov 2026
 * from PowerShell). Installing Python could not have helped.
 *
 * This file takes the same JSON jobs and gives the same replies, so safe-fs.ts and its callers
 * do not change. What it can hold without descriptors, and so what it does instead:
 *
 * - Every directory on the way, from the drive root down, is lstat'ed and refused when it is a
 *   link or not a directory, and its identity (volume, file id) is recorded.
 * - A file is lstat'ed first and must be a regular file, not a link. It is then opened, and the
 *   open handle's identity must be the one lstat saw. Whatever a swapped ancestor redirected
 *   the open to, the bytes come from that exact file or not at all.
 * - The file's real path (the native realpath, GetFinalPathNameByHandle on Windows) must be the
 *   path asked for, and so must the root's and every folder staging makes. lstat alone is not
 *   enough on Windows: libuv reports a junction as a link only when its target reads like
 *   `\??\C:\...`, so one aimed at `\??\Volume{GUID}\...`, which any user can make with
 *   mklink /J, lstat's as a plain folder with its target's identity. The real path sees
 *   through every kind (review of this file, 25 Nov 2026, from libuv 1.51's win/fs.c).
 * - After each file, every recorded directory is lstat'ed again and must be the same one.
 *
 * What it cannot hold, said plainly so nobody reads more into it: a folder swapped for a
 * junction after it was checked, used for both the file's lstat and its open, and swapped back
 * before the re-check. Python's descriptors rule that out and this cannot. Doing it takes a
 * process of the creator's own account racing this one within microseconds, and a process
 * that can do that can already read whatever the creator can read and copy it into the build
 * folder itself, which no reader can tell apart from the creator's own files. Links that are
 * simply there, which is how a stray link in a build actually happens, are refused. Writes
 * (vendor's staging and check's snapshot copy) are only ever exclusive creates, so a
 * redirected write can make a new file with the CLI's own bytes and never replace one.
 *
 * Exported for the tests, which run every job through this on Linux as well as through
 * Python. Nothing outside safe-fs.ts calls it.
 */
import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, realpath, type FileHandle } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/** The filesystem calls the walk makes, so a test can swap a folder between two of them. */
export type NodeIo = {
  lstat: (target: string) => Promise<BigIntStats>;
  open: (target: string, flags: number, mode?: number) => Promise<FileHandle>;
  mkdir: (target: string) => Promise<void>;
  realpath: (target: string) => Promise<string>;
};
export const nodeIo: NodeIo = {
  lstat: target => lstat(target, { bigint: true }),
  open: (target, flags, mode) => open(target, flags, mode),
  mkdir: async target => { await mkdir(target, { mode: 0o700 }); },
  // fs/promises' realpath is the native one, the same the callers used to make the root.
  realpath: target => realpath(target),
};

/* NTFS compares names without case, and the real path carries the case on disk while a bundle
   path carries the case it was written in. NTFS folds to upper case, so this does too; a
   mismatch the folding still misses fails closed. */
const samePath = (a: string, b: string) => process.platform === "win32" ? a.toUpperCase() === b.toUpperCase() : a === b;

export type NodeReply = { error?: string; files?: [string, Buffer][]; ok?: boolean; sizes?: number[]; digests?: [string, number, string][]; bytes?: Buffer };
type Job = Record<string, any>;
type Binding = { at: string; dev: bigint; ino: bigint };

/** Same as safe-fs.py's CHUNK: hashing and copying hold this much of a file at a time. */
const CHUNK = 1 << 20;
/* Both are undefined on Windows, where 0 leaves the open as it was. On Linux, where the tests
   run this file, they give the leaf the same protection Python's open gives it. */
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;
const READ = constants.O_RDONLY | NOFOLLOW | NONBLOCK;
const CREATE = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW;

class Changed extends Error {}
class OverLimit extends Error {}
class OverTotal extends OverLimit {}
class Missing extends Error {}

/** A bundle path's components, refused as safe-fs.py's parts() refuses them. */
function parts(value: unknown): string[] {
  if (typeof value !== "string") throw new Changed();
  const result = value.split("/");
  if (!result.length || result.some(part => part === "" || part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) throw new Changed();
  return result;
}

/* ENOENT alone, as Python catches FileNotFoundError alone: an ancestor that is a file is
   refused by directory() before anything could say ENOTDIR. */
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

export async function runNodeJob(job: Job, stream?: Iterable<Uint8Array> | AsyncIterable<Uint8Array>, io: NodeIo = nodeIo): Promise<NodeReply> {
  const bindings: Binding[] = [];

  /** A folder, bound. `real` also requires its real path to be its path: every folder the
   * staging writes into, since a write has no file to check afterwards. Reads check the file's
   * own real path instead, which covers every folder above it in one call. */
  async function directory(at: string, create = false, real = create): Promise<Binding> {
    if (create) await io.mkdir(at).catch(error => { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; });
    const stat = await io.lstat(at);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Changed();
    if (real) await isReal(at);
    const binding = { at, dev: stat.dev, ino: stat.ino };
    bindings.push(binding);
    return binding;
  }

  async function isReal(at: string) {
    if (!samePath(await io.realpath(at), at)) throw new Changed();
  }

  async function unchanged(list: readonly Binding[] = bindings) {
    for (const binding of list) {
      const stat = await io.lstat(binding.at);
      if (stat.isSymbolicLink() || !stat.isDirectory() || stat.dev !== binding.dev || stat.ino !== binding.ino) throw new Changed();
    }
  }

  /** An absolute folder, every directory from the drive or share root down bound on the way,
   * and its real path its own. A game at the root of a drive (a USB stick's E:\) binds the
   * root itself, where Python's walk has no folder to hold and refuses. */
  async function absolute(value: unknown): Promise<string> {
    if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) throw new Changed();
    const { root } = path.parse(value);
    const rest = value.slice(root.length);
    if (!rest) { await directory(root, false, true); return root; }
    let at = root;
    for (const component of rest.split(path.sep)) {
      if (!component || component === "." || component === ".." || component.includes("/")) throw new Changed();
      at = (await directory(path.join(at, component))).at;
    }
    await isReal(at);
    return at;
  }

  async function ancestors(base: string, names: string[]): Promise<string> {
    let at = base;
    for (const name of names) at = (await directory(path.join(at, name))).at;
    return at;
  }

  /** The leaf, opened only as the regular file lstat found at its name. */
  async function openLeaf(parent: string, name: string): Promise<{ handle: FileHandle; before: BigIntStats }> {
    const leaf = path.join(parent, name);
    const seen = await io.lstat(leaf);
    if (!seen.isFile()) throw new Changed();
    let handle: FileHandle;
    try { handle = await io.open(leaf, READ); }
    catch { throw new Changed(); }
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.dev !== seen.dev || before.ino !== seen.ino) throw new Changed();
      await isReal(leaf);
      return { handle, before };
    } catch (error) { await handle.close(); throw error; }
  }

  /** Reads exactly `wanted` bytes from `offset`, or one more when the file grew, so a change is seen. */
  async function readAt(handle: FileHandle, offset: number, wanted: number, extra: boolean): Promise<Buffer> {
    const buffer = Buffer.allocUnsafe(wanted + (extra ? 1 : 0));
    let read = 0;
    while (read < buffer.length) {
      const { bytesRead } = await handle.read(buffer, read, buffer.length - read, offset + read);
      if (!bytesRead) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  }

  /** Streams the whole file through `each`, one CHUNK at a time, and returns how much was read. */
  async function pump(handle: FileHandle, size: number, each: (chunk: Buffer) => Promise<void> | void): Promise<number> {
    const buffer = Buffer.allocUnsafe(Math.min(CHUNK, size + 1) || 1);
    let read = 0;
    while (read < size + 1) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size + 1 - read), read);
      if (!bytesRead) break;
      read += bytesRead;
      if (read > size) break;
      await each(buffer.subarray(0, bytesRead));
    }
    return read;
  }

  function same(before: BigIntStats, after: BigIntStats) {
    return before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
  }

  /** What a per-file step bound is dropped once that file is done, as safe-fs.py closes its fds. */
  async function eachFile<T>(work: () => Promise<T>): Promise<T> {
    const mark = bindings.length;
    const result = await work();
    await unchanged();
    bindings.length = mark;
    return result;
  }

  try {
    const root = await absolute(job.root);
    const expected = job.identity as { dev?: string; ino?: string } | undefined;
    const held = bindings[bindings.length - 1];
    if (!held) throw new Changed();
    if (expected && (String(held.dev) !== expected.dev || String(held.ino) !== expected.ino)) throw new Changed();
    const files = Array.isArray(job.files) ? job.files as Job[] : [];
    if ((job.operation === "read" || job.operation === "read-binary" || job.operation === "copy") && !Number.isSafeInteger(job.maximum)) throw new Changed();

    if (job.operation === "read" || job.operation === "read-binary") {
      if (job.operation === "read-binary" && files.length !== 1) throw new Changed();
      const result: [string, Buffer][] = [];
      let total = 0;
      for (const file of files) {
        const data = await eachFile(async () => {
          const names = parts(file.relative);
          let opened;
          try {
            const parent = await ancestors(root, names.slice(0, -1));
            opened = await openLeaf(parent, names[names.length - 1]!);
          } catch (error) {
            // Missing is legitimate only at the file's own lookup; a vanished root or ancestor
            // found by the re-check is a race, as in safe-fs.py.
            if (!missing(error)) throw error;
            await unchanged();
            if (job.allowMissing) throw new Missing();
            throw new Changed();
          }
          const { handle, before } = opened;
          try {
            const size = Number(before.size);
            if (file.size != null && size !== file.size) throw new Changed();
            total += size;
            if (total > job.maximum) throw new OverLimit();
            let bytes: Buffer, wanted: number;
            const span = job.operation === "read-binary" ? job.range : undefined;
            if (span == null) { bytes = await readAt(handle, 0, size, true); wanted = size; }
            else {
              const { offset, length } = span;
              if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > size) throw new Changed();
              bytes = await readAt(handle, offset, length, false); wanted = length;
            }
            const after = await handle.stat({ bigint: true });
            if (bytes.length !== wanted || !same(before, after)) throw new Changed();
            return bytes;
          } finally { await handle.close(); }
        });
        if (job.operation === "read-binary") { await unchanged(); return { bytes: data }; }
        result.push([file.path, data]);
      }
      await unchanged();
      return { files: result };
    }

    if (job.operation === "copy") {
      // check and deploy's snapshot, copied into a private folder the CLI made.
      const destination = await absolute(job.destination);
      const result: [string, number, string][] = [];
      let total = 0;
      for (const file of files) {
        result.push(await eachFile(async () => {
          const names = parts(file.relative);
          const target = String(file.target);
          if (!/^\d+$/.test(target)) throw new Changed();
          const parent = await ancestors(root, names.slice(0, -1));
          const { handle, before } = await openLeaf(parent, names[names.length - 1]!);
          try {
            const size = Number(before.size);
            if (file.size != null && size !== file.size) throw new Changed();
            total += size;
            if (total > job.maximum) throw new OverLimit();
            const output = await io.open(path.join(destination, target), CREATE, 0o600);
            const digest = createHash("sha256");
            let read: number;
            try {
              read = await pump(handle, size, async chunk => { digest.update(chunk); await writeAll(output, chunk); });
            } finally { await output.close(); }
            const after = await handle.stat({ bigint: true });
            if (read !== size || !same(before, after)) throw new Changed();
            return [file.path, size, digest.digest("hex")] as [string, number, string];
          } finally { await handle.close(); }
        }));
      }
      await unchanged();
      return { digests: result };
    }

    if (job.operation === "sizes" || job.operation === "hash") {
      const hashing = job.operation === "hash";
      const sizes: number[] = [];
      const digests: [string, number, string][] = [];
      let total = 0;
      const count = (size: number) => {
        if (size > job.fileMaximum) throw new OverLimit();
        total += size;
        if (total > job.totalMaximum) throw new OverTotal();
      };
      for (const file of files) {
        await eachFile(async () => {
          const names = parts(file.relative);
          const parent = await ancestors(root, names.slice(0, -1));
          if (!hashing) {
            // lstat, never a follow: a link in the leaf is not a regular file.
            const leaf = path.join(parent, names[names.length - 1]!);
            const stat = await io.lstat(leaf);
            if (!stat.isFile()) throw new Changed();
            await isReal(leaf);
            count(Number(stat.size));
            sizes.push(Number(stat.size));
            return;
          }
          const { handle, before } = await openLeaf(parent, names[names.length - 1]!);
          try {
            const size = Number(before.size);
            if (size !== file.size) throw new Changed();
            count(size);
            const digest = createHash("sha256");
            const read = await pump(handle, size, chunk => { digest.update(chunk); });
            const after = await handle.stat({ bigint: true });
            if (read !== size || !same(before, after)) throw new Changed();
            digests.push([file.path, size, digest.digest("hex")]);
          } finally { await handle.close(); }
        });
      }
      await unchanged();
      return hashing ? { digests } : { sizes };
    }

    // Only the streamed stage: writeStage is its one caller, and base64 staging is Python's alone.
    if (job.operation !== "stage-stream" || !stream) throw new Changed();
    const target = parts(job.target);
    let parent = root;
    for (const name of target.slice(0, -1)) parent = (await directory(path.join(parent, name), true)).at;
    try { await io.mkdir(path.join(parent, target[target.length - 1]!)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return { error: "vendor_output_exists" };
      throw error;
    }
    const stage = (await directory(path.join(parent, target[target.length - 1]!), false, true)).at;
    // Everything up to the stage itself, then each folder made inside it with its own chain.
    const base = bindings.slice();
    const made = new Map<string, Binding[]>([["", []]]);
    const source = new Source(stream);
    for (const entry of files as unknown as [unknown, unknown][]) {
      const [name, length] = entry;
      const names = parts(name);
      if (!Number.isSafeInteger(length) || (length as number) < 0) throw new Changed();
      let at = stage, key = "", chain: Binding[] = [];
      for (const component of names.slice(0, -1)) {
        key += "/" + component;
        if (!made.has(key)) made.set(key, [...chain, await directory(path.join(at, component), true)]);
        chain = made.get(key)!;
        at = chain[chain.length - 1]!.at;
      }
      // The folders this file goes into are checked again right before it is created, which
      // narrows what a swap in the middle of staging can redirect (see the header). Only this
      // file's own: checking every folder staged so far made a 5,000-file vendor quadratic
      // (2.5 million lstats, 30 s on Linux). Everything is checked once more at the end.
      await unchanged([...base, ...chain]);
      const output = await io.open(path.join(at, names[names.length - 1]!), CREATE, 0o600);
      try {
        let remaining = length as number;
        while (remaining) {
          const chunk = await source.read(Math.min(CHUNK, remaining));
          if (!chunk.length) throw new Changed();
          await writeAll(output, chunk);
          remaining -= chunk.length;
        }
      } finally { await output.close(); }
    }
    if ((await source.read(1)).length) throw new Changed();
    await unchanged();
    return { ok: true };
  } catch (error) {
    if (error instanceof Missing) return { error: "file_missing" };
    if (error instanceof OverTotal) return { error: "total_limit" };
    if (error instanceof OverLimit) return { error: "file_limit" };
    return { error: "build_changed" };
  }
}

/** FileHandle.write may write less than it was given (a full disk part way); Python's
 * buffered write loops, and so does this. */
async function writeAll(output: FileHandle, chunk: Uint8Array) {
  for (let offset = 0; offset < chunk.length;) {
    const { bytesWritten } = await output.write(chunk, offset, chunk.length - offset);
    if (!bytesWritten) throw new Changed();
    offset += bytesWritten;
  }
}

/** The staged bytes, taken a slice at a time from the chunks writeStage yields. */
class Source {
  private iterator: Iterator<Uint8Array> | AsyncIterator<Uint8Array>;
  private pending: Uint8Array = new Uint8Array(0);
  constructor(stream: Iterable<Uint8Array> | AsyncIterable<Uint8Array>) {
    this.iterator = Symbol.asyncIterator in stream ? stream[Symbol.asyncIterator]() : stream[Symbol.iterator]();
  }
  async read(maximum: number): Promise<Uint8Array> {
    while (!this.pending.length) {
      const next = await this.iterator.next();
      if (next.done) return new Uint8Array(0);
      this.pending = next.value;
    }
    const slice = this.pending.subarray(0, maximum);
    this.pending = this.pending.subarray(slice.length);
    return slice;
  }
}

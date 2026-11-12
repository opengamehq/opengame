import { createHash } from "node:crypto";
import { constants, rmSync } from "node:fs";
import { mkdtemp, open, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PreflightFile } from "@opengame/preflight";
import { LIMITS } from "@opengame/shared";
import { collectFiles } from "./files";
import { CliError } from "./output";
import { readableBytes } from "./bytes";
import { BUILD_CHANGED, safeCopySnapshot, type DirectoryIdentity, type ReadWords } from "./safe-fs";

/**
 * The bytes `check` and `deploy` inspect and package, copied once into a private folder.
 *
 * Until 11 Nov 2026 this was a Map of every file's bytes, which was right while a build was
 * at most 250 MiB and stopped being right at 1 GiB: a 1 GiB build held a gigabyte of
 * snapshot and up to another of archive at once, and the 5 GB builds OpenGame takes for
 * the launch (OG Snipers is 25,000 files and nearly 5 GB unpacked) would want ten
 * gigabytes of a laptop's memory. So each file is copied as it is read, hashed on the way,
 * into a folder only this process can write, and every later read (the checker, the
 * receipt, the archive) comes from that copy. What was checked is what is packaged for
 * the same reason as before: nothing else can change the copy. It costs disk the size of
 * the build until the command ends.
 *
 * Files a step adds (vendoring, a runtime) are small and are kept in memory beside it.
 */
export class Snapshot {
  private readonly entries = new Map<string, { size: number; sha256: string; file?: string; bytes?: Uint8Array }>();
  private constructor(private readonly folder: string | null) {}

  /** A snapshot with nothing on disk, for a caller that already holds every byte. */
  static fromMap(files: ReadonlyMap<string, Uint8Array>): Snapshot {
    const snapshot = new Snapshot(null);
    for (const [path, bytes] of files) snapshot.set(path, bytes);
    return snapshot;
  }

  /** Read `folder` into a new private folder under `workDirectory` (the system temporary
   * folder when none is given). The descriptor-held reader copies where Python works,
   * the Node reader where it does not, exactly as the in-memory snapshot chose. */
  static async read(folder: string, options: { descriptorReader: boolean; workDirectory?: string; externalAssets?: ReadonlySet<string>; externalDelivery?: string;
    rootIdentity?: DirectoryIdentity; words?: ReadWords }) {
    const directory = await mkdtemp(join(options.workDirectory ?? tmpdir(), "snapshot-"));
    removeAtExit(directory);
    const snapshot = new Snapshot(directory);
    try {
      if (options.descriptorReader) {
        const copied = await safeCopySnapshot(folder, await realpath(directory), { externalAssets: options.externalAssets, externalDelivery: options.externalDelivery,
          rootIdentity: options.rootIdentity, words: options.words });
        for (const row of copied.copied) snapshot.entries.set(row.path, { size: row.size, sha256: row.sha256, file: join(directory, row.file) });
        return { snapshot, excluded: copied.excluded };
      }
      const collected = await collectFiles(folder);
      let total = 0;
      for (const [index, file] of collected.files.entries()) {
        total += file.size;
        if (total > LIMITS.bundle.uncompressedBytesMax) throw new CliError("bundle_limit", `The build is over ${readableBytes(LIMITS.bundle.uncompressedBytesMax)} uncompressed. Remove what the game does not load, then run opengame check.`, 1);
        const target = join(directory, String(index));
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const sha256 = await copyChecked(file.source, target, file.size);
        snapshot.entries.set(file.path, { size: file.size, sha256, file: target });
      }
      return { snapshot, excluded: collected.excluded };
    } catch (error) { await snapshot.dispose(); throw error; }
  }

  has(path: string) { return this.entries.has(path); }
  keys() { return this.entries.keys(); }
  get size() { return this.entries.size; }
  sizeOf(path: string) { return this.entries.get(path)?.size; }
  sha256Of(path: string) { return this.entries.get(path)?.sha256; }
  totalBytes() { let total = 0; for (const entry of this.entries.values()) total += entry.size; return total; }

  /** Add or replace a file held in memory: something a packaging step made. */
  set(path: string, bytes: Uint8Array) {
    this.entries.set(path, { size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), bytes });
  }

  /** The whole file. Callers ask for one file at a time, so memory is the largest file. */
  async bytes(path: string): Promise<Uint8Array> {
    const entry = this.entries.get(path);
    if (!entry) throw new CliError("archive_changed", "The archive could not be assembled. Run opengame check again.", 1);
    if (entry.bytes) return entry.bytes;
    return this.range(path, 0, entry.size);
  }

  async head(path: string, length: number): Promise<Uint8Array> {
    const entry = this.entries.get(path);
    if (!entry) throw new CliError("archive_changed", "The archive could not be assembled. Run opengame check again.", 1);
    if (entry.bytes) return entry.bytes.subarray(0, length);
    return this.range(path, 0, Math.min(length, entry.size));
  }

  /** The file a slice at a time, for the archive writer. */
  async *chunks(path: string, chunkBytes = 1 << 20): AsyncGenerator<Uint8Array> {
    const entry = this.entries.get(path);
    if (!entry) throw new CliError("archive_changed", "The archive could not be assembled. Run opengame check again.", 1);
    if (entry.bytes) {
      for (let offset = 0; offset < entry.bytes.byteLength; offset += chunkBytes) yield entry.bytes.subarray(offset, offset + chunkBytes);
      return;
    }
    const handle = await open(entry.file!, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      for (let offset = 0; offset < entry.size;) {
        const buffer = Buffer.allocUnsafe(Math.min(chunkBytes, entry.size - offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        if (!bytesRead) throw changed();
        offset += bytesRead;
        yield buffer.subarray(0, bytesRead);
      }
    } finally { await handle.close(); }
  }

  /** Every byte, as the Map the vendoring steps take. Only `--vendor` asks for this, and a
   * vendored build is held to memory as it always was. */
  async toMap(): Promise<Map<string, Uint8Array>> {
    const map = new Map<string, Uint8Array>();
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    for (const path of this.entries.keys()) map.set(path, await this.bytes(path));
    return map;
  }

  /** The checker's view. Every read is of the copy, so it sees the bytes that are packaged.
   * Each `bytes()` answer is a buffer nobody else holds, a copy for a file kept in memory,
   * so runPreflight may move it to its worker (transferBytes). */
  preflightFiles(): PreflightFile[] {
    return [...this.entries].map(([path, entry]) => ({ path, size: entry.size,
      bytes: async () => entry.bytes ? Uint8Array.from(entry.bytes) : this.range(path, 0, entry.size), head: (length: number) => this.head(path, length),
      text: async () => Buffer.from(await this.bytes(path)).toString("utf8") }));
  }

  async dispose() { if (this.folder) { await rm(this.folder, { recursive: true, force: true }); removed(this.folder); } }

  private async range(path: string, offset: number, length: number): Promise<Uint8Array> {
    const entry = this.entries.get(path)!;
    const handle = await open(entry.file!, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      // Its own ArrayBuffer, never a slice of Node's shared pool, so it can be transferred.
      const buffer = Buffer.allocUnsafeSlow(length);
      let read = 0;
      while (read < length) {
        const result = await handle.read(buffer, read, length - read, offset + read);
        if (!result.bytesRead) throw changed();
        read += result.bytesRead;
      }
      return buffer;
    } finally { await handle.close(); }
  }
}

const changed = () => new CliError("build_changed", BUILD_CHANGED, 1);

/* Folders packaging made and has not yet removed: a snapshot, or an archive folder in the
   system temporary folder. A copy of a build can be gigabytes, so one that outlives its
   command because a caller never disposed of it (a test, a thrown error on the way) goes
   when the process exits. Ctrl-C ends the process without this; deploy sweeps those. */
const owned = new Set<string>();
let hooked = false;
export function removeAtExit(folder: string) {
  owned.add(folder);
  if (!hooked) { hooked = true; process.once("exit", () => { for (const path of owned) rmSync(path, { recursive: true, force: true }); }); }
}
export function removed(folder: string) { owned.delete(folder); }

/** The Node reader's copy: the leaf opened without following a link, its size held to
 * what the walk saw, and its size and modification time unchanged once it is read. */
async function copyChecked(source: string, target: string, size: number): Promise<string> {
  if (await realpath(source) !== source) throw new CliError("symlink", BUILD_CHANGED, 1);
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await input.stat();
    if (!before.isFile() || before.size !== size) throw changed();
    const output = await open(target, "wx", 0o600);
    const digest = createHash("sha256");
    let read = 0;
    try {
      const buffer = Buffer.allocUnsafe(Math.min(1 << 20, size + 1) || 1);
      for (;;) {
        const result = await input.read(buffer, 0, buffer.length, read);
        if (!result.bytesRead) break;
        read += result.bytesRead;
        if (read > size) throw changed();
        const chunk = buffer.subarray(0, result.bytesRead);
        digest.update(chunk);
        await output.write(chunk);
      }
    } finally { await output.close(); }
    const after = await input.stat();
    if (read !== size || after.size !== size || after.mtimeMs !== before.mtimeMs) throw changed();
    return digest.digest("hex");
  } finally { await input.close(); }
}

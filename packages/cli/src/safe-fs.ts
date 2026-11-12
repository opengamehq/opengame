import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, sep } from "node:path";
import { access, lstat, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isBundlePath } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { LARGE_ASSET_DELIVERIES, largeAssetLimits } from "@opengame/shared/large-assets";
/** The largest single file any plan kind admits; each plan's own cap is checked where the plan is read. */
const LARGEST_ASSET_BYTES = Math.max(...LARGE_ASSET_DELIVERIES.map(kind => largeAssetLimits(kind)!.fileBytesMax));
import { collectFiles } from "./files";
import { CliError } from "./output";

type Reply = { error?: string; files?: [string, string][]; ok?: boolean; sizes?: unknown; digests?: unknown };
export type DirectoryIdentity = { dev: string; ino: string };

export async function safeDirectoryIdentity(root: string, expected?: DirectoryIdentity): Promise<DirectoryIdentity> {
  if (!isAbsolute(root)) throw new CliError("build_changed", "The selected export root is no longer canonical. Finish building, then run the command again.", 1);
  const stat = await lstat(root, { bigint: true });
  const identity = { dev: String(stat.dev), ino: String(stat.ino) };
  // Validate the supplied binding, never adopt realpath's replacement target.
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(root) !== root ||
      (expected && (expected.dev !== identity.dev || expected.ino !== identity.ino))) {
    throw new CliError("build_changed", "The selected export root changed. Restore it before retrying.", 1);
  }
  return identity;
}

/** Where the helper's interpreter may come from, in order. Fixed absolute paths, because
 * a bare "python3" is looked up through PATH, and `npm run` puts the project's own
 * node_modules/.bin at the front of PATH: any package the game depends on could ship a
 * `python3` there and be handed every file the CLI reads, including the credentials
 * check. `-I` stops Python importing from the script's directory; it cannot help when
 * the interpreter itself is the project's. Exported, and mutable, only so the tests can
 * point it at a missing interpreter. */
export const PYTHON_CANDIDATES = ["/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/bin/python3"];

/** The interpreter's whole environment. `-I` already ignores PYTHON* variables; this also
 * keeps anything else the shell carries (a PYTHONSTARTUP-shaped variable added in a later
 * Python, a DYLD_ or LD_ preload) away from the process that holds the directory fds. No
 * LANG either: Python 3.7 and later use UTF-8 for file names and pipes under the C locale
 * (PEP 538 and 540), and the helper's names are already portable ones. */
const HELPER_ENV: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
const HELPER_FLAGS = ["-I", "-S"];
export const PYTHON_MISSING = "This command needs Python 3 on macOS or Linux for its file reads. Install Python 3 from python.org or Homebrew (brew install python), then retry.";

/** True when the candidate starts and imports os. Existing is not enough: on a Mac without
 * the Command Line Tools, /usr/bin/python3 is a stub that exits non-zero, and a Homebrew or
 * python.org install further down the list is the one that works. The stub also asks the
 * person to install the tools in a dialog, so it is not run at all when xcode-select says
 * the tools are absent. */
async function works(candidate: string): Promise<boolean> {
  if (!isAbsolute(candidate)) return false;
  try {
    if (!(await stat(candidate)).isFile()) return false;
    await access(candidate, constants.X_OK);
    if (process.platform === "darwin" && candidate === "/usr/bin/python3") {
      await run("/usr/bin/xcode-select", ["-p"]);
    }
    await run(candidate, [...HELPER_FLAGS, "-c", "import os"]);
    return true;
  } catch { return false; }
}
function run(file: string, args: string[]) {
  return new Promise<void>((resolve, reject) => execFile(file, args, { env: HELPER_ENV, timeout: 10_000 }, error => error ? reject(error) : resolve()));
}

let interpreter: Promise<string> | undefined;
let resolvedFor: string | undefined;
async function python(): Promise<string> {
  const key = PYTHON_CANDIDATES.join("\0");
  if (!interpreter || resolvedFor !== key) {
    resolvedFor = key;
    interpreter = (async () => {
      for (const candidate of PYTHON_CANDIDATES) if (await works(candidate)) return candidate;
      throw new CliError("filesystem_unsupported", PYTHON_MISSING, 2);
    })();
    // A failed probe is not remembered, so installing Python fixes the next call.
    interpreter.catch(() => { if (resolvedFor === key) interpreter = undefined; });
  }
  return interpreter;
}

/** Whether a working interpreter was found, for the one caller that has a fallback. Check
 * and deploy read through Node when this is false; nothing else does. */
export async function pythonAvailable(): Promise<boolean> {
  return python().then(() => true, () => false);
}

async function helper() {
  return spawn(await python(), [...HELPER_FLAGS, fileURLToPath(new URL("./safe-fs.py", import.meta.url))], { stdio: ["pipe", "pipe", "pipe"], env: HELPER_ENV });
}

/** The subprocess owns the directory descriptors for the whole operation. There
 * is no path-based fallback: Windows and a missing Python fail before I/O. */
/** What a refused read says, by caller. The default is the staging sentence vendor and dev
 * have always printed; check and deploy pass their own, because "retry with a new output
 * folder" names a folder neither of them writes. */
export type ReadWords = { changed?: string; tooLarge?: () => CliError; overTotal?: () => CliError };
export const BUILD_CHANGED = "The build changed while being read. Finish building, then run opengame deploy again.";
const STAGE_CHANGED = "The export or staging path changed during I/O. Stop concurrent writers and retry with a new output folder. A partial stage may remain; inspect it before removing it.";

async function filesystem(job: Record<string, unknown>, words: ReadWords = {}, payload?: Iterable<Uint8Array>): Promise<Reply> {
  const child = await helper();
  const result = await new Promise<Reply>((resolve, reject) => {
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { text += chunk; });
    // The helper never logs input or OS exceptions: filenames may be sensitive.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.once("error", () => reject(new CliError("filesystem_unsupported", PYTHON_MISSING, 2)));
    child.once("close", code => {
      try { if (code !== 0) throw new Error(); resolve(JSON.parse(text)); }
      catch { reject(new CliError("filesystem_unsupported", "The local export filesystem helper could not run. " + PYTHON_MISSING, 2)); }
    });
    if (!payload) child.stdin.end(JSON.stringify(job));
    else {
      // One descriptor-owning helper receives metadata first, then raw chunks. Never
      // stringify a whole export: valid builds exceed V8's maximum string length.
      const write = (chunk: string | Uint8Array) => new Promise<void>((done, failed) => {
        child.stdin.write(chunk, error => error ? failed(error) : done());
      });
      void (async () => {
        await write(JSON.stringify(job) + "\n");
        for (const chunk of payload) await write(chunk);
        child.stdin.end();
      })().catch(() => child.stdin.destroy());
    }
  });
  if (result.error === "file_missing") throw Object.assign(new Error("The requested file is absent."), { code: "ENOENT" });
  // Over the limit: the caller's own refusal when it has one, or else a change, which is
  // what an over-limit file in an already-collected, already-measured export means.
  if (result.error === "total_limit" && words.overTotal) throw words.overTotal();
  if (result.error === "file_limit" && words.tooLarge) throw words.tooLarge();
  if (result.error === "file_limit" || result.error === "total_limit") throw new CliError("build_changed", words.changed ?? STAGE_CHANGED, 1);
  if (result.error) throw new CliError(result.error,
    result.error === "vendor_output_exists" ? "The staging folder already exists. Choose a new --output folder."
      : result.error === "filesystem_unsupported" ? PYTHON_MISSING
      : String(job.operation).startsWith("stage") ? STAGE_CHANGED : words.changed ?? STAGE_CHANGED,
    result.error === "filesystem_unsupported" || result.error === "vendor_output_exists" ? 2 : 1);
  return result;
}

export async function safeSnapshot(folder: string, options: { externalAssets?: ReadonlySet<string>; externalDelivery?: string; rootIdentity?: DirectoryIdentity; words?: ReadWords } = {}) {
  // Keep the shared exclusions, portable-name validation and limits. Collection
  // reads metadata only; all content opens below walk from a held directory fd.
  if (options.rootIdentity) await safeDirectoryIdentity(folder, options.rootIdentity);
  const collected = await collectFiles(folder, { externalAssets: options.externalAssets, externalDelivery: options.externalDelivery });
  const identity = options.rootIdentity ? await safeDirectoryIdentity(collected.root, options.rootIdentity) : await safeDirectoryIdentity(collected.root);
  if (options.rootIdentity && collected.root !== folder) throw new CliError("build_changed", "The selected export root changed while it was being read. Finish building, then run the command again.", 1);
  const rows = collected.files.map(file => ({ path: file.path, relative: relative(collected.root, file.source).split(sep).join("/"), size: file.size }));
  const snapshot = new Map<string, Buffer>();
  // Each read is held to what is left of the whole allowance, as one read was held to all
  // of it. collectFiles has already refused a build over it and the helper refuses a file
  // whose size changed, so this is a backstop no ordinary build reaches.
  let left = LIMITS.bundle.uncompressedBytesMax;
  for (const files of readGroups(rows, LIMITS.bundle.fileBytesMax)) {
    const reply = await filesystem({ operation: "read", root: collected.root, identity, maximum: left, files }, options.words);
    for (const [name, bytes] of reply.files!) {
      const buffer = Buffer.from(bytes, "base64");
      snapshot.set(name, buffer);
      left -= buffer.byteLength;
    }
  }
  return { ...collected, snapshot };
}

/** safeSnapshot's reads, copied into `destination` (a private folder the caller made)
 * instead of returned. Each file lands as its index in `files`, and comes back with the
 * size and SHA-256 of the bytes copied. The reply is a few hundred bytes a file however
 * large the files are, so one job takes a few thousand files. */
export async function safeCopySnapshot(folder: string, destination: string, options: { externalAssets?: ReadonlySet<string>; externalDelivery?: string; rootIdentity?: DirectoryIdentity; words?: ReadWords } = {}) {
  if (options.rootIdentity) await safeDirectoryIdentity(folder, options.rootIdentity);
  const collected = await collectFiles(folder, { externalAssets: options.externalAssets, externalDelivery: options.externalDelivery });
  const identity = options.rootIdentity ? await safeDirectoryIdentity(collected.root, options.rootIdentity) : await safeDirectoryIdentity(collected.root);
  if (options.rootIdentity && collected.root !== folder) throw new CliError("build_changed", "The selected export root changed during collection.", 1);
  const rows = collected.files.map((file, index) => ({ path: file.path, relative: relative(collected.root, file.source).split(sep).join("/"), size: file.size, target: String(index) }));
  const copied: { path: string; size: number; sha256: string; file: string }[] = [];
  let left = LIMITS.bundle.uncompressedBytesMax;
  for (let start = 0; start < rows.length; start += COPY_BATCH_FILES) {
    const batch = rows.slice(start, start + COPY_BATCH_FILES);
    const reply = await filesystem({ operation: "copy", root: collected.root, identity, destination, maximum: left, files: batch }, options.words);
    const digests = reply.digests;
    if (!Array.isArray(digests) || digests.length !== batch.length) throw helperBroke();
    digests.forEach((row: unknown, index) => {
      const expected = batch[index]!;
      if (!Array.isArray(row) || row[0] !== expected.path || row[1] !== expected.size || typeof row[2] !== "string" || !/^[0-9a-f]{64}$/.test(row[2])) throw helperBroke();
      copied.push({ path: expected.path, size: expected.size, sha256: row[2], file: expected.target });
      left -= expected.size;
    });
  }
  return { ...collected, copied };
}
const COPY_BATCH_FILES = 2048;

/** Files in runs of at most `cap` bytes, in order, and a file bigger than `cap` in a run
 * of its own.
 *
 * The helper answers a read with one JSON document carrying every file as base64, and
 * Node gathers it into one string, which V8 holds to 2^29 - 24 characters: about 400 MB
 * of file bytes. A snapshot of the whole build in one read was fine under the 250 MiB
 * bundle allowance and could not be parsed at all under 1 GiB (28 Oct 2026). Runs of
 * bundle.fileBytesMax keep each reply near 360 MB at most, since no one file may be
 * bigger, and every run still goes through the descriptor-held reader. */
export function readGroups<T extends { size: number }>(files: readonly T[], cap: number): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const file of files) {
    if (current.length && bytes + file.size > cap) {
      groups.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += file.size;
  }
  if (current.length) groups.push(current);
  return groups;
}

export async function writeStage(root: string, target: string, files: Map<string, Uint8Array>) {
  const identity = await lstat(root, { bigint: true });
  function* chunks() {
    for (const bytes of files.values()) {
      for (let offset = 0; offset < bytes.byteLength; offset += 1 << 20) yield bytes.subarray(offset, offset + (1 << 20));
    }
  }
  await filesystem({ operation: "stage-stream", root, identity: { dev: String(identity.dev), ino: String(identity.ino) }, target,
    files: [...files].map(([name, bytes]) => [name, bytes.byteLength]) }, {}, chunks());
}


export async function safeReadFile(root: string, name: string, maximum: number, words: ReadWords = {}): Promise<Buffer> {
  if (!isBundlePath(name)) throw new CliError("build_changed", `The export contains a file path that cannot be read safely: ${name}. Rename it, or finish building, then run the command again.`, 1);
  const base = await realpath(root);
  const identity = await lstat(base, { bigint: true });
  const reply = await filesystem({ operation: "read", root: base, identity: { dev: String(identity.dev), ino: String(identity.ino) }, maximum, allowMissing: true, files: [{ path: name, relative: name }] }, words);
  return Buffer.from(reply.files![0]![1], "base64");
}

/** Binary output avoids base64's string-size ceiling for an explicit large asset.
 * The root must already be canonical: following a replacement symlink here could
 * redirect a saved upload outside the export selected by the current manifest.
 * The same helper validates held directory bindings before releasing any bytes. */
export async function safeReadLargeFile(root: string, name: string, maximum: number, expectedRoot?: DirectoryIdentity): Promise<Buffer> {
  if (!isAbsolute(root) || !isBundlePath(name) || !Number.isSafeInteger(maximum) || maximum < 0 || maximum > LARGEST_ASSET_BYTES) {
    throw new CliError("build_changed", "The external asset has an invalid path or size. Finish building, then run the command again.", 1);
  }
  const base = root, identity = await safeDirectoryIdentity(base, expectedRoot);
  const child = await helper();
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0, overflow = false;
    child.stdout.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > maximum) { overflow = true; child.kill(); return; }
      chunks.push(chunk);
    });
    child.stderr.resume(); child.stdin.on("error", () => {});
    child.once("error", () => reject(new CliError("filesystem_unsupported", PYTHON_MISSING, 2)));
    child.once("close", code => {
      if (code !== 0 || overflow) reject(new CliError("build_changed", "An external asset is missing, changed, or exceeds its size limit. Finish building and retry.", 1));
      else resolve(Buffer.concat(chunks, received));
    });
    child.stdin.end(JSON.stringify({ operation: "read-binary", root: base, identity,
      maximum, files: [{ path: name, relative: name }] }));
  });
}

export type FileDigest = { path: string; byteSize: number; sha256: string };
export type HashProgress = { files: number; bytes: number; totalFiles: number; totalBytes: number };
const ASSET_CHANGED = "An external asset is missing, changed, or exceeds its size limit. Finish building and retry.";
/** A hash job is bounded by both, so progress moves at least every few seconds on a large
 * file and the reply stays a few hundred kilobytes on thousands of small ones. */
const HASH_BATCH_FILES = 1024;
const HASH_BATCH_BYTES = 256 * 1024 * 1024;
const helperBroke = () => new CliError("filesystem_unsupported", "The local export filesystem helper could not run. " + PYTHON_MISSING, 2);

/** Size and SHA-256 of many files under one export root, for an external-asset plan.
 * Reading each file through safeReadLargeFile started one interpreter per file, and OG
 * Clash's 12,979 files kept `check` busy past ten minutes doing little else. This takes a
 * few: one "sizes" job stats every file, so a plan over `totalBytes` is refused before a
 * byte is hashed, then "hash" jobs of bounded size stream the bytes. Every file is reached
 * the way the single read reaches it: relative to a held root whose identity matches,
 * ancestors with O_NOFOLLOW, the leaf by lstat or an O_NOFOLLOW open, regular files only,
 * within `fileBytes`. The hash job also requires the
 * size the first job saw, so the total checked up front is the total that was hashed.
 *
 * A file over `fileBytes`, missing, linked or changed refuses in `words.changed`; over the
 * total refuses with `words.overTotal()`. No bytes come back to Node. */
export async function safeHashFiles(root: string, names: readonly string[], limits: { fileBytes: number; totalBytes: number },
  options: { expectedRoot?: DirectoryIdentity; words?: ReadWords; progress?: (done: HashProgress) => void } = {}): Promise<FileDigest[]> {
  const { fileBytes, totalBytes } = limits;
  if (!isAbsolute(root) || names.some(name => !isBundlePath(name)) || !Number.isSafeInteger(fileBytes) || fileBytes < 0 || fileBytes > LARGEST_ASSET_BYTES ||
      !Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new CliError("build_changed", "The external asset has an invalid path or size. Finish building, then run the command again.", 1);
  }
  const words: ReadWords = { changed: ASSET_CHANGED, ...options.words };
  const identity = await safeDirectoryIdentity(root, options.expectedRoot);
  const job = { root, identity, fileMaximum: fileBytes, totalMaximum: totalBytes };
  const measured = await filesystem({ ...job, operation: "sizes", files: names.map(name => ({ path: name, relative: name })) }, words);
  if (!Array.isArray(measured.sizes) || measured.sizes.length !== names.length ||
      measured.sizes.some(size => !Number.isSafeInteger(size) || size < 0 || size > fileBytes)) throw helperBroke();
  const sizes = measured.sizes as number[];
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total > totalBytes) throw helperBroke();
  const digests: FileDigest[] = [];
  let bytes = 0;
  options.progress?.({ files: 0, bytes: 0, totalFiles: names.length, totalBytes: total });
  for (let start = 0; start < names.length;) {
    let end = start, batchBytes = 0;
    // At least one file per job, however large; otherwise stop at either bound.
    while (end < names.length && end - start < HASH_BATCH_FILES && (end === start || batchBytes + sizes[end]! <= HASH_BATCH_BYTES)) batchBytes += sizes[end++]!;
    const batch = names.slice(start, end).map((name, index) => ({ path: name, relative: name, size: sizes[start + index]! }));
    const reply = await filesystem({ ...job, operation: "hash", totalMaximum: batchBytes, files: batch }, words);
    const rows = reply.digests;
    if (!Array.isArray(rows) || rows.length !== batch.length) throw helperBroke();
    rows.forEach((row: unknown, index) => {
      const expected = batch[index]!;
      if (!Array.isArray(row) || row[0] !== expected.path || row[1] !== expected.size || typeof row[2] !== "string" || !/^[0-9a-f]{64}$/.test(row[2])) throw helperBroke();
      digests.push({ path: expected.path, byteSize: expected.size, sha256: row[2] });
    });
    bytes += batchBytes;
    start = end;
    options.progress?.({ files: digests.length, bytes, totalFiles: names.length, totalBytes: total });
  }
  return digests;
}

/** Several small files in one helper job, for an upload that would otherwise start an
 * interpreter for each. Each must be exactly the size the caller names, and the caller
 * still hashes what comes back. Base64 in JSON, like safeSnapshot, so the caller keeps
 * each call to a few megabytes. */
export async function safeReadFiles(root: string, files: readonly { path: string; byteSize: number }[], words: ReadWords = {}): Promise<Map<string, Buffer>> {
  if (!isAbsolute(root) || files.some(file => !isBundlePath(file.path) || !Number.isSafeInteger(file.byteSize) || file.byteSize < 0 || file.byteSize > LARGEST_ASSET_BYTES)) {
    throw new CliError("build_changed", "The external asset has an invalid path or size. Finish building, then run the command again.", 1);
  }
  const identity = await safeDirectoryIdentity(root);
  const reply = await filesystem({ operation: "read", root, identity, maximum: files.reduce((sum, file) => sum + file.byteSize, 0),
    files: files.map(file => ({ path: file.path, relative: file.path, size: file.byteSize })) }, words);
  return new Map(reply.files!.map(([name, bytes]) => [name, Buffer.from(bytes, "base64")]));
}

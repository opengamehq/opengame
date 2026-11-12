import { constants } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPreflight, matchedRawRuntime } from "./preflight";
import { createHash, randomUUID } from "node:crypto";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { LIMITS } from "@opengame/shared";
import { largeAssetPlanAdmits } from "@opengame/shared/large-assets";
import { detectedIds } from "@opengame/preflight/engines";
import { isBundlePath, moreLead, incrementalZipLocalHeader, incrementalZipDescriptor, incrementalZipCentralHeader, incrementalZipEnd, incrementalCrc32,
  type GameManifest, type IncrementalFile, type RepairFinding } from "@opengame/protocol";
import { PACKAGING_CHECK_VERSION, assertNoReservedRuntimePaths } from "./files";
import { CliError, Output } from "./output";
import { packagingReceipt } from "./packaging-receipt";
import { readableBytes } from "./bytes";
import { vendorDependencies } from "./vendor";
import { canonicalFiles } from "./incremental";
import { removeAtExit, removed, Snapshot } from "./snapshot";
import { BUILD_CHANGED, pythonAvailable, type DirectoryIdentity } from "./safe-fs";
import { prepareRuntimeAssets, validateDeclaredRuntimes, type RuntimeArtifacts } from "./runtime-artifacts";

/** Check and package one snapshot. A build tool editing files after this read
 * cannot change the bytes between preflight and upload. */
export async function inspectArchive(folder: string, manifest: GameManifest, output: Output, options: { vendor?: boolean; artifacts?: RuntimeArtifacts; externalAssets?: ReadonlySet<string>; externalDelivery?: string; rootIdentity?: DirectoryIdentity; workDirectory?: string; planChosen?: boolean } = {}) {
  if (!options.vendor && manifest.runtimes?.length) {
    await validateDeclaredRuntimes(manifest.runtimes, options.artifacts);
    output.emit({ type: "notice", code: "runtime_acquisition_deferred", message: "Runtime declarations match this CLI's reviewed inventory. Runtime bytes have not been acquired by this check; use vendor or dev to acquire and verify them locally. Server runtime derivation still runs before preview." });
  }
  /* Python first. The descriptor-relative helper walks each path from a held directory,
     so an ancestor swapped for a symlink mid-read is caught; Node has no openat, and its
     reader below pins only the last component. Vendor, dev and Unity assets require the
     helper. Check and deploy use it wherever a working interpreter is found, and fall back
     to the Node reader only where none is (Windows, slim images, a pyenv-only shell), so
     that the command people run most still works there. The person is told once, because
     a weaker reader nobody hears about is how the weaker one stays on the common path. */
  const descriptorReader = Boolean(options.vendor || options.externalAssets) || await pythonAvailable();
  if (!descriptorReader) nodeReaderNotice(output);
  const { snapshot, excluded } = await Snapshot.read(folder, { descriptorReader, workDirectory: options.workDirectory, externalAssets: options.externalAssets,
    externalDelivery: options.externalDelivery, rootIdentity: options.rootIdentity, words: options.vendor ? {} : { changed: BUILD_CHANGED } });
  try {
    return await inspectSnapshot(snapshot, excluded, manifest, output, options);
  } catch (error) { await snapshot.dispose(); throw error; }
}

async function inspectSnapshot(snapshot: Snapshot, excluded: string[], manifest: GameManifest, output: Output, options: { vendor?: boolean; artifacts?: RuntimeArtifacts; externalAssets?: ReadonlySet<string>; externalDelivery?: string; planChosen?: boolean }) {
  const inspect = async () => {
    const result = await runPreflight(snapshot.preflightFiles(), undefined, { externalPaths: options.externalAssets ? [...options.externalAssets] : undefined, externalDelivery: options.externalDelivery,
      // opengame.json never reaches the checker as a file; its requires does, from the manifest read here.
      manifestRequires: manifest.requires ?? null, transferBytes: true });
    assertNoReservedRuntimePaths(result.include);
    return result;
  };
  /* opengame.json may still name a cover, and every one written before 30 Oct 2026 can.
     Nothing reads it now: OpenGame makes the cover after approval, so the file is not added
     to the upload and the manifest sent leaves it out (deploy.ts). This used to copy the
     cover in from outside build.output and refuse a build that lacked it, which is how an
     unreadable or oversized picture used to stop a game that played. */
  if (manifest.cover !== undefined) output.emit({ type: "notice", code: "cover_ignored",
    message: "OpenGame now makes your cover after approval, so the cover field in opengame.json is not used. You can remove it." });
  let result = await inspect();
  const originalHashes = new Map([...snapshot.keys()].map(path => [path, snapshot.sha256Of(path)!]));
  const originalRaw = matchedRawRuntime(result, snapshot);
  let dependencies: Awaited<ReturnType<typeof vendorDependencies>> = [];
  if (options.vendor && originalRaw) {
    const staged = await stagedFiles(snapshot, result);
    const runtime = await prepareRuntimeAssets(staged, { references: [], vendor: true,
      raw: { ...originalRaw, path: originalRaw.path.slice(result.strippedRoot.length) }, runtimes: manifest.runtimes, artifacts: options.artifacts });
    for (const [name, bytes] of runtime.files) snapshot.set(result.strippedRoot + name, bytes);
    dependencies.push(...runtime.receipts);
    result = await inspect();
  }
  if (options.vendor && !originalRaw && result.hasEntryPoint && !result.credentialScan?.blocked && !result.findings.some(row => /credential|secret|sensitive/.test(row.code) && row.severity === "blocker")) {
    const staged = await stagedFiles(snapshot, result);
    const vendored = await vendorDependencies(staged, { runtimes: manifest.runtimes, artifacts: options.artifacts });
    dependencies.push(...vendored);
    if (vendored.length) {
      for (const [name, bytes] of staged) snapshot.set(result.strippedRoot + name, bytes);
      output.emit({ type: "notice", code: "dependencies_vendored", message: `Included ${dependencies.length} dependency files at the exact versions your code names, each hashed in the receipt. Rechecking the staged game.`, dependencies });
      result = await inspect();
    }
  }
  /* A plan deploy chose by itself (prepareDeploy) for an engine that plan refuses, such as a
     Kaigen export on the large-game plan, which has a lane of its own, is not the creator's to
     fix: deploy sends the build as one archive instead (the fallback there), and that check
     reports whatever else is wrong. The engine is asked here, with what preflight's own refusal
     reads (every detected engine and every licence stamp), because that refusal needs the
     plan's rows and this check has only its paths: it would pass here, and the server's check,
     which has the rows, would refuse the deploy after the upload. */
  if (options.planChosen && options.externalDelivery
    && !largeAssetPlanAdmits(options.externalDelivery, [...detectedIds(result.engine), ...(result.engine?.licences ?? [])])) {
    throw new CliError("unity_assets_plan", "This build cannot take the file-by-file plan deploy chose for it.", 1);
  }
  const findings: RepairFinding[] = [];
  if (excluded.length) output.emit({ type: "notice", code: "files_excluded", message: `Excluded from upload: ${excluded.join(", ")}`, paths: excluded });
  /* A person reads engine defaults as one line. Each is a name the engine writes and never
     requests (Phaser's phaser.io banner, its file.json download name), so each ended
     "Nothing has to change", and they were half of every Phaser check's output. JSON keeps
     every one, because a tool reading them has no attention to spend. */
  let defaults = 0;
  for (const finding of result.findings) {
    if (finding.severity === "note" && finding.code === "engine-default" && !output.json) { defaults++; continue; }
    if (finding.severity === "note") { output.emit({ type: "notice", code: finding.code, message: [finding.title, finding.detail].filter(Boolean).join(" ") }); continue; }
    const repair = localFinding(finding);
    findings.push(repair); output.emit({ type: "finding", finding: repair });
  }
  if (defaults) output.emit({ type: "notice", code: "engine-default", message: `${defaults === 1 ? "One note" : `${defaults} notes`} about names the engine uses but never loads ${defaults === 1 ? "is" : "are"} hidden. ${defaults === 1 ? "It needs" : "They need"} no change; opengame check --json shows ${defaults === 1 ? "it" : "them"}.` });
  if (!result.ok) throw new CliError("check_failed", "This build has blockers. Fix them, then run opengame check again.", 1);
  const raw = matchedRawRuntime(result, snapshot);
  if (!result.hasEntryPoint && !raw) throw new CliError("entry_missing", "The export has no index.html or complete parser-validated raw payload matching these bytes. Run the build, or point build.output in opengame.json at the folder that holds index.html, then run opengame check again.", 1);
  const packaging = packagingReceipt(snapshot, result.include, result.strippedRoot, excluded, originalHashes, dependencies, originalRaw ? [originalRaw] : raw ? [raw] : []);
  output.emit({ type: "progress", stage: "package", message: `Checked ${result.fileCount} files (${readableBytes(result.totalBytes)})`, files: result.fileCount, bytes: result.totalBytes, limits: LIMITS.bundle });
  return { result, snapshot, excluded, findings, packaging };
}

/** The included files as the Map vendoring takes, by their path in the archive. Only
 * --vendor gets here, and it holds the build in memory as it always has. */
async function stagedFiles(snapshot: Snapshot, result: { include: string[]; strippedRoot: string }) {
  const staged = new Map<string, Uint8Array>();
  // react-doctor-disable-next-line react-doctor/async-await-in-loop
  for (const name of result.include) staged.set(name, await snapshot.bytes(result.strippedRoot + name));
  return staged;
}

let warned = false;
/** Once per run, however many times check runs inside it. */
function nodeReaderNotice(output: Output) {
  if (warned) return;
  warned = true;
  output.emit({ type: "notice", code: "node_reader_fallback", message: "Python 3 not found, so files are read with the Node fallback, which cannot rule out a folder being swapped mid-read. Install Python 3 for the safer reader." });
}

/** A blocker is certain and asks for a change. A warning does not stop the
 * upload: the engine and layout guesses are confirmed by a person, so an agent
 * is told there is nothing to change, rather than rewriting working code over a
 * guess; the rest are worth a look but can ship as they are. */
export function localFinding(finding: { code: string; severity: string; title: string; detail?: string; path?: string; line?: number; more?: string[]; ours?: true }): RepairFinding {
  const file = finding.path ? finding.path + (finding.line ? `:${finding.line}` : "") : undefined;
  // The names lead the fix; protocol's moreLead says why, and the server's receipt uses it too.
  const named = moreLead(finding.code, finding.more);
  const base = { release: null, check: finding.code, checkVersion: PACKAGING_CHECK_VERSION,
    evidence: { observed: finding.title, ...(file ? { file } : {}) } };
  if (finding.severity === "blocker") return { ...base, state: "failed", certainty: "certain", fault: "game",
    fix: named + (finding.detail ?? "Update your build."), verify: "opengame check, then opengame deploy", retry: "after-fix" };
  // `ours` is preflight saying the warning is about code OpenGame ships, such as the SDK
  // inside the game's bundle. It said fault "game", retry "now" before, which asked an
  // agent to edit OpenGame's own code in the starter to silence it.
  const confirmed = finding.code === "platform-engine" || finding.code === "platform-desktop" || finding.ours === true;
  return { ...base, state: "inconclusive", certainty: "heuristic", fault: confirmed ? "unknown" : "game",
    fix: confirmed ? (finding.ours ? finding.detail ?? "Nothing has to change." : `${finding.detail ?? ""} Nothing has to change now; you can deploy as it is.`.trim()) : named + (finding.detail ?? "Check this before you publish. It does not block a deploy."),
    verify: "opengame deploy", retry: confirmed ? "never" : "now" };
}

/** A packaged archive on disk. Everything after packaging reads it a range at a time:
 * the upload sends it in parts, and a resumed deploy reads the same file back.
 *
 * `blocks` is the SHA-256 of each BLOCK_BYTES of it, taken as it was written (or, for a
 * saved archive, as it was verified), and every read is checked against them. The archive
 * sits in .opengame between packaging and the last part, which for 4 GiB is a long time,
 * and the upload used to send bytes held in memory since they were checked; this keeps
 * that promise without holding them: a file changed underneath stops the upload instead
 * of sending bytes nobody checked. `bytes` is the archive itself when it is small enough
 * to keep as before (deploy.ts keeps the ones that go in one PUT). */
export type PackedArchive = { file: string; byteSize: number; sha256: string; blocks: string[]; bytes?: Uint8Array };
export const BLOCK_BYTES = 1 << 20;

export async function createArchive(folder: string, manifest: GameManifest, output: Output, options: { vendor?: boolean; incremental?: boolean; artifacts?: RuntimeArtifacts; externalAssets?: ReadonlySet<string>; externalDelivery?: string; rootIdentity?: DirectoryIdentity;
  /** Where the snapshot and the archive are written: the project's .opengame folder for a
   * deploy, so the archive is already beside its cache and on the build's own disk. A new
   * private folder in the system's temporary folder when none is named. */
  workDirectory?: string;
  /** deploy chose the asset plan itself, so a refusal of the plan is a fallback, not a finding. */
  planChosen?: boolean } = {}) {
  const owned = options.workDirectory ? null : await mkdtemp(join(tmpdir(), "opengame-archive-"));
  if (owned) removeAtExit(owned);
  const workDirectory = options.workDirectory ?? owned!;
  try {
    const { result, snapshot, packaging } = await inspectArchive(folder, manifest, output, { ...options, workDirectory });
    try {
      const entries: string[] = [];
      let uncompressed = 0;
      for (const path of result.include) {
        const size = snapshot.sizeOf(result.strippedRoot + path);
        if (size === undefined) throw new CliError("archive_changed", "The archive could not be assembled. Run opengame check again.", 1);
        entries.push(path);
        uncompressed += size;
      }
      /* Deflated, unless that makes the archive look like a decompression bomb.
         It was always stored (level 0), so that no archive could trip the archive stage's
         ratio guard. But the archive cap is below the uncompressed cap, so
         a stored archive rejected games over the archive cap, including ones whose scripts and
         data compress well enough to fit, which the web uploader's deflated zip accepts. The
         guard is the whole archive's ratio, so it is checked on the result, and an archive
         past it is built again stored, which is the most a game can ever expand by. */
      if (options.externalAssets && result.strippedRoot) throw new CliError("unity_assets_plan", "The export must have index.html at its root, because external asset paths are never rewritten. Point build.output in opengame.json at the folder that holds index.html, and write the asset plan's paths from there.", 2);
      const read = (path: string) => snapshot.chunks(result.strippedRoot + path, SLICE_BYTES);
      const files = options.incremental ? canonicalFiles(entries.map(path => ({ path, sha256: snapshot.sha256Of(result.strippedRoot + path)!, byteSize: snapshot.sizeOf(result.strippedRoot + path)! }))) : null;
      if (options.externalAssets && !files) {
        /* canonicalFiles refuses for a path as readily as for a size, and this used to say
           "exceed the limit" for both. On 27 Oct 2026 World at War Zombies was refused here for
           41 textures named like barbedwire_1_c#0.iwi: a path no bundle may hold, which the
           large-asset rule also declines, so they stayed in the boot set and failed it. Name
           the path, because nobody fixes a size they are not over. */
        const unnamed = entries.filter(path => !isBundlePath(path));
        if (unnamed.length) throw new CliError("unportable_name", `${unnamed[0]} cannot be uploaded: a file path may not contain # ? % : or a backslash${unnamed.length > 1 ? ` (${unnamed.length} files in all)` : ""}. Rename ${unnamed.length > 1 ? "them" : "it"} and the code that loads ${unnamed.length > 1 ? "them" : "it"}, then run opengame check.`, 1);
        throw new CliError("archive_limit", `The boot files are ${entries.length} files and ${readableBytes(uncompressed)}, past the ordinary upload limits of ${LIMITS.bundle.fileCountMax} files and ${readableBytes(LIMITS.platform.incrementalUpload.archiveBytesMax)} for file transport. Send more of them as external assets.`, 1);
      }
      const file = join(workDirectory, `archive-${randomUUID()}.zip`);
      try {
        output.emit({ type: "progress", stage: "package", message: `Packaging ${entries.length} files (${readableBytes(uncompressed)})`, files: entries.length, bytes: uncompressed });
        let packed = files ? await writeCanonicalArchive(file, files, read) : await writeZip(file, entries, 6, read);
        if (!files && uncompressed / Math.max(packed.byteSize, 1) > LIMITS.bundle.compressionRatioMax) packed = await writeZip(file, entries, 0, read);
        /* The archive is a plain ZIP: 32-bit offsets and a 16-bit entry count. Every cap in
           limits.json sits inside both today; this refuses rather than writing an archive
           an unzipper would read wrong if one of them is ever raised past them. */
        if (packed.byteSize > LIMITS.bundle.archiveBytesMax || packed.byteSize >= 0xffffffff || entries.length > 0xffff) throw new CliError("archive_limit", `The packaged game is ${Math.ceil(packed.byteSize / 1048576)} MiB and the most an upload can be is ${Math.floor(LIMITS.bundle.archiveBytesMax / 1048576)} MiB. Remove unused assets or compress large media, then run opengame deploy.`, 1);
        return { file, byteSize: packed.byteSize, sha256: packed.sha256, blocks: packed.blocks, fileCount: result.fileCount, packaging, incremental: files,
          /** Remove what this packaging left on disk. A deploy moves the archive into its cache first. */
          dispose: async () => { await rm(owned ?? file, { recursive: true, force: true }); if (owned) removed(owned); } };
      } catch (error) { await rm(file, { force: true }); throw error; }
    } finally { await snapshot.dispose(); }
  } catch (error) { if (owned) { await rm(owned, { recursive: true, force: true }); removed(owned); } throw error; }
}

/** The bytes of a packaged archive, `length` of them from `offset`, each block of them
 * checked against the digest taken when it was written. */
export async function readArchiveRange(archive: PackedArchive, offset: number, length: number): Promise<Uint8Array> {
  if (archive.bytes) return archive.bytes.subarray(offset, offset + length);
  const first = Math.floor(offset / BLOCK_BYTES), start = first * BLOCK_BYTES;
  const end = Math.min(archive.byteSize, Math.ceil((offset + length) / BLOCK_BYTES) * BLOCK_BYTES);
  const handle = await open(archive.file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => { throw archiveChanged(); });
  try {
    const buffer = Buffer.allocUnsafe(end - start);
    let read = 0;
    while (read < buffer.length) {
      const result = await handle.read(buffer, read, buffer.length - read, start + read);
      if (!result.bytesRead) throw archiveChanged();
      read += result.bytesRead;
    }
    for (let block = first, at = 0; at < buffer.length; block++, at += BLOCK_BYTES) {
      if (createHash("sha256").update(buffer.subarray(at, at + BLOCK_BYTES)).digest("hex") !== archive.blocks[block]) throw archiveChanged();
    }
    return buffer.subarray(offset - start, offset - start + length);
  } finally { await handle.close(); }
}

const archiveChanged = () => new CliError("archive_unavailable", "The saved upload archive is missing or changed. Run opengame status first. To start a new deploy, use opengame deploy --idempotency-key with a new key.", 1);

/** Whole-archive and per-block digests over bytes fed in order, however they are cut. */
export function archiveDigest() {
  const whole = createHash("sha256");
  const blocks: string[] = [];
  let block = createHash("sha256"), inBlock = 0, byteSize = 0;
  return {
    update(chunk: Uint8Array) {
      whole.update(chunk);
      byteSize += chunk.byteLength;
      for (let at = 0; at < chunk.byteLength;) {
        const take = Math.min(BLOCK_BYTES - inBlock, chunk.byteLength - at);
        block.update(chunk.subarray(at, at + take));
        inBlock += take; at += take;
        if (inBlock === BLOCK_BYTES) { blocks.push(block.digest("hex")); block = createHash("sha256"); inBlock = 0; }
      }
    },
    finish() {
      if (inBlock) blocks.push(block.digest("hex"));
      return { byteSize, sha256: whole.digest("hex"), blocks };
    },
  };
}

/** One slice of a file at a time goes into the compressor, so memory is a slice and its
 * output, whatever the build's size. The same size Drop pushes (drop/zip-archive.ts). */
const SLICE_BYTES = 1 << 20;

/** Appends to `file`, hashing as it goes, with each write finished before the next. */
async function archiveWriter(file: string) {
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  const digest = archiveDigest();
  return {
    async write(chunk: Uint8Array) {
      for (let offset = 0; offset < chunk.byteLength;) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
        if (!bytesWritten) throw new CliError("archive_changed", "The archive could not be written. Check the free space on this disk, then run opengame deploy again.", 1);
        offset += bytesWritten;
      }
      digest.update(chunk);
    },
    async finish() { await handle.sync(); await handle.close(); return digest.finish(); },
    async abandon() { await handle.close().catch(() => {}); },
  };
}

/** Fixed timestamps, so an unchanged project produces the same archive and retry digest.
 * Already-compressed media is stored at any level: deflating a PNG spends time to gain nothing.
 *
 * fflate's streaming Zip, fed a slice at a time, written to disk between slices. Until
 * 11 Nov 2026 this was fflate's zip(), which takes every file's bytes at once and returns
 * the whole archive, so the archive and the build were both in memory. The streaming
 * format writes each entry's sizes after its data (a data descriptor), which every
 * unzipper and the pipeline read, and which Drop's archives have always used; it also
 * takes names directly, so a file named __proto__ needs no path of its own. */
async function writeZip(file: string, entries: readonly string[], level: 0 | 6, read: (path: string) => AsyncIterable<Uint8Array>) {
  const writer = await archiveWriter(file);
  const pending: Uint8Array[] = [];
  let failure: unknown = null;
  const archive = new Zip((error, chunk) => { if (error) failure = error; else pending.push(chunk); });
  const drain = async () => {
    if (failure) throw failure;
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    while (pending.length) await writer.write(pending.shift()!);
  };
  try {
    for (const path of entries) {
      const entry = level && !PRECOMPRESSED.test(path) ? new ZipDeflate(path, { level }) : new ZipPassThrough(path);
      entry.mtime = new Date(1980, 0, 1);
      archive.add(entry);
      let previous: Uint8Array | null = null;
      // One slice behind, so the last one goes in marked final.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      for await (const slice of read(path)) {
        if (previous) { entry.push(previous, false); await drain(); }
        previous = slice;
      }
      entry.push(previous ?? new Uint8Array(0), true);
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await drain();
    }
    archive.end();
    await drain();
    return await writer.finish();
  } catch (error) { archive.terminate(); await writer.abandon(); throw error; }
}

/** The file transport's canonical stored archive (incremental.ts canonicalArchive), the
 * same bytes, written a file at a time. */
async function writeCanonicalArchive(file: string, files: readonly IncrementalFile[], read: (path: string) => AsyncIterable<Uint8Array>) {
  const writer = await archiveWriter(file);
  try {
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const entry of files) {
      const head = incrementalZipLocalHeader(entry.path);
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await writer.write(head);
      let crc = 0, size = 0;
      const digest = createHash("sha256");
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      for await (const slice of read(entry.path)) { crc = incrementalCrc32(slice, crc); size += slice.byteLength; digest.update(slice); await writer.write(slice); }
      if (size !== entry.byteSize || digest.digest("hex") !== entry.sha256) throw new CliError("archive_changed", "The archive could not be assembled. Run opengame check again.", 1);
      const descriptor = incrementalZipDescriptor(crc, size);
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      await writer.write(descriptor);
      central.push(incrementalZipCentralHeader(entry.path, crc, size, offset));
      offset += head.byteLength + size + descriptor.byteLength;
    }
    let directoryBytes = 0;
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    for (const record of central) { await writer.write(record); directoryBytes += record.byteLength; }
    await writer.write(incrementalZipEnd(files.length, directoryBytes, offset));
    return await writer.finish();
  } catch (error) { await writer.abandon(); throw error; }
}

const PRECOMPRESSED = /\.(?:png|jpe?g|gif|webp|avif|mp3|ogg|oga|opus|m4a|aac|mp4|webm|woff2?|br)$/i;

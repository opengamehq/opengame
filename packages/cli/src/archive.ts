import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { runPreflight, snapshotPreflightFiles, matchedRawRuntime } from "./preflight";
import { createHash } from "node:crypto";
import { zip, Zip, ZipDeflate, ZipPassThrough, type Zippable } from "fflate";
import { LIMITS } from "@opengame/shared";
import { isBundlePath, moreLead, type GameManifest, type RepairFinding } from "@opengame/protocol";
import { PACKAGING_CHECK_VERSION, collectFiles, isExcludedPath, assertNoReservedRuntimePaths } from "./files";
import { CliError, Output } from "./output";
import { packagingReceipt } from "./packaging-receipt";
import { readableBytes } from "./bytes";
import { vendorDependencies } from "./vendor";
import { canonicalArchive } from "./incremental";
import { BUILD_CHANGED, pythonAvailable, safeReadFile, safeSnapshot, type DirectoryIdentity } from "./safe-fs";
import { prepareRuntimeAssets, validateDeclaredRuntimes, type RuntimeArtifacts } from "./runtime-artifacts";

/** Check and package one snapshot. A build tool editing files after this read
 * cannot change the bytes between preflight and upload. */
export async function inspectArchive(folder: string, manifest: GameManifest, output: Output, projectRoot = folder, options: { vendor?: boolean; artifacts?: RuntimeArtifacts; externalAssets?: ReadonlySet<string>; externalDelivery?: string; rootIdentity?: DirectoryIdentity } = {}) {
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
  const safe = descriptorReader ? await safeSnapshot(folder, { externalAssets: options.externalAssets, externalDelivery: options.externalDelivery, rootIdentity: options.rootIdentity,
    words: options.vendor ? {} : { changed: BUILD_CHANGED } }) : undefined;
  const collected = safe ?? await collectFiles(folder);
  const snapshot: Map<string, Uint8Array> = safe?.snapshot ?? new Map();
  if (!safe) {
    let total = 0;
    for (const file of collected.files) {
      const path = file.source;
      if (await realpath(path) !== path) throw new CliError("symlink", "The build changed while being read. Finish building, then run opengame deploy again.", 1);
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== file.size) throw new CliError("build_changed", "The build changed while being read. Finish building, then run opengame deploy again.", 1);
        total += stat.size;
        if (total > LIMITS.bundle.uncompressedBytesMax) throw new CliError("bundle_limit", `The build is over ${readableBytes(LIMITS.bundle.uncompressedBytesMax)} uncompressed. Remove what the game does not load, then run opengame check.`, 1);
        const buffer = Buffer.alloc(stat.size + 1);
        let read = 0;
        while (read < buffer.length) {
          const result = await handle.read(buffer, read, buffer.length - read, read);
          if (!result.bytesRead) break;
          read += result.bytesRead;
        }
        const after = await handle.stat();
        if (read !== stat.size || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size) throw new CliError("build_changed", "The build changed while being read. Finish building, then run opengame deploy again.", 1);
        snapshot.set(file.path, buffer.subarray(0, read));
      } finally { await handle.close(); }
    }
  }
  const inspect = async () => {
    const result = await runPreflight(snapshotPreflightFiles(snapshot), undefined, { externalPaths: options.externalAssets ? [...options.externalAssets] : undefined, externalDelivery: options.externalDelivery,
      // opengame.json never reaches the checker as a file; its requires does, from the manifest read here.
      manifestRequires: manifest.requires ?? null });
    assertNoReservedRuntimePaths(result.include);
    return result;
  };
  // Covers are project assets. Build tools need not copy marketing artwork into
  // dist; include that one declared file under the normalized game root.
  async function includeCover(prefix: string): Promise<boolean> {
    if (!manifest.cover || options.externalAssets?.has(manifest.cover) || !isBundlePath(manifest.cover) || isExcludedPath(manifest.cover)) return false;
    try {
      const tooLarge = () => new CliError("cover_size", "The cover is empty or exceeds the image size limit.", 1);
      const bytes = !descriptorReader ? await nodeCover(projectRoot, manifest.cover) : await safeReadFile(projectRoot, manifest.cover, LIMITS.platform.moderation.imageBytesMax, { tooLarge,
        changed: "The cover changed while being read. Run opengame check again." }).catch(async error => {
        /* The helper says build_changed for a link on the path and for a file that changed
           under the read alike. Which one it was is only a question of what to tell the
           person, so it is asked afterwards, by path, and decides nothing about the bytes. */
        if (error instanceof CliError && error.code === "build_changed" && await linked(projectRoot, manifest.cover!)) {
          throw new CliError("symlink", "The cover must be a regular file inside your project.", 1);
        }
        throw error;
      });
      if (!bytes.length) throw new CliError("cover_size", "The cover is empty or exceeds the image size limit.", 1);
      const target = prefix + manifest.cover;
      if (snapshot.has(target)) throw new CliError("cover_missing", "The declared cover was excluded by the checker. Choose a supported project asset.", 1);
      snapshot.set(target, bytes);
      output.emit({ type: "notice", code: "cover_included", message: `Included project cover: ${manifest.cover}` });
      return true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return false;
  }
  // An entry at the build root fixes the archive root already. Include its
  // cover before scanning so the common case checks source only once.
  if (snapshot.has(LIMITS.bundle.entryPoint) && manifest.cover && !snapshot.has(manifest.cover)) await includeCover("");
  let result = await inspect();
  const originalHashes = new Map([...snapshot].map(([path, bytes]) => [path, createHash("sha256").update(bytes).digest("hex")]));
  const originalRaw = matchedRawRuntime(result, snapshot);
  let dependencies: Awaited<ReturnType<typeof vendorDependencies>> = [];
  if (options.vendor && originalRaw) {
    const staged = new Map(result.include.map(name => [name, snapshot.get(result.strippedRoot + name)!]));
    const runtime = await prepareRuntimeAssets(staged, { references: [], vendor: true,
      raw: { ...originalRaw, path: originalRaw.path.slice(result.strippedRoot.length) }, runtimes: manifest.runtimes, artifacts: options.artifacts });
    for (const [name, bytes] of runtime.files) snapshot.set(result.strippedRoot + name, bytes);
    dependencies.push(...runtime.receipts);
    result = await inspect();
  }
  if (options.vendor && !originalRaw && result.hasEntryPoint && !result.credentialScan?.blocked && !result.findings.some(row => /credential|secret|sensitive/.test(row.code) && row.severity === "blocker")) {
    const staged = new Map(result.include.map(name => [name, snapshot.get(result.strippedRoot + name)!]));
    const vendored = await vendorDependencies(staged, { runtimes: manifest.runtimes, artifacts: options.artifacts });
    dependencies.push(...vendored);
    if (vendored.length) {
      for (const [name, bytes] of staged) snapshot.set(result.strippedRoot + name, bytes);
      output.emit({ type: "notice", code: "dependencies_vendored", message: `Included ${dependencies.length} dependency files at the exact versions your code names, each hashed in the receipt. Rechecking the staged game.`, dependencies });
      result = await inspect();
    }
  }
  if ((result.hasEntryPoint || matchedRawRuntime(result, snapshot)) && manifest.cover && !result.include.includes(manifest.cover) && await includeCover(result.strippedRoot)) result = await inspect();
  const findings: RepairFinding[] = [];
  if (collected.excluded.length) output.emit({ type: "notice", code: "files_excluded", message: `Excluded from upload: ${collected.excluded.join(", ")}`, paths: collected.excluded });
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
  if (manifest.cover && !result.include.includes(manifest.cover) && !options.externalAssets?.has(manifest.cover)) throw new CliError("cover_missing", "The cover in opengame.json is missing from the packaged game. Fix its path, then run opengame deploy.", 1);
  const raw = matchedRawRuntime(result, snapshot);
  if (!result.hasEntryPoint && !raw) throw new CliError("entry_missing", "The export has no HTML entry or complete parser-validated raw payload matching these bytes.", 1);
  const packaging = packagingReceipt(snapshot, result.include, result.strippedRoot, collected.excluded, originalHashes, dependencies, originalRaw ? [originalRaw] : raw ? [raw] : []);
  output.emit({ type: "progress", stage: "package", message: `Checked ${result.fileCount} files (${readableBytes(result.totalBytes)})`, files: result.fileCount, bytes: result.totalBytes, limits: LIMITS.bundle });
  return { result, snapshot, excluded: collected.excluded, findings, packaging };
}

let warned = false;
/** Once per run, however many times check runs inside it. */
function nodeReaderNotice(output: Output) {
  if (warned) return;
  warned = true;
  output.emit({ type: "notice", code: "node_reader_fallback", message: "Python 3 not found, so files are read with the Node fallback, which cannot rule out a folder being swapped mid-read. Install Python 3 for the safer reader." });
}

/** The Node reader's copy of the cover read, used only beside the Node snapshot above. */
async function nodeCover(projectRoot: string, cover: string): Promise<Uint8Array> {
  const sourceRoot = await realpath(projectRoot);
  const sourcePath = join(sourceRoot, cover);
  let file;
  try {
    if (await realpath(sourcePath) !== sourcePath) throw new CliError("symlink", "The cover must be a regular file inside your project.", 1);
    file = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > LIMITS.platform.moderation.imageBytesMax) throw new CliError("cover_size", "The cover is empty or exceeds the image size limit.", 1);
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) { const chunk = await file.read(bytes, offset, bytes.length - offset, offset); if (!chunk.bytesRead) break; offset += chunk.bytesRead; }
    const after = await file.stat();
    if (offset !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new CliError("build_changed", "The cover changed while being read. Run opengame check again.", 1);
    return bytes.subarray(0, offset);
  } finally { await file?.close(); }
}

/** True when the cover's own path, below the project root, runs through a symlink. */
async function linked(root: string, name: string): Promise<boolean> {
  let path = root;
  for (const part of name.split("/")) {
    path = join(path, part);
    try { if ((await lstat(path)).isSymbolicLink()) return true; } catch { return false; }
  }
  return false;
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

export async function createArchive(folder: string, manifest: GameManifest, output: Output, projectRoot = folder, options: { vendor?: boolean; incremental?: boolean; artifacts?: RuntimeArtifacts; externalAssets?: ReadonlySet<string>; externalDelivery?: string; rootIdentity?: DirectoryIdentity } = {}) {
  const { result, snapshot, packaging } = await inspectArchive(folder, manifest, output, projectRoot, options);
  const entries: [string, Uint8Array][] = [];
  let uncompressed = 0;
  for (const path of result.include) {
    const bytes = snapshot.get(result.strippedRoot + path);
    if (!bytes) throw new CliError("archive_changed", "The archive could not be assembled. Run opengame check again.", 1);
    entries.push([path, bytes]);
    uncompressed += bytes.byteLength;
  }
  /* Deflated, unless that makes the archive look like a decompression bomb.
     It was always stored (level 0), so that no archive could trip the archive stage's
     ratio guard. But the archive cap is below the uncompressed cap, so
     a stored archive rejected games over the archive cap, including ones whose scripts and
     data compress well enough to fit, which the web uploader's deflated zip accepts. The
     guard is the whole archive's ratio, so it is checked on the result, and an archive
     past it is built again stored, which is the most a game can ever expand by. */
  if (options.externalAssets && result.strippedRoot) throw new CliError("unity_assets_plan", "The export must have index.html at its root; external asset paths are never rewritten.", 2);
  const incremental = options.incremental ? canonicalArchive(entries) : null;
  if (options.externalAssets && !incremental) {
    /* canonicalArchive refuses for a path as readily as for a size, and this used to say
       "exceed the limit" for both. On 27 Oct 2026 World at War Zombies was refused here for
       41 textures named like barbedwire_1_c#0.iwi: a path no bundle may hold, which the
       large-asset rule also declines, so they stayed in the boot set and failed it. Name
       the path, because nobody fixes a size they are not over. */
    const unnamed = entries.map(([path]) => path).filter(path => !isBundlePath(path));
    if (unnamed.length) throw new CliError("unportable_name", `${unnamed[0]} cannot be uploaded: a file path may not contain # ? % : or a backslash${unnamed.length > 1 ? ` (${unnamed.length} files in all)` : ""}. Rename ${unnamed.length > 1 ? "them" : "it"} and the code that loads ${unnamed.length > 1 ? "them" : "it"}, then run opengame check.`, 1);
    throw new CliError("archive_limit", `The boot files are ${entries.length} files and ${readableBytes(uncompressed)}, past the ordinary upload limits of ${LIMITS.bundle.fileCountMax} files and ${readableBytes(LIMITS.platform.incrementalUpload.archiveBytesMax)} for file transport. Send more of them as external assets.`, 1);
  }
  let bytes = incremental?.bytes ?? await zipEntries(entries, 6);
  if (uncompressed / Math.max(bytes.byteLength, 1) > LIMITS.bundle.compressionRatioMax) bytes = await zipEntries(entries, 0);
  if (bytes.byteLength > LIMITS.bundle.archiveBytesMax) throw new CliError("archive_limit", `The packaged game is ${Math.ceil(bytes.byteLength / 1048576)} MiB and the most an upload can be is ${Math.floor(LIMITS.bundle.archiveBytesMax / 1048576)} MiB. Remove unused assets or compress large media, then run opengame deploy.`, 1);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), fileCount: result.fileCount, packaging, incremental: incremental?.files ?? null };
}

/** Fixed timestamps, so an unchanged project produces the same archive and retry digest.
 * Already-compressed media is stored at any level: deflating a PNG spends time to gain nothing. */
function zipEntries(entries: [string, Uint8Array][], level: 0 | 6): Promise<Uint8Array> {
  // fflate's object-flattening zip() loses a literal root __proto__ key even
  // from a null-prototype input. Its file-stream API takes names directly.
  // Keep the usual byte format for all unaffected archives.
  if (entries.some(([path]) => path === "__proto__")) {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      const archive = new Zip((error, chunk, final) => {
        if (error) { reject(error); return; }
        chunks.push(chunk);
        if (final) resolve(Buffer.concat(chunks));
      });
      try {
        for (const [path, bytes] of entries) {
          const file = level && !PRECOMPRESSED.test(path) ? new ZipDeflate(path, { level }) : new ZipPassThrough(path);
          file.mtime = new Date(1980, 0, 1);
          archive.add(file);
          file.push(bytes, true);
        }
        archive.end();
      } catch (error) { archive.terminate(); reject(error); }
    });
  }
  const files: Zippable = Object.create(null);
  for (const [path, bytes] of entries) {
    files[path] = [bytes, { mtime: new Date(1980, 0, 1), level: level && !PRECOMPRESSED.test(path) ? level : 0 }];
  }
  return new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
}

const PRECOMPRESSED = /\.(?:png|jpe?g|gif|webp|avif|mp3|ogg|oga|opus|m4a|aac|mp4|webm|woff2?|br)$/i;

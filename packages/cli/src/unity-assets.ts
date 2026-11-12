import { createHash } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { LARGE_ASSET_DELIVERIES, LARGE_ASSET_DELIVERY, compareAssetPaths, isLargeAssetPath, largeAssetInputText, largeAssetLimits, largeAssetPlan, validateLargeAssetFiles, type LargeAssetFile } from "@opengame/shared/large-assets";
import { largeAssetStatement } from "@opengame/shared/large-asset-statement";
import { canonicalName } from "@opengame/shared/unicode-casefold";
import { incrementalArchiveBytes, isBundlePath, type GameManifest, type IncrementalFile } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { createArchive } from "./archive";
import { readableBytes } from "./bytes";
import { isExcludedPath, loadManifest, outputFolder, withoutBom } from "./files";
import { safeHashFiles, safeReadFile, safeReadFiles, safeReadLargeFile, safeDirectoryIdentity } from "./safe-fs";
import { CliError, type Output } from "./output";

/* One module for every external-asset plan kind in limits.json largeAssetPlans. It is
   still named for Unity, the first kind, because the saved project state and the flag
   that came first say "unity"; `--external-assets` is the general flag and
   `--unity-assets` stays as the Unity spelling of it. */
export { LARGE_ASSET_DELIVERY };
/** `delivery` is absent in state saved before the Kaigen lane, which means Unity. */
export type UnityAssetsState = { assets: LargeAssetFile[]; inputDigest: string; sourceRoot: string; delivery?: string };
export const planDelivery = (state: { delivery?: string } | undefined) => state?.delivery ?? LARGE_ASSET_DELIVERY;
const invalidPlan = () => new CliError("unity_assets_plan", "Use an asset plan such as {\"assets\":[\"Build/game.data\"]} for Unity, {\"delivery\":\"kaigen-assets-v1\",\"assets\":[\"cooked/\",\"oc_heads/\"]} for Kaigen, or {\"delivery\":\"large-game-v1\",\"assets\":\"auto\"} for a large game no recognised engine made, where \"auto\" lets opengame choose the files. List files relative to the export root; a path ending in / takes every eligible file under that folder. Code (HTML, JavaScript, CSS, wasm) always stays in the boot archive.", 2);

/** A plan file is `{"assets": [...]}` for Unity, as it always was, or
 * `{"delivery": "<kind>", "assets": [...]}` for any kind. Under --unity-assets the
 * kind can only be Unity's. Entries ending in "/" are folders, expanded on disk later.
 * A kind with `autoSplit` in limits.json (large-game-v1) also takes `"assets": "auto"`,
 * which hands the choice to autoSplitAssets: a decompilation of 26,200 files has no
 * folder layout anybody could be expected to describe by hand. */
export function parseAssetPlan(value: unknown, unityOnly = true): { delivery: string; paths: string[]; folders: string[]; auto?: true } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidPlan();
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  const delivery = row.delivery === undefined ? LARGE_ASSET_DELIVERY : row.delivery;
  const limits = typeof delivery === "string" ? largeAssetLimits(delivery) : null;
  if (!limits || (unityOnly && delivery !== LARGE_ASSET_DELIVERY) || keys.some(key => key !== "assets" && key !== "delivery")) throw invalidPlan();
  if (row.assets === "auto") {
    if (!largeAssetPlan(delivery)?.autoSplit) throw invalidPlan();
    return { delivery: delivery as string, paths: [], folders: [], auto: true };
  }
  if (!Array.isArray(row.assets) || !row.assets.length || row.assets.length > limits.fileCountMax) throw invalidPlan();
  const paths: string[] = [], folders: string[] = [];
  const seen = new Set<string>();
  for (const path of row.assets) {
    if (typeof path !== "string" || seen.has(canonicalName(path))) throw invalidPlan();
    seen.add(canonicalName(path));
    // Folders are a convenience for a 13,000-file export; Unity's plan never had them.
    if (path.endsWith("/") && delivery !== LARGE_ASSET_DELIVERY) {
      const folder = path.slice(0, -1);
      if (!isBundlePath(folder) || isExcludedPath(folder) || folder.split("/")[0]!.toLowerCase() === "_og") throw invalidPlan();
      folders.push(folder); continue;
    }
    if (!isLargeAssetPath(path, delivery as string) || isExcludedPath(path)) throw invalidPlan();
    paths.push(path);
  }
  return { delivery: delivery as string, paths: paths.sort(compareAssetPaths), folders };
}

/** The Unity plan's paths, as this function has always answered. */
export function parseUnityAssetPlan(value: unknown): string[] {
  return parseAssetPlan(value, true).paths;
}

export function unityInputDigest(boot: { sha256: string; byteSize: number }, assets: readonly LargeAssetFile[], delivery: string = LARGE_ASSET_DELIVERY) {
  return createHash("sha256").update(largeAssetInputText(boot, assets, delivery)).digest("hex");
}

/** Every regular file under one folder of the export ("" is the export root), by bundle
 * path, with its size from lstat. The project's own files are skipped the way
 * collectFiles skips them, so nothing the boot archive would never carry can leave it
 * as an asset either: large-game-v1's path rule admits opengame.json, which no
 * suffix-list kind ever did. Links are refused rather than followed, as everywhere else
 * the CLI reads an export, and a folder that is not a real directory is a bad plan. */
async function walkExport(sourceRoot: string, folder: string, visit: (path: string, byteSize: number) => void): Promise<void> {
  const walk = async (relative: string) => {
    const full = relative ? join(sourceRoot, relative) : sourceRoot;
    const stat = await lstat(full).catch(() => null);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory() || await realpath(full) !== full) throw invalidPlan();
    for (const entry of await readdir(full, { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (isExcludedPath(path) || entry.name === "opengame.json" || path === "opengame-assets") continue;
      if (entry.isSymbolicLink()) throw new CliError("symlink", `${path} is a symlink. External assets must be regular files inside the build folder, so copy the actual file there in its place.`, 1);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) visit(path, (await lstat(join(full, entry.name))).size);
    }
  };
  await walk(folder);
}

/** Every eligible regular file under one folder of the export. A file the plan kind does
 * not admit stays in the boot archive, as it would unlisted. */
async function expandFolder(sourceRoot: string, folder: string, delivery: string): Promise<string[]> {
  const found: string[] = [];
  await walkExport(sourceRoot, folder, path => { if (isLargeAssetPath(path, delivery)) found.push(path); });
  return found;
}

/**
 * The files a plan whose assets is "auto" sends separately, chosen from sizes alone, by
 * the rule limits.json writes beside autoSplit so the docs and this code cannot drift:
 *
 * every file the kind's path rule admits and at least fileBytesMin long leaves; then,
 * while the boot archive is over the file-assembly size or bundle.fileCountMax, the
 * largest file still eligible leaves too, ties broken by compareAssetPaths. opengame.json
 * never leaves. The manifest's cover was held back too until 30 Oct 2026, when the CLI
 * stopped uploading it, so a picture in the export is now an asset like any other.
 *
 * The boot size is the canonical stored ZIP the server holds the plan to
 * (incrementalArchiveBytes, the same arithmetic as platform_begin_large_asset_deploy), not
 * a deflated guess, because that is the number a refusal would be measured in. It counts
 * every file the walk keeps, which can only overstate the archive collectFiles later
 * builds, so the worst an estimate costs is one more file sent separately.
 *
 * Deterministic on purpose: a resumed deploy re-runs this against the same export and has
 * to arrive at the same list, or its input digest changes and the saved upload is lost.
 * Sizes only, from lstat; the hashing is readUnityAssetPlan's, after the choice.
 */
export async function autoSplitAssets(sourceRoot: string, delivery: string): Promise<string[]> {
  const plan = largeAssetPlan(delivery), limits = largeAssetLimits(delivery);
  if (!plan?.autoSplit || !limits) throw invalidPlan();
  const archiveMax = Math.min(LIMITS.bundle.archiveBytesMax, LIMITS.platform.incrementalUpload.archiveBytesMax);
  type Row = { path: string; byteSize: number };
  const boot: Row[] = [], candidates: Row[] = [];
  await walkExport(sourceRoot, "", (path, byteSize) => {
    const row = { path: path.normalize("NFC"), byteSize };
    (isLargeAssetPath(path, delivery) ? candidates : boot).push(row);
  });
  const external = candidates.filter(row => row.byteSize >= plan.autoSplit!.fileBytesMin);
  const remaining = candidates.filter(row => row.byteSize < plan.autoSplit!.fileBytesMin)
    .sort((a, b) => b.byteSize - a.byteSize || compareAssetPaths(a.path, b.path));
  const entry = (row: Row) => incrementalArchiveBytes([row]) - incrementalArchiveBytes([]);
  let bytes = incrementalArchiveBytes([...boot, ...remaining]), count = boot.length + remaining.length, next = 0;
  while ((bytes > archiveMax || count > LIMITS.bundle.fileCountMax) && next < remaining.length) {
    const row = remaining[next++]!;
    external.push(row); bytes -= entry(row); count -= 1;
  }
  if (bytes > archiveMax || count > LIMITS.bundle.fileCountMax) {
    const left = [...boot].sort((a, b) => b.byteSize - a.byteSize || compareAssetPaths(a.path, b.path)).slice(0, 3)
      .map(row => `${row.path} (${readableBytes(row.byteSize)})`).join(", ");
    throw new CliError("archive_limit", `Even with every eligible file sent separately, the boot archive is ${readableBytes(bytes, "up")} in ${count.toLocaleString("en-GB")} files, and the limit is ${readableBytes(archiveMax)} in ${LIMITS.bundle.fileCountMax.toLocaleString("en-GB")} files. Code and pages always stay in the boot archive. The largest files left: ${left}. Make the code smaller or combine files, then run opengame check again.`, 1);
  }
  const oversized = external.filter(row => row.byteSize > limits.fileBytesMax).sort((a, b) => b.byteSize - a.byteSize || compareAssetPaths(a.path, b.path));
  if (oversized.length) {
    throw new CliError("unity_assets_limit", `${oversized[0]!.path} is ${readableBytes(oversized[0]!.byteSize, "up")}, and one file on this plan can be at most ${readableBytes(limits.fileBytesMax)}${oversized.length > 1 ? ` (${oversized.length - 1} more files are over it too)` : ""}. Split it into smaller files, then run opengame check again.`, 1);
  }
  const stored = external.reduce((sum, row) => sum + row.byteSize, 0);
  if (external.length > limits.fileCountMax || stored > limits.storedBytesMax) {
    throw new CliError("unity_assets_limit", `The files to send separately are ${readableBytes(stored, "up")} in ${external.length.toLocaleString("en-GB")} files, and this plan takes at most ${readableBytes(limits.storedBytesMax)} in ${limits.fileCountMax.toLocaleString("en-GB")} files. Remove what the game does not load, then run opengame check again.`, 1);
  }
  if (!external.length) {
    throw new CliError("unity_assets_plan", "This export fits the ordinary upload limits. Deploy it without --external-assets.", 2);
  }
  return external.map(row => row.path).sort(compareAssetPaths);
}

/** The statement a plan kind asks for, refused unless --accept-statement names its
 * current version. The words are printed in the refusal, so a person reads them before
 * they can type the version; the server records the acceptance with the frozen plan. */
/** What check and a dry run say about a plan. The statement is printed here, with its version, because the Kaigen
 * guide tells creators to read it from check; until 27 Oct only the real deploy showed it, by refusing. The first
 * notice keeps its unity_ code because tools already match on it. */
/** "1 file", "2 files": a count and its noun, in the en-GB digits every other line here uses. */
function files(count: number, noun: string): string {
  return `${count.toLocaleString("en-GB")} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The line check ends a plan with. It used to say again what the notices above it had just
 * said, the hashing in other words and a Kaigen statement in full a second time, so a
 * person read each twice. It says only what the notices do not: the two halves of the
 * upload, and, for a plan with a statement, which flag accepts it.
 */
export function assetPlanSummary(bootFiles: number, assets: number, statement?: { version: string }): string {
  return `Ready to deploy: ${files(bootFiles, "file")} in the boot archive and ${files(assets, "asset")} sent separately.` +
    (statement ? ` Deploying needs the statement above accepted with --accept-statement ${statement.version}.` : "");
}

export function assetPlanNotices(delivery: string, count: number) {
  const notices: { type: "notice"; code: string; message: string; version?: string }[] = [{ type: "notice", code: "unity_assets_local_only",
    message: `Checked the boot archive and hashed ${files(count, "selected asset")}. Engine checks, decoded sizes and safety checks run on the server. Uploads resume by whole file, not by chunk.` }];
  const statement = largeAssetStatement(delivery);
  if (statement) notices.push({ type: "notice", code: "large_asset_statement", version: statement.version,
    message: `${statement.statement} ${statement.note} To accept it, deploy with --accept-statement ${statement.version}.` });
  return notices;
}

export function acceptedStatement(delivery: string, accepted: unknown) {
  const statement = largeAssetStatement(delivery);
  if (!statement) {
    if (accepted !== undefined) throw new CliError("invalid_flag", "This asset plan asks for no statement, so --accept-statement does not apply. Remove --accept-statement, then deploy again.", 2);
    return undefined;
  }
  if (accepted !== statement.version) {
    throw new CliError("large_asset_statement_required", `${statement.statement} ${statement.note} To accept it, deploy again with --accept-statement ${statement.version}.`, 2);
  }
  return { key: statement.key, version: statement.version };
}

/** The union has the same path/count rules as an ordinary game. Only the
 * explicitly named asset partition gets a separate byte budget. */
export function unityFileUnion(boot: IncrementalFile[], assets: LargeAssetFile[], delivery: string = LARGE_ASSET_DELIVERY): IncrementalFile[] {
  if (!validateLargeAssetFiles(assets, delivery)) throw invalidPlan();
  const files = [...boot, ...assets].sort((a, b) => compareAssetPaths(a.path, b.path));
  const names = new Set(files.map(file => canonicalName(file.path)));
  const sizes = new Map<string, number>();
  if (names.size !== files.length || files.length > largeAssetLimits(delivery)!.combinedFileCountMax) throw invalidPlan();
  for (const file of files) {
    const parts = canonicalName(file.path).split("/");
    if (parts.slice(0, -1).some((_, index) => names.has(parts.slice(0, index + 1).join("/"))) ||
      (sizes.has(file.sha256) && sizes.get(file.sha256) !== file.byteSize)) throw invalidPlan();
    sizes.set(file.sha256, file.byteSize);
  }
  return files;
}

/** Saved paths are cache metadata, not authority to read another export. Re-read
 * the selected output without building before using any resumed asset source. */
export async function assertUnitySourceRoot(projectRoot: string, sourceRoot: string): Promise<void> {
  const manifest = await loadManifest(projectRoot, undefined, safeReadFile);
  if (await outputFolder(projectRoot, manifest) !== sourceRoot) {
    throw new CliError("project_state", "The saved Unity source does not match this project's selected export. Restore the original export selection or use a new --idempotency-key.", 2);
  }
}

/** The plan's files on disk, folders expanded, without reading any of them: what dev needs
 * to know which requests to answer from disk. check and deploy go on to hash them. */
export async function selectAssetPlan(folder: string, projectRoot: string, planPath: string | readonly string[],
  options: { unityOnly?: boolean; delivery?: string } = {}) {
  const sourceRoot = folder, sourceIdentity = await safeDirectoryIdentity(sourceRoot);
  let value: unknown;
  try {
    /* `--external-assets auto` is the whole plan for the one kind that can choose its own
       files, so a decomp needs no JSON file beside it. A file actually called auto is
       still reachable as ./auto. */
    const autoKinds = LARGE_ASSET_DELIVERIES.filter(kind => largeAssetPlan(kind)?.autoSplit);
    if (planPath === "auto" && !(options.unityOnly ?? true) && autoKinds.length === 1) value = { delivery: autoKinds[0], assets: "auto" };
    else if (typeof planPath === "string") {
      const absolutePlan = resolve(projectRoot, planPath);
      /* A plan file that is not there was "Use an asset plan such as ...", the sentence for a
         plan written wrongly, so a person rewrote a plan that was fine and in another folder
         (area F, 1 Nov 2026). The path is read from the game's folder, which is not always
         where the command ran, so the answer says both. */
      const bytes = await safeReadFile(dirname(absolutePlan), basename(absolutePlan), LIMITS.platform.http.responseBytesMax).catch((error: NodeJS.ErrnoException) => {
        // "auto" with --unity-assets asked for a plan kind Unity does not have; that
        // sentence, not a missing file, is the answer to it.
        if (error?.code !== "ENOENT" || planPath === "auto") throw error;
        throw new CliError("asset_plan_missing", `There is no asset plan at ${absolutePlan}. A plan path is read from the game's folder, ${projectRoot}. Give its path from there, or an absolute path.`, 2);
      });
      value = JSON.parse(withoutBom(bytes.toString("utf8")));
    } else value = { assets: [...planPath], ...(options.delivery && options.delivery !== LARGE_ASSET_DELIVERY ? { delivery: options.delivery } : {}) };
  }
  catch (error) { if (error instanceof CliError) throw error; throw invalidPlan(); }
  const plan = parseAssetPlan(value, options.unityOnly ?? true);
  const { delivery } = plan;
  const limits = largeAssetLimits(delivery)!;
  const paths = plan.auto ? await autoSplitAssets(sourceRoot, delivery) : [...plan.paths];
  const listed = new Set(paths.map(path => canonicalName(path)));
  for (const folder of plan.folders) for (const path of await expandFolder(sourceRoot, folder, delivery)) {
    if (!listed.has(canonicalName(path))) { listed.add(canonicalName(path)); paths.push(path); }
  }
  paths.sort(compareAssetPaths);
  if (!paths.length || paths.length > limits.fileCountMax) throw invalidPlan();
  return { sourceRoot, sourceIdentity, delivery, limits, paths, auto: plan.auto };
}

export async function readUnityAssetPlan(folder: string, projectRoot: string, planPath: string | readonly string[],
  options: { unityOnly?: boolean; delivery?: string; output?: Output } = {}) {
  const { sourceRoot, sourceIdentity, delivery, limits, paths, auto } = await selectAssetPlan(folder, projectRoot, planPath, options);
  // Sizes first, so a plan over its stored-byte limit is refused before anything is
  // hashed, then the hashes, a few helper jobs in all and no bytes held in Node. Upload
  // reads again and must match these hashes before any capability sees the bytes; a
  // changed source cannot resume.
  const message = `Hashing ${paths.length.toLocaleString("en-GB")} external assets`;
  const assets: LargeAssetFile[] = await safeHashFiles(sourceRoot, paths, { fileBytes: limits.fileBytesMax, totalBytes: limits.storedBytesMax }, {
    expectedRoot: sourceIdentity,
    words: { overTotal: () => new CliError("unity_assets_limit", "The selected assets exceed the stored-byte limit for their plan. Reduce the asset plan and retry.", 1) },
    // The words stay the same from first event to last, so a terminal moves one bar
    // rather than printing a line per batch; the counts are in the fields.
    progress: done => options.output?.emit({ type: "progress", stage: "assets", message: `${message} (${readableBytes(done.totalBytes)})`,
      files: done.files, totalFiles: done.totalFiles, bytes: done.bytes, total: done.totalBytes }),
  });
  if (!validateLargeAssetFiles(assets, delivery)) throw invalidPlan();
  return { assets, sourceRoot, sourceIdentity, delivery, ...(auto ? { auto: true as const } : {}) };
}

export async function createUnityArchive(folder: string, manifest: GameManifest, output: Output, projectRoot: string, planPath: string | readonly string[],
  options: { unityOnly?: boolean; delivery?: string; workDirectory?: string; planChosen?: boolean } = {}) {
  const { assets, sourceRoot, sourceIdentity, delivery, auto } = await readUnityAssetPlan(folder, projectRoot, planPath, { unityOnly: options.unityOnly, delivery: options.delivery, output });
  const archive = await createArchive(folder, manifest, output, { incremental: true, externalAssets: new Set(assets.map(file => file.path)), externalDelivery: delivery, rootIdentity: sourceIdentity, workDirectory: options.workDirectory, planChosen: options.planChosen });
  if (!archive.incremental) { await archive.dispose(); throw new CliError("archive_limit", "The boot archive must fit the canonical file-upload limits. Send more of its files as external assets, then deploy again.", 1); }
  unityFileUnion(archive.incremental, assets, delivery);
  const unityAssets: UnityAssetsState = { assets, sourceRoot, inputDigest: unityInputDigest({ sha256: archive.sha256, byteSize: archive.byteSize }, assets, delivery),
    ...(delivery === LARGE_ASSET_DELIVERY ? {} : { delivery }) };
  if (auto) output.emit({ type: "notice", code: "external_assets_auto", message: `Chose ${files(assets.length, "file")} to send separately (${readableBytes(assets.reduce((sum, file) => sum + file.byteSize, 0))}). The boot archive keeps ${files(archive.fileCount, "file")} (${readableBytes(archive.byteSize)}).` });
  for (const notice of assetPlanNotices(delivery, assets.length)) output.emit(notice);
  return { ...archive, unityAssets };
}

const SAVED_ASSET_CHANGED = "A saved asset changed. Restore the original file to resume, or use a new --idempotency-key for the new export.";
const savedAsset = (file: LargeAssetFile, bytes: Uint8Array | undefined): Uint8Array => {
  if (!bytes || bytes.byteLength !== file.byteSize || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    throw new CliError("build_changed", SAVED_ASSET_CHANGED, 1);
  }
  return bytes;
};

export async function readUnityAsset(sourceRoot: string, file: LargeAssetFile): Promise<Uint8Array> {
  return savedAsset(file, await safeReadLargeFile(sourceRoot, file.path, file.byteSize));
}

/** `length` bytes from `offset` in a saved asset, which must still be the size the plan recorded. A part is
 * not hashed on its own: the server hashes the joined file, and a file changed since the plan fails there. */
export async function readUnityAssetPart(sourceRoot: string, file: LargeAssetFile, offset: number, length: number): Promise<Uint8Array> {
  const bytes = await safeReadLargeFile(sourceRoot, file.path, file.byteSize, undefined, { offset, length, size: file.byteSize })
    .catch(() => { throw new CliError("build_changed", SAVED_ASSET_CHANGED, 1); });
  if (bytes.byteLength !== length) throw new CliError("build_changed", SAVED_ASSET_CHANGED, 1);
  return bytes;
}

/** Files at or under this size are read several to a helper job during upload. A page of
 * missing files is at most incrementalUpload.batchFilesMax long, so what is held ahead of
 * the upload is at most that many of these. */
export const SMALL_ASSET_BYTES = 1024 * 1024;
const SMALL_READ_BYTES = 16 * 1024 * 1024;

/** The small files among `files`, read in as few helper jobs as fit SMALL_READ_BYTES each
 * and hashed against the saved plan here, as readUnityAsset does one at a time. Larger
 * files are left out, for readUnityAsset to read when their turn comes, so memory stays
 * bounded by the page rather than by the largest asset. */
export async function readSmallUnityAssets(sourceRoot: string, files: readonly LargeAssetFile[]): Promise<Map<string, Uint8Array>> {
  const read = new Map<string, Uint8Array>();
  const small = files.filter(file => file.byteSize <= SMALL_ASSET_BYTES);
  for (let start = 0; start < small.length;) {
    let end = start, bytes = 0;
    while (end < small.length && (end === start || bytes + small[end]!.byteSize <= SMALL_READ_BYTES)) bytes += small[end++]!.byteSize;
    const batch = small.slice(start, end);
    const found = await safeReadFiles(sourceRoot, batch, { changed: SAVED_ASSET_CHANGED });
    for (const file of batch) read.set(file.path, savedAsset(file, found.get(file.path)));
    start = end;
  }
  return read;
}

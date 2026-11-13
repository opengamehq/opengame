import { lstat, readdir, readFile, realpath, rename } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import type { PreflightFile } from "@opengame/preflight";
import { LIMITS } from "@opengame/shared";
import { isLargeAssetPath, LARGE_ASSET_DELIVERIES, largeAssetLimits, largeAssetPlan } from "@opengame/shared/large-assets";
import { ENGINE_NAMES, type EngineId } from "../../preflight/src/engines";
import { engineGuide } from "./engines";
import { manifestSchema, type GameManifest } from "@opengame/protocol";
import { CLI_VERSION } from "./version";
import { scopeOwned, published, packages } from "../../shared/npm-release.json";
import { installsOpen } from "../../shared/npm-release.mjs";

/* The npx form names the CLI on npm, so it waits for packages/shared/npm-release.json as it
   stood when this CLI was built, like every other install line (build-output.ts says the
   same of the SDK). Only the three keys are imported, so the bundle carries none of the
   file's notes. Before that it is opengame upgrade alone. */
const NPX_LATEST = installsOpen({ scopeOwned, published, packages }) ? ` (or npx ${packages.cli}@latest)` : "";

/**
 * The folder as a person types it after a command, from where they ran this one: "." for
 * the current folder, a relative path otherwise, quoted when a shell would split it. Every
 * "Next:" line said "." whatever folder had been named, so `opengame check games/coil`
 * suggested `opengame dev .`, which runs the wrong folder (area F, 1 Nov 2026).
 */
export function folderArgument(root: string, cwd = process.cwd()): string {
  const relative = path.relative(cwd, root) || ".";
  // A folder far from here reads better as its own path than as a climb of ../../../.
  const shorter = path.isAbsolute(root) && path.resolve(root).length < relative.length ? path.resolve(root) : relative;
  return /^[A-Za-z0-9._/@+-]+$/.test(shorter) ? shorter : `'${shorter.replace(/'/g, "'\\''")}'`;
}
import { readableBytes } from "./bytes";
import { CliError, type Output } from "./output";
import { rememberAuto, resolveAuto } from "./auto";

/** The check version every local packaging finding carries: the archive rules preflight
 * applies and the opengame.json the CLI reads are one contract, versioned once in
 * limits.json. The manifest finding said "1" while preflight's said "packaging@1", so an
 * agent comparing findings across a run saw two numbering schemes for one check set. */
export const PACKAGING_CHECK_VERSION = `packaging@${LIMITS.platform.packagingContract}`;

/** Manifest problems are findings in opengame.json, one per field, so an agent
 * can fix each where it lives instead of parsing one joined message. */
export async function loadManifest(root: string, output?: Output,
  reader?: (root: string, name: string, maximum: number) => Promise<Uint8Array>): Promise<GameManifest> {
  let value: unknown;
  try {
    if (reader) value = JSON.parse(withoutBom(Buffer.from(await reader(root, "opengame.json", LIMITS.platform.manifest.bytesMax)).toString("utf8")));
    else {
      const file = path.join(root, "opengame.json");
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.platform.manifest.bytesMax) throw new Error();
      value = JSON.parse(withoutBom(await readFile(file, "utf8")));
    }
  } catch (error) {
    // No file at all is a folder that has not been set up, not a game with a broken manifest:
    // exit 2 and the command that sets it up, rather than exit 1 and "invalid JSON".
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("manifest_missing", "There is no opengame.json in this folder. Run opengame init.", 2, { next: `opengame init ${folderArgument(root)}` });
    }
    if (reader && error instanceof CliError) throw error;
    throw new CliError("manifest_unreadable", "Could not read opengame.json. Check that it is a regular file that contains valid JSON.");
  }
  // Auto fields read as their stand-ins and are named beside the manifest (auto.ts).
  const resolved = await resolveAuto(value, root);
  value = resolved.value;
  const result = manifestSchema.safeParse(value);
  if (!result.success) {
    /* One finding per field, the first: a path like dist\web fails three checks, and
       the union around build.output adds a bare "Invalid input" to them. The first
       sentence is the specific one ("Use forward slashes"), and the rest are noise. */
    const seen = new Set<string>();
    const first = result.error.issues.filter(issue => issue.code === "unrecognized_keys" || (issue.message !== "Invalid input" && !seen.has(issue.path.join(".")) && seen.add(issue.path.join("."))));
    const issues = (first.length ? first : result.error.issues).map((issue) => ({ field: issue.path.join("."), message: issue.message,
      unknown: issue.code === "unrecognized_keys" ? (issue as { keys?: string[] }).keys ?? [] : [] }));
    for (const issue of issues) {
      // A field this CLI does not know may have been written by a newer one, not by mistake.
      const named = issue.unknown.map(key => issue.field ? `${issue.field}.${key}` : key).join(", ");
      const message = issue.unknown.length ? `${named} ${issue.unknown.length === 1 ? "is" : "are"} not a field CLI ${CLI_VERSION} knows.` : issue.message;
      const fix = issue.unknown.length
        ? `If a newer CLI wrote ${issue.unknown.length === 1 ? "it" : "them"}, upgrade with opengame upgrade${NPX_LATEST}. If not, remove ${named} from opengame.json.`
        : issue.field === "genre" ? GENRE_FIX
        : issue.field ? `Correct ${issue.field} in opengame.json.` : issue.message;
      output?.emit({ type: "finding", finding: { release: null, check: "manifest", checkVersion: PACKAGING_CHECK_VERSION, state: "failed",
        certainty: issue.unknown.length ? "heuristic" : "certain", fault: "game", evidence: { observed: issue.field && !issue.unknown.length ? `${issue.field}: ${message}` : message, file: "opengame.json" },
        fix, verify: "opengame check", retry: "after-fix" } });
    }
    /* With an output the findings above have already said each problem and its fix, so the
       error counts them rather than listing them a third time: check printed every rule as
       the Blocker, again inside the Fix, and again as the error. Without one, as from
       submit and the Unity reader, the error is the only place they appear. */
    if (output) throw new CliError("manifest_invalid", `opengame.json has ${issues.length === 1 ? "1 problem" : `${issues.length} problems`} to correct.`, 1);
    throw new CliError("manifest_invalid", issues.map(issue => issue.unknown.length
      ? `${issue.unknown.map(key => issue.field ? `${issue.field}.${key}` : key).join(", ")}: not a field CLI ${CLI_VERSION} knows. Upgrade the CLI if a newer one wrote it, or remove it.`
      : `${issue.field || "opengame.json"}: ${issue.message}`).join("\n"), 1);
  }
  return rememberAuto(result.data, resolved.auto);
}

/* "Correct genre in opengame.json" told nobody what a genre is or how to set one (10 Nov
   2026). A blank genre is Auto since 13 Nov 2026 (auto.ts), so this is only ever a genre that
   is not one of the slugs. */
const GENRE_FIX = `Set genre in opengame.json to one of the slugs above, for example "genre": "puzzle-casual", or to "auto" and review chooses it.`;

/** Notepad and other Windows editors save UTF-8 with a byte-order mark, and JSON.parse
 * refuses one: an opengame.json that looked fine in the editor was "not valid JSON". */
export function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * The path a file has inside the game: forward slashes, composed Unicode.
 *
 * `api` is node:path by default and node:path's win32 half in tests, which is how the
 * Windows behaviour is checked from a Mac. Composed (NFC) because that is how a page
 * writes a name: macOS can hand back a decomposed `café.png`, and its file system finds
 * it either way, so the game worked locally and 404'd once served from a host that
 * compares bytes. The bytes are still read from the name on disk.
 */
export function bundlePathOf(root: string, full: string, api: path.PlatformPath = path): string {
  return api.relative(root, full).split(api.sep).join("/").normalize("NFC");
}

/** True when `folder` is `base` or inside it. Both come from realpath, so on Windows the
 * drive letter and case already agree; the separator is the platform's. */
export function insideProject(base: string, folder: string, api: path.PlatformPath = path): boolean {
  return folder === base || folder.startsWith(base.endsWith(api.sep) ? base : base + api.sep);
}

/** A name with a backslash in it is legal on macOS and Linux and is a folder separator
 * everywhere else, including the archive stage, which refuses it. */
export function unportableName(name: string): string | null {
  if (name.includes("\\")) return "has a backslash in its name, which Windows, browsers and the archive check all read as a folder separator";
  if (/^[A-Za-z]:/.test(name)) return "starts like a Windows drive (C:), which the game host reads as an absolute path";
  return null;
}

export interface CollectedFile extends PreflightFile { /** Where the bytes are on disk, which can differ from `path` by composition. */ source: string }

/** Runtime-owned paths must never be shadowed by a creator's export, even if
 * the conflicting directory is empty or contains only excluded files. */
export function assertNoReservedRuntimePaths(paths: Iterable<string>) {
  for (const path of paths) {
    if (path.split("/")[0]?.toLowerCase() === "_og") throw new CliError("reserved_runtime_path", "The export contains the reserved /_og path. Rename that file or folder; OpenGame serves its SDK and runtimes there.", 1);
  }
}

export async function collectFiles(folder: string, options: { externalAssets?: ReadonlySet<string>; externalDelivery?: string } = {}) {
  const refused = options.externalAssets && [...options.externalAssets].find(path => !isLargeAssetPath(path, options.externalDelivery) || isExcludedPath(path));
  if (refused !== undefined) {
    throw new CliError("unity_assets_plan", `${refused} cannot be sent separately under this asset plan: only files the plan's kind admits can leave the boot archive. Take it out of the plan's assets, then run the command again.`, 2);
  }
  const root = await realpath(folder).catch(() => { throw new CliError("folder_missing", "The build folder does not exist. Check build.output in opengame.json."); });
  const files: CollectedFile[] = [];
  const excluded: string[] = [];
  const composed = new Map<string, string>();
  /* Bytes per top-level entry, so a refusal can say where the weight is. The first walk
     through a real 7.6 GB project (15 Oct 2026) was told "Remove unused assets" and had to
     guess that a 4.2 GB artifacts/ folder was the one.

     Once a limit is crossed the walk keeps going on sizes alone (no reads, no checks), so
     the totals are whole. Stopping at the limit made them lower bounds that favoured
     whichever folder sorts first, which is the wrong one to blame. */
  const byTop = new Map<string, number>();
  /* What each external-asset plan kind could take out of the boot archive, so a refusal
     can say when a plan is the way through. OG Clash (Kaigen, 3.1 GiB in 13k files) was
     told only to remove what the game does not load, which for a game that loads all of
     it is no advice at all. */
  const eligible = new Map(LARGE_ASSET_DELIVERIES.map(kind => [kind, { bytes: 0, count: 0 }]));
  let bytes = 0, count = 0;
  let over: "size" | "count" | null = null;
  const tally = (bundlePath: string, size: number) => {
    const top = bundlePath.includes("/") ? `${bundlePath.split("/")[0]}/` : bundlePath;
    byTop.set(top, (byTop.get(top) ?? 0) + size);
    for (const [kind, row] of eligible) if (isLargeAssetPath(bundlePath, kind)) { row.bytes += size; row.count += 1; }
  };
  async function walk(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const full = path.join(dir, entry.name);
      const bundlePath = bundlePathOf(root, full);
      assertNoReservedRuntimePaths([bundlePath]);
      // The project's own files are never part of the game and are not news:
      // reporting "Excluded opengame.json" on every check read like a problem.
      if (entry.name === "opengame.json" || bundlePath === "opengame-assets" || bundlePath === ".opengame") continue;
      if (isExcludedPath(bundlePath)) {
        excluded.push(bundlePath); continue;
      }
      if (options.externalAssets?.has(bundlePath)) {
        if (unportableName(entry.name)) throw new CliError("unportable_name", `${bundlePath} is an external asset with a name that cannot be uploaded. Rename it, and any reference to it.`, 1);
        if (!entry.isFile() || entry.isSymbolicLink()) throw new CliError("symlink", `${bundlePath} is an external asset, so it must be a regular file inside the build folder, not a folder or a link. Name files in the asset plan, and copy the actual file in place of a link.`, 1);
        const twin = sameComposedName(composed, bundlePath, path.relative(root, full));
        if (twin) throw new CliError("unicode_collision", `${twin} are the same name written two ways, and would be one external asset once uploaded. Keep one of them.`, 1);
        continue;
      }
      if (over) {
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) { const size = (await lstat(full)).size; bytes += size; count += 1; tally(bundlePath, size); }
        continue;
      }
      const unportable = unportableName(entry.name);
      if (unportable) throw new CliError("unportable_name", `${bundlePath} ${unportable}. Rename it, and any reference to it.`, 1);
      if (entry.isSymbolicLink()) throw new CliError("symlink", `${bundlePath} is a symlink. Copy the actual asset into your build folder.`, 1);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile()) throw new CliError("special_file", `${bundlePath} is not a regular file. Remove it from your build folder.`, 1);
      const twin = sameComposedName(composed, bundlePath, path.relative(root, full));
      if (twin) throw new CliError("unicode_collision", `${twin} are the same name written two ways, and would be one file once uploaded. Keep one of them.`, 1);
      const info = await lstat(full);
      // The server refuses one file past bundle.fileBytesMax before it opens the archive
      // (inspect_zip), so say so here, before packing and uploading up to the archive cap for it.
      if (info.size > LIMITS.bundle.fileBytesMax) throw new CliError("bundle_limit", fileLimitMessage(bundlePath, info.size), 1);
      bytes += info.size; count += 1;
      tally(bundlePath, info.size);
      if (bytes > LIMITS.bundle.uncompressedBytesMax) { over = "size"; continue; }
      if (files.length >= LIMITS.bundle.fileCountMax) { over = "count"; continue; }
      files.push({ path: bundlePath, source: full, size: info.size, text: () => readFile(full, "utf8") });
    }
  }
  await walk(root);
  if (over) throw new CliError("bundle_limit", bundleLimitMessage(over, bytes, count, byTop, eligible), 1);
  return { root, files, excluded };
}

/** Linux keeps a composed and a decomposed `café.png` as two files. Both compose to the
 * same bundle path, so without this the second silently replaced the first in the archive.
 * Returns the pair, quoted, when `bundlePath` was already taken by another name on disk. */
export function sameComposedName(seen: Map<string, string>, bundlePath: string, onDisk: string): string | null {
  const earlier = seen.get(bundlePath);
  if (earlier !== undefined && earlier !== onDisk) return `"${earlier}" and "${onDisk}"`;
  seen.set(bundlePath, onDisk);
  return null;
}

function bundleLimitMessage(over: "size" | "count", bytes: number, count: number, byTop: Map<string, number>,
  eligible: Map<string, { bytes: number; count: number }>): string {
  const heaviest = [...byTop].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, size]) => size >= 1048576)
    .map(([name, size]) => `${name} (${readableBytes(size)})`);
  const where = heaviest.length ? ` The largest: ${heaviest.join(", ")}.` : "";
  const plan = assetPlanAdvice(over, bytes, count, eligible);
  return over === "size"
    ? `The build is ${readableBytes(bytes, "up")} uncompressed, over the ${readableBytes(LIMITS.bundle.uncompressedBytesMax)} limit.${where}${plan} ${plan ? "Otherwise remove" : "Remove"} what the game does not load, or point build.output at the folder that holds only the game, then run opengame check.`
    : `The build has ${count.toLocaleString("en-GB")} files, more than ${LIMITS.bundle.fileCountMax.toLocaleString("en-GB")}.${plan} ${plan ? "Otherwise combine" : "Combine"} or remove some, then run opengame check.`;
}

/** One file past bundle.fileBytesMax. A plan kind is named only when it admits this path
 * AND its own per-file cap takes this size: Kaigen's is 256 MiB too, so a 300 MiB .hza is
 * not helped by a Kaigen plan, while Unity's lane takes a .data file of up to 512 MiB. */
function fileLimitMessage(bundlePath: string, size: number): string {
  const kinds = LARGE_ASSET_DELIVERIES.filter(kind => isLargeAssetPath(bundlePath, kind) && (largeAssetLimits(kind)?.fileBytesMax ?? 0) >= size);
  const engines = [...new Set(kinds.flatMap(kind => largeAssetPlan(kind)?.engines ?? []))];
  const names = engines.map(id => ENGINE_NAMES[id as EngineId] ?? id).join(" or ");
  const plan = engines.length
    ? ` It can stay out of the upload in a ${names} asset plan. If this is a ${names} game, list it in a plan and pass it with --external-assets, as ${engines.map(engineGuide).join(" or ")} shows.`
    : "";
  return `${bundlePath} is ${readableBytes(size, "up")}, and one file can be at most ${readableBytes(LIMITS.bundle.fileBytesMax)}.${plan} ${plan ? "Otherwise split" : "Split"} it, or compress it in a format the game decodes itself, then run opengame check.`;
}

/** The plan kinds whose admitted files, moved out, would bring the boot archive within
 * the ordinary limit that was crossed, named by engine with the guide that shows the
 * plan. Only a fit counts: a plan that leaves the build over the limit is not a way
 * through. It is a suggestion, not a check: the file types say nothing certain about the
 * engine, so the sentence names the engine it applies to. */
function assetPlanAdvice(over: "size" | "count", bytes: number, count: number, eligible: Map<string, { bytes: number; count: number }>): string {
  const fits = [...eligible].filter(([, row]) => row.count > 0 && (over === "size"
    ? bytes - row.bytes <= LIMITS.bundle.uncompressedBytesMax : count - row.count <= LIMITS.bundle.fileCountMax))
    .sort((a, b) => b[1].bytes - a[1].bytes);
  if (!fits.length) return "";
  const engines = [...new Set(fits.flatMap(([kind]) => largeAssetPlan(kind)?.engines ?? []))];
  const names = engines.map(id => ENGINE_NAMES[id as EngineId] ?? id).join(" or ");
  const [, row] = fits[0]!;
  const share = over === "size" ? readableBytes(row.bytes) : `${row.count.toLocaleString("en-GB")} files`;
  /* large-game-v1 admits any engine and so names none. When it is the only plan that
     fits, the engine sentence below printed blanks where the names go (30 Oct 2026). */
  if (!engines.length) return ` ${share} of it can stay out of the upload on the large-game-v1 plan, which is for a decompilation, mod or recompilation and needs large-asset access on your account. If this is one and your account has it, pass --external-assets auto, as https://docs.opengame.io/guides/packaging shows.`;
  return ` ${share} of it can stay out of the upload in a ${names} asset plan. If this is a ${names} game, list those files in a plan and pass it with --external-assets, as ${engines.map(engineGuide).join(" or ")} shows.`;
}

/**
 * The project a command should use when it was pointed at the build folder.
 *
 * `opengame check dist` is what most people type after a build, and with no opengame.json
 * in dist/ it answered manifest_missing and told them to run init, which would have
 * written a second manifest inside the build (Lowlight, an Excalibur game, 24 Oct 2026).
 * When the folder is not a project itself, the first parent (up to four levels) whose
 * opengame.json names it exactly as build.output is used, so a manifest that does not
 * name it is never borrowed. A folder is a project if it holds opengame.json or a
 * .opengame/project.json from `link` or an earlier deploy: a linked folder deploys to its
 * own game, never to its parent's (review of #425). `link` and `init` never borrow, so
 * both still make the folder they are given a project of its own. Anything else is left
 * to fail as before.
 */
export async function projectFor(folder: string, output?: Output, buildNote?: string): Promise<string> {
  const exists = (name: string) => lstat(path.join(folder, name)).then(() => true, () => false);
  if (await exists("opengame.json") || await exists(path.join(".opengame", "project.json"))) return folder;
  const target = await realpath(folder).catch(() => null);
  if (!target) return folder;
  let parent = path.dirname(folder);
  for (let depth = 0; depth < 4 && parent !== path.dirname(parent); depth++, parent = path.dirname(parent)) {
    let build: { output?: unknown; command?: unknown } | undefined;
    try {
      const file = path.join(parent, "opengame.json");
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.platform.manifest.bytesMax) continue;
      build = (JSON.parse(withoutBom(await readFile(file, "utf8"))) as { build?: typeof build })?.build;
    } catch { continue; }
    if (typeof build?.output !== "string") continue;
    const named = await realpath(path.resolve(parent, build.output)).catch(() => null);
    /* Fails closed: an unresolvable parent is not a project to borrow (insideProject("")
       is true for every absolute path). */
    const base = await realpath(parent).catch(() => null);
    if (named !== target || !base || !insideProject(base, named)) continue;
    /* `deploy dist` reads as "upload exactly this", so the caller says when the borrowed
       project's build is about to run, and how not to. */
    const builds = typeof build.command === "string" && build.command.trim() !== "";
    output?.emit({ type: "notice", code: "project_from_build_folder",
      message: `Using ${path.join(parent, "opengame.json")}, whose build.output is this folder.` + (builds && buildNote ? ` ${buildNote}` : "") });
    return parent;
  }
  return folder;
}

export async function outputFolder(root: string, manifest: GameManifest): Promise<string> {
  const base = await realpath(root);
  const folder = await realpath(path.resolve(root, manifest.build?.output ?? ".")).catch(() => { throw new CliError("folder_missing", "The build folder does not exist. Run your build command first."); });
  if (!insideProject(base, folder)) throw new CliError("output_outside_project", "build.output must stay inside the project folder. Set it in opengame.json to a folder inside the project, such as dist.");
  return folder;
}

/**
 * Coding-agent folders. `opengame skills add .` writes skills into the project (see
 * AGENT_DIRS in skills.ts; the test keeps the two in step), and for a game with no build
 * step the project folder is the bundle. Without this, the documented agent flow --
 * `skills add .`, then `deploy .` -- uploaded `.claude/skills/**` to the game's public
 * origin, and with it whatever else an agent keeps there: local settings, permissions,
 * notes. Found by the SDK e2e acceptance run on 16 Oct 2026 (19 files for a 7-file game).
 */
export const AGENT_FOLDERS = [".claude", ".agents", ".codex", ".cursor", ".opencode"] as const;

export function isExcludedPath(bundlePath: string): boolean {
  // The preflight and the archive stage drop desktop.ini and .Spotlight-V100 as junk too,
  // so listing them here is what puts them in the "Excluded from upload" notice.
  return bundlePath.split("/").some(name => ["node_modules", ".git", ".opengame", ".DS_Store", "Thumbs.db", "desktop.ini", ".Spotlight-V100", "__MACOSX", ...AGENT_FOLDERS].includes(name)
    || name.startsWith("._") || /^\.env/i.test(name) || /\.(?:js|mjs|cjs|css|wasm)\.map$/i.test(name));
}

/** How long a rename on Windows keeps retrying a file something else has open. */
const REPLACE_RETRY_MS = 10_000;

/**
 * `rename`, which on Windows waits out whatever else has the file open.
 *
 * Every write here is a temporary file renamed over the real one, and on Windows a rename
 * fails with EPERM, EACCES or EBUSY while another process holds either file: Defender
 * scanning the temporary file it has just seen written is the usual one, and an editor or
 * a search indexer the others. npm's graceful-fs retries the same three for the same
 * reason. Elsewhere a rename either works or the error is real, so it is not retried.
 */
export async function replaceFile(from: string, to: string, platform: NodeJS.Platform = process.platform,
  move: (from: string, to: string) => Promise<void> = rename): Promise<void> {
  const deadline = Date.now() + REPLACE_RETRY_MS;
  for (let wait = 20; ; wait = Math.min(wait * 2, 500)) {
    try { return await move(from, to); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(code) || Date.now() + wait > deadline) throw error;
      await sleep(wait);
    }
  }
}

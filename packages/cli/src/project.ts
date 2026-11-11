import { constants } from "node:fs";
import { mkdir, lstat, open, unlink, realpath } from "node:fs/promises";
import { replaceFile } from "./files";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { lock } from "proper-lockfile";
import { LIMITS } from "@opengame/shared";
import { LARGE_ASSET_DELIVERIES, LARGE_ASSET_DELIVERY, largeAssetInputText, largeAssetLimits, validateLargeAssetFiles } from "@opengame/shared/large-assets";
import type { UnityAssetsState } from "./unity-assets";
import { deployProvisionalSchema, manifestSchema, type DeployProvisional, type GameManifest } from "@opengame/protocol";
import { CliError } from "./output";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validKey = (key: string) => key.length <= LIMITS.platform.operations.idempotencyKeyCharsMax && /^[A-Za-z0-9._:-]+$/.test(key);
export type DeployRequest = { gameId?: string; byteSize: number; fileCount: number; sha256: string; manifest: GameManifest; metadataRevision: number | null; metadata: "preserve" | "local";
  /** Sent only to a server that advertises archive parts; part of the request, so a resumed deploy keeps its transport. */
  multipart?: true;
  /** The manifest fields init chose without being told (`provisionalFields` in init.ts), which review and the details form treat as placeholders. */
  provisional?: DeployProvisional[] };
export type SubmitRequest = { releaseId: string; jam: { slug: string; track: string; models: string[]; sponsors: string[]; evidence: Record<string, string> } | null; destination?: "qa" };
export type Project = { version: 1; origin: string; gameId?: string; metadataRevision?: number; deploy?: { key: string; transport?: "files" | string; unityAssets?: UnityAssetsState; request: DeployRequest; operationId?: string; terminal?: boolean; uploaded?: boolean };
  /** The last submit's retry key, saved before the request leaves, so a lost answer is recovered rather than repeated. */
  submit?: { key: string; request: SubmitRequest; submissionId?: string };
  /** The operation whose declared achievements were saved in full. */
  achievements?: { gameId: string; saved?: string } };
/** The largest project file this CLI can write. It holds a large-asset plan's every path, size and hash, so it grows
 * with the plan: OG Clash's 13,179-file Kaigen plan wrote 2.9 MB, and reading it back under the 1 MiB HTTP response
 * cap failed every resume, status and later deploy from that folder (27 Oct 2026). One entry is at most a full-length
 * path plus its hash, size and JSON punctuation; the request and the rest of the state fit in the response cap. */
export const PROJECT_STATE_BYTES_MAX = LIMITS.platform.http.responseBytesMax
  + Math.max(...LARGE_ASSET_DELIVERIES.map(kind => largeAssetLimits(kind)!.combinedFileCountMax)) * (LIMITS.bundle.pathBytesMax + 160);
const invalid = () => new CliError("project_state", "Could not read .opengame/project.json. Restore the local project file before retrying; it records the deploy needed to resume safely.");

/**
 * A folder deployed through one OpenGame server and opened by a CLI pointed at another. The
 * state is kept per origin, deliberately, because its retry keys mean nothing to a different
 * server. But the refusal used to be the damaged-file one, "Restore the local project file",
 * which sent a person looking for corruption in a file that was fine (area F, 1 Nov 2026).
 * The saved origin is printed only when it parses back to itself as an http(s) origin.
 */
function otherOrigin(saved: string, origin: string) {
  let named = false;
  try { const url = new URL(saved); named = /^https?:$/.test(url.protocol) && url.origin === saved; } catch { /* named stays false */ }
  return new CliError("project_state", named
    ? `This folder was deployed through ${saved}, and this CLI is using ${origin}. Set OPENGAME_API_URL=${saved} to carry on there, or move .opengame aside to start again here.`
    : `This folder was deployed through another OpenGame server, and this CLI is using ${origin}. Move .opengame aside to start again here.`);
}

function parse(value: unknown, origin: string): Project {
  const state = value as Project;
  if (state && state.version === 1 && typeof state.origin === "string" && state.origin !== origin) throw otherOrigin(state.origin, origin);
  if (!state || state.version !== 1 || state.origin !== origin || (state.gameId !== undefined && !uuid.test(state.gameId)) ||
    (state.metadataRevision !== undefined && (!Number.isSafeInteger(state.metadataRevision) || state.metadataRevision < 1))) throw invalid();
  if (state.deploy) {
    const { key, transport, operationId, terminal, uploaded, request } = state.deploy;
    if ((transport !== undefined && transport !== "files" && !LARGE_ASSET_DELIVERIES.includes(transport)) || typeof key !== "string" || !validKey(key) || (operationId !== undefined && !uuid.test(operationId)) ||
      (terminal !== undefined && typeof terminal !== "boolean") || (uploaded !== undefined && typeof uploaded !== "boolean") || !request ||
      !Number.isSafeInteger(request.byteSize) || request.byteSize <= 0 || !Number.isSafeInteger(request.fileCount) || request.fileCount <= 0 ||
      typeof request.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(request.sha256) ||
      (request.gameId !== undefined && !uuid.test(request.gameId)) ||
      (request.metadata !== "preserve" && request.metadata !== "local") || (request.multipart !== undefined && request.multipart !== true) ||
      (request.provisional !== undefined && !deployProvisionalSchema.safeParse(request.provisional).success) ||
      (request.metadataRevision !== null && (!Number.isSafeInteger(request.metadataRevision) || request.metadataRevision < 1)) ||
      !manifestSchema.safeParse(request.manifest).success) throw invalid();
    if (transport !== undefined && transport !== "files") {
      // The transport is the plan kind. Unity's state predates `delivery` and omits it.
      const plan = state.deploy.unityAssets;
      const delivery = plan?.delivery ?? LARGE_ASSET_DELIVERY;
      if (!plan || delivery !== transport || (plan.delivery !== undefined && plan.delivery === LARGE_ASSET_DELIVERY) ||
          !validateLargeAssetFiles(plan.assets, delivery) || typeof plan.sourceRoot !== "string" || !plan.sourceRoot.startsWith("/") ||
          plan.inputDigest !== createHash("sha256").update(largeAssetInputText(request, plan.assets, delivery)).digest("hex") ||
          request.fileCount + plan.assets.length > largeAssetLimits(delivery)!.combinedFileCountMax) throw invalid();
    } else if (state.deploy.unityAssets !== undefined) throw invalid();
  }
  // Old declared history is ignored. Only the completed operation matters for retries.
  if (state.achievements !== undefined) {
    if (!validAchievements(state.achievements)) delete state.achievements;
    else state.achievements = { gameId: state.achievements.gameId, saved: state.achievements.saved };
  }
  // A null entry is no entry. This CLI never writes one, but before the QA round a null
  // read as absent and let submit proceed, and a hand edit or another tool may have left it.
  if ((state as { submit?: unknown }).submit === null) delete state.submit;
  if (state.submit !== undefined && !validSubmit(state.submit)) unreadableSubmit.add(state);
  return state;
}

function validAchievements(value: unknown): value is NonNullable<Project["achievements"]> {
  if (!value || typeof value !== "object") return false;
  const { gameId, saved } = value as NonNullable<Project["achievements"]>;
  return typeof gameId === "string" && uuid.test(gameId) &&
    (saved === undefined || (typeof saved === "string" && uuid.test(saved)));
}

/**
 * Projects whose saved submit entry did not read as one this CLI wrote. The entry stays
 * in the state object untouched, so a deploy that saves the file writes it back as it
 * was, and only the commands that use it refuse it, through `savedSubmit`.
 *
 * It used to make the whole file unreadable, with a message about the deploy needed to
 * resume. The submit entry is only a retry key and the id of the submission it made, so
 * a damaged one says nothing about a deploy, and blocking deploy over it sent the person
 * looking at the wrong half of the file. Dropping it quietly is not an option either: the
 * key is what makes a rerun after a lost answer return the submission that was made
 * rather than send a second one, so the person decides what happens to it.
 */
const unreadableSubmit = new WeakSet<Project>();

function validSubmit(submit: unknown): submit is NonNullable<Project["submit"]> {
  if (!submit || typeof submit !== "object") return false;
  const { key, request, submissionId } = submit as NonNullable<Project["submit"]>;
  return typeof key === "string" && validKey(key) && (submissionId === undefined || (typeof submissionId === "string" && uuid.test(submissionId))) &&
    Boolean(request) && typeof request === "object" && typeof request.releaseId === "string" && uuid.test(request.releaseId) &&
    (request.jam === null || (typeof request.jam === "object" && typeof request.jam.slug === "string")) &&
    (request.destination === undefined || (request.destination === "qa" && request.jam === null));
}

/** The saved submit entry, for the commands that use it. `required` throws on a damaged
 * one with a message that names it; otherwise a damaged one reads as absent, which is
 * right for a deploy that only looks to see whether a review is still open. */
export function savedSubmit(state: Project, required: boolean): Project["submit"] {
  if (!unreadableSubmit.has(state)) return state.submit;
  if (required) throw new CliError("project_state", "The saved submit request in .opengame/project.json is damaged. Delete its \"submit\" entry, then run opengame submit again. If an earlier submit was made from this folder, check it on the game page first, so it is not sent twice. Deploys from this folder are not affected.");
  return undefined;
}

async function projectPath(root: string) {
  const folder = join(await realpath(root), ".opengame");
  return { folder, path: join(folder, "project.json") };
}

async function readState(path: string, origin: string): Promise<Project> {
  let state: Project = { version: 1, origin };
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > PROJECT_STATE_BYTES_MAX) throw invalid();
    state = parse(JSON.parse(await handle.readFile("utf8")), origin);
  } catch (error) {
    if (error instanceof CliError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw invalid();
  }
  finally { await handle?.close(); }
  return state;
}

/** Reading needs no lock: every write is an atomic rename, so a reader sees the
 * old file or the new one. Status and open used to take the deploy's lock just
 * to read, and failed with project_busy while a backgrounded deploy ran. */
export async function readProject(root: string, origin: string, options: {
  readFile?: (root: string, path: string, maximum: number) => Promise<Uint8Array>;
} = {}): Promise<Project> {
  if (options.readFile) {
    let bytes: Uint8Array;
    try { bytes = await options.readFile(root, ".opengame/project.json", PROJECT_STATE_BYTES_MAX); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, origin };
      throw error;
    }
    try { return parse(JSON.parse(Buffer.from(bytes).toString("utf8")), origin); }
    catch (error) { throw error instanceof CliError ? error : invalid(); }
  }
  const { folder, path } = await projectPath(root);
  try {
    const stat = await lstat(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw invalid();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, origin };
    throw error;
  }
  return readState(path, origin);
}

/** A deploy holds the lock while it creates and uploads. Competing processes cannot
 * replace a saved retry key or attach this folder to a different in-flight operation.
 * `retries` lets a short update wait for another writer's brief save. */
export async function withProject<T>(root: string, origin: string, run: (state: Project, save: () => Promise<void>) => Promise<T>, retries = 0): Promise<T> {
  const { folder, path } = await projectPath(root);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const stat = await lstat(folder);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw invalid();
  let compromised = false;
  let release: () => Promise<void>;
  try { release = await lock(path, { realpath: false, stale: LIMITS.platform.credentials.lockStaleMs, onCompromised: () => { compromised = true; },
    ...(retries ? { retries: { retries, minTimeout: 50, maxTimeout: 400 } } : {}) }); }
  catch { throw new CliError("project_busy", "Another CLI is deploying from this folder. Wait for it to finish, or run opengame status to follow it.", undefined, { next: "opengame status --watch" }); }
  try {
    const state = await readState(path, origin);
    return await run(state, async () => {
      if (compromised) throw new CliError("project_busy", "The project lock was interrupted. Stop other CLI processes, then retry.");
      const temporary = path + "." + randomUUID();
      try {
        const output = await open(temporary, "wx", 0o600);
        try { await output.writeFile(JSON.stringify(state, null, 2) + "\n"); await output.sync(); } finally { await output.close(); }
        if (compromised) throw invalid();
        await replaceFile(temporary, path);
      } finally { await unlink(temporary).catch(() => {}); }
    });
  } finally { await release(); }
}

/** Apply a small change under a briefly held lock, re-reading first so a change
 * made by another process in between is kept. Returns false if the folder stays
 * busy; the process holding it saves the same operation itself. */
export async function updateProject(root: string, origin: string, change: (state: Project) => boolean): Promise<boolean> {
  try {
    await withProject(root, origin, async (state, save) => { if (change(state)) await save(); }, 8);
    return true;
  } catch (error) {
    if (error instanceof CliError && error.code === "project_busy") return false;
    throw error;
  }
}

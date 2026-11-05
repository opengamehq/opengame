import { constants } from "node:fs";
import { mkdir, lstat, open, unlink, realpath, link } from "node:fs/promises";
import { replaceFile } from "./files";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { gameMetadataSnapshotSchema, manifestSchema, METADATA_FIELDS, type GameManifest } from "@opengame/protocol";
import { LIMITS } from "@opengame/shared";
import { Api } from "./http";
import { activeToken } from "./credentials";
import { withProject } from "./project";
import { readGame, refuseRemoved } from "./games";
import { CliError, Output } from "./output";

async function readLocal(path: string): Promise<string | null> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > LIMITS.platform.manifest.bytesMax) throw new Error();
    return await file.readFile("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new CliError("manifest_unreadable", "Could not read opengame.json. Use a regular JSON file before pulling.");
  } finally { await file?.close(); }
}
async function atomicWrite(path: string, value: string | Uint8Array, beforeReplace?: () => Promise<void>) {
  const temporary = path + "." + randomUUID();
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
    await beforeReplace?.();
    await replaceFile(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}
async function saveCover(root: string, cover: Awaited<ReturnType<Api["cover"]>>): Promise<string> {
  const folder = join(root, "opengame-assets");
  await mkdir(folder, { recursive: true });
  if (!(await lstat(folder)).isDirectory() || await realpath(folder) !== folder) throw new CliError("cover_folder", "opengame-assets must be a regular folder inside this project.");
  const relative = `opengame-assets/cover-${cover.sha256}.${cover.extension}`;
  const path = join(root, relative);
  const temporary = join(folder, `.${randomUUID()}`);
  try {
    await atomicWrite(temporary, cover.bytes);
    try { await link(temporary, path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await existing.stat();
        if (!stat.isFile() || stat.size !== cover.bytes.byteLength || createHash("sha256").update(await existing.readFile()).digest("hex") !== cover.sha256) {
          throw new CliError("cover_changed", "The downloaded cover's local file has changed. Move it out of opengame-assets, then pull again.");
        }
      } finally { await existing.close(); }
    }
  } finally { await unlink(temporary).catch(() => {}); }
  return relative;
}

export async function pullCommand(root: string, flags: Record<string, string | boolean>, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    await withProject(root, api.origin, async (state, save) => {
      if (!state.gameId) throw new CliError("not_linked", "Run opengame link --game <id> before pulling website changes.");
      if (state.deploy && !state.deploy.terminal) throw new CliError("deploy_in_progress", "This folder has an unfinished deploy. Run opengame status and finish that deploy before pulling website changes.");
      // A removed game's metadata was written into opengame.json with "Run opengame check"
      // after it, as if the folder could deploy it again.
      refuseRemoved(await readGame(api, token, state.gameId));
      const base = await realpath(root);
      const path = join(base, "opengame.json");
      const previous = await readLocal(path);
      let local: Record<string, unknown>;
      try { local = previous === null ? {} : JSON.parse(previous); if (!local || typeof local !== "object" || Array.isArray(local)) throw new Error(); }
      catch { throw new CliError("manifest_invalid", "opengame.json is not a JSON object. Fix it before pulling."); }
      const parsed = gameMetadataSnapshotSchema.safeParse(await api.json(`/api/v1/games/${state.gameId}/metadata`, { token }));
      if (!parsed.success || parsed.data.gameId !== state.gameId) throw new CliError("invalid_response", "The website metadata could not be read. Try again.", 5);
      const snapshot = parsed.data;
      if (Object.keys(snapshot.compatibility).length) throw new CliError("metadata_conversion_required", "This game's current settings cannot be represented in opengame.json. Review your local settings and use deploy --metadata=local to convert them.");
      const metadata = Object.fromEntries(METADATA_FIELDS.filter(key => snapshot.metadata[key] !== undefined).map(key => [key, snapshot.metadata[key]]));
      if (metadata.controls === undefined) {
        const controls = Array.isArray(local.controls) ? local.controls.filter(value => value !== "gamepad") : [];
        metadata.controls = [...controls, ...(snapshot.controllerSupport ? ["gamepad"] : [])];
      }
      const merged = manifestSchema.safeParse({ ...Object.fromEntries(Object.entries(local).filter(([key]) => !METADATA_FIELDS.includes(key as typeof METADATA_FIELDS[number]))), ...metadata });
      if (!merged.success) throw new CliError("manifest_invalid", "The website metadata and local build settings do not form a valid manifest. Check build, sdk and controls in opengame.json, then pull again.");
      const next: GameManifest = merged.data;
      if (Boolean(next.cover) !== Boolean(snapshot.cover) || (snapshot.cover && snapshot.cover.path !== `/api/v1/games/${state.gameId}/cover?revision=${snapshot.revision}`)) {
        throw new CliError("invalid_response", "The website cover details could not be read. Try again.", 5);
      }
      if (snapshot.cover) {
        output.emit({ type: "progress", stage: "cover", message: "Downloading your cover" });
        next.cover = await saveCover(base, await api.cover(state.gameId, snapshot.revision, token));
      }
      const changes = METADATA_FIELDS.filter(key => JSON.stringify(local[key]) !== JSON.stringify(next[key]));
      if (previous !== null && changes.length) await atomicWrite(join(base, ".opengame", "manifest-before-pull.json"), previous);
      // The file is first: an interrupted state write leaves an older revision,
      // so a deploy preserves website metadata instead of overwriting it.
      await atomicWrite(path, JSON.stringify(next, null, 2) + "\n", async () => {
        if (await readLocal(path) !== previous) throw new CliError("manifest_changed", "opengame.json changed during the pull. Run opengame pull again to keep those edits in its backup.");
      });
      state.metadataRevision = snapshot.revision;
      await save();
      output.emit({ type: "result", command: "pull", data: { gameId: state.gameId, revision: snapshot.revision, changes,
        ...(next.cover ? { cover: next.cover } : {}),
        message: changes.length ? `Updated ${changes.join(", ")} from the website. Your build settings are unchanged. Run opengame check.` : "Your metadata is already up to date." } });
    });
  } finally { await api.close(); }
}

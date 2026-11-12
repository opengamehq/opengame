import { constants } from "node:fs";
import { open, unlink, realpath } from "node:fs/promises";
import { replaceFile } from "./files";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
async function atomicWrite(path: string, value: string, beforeReplace?: () => Promise<void>) {
  const temporary = path + "." + randomUUID();
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(value); await file.sync(); } finally { await file.close(); }
    await beforeReplace?.();
    await replaceFile(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function pullCommand(root: string, flags: Record<string, string | boolean>, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    await withProject(root, api.origin, async (state, save) => {
      if (!state.gameId) throw new CliError("not_linked", "Run opengame link --game <id> before pulling website changes. opengame games lists the ids.", undefined, { next: "opengame games" });
      if (state.deploy && !state.deploy.terminal) throw new CliError("deploy_in_progress", "This folder has an unfinished deploy. Run opengame status and finish that deploy before pulling website changes.", undefined, { next: "opengame status --watch" });
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
      if (!merged.success) {
        /* A multiplayer game whose player count opengame.json cannot hold (none recorded, or
           more than a lobby takes) comes down as a `multiplayer` the manifest refuses. That is
           the website's value, not the checkout's build settings, so say which field it is and
           the way past it, as a conversion is said above. */
        const website = metadata.multiplayer === undefined ? [] : merged.error.issues.filter(issue => issue.path[0] === "multiplayer");
        if (website.length) {
          const count = website.some(issue => issue.path[1] === "maxPlayers");
          throw new CliError("metadata_conversion_required", (count
            ? `This game's player count on the website cannot be written in opengame.json, which takes 2 to ${LIMITS.rtc.peersPerLobbyMax} players.`
            : "This game's multiplayer settings on the website cannot be written in opengame.json.")
            + " Set multiplayer in opengame.json, check its other fields against the website, then use deploy --metadata=local to replace them.");
        }
        throw new CliError("manifest_invalid", "The website metadata and local build settings do not form a valid manifest. Check build, sdk and controls in opengame.json, then pull again.");
      }
      const next: GameManifest = merged.data;
      /* Nothing about a cover comes down any more. Until 30 Oct 2026 this downloaded the
         website's cover into opengame-assets/ and wrote its path into the file; OpenGame
         now makes the cover after approval, so there is nothing of the creator's to bring
         down, and an older server's snapshot.cover is not read. A cover already in
         opengame.json is not a metadata field, so it is left exactly as it was, and
         check says it can go. */
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
        message: changes.length ? `Updated ${changes.join(", ")} from the website. Your build settings are unchanged. Run opengame check.` : "Your metadata is already up to date." } });
    });
  } finally { await api.close(); }
}

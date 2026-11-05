import type { GameManifest } from "@opengame/protocol";
import { Api, ApiError } from "./http";
import { CliError, Output } from "./output";
import { readProject, updateProject } from "./project";

type Declared = NonNullable<GameManifest["achievements"]>;
type Operation = { id: string; state: string; gameId: string | null; releaseId: string | null };

/** Save declared achievements once per ready operation. Status retries a failed save.
 * Retirement is a creator's explicit API request: a client-side publication check
 * cannot prevent a rollback between its read and write. */
export async function syncAchievements(api: Api, token: string, root: string, op: Operation, declared: Declared | undefined, output: Output): Promise<void> {
  if (op.state !== "ready" || !op.gameId || !declared?.length) return;
  const gameId = op.gameId;
  const state = await readProject(root, api.origin);
  if (state.achievements?.gameId === gameId && state.achievements.saved === op.id) return;

  let saved = 0;
  let failure: { id: string; error: unknown } | null = null;
  for (const achievement of declared) {
    try {
      await api.json(`/api/v1/games/${gameId}/achievements`, { token, method: "PUT",
        body: { achievementId: achievement.id, title: achievement.title, description: achievement.description ?? "", active: true, operationId: op.id } });
      saved++;
    } catch (error) { failure = { id: achievement.id, error }; break; }
  }
  if (failure?.error instanceof CliError && failure.error.exitCode === 6) throw failure.error;
  const superseded = failure?.error instanceof ApiError && failure.error.reason === "achievement_deploy_superseded";

  const recorded = failure && !superseded ? true : await updateProject(root, api.origin, latest => {
    latest.achievements = { gameId, saved: op.id };
    return true;
  });
  const lines: string[] = [];
  if (saved) lines.push(`Saved ${saved} ${saved === 1 ? "achievement" : "achievements"} from opengame.json.`);
  if (superseded) lines.push(failure?.error instanceof Error ? failure.error.message : "A newer deploy already saved this game’s achievements, so this older one left them unchanged.");
  else if (failure) {
    const { id, error } = failure;
    const scope = error instanceof ApiError && error.reason === "insufficient_scope";
    lines.push(scope ? `${id} was not saved: this token cannot change achievements, and needs the Deploy scope for this game.`
      : error instanceof ApiError && error.status === 400 ? `The server refused ${id}: ${error.message}`
      : `${id} and any after it were not sent: ${error instanceof Error ? error.message : "the server did not answer"}`);
    lines.push("Run opengame status to try again.");
  }
  if (!recorded) lines.push("This folder was busy, so the record of what was saved was not written. Run opengame status to finish.");
  output.emit({ type: "notice", code: failure || !recorded ? "achievements_not_saved" : "achievements_saved", message: lines.join(" ") });
}

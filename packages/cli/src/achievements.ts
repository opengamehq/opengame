import { EXIT, type GameManifest } from "@opengame/protocol";
import { activeToken } from "./credentials";
import { linkedGameId, readGame } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, agentMode, terminalText } from "./output";
import { readProject, updateProject } from "./project";
import { confirm } from "./prompt";

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

type Flags = Record<string, string | boolean>;
type Definition = { achievement_id: string; title: string; description: string | null; active: boolean };

/**
 * `opengame achievements` lists a game's achievements as the server holds them, active and
 * retired. `opengame achievements retire <id>` retires one, as the achievements step on the
 * website does, through the same route: unlocks already earned are kept, and the game can no
 * longer award it. Declaring it again in opengame.json and deploying turns it back on.
 *
 * Retiring changes what players of a live game see, so a person is asked first and an agent
 * says --yes, and the server asks for the `submit` permission as well as `deploy`.
 */
export async function achievementsCommand(action: string | undefined, achievementId: string | undefined, root: string, flags: Flags, output: Output) {
  if (action !== undefined && action !== "retire") {
    throw new CliError("arguments", "Use opengame achievements to list them, or opengame achievements retire <id> to retire one.", EXIT.input);
  }
  if (action === "retire" && !achievementId) {
    throw new CliError("achievement_required", "Name the achievement to retire: opengame achievements retire <id>. opengame achievements lists them.", EXIT.input, { next: "opengame achievements" });
  }
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    const id = requested ?? await linkedGameId(api, token, root);
    if (!id) throw new CliError("not_linked", "Run this in a linked folder, or name the game with opengame achievements --game <id>.");
    const game = await readGame(api, token, id);
    const path = `/api/v1/games/${encodeURIComponent(game.id)}/achievements`;
    const listed = (await api.json(path, { token })).achievements;
    if (!Array.isArray(listed)) throw new CliError("invalid_response", "The achievements could not be read. Try again.", 5);
    const all = listed as Definition[];

    if (action !== "retire") {
      const lines = all.map(row => `${terminalText(row.achievement_id)}  ${row.active ? "active" : "retired"}  ${terminalText(row.title)}`);
      output.emit({ type: "result", command: "achievements", data: { gameId: game.id, achievements: all,
        message: all.length ? `${terminalText(game.title)}\n\n${lines.join("\n")}\n\nRetire one with opengame achievements retire <id>.`
          : `${terminalText(game.title)} has no achievements. Declare them in opengame.json and run opengame deploy.` } });
      return;
    }
    const target = all.find(row => row.achievement_id === achievementId);
    if (!target) throw new CliError("achievement_not_found", `${terminalText(game.title)} has no achievement ${terminalText(achievementId!)}. Run opengame achievements to see them.`, EXIT.input, { next: "opengame achievements" });
    if (!target.active) {
      output.emit({ type: "result", command: "achievements", data: { gameId: game.id, achievement: target, message: `${terminalText(target.title)} is already retired. Nothing changed.` } });
      return;
    }
    if (!flags.yes) {
      const person = !output.json && !agentMode() && Boolean(process.stdin.isTTY);
      if (!person) {
        throw new CliError("confirmation_required", `Retiring stops ${terminalText(game.title)} awarding ${terminalText(target.title)}. Add --yes to retire it.`,
          EXIT.input, { next: terminalText(`opengame achievements retire ${achievementId}${requested ? ` --game ${requested}` : ""} --yes`) });
      }
      if (!await confirm(`Retire ${terminalText(target.title)}? Players keep what they unlocked, and the game can no longer award it.`)) {
        throw new CliError("cancelled", "Cancelled. Nothing changed.", EXIT.input);
      }
    }
    const saved = await api.json(path, { token, method: "PUT",
      body: { achievementId: target.achievement_id, title: target.title, description: target.description ?? "", active: false } });
    output.emit({ type: "result", command: "achievements", data: { gameId: game.id, achievement: saved.achievement ?? null,
      message: `${terminalText(target.title)} is retired. Players keep what they unlocked. Declare it in opengame.json and deploy to turn it back on.` } });
  } finally { await api.close(); }
}

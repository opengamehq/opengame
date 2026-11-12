import { createInterface } from "node:readline/promises";
import { creatorGamePath, creatorGameSchema, creatorGamesPageSchema, ERRORS, gameDeploymentsPath, gameDeploymentsSchema, gameIdentifierSchema, gameCursorSchema, LISTING, OPERATION_STATUS, operationOutcome, RELEASE_STATUS, whenPacific, type CreatorGame, type Deployment } from "@opengame/protocol";
import { readableBytes } from "./bytes";
import { Api, ApiError } from "./http";
import { activeToken } from "./credentials";
import { ensureProjectIgnored } from "./init";
import { readSavedOperation } from "./operation";
import { readProject, withProject } from "./project";
import { openBrowser } from "./browser";
import { CliError, Output, agentMode, terminalText } from "./output";

type Flags = Record<string, string | boolean>;
const invalid = () => new CliError("invalid_response", "The game details could not be read. Try again.", 5);

export async function readGame(api: Api, token: string, id: string): Promise<CreatorGame> {
  if (!gameIdentifierSchema.safeParse(id).success) throw new CliError("invalid_game", "Use a game ID from opengame games with --game.", undefined, { next: "opengame games" });
  id = id.toLowerCase();
  try {
    const parsed = creatorGameSchema.safeParse((await api.json(`/api/v1/games/${id}`, { token })).game);
    if (!parsed.success || (parsed.data.id !== id && parsed.data.publicId !== id)) throw invalid();
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError && error.reason === "game_not_found") throw new CliError("game_not_found", "This game is not available to your account or token. Run opengame games to see available games.", 3);
    throw error;
  }
}

async function listGames(api: Api, token: string, cursor?: string) {
  if (cursor !== undefined && !gameCursorSchema.safeParse(cursor).success) throw new CliError("invalid_cursor", "Use the nextCursor from opengame games --json.");
  const parsed = creatorGamesPageSchema.safeParse(await api.json(`/api/v1/games${cursor ? `?cursor=${cursor}` : ""}`, { token }));
  if (!parsed.success) throw invalid();
  return parsed.data;
}
/** A removed game: deleted by its owner or after a notice. Nothing plays and nothing is
 * taken, so the commands that would treat it as a live preview stop here instead. */
export function isRemoved(game: CreatorGame): boolean {
  return game.status?.key === "taken_down" || game.visibility === "removed";
}
export function refuseRemoved(game: CreatorGame, linked = true): void {
  if (!isRemoved(game)) return;
  // The row's sentence is about this folder; named with --game, there is no folder to talk about.
  throw new CliError("game_removed", linked
    ? `${ERRORS.game_removed!.message!} To release this folder as another game, choose one with opengame games, then run opengame link --game <id> --replace.`
    : "That game was removed, so nobody can play it, including you. It shows as Unavailable under Your games on the website. Run opengame games to see the games you can open.", 2,
    { next: "opengame games" });
}

/* The server names each game in the words Your games uses (`status`), so the list and the
   shelf cannot disagree: this said Ready beside every game a reviewer had returned, and
   beside a removed one. A published game keeps the line that says whether it is listed
   and the address to share. An older server sends no status, and then a finished deploy
   is named by its outcome, as before. */
function label(game: CreatorGame) {
  const operation = game.latestOperation;
  const live = game.publication;
  const shared = live && (!operation || operation.state === "ready") && (!game.status || ["published", "publishing"].includes(game.status.key));
  const status = isRemoved(game) ? RELEASE_STATUS.taken_down.label
    : shared ? publicationLabel(live)
    : game.status ? game.status.label
    : operation ? operationOutcome({ state: operation.state, error: operation.error }, operation.findings ?? [])?.label ?? OPERATION_STATUS[operation.state].label : game.visibility;
  return `${game.publicId}  ${terminalText(game.title).replace(/\s+/g, " ")}  (${terminalText(status)})${live?.state === "published" && !isRemoved(game) ? `\n    ${live.url}` : ""}`;
}

/** "Published, unlisted", "Published" or "Publishing", in the words the strip uses. */
export function publicationLabel(live: NonNullable<CreatorGame["publication"]>): string {
  if (live.state === "publishing") return RELEASE_STATUS.publishing.label;
  return live.listed ? RELEASE_STATUS.published.label : `${RELEASE_STATUS.published.label}, ${LISTING.unlisted.label.toLowerCase()}`;
}

async function chooseGame(api: Api, token: string, output: Output): Promise<CreatorGame> {
  if (output.json || agentMode() || !process.stdin.isTTY) {
    throw new CliError("game_required", "Choose a game with opengame games, then run opengame link --game <id>.", undefined, { next: "opengame games" });
  }
  let page = await listGames(api, token);
  if (!page.games.length) throw new CliError("no_games", "You have no games to link. Run opengame init, then opengame deploy to create one.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      output.emit({ type: "notice", code: "choose_game", message: page.games.map((game, index) => `${index + 1}. ${label(game)}`).join("\n") });
      const answer = (await prompt.question(`Choose a game${page.nextCursor ? ", or n for the next page" : ""} (Enter to cancel): `)).trim();
      if (!answer) throw new CliError("cancelled", "Link cancelled. Your project has not changed.");
      if (answer === "n" && page.nextCursor) { page = await listGames(api, token, page.nextCursor); continue; }
      const selected = /^\d+$/.test(answer) ? page.games[Number(answer) - 1] : undefined;
      if (selected) return selected;
      output.emit({ type: "notice", code: "invalid_choice", message: "Choose a number from the list." });
    }
  } finally { prompt.close(); }
}

export async function gamesCommand(command: "games" | "link" | "open" | "deployments", root: string, flags: Flags, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    if (command === "games") {
      const page = await listGames(api, token, typeof flags.cursor === "string" ? flags.cursor : undefined);
      output.emit({ type: "result", command, data: { ...page,
        message: page.games.length ? `${page.games.map(label).join("\n")}\n\nLink a folder with opengame link --game <id>.${page.nextCursor ? `\nMore games: opengame games --cursor ${page.nextCursor}` : ""}`
          : flags.cursor ? "No more games. Run opengame games to return to the first page." : "You have no games to show. Run opengame init, then opengame deploy to create a game." } });
      return;
    }
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    if (command === "deployments") {
      // Reading the link needs no lock, so this works beside a running deploy.
      const id = requested ?? await linkedGameId(api, token, root);
      if (!id) throw new CliError("not_linked", "Run this in a linked folder, or name the game with opengame deployments --game <id>.");
      const game = await readGame(api, token, id);
      const parsed = gameDeploymentsSchema.safeParse(await api.json(`/api/v1/games/${game.id}/deployments`, { token }));
      if (!parsed.success) throw new CliError("invalid_response", "The deployments could not be read. Try again.", 5);
      const page = api.origin + gameDeploymentsPath(game.publicId);
      const rows = parsed.data.deployments;
      output.emit({ type: "result", command, data: { gameId: game.id, publicId: game.publicId, url: page, deployments: rows,
        message: rows.length ? `${terminalText(game.title)}, newest first\n\n${rows.map(deploymentLines).join("\n\n")}\n\nEvery deployment: ${page}`
          : `${terminalText(game.title)} has no deploys yet. Run opengame deploy from its folder.` } });
      return;
    }
    if (command === "open" && requested) {
      const game = await readGame(api, token, requested);
      refuseRemoved(game, false);
      showGame(game); return;
    }
    if (command === "open") {
      // Reading the link needs no lock, so open works while a deploy runs here.
      const id = await linkedGameId(api, token, root);
      if (!id) throw new CliError("not_linked", "Run opengame link --game <id>, or opengame open --game <id>.");
      const game = await readGame(api, token, id);
      refuseRemoved(game);
      showGame(game); return;
    }
    await withProject(root, api.origin, async (state, save) => {
      const game = requested ? await readGame(api, token, requested) : state.gameId ? await readGame(api, token, state.gameId) : await chooseGame(api, token, output);
      // It takes no new releases, so "Run opengame check, then opengame deploy" led to a refusal.
      if (isRemoved(game)) throw new CliError("game_removed", "That game was removed, so it takes no new releases. Choose another with opengame games.", 2, { next: "opengame games" });
      const changed = state.gameId !== game.id;
      if (changed && state.deploy && !state.deploy.terminal) {
        throw new CliError("deploy_in_progress", "This folder has an unfinished deploy. Run opengame status, then finish the deploy before linking another game.", undefined, { next: "opengame status --watch" });
      }
      if (changed && state.gameId && !flags.replace) {
        throw new CliError("already_linked", "This folder is linked to another game. Add --replace to link the selected game.", undefined, { next: `opengame link --game ${game.publicId} --replace` });
      }
      await ensureProjectIgnored(root);
      if (changed) {
        state.gameId = game.id;
        delete state.metadataRevision;
        delete state.deploy;
        await save();
      }
      output.emit({ type: "result", command, data: { gameId: game.id, publicId: game.publicId, changed,
        message: `${changed ? "Linked" : "Already linked"} to ${game.title}. Run opengame check, then opengame deploy.` } });
    });
    function showGame(game: CreatorGame) {
      const url = api.origin + creatorGamePath(game);
      const playable = url.includes("/g/");
      output.emit({ type: "result", command: "open", data: { gameId: game.id, publicId: game.publicId, url,
        message: playable ? `Open ${url}\nYour private game page: the newest ready release plays there, only for you.` : `Open ${url}\nThis upload is still being checked.` } });
      openBrowser(url, !output.json && !flags["no-browser"]);
    }
  } finally { await api.close(); }
}

/** One deploy as the terminal lists it: the facts on the first line, then why it stopped
 * and where to look. The page and the list on the website read the same row, and say its
 * time the same way: in Pacific, through whenPacific, where this once wrote UTC. The time
 * goes through terminalText like every other server string: whenPacific hands back a value it
 * cannot read as an instant unchanged, and the old formatter threw instead. */
function deploymentLines(row: Deployment): string {
  const size = [row.byteSize !== null ? readableBytes(row.byteSize) : null, row.fileCount !== null ? `${row.fileCount.toLocaleString("en-GB")} ${row.fileCount === 1 ? "file" : "files"}` : null].filter(Boolean).join(", ");
  const facts = [row.id.slice(0, 8), terminalText(row.label), terminalText(whenPacific(row.createdAt, { instant: true })), size || null, row.by ? `by ${terminalText(row.by)}` : null,
    row.releaseId ? `release ${row.releaseId}` : null].filter(Boolean).join("  ");
  return [facts,
    ...(row.reason ? [`    ${terminalText(row.reason.observed)} ${terminalText(row.reason.fix)}`] : []),
    `    ${row.previewUrl ? `Play: ${row.previewUrl}` : row.url}`].join("\n");
}


export async function linkedGameId(api: Api, token: string, root: string): Promise<string | undefined> {
  const state = await readProject(root, api.origin);
  if (!state.gameId && state.deploy) {
    const op = await readSavedOperation(api, token, root, state);
    // A first deploy that failed or expired will never create a game, so "not yet" would
    // have somebody wait on nothing (review of #613). Say why it stopped and what to run.
    const ended = op && !state.gameId ? operationOutcome({ state: op.state, error: op.error }, op.findings ?? []) : null;
    if (ended) throw new CliError(ended.code, `Your first deploy stopped before it created a game, so there is nothing to show. ${ended.message}`,
      ended.exit, { next: ended.next ?? "opengame deploy" });
    if (!state.gameId) throw new CliError(op ? "game_pending" : "upload_pending",
      op ? "This deploy has not created a game yet. Run opengame status to see its progress."
        : "Your deploy was saved before the server answered. Run opengame deploy to resume it.",
      2, { next: op ? "opengame status" : "opengame deploy" });
  }
  return state.gameId;
}

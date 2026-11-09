import { EXIT, gameDeleteApiPath, gameTakeDownApiPath, gameTakeDownSchema } from "@opengame/protocol";
import { activeToken } from "./credentials";
import { linkedGameId, readGame } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, agentMode, terminalText } from "./output";
import { ask, confirm } from "./prompt";

type Flags = Record<string, string | boolean>;

/**
 * `opengame unpublish` and `opengame restore`: Unpublish and Put it back on the website's
 * Your games page, from a terminal.
 *
 * Nothing here decides whether either is allowed. The server runs the website's own
 * functions for both, so a hold, a report, a reviewer holding the game, our own takedown or
 * a game that is not on the gallery refuses here exactly as it does on the page, and in the
 * page's words, which this prints as they come.
 *
 * Both change what every player gets, so neither is a side effect of a command line nobody
 * looked at: a person answers a question, and an agent or a script says --yes, as for
 * rollback.
 */
export async function takeDownCommand(command: "unpublish" | "restore", root: string, flags: Flags, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    const id = requested ?? await linkedGameId(api, token, root);
    if (!id) throw new CliError("not_linked", `Run this in a linked folder, or name the game with opengame ${command} --game <id>.`);
    const game = await readGame(api, token, id);
    const page = `${api.origin}/settings/games`;

    if (!flags.yes) {
      const person = !output.json && !agentMode() && Boolean(process.stdin.isTTY);
      if (!person) {
        throw new CliError("confirmation_required", command === "unpublish"
          ? `Unpublishing takes the game away from every player. Add --yes to unpublish ${terminalText(game.title)}.`
          : `Putting the game back serves it to every player again. Add --yes to put ${terminalText(game.title)} back.`,
        EXIT.input, { next: `opengame ${command}${requested ? ` --game ${requested}` : ""} --yes` });
      }
      // The website's own question for each button.
      const question = command === "unpublish"
        ? `Unpublish ${terminalText(game.title)}? It comes off the gallery and stops being served. Your build and uploads are kept, and opengame restore puts it back.`
        : `Put ${terminalText(game.title)} back on the gallery? It serves the version it was on when it came down.`;
      if (!await confirm(question)) throw new CliError("cancelled", "Cancelled. Nothing changed.", EXIT.input);
    }

    let raw: Record<string, unknown>;
    try { raw = await api.json(gameTakeDownApiPath(game.id, command), { token, method: "POST" }); }
    catch (error) {
      /* A server from before these routes answers the API's catch-all 404, which the
         client names as the whole API being absent. It is only these two, and the page
         has both. */
      if (error instanceof ApiError && error.code === "api_unavailable") {
        throw new CliError("take_down_unavailable", `This OpenGame server cannot ${command === "unpublish" ? "unpublish" : "put back"} a game from the CLI yet. Use Your games on the website: ${page}`, 5, { retry: "after-fix" });
      }
      throw error;
    }
    const parsed = gameTakeDownSchema.safeParse(raw);
    // A 200 means it was done; only its description is unreadable.
    if (!parsed.success) throw new CliError("invalid_response", `The game was ${command === "unpublish" ? "unpublished" : "put back"}, but the answer could not be read. Run opengame games to see where it stands.`, 5, { next: "opengame games" });
    const done = parsed.data;
    output.emit({ type: "result", command, data: { ...done, message: `${terminalText(done.message)}\n${done.url}` } });
  } finally { await api.close(); }
}

/**
 * `opengame delete`: Delete for good on the game's page. The website asks a person to type
 * the title, and so does this: in a terminal the person types it at the prompt, and an
 * agent or a script passes it as `--title` with `--yes`. The server compares it against the
 * game's own row, as the page's form does, so the CLI never decides whether it matched.
 *
 * Only the `opengame login` token can delete, not a token made in settings: delete cannot be
 * undone. The bundle and the archive are kept behind the tombstone, as on the website, so a
 * live or frozen version never loses its bytes.
 */
export async function deleteCommand(root: string, flags: Flags, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    const id = requested ?? await linkedGameId(api, token, root);
    if (!id) throw new CliError("not_linked", "Run this in a linked folder, or name the game with opengame delete --game <id>.");
    const game = await readGame(api, token, id);

    let typed = typeof flags.title === "string" ? flags.title : undefined;
    if (!flags.yes || typed === undefined) {
      const person = !output.json && !agentMode() && Boolean(process.stdin.isTTY);
      if (!person) {
        /* Named by its public id and not by its title: the title is the person's to type, and
           a refusal that printed it would hand an agent the answer to copy (review of #1286). */
        throw new CliError("confirmation_required", `Deleting game ${game.publicId} cannot be undone. Ask the person to type its title, then pass what they typed with --title, and --yes.`,
          EXIT.input, { next: `opengame delete${requested ? ` --game ${requested}` : ""} --title "<the title the person typed>" --yes` });
      }
      output.emit({ type: "notice", code: "delete", message: `Deleting ${terminalText(game.title)} takes it off the gallery and stops it being served for good. It cannot be put back. Your uploads are kept, but nobody can play it, you included.` });
      typed = (await ask(`Type the title, ${terminalText(game.title)}, to delete it for good:`)).trim();
      if (!typed) throw new CliError("cancelled", "Cancelled. Nothing was deleted.", EXIT.input);
    }

    let raw: Record<string, unknown>;
    try { raw = await api.json(gameDeleteApiPath(game.id), { token, method: "POST", body: { title: typed } }); }
    catch (error) {
      if (error instanceof ApiError && error.code === "api_unavailable") {
        throw new CliError("take_down_unavailable", `This OpenGame server cannot delete a game from the CLI yet. Use the game's page on the website: ${api.origin}/settings/games/${encodeURIComponent(game.publicId)}`, 5, { retry: "after-fix" });
      }
      throw error;
    }
    const parsed = gameTakeDownSchema.safeParse(raw);
    if (!parsed.success) throw new CliError("invalid_response", "The game was deleted, but the answer could not be read. Run opengame games to see it.", 5, { next: "opengame games" });
    output.emit({ type: "result", command: "delete", data: { ...parsed.data, message: terminalText(parsed.data.message) } });
  } finally { await api.close(); }
}

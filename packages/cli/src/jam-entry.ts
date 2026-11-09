import { EXIT, gameJamEntryApiPath, gameJamEntrySchema } from "@opengame/protocol";
import { activeToken } from "./credentials";
import { linkedGameId, readGame } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, agentMode, terminalText } from "./output";
import { confirm } from "./prompt";

type Flags = Record<string, string | boolean>;

/**
 * `opengame jam withdraw` and `opengame jam reenter`: Withdraw and Re-enter on the website's
 * jam entries page, for the linked game or `--game`. The server finds the game's entry and
 * runs the page's own functions, so the kickoff, the entry allowance and the account checks
 * refuse here exactly as there, in the same words.
 *
 * Withdrawing frees the place and stops the entry's review, so a person is asked first and
 * an agent says --yes. Putting it back is how a mistaken withdrawal is undone, and is not
 * asked about.
 */
export async function jamEntryCommand(action: string | undefined, root: string, flags: Flags, output: Output) {
  if (action !== "withdraw" && action !== "reenter") {
    throw new CliError("jam_action_required", "Say what to do with the linked game's jam entry: opengame jam withdraw, or opengame jam reenter.", EXIT.input, { next: "opengame jam withdraw" });
  }
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    const id = requested ?? await linkedGameId(api, token, root);
    if (!id) throw new CliError("not_linked", `Run this in a linked folder, or name the game with opengame jam ${action} --game <id>.`);
    const game = await readGame(api, token, id);

    if (action === "withdraw" && !flags.yes) {
      const person = !output.json && !agentMode() && Boolean(process.stdin.isTTY);
      if (!person) {
        throw new CliError("confirmation_required", `Withdrawing takes ${terminalText(game.title)} out of the jam and stops its review. Add --yes to withdraw it.`,
          EXIT.input, { next: `opengame jam withdraw${requested ? ` --game ${requested}` : ""} --yes` });
      }
      if (!await confirm(`Withdraw ${terminalText(game.title)} from the jam? Its place is freed, and opengame jam reenter puts it back while the jam is open.`)) {
        throw new CliError("cancelled", "Cancelled. Nothing changed.", EXIT.input);
      }
    }

    let raw: Record<string, unknown>;
    try { raw = await api.json(gameJamEntryApiPath(game.id, action), { token, method: "POST" }); }
    catch (error) {
      if (error instanceof ApiError && error.code === "api_unavailable") {
        throw new CliError("edit_unavailable", `This OpenGame server cannot change a jam entry from the CLI yet. Use your jam entries page: ${api.origin}/jam/entries`, 5, { retry: "after-fix" });
      }
      throw error;
    }
    const parsed = gameJamEntrySchema.safeParse(raw);
    if (!parsed.success) throw new CliError("invalid_response", "The entry was changed, but the answer could not be read. Check your jam entries page.", 5);
    const done = parsed.data;
    output.emit({ type: "result", command: "jam", data: { ...done, action, message: `${terminalText(done.message)}\n${done.url}` } });
  } finally { await api.close(); }
}

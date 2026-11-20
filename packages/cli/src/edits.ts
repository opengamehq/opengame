import { ACCOUNT_HANDLE_API_PATH, EXIT, accountHandleSchema, gameDeclaredModelsSchema, gameDetailsApiPath, gameDetailsSchema, gameMetadataSnapshotSchema } from "@opengame/protocol";
import { activeToken } from "./credentials";
import { linkedGameId, readGame } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, agentMode, terminalText } from "./output";
import { confirm } from "./prompt";

type Flags = Record<string, string | boolean>;

async function signedIn(api: Api, flags: Flags) {
  const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
  if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
  api.tokenSource = active.source;
  return active.token;
}

/** A server from before a route answers the API's catch-all 404, which the client names as
 * the whole API being absent. It is only that route, and the website has it. */
function olderServer(error: unknown, what: string, page: string): unknown {
  if (error instanceof ApiError && error.code === "api_unavailable") {
    return new CliError("edit_unavailable", `This OpenGame server cannot ${what} from the CLI yet. Do it on the website: ${page}`, 5, { retry: "after-fix" });
  }
  return error;
}

/** What the game says it was made with, and the list it may choose from, or null from a server
 * before 19 Nov 2026, which has no such read. */
async function declaredModels(api: Api, token: string, gameId: string) {
  try {
    const parsed = gameDeclaredModelsSchema.safeParse(await api.json(gameDetailsApiPath(gameId), { token }));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    /* An older server has the route for PATCH only, so Next answers this GET 405, or the
       API's catch-all answers 404. Either way the words still print. */
    if (error instanceof ApiError && (error.code === "api_unavailable" || error.status === 404 || error.status === 405)) return null;
    throw error;
  }
}

/** "Gemini and Claude Code", or "(none)". */
const madeWith = (models: readonly { name: string }[]) =>
  models.length ? new Intl.ListFormat("en").format(models.map(model => terminalText(model.name))) : "(none)";

/**
 * `opengame details`: the Details tab on a game's page. With none of `--title`, `--tagline`,
 * `--description` or `--models` it prints the words the website shows and the models the
 * game says it was made with; with any of them it saves those, through the tab's own save on
 * the server, and the rest stay as they are. `--models` replaces the whole list (19 Nov 2026),
 * and `--clear-models` empties it.
 *
 * Not asked about first, as the tab's Save is not: the words can be changed back the same
 * way, and on a published game the server records both sides. A later `opengame deploy`
 * from a folder with older words keeps the website's and says so; `opengame pull` brings
 * them into opengame.json.
 */
export async function detailsCommand(root: string, flags: Flags, output: Output) {
  const api = new Api();
  try {
    const token = await signedIn(api, flags);
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    const id = requested ?? await linkedGameId(api, token, root);
    if (!id) throw new CliError("not_linked", "Run this in a linked folder, or name the game with opengame details --game <id>.");
    const game = await readGame(api, token, id);
    const page = `${api.origin}/settings/games/${encodeURIComponent(game.publicId)}`;
    const body: Record<string, string | string[]> = {};
    // The parser takes no empty value, so removing the tagline, as the tab's empty box does, is a flag of its own.
    if (flags["clear-tagline"]) {
      if (typeof flags.tagline === "string") throw new CliError("conflicting_flags", "Use --tagline or --clear-tagline, not both.", EXIT.input);
      body.tagline = "";
    }
    for (const field of ["title", "tagline", "description"] as const) {
      if (typeof flags[field] === "string") body[field] = flags[field] as string;
    }
    // Emptying the list is a flag of its own for the same reason.
    if (flags["clear-models"]) {
      if (flags.models !== undefined) throw new CliError("conflicting_flags", "Use --models or --clear-models, not both.", EXIT.input);
      body.models = [];
    } else if (flags.models !== undefined) {
      const models = typeof flags.models === "string" ? flags.models.split(",").map(key => key.trim()).filter(Boolean) : [];
      if (!models.length) throw new CliError("invalid_flag", "Name the models with --models, separated by commas, as in --models gemini,claude-code. Run opengame details to see the list, or use --clear-models to empty it.", EXIT.input);
      body.models = models;
    }

    if (!Object.keys(body).length) {
      const [snapshot, declared] = await Promise.all([
        api.json(`/api/v1/games/${encodeURIComponent(game.id)}/metadata`, { token }).then(raw => gameMetadataSnapshotSchema.safeParse(raw)),
        declaredModels(api, token, game.id),
      ]);
      if (!snapshot.success) throw new CliError("invalid_response", "The game's details could not be read. Try again.", 5);
      const words = snapshot.data.metadata;
      const text = (value: unknown) => typeof value === "string" && value.trim() ? terminalText(value) : "(none)";
      const models = declared ? `Made with: ${madeWith(declared.models)}\n` : "";
      const choices = declared ? `\n--models takes any of: ${declared.choices.map(choice => terminalText(choice.key)).join(", ")}.` : "";
      output.emit({ type: "result", command: "details", data: { gameId: game.id, publicId: game.publicId, title: words.title ?? null,
        tagline: words.tagline ?? null, description: words.description ?? null, revision: snapshot.data.revision,
        ...(declared ? { models: declared.models, choices: declared.choices } : {}), url: page,
        message: `Title: ${text(words.title)}\nTagline: ${text(words.tagline)}\nDescription: ${text(words.description)}\n${models}\nChange them with opengame details ${declared ? "--title, --tagline, --description or --models" : "--title, --tagline or --description"}.${choices}\n${page}` } });
      return;
    }

    let raw: Record<string, unknown>;
    try { raw = await api.json(gameDetailsApiPath(game.id), { token, method: "PATCH", body }); }
    catch (error) {
      /* A server from before 19 Nov 2026 refuses a body with models as not one it takes. */
      if (body.models && error instanceof ApiError && error.status === 400 && error.code === "invalid_request"
        && error.data.message === "Send a title, a tagline or a description, as text.") {
        throw new CliError("edit_unavailable", `This OpenGame server cannot change a game's models from the CLI yet. Change them on the Details tab: ${page}`, 5, { retry: "after-fix" });
      }
      throw olderServer(error, body.models ? "change a game's details" : "change a game's words", page);
    }
    const parsed = gameDetailsSchema.safeParse(raw);
    if (!parsed.success) throw new CliError("invalid_response", "The details were saved, but the answer could not be read. Run opengame details to see them.", 5, { next: "opengame details" });
    const done = parsed.data;
    /* A server from before 19 Nov 2026 takes no models: its schema refuses the body, so a save
       that comes back without them changed only the words. */
    if (body.models && !done.models) throw new CliError("edit_unavailable", `This OpenGame server cannot change a game's models from the CLI yet. Change them on the Details tab: ${page}`, 5, { retry: "after-fix" });
    const said = body.models ? (done.models!.length ? ` Its page lists ${done.models!.map(terminalText).join(", ")} under Made with.` : " Its page lists no models now.") : "";
    output.emit({ type: "result", command: "details", data: { ...done,
      message: `${done.live ? `Saved. Players see the ${body.models ? "change" : "new words"} now.` : `Saved. The game's page will use ${body.models ? "these details" : "these words"}.`}${said}\n${done.url}` } });
  } finally { await api.close(); }
}

/**
 * `opengame handle <name>`: rename the account's handle, as Settings does, through the same
 * function on the server. The old handle becomes free for anyone to claim at once (since
 * 13 Nov 2026), games keep their /g links, the profile address changes, and renames are
 * limited per day, so a person is asked first and an agent says --yes. Only the `opengame login` token can do it; a token made in settings cannot.
 */
export async function handleCommand(name: string | undefined, flags: Flags, output: Output) {
  const api = new Api();
  try {
    // People write their handle with its @; the server's rules do not take one.
    name = name?.replace(/^@/, "");
    if (!name) throw new CliError("handle_required_argument", "Name the new handle: opengame handle <name>. opengame whoami prints the one you have.", EXIT.input, { next: "opengame whoami" });
    const token = await signedIn(api, flags);
    if (!flags.yes) {
      const person = !output.json && !agentMode() && Boolean(process.stdin.isTTY);
      if (!person) {
        throw new CliError("confirmation_required", `Renaming changes your public name and your profile address. Your games keep their /g links. Add --yes to rename your handle to ${terminalText(name)}.`,
          EXIT.input, { next: `opengame handle ${name} --yes` });
      }
      if (!await confirm(`Rename your handle to ${terminalText(name)}? Your old handle becomes free for anyone to claim, your games keep their /g links, and you can rename only a few times a day.`)) {
        throw new CliError("cancelled", "Cancelled. Nothing changed.", EXIT.input);
      }
    }
    let raw: Record<string, unknown>;
    try { raw = await api.json(ACCOUNT_HANDLE_API_PATH, { token, method: "POST", body: { handle: name } }); }
    catch (error) { throw olderServer(error, "rename your handle", `${api.origin}/settings`); }
    const parsed = accountHandleSchema.safeParse(raw);
    if (!parsed.success) throw new CliError("invalid_response", "The rename was sent, but the answer could not be read. Run opengame whoami to see your handle.", 5, { next: "opengame whoami" });
    const done = parsed.data;
    output.emit({ type: "result", command: "handle", data: { ...done,
      message: `Your handle is @${terminalText(done.handle)}.${done.previous ? ` @${terminalText(done.previous)} is free for anyone to claim now. Your games keep their /g links.` : ""}\n${done.url}` } });
  } finally { await api.close(); }
}

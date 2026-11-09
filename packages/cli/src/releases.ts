import { EXIT, gameReleasesApiPath, gameReleasesSchema, gameRollbackApiPath, gameRollbackSchema, whenPacific, type GameRelease } from "@opengame/protocol";
import { activeToken } from "./credentials";
import { linkedGameId, readGame } from "./games";
import { Api, ApiError } from "./http";
import { CliError, Output, agentMode, terminalText } from "./output";
import { confirm } from "./prompt";

type Flags = Record<string, string | boolean>;

/**
 * `opengame releases` and `opengame rollback`: the Releases tab on a game's page, from a
 * terminal. The list is the tab's own (the server reads it with the same function), and
 * the rollback is the tab's "Make live again", through the same server function, so the
 * terminal can neither offer a row the page would not nor allow one the page refuses.
 *
 * Nothing here decides whether a rollback is allowed. The list says which rows the page
 * offers, and the server checks everything again: ownership, the token's `submit` scope,
 * the game being live, the release having been live and still having its files, a release
 * we hold, a publication on its way. Its refusal is printed in its own words.
 */
export async function releasesCommand(command: "releases" | "rollback", root: string, target: string | undefined, flags: Flags, output: Output) {
  const api = new Api();
  try {
    const active = await activeToken(api.origin, Boolean(flags["token-stdin"]));
    if (!active) throw new CliError("not_signed_in", "Run opengame login, or supply OPENGAME_TOKEN.", 3, { next: "opengame login" });
    const token = active.token;
    api.tokenSource = active.source;
    if (command === "rollback" && !target) {
      throw new CliError("release_required", "Name the release to make live again: opengame rollback <release>. opengame releases lists them.", EXIT.input, { next: "opengame releases" });
    }
    const requested = typeof flags.game === "string" ? flags.game : undefined;
    // Reading the link needs no lock, so this works beside a running deploy.
    const id = requested ?? await linkedGameId(api, token, root);
    if (!id) throw new CliError("not_linked", `Run this in a linked folder, or name the game with opengame ${command} --game <id>.`);
    const game = await readGame(api, token, id);
    const list = await readReleases(api, token, game.id);
    const page = `${api.origin}/settings/games/${encodeURIComponent(list.publicId)}`;

    if (command === "releases") {
      const lines = list.releases.map(releaseLine);
      const note = !list.releases.length ? null
        : !list.live ? "Nothing can be made live again while the game is not live."
        : list.rollbackBlocked ? list.rollbackBlocked
        : list.releases.some(row => row.rollback) ? "Make one live again with opengame rollback <release>." : null;
      output.emit({ type: "result", command, data: { ...list, url: page,
        message: list.releases.length ? `${terminalText(game.title)}, newest first\n\n${lines.join("\n")}${note ? `\n\n${terminalText(note)}` : ""}\n\nOn the website: ${page}`
          : `${terminalText(game.title)} has no releases yet. Run opengame deploy from its folder.` } });
      return;
    }

    const release = pick(list.releases, target!);
    /* The live release is sent too. After `host_failed` the database has already moved, so
       the list calls that release live while its address still serves the previous one; the
       server's answer to a live release is to write the address again (`swapped: false`),
       which is the repair "send it again" promises. Answering it here instead said "nothing
       changed" over a game still serving the old build (review of this change). */
    /* Rolling back changes what every player gets, so it is never a side effect of a
       command line nobody looked at: a person answers the page's question, and an agent or
       a script says --yes. The question is the page's own words. */
    if (!flags.yes) {
      const person = !output.json && !agentMode() && Boolean(process.stdin.isTTY);
      if (!person) {
        throw new CliError("confirmation_required", `Rolling back changes what every player gets. Add --yes to make release ${release.short} live again.`,
          EXIT.input, { next: `opengame rollback ${release.short}${requested ? ` --game ${requested}` : ""} --yes` });
      }
      output.emit({ type: "notice", code: "rollback", message: `${terminalText(game.title)}: release ${release.short}, ${terminalText(release.label)}, from ${terminalText(whenPacific(release.createdAt, { instant: true }))}` });
      const question = release.live
        ? `Release ${release.short} is the live one. Write its address again, so players get it from their next load?`
        : `Make release ${release.short} live? Players get it from their next load, and the live release stays in the list to go back to.`;
      if (!await confirm(question)) {
        throw new CliError("cancelled", "Cancelled. Nothing changed.", EXIT.input);
      }
    }
    let raw: Record<string, unknown>;
    try { raw = await api.json(gameRollbackApiPath(game.id, release.id), { token, method: "POST" }); }
    catch (error) { throw olderServer(error, page); }
    const parsed = gameRollbackSchema.safeParse(raw);
    // The server answered 200, so the swap happened; only its description is unreadable.
    if (!parsed.success) throw new CliError("invalid_response", `The rollback was sent, but its answer could not be read. Run opengame releases to see which release is live.`, 5, { next: "opengame releases" });
    const done = parsed.data;
    output.emit({ type: "result", command, data: { ...done,
      message: done.swapped ? `Release ${release.short} is live again. Players get it from their next load.\n${done.url}`
        : `Release ${release.short} was already live. Its address was written again, so players get it.\n${done.url}` } });
  } finally { await api.close(); }
}

async function readReleases(api: Api, token: string, gameId: string) {
  let raw: Record<string, unknown>;
  try { raw = await api.json(gameReleasesApiPath(gameId), { token }); }
  catch (error) { throw olderServer(error, `${api.origin}/settings/games`); }
  const parsed = gameReleasesSchema.safeParse(raw);
  if (!parsed.success) throw new CliError("invalid_response", "The releases could not be read. Try again.", 5);
  return parsed.data;
}

/** A server from before these routes answers the API's catch-all 404, which the client
 * names as the whole API being absent. It is only these two routes, and the page has both. */
function olderServer(error: unknown, page: string): unknown {
  if (error instanceof ApiError && error.code === "api_unavailable") {
    return new CliError("releases_unavailable", `This OpenGame server does not list releases to the CLI yet. Use the Releases tab on your game's page: ${page}`, 5, { retry: "after-fix" });
  }
  return error;
}

/**
 * The release a person or an agent named: a whole id, or the start of one as every list
 * prints it (eight characters), or the start of the version it published. A prefix that
 * fits two is refused with both, rather than guessed.
 */
export function pick(releases: readonly GameRelease[], typed: string): GameRelease {
  const wanted = typed.trim().toLowerCase();
  if (!/^[0-9a-f-]{8,36}$/.test(wanted)) throw new CliError("invalid_release", "Name a release by its id, or the first eight characters opengame releases prints.", EXIT.input);
  const exact = releases.find(row => row.id === wanted || row.versionId === wanted);
  if (exact) return exact;
  const matches = releases.filter(row => row.id.startsWith(wanted) || (row.versionId?.startsWith(wanted) ?? false));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new CliError("release_ambiguous", `More than one release starts with ${wanted}: ${matches.map(row => row.id).join(", ")}. Use more of the id.`, EXIT.input);
  throw new CliError("release_not_found", `No release of this game starts with ${wanted}. Run opengame releases to see them.`, EXIT.input, { next: "opengame releases" });
}

/** One release as the terminal lists it: the facts on one line, the way the tab shows them. */
function releaseLine(row: GameRelease): string {
  const tags = [row.live ? "Live" : null, !row.live && row.newest ? "Newest" : null, row.label, row.rollback ? "can be made live again" : null].filter(Boolean);
  return `${row.short}  ${terminalText(whenPacific(row.createdAt, { instant: true }))}  ${tags.map(tag => terminalText(String(tag))).join(", ")}\n    ${terminalText(row.title).replace(/\s+/g, " ")}`;
}

import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, open, lstat, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
import { sourceGameFor } from "@opengame/shared/source-games";
import { AUTO, DEFAULT_GAME_KIND, GAME_KIND_SLUGS, GENRE_SLUGS, LIMITS, gameKindOrDefault, isAutoValue, isGameKind, kindNeedsBasedOn,
  kindPhrase as sharedKindPhrase,
  parseGameKind, slurTextProblem, type GameKind } from "@opengame/shared";
import { PLACEHOLDER_DESCRIPTION, manifestSchema, manifestCredentialIssue, type DeployProvisional } from "@opengame/protocol";
import { CliError } from "./output";
import type { Output } from "./output";
import { detectBuildOutput, lockfileInstall, readBuildPackage } from "./build-output";
import { engineSetup, ENGINE_PRESETS, GENERIC_EXPORT, namedEngine } from "./engines";
import { ask, choose } from "./prompt";
import { AUTO_FIELDS, AUTO_HELP, autoFields, provisionalAuto, resolveAuto } from "./auto";
export { FALLBACK_GENRE } from "./auto";
import { folderArgument, replaceFile, withoutBom } from "./files";

export async function ensureProjectIgnored(root: string) {
  const path = join(root, ".gitignore");
  let handle;
  try {
    handle = await open(path, constants.O_CREAT | constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW, 0o644);
    if (!(await handle.stat()).isFile()) throw new Error();
    const text = await handle.readFile("utf8");
    // Append after negations too. A broad !*/ rule later in the file could undo
    // an earlier ignore and commit one machine's project identity to a fork.
    if (text.trimEnd().split(/\r?\n/).at(-1) !== ".opengame/") {
      await handle.writeFile(`${text && !text.endsWith("\n") ? "\n" : ""}.opengame/\n`);
    }
  } catch { throw new CliError("project_ignore", "Could not ignore .opengame/. Use a writable regular .gitignore file, then retry."); }
  finally { await handle?.close(); }
}

/** Whether this folder is already connected to a game on the website, which is the only
 * case where `opengame pull` has anything to bring down. Read loosely: a wrong answer
 * changes one sentence of advice, and the commands that act on the link validate it. */
async function linkedGame(root: string) {
  try { return typeof JSON.parse(await readFile(join(root, ".opengame", "project.json"), "utf8"))?.gameId === "string"; }
  catch { return false; }
}

/** The question init asks, passed in so a test can answer it without a terminal, the way
 * submit's prompts are. `choose` stays in the shape so a caller written for the older,
 * longer interview still type-checks; init no longer calls it. */
export interface InitPrompts { choose: typeof choose; ask: typeof ask }
const TERMINAL: InitPrompts = { choose, ask };

/**
 * The one thing init asks a person: the game's name, with Enter for Auto.
 *
 * Until 11 Nov 2026 init walked a person through what they were making, the game it was
 * based on, a description and a genre menu, in the terminal. The owner's call that day: "we
 * need to make sure we collect the minimum info during cli, really just name of game maybe".
 * And on 13 Nov 2026: "leaving blank = model generates ... first option and default should be
 * auto". So Enter writes Auto, review names the game from what it reads in it, and the deploy's
 * page shows that name to accept or change. A name typed here is the creator's, which review
 * only tidies (casing and spacing) and offers back beside the original.
 */
async function askTitle(prompts: InitPrompts): Promise<string> {
  const { productMin, max } = LIMITS.text.gameTitle;
  let problem = "";
  for (;;) {
    const answer = (await prompts.ask(`${problem ? `${problem} ` : ""}Game name (Enter for Auto, review names it from your game):`)).trim();
    if (isAutoValue(answer)) return AUTO;
    if (answer.length >= productMin && answer.length <= max && !slurTextProblem(answer)) return answer;
    problem = slurTextProblem(answer) ?? `Use ${productMin} to ${max} characters, or press Enter for Auto.`;
  }
}

/**
 * The game's own title when the source is one of the curated games (`source-games.json`),
 * so "sm64" or "pokemon emerald" goes into the manifest as Super Mario 64 or Pokémon Emerald
 * and the game page says it properly. Anything else is kept as typed; on the site it is
 * filed as Other with those words as its search tag. Only here, before anything has gone
 * live: the database never rewrites a source a release already carries.
 */
function curatedName(basedOn: string): string {
  return sourceGameFor(basedOn)?.name ?? basedOn;
}

/**
 * --kind and --based-on, refused before anything is asked or written, and decided by
 * parseGameKind so that init cannot accept a pair the manifest check then refuses.
 *
 * The flag forgives case (`--kind Mod`) and init writes the lowercase slug, because the
 * manifest's enum does not forgive it and the file is what the next command reads. A
 * --based-on with no --kind is refused rather than read as a mod: no kind is a game, and a
 * game names no source, so guessing would be the CLI deciding what the creator made.
 */
function kindFlags(flags: Record<string, string | boolean>): { kind: GameKind | null; basedOn: string | null } {
  let kind: GameKind | null = null;
  if (typeof flags.kind === "string") {
    const slug = flags.kind.trim().toLowerCase();
    if (!isGameKind(slug)) throw new CliError("kind_invalid", `Choose --kind from ${GAME_KIND_SLUGS.join(", ")}. Without it, init makes a game.`);
    kind = slug;
  }
  if (typeof flags["based-on"] !== "string") return { kind, basedOn: null };
  const resolved = kind ?? DEFAULT_GAME_KIND;
  const parsed = parseGameKind(resolved, flags["based-on"]);
  if (parsed.ok) return { kind, basedOn: parsed.basedOn === null ? null : curatedName(parsed.basedOn) };
  if (!kindNeedsBasedOn(resolved)) {
    throw new CliError("based_on_invalid", kind
      ? `--based-on is only for a decomp or a mod, and this is a ${kind}. Remove --based-on, or use --kind decomp or --kind mod.`
      : "--based-on is only for a decomp or a mod. Add --kind decomp or --kind mod, or remove --based-on.");
  }
  if (!flags["based-on"].trim()) throw new CliError("based_on_required", `A ${resolved} needs the name of the game it is made from. Put it in --based-on.`);
  throw new CliError("based_on_invalid", `Use up to ${LIMITS.text.gameBasedOn.max} characters for --based-on.`);
}

/* What init says about the fields it left on Auto, in one line, after the file's own line. */
function autoNote(fields: readonly string[]): string | null {
  if (!fields.length) return null;
  return `Auto: ${new Intl.ListFormat("en").format(fields)}. ${AUTO_HELP}`;
}

/** --genre, refused before anything is written unless it is a slug or Auto. */
function genreFlag(flags: Record<string, string | boolean>): string | undefined {
  if (typeof flags.genre !== "string") return undefined;
  const genre = flags.genre.trim();
  if (isAutoValue(genre)) return AUTO;
  if (!GENRE_SLUGS.includes(genre as typeof GENRE_SLUGS[number])) throw new CliError("genre_invalid", `Choose --genre from ${AUTO}, ${GENRE_SLUGS.join(", ")}.`);
  return genre;
}

/** A --title or --description as given, or Auto when it was left out, blank or "auto". */
const stated = (value: string | boolean | undefined) => typeof value === "string" && !isAutoValue(value) ? value : AUTO;

export async function initProject(root: string, flags: Record<string, string | boolean>, options: { interactive?: boolean; prompts?: InitPrompts; output?: Output } = {}) {
  const pkg = await readBuildPackage(root);
  const genre = genreFlag(flags) ?? AUTO;
  let { kind, basedOn } = kindFlags(flags);
  const prompts = options.prompts ?? TERMINAL;
  // Read before anything is asked, so a person with a finished opengame.json is asked nothing.
  const existing = await existingManifest(root);
  if (existing) return fillManifest(root, existing.manifest, existing.text, { genre, flags, interactive: options.interactive, prompts });
  // The name only, and only when no --title said it (askTitle says why).
  const title = options.interactive && typeof flags.title !== "string" ? await askTitle(prompts) : stated(flags.title);
  // Absent is a game, and init writes it anyway, so every new opengame.json says what it is.
  kind ??= DEFAULT_GAME_KIND;
  // Nobody here to ask (an agent, a pipe, deploy making a missing manifest): the flag is the only way to say it.
  if (kindNeedsBasedOn(kind) && basedOn === null) {
    throw new CliError("based_on_required", `A ${kind} needs the name of the game it is made from. Add --based-on "<game name>", for example --kind ${kind} --based-on "Doom".`);
  }
  options.output?.emit({ type: "progress", stage: "init:project", message: "Looking at your project" });
  const sourceRoot = await realpath(root);
  let engine = await engineSetup(sourceRoot, pkg, typeof flags.engine === "string" ? flags.engine : undefined, typeof flags.output === "string" ? flags.output : undefined);
  const selected = await detectBuildOutput(root, pkg, typeof flags.output === "string" ? flags.output : undefined, engine);
  const { output } = selected;
  if (flags.engine === undefined && engine.id === "custom" && selected.engine && ENGINE_PRESETS[selected.engine]) {
    engine = await engineSetup(sourceRoot, pkg, selected.engine, output);
    engine.evidence = "export signature";
  } else if (engine.id !== "custom") {
    const evidence = engine.evidence;
    engine = await engineSetup(sourceRoot, pkg, engine.id, output);
    engine.evidence = evidence;
  }
  engine.output = output;
  // The lockfile says which package manager the project uses; npm in a pnpm
  // project installs a second tree and can build something else. The same reading picks
  // the install a deploy runs first (deploy.ts, installDependencies).
  const manager = (await lockfileInstall(root, pkg))?.manager ?? "npm";
  const runner = manager === "yarn" ? "yarn build" : `${manager} run build`;
  // Blazor package scripts often prepare CSS in wwwroot. The selected export still
  // needs publishing after that step; running only the script shipped stale bytes or
  // left a fresh project's publish/wwwroot missing. Do not infer what a script does.
  const command = pkg.scripts?.build
    ? engine.sourceRoot && engine.command ? `${runner} && ${engine.command}` : runner
    : engine.command;
  /* A plain static export has no recipe to test, so only a named engine is told its
     export steps are untested. A two-file HTML game heard it on 30 Oct 2026. */
  const untested = engine.id === "custom" || namedEngine(engine.id) ? "" : " OpenGame has not tested this engine's recipe yet.";
  if (engine.instructions === GENERIC_EXPORT) engine.instructions = command
    ? `init set the build to ${command} and the export folder to ${output}/. If your build writes somewhere else, change build.output in opengame.json.${untested}`
    : `init set the export folder to ${output === "." ? "this folder" : `${output}/`}, which needs index.html at its root. If the export is somewhere else, change build.output in opengame.json.${untested}`;
  /* Every field init is not told is Auto (auto.ts): review writes it from the game, and the
     deploy's page shows what it wrote to accept or change. */
  const manifest = {
    $schema: "https://opengame.io/schema/opengame.json", title, tagline: AUTO, description: stated(flags.description), genre, kind, ...(basedOn ? { basedOn } : {}),
    ...(command || output !== "." || typeof flags.output === "string" ? { build: { ...(command ? { command } : {}), output } } : {}),
    controls: AUTO,
    ...(engine.requires ? { requires: engine.requires } : {}),
  };
  const credentialIssue = manifestCredentialIssue(manifest);
  if (credentialIssue) throw new CliError("manifest_invalid", credentialIssue, 2);
  const { value: resolved, auto } = await resolveAuto(manifest, root);
  const parsed = manifestSchema.safeParse(resolved);
  const issues = parsed.success ? [] : parsed.error.issues;
  // Inferred metadata can be an unfinished draft. Explicit values should be
  // corrected in the command, before a file exists and init can no longer run.
  // kind and basedOn always came from a flag or an answer, never from a guess, so a problem
  // with either is the command's to correct (the flag is --based-on, not basedOn).
  const rejected = issues.filter(issue => !issue.path.length || typeof flags[String(issue.path[0])] === "string" || ["kind", "basedOn"].includes(String(issue.path[0])));
  if (rejected.length) throw new CliError("manifest_invalid", rejected.map(issue => `${issue.path.join(".") || "opengame.json"}: ${issue.message}`).join("\n"), 2);
  const needs = [...new Set(issues.map(issue => issue.path.join(".")))];
  await refuseIgnoreSymlink(root);
  try { await writeFile(join(root, "opengame.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw await manifestExists(root);
    throw error;
  }
  await ensureProjectIgnored(root);
  const next = `opengame check ${folderArgument(root)}${command ? " --build" : ""}`;
  /* The command goes last, on a line of its own after "Next:", as an error's does. Ending a
     sentence with it printed "run opengame check .." with the folder's dot and the full stop
     run together, and a person copying the line took both. */
  return { manifest, needs, engine, next, message: [needs.length
    ? `Created a draft opengame.json${made(kind, basedOn)}. Add ${new Intl.ListFormat("en").format(needs)} to it.\n${issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n")}`
    : `Created opengame.json${made(kind, basedOn)}.`,
  ...[autoNote(auto)].filter((line): line is string => line !== null),
  `${engine.name}: ${engine.instructions}`,
  `Guide: ${engine.docs}`,
  `Next: ${next}`].join("\n") };

}

async function refuseIgnoreSymlink(root: string) {
  try {
    if ((await lstat(join(root, ".gitignore"))).isSymbolicLink()) throw new CliError("ignore_symlink", ".gitignore is a symlink. Use a regular file before running opengame init.");
  } catch (error) {
    if (error instanceof CliError || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Which values in opengame.json init chose without being told, kept in .opengame/ beside the
 * project's other machine-local state.
 *
 * The Drop and GitHub uploads name a placeholder genre or controls in the deploy request's
 * `provisional`, so review never takes it for the creator's word and the details form after
 * review offers what review detected instead (one-flow.ts on the site). init's fallback genre
 * is the same kind of placeholder, and so are the keyboard and mouse it writes when it finds
 * no input handlers. Without this record a deploy sent them as stated, and the confirm form
 * showed the fallback as the creator's own choice ahead of review's guess. A deploy names a
 * field provisional only while opengame.json still holds exactly the value init chose, so
 * the moment somebody edits it, it is theirs.
 *
 * Since 13 Nov 2026 init writes "auto" instead of a guess (auto.ts), which says the same thing
 * in the file itself, so nothing writes this record now. It is still read, for a folder an
 * older CLI set up, whose guesses would otherwise deploy as the creator's choice.
 */
const GUESSES = "init-guesses.json";
type Guesses = { genre?: string; controls?: string[]; title?: string };
async function readGuesses(root: string): Promise<Guesses> {
  let handle;
  try {
    handle = await open(join(root, ".opengame", GUESSES), constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 4096) return {};
    const value = JSON.parse(await handle.readFile("utf8")) as Guesses;
    return {
      ...(typeof value.genre === "string" ? { genre: value.genre } : {}),
      ...(typeof value.title === "string" ? { title: value.title } : {}),
      ...(Array.isArray(value.controls) && value.controls.every(item => typeof item === "string") ? { controls: value.controls } : {}),
    };
  } catch { return {}; }
  finally { await handle?.close(); }
}
/** The fields a deploy should name in `provisional`: those opengame.json still holds as init guessed them. */
export async function provisionalFields(root: string, manifest: { genre?: unknown; controls?: unknown; description?: unknown; title?: unknown }): Promise<DeployProvisional[]> {
  const guesses = await readGuesses(root);
  /* Every field opengame.json leaves on Auto, which is what init writes since 13 Nov 2026: named
     beside a manifest loadManifest read, or still "auto" in one read as a plain file. */
  const raw = manifest as Record<string, unknown>;
  const fields: DeployProvisional[] = provisionalAuto([...new Set([...autoFields(manifest),
    ...AUTO_FIELDS.filter(field => field !== "tagline" && field in raw && isAutoValue(raw[field]))])]);
  /* The placeholder is its own record: nobody writes that exact sentence about their game,
     so a file still holding it has no description yet, however it got there. */
  const add = (field: DeployProvisional) => { if (!fields.includes(field)) fields.push(field); };
  if (manifest.description === PLACEHOLDER_DESCRIPTION) add("description");
  // An older CLI's record of what it guessed (init-guesses.json), for a folder it set up.
  if (guesses.genre !== undefined && manifest.genre === guesses.genre) add("genre");
  if (guesses.controls && JSON.stringify(manifest.controls) === JSON.stringify(guesses.controls)) add("controls");
  if (guesses.title !== undefined && manifest.title === guesses.title) add("title");
  return fields;
}

async function manifestExists(root: string) {
  return new CliError("manifest_exists", await linkedGame(root)
    ? "opengame.json already exists, so init left it alone. Edit it, or run opengame pull to copy the title and details you changed on the website."
    : "opengame.json already exists, so init left it alone. Edit it to change the game's details.", undefined, { next: `opengame check ${folderArgument(root)}` });
}

/** opengame.json's text, read through a handle that cannot follow a link swapped in after
 * the lstat, or null when it is not a regular file within the manifest's size limit. */
async function manifestText(path: string): Promise<string | null> {
  let handle;
  try {
    if (!(await lstat(path)).isFile()) return null;
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > LIMITS.platform.manifest.bytesMax) return null;
    return await handle.readFile("utf8");
  } catch { return null; }
  finally { await handle?.close(); }
}

/** The existing opengame.json as a plain object with the text it was read from, or null when
 * there is none. One that is a symlink, too large, not JSON or not an object is not init's to
 * repair: it is refused as existing, as every opengame.json was before init could fill one in. */
async function existingManifest(root: string): Promise<{ manifest: Record<string, unknown>; text: string } | null> {
  const path = join(root, "opengame.json");
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const text = await manifestText(path);
  try {
    const value: unknown = text === null ? null : JSON.parse(withoutBom(text));
    if (value && typeof value === "object" && !Array.isArray(value)) return { manifest: value as Record<string, unknown>, text: text! };
  } catch { /* refused below */ }
  throw await manifestExists(root);
}

const blank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0);

/**
 * Fill the fields an existing opengame.json leaves blank, and touch nothing it sets.
 *
 * Before 10 Nov 2026 init refused any folder that had an opengame.json, so the draft it had
 * written itself, with `"genre": ""`, could only be finished by hand: running init again,
 * which is what an agent told "init guesses the genre" tries next, said the file existed and
 * stopped. Now it fills title, description, genre and controls where they are missing or
 * empty, with the flag given or Auto (which a blank field already means, so writing it says so
 * in the file), and says which. A value already
 * there is the creator's, even when a flag names another, because init cannot tell a
 * deliberate edit from a stale one; a flag it did not use is named so nobody thinks it took.
 * kind is never filled: absent means "whatever this already is" to deploy (manifest.ts), and
 * writing "game" into a world's old manifest would change what it is. A file with nothing to
 * fill is refused as it always was.
 */
async function fillManifest(root: string, existing: Record<string, unknown>, original: string, context: {
  genre: string; flags: Record<string, string | boolean>; interactive?: boolean; prompts: InitPrompts;
}) {
  const { flags } = context;
  const filled: Record<string, unknown> = {};
  // The name is the one question, as for a new file (askTitle), and only for a blank one.
  if (blank(existing.title)) filled.title = context.interactive && typeof flags.title !== "string" ? await askTitle(context.prompts) : stated(flags.title);
  if (blank(existing.description)) filled.description = stated(flags.description);
  if (blank(existing.genre)) filled.genre = context.genre;
  if (blank(existing.controls)) filled.controls = AUTO;
  if (!Object.keys(filled).length) throw await manifestExists(root);
  const manifest = { ...existing, ...filled };
  const credentialIssue = manifestCredentialIssue(manifest);
  if (credentialIssue) throw new CliError("manifest_invalid", credentialIssue, 2);
  const { value: resolved } = await resolveAuto(manifest, root);
  const parsed = manifestSchema.safeParse(resolved);
  const issues = parsed.success ? [] : parsed.error.issues;
  // A flag's value that the schema refuses is the command's to correct, before anything is written.
  const rejected = issues.filter(issue => String(issue.path[0]) in filled && typeof flags[String(issue.path[0])] === "string");
  if (rejected.length) throw new CliError("manifest_invalid", rejected.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n"), 2);
  await refuseIgnoreSymlink(root);
  /* A new file beside the old one, renamed over it, so a write that fails part way leaves
     the creator's file as it was, and a rename replaces a link rather than writing through it. */
  const path = join(root, "opengame.json"), temporary = `${path}.${randomUUID()}`;
  try {
    const handle = await open(temporary, "wx", 0o644);
    try { await handle.writeFile(JSON.stringify(manifest, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
    /* The fill was worked out from the file as init read it, and a person at the prompts has
       time to save an edit to it, which the rename would drop without a word (Greptile on
       opengamehq/opengame#6). So the file must still be those exact bytes, or nothing is
       written; pull's manifest_changed makes the same check. */
    if (await manifestText(path) !== original) {
      throw new CliError("manifest_changed", "opengame.json changed while init was filling it in, so init kept your edits and wrote nothing. Run opengame init again to fill what is still blank.", undefined, { next: `opengame init ${folderArgument(root)}` });
    }
    await replaceFile(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
  await ensureProjectIgnored(root);
  const names = Object.keys(filled);
  /* Every flag init could have used and did not: a value the file already sets, and the
     flags that only shape a new file (what it is, and where its build goes). */
  const kept = ["title", "description", "genre", "kind", "based-on", "output", "engine"]
    .filter(field => typeof flags[field] === "string" && !(field in filled)).map(field => `--${field}`);
  const needs = [...new Set(issues.map(issue => issue.path.join(".")))];
  const next = `opengame check ${folderArgument(root)}`;
  return { manifest, needs, filled: names, next, message: [
    `Filled ${new Intl.ListFormat("en").format(names)} in the existing opengame.json and left everything else as it was.`,
    ...(kept.length ? [`init did not use ${new Intl.ListFormat("en").format(kept)}, because it only fills what the file leaves blank. Edit opengame.json to change anything it already sets.`] : []),
    ...(needs.length ? [`Still to correct in opengame.json:\n${issues.map(issue => `${issue.path.join(".") || "opengame.json"}: ${issue.message}`).join("\n")}`] : []),
    ...[autoNote(names.filter(field => isAutoValue(filled[field])))].filter((line): line is string => line !== null),
    `Next: ${next}`].join("\n") };
}

/** "a mod of Doom", "a world", or null for a game: the shared phrase for anything that is
 * not a game, which is the only time init and deploy say what something is. A game is the
 * default and goes unremarked, as it goes unbadged (kindBadge in packages/shared says why). */
export function kindPhrase(kind: string | null | undefined, basedOn: string | null | undefined): string | null {
  return gameKindOrDefault(kind) === DEFAULT_GAME_KIND ? null : sharedKindPhrase(kind, basedOn);
}
const made = (kind: GameKind, basedOn: string | null) => { const phrase = kindPhrase(kind, basedOn); return phrase ? ` for ${phrase}` : ""; };

/** Infer only an absent manifest. An ambiguous build output needs a creator's choice. */
export async function ensureDeployManifest(root: string, flags: Record<string, string | boolean>, output?: Output) {
  try { await lstat(join(root, "opengame.json")); return null; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return initProject(root, flags, { output });
}

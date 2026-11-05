import { constants } from "node:fs";
import { writeFile, readFile, open, lstat, access, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { sourceGameFor } from "@opengame/shared/source-games";
import { DEFAULT_GAME_KIND, GAME_KINDS, GAME_KIND_SLUGS, GENRES, GENRE_SLUGS, LIMITS, gameKind, gameKindOrDefault, inferGenre, isGameKind, kindNeedsBasedOn,
  kindPhrase as sharedKindPhrase,
  parseGameKind, slurTextProblem, type GameKind } from "@opengame/shared";
import { manifestSchema, manifestCredentialIssue } from "@opengame/protocol";
import { CliError } from "./output";
import { detectBuildOutput, readBuildPackage } from "./build-output";
import { engineSetup, ENGINE_PRESETS, GENERIC_EXPORT, namedEngine, projectText } from "./engines";
import { ask, choose } from "./prompt";
import { folderArgument } from "./files";

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

/** The questions init asks, passed in so a test can answer them without a terminal, the
 * way submit's jam form is walked (`Prompts` in submit.ts). */
export interface InitPrompts { choose: typeof choose; ask: typeof ask }
const TERMINAL: InitPrompts = { choose, ask };

/**
 * The two fields init cannot read from the project, asked of a person at a terminal. Before
 * this, init wrote `"description": ""` and `"genre": ""` and then printed the ten genre slugs
 * as a sentence, so the first file a newcomer got was one the next command refused. Each
 * question can be skipped, which leaves the draft as it was, and each has a flag.
 *
 * Asked after the kind, so the question names what is being described: "Describe the world"
 * to somebody who has just said they are making a world, not "the game".
 */
async function askMetadata(description: string, genre: string | null, kind: GameKind, prompts: InitPrompts) {
  const { productMin, max } = LIMITS.text.gameDescription;
  const noun = gameKind(kind).label.toLowerCase();
  let answer = description;
  while (answer.length < productMin || answer.length > max) {
    answer = await prompts.ask(answer
      ? `That is ${answer.length} characters. Use ${productMin} to ${max}, or press Enter to skip:`
      : `Describe the ${noun} in a sentence or two (${productMin} to ${max} characters), or press Enter to skip:`);
    if (!answer) { answer = description; break; }
  }
  const options = [...GENRES.map(row => ({ value: row.slug, label: row.label, hint: row.includes.slice(0, 3).join(", ") })), { value: "", label: "Decide later" }];
  const chosen = genre ?? await prompts.choose("Which genre fits best?", options, options.length - 1);
  return { description: answer, genre: chosen || null };
}

/* The product call, 26 Oct 2026: the CLI shows all four types, with game selected by
   default, and the arrows choose another. So all four are on screen, with
   the line that says what each one is, and Enter on its own makes a game. There is no
   "decide later" as there is for genre: a kind is never unknown, it is a game until
   somebody says otherwise, and the cursor already says so.

   First of the questions, before the description and the genre. It came after them until a
   review the same day, which had somebody making a mod describe "the game" and pick a genre
   before saying it was a mod, and then name the game it was based on last: the one answer
   that changes how the others read was the one asked after them. */
async function askKind(prompts: InitPrompts): Promise<GameKind> {
  const options = GAME_KINDS.map(row => ({ value: row.slug, label: row.label, hint: row.help }));
  const chosen = await prompts.choose("What are you making?", options, Math.max(0, options.findIndex(row => row.value === DEFAULT_GAME_KIND)));
  return isGameKind(chosen) ? chosen : DEFAULT_GAME_KIND;
}

/* A decomp or a mod cannot be written without the game it is made from, so this asks
   until there is one rather than offering a skip that would leave a file the next command
   refuses. Ctrl+C still leaves, before anything is written. */
async function askBasedOn(kind: GameKind, prompts: InitPrompts): Promise<string> {
  const info = gameKind(kind);
  const max = LIMITS.text.gameBasedOn.max;
  let problem = "";
  for (;;) {
    const answer = await prompts.ask(`${problem ? `${problem} ` : ""}${info.basedOnPrompt}`);
    const parsed = parseGameKind(kind, answer);
    const refused = parsed.ok ? slurTextProblem(parsed.basedOn ?? "") : null;
    if (parsed.ok && parsed.basedOn && !refused) return curatedName(parsed.basedOn);
    problem = refused ?? (answer.trim() ? `That is too long. Use up to ${max} characters.` : `A ${info.label.toLowerCase()} needs the name of the game it is made from.`);
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

export async function initProject(root: string, flags: Record<string, string | boolean>, options: { interactive?: boolean; prompts?: InitPrompts } = {}) {
  const pkg = await readBuildPackage(root);
  const html = await projectText(await realpath(root), "index.html") ?? "";
  const title = typeof flags.title === "string" ? flags.title : html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? pkg.name ?? basename(root);
  let description = typeof flags.description === "string" ? flags.description : pkg.description ?? "";
  let genre = typeof flags.genre === "string" ? flags.genre : inferGenre(`${title} ${description}`);
  let { kind, basedOn } = kindFlags(flags);
  const prompts = options.prompts ?? TERMINAL;
  // Asked before anything is written, so an existing opengame.json is refused first.
  if (options.interactive) {
    let fresh = true;
    try { await lstat(join(root, "opengame.json")); fresh = false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (fresh) {
      kind ??= await askKind(prompts);
      if (kindNeedsBasedOn(kind) && basedOn === null) basedOn = await askBasedOn(kind, prompts);
      if (typeof flags.description !== "string" || genre === null) ({ description, genre } = await askMetadata(description, genre, kind, prompts));
    }
  }
  if (genre && !GENRE_SLUGS.includes(genre as typeof GENRE_SLUGS[number])) throw new CliError("genre_invalid", `Choose --genre from ${GENRE_SLUGS.join(", ")}.`);
  // Absent is a game, and init writes it anyway, so every new opengame.json says what it is.
  kind ??= DEFAULT_GAME_KIND;
  // Nobody here to ask (an agent, a pipe, deploy making a missing manifest): the flag is the only way to say it.
  if (kindNeedsBasedOn(kind) && basedOn === null) {
    throw new CliError("based_on_required", `A ${kind} needs the name of the game it is made from. Add --based-on "<game name>", for example --kind ${kind} --based-on "Doom".`);
  }
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
  // project installs a second tree and can build something else.
  const exists = async (name: string) => access(join(root, name)).then(() => true, () => false);
  const runner = await exists("pnpm-lock.yaml") ? "pnpm run build" : await exists("yarn.lock") ? "yarn build"
    : await exists("bun.lockb") || await exists("bun.lock") ? "bun run build" : "npm run build";
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
  const manifest = {
    $schema: "https://opengame.io/schema/opengame.json", title, description, genre: genre ?? "", kind, ...(basedOn ? { basedOn } : {}),
    ...(command || output !== "." || typeof flags.output === "string" ? { build: { ...(command ? { command } : {}), output } } : {}),
    controls: ["keyboard", "mouse"],
    ...(engine.requires ? { requires: engine.requires } : {}),
  };
  const credentialIssue = manifestCredentialIssue(manifest);
  if (credentialIssue) throw new CliError("manifest_invalid", credentialIssue, 2);
  const parsed = manifestSchema.safeParse(manifest);
  const issues = parsed.success ? [] : parsed.error.issues;
  // Inferred metadata can be an unfinished draft. Explicit values should be
  // corrected in the command, before a file exists and init can no longer run.
  // kind and basedOn always came from a flag or an answer, never from a guess, so a problem
  // with either is the command's to correct (the flag is --based-on, not basedOn).
  const rejected = issues.filter(issue => !issue.path.length || typeof flags[String(issue.path[0])] === "string" || ["kind", "basedOn"].includes(String(issue.path[0])));
  if (rejected.length) throw new CliError("manifest_invalid", rejected.map(issue => `${issue.path.join(".") || "opengame.json"}: ${issue.message}`).join("\n"), 2);
  const needs = [...new Set(issues.map(issue => issue.path.join(".")))];
  const ignorePath = join(root, ".gitignore");
  try {
    if ((await lstat(ignorePath)).isSymbolicLink()) throw new CliError("ignore_symlink", ".gitignore is a symlink. Use a regular file before running opengame init.");
  } catch (error) {
    if (error instanceof CliError || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try { await writeFile(join(root, "opengame.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new CliError("manifest_exists", await linkedGame(root)
      ? "opengame.json already exists, so init left it alone. Edit it, or run opengame pull to copy the title and details you changed on the website."
      : "opengame.json already exists, so init left it alone. Edit it to change the game's details.", undefined, { next: `opengame check ${folderArgument(root)}` });
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
  `${engine.name}: ${engine.instructions}`,
  `Guide: ${engine.docs}`,
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
export async function ensureDeployManifest(root: string, flags: Record<string, string | boolean>) {
  try { await lstat(join(root, "opengame.json")); return null; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return initProject(root, flags);
}

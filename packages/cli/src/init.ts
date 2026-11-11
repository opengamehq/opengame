import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, open, lstat, access, realpath, readdir, mkdir, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { sourceGameFor } from "@opengame/shared/source-games";
import { DEFAULT_GAME_KIND, GAME_KINDS, GAME_KIND_SLUGS, GENRES, GENRE_SLUGS, LIMITS, gameKind, gameKindOrDefault, inferGenre, isGameKind, kindNeedsBasedOn,
  kindPhrase as sharedKindPhrase,
  parseGameKind, slurTextProblem, type GameKind } from "@opengame/shared";
import { isBundlePath, manifestSchema, manifestCredentialIssue, type DeployProvisional } from "@opengame/protocol";
import { CliError } from "./output";
import { detectBuildOutput, readBuildPackage } from "./build-output";
import { engineSetup, ENGINE_PRESETS, GENERIC_EXPORT, namedEngine, projectText } from "./engines";
import { ask, choose } from "./prompt";
import { folderArgument, replaceFile, withoutBom } from "./files";
import { safeReadFiles } from "./safe-fs";

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

/**
 * The genre init writes when the game's own words do not point at one and nobody is at a
 * terminal to ask: an agent, a pipe, or deploy making a missing manifest.
 *
 * Until 10 Nov 2026 init wrote `"genre": ""` here, though its help said it guessed, and the
 * next command, `opengame check`, refused the file. Rerunning init could not help either,
 * because init never touched an existing opengame.json. A coding agent following the team's
 * CLI test steps met both, with a tap counter called "CLI test (delete me)". So a project
 * with no genre in its words gets this one and init says so, by name, with the line to
 * change. Puzzle & casual, because it is the bucket for arcade, idle and hypercasual games,
 * which is what a small project with nothing to say about itself most often is. A deploy
 * names it provisional (`provisionalFields` below), as the Drop and GitHub uploads name
 * theirs, so the details form after review offers what review detected rather than this.
 */
export const FALLBACK_GENRE = "puzzle-casual";

/** What the project already says about itself, for `inferGenre`: the title and description
 * init is writing, and the description and keywords in package.json and index.html. */
function genreEvidence(title: string, description: string, pkg: { description?: unknown; keywords?: unknown }, html: string) {
  const meta = (name: string) => html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"))?.[1] ?? "";
  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.filter((word): word is string => typeof word === "string") : [];
  return [title, description, typeof pkg.description === "string" ? pkg.description : "", ...keywords, meta("description"), meta("keywords")].join(" ");
}

type Control = "keyboard" | "mouse" | "gamepad";
/* What each control looks like in a web game's own source: DOM listeners, inline handlers,
   and the input calls of the libraries init recognises (Phaser's input.keyboard and
   activePointer, Kaplay's onKeyPress and onClick, LittleJS's keyIsDown and mouseIsDown).
   Taps are "mouse": the manifest's controls are keyboard, mouse and gamepad, and a pointer
   or touch handler is what a mouse click reaches, so a game that only listens for taps is
   played with a mouse on a desktop. */
const CONTROL_PATTERNS: [Control, RegExp][] = [
  ["keyboard", /["'`]key(?:down|up|press)["'`]|\bonkey(?:down|up|press)\b|KeyboardEvent|\.keyboard\b|createCursorKeys|\b(?:onKey(?:Press|Down|Release)|isKey(?:Down|Pressed|Released)|key(?:IsDown|WasPressed|WasReleased))\s*\(/i],
  ["mouse", /\b(?:on)?(?:mouse|pointer)(?:down|up|move|enter|leave|over|out)\b|\b(?:on)?touch(?:start|end|move|cancel)\b|["'`](?:click|dblclick|wheel|contextmenu)["'`]|\bonclick\b|\b(?:Pointer|Mouse|Touch)Event\b|activePointer|\b(?:onClick|onMouse\w*|isMouse\w*|mouse(?:IsDown|WasPressed|WasReleased|Pos))\s*\(/i],
  ["gamepad", /getGamepads|["'`]gamepad(?:dis)?connected["'`]|\.gamepad\b|\bgamepad(?:IsDown|WasPressed|WasReleased|Stick)\s*\(/],
];
/** Engines whose source is the JavaScript or TypeScript the game was written in. Anything
 * else (Unity, Godot, an Emscripten build) ships a runtime that listens for every input
 * whether the game uses it or not, so its words are not evidence. */
const WEB_SOURCE_ENGINES = new Set(["custom", "javascript", "typescript", "threejs", "phaser", "pixijs", "babylonjs", "playcanvas", "excalibur", "kaplay", "melonjs", "littlejs", "react"]);
const SOURCE_FILE = /\.(?:html?|[cm]?[jt]sx?)$/i;
const SOURCE_DIRS = new Set(["src", "js", "scripts", "game"]);
/* Somebody else's code inside the project: a minified library or a vendored folder listens
   for whatever its library supports, and a gamepad shim would put "controller" on a game
   nobody can play with one. */
const VENDORED_DIR = /^(?:vendor|vendors|third[_-]?party|libs?|external|deps)$/i;
const VENDORED_FILE = /[.-]min\.[cm]?js$/i;
/* An engine's runtime sits beside its .wasm or data pack, and it listens for everything. */
const ENGINE_ARTIFACT = /\.(?:wasm|pck|data|unityweb)$/i;

/** Up to a few hundred of the project's own source files, read in one helper job: the root,
 * and src/, js/ and the like below it. Never node_modules, a dot folder, a symlink, or a
 * folder holding an engine's runtime. Nothing here is required, so any failure reads as
 * no evidence. */
async function sourceTexts(root: string, html: string): Promise<string[]> {
  const files: { path: string; byteSize: number }[] = [];
  let total = 0;
  const FILE_MAX = 512 * 1024, TOTAL_MAX = 4 * 1024 * 1024, COUNT_MAX = 300;
  async function walk(folder: string, depth: number) {
    let entries;
    try { entries = await readdir(join(root, folder), { withFileTypes: true }); } catch { return; }
    if (entries.some(entry => entry.isFile() && ENGINE_ARTIFACT.test(entry.name))) return;
    for (const entry of entries) {
      if (files.length >= COUNT_MAX || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.isDirectory() && depth < 4 && !VENDORED_DIR.test(entry.name) && (depth > 0 || SOURCE_DIRS.has(entry.name))) await walk(path, depth + 1);
      // The helper refuses a whole batch for one path it cannot carry, so such a file is left out here.
      else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !VENDORED_FILE.test(entry.name) && path !== "index.html" && isBundlePath(path)) {
        const size = (await lstat(join(root, path)).catch(() => null))?.size ?? FILE_MAX + 1;
        if (size <= FILE_MAX && total + size <= TOTAL_MAX) { files.push({ path, byteSize: size }); total += size; }
      }
    }
  }
  await walk("", 0);
  if (!files.length) return [html];
  try { return [html, ...[...(await safeReadFiles(root, files)).values()].map(bytes => withoutBom(bytes.toString("utf8")))]; }
  catch { return [html]; }
}

/**
 * The controls a web game's source listens for, or null when it shows none, in which case
 * init writes keyboard and mouse as it always did. Before 10 Nov 2026 init wrote keyboard and
 * mouse for every game, so a canvas that only counts taps told players it needed a keyboard.
 */
export async function detectControls(root: string, html: string, engineId: string): Promise<Control[] | null> {
  if (!WEB_SOURCE_ENGINES.has(engineId)) return null;
  const text = (await sourceTexts(root, html)).join("\n");
  const found = CONTROL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([control]) => control);
  return found.length ? found : null;
}

const CONTROL_WORDS: Record<Control, string> = { keyboard: "keyboard", mouse: "mouse or touch", gamepad: "controller" };
function controlsNote(detected: Control[] | null): string {
  return detected
    ? `Controls: set to ${detected.join(", ")}, from the ${new Intl.ListFormat("en").format(detected.map(control => CONTROL_WORDS[control]))} input in your source. If the game takes other input, change controls in opengame.json.`
    : "Controls: set to keyboard, mouse, because init found no input handlers to read. Change controls in opengame.json if the game uses something else.";
}
function genreNote(genre: string): string {
  return `Genre: init could not tell the genre from the title and description, so it set ${genre}. If that is wrong, change genre in opengame.json to one of ${GENRE_SLUGS.join(", ")}.`;
}

export async function initProject(root: string, flags: Record<string, string | boolean>, options: { interactive?: boolean; prompts?: InitPrompts } = {}) {
  const pkg = await readBuildPackage(root);
  const html = await projectText(await realpath(root), "index.html") ?? "";
  const title = typeof flags.title === "string" ? flags.title : html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? pkg.name ?? basename(root);
  let description = typeof flags.description === "string" ? flags.description : pkg.description ?? "";
  let genre = typeof flags.genre === "string" ? flags.genre : inferGenre(genreEvidence(title, description, pkg, html));
  let { kind, basedOn } = kindFlags(flags);
  const prompts = options.prompts ?? TERMINAL;
  if (genre && !GENRE_SLUGS.includes(genre as typeof GENRE_SLUGS[number])) throw new CliError("genre_invalid", `Choose --genre from ${GENRE_SLUGS.join(", ")}.`);
  // Read before anything is asked, so a person with a finished opengame.json is asked nothing.
  const existing = await existingManifest(root);
  if (existing) return fillManifest(root, existing, { title, description, genre, flags, html, pkg, interactive: options.interactive, prompts });
  let guessedGenre = false;
  if (options.interactive) {
    kind ??= await askKind(prompts);
    if (kindNeedsBasedOn(kind) && basedOn === null) basedOn = await askBasedOn(kind, prompts);
    if (typeof flags.description !== "string" || genre === null) ({ description, genre } = await askMetadata(description, genre, kind, prompts));
  } else if (genre === null) { genre = FALLBACK_GENRE; guessedGenre = true; }
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
  const detected = await detectControls(sourceRoot, html, engine.id);
  const manifest = {
    $schema: "https://opengame.io/schema/opengame.json", title, description, genre: genre ?? "", kind, ...(basedOn ? { basedOn } : {}),
    ...(command || output !== "." || typeof flags.output === "string" ? { build: { ...(command ? { command } : {}), output } } : {}),
    controls: detected ?? ["keyboard", "mouse"],
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
  await refuseIgnoreSymlink(root);
  try { await writeFile(join(root, "opengame.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw await manifestExists(root);
    throw error;
  }
  await ensureProjectIgnored(root);
  await recordGuesses(root, { ...(guessedGenre ? { genre: genre! } : {}), ...(detected ? {} : { controls: manifest.controls }) }, ["genre", "controls"]);
  const next = `opengame check ${folderArgument(root)}${command ? " --build" : ""}`;
  /* The command goes last, on a line of its own after "Next:", as an error's does. Ending a
     sentence with it printed "run opengame check .." with the folder's dot and the full stop
     run together, and a person copying the line took both. */
  return { manifest, needs, engine, next, message: [needs.length
    ? `Created a draft opengame.json${made(kind, basedOn)}. Add ${new Intl.ListFormat("en").format(needs)} to it.\n${issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n")}`
    : `Created opengame.json${made(kind, basedOn)}.`,
  ...(guessedGenre ? [genreNote(genre!)] : []),
  controlsNote(detected),
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
 */
const GUESSES = "init-guesses.json";
type Guesses = { genre?: string; controls?: string[] };
async function readGuesses(root: string): Promise<Guesses> {
  let handle;
  try {
    handle = await open(join(root, ".opengame", GUESSES), constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 4096) return {};
    const value = JSON.parse(await handle.readFile("utf8")) as Guesses;
    return {
      ...(typeof value.genre === "string" ? { genre: value.genre } : {}),
      ...(Array.isArray(value.controls) && value.controls.every(item => typeof item === "string") ? { controls: value.controls } : {}),
    };
  } catch { return {}; }
  finally { await handle?.close(); }
}
/** `settled` are the fields this run wrote; a guess about one of them is replaced or dropped. */
async function recordGuesses(root: string, guessed: Guesses, settled: string[]) {
  const before = await readGuesses(root);
  if (!settled.some(field => field in before) && !Object.keys(guessed).length) return;
  const record: Guesses = { ...before };
  for (const field of settled) delete record[field as keyof Guesses];
  Object.assign(record, guessed);
  const folder = join(root, ".opengame");
  try {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const stat = await lstat(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return;
    const path = join(folder, GUESSES), temporary = `${path}.${randomUUID()}`;
    try {
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify(record) + "\n"); } finally { await handle.close(); }
      await replaceFile(temporary, path);
    } finally { await unlink(temporary).catch(() => {}); }
  } catch { /* A missing record only means the next deploy states what the file says. */ }
}

/** The fields a deploy should name in `provisional`: those opengame.json still holds as init guessed them. */
export async function provisionalFields(root: string, manifest: { genre?: unknown; controls?: unknown }): Promise<DeployProvisional[]> {
  const guesses = await readGuesses(root);
  const fields: DeployProvisional[] = [];
  if (guesses.genre !== undefined && manifest.genre === guesses.genre) fields.push("genre");
  if (guesses.controls && JSON.stringify(manifest.controls) === JSON.stringify(guesses.controls)) fields.push("controls");
  return fields;
}

async function manifestExists(root: string) {
  return new CliError("manifest_exists", await linkedGame(root)
    ? "opengame.json already exists, so init left it alone. Edit it, or run opengame pull to copy the title and details you changed on the website."
    : "opengame.json already exists, so init left it alone. Edit it to change the game's details.", undefined, { next: `opengame check ${folderArgument(root)}` });
}

/** The existing opengame.json as a plain object, or null when there is none. One that is a
 * symlink, too large, not JSON or not an object is not init's to repair: it is refused as
 * existing, as every opengame.json was before init could fill one in. */
async function existingManifest(root: string): Promise<Record<string, unknown> | null> {
  const path = join(root, "opengame.json");
  let stat;
  try { stat = await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  let handle;
  try {
    if (!stat.isFile()) throw new Error();
    // Read through a handle that cannot follow a link swapped in after the lstat.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > LIMITS.platform.manifest.bytesMax) throw new Error();
    const value: unknown = JSON.parse(withoutBom(await handle.readFile("utf8")));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* refused below */ }
  finally { await handle?.close(); }
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
 * empty, from the same flags and guesses a new file gets, and says which. A value already
 * there is the creator's, even when a flag names another, because init cannot tell a
 * deliberate edit from a stale one; a flag it did not use is named so nobody thinks it took.
 * kind is never filled: absent means "whatever this already is" to deploy (manifest.ts), and
 * writing "game" into a world's old manifest would change what it is. A file with nothing to
 * fill is refused as it always was.
 */
async function fillManifest(root: string, existing: Record<string, unknown>, context: {
  title: string; description: string; genre: string | null; flags: Record<string, string | boolean>; html: string;
  pkg: { description?: unknown; keywords?: unknown }; interactive?: boolean; prompts: InitPrompts;
}) {
  const { flags } = context;
  const filled: Record<string, unknown> = {};
  let { description, genre } = context;
  if (blank(existing.title)) filled.title = context.title;
  if (blank(existing.description)) description = context.description;
  else description = String(existing.description);
  // The guess reads the file's own words, which is what the game says about itself now.
  if (blank(existing.genre) && typeof flags.genre !== "string") {
    genre = inferGenre(genreEvidence(String(filled.title ?? existing.title), description, context.pkg, context.html));
  }
  if (context.interactive && (blank(existing.description) || (blank(existing.genre) && genre === null))) {
    ({ description, genre } = await askMetadata(description, blank(existing.genre) ? genre : String(existing.genre), gameKindOrDefault(existing.kind as string | undefined), context.prompts));
  }
  // A description that changed here was typed at the prompt, which is the person's word too.
  if ((blank(existing.description) || description !== existing.description) && description.trim()) filled.description = description;
  let guessedGenre = false;
  if (blank(existing.genre)) {
    if (genre === null && !context.interactive) { genre = FALLBACK_GENRE; guessedGenre = true; }
    if (genre) filled.genre = genre;
  }
  let detected: Control[] | null = null;
  if (blank(existing.controls)) {
    const sourceRoot = await realpath(root);
    const engineId = await engineSetup(sourceRoot, await readBuildPackage(root), typeof flags.engine === "string" ? flags.engine : undefined).then(engine => engine.id, () => "unknown");
    detected = await detectControls(sourceRoot, context.html, engineId);
    filled.controls = detected ?? ["keyboard", "mouse"];
  }
  if (!Object.keys(filled).length) throw await manifestExists(root);
  const manifest = { ...existing, ...filled };
  const credentialIssue = manifestCredentialIssue(manifest);
  if (credentialIssue) throw new CliError("manifest_invalid", credentialIssue, 2);
  const parsed = manifestSchema.safeParse(manifest);
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
    await replaceFile(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
  await ensureProjectIgnored(root);
  await recordGuesses(root, { ...(guessedGenre ? { genre: genre! } : {}), ...("controls" in filled && !detected ? { controls: filled.controls as string[] } : {}) },
    Object.keys(filled).filter(field => field === "genre" || field === "controls"));
  const names = Object.keys(filled);
  /* Every flag init could have used and did not: a value the file already sets, and the
     flags that only shape a new file (what it is, and where its build goes). */
  const kept = ["title", "description", "genre", "kind", "based-on", "output", ...("controls" in filled ? [] : ["engine"])]
    .filter(field => typeof flags[field] === "string" && !(field in filled)).map(field => `--${field}`);
  const needs = [...new Set(issues.map(issue => issue.path.join(".")))];
  const next = `opengame check ${folderArgument(root)}`;
  return { manifest, needs, filled: names, next, message: [
    `Filled ${new Intl.ListFormat("en").format(names)} in the existing opengame.json and left everything else as it was.`,
    ...(kept.length ? [`init did not use ${new Intl.ListFormat("en").format(kept)}, because it only fills what the file leaves blank. Edit opengame.json to change anything it already sets.`] : []),
    ...(needs.length ? [`Still to correct in opengame.json:\n${issues.map(issue => `${issue.path.join(".") || "opengame.json"}: ${issue.message}`).join("\n")}`] : []),
    ...(guessedGenre ? [genreNote(genre!)] : []),
    ...("controls" in filled ? [controlsNote(detected)] : []),
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

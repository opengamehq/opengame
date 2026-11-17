import { basename, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { AUTO, LIMITS, chooseTitle, isAutoValue, pageTitle, slurTextProblem } from "@opengame/shared";
import { AUTO_MANIFEST_FIELDS, PLACEHOLDER_DESCRIPTION, playersSchema, playersToMultiplayer, type DeployProvisional, type Players } from "@opengame/protocol";
import { CliError } from "./output";
import { readBuildPackage } from "./build-output";
import { projectText } from "./engines";

/**
 * Auto in opengame.json: a field whose value is `"auto"`, blank or left out is written by
 * review from the game itself, and the creator accepts or changes what it wrote on the
 * deploy's page before anything publishes.
 *
 * The owner, 13 Nov 2026: "we should have options for all the things it asks to collect to make
 * it auto and have model decide ... first option and default should be auto". Review's code
 * read already proposes a title, tagline, description, genre, subgenre and controls for a
 * field the deploy names provisional (opengame_pipeline/detected_details.py), and the deploy
 * page offers them. So Auto is that, said in the file: the manifest the server receives keeps
 * the placeholders it always did, and the deploy names each Auto field in `provisional`, which
 * is the one signal review and the details form read. Nothing here calls a model.
 *
 * The subgenre is never in opengame.json, so it is always review's, chosen on the deploy page.
 */
// One list with the published JSON Schema (packages/protocol, manifestJsonSchema).
export const AUTO_FIELDS = AUTO_MANIFEST_FIELDS;
export type AutoField = typeof AUTO_FIELDS[number];

/** What a manifest's Auto genre and controls stand in as until review answers. The genre is
 *  the broadest one (the deploy page and the server replace it with review's); the controls
 *  are what init wrote for a game whose input it could not read. */
export const FALLBACK_GENRE = "puzzle-casual";
export const FALLBACK_CONTROLS = ["keyboard", "mouse"] as const;

/** The Auto fields of each manifest `loadManifest` read, kept beside it rather than in it so
 *  the manifest stays the protocol's shape. */
const autoOf = new WeakMap<object, AutoField[]>();
export function autoFields(manifest: object): AutoField[] { return autoOf.get(manifest) ?? []; }
export function rememberAuto<T extends object>(manifest: T, fields: AutoField[]): T {
  if (fields.length) autoOf.set(manifest, fields);
  return manifest;
}

/** Which Auto fields the deploy request names provisional. The tagline is optional in the
 *  manifest, so an Auto tagline is simply none, which the details form already offers review's for.
 *  Players the same: an Auto `players` sends no `multiplayer`, and the details form offers what
 *  review found. */
export function provisionalAuto(fields: readonly AutoField[]): DeployProvisional[] {
  return fields.filter((field): field is Exclude<AutoField, "tagline" | "players"> => field !== "tagline" && field !== "players");
}

/**
 * The name a deploy sends for an Auto title, read the way init read one before Auto: the
 * page's <title> or package.json's name when either names a game rather than a template,
 * else the folder's. Review offers the name the game gives itself instead, on the deploy's
 * page. Never a read that fails, and a name that does not fit the title's limits is "My game".
 */
export async function guessedTitle(root: string): Promise<string> {
  let html = "", name: string | null = null;
  try { html = await projectText(await realpath(root), "index.html") ?? ""; } catch { /* no page to read */ }
  try { const pkg = await readBuildPackage(root); name = typeof pkg.name === "string" ? pkg.name.replace(/^@[^/]+\//, "") : null; } catch { /* no package */ }
  let folder = basename(resolve(root));
  try { folder = basename(await realpath(root)); } catch { /* the path as given */ }
  /* chooseTitle and pageTitle are Drop's too, so one folder gets one name whichever way it is
     deployed (launch E2E, J-opus-E5). */
  const title = chooseTitle({ page: pageTitle(html), named: name, folder });
  const { productMin, max } = LIMITS.text.gameTitle;
  return title.length >= productMin && title.length <= max && !isAutoValue(title) && !slurTextProblem(title) ? title : "My game";
}

/**
 * opengame.json as read, with each Auto field replaced by its stand-in and named, so the
 * manifest schema reads a file that says `"genre": "auto"` as the game it is. A value that is
 * not Auto is left exactly as written, for the schema to accept or refuse.
 */
export async function resolveAuto(value: unknown, root: string): Promise<{ value: unknown; auto: AutoField[] }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value, auto: [] };
  const raw: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  const auto: AutoField[] = [];
  if (isAutoValue(raw.title)) { raw.title = await guessedTitle(root); auto.push("title"); }
  if (isAutoValue(raw.tagline)) { delete raw.tagline; auto.push("tagline"); }
  if (isAutoValue(raw.description)) { raw.description = PLACEHOLDER_DESCRIPTION; auto.push("description"); }
  if (isAutoValue(raw.genre)) { raw.genre = FALLBACK_GENRE; auto.push("genre"); }
  const controls = raw.controls;
  if (isAutoValue(controls) || (Array.isArray(controls) && (controls.length === 0 || controls.every(isAutoValue)))) {
    raw.controls = [...FALLBACK_CONTROLS]; auto.push("controls");
  }
  /* How the game is played (17 Nov 2026): `players` is the file's word and `multiplayer` the
     wire's (packages/protocol, playersSchema), so the one becomes the other here, where the
     file becomes a manifest. An older file's `multiplayer` is read as it is. */
  if ("players" in raw) {
    if (raw.multiplayer !== undefined) {
      throw new CliError("manifest_invalid", "opengame.json names both players and multiplayer. Keep players and remove multiplayer, which is the older way of saying the same thing.", 1);
    }
    if (isAutoValue(raw.players)) auto.push("players");
    else {
      const players = playersSchema.safeParse(raw.players);
      if (!players.success) {
        const issue = players.error.issues.find(each => each.code !== "invalid_union") ?? players.error.issues[0];
        throw new CliError("manifest_invalid", `players: ${issue?.message && issue.message !== "Invalid input" ? issue.message : PLAYERS_HELP}`, 1);
      }
      raw.multiplayer = playersToMultiplayer(players.data);
    }
    delete raw.players;
  } else if (raw.multiplayer === undefined) auto.push("players");
  return { value: raw, auto };
}

/** What `players` takes, said where a file or a flag gets it wrong. */
export const PLAYERS_HELP = `Use "single", or { "mode": "private" or "online", "min": 1 to ${LIMITS.platform.manifest.playersMax}, "max": 2 to ${LIMITS.platform.manifest.playersMax} }, or "auto".`;

/**
 * --players, --min-players and --max-players, as init and publish take them: undefined when
 * none is given, "auto" for Auto, else how the game is played. Refused before anything is
 * written or sent, by the same schema opengame.json's `players` is read with.
 */
export function playersFlags(flags: Record<string, string | boolean>): Players | typeof AUTO | undefined {
  const mode = typeof flags.players === "string" ? flags.players.trim().toLowerCase() : undefined;
  const count = (name: "min-players" | "max-players") => {
    const value = flags[name];
    if (typeof value !== "string") return undefined;
    if (!/^\d+$/.test(value.trim())) throw new CliError("invalid_flag", `Use a whole number for --${name}.`, 2);
    return Number(value.trim());
  };
  const min = count("min-players"), max = count("max-players");
  if (mode === undefined && min === undefined && max === undefined) return undefined;
  if (mode === undefined) throw new CliError("invalid_flag", "Name the mode with --players private or --players online when you give --min-players or --max-players.", 2);
  if (isAutoValue(mode) || mode === "single") {
    if (min !== undefined || max !== undefined) throw new CliError("invalid_flag", `--players ${mode} takes no --min-players or --max-players.`, 2);
    return isAutoValue(mode) ? AUTO : { mode: "single" };
  }
  if (mode !== "private" && mode !== "online") throw new CliError("invalid_flag", "Use --players single, private, online or auto.", 2);
  if (max === undefined) throw new CliError("invalid_flag", `Give --max-players, the most players in one session, with --players ${mode}.`, 2);
  const parsed = playersSchema.safeParse({ mode, ...(min === undefined ? {} : { min }), max });
  if (!parsed.success) throw new CliError("invalid_flag", `--min-players and --max-players: ${PLAYERS_HELP}`, 2);
  return parsed.data;
}

/** The one line help and init print about Auto. */
export const AUTO_HELP = `Leave a field out, blank or "${AUTO}" and review writes it from your game; you accept or change it on the deploy's page, or with opengame publish.`;

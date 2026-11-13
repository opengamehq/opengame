import { z } from "./zod";
import { LIMITS, GENRE_SLUGS, GAME_KINDS, GAME_KIND_SLUGS, compiledCredentialPatterns, parseGameKind, slurTextProblem } from "@opengame/shared/browser";
import { lobbyAllowlist } from "@opengame/shared/lobby-configuration";
import { BOARD_FORMATS, BOARD_KEEPS, COLUMN_AGGS, SCORE_AGGS, WHERE_OPS, crossCheckBoards, parseBoardShape, type BoardShape } from "@opengame/shared/game-boards";

const cap = LIMITS.platform.manifest;
// Achievement definitions are capped where the API that stores them is, so a manifest
// the CLI accepts is never one that saveAchievement then refuses field by field.
const achievementCap = LIMITS.analytics;

// Postgres and JSON Schema count code points. String.length counts UTF-16 units,
// so using Zod's ordinary length check here would reject some valid titles.
function text(min: number, max: number) {
  const trimmed = /^(?:\S(?:[\s\S]*\S)?)?(?![\s\S])/;
  return z.string().regex(trimmed, "Remove surrounding spaces.").refine((value) => {
    const length = [...value.trim()].length;
    return value === value.trim() && length >= min && length <= max;
  }, `Use ${min} to ${max} characters, without surrounding spaces.`)
    .meta({ minLength: min, maxLength: max });
}

const boardFormat = z.enum(BOARD_FORMATS)
  .meta({ description: "How the value reads: number, integer, duration_ms, duration_s, percent (0 to 100) or distance_m." });
const boardColumnKey = z.string().regex(/^[a-z][a-z0-9_]*(?![\s\S])/).max(cap.boardColumnKeyCharsMax);
/* What a career column reads from its source board: `score`, or one of that board's columns.
   Whether the column exists is crossCheckBoards', below, since one board cannot see another. */
const boardField = z.string().regex(/^[a-z][a-z0-9_]*(?![\s\S])/).max(cap.boardColumnKeyCharsMax);

export function isBundlePath(value: string): boolean {
  return [...value].length <= cap.pathCharsMax && BUNDLE_PATH.test(value);
}

const BUNDLE_PATH = /^(?!\/)(?![\s\S]*(?:^|\/)\.{1,2}(?:\/|$))(?![\s\S]*[\\\u0000-\u001f\u007f:#?%])[^/]+(?:\/[^/]+)*(?![\s\S])/;
/* The two ways a Windows path fails the pattern get their own sentence, because "Use a
   relative path" does not tell somebody who typed a backslash or a drive letter what is wrong. */
const bundlePath = z.string()
  .refine(value => !value.includes("\\"), "Use forward slashes, as in dist/web, not backslashes.")
  .refine(value => !/^[A-Za-z]:/.test(value), "Use a path relative to opengame.json, as in dist, not a drive letter.")
  .regex(BUNDLE_PATH, "Use a relative path inside the game folder.").refine(isBundlePath)
  .meta({ maxLength: cap.pathCharsMax, description: "Relative POSIX path; no traversal, encoded paths or symlinks." });

export function manifestCredentialIssue(value: Record<string, unknown>): string | undefined {
  // Metadata is uploaded separately from the ZIP. The archive's secret scan
  // cannot protect a key pasted into a description or a local build command.
  const patterns = compiledCredentialPatterns("content");
  function hasCredential(input: unknown): boolean {
    if (typeof input === "string") return patterns.some(({ re }) => re.test(input));
    if (Array.isArray(input)) return input.some(hasCredential);
    return Boolean(input && typeof input === "object" && Object.values(input).some(hasCredential));
  }
  // Local shell commands may reference environment values without containing
  // them. Remove only complete, plain variable references, never defaults,
  // command substitutions or interpolated literal values, before this check.
  const variable = String.raw`\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})`;
  const referenceAssignment = new RegExp(String.raw`(^|\s)[A-Za-z_][A-Za-z0-9_]*=(?:${variable}|"${variable}")(?=\s|$)`, "g");
  const build = value.build && typeof value.build === "object" ? value.build as Record<string, unknown> : undefined;
  const command = typeof build?.command === "string" ? build.command.replace(referenceAssignment, "$1").replace(new RegExp(variable, "g"), "") : build?.command;
  if (hasCredential({ ...value, ...(build ? { build: { ...build, command } } : {}) })) return "Remove credentials from opengame.json before uploading. If a value is real, rotate it. Use environment variables for local build secrets.";
  return undefined;
}

export const gameRequirementsSchema = z.strictObject({
  renderer: z.enum(["webgl", "webgl2", "webgpu"]).optional(),
  threads: z.boolean().optional(),
  desktopOnly: z.boolean().optional(),
  gamepad: z.boolean().optional(),
});
export type GameRequirements = z.infer<typeof gameRequirementsSchema>;

const runtimePins = LIMITS.platform.engineRuntimes.runtimes;

// These settings choose retained local bytes and presentation only. Network,
// script access and cloud policy remain owned by the platform runtime shell.
export const runtimeSettingSchema = z.discriminatedUnion("id", [
  z.strictObject({
    id: z.literal("jsdos"),
    version: z.literal(runtimePins.jsdos.version),
    options: z.strictObject({
      autoStart: z.boolean().optional(),
      renderBackend: z.enum(["webgl", "canvas"]).optional(),
      renderAspect: z.enum(["AsIs", "1/1", "5/4", "4/3", "16/10", "16/9", "Fit"]).optional(),
      imageRendering: z.enum(["pixelated", "smooth"]).optional(),
    }).optional(),
  }),
  z.strictObject({
    id: z.literal("ruffle"),
    version: z.literal(runtimePins.ruffle.version),
    options: z.strictObject({
      letterbox: z.enum(["off", "fullscreen", "on"]).optional(),
      // The shell applies host pause and mute before the first frame. Its
      // explicit-start or automatic-start flow cannot preserve upstream's
      // audio-dependent "auto" heuristic, so only these two modes are exposed.
      autoplay: z.enum(["off", "on"]).optional(),
    }).optional(),
  }),
  z.strictObject({ id: z.literal("pyodide"), version: z.literal(runtimePins.pyodide.version) }),
  z.strictObject({ id: z.literal("wasmoon"), version: z.literal(runtimePins.wasmoon.version) }),
  z.strictObject({ id: z.literal("flutter-canvaskit"), version: z.literal(runtimePins["flutter-canvaskit"].version) }),
]);
export const runtimeSettingsSchema = z.array(runtimeSettingSchema)
  .min(1).max(Object.keys(runtimePins).length)
  .refine(settings => new Set(settings.map(setting => setting.id)).size === settings.length,
    "List each runtime once.");
export type RuntimeSetting = z.infer<typeof runtimeSettingSchema>;
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

const lobbyId = z.string().max(cap.lobbyIdCharsMax).regex(/^[a-z][a-z0-9_]*(?![\s\S])/)
  .refine(value => !["constructor", "prototype", "__proto__"].includes(value), "Use a different setting ID.");
export const lobbyConfigurationSchema = z.strictObject({
  settings: z.array(z.strictObject({
    key: lobbyId,
    label: text(1, cap.lobbyLabelCharsMax),
    kind: z.enum(["map", "choice"]).optional(),
    default: lobbyId,
    choices: z.array(z.strictObject({
      id: lobbyId,
      label: text(1, cap.lobbyLabelCharsMax),
      description: text(1, cap.lobbyDescriptionCharsMax).optional(),
    })).min(1).max(cap.lobbyChoicesMax),
  })).min(1).max(cap.lobbySettingsMax),
}).superRefine((value, ctx) => {
  try { lobbyAllowlist(value); }
  catch { ctx.addIssue({ code: "custom", message: "List each setting and choice once. Each default must name an available choice." }); }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > cap.lobbySchemaBytesMax)
    ctx.addIssue({ code: "custom", message: "Shorten the room settings and descriptions." });
  for (const [index, setting] of value.settings.entries()) {
    for (const [field, content] of [["label", setting.label], ...setting.choices.flatMap((choice, i) =>
      [[`choices.${i}.label`, choice.label], [`choices.${i}.description`, choice.description ?? ""]])] as [string, string][]) {
      const problem = slurTextProblem(content);
      if (problem) ctx.addIssue({ code: "custom", path: ["settings", index, ...field.split(".")], message: problem });
    }
  }
});

/**
 * Whether opengame.json's `owner` names this handle. Handles are `citext` with a unique index
 * on the bare column (limits.json `handle`), so `@KaladinOG` and `kaladinog` are one account
 * and the comparison folds case; the pattern is ASCII, so a plain lower-casing is the same
 * fold the database makes. The `@` is optional here because the schema above is what asks
 * for it, with its own sentence, and a missing one is not a different person. The server's
 * ownership proof and the GitHub tab's early read both
 * call this, so the page never says "yours" about a line the server would refuse.
 */
export function manifestOwnerIs(claimed: string, handle: string | null | undefined): boolean {
  return typeof handle === "string" && handle.length > 0 && claimed.trim().replace(/^@/, "").toLowerCase() === handle.trim().toLowerCase();
}

/* The structure an editor can check is spelled out here, with the caps from limits.json.
   What a board MEANS (a column key that is reserved, a key declared twice, a keep rule and
   its runsPerPlayer, how many tag combinations the variants make) is parseBoardShape's,
   called in the superRefine below, because og-api, the SDK's local mode, the deploy and
   the page all ask that one function and a second reading here would drift from it. */
const boardSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]*(?![\s\S])/).max(cap.boardKeyCharsMax),
  order: z.enum(["asc", "desc"]),
  label: text(1, cap.boardLabelCharsMax),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  scoreLabel: text(1, cap.boardColumnLabelCharsMax).optional()
    .meta({ description: "What the score column is called on the board, such as Round. The board's label is the heading above it." }),
  format: boardFormat.optional(),
  keep: z.enum(BOARD_KEEPS).optional()
    .meta({ description: "best (the default) keeps each player's best run for each combination of tags. runs keeps every run, up to runsPerPlayer. career keeps one row per player that adds up their accepted runs on the board named by from; nothing is submitted to it." }),
  from: z.string().regex(/^[a-z][a-z0-9_]*(?![\s\S])/).max(cap.boardKeyCharsMax).optional()
    .meta({ description: "Required when keep is career, and refused otherwise: the key of the board of this game whose accepted runs feed this one. It keeps best or runs, not career." }),
  scoreAgg: z.enum(SCORE_AGGS).optional()
    .meta({ description: "Required when keep is career, and refused otherwise: how a source run's score adds into this board's score. sum, count, max or min." }),
  runsPerPlayer: z.number().int().min(1).max(cap.boardRunsPerPlayerMax).optional()
    .meta({ description: "Required when keep is runs, and refused otherwise: how many runs one player keeps on the board for each combination of tags." }),
  columns: z.array(z.strictObject({
    key: boardColumnKey,
    label: text(1, cap.boardColumnLabelCharsMax),
    format: boardFormat.optional(),
    order: z.enum(["asc", "desc"]).optional(),
    sortable: z.boolean().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    decimals: z.number().int().min(0).max(4).optional()
      .meta({ description: "How many decimals every value in the column is drawn with, 0 to 4, so a column of rates or averages lines up. A career average or ratio draws one when left out." }),
    // Career boards only, and required on every column of one (parseBoardShape says so).
    agg: z.enum(COLUMN_AGGS).optional()
      .meta({ description: "Career boards only: count, sum, max, min or avg of of over the player's runs, or ratio of two earlier columns." }),
    of: z.union([boardField, z.tuple([boardField, boardField])]).optional()
      .meta({ description: "Career boards only: score or a column of the source board (a count may leave it out), or for a ratio [numerator, denominator], two earlier columns of this board." }),
    where: z.strictObject({ of: boardField, op: z.enum(WHERE_OPS), value: z.number().finite() }).optional()
      .meta({ description: "Career boards only, not on a ratio: count or aggregate only the runs where of compares to value, such as placement eq 1." }),
    scale: z.number().finite().positive().max(1e6).optional()
      .meta({ description: "Ratio only: what the ratio is multiplied by, such as 100 for a percentage. 1 when left out." }),
    requires: z.strictObject({ column: boardField, atLeast: z.number().finite().min(0) }).optional()
      .meta({ description: "Ratio only: the ratio is shown only once that earlier column is at least atLeast, such as 5 matches." }),
  })).max(cap.boardColumnsMax).optional(),
  variants: z.array(z.strictObject({
    key: boardColumnKey,
    label: text(1, cap.boardColumnLabelCharsMax),
    values: z.array(z.strictObject({
      key: z.string().regex(/^[a-z0-9][a-z0-9_-]*(?![\s\S])/).max(cap.boardColumnKeyCharsMax),
      label: text(1, cap.boardColumnLabelCharsMax),
    })).min(1).max(cap.boardVariantValuesMax),
  })).max(cap.boardVariantsMax).optional(),
});

export const manifestSchema = z.strictObject({
  $schema: z.literal("https://opengame.io/schema/opengame.json").optional(),
  /* The OpenGame account this project deploys as, written `@handle`. Optional on every path,
     the GitHub tab's included since 10 Nov 2026 (it was required there, as the proof the
     repository was the creator's). When it is present and names somebody else the deploy is
     refused, and for a GitHub deploy our server reads it at the exact commit, so a project
     copied from another creator says so before it uploads. */
  owner: z.string().regex(new RegExp(`^@${LIMITS.handle.pattern.slice(1)}`), "Write your OpenGame handle with its @, like @yourname.").optional(),
  title: text(LIMITS.text.gameTitle.productMin, LIMITS.text.gameTitle.max),
  description: text(LIMITS.text.gameDescription.productMin, LIMITS.text.gameDescription.max),
  tagline: text(0, LIMITS.text.gameTagline.max).optional(),
  /* The message a person reads when init leaves genre blank for them to choose. Zod's own
     was `Invalid option: expected one of "shooter-survival"|"action-adventure"|...`,
     printed three times by `opengame check` on the first walk through init (15 Oct 2026). */
  genre: z.enum(GENRE_SLUGS, { error: `Choose a genre: ${GENRE_SLUGS.join(", ")}.` }),
  /* What the upload is (packages/shared/game-kinds.json). Optional, and absent claims
     nothing rather than claiming a game: every manifest written before 26 Oct 2026 leaves
     it out, and a deploy from one must leave a world a world. `opengame init` writes it
     every time, so a new checkout says what it is. basedOn names the game a decomp or a mod
     is made from; which kinds need it, and which refuse it, is parseGameKind's rule, read
     in the superRefine below rather than restated here. */
  kind: z.enum(GAME_KIND_SLUGS, { error: `Choose a kind: ${GAME_KIND_SLUGS.join(", ")}.` }).optional(),
  basedOn: text(1, LIMITS.text.gameBasedOn.max).optional(),
  build: z.strictObject({
    command: text(1, cap.buildCommandCharsMax).optional(),
    output: z.union([z.literal("."), bundlePath]),
  }).optional(),
  /* Accepted and ignored. Since 30 Oct 2026 OpenGame makes every game's cover itself,
     after approval, and a creator no longer supplies one. The field stays because every
     opengame.json written before then may carry it, and a field this schema does not know
     fails the manifest check: removing it would turn a folder that deployed yesterday into
     one that is refused today. The CLI says once that it can go and sends nothing; the
     server drops it from what an older CLI still sends (the web app's deploy candidate),
     so no release takes a cover from a bundle whichever CLI made it. */
  cover: bundlePath.optional().meta({ deprecated: true,
    description: "Ignored. OpenGame makes the cover after approval; remove this field." }),
  controls: z.array(z.enum(["keyboard", "mouse", "gamepad"])).min(1)
    .refine((items) => new Set(items).size === items.length, "List each control once.").meta({ uniqueItems: true }),
  requires: gameRequirementsSchema.optional(),
  /* MULTIPLAYER IS GONE AND `p2p` IS STILL READ, ON PURPOSE (5 Nov 2026). The SDK's
     lobbies and the playtest's multiplayer check were taken out for launch, so no value
     here turns anything on. Refusing `p2p` would still break things that exist: checkouts
     written before the removal, stored releases, and the metadata head the database
     rebuilds from a games row with private or online lobbies, which writes {"mode":"p2p"}
     back (online since 20261106180000, so a pull keeps an online game multiplayer).
     `opengame check` and every deploy
     from those would fail on a field that now does nothing. So it parses as it did, under
     its old shape rules, and nothing that documents the manifest should offer it: "none"
     is what to write. The editor schema still lists it, because that schema is what
     validates the same old files in an editor. */
  multiplayer: z.strictObject({
    mode: z.enum(["none", "p2p"]),
    maxPlayers: z.number().int().min(1).max(LIMITS.rtc.peersPerLobbyMax),
    lobby: lobbyConfigurationSchema.optional(),
  }).optional(),
  leaderboards: z.array(boardSchema).max(cap.boardCountMax).optional(),
  /* Declared here and saved through PUT /api/v1/games/{id}/achievements when a deploy is
     ready, the same route a creator could call by hand. The id rule is the SDK's and the
     API's, so an id this accepts is one og.achievements.unlock will send. */
  achievements: z.array(z.strictObject({
    id: z.string()
      .regex(/^[a-z0-9][a-z0-9_-]*(?![\s\S])/, "Use lowercase letters, digits, hyphens and underscores, starting with a letter or digit.")
      .max(achievementCap.achievementIdCharsMax, `Use at most ${achievementCap.achievementIdCharsMax} characters.`),
    // The definitions API counts UTF-16 units (zod's max), where text() counts code points,
    // so an emoji counts twice here too. Otherwise check passes a title the deploy's save refuses.
    title: text(1, achievementCap.achievementTitleCharsMax).refine(value => value.length <= achievementCap.achievementTitleCharsMax,
      `Use at most ${achievementCap.achievementTitleCharsMax} characters; an emoji counts as two.`),
    description: text(0, achievementCap.achievementDescriptionCharsMax).refine(value => value.length <= achievementCap.achievementDescriptionCharsMax,
      `Use at most ${achievementCap.achievementDescriptionCharsMax} characters; an emoji counts as two.`).optional(),
  })).max(achievementCap.achievementDefinitionsMax, `Declare at most ${achievementCap.achievementDefinitionsMax} achievements.`).optional(),
  // Existing checkouts pin a version string. Engine exports may instead opt out
  // of the platform's injected global when they package that build themselves.
  sdk: z.union([
    text(1, cap.boardKeyCharsMax),
    z.strictObject({ inject: z.boolean(), version: text(1, cap.boardKeyCharsMax).optional() }),
  ]).optional(),
  runtimes: runtimeSettingsSchema.optional(),
}).superRefine((value, ctx) => {
  for (const field of ["title", "description", "tagline", "basedOn"] as const) {
    const problem = slurTextProblem(value[field] ?? "");
    if (problem) ctx.addIssue({ code: "custom", path: [field], message: problem });
  }
  /* The one reading of kind and basedOn that the website, the wizard and the database
     share. The enum and text() above already say a kind is not one of the four and a name
     is too long, so those two are not said twice; every other refusal is, the hidden or
     letterless source included. That one was dropped here once (review R32b), so
     `opengame check` passed a zero-width basedOn the freeze then refused after the upload,
     which on the large-game lane is after gigabytes. */
  const kind = parseGameKind(value.kind, value.basedOn);
  if (!kind.ok && kind.field === "basedOn" && kind.code !== "length") {
    ctx.addIssue({ code: "custom", path: ["basedOn"], message: kind.message });
  }
  const credentialIssue = manifestCredentialIssue(value);
  if (credentialIssue) ctx.addIssue({ code: "custom", message: credentialIssue });
  const keys = new Set<string>();
  const shapes: BoardShape[] = [];
  let shaped = true;
  for (const [index, board] of (value.leaderboards ?? []).entries()) {
    // Every label a player reads on the board, not only its heading: a column or a mode is
    // drawn on the game page as large as the board's own label.
    const labels: [(string | number)[], string | undefined][] = [[["label"], board.label], [["scoreLabel"], board.scoreLabel],
      ...(board.columns ?? []).map((column, i): [(string | number)[], string] => [["columns", i, "label"], column.label]),
      ...(board.variants ?? []).flatMap((variant, i) => [[["variants", i, "label"], variant.label] as [(string | number)[], string],
        ...variant.values.map((item, j): [(string | number)[], string] => [["variants", i, "values", j, "label"], item.label])])];
    for (const [path, label] of labels) {
      const problem = slurTextProblem(label ?? "");
      if (problem) ctx.addIssue({ code: "custom", path: ["leaderboards", index, ...path], message: problem });
    }
    if (keys.has(board.key)) ctx.addIssue({ code: "custom", path: ["leaderboards", index, "key"], message: "Use a different board key." });
    keys.add(board.key);
    // Only once the structure has parsed, so a label that is too long is said once, by the
    // field that holds it, rather than again in parseBoardShape's words.
    const shape = boardSchema.safeParse(board).success ? parseBoardShape(board, cap) : null;
    if (shape && !shape.ok) ctx.addIssue({ code: "custom", path: ["leaderboards", index], message: shape.reason });
    if (shape?.ok) shapes.push(shape.shape); else shaped = false;
  }
  /* What one board cannot check about another: a career board's source exists and is not a
     career board, what its columns read is the source's score or a column of it, and its
     variants are the source's. Only once every board has parsed, so a broken source is said
     once, by its own field. The reason opens with the career board's key, which finds it. */
  const crossed = shaped ? crossCheckBoards(shapes) : null;
  if (crossed) {
    const index = shapes.findIndex(shape => shape.keep === "career" && (crossed.startsWith(`${shape.key}:`) || crossed.startsWith(`${shape.key}.`)));
    ctx.addIssue({ code: "custom", path: index < 0 ? ["leaderboards"] : ["leaderboards", index], message: crossed });
  }
  const ids = new Set<string>();
  for (const [index, achievement] of (value.achievements ?? []).entries()) {
    for (const field of ["title", "description"] as const) {
      const problem = slurTextProblem(achievement[field] ?? "");
      if (problem) ctx.addIssue({ code: "custom", path: ["achievements", index, field], message: problem });
    }
    if (ids.has(achievement.id)) ctx.addIssue({ code: "custom", path: ["achievements", index, "id"], message: "Use a different achievement id. Each one is listed once." });
    ids.add(achievement.id);
  }
  if (value.multiplayer?.mode === "p2p" && value.multiplayer.maxPlayers < 2) {
    ctx.addIssue({ code: "custom", path: ["multiplayer", "maxPlayers"], message: "Multiplayer games need at least two players." });
  }
  if (value.multiplayer?.mode === "none" && value.multiplayer.maxPlayers !== 1) {
    ctx.addIssue({ code: "custom", path: ["multiplayer", "maxPlayers"], message: "Single-player games have one player." });
  }
  if (value.multiplayer?.mode === "none" && value.multiplayer.lobby) {
    // Not "set mode p2p": that would advertise the legacy value the comment above retires.
    ctx.addIssue({ code: "custom", path: ["multiplayer", "lobby"], message: "Remove lobby. Room settings were part of multiplayer, which has been removed." });
  }
});

export type GameManifest = z.infer<typeof manifestSchema>;

/** The opengame.json fields that take "auto", or may be left out, in the file a creator edits. */
export const AUTO_MANIFEST_FIELDS = ["title", "tagline", "description", "genre", "controls"] as const;

export function manifestJsonSchema() {
  const schema = z.toJSONSchema(manifestSchema);
  const runtimeSchema = schema.properties?.runtimes;
  if (!runtimeSchema || typeof runtimeSchema !== "object") {
    throw new Error("The runtime settings JSON Schema must be an object.");
  }
  const boardsSchema = schema.properties?.leaderboards as { items?: Record<string, unknown> } | undefined;
  if (!boardsSchema?.items || typeof boardsSchema.items !== "object") {
    throw new Error("The leaderboards JSON Schema must describe its items.");
  }
  return {
    ...schema, $id: "https://opengame.io/schema/opengame.json",
    properties: {
      ...schema.properties,
      runtimes: {
        ...runtimeSchema,
        // With a finite ID set, contains can express per-ID uniqueness even
        // when two entries have different options or versions.
        allOf: Object.keys(runtimePins).map(id => ({
          contains: { type: "object", properties: { id: { const: id } }, required: ["id"] },
          minContains: 0,
          maxContains: 1,
        })),
      },
      leaderboards: {
        ...boardsSchema,
        // parseBoardShape's keep rules, which an editor can check: a board that keeps every
        // run says how many, and a board that keeps the best has nothing to count; a career
        // board names its source and score aggregate, has no bounds, and every column of it
        // aggregates, while no other board's column does.
        items: { ...boardsSchema.items, allOf: [{
          if: { required: ["keep"], properties: { keep: { const: "runs" } } },
          then: { required: ["runsPerPlayer"] },
          else: { not: { required: ["runsPerPlayer"] } },
        }, {
          if: { required: ["keep"], properties: { keep: { const: "career" } } },
          then: { required: ["from", "scoreAgg"], not: { anyOf: [{ required: ["min"] }, { required: ["max"] }] },
            properties: { columns: { items: { required: ["agg"], not: { anyOf: [{ required: ["min"] }, { required: ["max"] }] } } } } },
          else: { not: { anyOf: [{ required: ["from"] }, { required: ["scoreAgg"] }] },
            properties: { columns: { items: { not: { anyOf: ["agg", "of", "where", "scale", "requires"].map(key => ({ required: [key] })) } } } } },
        }] },
      },
    },
    allOf: [{
      if: { required: ["multiplayer"], properties: { multiplayer: { properties: { mode: { const: "none" } }, required: ["mode"] } } },
      then: { properties: { multiplayer: { properties: { maxPlayers: { const: 1 } }, not: { required: ["lobby"] } } } },
    }, {
      if: { required: ["multiplayer"], properties: { multiplayer: { properties: { mode: { const: "p2p" } }, required: ["mode"] } } },
      then: { properties: { multiplayer: { properties: { maxPlayers: { minimum: 2 } } } } },
    }, {
      // A decomp or a mod names the game it is made from; a game, a world or a manifest
      // with no kind (which is a game) names none.
      if: { required: ["kind"], properties: { kind: { enum: GAME_KINDS.filter(k => k.basedOn).map(k => k.slug) } } },
      then: { required: ["basedOn"] },
      else: { not: { required: ["basedOn"] } },
    }],
    // The remaining sibling-value and shared text-policy checks run through
    // parseManifest in the CLI and API before accepting a manifest. Editors get
    // the structural constraints and the finite runtime ID uniqueness rules.
    "x-opengame-semantic-checks": ["leaderboard keys are unique", "achievement ids are unique", "each leaderboard min is no greater than max",
      "each leaderboard column, variant and variant value key is declared once, and no column is keyed score, rank, player, name or all",
      `each leaderboard's variants make at most ${cap.boardVariantCombosMax} tag combinations, counting a run that leaves a variant out`,
      "each column's min is no greater than its max",
      "a career board's from names another board of this game that keeps best or runs, every of and where.of is score or one of that board's columns, and its variants and values are that board's",
      "a career column's ratio divides two columns declared before it that are not ratios, and its requires names one of them; a ratio has no where, and only a ratio has scale or requires",
      "a count may leave of out; every other aggregate names it", "room setting keys and choice IDs are unique", "each room default names an available choice", "room metadata fits the shared UTF-8 byte limit", "metadata passes the shared lexical slur check"],
  };
}

/**
 * The JSON Schema of opengame.json as a creator edits it, published at
 * opengame.io/schema/opengame.json for editors. It is `manifestJsonSchema` with Auto: each of
 * AUTO_MANIFEST_FIELDS also takes "auto" and may be left out (the owner, 13 Nov 2026). The CLI
 * reads those as placeholders named provisional (packages/cli/src/auto.ts), so the deploy
 * request and the API keep the strict `manifestJsonSchema`.
 */
export function manifestFileJsonSchema() {
  const schema = manifestJsonSchema();
  const properties = { ...schema.properties } as Record<string, unknown>;
  for (const field of AUTO_MANIFEST_FIELDS) {
    if (properties[field]) properties[field] = { anyOf: [properties[field], { const: "auto", description: "Auto: review writes it from the game, and you accept or change it on the deploy's page." }] };
  }
  return { ...schema, required: (schema.required ?? []).filter(field => !(AUTO_MANIFEST_FIELDS as readonly string[]).includes(field)), properties };
}

export function parseManifest(input: unknown): GameManifest {
  return manifestSchema.parse(input);
}

/** The manifest with the retired cover field taken out: what a deploy sends, what a staged
 * copy carries, and what the server reads from whatever an older CLI sent. One function,
 * so the CLI and the server cannot disagree about what "ignored" means. */
export function withoutCover<T extends { cover?: unknown }>(manifest: T): Omit<T, "cover"> {
  const { cover: _retired, ...rest } = manifest;
  return rest;
}

// Build output, the local command, editor schema, SDK and runtime pins describe the
// checkout. Only these product fields participate in website metadata revisions. kind and
// basedOn are here because a reviewer corrects them on the game (set_game_kind) and the
// metadata head holds them, as it holds genre; a pull brings both down, and a game or a
// world on the website takes basedOn out of the checkout with it.
//
// cover left this list on 30 Oct 2026, when it stopped being something a creator chooses.
// A head may still hold one for a game that had it before then, and the deploy carries
// that forward on its own (candidate.ts); it is no longer a field to sync, to pull, or to
// report as kept.
export const METADATA_FIELDS = ["title", "description", "tagline", "genre", "kind", "basedOn", "controls", "requires", "multiplayer", "leaderboards"] as const;
export type GameMetadata = Pick<GameManifest, typeof METADATA_FIELDS[number]>;

export function gameMetadata(manifest: GameManifest): GameMetadata {
  return Object.fromEntries(METADATA_FIELDS.filter(key => manifest[key] !== undefined)
    .map(key => [key, manifest[key]])) as GameMetadata;
}

export function resolveMetadata(
  local: GameManifest, server: GameManifest, baseRevision: number | null,
  serverRevision: number, useLocal = false,
): { manifest: GameManifest; conflicts: string[]; source: "local" | "server" } {
  if (!Number.isSafeInteger(serverRevision) || serverRevision < 1 ||
    (baseRevision !== null && (!Number.isSafeInteger(baseRevision) || baseRevision < 1 || baseRevision > serverRevision))) {
    throw new Error("Metadata revision is invalid. Pull the current game metadata and retry.");
  }
  const conflicts = METADATA_FIELDS.filter(key =>
    JSON.stringify(local[key]) !== JSON.stringify(server[key]));
  const stale = baseRevision === null || baseRevision < serverRevision;
  const source = stale && !useLocal ? "server" : "local";
  const manifest = source === "server" ? { ...gameMetadata(server),
    ...(local.build === undefined ? {} : { build: local.build }),
    ...(local.sdk === undefined ? {} : { sdk: local.sdk }),
    ...(local.runtimes === undefined ? {} : { runtimes: local.runtimes }),
    // Achievements are the checkout's, like the runtimes: the website does not edit them.
    ...(local.achievements === undefined ? {} : { achievements: local.achievements }),
    ...(local.$schema === undefined ? {} : { $schema: local.$schema }),
  } : local;
  return { manifest, conflicts: stale ? conflicts : [], source };
}

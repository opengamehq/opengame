import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LIMITS } from "@opengame/shared";
import { parseManifest, manifestJsonSchema, manifestSchema, resolveMetadata, gameMetadata, runtimeSettingsSchema, METADATA_FIELDS } from "../src/manifest";

const game = () => ({ title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard", "mouse"] });

test("CLI and server manifest parsing retain ordinary profanity and reject lexical slurs", () => {
  assert.equal(parseManifest({ ...game(), title: "Fuck this shift" }).title, "Fuck this shift");
  assert.equal(parseManifest({ ...game(), title: "Scunthorpe classic" }).title, "Scunthorpe classic");
  for (const field of ["title", "description", "tagline"]) {
    const value = field === "description" ? "A n1gg3r in a sufficiently long synthetic test sentence." : "n1gg3r night";
    assert.throws(() => parseManifest({ ...game(), [field]: value }), /contact support for a review/);
  }
  assert.throws(() => parseManifest({ ...game(), leaderboards: [{ key: "wins", order: "desc", label: "f@gg0t" }] }), /contact support for a review/);
});

test("local build commands allow environment references but never literal credentials", () => {
  for (const command of ["AWS_SECRET_ACCESS_KEY=$BUILD_STORAGE_SECRET npm run build", 'SUPABASE_SERVICE_ROLE_KEY="${BUILD_KEY}" npm run build']) {
    assert.equal(parseManifest({ ...game(), build: { output: ".", command } }).build?.command, command);
  }
  const syntheticKey = "AKIA" + "Z".repeat(16);
  for (const command of [`AWS_ACCESS_KEY_ID=${syntheticKey} npm run build`, `AWS_ACCESS_KEY_ID=$\{BUILD_KEY:-${syntheticKey}} npm run build`]) {
    assert.throws(() => parseManifest({ ...game(), build: { output: ".", command } }), /Remove credentials/);
  }
});

test("manifest rejects ownership, credentials and jam fields", () => {
  for (const key of ["gameId", "userId", "token", "jam", "certified"]) {
    assert.throws(() => parseManifest({ ...game(), [key]: "value" }));
  }
});

test("paths cannot leave the build, encode traversal or name remote assets", () => {
  for (const cover of ["../secret", "/etc/passwd", "https://x/y", "a\\b", "a/../b", "a/%2e%2e/b", "a//b", "./a"]) {
    assert.throws(() => parseManifest({ ...game(), cover }), cover);
  }
  assert.equal(parseManifest({ ...game(), cover: "marketing/cover.png", build: { output: "." } }).cover, "marketing/cover.png");
});

test("limits agree with database code-point counts and broker capacity", () => {
  assert.equal(parseManifest({ ...game(), title: "🚀".repeat(LIMITS.text.gameTitle.max) }).title.length, LIMITS.text.gameTitle.max * 2);
  assert.throws(() => parseManifest({ ...game(), title: "a".repeat(LIMITS.text.gameTitle.max + 1) }));
  assert.throws(() => parseManifest({ ...game(), multiplayer: { mode: "p2p", maxPlayers: LIMITS.rtc.peersPerLobbyMax + 1 } }));
  assert.throws(() => parseManifest({ ...game(), controls: ["touch"] }));
});

test("boards need distinct keys, finite scores and ordered bounds", () => {
  const board = { key: "rounds", label: "Rounds survived", order: "desc" };
  for (const leaderboards of [[board, board], [{ ...board, min: 10, max: 1 }], [{ ...board, max: Infinity }]]) {
    assert.throws(() => parseManifest({ ...game(), leaderboards }));
  }
});

test("achievements take the API's id rule and limits, and each id once", () => {
  const cap = LIMITS.analytics;
  const declared = [{ id: "first_win", title: "First win", description: "Win a round." }, { id: "1-boss", title: "Beat the first boss" }];
  assert.deepEqual(parseManifest({ ...game(), achievements: declared }).achievements, declared);
  assert.equal(parseManifest({ ...game(), achievements: [{ id: "x".repeat(cap.achievementIdCharsMax), title: "t".repeat(cap.achievementTitleCharsMax),
    description: "d".repeat(cap.achievementDescriptionCharsMax) }] }).achievements?.length, 1);
  assert.equal(parseManifest({ ...game(), achievements: [{ id: "trophy", title: "🏆".repeat(cap.achievementTitleCharsMax / 2) }] }).achievements?.length, 1);
  const many = Array.from({ length: cap.achievementDefinitionsMax }, (_, i) => ({ id: `a${i}`, title: `Achievement ${i}` }));
  assert.equal(parseManifest({ ...game(), achievements: many }).achievements?.length, cap.achievementDefinitionsMax);
  const refused: [unknown, RegExp][] = [
    [[...many, { id: "one_more", title: "One more" }], new RegExp(`at most ${cap.achievementDefinitionsMax} achievements`)],
    [[{ id: "x".repeat(cap.achievementIdCharsMax + 1), title: "Long" }], new RegExp(`at most ${cap.achievementIdCharsMax} characters`)],
    [[{ id: "First_Win", title: "Upper case" }], /lowercase letters, digits, hyphens and underscores/],
    [[{ id: "-first", title: "Leading hyphen" }], /starting with a letter or digit/],
    [[{ id: "first win", title: "Space" }], /lowercase letters/],
    [[{ id: "first_win\n", title: "Trailing newline" }], /lowercase letters/],
    [[{ id: "first_win", title: "" }], /Use 1 to/],
    [[{ id: "first_win", title: " Padded " }], /surrounding spaces/],
    [[{ id: "first_win", title: "t".repeat(cap.achievementTitleCharsMax + 1) }], /Use 1 to/],
    [[{ id: "first_win", title: "Win", description: "d".repeat(cap.achievementDescriptionCharsMax + 1) }], /Use 0 to/],
    // The API counts UTF-16 units, so half the limit in emoji is the most it takes.
    [[{ id: "first_win", title: "🏆".repeat(cap.achievementTitleCharsMax / 2 + 1) }], /an emoji counts as two/],
    [[{ id: "first_win", title: "Win", description: "🏆".repeat(cap.achievementDescriptionCharsMax / 2 + 1) }], /an emoji counts as two/],
    [[{ id: "first_win", title: "Win" }, { id: "first_win", title: "Win again" }], /Each one is listed once/],
    [[{ id: "first_win", title: "f@gg0t" }], /contact support for a review/],
    [[{ id: "first_win", title: "Win", description: "A n1gg3r in a sufficiently long synthetic test sentence." }], /contact support for a review/],
    // Ownership and unlock state are the server's: a manifest cannot carry them.
    [[{ id: "first_win", title: "Win", active: false }], /active/],
    [[{ id: "first_win", title: "Win", gameId: "x" }], /gameId/],
    [[{ achievementId: "first_win", title: "Win" }], /achievementId|id/],
    [{ id: "first_win", title: "Win" }, /array/i],
  ];
  for (const [achievements, message] of refused) {
    assert.throws(() => parseManifest({ ...game(), achievements }), message, JSON.stringify(achievements).slice(0, 80));
  }
});

test("achievements are the checkout's, so a website metadata revision keeps the local list", () => {
  const local = parseManifest({ ...game(), achievements: [{ id: "first_win", title: "First win" }] });
  const server = parseManifest({ ...game(), title: "Changed on the website" });
  const resolved = resolveMetadata(local, server, 1, 2);
  assert.equal(resolved.source, "server");
  assert.equal(resolved.manifest.title, "Changed on the website");
  assert.deepEqual(resolved.manifest.achievements, local.achievements);
  assert.equal("achievements" in gameMetadata(local), false);
});

test("the schema uses shared limits and can be serialized", () => {
  const schema = manifestJsonSchema();
  assert.equal(schema.properties?.title?.maxLength, LIMITS.text.gameTitle.max);
  assert.equal(schema.additionalProperties, false);
  assert.ok(JSON.stringify(schema).includes("shooter-survival"));
});

test("stale manifests keep website changes unless the creator explicitly selects local", () => {
  const local = parseManifest(game());
  const server = { ...local, title: "Changed on the website" };
  assert.deepEqual(resolveMetadata(local, server, 1, 2).manifest, server);
  assert.deepEqual(resolveMetadata(local, server, 1, 2).conflicts, ["title"]);
  assert.deepEqual(resolveMetadata(local, server, null, 2).manifest, server);
  assert.equal(resolveMetadata(local, server, 1, 2, true).manifest, local);
  assert.equal(resolveMetadata(local, server, 2, 2).manifest, local);
});


test("editor schema and runtime agree on portable constraints", () => {
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(manifestJsonSchema());
  const valid = [game(), { ...game(), title: "🚀".repeat(LIMITS.text.gameTitle.max) }, { ...game(), build: { output: "." } },
    { ...game(), achievements: [{ id: "1-boss", title: "Beat the boss", description: "" }] }];
  const invalid = [
    ...["../secret", "a/../b", "a//b", "a/%2e%2e/b", "https://x/y"].map((cover) => ({ ...game(), cover })),
    ...["\n", "\r", "\u2028", "\u2029"].flatMap((separator) => [
      { ...game(), title: "Night shift" + separator },
      { ...game(), cover: "a" + separator + "/../secret" },
      { ...game(), leaderboards: [{ key: "rounds" + separator, label: "Rounds", order: "desc" }] },
      { ...game(), achievements: [{ id: "first_win" + separator, title: "First win" }] },
    ]),
    { ...game(), achievements: [{ id: "First", title: "First win" }] },
    { ...game(), achievements: [{ id: "first_win", title: "First win", active: true }] },
    { ...game(), achievements: Array.from({ length: LIMITS.analytics.achievementDefinitionsMax + 1 }, (_, i) => ({ id: `a${i}`, title: "A" })) },
    { ...game(), multiplayer: { mode: "p2p", maxPlayers: 1 } },
    { ...game(), title: " padded " }, { ...game(), title: "x".repeat(LIMITS.text.gameTitle.max + 1) },
    { ...game(), controls: ["keyboard", "keyboard"] }, { ...game(), multiplayer: { mode: "none", maxPlayers: 2 } },
  ];
  for (const value of valid) { assert.equal(validate(value), true, JSON.stringify(validate.errors)); assert.doesNotThrow(() => parseManifest(value)); }
  for (const value of invalid) { assert.equal(validate(value), false, JSON.stringify(value)); assert.throws(() => parseManifest(value)); }
});


test("website metadata cannot replace checkout build settings or its SDK version", () => {
  const local = parseManifest({ ...game(), build: { command: "npm run build", output: "dist" }, sdk: "^2" });
  const server = parseManifest({ ...game(), title: "Website title", build: { output: "old" }, sdk: "^1" });
  const result = resolveMetadata(local, server, 1, 2);
  assert.equal(result.source, "server");
  assert.equal(result.manifest.title, server.title);
  assert.deepEqual(result.manifest.build, local.build);
  assert.equal(result.manifest.sdk, local.sdk);
  assert.deepEqual(result.conflicts, ["title"]);
  const withoutLocalSettings = resolveMetadata(parseManifest(game()), server, null, 2).manifest;
  assert.equal(withoutLocalSettings.build, undefined);
  assert.equal(withoutLocalSettings.sdk, undefined);
});

test("engine exports can disable SDK injection without changing legacy version pins", () => {
  const local = parseManifest({ ...game(), sdk: { inject: false, version: "^2" } });
  assert.deepEqual(local.sdk, { inject: false, version: "^2" });
  const server = parseManifest({ ...game(), title: "Website title", sdk: "^1" });
  assert.deepEqual(resolveMetadata(local, server, 1, 2).manifest.sdk, local.sdk);
  const validate = new Ajv2020({ strict: false }).compile(manifestJsonSchema());
  assert.equal(validate(local), true);
  for (const sdk of [{ inject: "false" }, { inject: false, token: "credential" }, { version: "^2" }]) {
    assert.throws(() => parseManifest({ ...game(), sdk }));
    assert.equal(validate({ ...game(), sdk }), false);
  }
});

test("runtime declarations round trip only the complete approved pin set", () => {
  const pins = LIMITS.platform.engineRuntimes.runtimes;
  const runtimes = Object.entries(pins).map(([id, pin]) => ({ id, version: pin.version }));
  const input = { ...game(), runtimes };
  assert.deepEqual(parseManifest(input).runtimes, runtimes);
  assert.deepEqual(runtimeSettingsSchema.parse(runtimes), runtimes);
  assert.deepEqual(parseManifest(JSON.parse(JSON.stringify(parseManifest(input)))), parseManifest(input));
  const validate = new Ajv2020({ strict: false }).compile(manifestJsonSchema());
  assert.equal(validate(input), true, JSON.stringify(validate.errors));
  for (const runtime of runtimes) {
    for (const version of [undefined, "latest", `^${runtime.version}`, `${runtime.version}-unretained`, pins[runtime.id === "ruffle" ? "jsdos" : "ruffle"].version]) {
      const invalid = { ...game(), runtimes: [{ ...runtime, version }] };
      assert.throws(() => parseManifest(invalid), `${runtime.id}: ${String(version)}`);
      assert.equal(validate(invalid), false, `${runtime.id}: ${String(version)}`);
    }
  }
});

test("runtime presentation options agree between parser and editor schema", () => {
  const pins = LIMITS.platform.engineRuntimes.runtimes;
  const validate = new Ajv2020({ strict: false }).compile(manifestJsonSchema());
  const valid = [
    ...["off", "fullscreen", "on"].map(letterbox => ({ id: "ruffle", version: pins.ruffle.version, options: { letterbox } })),
    ...["off", "on"].map(autoplay => ({ id: "ruffle", version: pins.ruffle.version, options: { autoplay } })),
    ...[true, false].map(autoStart => ({ id: "jsdos", version: pins.jsdos.version, options: { autoStart } })),
    ...["webgl", "canvas"].map(renderBackend => ({ id: "jsdos", version: pins.jsdos.version, options: { renderBackend } })),
    ...["AsIs", "1/1", "5/4", "4/3", "16/10", "16/9", "Fit"].map(renderAspect => ({ id: "jsdos", version: pins.jsdos.version, options: { renderAspect } })),
    ...["pixelated", "smooth"].map(imageRendering => ({ id: "jsdos", version: pins.jsdos.version, options: { imageRendering } })),
    { id: "ruffle", version: pins.ruffle.version, options: { letterbox: "on", autoplay: "off" } },
    { id: "jsdos", version: pins.jsdos.version, options: { autoStart: false, renderBackend: "canvas", renderAspect: "4/3", imageRendering: "pixelated" } },
  ];
  for (const runtime of valid) {
    const input = { ...game(), runtimes: [runtime] };
    assert.deepEqual(parseManifest(input).runtimes, [runtime]);
    assert.equal(validate(input), true, JSON.stringify(validate.errors));
  }
  const invalid = [
    ...[{ letterbox: "fit" }, { autoplay: true }, { autoplay: "auto" }, { autoStart: true }, { allowScriptAccess: true }, { allowNetworking: "all" }].map(options => ({ id: "ruffle", version: pins.ruffle.version, options })),
    ...[{ autoStart: "true" }, { renderBackend: "webgpu" }, { renderAspect: "16:9" }, { imageRendering: "auto" }, { noCloud: false }, { dosboxUrl: "https://example.com/runtime.js" }].map(options => ({ id: "jsdos", version: pins.jsdos.version, options })),
    ...["pyodide", "wasmoon", "flutter-canvaskit"].map(id => ({ id, version: pins[id as keyof typeof pins].version, options: {} })),
    { id: "ruffle", version: pins.ruffle.version, source: "https://example.com/ruffle.js" },
    { id: "jsdos", version: pins.jsdos.version, options: null },
    { id: "unknown", version: "1" },
  ];
  for (const runtime of invalid) {
    const input = { ...game(), runtimes: [runtime] };
    assert.throws(() => parseManifest(input), JSON.stringify(runtime));
    assert.equal(validate(input), false, JSON.stringify(runtime));
  }
});

test("runtime lists are bounded and IDs remain unique even with different options", () => {
  const runtime = { id: "ruffle", version: LIMITS.platform.engineRuntimes.runtimes.ruffle.version };
  const validate = new Ajv2020({ strict: false }).compile(manifestJsonSchema());
  const schema = manifestJsonSchema().properties.runtimes;
  assert.equal(schema.minItems, 1);
  assert.equal(schema.maxItems, Object.keys(LIMITS.platform.engineRuntimes.runtimes).length);
  for (const runtimes of [[], [runtime, runtime], [runtime, { ...runtime, options: { autoplay: "off" } }], Array.from({ length: schema.maxItems! + 1 }, () => runtime)]) {
    const input = { ...game(), runtimes };
    assert.throws(() => parseManifest(input));
    assert.equal(validate(input), false, JSON.stringify(runtimes));
  }
});

test("website metadata cannot replace or introduce checkout runtime settings", () => {
  const pins = LIMITS.platform.engineRuntimes.runtimes;
  const local = parseManifest({ ...game(), runtimes: [{ id: "ruffle", version: pins.ruffle.version, options: { autoplay: "off" } }] });
  const server = parseManifest({ ...game(), title: "Website title", runtimes: [{ id: "jsdos", version: pins.jsdos.version }] });
  const result = resolveMetadata(local, server, 1, 2);
  assert.equal(result.source, "server");
  assert.equal(result.manifest.title, server.title);
  assert.deepEqual(result.manifest.runtimes, local.runtimes);
  assert.deepEqual(result.conflicts, ["title"]);
  assert.equal("runtimes" in gameMetadata(local), false);
  assert.equal(resolveMetadata(parseManifest(game()), server, null, 2).manifest.runtimes, undefined);
  assert.deepEqual(resolveMetadata(local, server, 1, 2, true).manifest.runtimes, local.runtimes);
});

test("metadata resolution exposes which cover source must be frozen", () => {
  const local = parseManifest({ ...game(), cover: "cover.png" });
  const server = parseManifest({ ...game(), cover: "cover.png" });
  // Equal paths can name different bytes in different bundles. Selection must
  // not be inferred from the field diff or from string equality afterwards.
  assert.equal(resolveMetadata(local, server, null, 2).source, "server");
  assert.equal(resolveMetadata(local, server, 1, 2).source, "server");
  assert.equal(resolveMetadata(local, server, 1, 2, true).source, "local");
  assert.equal(resolveMetadata(local, server, 2, 2).source, "local");
});


test("invalid or future metadata revisions never bypass server changes", () => {
  const local = parseManifest(game());
  for (const revision of [0, -1, 3, 1.5, NaN, Infinity]) {
    for (const useLocal of [false, true]) assert.throws(() => resolveMetadata(local, local, revision, 2, useLocal), /revision is invalid/);
  }
  assert.throws(() => resolveMetadata(local, local, null, 0), /revision is invalid/);
});

test("the $schema address init writes is a file the web app serves, and it is this schema", () => {
  // It 404'd on opengame.io: every opengame.json pointed editors at nothing.
  const address = new URL(manifestJsonSchema().$id);
  assert.equal(address.origin, "https://opengame.io");
  const file = fileURLToPath(new URL(`../../../apps/web/public${address.pathname}`, import.meta.url));
  assert.ok(existsSync(file), `${address.pathname} is not under apps/web/public; run npm run docs:gen`);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), JSON.parse(JSON.stringify(manifestJsonSchema())));
  // And it is the address the manifest accepts, which is the one init writes.
  assert.equal(parseManifest({ ...game(), $schema: address.href }).$schema, address.href);
});

test("requirements are optional, bounded and survive local/server metadata selection", () => {
  const requires = { renderer: "webgl2" as const, threads: true, desktopOnly: true, gamepad: false };
  const local = parseManifest({ ...game(), requires });
  assert.deepEqual(local.requires, requires);
  const server = parseManifest({ ...game(), requires: { renderer: "webgpu" } });
  assert.deepEqual(resolveMetadata(local, server, 1, 2).manifest.requires, server.requires);
  assert.throws(() => parseManifest({ ...game(), requires: { renderer: "universal" } }));
  assert.throws(() => parseManifest({ ...game(), requires: { testedBrowsers: ["Safari"] } }));
  assert.throws(() => parseManifest({ ...game(), requires: { threads: "true" } }));
});

/* Every upload is a game, a world, a decomp or a mod (packages/shared/game-kinds.json).
   A manifest that says nothing is a game and claims nothing, because every opengame.json
   written before 26 Oct 2026 says nothing; a decomp or a mod names the game it is made from. */
test("kind is optional, one of the four, and a decomp or a mod names its source", () => {
  assert.equal(parseManifest(game()).kind, undefined);
  for (const kind of ["game", "world"]) assert.equal(parseManifest({ ...game(), kind }).kind, kind);
  for (const kind of ["decomp", "mod"]) assert.equal(parseManifest({ ...game(), kind, basedOn: "Doom" }).basedOn, "Doom");
  const issues = (value: Record<string, unknown>) => {
    const parsed = manifestSchema.safeParse({ ...game(), ...value });
    return parsed.success ? [] : parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
  };
  assert.deepEqual(issues({ kind: "mod" }), ["basedOn: A mod must say which game it is based on. Set basedOn to that game's name."]);
  assert.deepEqual(issues({ kind: "world", basedOn: "Doom" }), ["basedOn: basedOn is only for a decomp or a mod. Remove it, or set kind to decomp or mod."]);
  // No kind is a game, so a source with no kind is refused rather than read as a mod.
  assert.deepEqual(issues({ basedOn: "Doom" }), ["basedOn: basedOn is only for a decomp or a mod. Remove it, or set kind to decomp or mod."]);
  // The enum is lowercase, as the database's is; the CLI's flag is what forgives case.
  assert.deepEqual(issues({ kind: "MOD", basedOn: "Doom" }), ["kind: Choose a kind: game, world, decomp, mod."]);
  // One sentence per mistake: the length rule is text()'s, not repeated by the kind rule.
  assert.equal(issues({ kind: "mod", basedOn: "x".repeat(LIMITS.text.gameBasedOn.max + 1) }).length, 1);
  // Counted in code points: an astral letter is two UTF-16 units and still fits the cap. (An
  // emoji alone no longer names a game, so the sample is a mathematical bold letter.)
  assert.equal(parseManifest({ ...game(), kind: "mod", basedOn: "\u{1D400}".repeat(LIMITS.text.gameBasedOn.max) }).basedOn?.length, LIMITS.text.gameBasedOn.max * 2);
  assert.throws(() => parseManifest({ ...game(), kind: "mod", basedOn: "n1gg3r night" }), /contact support for a review/);
  assert.throws(() => parseManifest({ ...game(), kind: "mod", basedOn: " Doom" }), /surrounding spaces/);
});

test("the editor schema holds the same rule between kind and basedOn", () => {
  const validate = new Ajv2020({ strict: false }).compile(manifestJsonSchema());
  const valid = [game(), { ...game(), kind: "game" }, { ...game(), kind: "world" }, { ...game(), kind: "decomp", basedOn: "Super Mario 64" }, { ...game(), kind: "mod", basedOn: "Doom" }];
  const invalid = [{ ...game(), kind: "mod" }, { ...game(), kind: "decomp" }, { ...game(), kind: "game", basedOn: "Doom" }, { ...game(), kind: "world", basedOn: "Doom" },
    { ...game(), basedOn: "Doom" }, { ...game(), kind: "remix" }, { ...game(), kind: "Mod", basedOn: "Doom" }, { ...game(), kind: "mod", basedOn: "" },
    { ...game(), kind: "mod", basedOn: "x".repeat(LIMITS.text.gameBasedOn.max + 1) }];
  for (const value of valid) { assert.equal(validate(value), true, JSON.stringify(validate.errors)); assert.doesNotThrow(() => parseManifest(value)); }
  for (const value of invalid) { assert.equal(validate(value), false, JSON.stringify(value)); assert.throws(() => parseManifest(value)); }
});

/* kind and basedOn are product metadata the website holds, like genre. A pull or a stale
   deploy takes both from the website, so a reviewer who corrects a mod back to a game takes
   its basedOn out of the checkout along with it. */
test("kind and basedOn are website metadata, and the website's game drops a local basedOn", () => {
  assert.ok(METADATA_FIELDS.includes("kind") && METADATA_FIELDS.includes("basedOn"));
  const local = parseManifest({ ...game(), kind: "mod", basedOn: "Doom", build: { output: "dist" } });
  assert.deepEqual(gameMetadata(local), { ...game(), kind: "mod", basedOn: "Doom" });
  const server = parseManifest({ ...game(), kind: "game" });
  const resolved = resolveMetadata(local, server, 1, 2);
  assert.equal(resolved.manifest.kind, "game");
  assert.equal(resolved.manifest.basedOn, undefined);
  assert.deepEqual(resolved.manifest.build, { output: "dist" });
  assert.deepEqual(resolved.conflicts, ["kind", "basedOn"]);
  assert.doesNotThrow(() => parseManifest(resolved.manifest));
  // Explicitly local keeps the checkout's claim.
  assert.equal(resolveMetadata(local, server, 1, 2, true).manifest.basedOn, "Doom");
});

/* Review R32b N2: the manifest dropped parseGameKind's character refusal for a decomp or a
   mod, so `opengame check` passed a source the freeze refused only after the upload, and
   unassigned invisible ones got through to the database. Each is refused here now, and a
   too-long name is still said once, by text(). */
test("opengame check refuses a hidden or letterless source, and says a long one once", () => {
  for (const basedOn of ["​", "Doom‮evil", "⁥", "￰", "\u{E0080}\u{E0081}", "ㅤ", "⠀", "́", "★"]) {
    const result = manifestSchema.safeParse({ ...game(), kind: "mod", basedOn });
    assert.equal(result.success, false, JSON.stringify(basedOn));
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.path[0] === "basedOn"), JSON.stringify(basedOn));
  }
  const long = manifestSchema.safeParse({ ...game(), kind: "mod", basedOn: "x".repeat(61) });
  assert.equal(long.success, false);
  if (!long.success) assert.equal(long.error.issues.filter((issue) => issue.path[0] === "basedOn").length, 1, "the length said twice");
  assert.equal(parseManifest({ ...game(), kind: "decomp", basedOn: "ドラゴンクエスト" }).basedOn, "ドラゴンクエスト");
});

// Multiplayer was removed for launch (#904). A manifest that still says p2p is one written
// before that, or the head the database rebuilds for a game with private lobbies, so it must
// keep parsing, in the CLI and in an editor alike.
test("a legacy p2p manifest still validates, and lobby errors do not ask for p2p", () => {
  const legacy = { ...game(), multiplayer: { mode: "p2p", maxPlayers: 4 } };
  assert.deepEqual(parseManifest(legacy).multiplayer, legacy.multiplayer);
  assert.equal(new Ajv2020({ strict: false }).compile(manifestJsonSchema())(legacy), true);
  assert.throws(() => parseManifest({ ...game(), multiplayer: { mode: "none", maxPlayers: 1, lobby: { settings: [] } } }), /Remove lobby/);
});

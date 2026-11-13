import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS } from "@opengame/shared";
import { FALLBACK_GENRE, initProject, provisionalFields } from "../src/init";
import { PLACEHOLDER_DESCRIPTION } from "@opengame/protocol";
import { readProject } from "../src/project";
import { loadManifest } from "../src/files";
import type { Output } from "../src/output";

/**
 * What init guesses when it is not told, and what it does with an opengame.json that is
 * already there. Every case here is one a coding agent met on 10 Nov 2026, following the
 * team's CLI test steps with CLI 0.7.0: init left genre blank though its help said it guessed one,
 * check then refused the file, init run again said the file existed, and a canvas that
 * only counts taps was written down as needing a keyboard.
 */

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "og-init-guess-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const written = async (root: string) => JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));

/* The test steps' game, as the agent wrote it: one canvas, one pointerdown listener. */
const TAP_COUNTER = `<!doctype html><html><head><meta charset="utf-8"><title>CLI test (delete me)</title></head>
<body><canvas id="c" width="640" height="360"></canvas>
<script type="module">
const c = document.getElementById("c").getContext("2d"); let n = 0;
addEventListener("pointerdown", () => n++);
(function f() { c.fillText("Taps: " + n, 20, 40); requestAnimationFrame(f); })();
</script></body></html>`;
const DESCRIPTION = "A single screen that counts every tap, made to try the OpenGame CLI.";

test("a project whose words name no genre gets one, said by name, and check accepts the file", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), TAP_COUNTER);
  const result = await initProject(root, { title: "CLI test (delete me)", description: DESCRIPTION });
  const file = await written(root);
  assert.equal(file.genre, FALLBACK_GENRE, "init left genre for the next command to refuse");
  assert.deepEqual(result.needs, []);
  assert.match(result.message, new RegExp(`Genre: init could not tell the genre from the title and description, so it set ${FALLBACK_GENRE} for now\\.`));
  assert.match(result.message, /Choose the real one on your deploy's page after opengame deploy/);
  assert.match(result.message, /change genre in opengame\.json/);
  // What `opengame check` reads first: the file init wrote has to pass it.
  await loadManifest(root);
}));

test("the guess reads package.json keywords and the page's own description too", async () => {
  await fixture(async root => {
    await writeFile(join(root, "index.html"), TAP_COUNTER);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "x", keywords: ["kart", "racing"] }));
    const result = await initProject(root, { title: "Lap one", description: DESCRIPTION });
    assert.equal(result.manifest.genre, "racing-sports");
    assert.doesNotMatch(result.message, /could not tell the genre/);
  });
  await fixture(async root => {
    await writeFile(join(root, "index.html"), TAP_COUNTER.replace("<title>", `<meta name="description" content="A tiny platformer: run and jump."><title>`));
    assert.equal((await initProject(root, { title: "Hop", description: DESCRIPTION })).manifest.genre, "platformer");
  });
});

test("a game that only listens for taps is written down as mouse, not keyboard and mouse", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), TAP_COUNTER);
  const result = await initProject(root, { title: "CLI test (delete me)", description: DESCRIPTION, genre: "puzzle-casual" });
  assert.deepEqual(result.manifest.controls, ["mouse"]);
  assert.match(result.message, /Controls: mouse or touch, found in your source\./);
}));

test("controls come from the game's own source files, and a runtime beside a .wasm is not evidence", async () => {
  // Keyboard only, in a Vite-style src folder.
  await fixture(async root => {
    await writeFile(join(root, "index.html"), `<!doctype html><title>Keys</title><script type="module" src="/src/main.ts"></script>`);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "main.ts"), `window.addEventListener("keydown", event => { if (event.key === "ArrowLeft") move(-1); });`);
    assert.deepEqual((await initProject(root, { title: "Keys", description: DESCRIPTION, genre: "puzzle-casual" })).manifest.controls, ["keyboard"]);
  });
  // Touch and a controller.
  await fixture(async root => {
    await writeFile(join(root, "index.html"), `<!doctype html><title>Pads</title><script>
      canvas.addEventListener("touchstart", jump); addEventListener("gamepadconnected", () => {}); navigator.getGamepads();</script>`);
    assert.deepEqual((await initProject(root, { title: "Pads", description: DESCRIPTION, genre: "puzzle-casual" })).manifest.controls, ["mouse", "gamepad"]);
  });
  // An engine's glue listens for everything, so a folder holding its .wasm says nothing.
  await fixture(async root => {
    await writeFile(join(root, "index.html"), `<!doctype html><title>Glue</title><script src="lib/game.js"></script>`);
    await mkdir(join(root, "lib"));
    await writeFile(join(root, "lib", "game.js"), `addEventListener("keydown", f); addEventListener("mousedown", f); navigator.getGamepads();`);
    await writeFile(join(root, "lib", "game.wasm"), new Uint8Array([0, 97, 115, 109]));
    const result = await initProject(root, { title: "Glue", description: DESCRIPTION, genre: "puzzle-casual" });
    assert.deepEqual(result.manifest.controls, ["keyboard", "mouse"]);
    assert.match(result.message, /Controls: set to keyboard, mouse, because init found no input handlers to read\./);
  });
});

test("init fills a blank genre and missing controls in an existing opengame.json and keeps what it sets", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), TAP_COUNTER);
  // The draft CLI 0.7.0 wrote, less its controls, with the creator's own title kept.
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "My own title", description: DESCRIPTION, genre: "", kind: "game" }, null, 2));
  const result = await initProject(root, { title: "CLI test (delete me)" });
  const file = await written(root);
  assert.equal(file.title, "My own title", "init replaced a value the file already set");
  assert.equal(file.genre, FALLBACK_GENRE);
  assert.deepEqual(file.controls, ["mouse"]);
  assert.deepEqual(Object.keys(file), ["title", "description", "genre", "kind", "controls"], "the file's own order was not kept");
  assert.match(result.message, /^Filled genre and controls in the existing opengame\.json and left everything else as it was\./);
  assert.match(result.message, /init did not use --title, because it only fills what the file leaves blank\./);
  await loadManifest(root);
  // A second run has nothing left to fill, so it is refused as an existing file always was.
  await assert.rejects(initProject(root, {}), { code: "manifest_exists" });
}));

test("a --genre given for a blank genre is the one written", async () => fixture(async root => {
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: DESCRIPTION, genre: "", controls: ["keyboard"] }));
  const result = await initProject(root, { genre: "shooter-survival" });
  assert.equal((await written(root)).genre, "shooter-survival");
  assert.doesNotMatch(result.message, /could not tell the genre/);
}));

/* Greptile on opengamehq/opengame#6: the fill is written from the file as init read it, so an
   edit saved while a person sat at the genre question was overwritten without a word. The
   name is the one question left (11 Nov 2026), and the same holds for it. */
test("an edit saved to opengame.json while init asks a question is kept, and nothing is written", async () => fixture(async root => {
  const path = join(root, "opengame.json");
  await writeFile(path, JSON.stringify({ title: "", description: DESCRIPTION, genre: "rpg", controls: ["keyboard"] }));
  const edited = JSON.stringify({ title: "", description: DESCRIPTION, genre: "rpg", controls: ["gamepad"] });
  const prompts = {
    ask: async () => { await writeFile(path, edited); return "Night shift"; },
    choose: async () => { throw new Error("init asked a menu"); },
  } as never;
  await assert.rejects(initProject(root, {}, { interactive: true, prompts }), (error: { code: string; message: string }) =>
    error.code === "manifest_changed" && /kept your edits and wrote nothing/.test(error.message));
  assert.equal(await readFile(path, "utf8"), edited, "init wrote over an edit saved during its prompt");
  // With nothing changing underneath, the same answer is written.
  const result = await initProject(root, {}, { interactive: true, prompts: { ask: async () => "Night shift", choose: async () => "rpg" } as never });
  assert.equal(result.manifest.title, "Night shift");
  assert.deepEqual((await written(root)).controls, ["gamepad"]);
}));

/* The owner's call, 11 Nov 2026: the CLI collects the name and nothing else, and the rest is written on
   the deploy's page. A project with no words of its own gets the placeholder, which a deploy
   names provisional so the page asks for the real one before the game can publish. */
test("a folder with no description of its own gets the placeholder, named provisional", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), TAP_COUNTER);
  const result = await initProject(root, { title: "CLI test (delete me)" });
  assert.equal(result.manifest.description, PLACEHOLDER_DESCRIPTION);
  assert.deepEqual(result.needs, [], "the placeholder has to pass the manifest check, or deploy refuses it");
  await loadManifest(root);
  assert.match(result.message, /Description: none yet\. Write it on your deploy's page after opengame deploy/);
  assert.deepEqual(await provisionalFields(root, result.manifest), ["description", "genre"]);
  // Once somebody writes their own, it is theirs.
  assert.deepEqual(await provisionalFields(root, { ...result.manifest, description: DESCRIPTION }), ["genre"]);
}));

test("the project's own words are used for the description when they fit, and never a too-short one", async () => {
  await fixture(async root => {
    await writeFile(join(root, "index.html"), `<!doctype html><title>Pond</title><meta name="description" content="${DESCRIPTION}">`);
    assert.equal((await initProject(root, {})).manifest.description, DESCRIPTION);
  });
  await fixture(async root => {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "pond", description: "A pond." }));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Pond</title>");
    assert.equal((await initProject(root, {})).manifest.description, PLACEHOLDER_DESCRIPTION);
  });
});

test("the deploy's address says what is left to do there, only when something is", async () => {
  const { detailsLine } = await import("../src/deploy");
  assert.equal(detailsLine(undefined), "");
  assert.equal(detailsLine(["controls"]), "", "controls are confirmed on the page anyway, and ask nothing of a person");
  assert.match(detailsLine(["description", "genre"]), /^\nOn that page, write its description and choose its genre, and enter the jam once review passes\./);
  assert.match(detailsLine(["genre"]), /^\nOn that page, choose its genre,/);
});

test("a person at a terminal is asked the name and nothing else, and Enter keeps what init read", async () => {
  await fixture(async root => {
    await writeFile(join(root, "index.html"), "<!doctype html><title>Pond</title><canvas></canvas>");
    const asked: string[] = [];
    const prompts = { ask: async (q: string) => { asked.push(q); return ""; }, choose: async (q: string) => { asked.push(q); return ""; } } as never;
    const result = await initProject(root, {}, { interactive: true, prompts });
    assert.deepEqual(asked, ['Game name (Enter keeps "Pond"):']);
    assert.equal(result.manifest.title, "Pond");
    assert.equal(result.manifest.kind, "game");
  });
  await fixture(async root => {
    await writeFile(join(root, "index.html"), "<!doctype html><title>Pond</title>");
    const answers = ["x".repeat(LIMITS.text.gameTitle.max + 1), "  Lily pond  "];
    const asked: string[] = [];
    const prompts = { ask: async (q: string) => { asked.push(q); return answers.shift()!; }, choose: async () => "" } as never;
    const result = await initProject(root, {}, { interactive: true, prompts });
    assert.equal(asked.length, 2);
    assert.match(asked[1]!, new RegExp(`^Use ${LIMITS.text.gameTitle.productMin} to ${LIMITS.text.gameTitle.max} characters\\.`));
    assert.equal(result.manifest.title, "Lily pond");
  });
  // --title says it, so nothing is asked at all.
  await fixture(async root => {
    const prompts = { ask: async () => { throw new Error("asked"); }, choose: async () => { throw new Error("asked"); } } as never;
    assert.equal((await initProject(root, { title: "Given" }, { interactive: true, prompts })).manifest.title, "Given");
  });
});

/* Review of mirror #7, 12 Nov 2026: the genre was guessed from the name init offered, before
   the person answered, so a folder made as a kart racer and named a dungeon crawler kept
   the racing genre. It is guessed from the name the person settles on. */
test("the genre is guessed from the name the person types, not the one init offered", async () => {
  await fixture(async root => {
    await writeFile(join(root, "index.html"), "<!doctype html><title>Kart Racer</title><canvas></canvas>");
    const prompts = { ask: async () => "Dungeon Crawler", choose: async () => "" } as never;
    const result = await initProject(root, {}, { interactive: true, prompts });
    assert.equal(result.manifest.title, "Dungeon Crawler");
    assert.equal(result.manifest.genre, "rpg");
  });
  // --genre is the person's own word, and a new name does not change it.
  await fixture(async root => {
    await writeFile(join(root, "index.html"), "<!doctype html><title>Kart Racer</title><canvas></canvas>");
    const prompts = { ask: async () => "Dungeon Crawler", choose: async () => "" } as never;
    assert.equal((await initProject(root, { genre: "racing-sports" }, { interactive: true, prompts })).manifest.genre, "racing-sports");
  });
});

test("an opengame.json init cannot read is still refused, not rewritten", async () => fixture(async root => {
  await writeFile(join(root, "opengame.json"), "{ not json");
  await assert.rejects(initProject(root, { genre: "rpg" }), { code: "manifest_exists" });
  assert.equal(await readFile(join(root, "opengame.json"), "utf8"), "{ not json");
}));

test("check says how to set a blank genre, and init's limit on the description is the shared one", async () => fixture(async root => {
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: DESCRIPTION, genre: "", controls: ["keyboard"] }));
  const events: { type: string; finding?: { fix: string; evidence: { observed: string } } }[] = [];
  const output = { emit: (event: (typeof events)[number]) => { events.push(event); } } as unknown as Output;
  await assert.rejects(loadManifest(root, output), { code: "manifest_invalid" });
  const finding = events.find(event => event.finding?.evidence.observed.startsWith("genre:"))?.finding;
  assert.ok(finding, "check named no genre problem");
  assert.match(finding.fix, /Set genre in opengame\.json to one of the slugs above, for example "genre": "puzzle-casual"\./);
  assert.match(finding.fix, /opengame init \S+ --genre <slug>, which fills in a blank genre/);
  // "Tap the screen." was the runbook's description, and init refuses it before writing.
  await fixture(async fresh => {
    const { productMin, max } = LIMITS.text.gameDescription;
    await assert.rejects(initProject(fresh, { title: "CLI test (delete me)", description: "Tap the screen." }), (error: { code: string; message: string }) =>
      error.code === "manifest_invalid" && /^description: /.test(error.message) && error.message.includes(String(productMin)) && error.message.includes(String(max)));
  });
}));

/* The Drop and GitHub uploads name a placeholder in the deploy's `provisional`, so review
   never takes it for the creator's word. init's fallback genre and its undetected controls
   are placeholders too, and a deploy names them while the file still holds them. */
test("a deploy names init's guesses provisional until somebody changes them", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), "<!doctype html><title>Quiet</title><canvas></canvas>");
  const result = await initProject(root, { title: "Quiet", description: DESCRIPTION });
  assert.deepEqual(await provisionalFields(root, result.manifest), ["genre", "controls"]);
  assert.deepEqual(await provisionalFields(root, { ...result.manifest, genre: "rpg" }), ["controls"], "an edited genre is the creator's");
  assert.deepEqual(await provisionalFields(root, { ...result.manifest, controls: ["keyboard"] }), ["genre"]);
}));

test("what init was told, or read in the source, is never provisional", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), TAP_COUNTER);
  const result = await initProject(root, { title: "CLI test (delete me)", description: DESCRIPTION, genre: "puzzle-casual" });
  assert.deepEqual(await provisionalFields(root, result.manifest), []);
}));

test("a saved deploy that names provisional fields still reads, and a bad one is refused", async () => fixture(async root => {
  const origin = "http://127.0.0.1:4590";
  const manifest = { title: "Night shift", description: DESCRIPTION, genre: FALLBACK_GENRE, controls: ["keyboard", "mouse"] };
  const save = (provisional: unknown) => writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, deploy: { key: "saved-key",
    request: { byteSize: 10, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve", provisional } } }));
  await mkdir(join(root, ".opengame"));
  await save(["genre", "controls"]);
  assert.deepEqual((await readProject(root, origin)).deploy?.request.provisional, ["genre", "controls"]);
  // A guessed title is a provisional field since 13 Nov 2026 (J-astra-E9); a field it does not know is not.
  await save(["title"]);
  assert.deepEqual((await readProject(root, origin)).deploy?.request.provisional, ["title"]);
  await save(["tagline"]);
  await assert.rejects(readProject(root, origin), { code: "project_state" });
}));

test("a minified library or a vendor folder is not the game's input, and one odd file name hides nothing", async () => {
  await fixture(async root => {
    await writeFile(join(root, "index.html"), TAP_COUNTER);
    await mkdir(join(root, "js"));
    await writeFile(join(root, "js", "pixi.min.js"), `addEventListener("keydown",a);navigator.getGamepads();`);
    await mkdir(join(root, "src", "vendor"), { recursive: true });
    await writeFile(join(root, "src", "vendor", "pad.js"), `addEventListener("gamepadconnected", f);`);
    assert.deepEqual((await initProject(root, { title: "Taps", description: DESCRIPTION, genre: "puzzle-casual" })).manifest.controls, ["mouse"]);
  });
  await fixture(async root => {
    await writeFile(join(root, "index.html"), `<!doctype html><title>Keys</title>`);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "main.js"), `addEventListener("keydown", f);`);
    await writeFile(join(root, "src", "100%.js"), `// a name the file helper will not carry`);
    assert.deepEqual((await initProject(root, { title: "Keys", description: DESCRIPTION, genre: "puzzle-casual" })).manifest.controls, ["keyboard"]);
  });
});

test("filling names every flag it did not use, and a symlinked opengame.json is refused untouched", async () => fixture(async root => {
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Isle", description: DESCRIPTION, genre: "", kind: "world", controls: ["mouse"] }));
  const result = await initProject(root, { kind: "mod", "based-on": "Doom", genre: "rpg" });
  assert.equal((await written(root)).kind, "world");
  assert.match(result.message, /init did not use --kind and --based-on, because it only fills what the file leaves blank\./);
  await fixture(async other => {
    const target = join(other, "elsewhere.json");
    await writeFile(target, JSON.stringify({ title: "", genre: "" }));
    await rm(join(root, "opengame.json"));
    await symlink(target, join(root, "opengame.json"));
    await assert.rejects(initProject(root, { genre: "rpg" }), { code: "manifest_exists" });
    assert.equal(await readFile(target, "utf8"), JSON.stringify({ title: "", genre: "" }));
  });
}));

/* Launch E2E, J-opus-E5 and J-astra-E9, 13 Nov 2026: a Phaser game whose page says <title>Game
   Development Assignment</title> was deployed under that name, and Unity's template names every
   page "Unity WebGL Player | <product>". Boilerplate never names a game: the next candidate
   does, here the folder, made readable. A title nobody typed is a guess, and the deploy says
   so, so the deploy's page can offer the name review reads from the game. Drop asks the same
   chooseTitle. */
test("a boilerplate page title loses to the folder, Unity's template keeps the product, and an untyped title is provisional", async () => {
  const named = async (folder: string, page: string, flags: Record<string, string> = {}) => {
    const parent = await mkdtemp(join(tmpdir(), "og-init-title-"));
    const root = join(parent, folder);
    await mkdir(root);
    try {
      await writeFile(join(root, "index.html"), `<!doctype html><title>${page}</title><canvas></canvas>`);
      const result = await initProject(root, { description: DESCRIPTION, genre: "platformer", ...flags });
      return { title: result.manifest.title as string, provisional: await provisionalFields(root, await written(root)) };
    } finally { await rm(parent, { recursive: true, force: true }); }
  };
  const wizard = await named("wizard-of-christchurch", "Game Development Assignment");
  assert.equal(wizard.title, "Wizard of christchurch");
  assert.ok(wizard.provisional.includes("title"));
  assert.equal((await named("build", "Unity WebGL Player | Sliding Puzzle")).title, "Sliding Puzzle");
  assert.equal((await named("x", "PhaserJS 3 Platform Game (The Wizard of Christchurch)")).title, "PhaserJS 3 Platform Game");
  // A typed title is the creator's: kept as typed, and never provisional.
  const typed = await named("x", "index", { title: "Game Development Assignment" });
  assert.equal(typed.title, "Game Development Assignment");
  assert.ok(!typed.provisional.includes("title"));
});

/* Greptile on opengamehq/opengame#9: an existing opengame.json with a blank title is filled from
   the page or the folder too, and that guess was recorded only for a new file, so the deploy sent
   it as the creator's choice. A title typed with --title is not a guess here either. */
test("a blank title that init fills in is provisional, and a typed one is not", async () => {
  for (const [flags, guessed] of [[{}, true], [{ title: "Starfall" }, false]] as const) {
    const parent = await mkdtemp(join(tmpdir(), "og-init-fill-"));
    const root = join(parent, "comet-dodger");
    await mkdir(root);
    try {
      await writeFile(join(root, "index.html"), "<!doctype html><title>Game Development Assignment</title><canvas></canvas>");
      await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "", description: DESCRIPTION, genre: "platformer", controls: ["keyboard"] }));
      await initProject(root, { ...flags });
      const file = await written(root);
      assert.equal(file.title, guessed ? "Comet dodger" : "Starfall");
      assert.equal((await provisionalFields(root, file)).includes("title"), guessed, JSON.stringify(flags));
    } finally { await rm(parent, { recursive: true, force: true }); }
  }
});

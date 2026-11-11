import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS } from "@opengame/shared";
import { FALLBACK_GENRE, initProject, provisionalFields } from "../src/init";
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
  assert.match(result.message, new RegExp(`Genre: init could not tell the genre from the title and description, so it set ${FALLBACK_GENRE}\\.`));
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
  assert.match(result.message, /Controls: set to mouse, from the mouse or touch input in your source\./);
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
  await save(["title"]);
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

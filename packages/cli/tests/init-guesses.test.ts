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
import { autoFields } from "../src/auto";
import { detailsLine, tidyLine } from "../src/deploy";

/**
 * Auto, in init and in every command that reads opengame.json (the owner, 13 Nov 2026: "first
 * option and default should be auto"). A field left out, blank or "auto" is review's to write
 * from the game, and a deploy names it provisional so the deploy's page shows what review wrote
 * for the creator to accept or change. The file name is the suite's older one, from when init
 * guessed these fields itself: what it guessed is what Auto replaced.
 */

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "og-init-auto-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const written = async (root: string) => JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));

/* The test steps' game, as an agent wrote it on 10 Nov 2026: one canvas, one pointerdown listener. */
const TAP_COUNTER = `<!doctype html><html><head><meta charset="utf-8"><title>CLI test (delete me)</title></head>
<body><canvas id="c" width="640" height="360"></canvas>
<script type="module">addEventListener("pointerdown", () => {});</script></body></html>`;
const DESCRIPTION = "A single screen that counts every tap, made to try the OpenGame CLI.";

test("init with no flags writes Auto for every field it collects, and check reads the file", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), TAP_COUNTER);
  const result = await initProject(root, {});
  const file = await written(root);
  for (const field of ["title", "tagline", "description", "genre", "controls"]) assert.equal(file[field], "auto", field);
  assert.deepEqual(result.needs, []);
  assert.match(result.message, /^Created opengame\.json\.\nAuto: title, tagline, description, genre,? and controls\. Leave a field out, blank or "auto" and review writes it from your game; you accept or change it on the deploy's page\./);
  // What `opengame check` reads first: the file init wrote has to pass it, and say what was Auto.
  const manifest = await loadManifest(root);
  assert.equal(manifest.title, "CLI test (delete me)", "an Auto title deploys as the page's own name until review offers its own");
  assert.equal(manifest.description, PLACEHOLDER_DESCRIPTION);
  assert.equal(manifest.genre, FALLBACK_GENRE);
  assert.deepEqual(manifest.controls, ["keyboard", "mouse"]);
  assert.equal("tagline" in manifest, false);
  assert.deepEqual(autoFields(manifest), ["title", "tagline", "description", "genre", "controls"]);
  assert.deepEqual(await provisionalFields(root, manifest), ["title", "description", "genre", "controls"]);
}));

test("a flag says a field, auto in any case is Auto, and a wrong genre lists auto first", async () => fixture(async root => {
  const result = await initProject(root, { title: "Night shift", description: DESCRIPTION, genre: "AUTO" });
  const file = await written(root);
  assert.equal(file.title, "Night shift");
  assert.equal(file.description, DESCRIPTION);
  assert.equal(file.genre, "auto");
  assert.match(result.message, /\nAuto: tagline, genre,? and controls\./);
  assert.deepEqual(await provisionalFields(root, await loadManifest(root)), ["genre", "controls"]);
  await fixture(async other => {
    await assert.rejects(initProject(other, { genre: "space" }), (error: { code: string; message: string }) =>
      error.code === "genre_invalid" && error.message.startsWith("Choose --genre from auto, "));
  });
}));

test("a person at a terminal is asked the name and nothing else, and Enter takes Auto", async () => {
  await fixture(async root => {
    await writeFile(join(root, "index.html"), "<!doctype html><title>Pond</title><canvas></canvas>");
    const asked: string[] = [];
    const prompts = { ask: async (q: string) => { asked.push(q); return ""; }, choose: async (q: string) => { asked.push(q); return ""; } } as never;
    const result = await initProject(root, {}, { interactive: true, prompts });
    assert.deepEqual(asked, ["Game name (Enter for Auto, review names it from your game):"]);
    assert.equal(result.manifest.title, "auto");
    assert.equal(result.manifest.kind, "game");
  });
  await fixture(async root => {
    const answers = ["x".repeat(LIMITS.text.gameTitle.max + 1), "  Lily pond  "];
    const asked: string[] = [];
    const prompts = { ask: async (q: string) => { asked.push(q); return answers.shift()!; }, choose: async () => "" } as never;
    const result = await initProject(root, {}, { interactive: true, prompts });
    assert.equal(asked.length, 2);
    assert.match(asked[1]!, new RegExp(`^Use ${LIMITS.text.gameTitle.productMin} to ${LIMITS.text.gameTitle.max} characters, or press Enter for Auto\\.`));
    assert.equal(result.manifest.title, "Lily pond");
  });
  // "auto" typed is Auto too, and --title says it, so nothing is asked at all.
  await fixture(async root => {
    const prompts = { ask: async () => "Auto", choose: async () => "" } as never;
    assert.equal((await initProject(root, {}, { interactive: true, prompts })).manifest.title, "auto");
  });
  await fixture(async root => {
    const prompts = { ask: async () => { throw new Error("asked"); }, choose: async () => { throw new Error("asked"); } } as never;
    assert.equal((await initProject(root, { title: "Given" }, { interactive: true, prompts })).manifest.title, "Given");
  });
});

test("init fills blank fields of an existing opengame.json with Auto and keeps what it sets", async () => fixture(async root => {
  // The draft CLI 0.7.0 wrote, less its controls, with the creator's own title kept.
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "My own title", description: DESCRIPTION, genre: "", kind: "game" }, null, 2));
  const result = await initProject(root, { title: "CLI test (delete me)" });
  const file = await written(root);
  assert.equal(file.title, "My own title", "init replaced a value the file already set");
  assert.equal(file.genre, "auto");
  assert.equal(file.controls, "auto");
  assert.deepEqual(Object.keys(file), ["title", "description", "genre", "kind", "controls"], "the file's own order was not kept");
  assert.match(result.message, /^Filled genre and controls in the existing opengame\.json and left everything else as it was\./);
  assert.match(result.message, /init did not use --title, because it only fills what the file leaves blank\./);
  await loadManifest(root);
  // A second run has nothing left to fill, so it is refused as an existing file always was.
  await assert.rejects(initProject(root, {}), { code: "manifest_exists" });
  // A --genre given for a blank genre is the one written.
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: DESCRIPTION, genre: "", controls: ["keyboard"] }));
  await initProject(root, { genre: "shooter-survival" });
  assert.equal((await written(root)).genre, "shooter-survival");
}));

/* Greptile on opengamehq/opengame#6: the fill is written from the file as init read it, so an
   edit saved while a person sat at the question was overwritten without a word. */
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
  const result = await initProject(root, {}, { interactive: true, prompts: { ask: async () => "Night shift", choose: async () => "rpg" } as never });
  assert.equal(result.manifest.title, "Night shift");
  assert.deepEqual((await written(root)).controls, ["gamepad"]);
}));

test("an opengame.json init cannot read is still refused, and a blank genre is Auto to check", async () => fixture(async root => {
  await writeFile(join(root, "opengame.json"), "{ not json");
  await assert.rejects(initProject(root, { genre: "rpg" }), { code: "manifest_exists" });
  assert.equal(await readFile(join(root, "opengame.json"), "utf8"), "{ not json");
  // What used to be refused as a missing genre is Auto now.
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: DESCRIPTION, genre: "", controls: ["keyboard"] }));
  assert.deepEqual(autoFields(await loadManifest(root)), ["tagline", "genre"]);
  // A wrong slug is still the creator's to fix, and the fix names Auto.
  await writeFile(join(root, "opengame.json"), JSON.stringify({ title: "Night shift", description: DESCRIPTION, genre: "space", controls: ["keyboard"] }));
  await assert.rejects(loadManifest(root), (error: { message: string }) => /genre/.test(error.message));
  // "Tap the screen." was the runbook's description, and init refuses it before writing.
  await fixture(async fresh => {
    const { productMin, max } = LIMITS.text.gameDescription;
    await assert.rejects(initProject(fresh, { title: "CLI test (delete me)", description: "Tap the screen." }), (error: { code: string; message: string }) =>
      error.code === "manifest_invalid" && /^description: /.test(error.message) && error.message.includes(String(productMin)) && error.message.includes(String(max)));
  });
}));

test("what the creator wrote is never provisional, and the placeholder always is", async () => fixture(async root => {
  await initProject(root, { title: "CLI test (delete me)", description: DESCRIPTION, genre: "puzzle-casual" });
  const file = await written(root);
  assert.deepEqual(await provisionalFields(root, { ...file, controls: ["mouse"] }), []);
  assert.deepEqual(await provisionalFields(root, { ...file, controls: ["mouse"], description: PLACEHOLDER_DESCRIPTION }), ["description"]);
}));

/* A folder an older CLI set up still holds its record of what it guessed. */
test("an older CLI's recorded guesses are still provisional until somebody changes them", async () => fixture(async root => {
  await mkdir(join(root, ".opengame"));
  await writeFile(join(root, ".opengame", "init-guesses.json"), JSON.stringify({ genre: FALLBACK_GENRE, controls: ["keyboard", "mouse"], title: "Quiet" }));
  const manifest = { title: "Quiet", description: DESCRIPTION, genre: FALLBACK_GENRE, controls: ["keyboard", "mouse"] };
  assert.deepEqual(await provisionalFields(root, manifest), ["genre", "controls", "title"]);
  assert.deepEqual(await provisionalFields(root, { ...manifest, genre: "rpg", title: "Loud" }), ["controls"], "an edited field is the creator's");
}));

test("a saved deploy that names provisional fields still reads, and a bad one is refused", async () => fixture(async root => {
  const origin = "http://127.0.0.1:4590";
  const manifest = { title: "Night shift", description: DESCRIPTION, genre: FALLBACK_GENRE, controls: ["keyboard", "mouse"] };
  const save = (provisional: unknown) => writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, deploy: { key: "saved-key",
    request: { byteSize: 10, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve", provisional } } }));
  await mkdir(join(root, ".opengame"));
  await save(["genre", "controls", "title", "description"]);
  assert.deepEqual((await readProject(root, origin)).deploy?.request.provisional, ["genre", "controls", "title", "description"]);
  // An Auto tagline is no tagline in the manifest, so it is never a provisional field.
  await save(["tagline"]);
  await assert.rejects(readProject(root, origin), { code: "project_state" });
}));

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

/* Launch E2E, J-opus-E5 and J-astra-E9, 13 Nov 2026: a page titled "Game Development
   Assignment" deployed under that name. An Auto title deploys as Drop's chooseTitle reads it,
   which never takes boilerplate, and review offers the game's own name on the deploy's page. */
test("an Auto title deploys as the name the page or the folder gives, never boilerplate", async () => {
  const named = async (folder: string, page: string) => {
    const parent = await mkdtemp(join(tmpdir(), "og-init-title-"));
    const root = join(parent, folder);
    await mkdir(root);
    try {
      await writeFile(join(root, "index.html"), `<!doctype html><title>${page}</title><canvas></canvas>`);
      await initProject(root, { description: DESCRIPTION, genre: "platformer" });
      return (await loadManifest(root)).title;
    } finally { await rm(parent, { recursive: true, force: true }); }
  };
  assert.equal(await named("wizard-of-christchurch", "Game Development Assignment"), "Wizard of christchurch");
  assert.equal(await named("build", "Unity WebGL Player | Sliding Puzzle"), "Sliding Puzzle");
  assert.equal(await named("x", "PhaserJS 3 Platform Game (The Wizard of Christchurch)"), "PhaserJS 3 Platform Game");
});

test("the deploy's address says what review writes, only when something is Auto", () => {
  assert.equal(detailsLine(undefined), "");
  assert.equal(detailsLine(["controls"]), "", "controls are confirmed on the page anyway, and ask nothing of a person");
  assert.match(detailsLine(["title", "description", "genre"]), /^\nReview writes its name, description,? and genre from the game\. On that page, check what it wrote once review passes/);
  assert.match(detailsLine(["genre"]), /^\nReview writes its genre from the game\./);
});

test("the deploy says how review will tidy the words the creator typed, and nothing for Auto or tidy words", () => {
  const line = tidyLine({ title: "my COOL game!!", description: "its about jumping over spikes  , and i love it!!" }, []);
  assert.ok(line);
  assert.match(line, /title: "my COOL game!!" reads "My Cool Game!"/);
  assert.match(line, /description: "its about jumping over spikes {2}, and i love it!!" reads "Its about jumping over spikes, and I love it!"/);
  assert.equal(tidyLine({ title: "Tide Runner", description: "Race the rain to the river." }, []), null);
  assert.equal(tidyLine({ title: "my game", description: PLACEHOLDER_DESCRIPTION }, ["title", "description"]), null);
});

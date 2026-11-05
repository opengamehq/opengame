import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GAME_KINDS, LIMITS } from "@opengame/shared";
import { ensureDeployManifest, initProject, kindPhrase, type InitPrompts } from "../src/init";
import { loadManifest } from "../src/files";
import { readProject } from "../src/project";
import { refuseJamKind } from "../src/submit";
import type { PromptOption } from "../src/prompt";

/**
 * Every upload is a game, a world, a decomp or a mod (packages/shared/game-kinds.json).
 * init asks a person which, with game already selected, and takes --kind and --based-on
 * from everybody else; a decomp or a mod has to name the game it is made from.
 */

const metadata = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival" };
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "og-kinds-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const written = async (root: string) => JSON.parse(await readFile(join(root, "opengame.json"), "utf8"));

/** Answers init's questions in order, and keeps what each one offered. */
function scripted(answers: Array<string | ((options: PromptOption[], initial: number) => string)>) {
  const asked: { kind: "choose" | "ask"; question: string; options?: PromptOption[]; initial?: number }[] = [];
  const next = (options: PromptOption[] = [], initial = 0) => {
    const answer = answers.shift();
    if (answer === undefined) throw new Error(`init asked more than the script answers: ${asked.at(-1)?.question}`);
    return typeof answer === "function" ? answer(options, initial) : answer;
  };
  const prompts: InitPrompts = {
    choose: async (question, options, initial = 0) => { asked.push({ kind: "choose", question, options, initial }); return next(options, initial); },
    ask: async question => { asked.push({ kind: "ask", question }); return next(); },
  };
  return { prompts, asked, left: answers };
}
// Pressing Enter on a menu takes whatever the cursor starts on.
const enter = (options: PromptOption[], initial: number) => options[initial]!.value;

test("every new opengame.json says its kind, and it is a game unless somebody says otherwise", async () => fixture(async root => {
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.kind, "game");
  assert.equal("basedOn" in result.manifest, false);
  const file = await written(root);
  // Beside genre, where a person reading the file looks for what the game is.
  assert.deepEqual(Object.keys(file).slice(0, 6), ["$schema", "title", "description", "genre", "kind", "controls"]);
  assert.match(result.message, /^Created opengame\.json\.\n/);
  assert.equal((await loadManifest(root)).kind, "game");
}));

test("--kind and --based-on write the slug and the name as the manifest wants them", async () => {
  await fixture(async root => {
    const result = await initProject(root, { ...metadata, kind: "world" });
    assert.equal((await written(root)).kind, "world");
    assert.match(result.message, /^Created opengame\.json for a world\.\n/);
  });
  // The flag forgives case and spacing; the file holds the lowercase slug and a tidy name.
  await fixture(async root => {
    const result = await initProject(root, { ...metadata, kind: "MOD", "based-on": "  Doom   II  " });
    const file = await written(root);
    assert.deepEqual([file.kind, file.basedOn], ["mod", "Doom II"]);
    assert.match(result.message, /^Created opengame\.json for a mod of Doom II\.\n/);
    assert.equal((await loadManifest(root)).basedOn, "Doom II");
  });
});

test("a kind outside the four is refused, naming them, before a file exists", async () => fixture(async root => {
  await assert.rejects(initProject(root, { ...metadata, kind: "remix" }), (error: { code: string; message: string; exitCode: number }) =>
    error.code === "kind_invalid" && error.exitCode === 2 && /game, world, decomp, mod/.test(error.message));
  await assert.rejects(readFile(join(root, "opengame.json")), { code: "ENOENT" });
}));

test("a decomp or a mod without --based-on is refused when nobody is there to ask", async () => fixture(async root => {
  for (const kind of ["mod", "decomp"]) {
    await assert.rejects(initProject(root, { ...metadata, kind }), (error: { code: string; message: string; exitCode: number }) =>
      error.code === "based_on_required" && error.exitCode === 2 && error.message.includes(`--kind ${kind} --based-on`));
  }
  // deploy makes a missing manifest the same way, with nobody to ask either.
  await assert.rejects(ensureDeployManifest(root, { ...metadata, kind: "mod" }), { code: "based_on_required" });
  await assert.rejects(readFile(join(root, "opengame.json")), { code: "ENOENT" });
}));

test("--based-on for a game, a world, or with no kind at all is refused rather than guessed", async () => fixture(async root => {
  for (const flags of [{ kind: "game" }, { kind: "world" }, {}]) {
    await assert.rejects(initProject(root, { ...metadata, ...flags, "based-on": "Doom" }), (error: { code: string; message: string }) =>
      error.code === "based_on_invalid" && /only for a decomp or a mod/.test(error.message) && /--kind decomp or --kind mod/.test(error.message));
  }
  await assert.rejects(initProject(root, { ...metadata, kind: "mod", "based-on": "x".repeat(LIMITS.text.gameBasedOn.max + 1) }),
    (error: { code: string; message: string }) => error.code === "based_on_invalid" && error.message.includes(String(LIMITS.text.gameBasedOn.max)));
  await assert.rejects(initProject(root, { ...metadata, kind: "mod", "based-on": "   " }), { code: "based_on_required" });
  await assert.rejects(readFile(join(root, "opengame.json")), { code: "ENOENT" });
}));

test("deploy writes a missing manifest with the kind it was given", async () => fixture(async root => {
  await ensureDeployManifest(root, { ...metadata, kind: "decomp", "based-on": "Super Mario 64" });
  const file = await written(root);
  assert.deepEqual([file.kind, file.basedOn], ["decomp", "Super Mario 64"]);
  // And a manifest that is already there is left alone, kind flags included.
  assert.equal(await ensureDeployManifest(root, { ...metadata, kind: "nonsense" }), null);
}));

test("a person sees all four kinds with game selected, and Enter makes a game", async () => fixture(async root => {
  const script = scripted([enter]);
  const result = await initProject(root, metadata, { interactive: true, prompts: script.prompts });
  const question = script.asked.find(entry => entry.question === "What are you making?");
  assert.ok(question, "init asks what the upload is");
  assert.deepEqual(question.options!.map(option => option.value), ["game", "world", "decomp", "mod"]);
  assert.deepEqual(question.options!.map(option => option.label), GAME_KINDS.map(kind => kind.label));
  assert.deepEqual(question.options!.map(option => option.hint), GAME_KINDS.map(kind => kind.help));
  assert.equal(question.options![question.initial!]!.value, "game");
  assert.equal(result.manifest.kind, "game");
  assert.equal(script.left.length, 0);
}));

test("a person is asked what they are making first, a mod which game until it names one, then the rest", async () => fixture(async root => {
  // No description and no genre flag, so every question comes up, in this order: the kind
  // and its source before the description and genre, since they change how those read.
  const script = scripted([
    "mod",
    "",
    "x".repeat(LIMITS.text.gameBasedOn.max + 1),
    "  Doom  ",
    "A blue palette and three new levels for an old shooter, made for a weekend.",
    "shooter-survival",
  ]);
  const result = await initProject(root, { title: "Doom but blue" }, { interactive: true, prompts: script.prompts });
  assert.deepEqual(script.asked.map(entry => entry.kind), ["choose", "ask", "ask", "ask", "ask", "choose"]);
  assert.equal(script.asked[0]!.question, "What are you making?");
  assert.equal(script.asked[1]!.question, "Which game does this mod change?");
  assert.match(script.asked[2]!.question, /^A mod needs the name of the game it is made from\. Which game does this mod change\?$/);
  assert.match(script.asked[3]!.question, new RegExp(`^That is too long\\. Use up to ${LIMITS.text.gameBasedOn.max} characters\\.`));
  assert.match(script.asked[4]!.question, /^Describe the mod in a sentence or two /, "the description is asked of what it is");
  assert.equal(script.asked[5]!.question, "Which genre fits best?");
  assert.deepEqual([result.manifest.kind, result.manifest.basedOn], ["mod", "Doom"]);
  assert.match(result.message, /^Created opengame\.json for a mod of Doom\./);
}));

test("the description question names the kind chosen, and a game is still 'the game'", async () => {
  for (const [kind, noun] of [["world", "world"], ["game", "game"]] as const) {
    await fixture(async root => {
      const script = scripted([kind, "A small island to wander at dusk, with nothing to win and lots to see.", "puzzle-casual"]);
      await initProject(root, { title: "Dusk" }, { interactive: true, prompts: script.prompts });
      assert.equal(script.asked[0]!.question, "What are you making?");
      assert.match(script.asked[1]!.question, new RegExp(`^Describe the ${noun} in a sentence or two \\(`), kind);
    });
  }
});

test("a person who gave --kind is not asked it again, only for what is missing", async () => {
  await fixture(async root => {
    const script = scripted(["Super Mario 64"]);
    const result = await initProject(root, { ...metadata, kind: "decomp" }, { interactive: true, prompts: script.prompts });
    assert.deepEqual(script.asked.map(entry => entry.question), ["Which game is this a decomp of?"]);
    assert.equal(result.manifest.basedOn, "Super Mario 64");
  });
  await fixture(async root => {
    const script = scripted([]);
    await initProject(root, { ...metadata, kind: "mod", "based-on": "Doom" }, { interactive: true, prompts: script.prompts });
    assert.equal(script.asked.length, 0);
  });
  // Flags are refused before anything is asked, so a person is not walked through
  // questions for a command that was always going to fail.
  await fixture(async root => {
    const script = scripted([]);
    await assert.rejects(initProject(root, { title: "Doom but blue", "based-on": "Doom" }, { interactive: true, prompts: script.prompts }), { code: "based_on_invalid" });
    assert.equal(script.asked.length, 0);
  });
});

test("an existing opengame.json is refused before any kind is asked", async () => fixture(async root => {
  await writeFile(join(root, "opengame.json"), JSON.stringify({ ...metadata, controls: ["keyboard"] }));
  const script = scripted([]);
  await assert.rejects(initProject(root, metadata, { interactive: true, prompts: script.prompts }), { code: "manifest_exists" });
  assert.equal(script.asked.length, 0);
}));

/* Released CLIs (0.3.2 and before) never wrote a kind. Their manifests, and the deploy
   requests they saved in .opengame/project.json, must still read: absent is a game. */
test("a manifest and a saved deploy with no kind still read", async () => fixture(async root => {
  const manifest = { ...metadata, controls: ["keyboard", "mouse"] };
  await writeFile(join(root, "opengame.json"), JSON.stringify(manifest));
  assert.equal((await loadManifest(root)).kind, undefined);
  const origin = "http://127.0.0.1:4590";
  await mkdir(join(root, ".opengame"));
  await writeFile(join(root, ".opengame", "project.json"), JSON.stringify({ version: 1, origin, deploy: { key: "saved-key",
    request: { byteSize: 10, fileCount: 1, sha256: "a".repeat(64), manifest, metadataRevision: null, metadata: "preserve" } } }));
  assert.deepEqual((await readProject(root, origin)).deploy?.request.manifest, manifest);
}));

test("the jam refuses a decomp or a mod from its opengame.json, and takes the rest", () => {
  for (const manifest of [null, {}, { kind: "game" as const }, { kind: "world" as const }]) assert.doesNotThrow(() => refuseJamKind(manifest));
  assert.throws(() => refuseJamKind({ kind: "mod", basedOn: "Doom" }), (error: { code: string; message: string; exitCode: number }) =>
    error.code === "kind_not_in_jam" && error.exitCode === 2 && /^opengame\.json says this is a mod of Doom\. The jam takes games and worlds\./.test(error.message)
    && /Nothing was submitted\.$/.test(error.message));
  assert.throws(() => refuseJamKind({ kind: "decomp", basedOn: "Super Mario 64" }), /a decomp of Super Mario 64/);
});

test("what init and deploy print says the kind, and says nothing for a game", () => {
  assert.equal(kindPhrase("game", null), null);
  assert.equal(kindPhrase(undefined, undefined), null);
  assert.equal(kindPhrase("world", null), "a world");
  assert.equal(kindPhrase("mod", "Doom"), "a mod of Doom");
  // A name beside a kind that takes none is not repeated as if it applied.
  assert.equal(kindPhrase("world", "Doom"), "a world");
});

/* Launch plan, "Games pages": a curated list of source games with Other. init writes the
   curated title for a source it recognises, from the flag and from the question alike, and
   keeps anything else as typed. */
test("a recognised source is written as the game's own title", async () => fixture(async root => {
  const sm64 = await initProject(root, { ...metadata, kind: "decomp", "based-on": "sm64" });
  assert.equal(sm64.manifest.basedOn, "Super Mario 64");
}));

test("a source not on the list is written as typed", async () => fixture(async root => {
  const indie = await initProject(root, { ...metadata, kind: "mod", "based-on": "My Friend's Game" });
  assert.equal(indie.manifest.basedOn, "My Friend's Game");
}));

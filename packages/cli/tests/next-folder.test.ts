// Area F, 1 Nov 2026: every "Next:" line said "." whatever folder had been named, so
// `opengame check games/coil` suggested `opengame dev .`, which runs the wrong folder.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { folderArgument } from "../src/files";

const exec = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

test("the folder is said the way it was typed, from where the command ran", () => {
  assert.equal(folderArgument("/work/game", "/work/game"), ".");
  assert.equal(folderArgument("/work/games/coil", "/work"), "games/coil");
  assert.equal(folderArgument("/work/game", "/work/games/coil"), "../../game");
  assert.equal(folderArgument("/work/My Game", "/work"), "'My Game'");
  assert.equal(folderArgument("/work/it's", "/work"), "'it'\\''s'");
  assert.equal(folderArgument("/tmp/og-empty-x", "/home/me/code/games/coil"), "/tmp/og-empty-x", "a long climb is said as the folder's own path");
});

test("check, init and a missing manifest name the folder they were given", async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "og-next-")));
  try {
    await mkdir(join(parent, "coil"));
    await writeFile(join(parent, "coil/index.html"), "<!doctype html><title>Coil</title><canvas></canvas>");
    const env = { ...process.env, OPENGAME_API_URL: "http://127.0.0.1:9", OPENGAME_DEBUG: "0" };
    const run = (...args: string[]) => exec(process.execPath, [binary, ...args, "--json"], { cwd: parent, env }).then(r => JSON.parse(r.stdout), (e: { stdout: string }) => JSON.parse(e.stdout));
    assert.equal((await run("check", "coil")).next, "opengame init coil");
    const init = await run("init", "coil", "--title", "Coil", "--description", "Steer the snake to the food and grow without biting yourself.", "--genre", "puzzle-casual", "--kind", "game");
    assert.equal(init.data.next, "opengame check coil");
    const check = await run("check", "coil");
    assert.equal(check.data.next, "opengame dev coil");
    assert.match(check.data.message, /Next: opengame dev coil to play it locally, then opengame deploy coil for a private preview\./);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

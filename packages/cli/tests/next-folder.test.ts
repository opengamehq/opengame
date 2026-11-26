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

test("on Windows a folder is double-quoted, which cmd.exe, PowerShell and Git Bash all read", () => {
  assert.equal(folderArgument("C:\\Users\\ana\\games\\coil", "C:\\Users\\ana", "win32"), '"games\\coil"');
  assert.equal(folderArgument("C:\\Users\\ana", "C:\\Users\\ana", "win32"), ".");
  assert.equal(folderArgument("D:\\My Games\\coil", "C:\\Users\\ana", "win32"), '"D:\\My Games\\coil"');
  assert.equal(folderArgument("/home/user/games/my game", "/home/user", "linux"), "'games/my game'");
});

/* libuv lists every reparse point as a link on Windows; OneDrive puts one on each file it
   syncs. entryType asks lstat and the real path again, there only (files.ts). */
test("on Windows a listed link is asked again: a OneDrive file is a file, a junction elsewhere is a link", async () => {
  const { entryType } = await import("../src/files");
  const dirent = (name: string, link: boolean) => ({ name, isFile: () => !link, isDirectory: () => false, isSymbolicLink: () => link }) as never;
  const stat = (kind: "file" | "dir" | "link") => ({ isFile: () => kind === "file", isDirectory: () => kind === "dir", isSymbolicLink: () => kind === "link" });
  const fs = (kind: "file" | "dir" | "link", real: (path: string) => string = path => path) =>
    ({ lstat: async () => stat(kind), realpath: async (path: string) => real(path) }) as never;
  const dir = "C:\\Users\\ana\\OneDrive\\game";
  assert.deepEqual(await entryType(dir, dirent("index.html", true), "win32", fs("file")), { isFile: true, isDirectory: false, isLink: false });
  assert.deepEqual(await entryType(dir, dirent("assets", true), "win32", fs("dir")), { isFile: false, isDirectory: true, isLink: false });
  // The real path is the same file whatever case the disk spells it in.
  assert.deepEqual(await entryType(dir, dirent("INDEX.html", true), "win32", fs("file", path => path.replace("INDEX", "index"))), { isFile: true, isDirectory: false, isLink: false });
  assert.deepEqual(await entryType(dir, dirent("linked", true), "win32", fs("link")), { isFile: false, isDirectory: false, isLink: true });
  // A junction lstat reports as a plain folder (one aimed at \??\Volume{GUID}\...): its real path is elsewhere.
  assert.deepEqual(await entryType(dir, dirent("assets", true), "win32", fs("dir", path => path.endsWith("assets") ? "D:\\secret" : path)), { isFile: false, isDirectory: false, isLink: true });
  // Everywhere else the listing is the answer, and nothing is asked.
  const asked = { lstat: async () => { throw new Error("asked"); }, realpath: async () => { throw new Error("asked"); } } as never;
  assert.deepEqual(await entryType("/home/user/game", dirent("linked", true), "linux", asked), { isFile: false, isDirectory: false, isLink: true });
  assert.deepEqual(await entryType(dir, dirent("index.html", false), "win32", asked), { isFile: true, isDirectory: false, isLink: false });
});

test("on Windows a folder PowerShell would expand or splat is quoted so it reads as written", () => {
  assert.equal(folderArgument("C:\\Users\\ana\\$dev", "C:\\Users\\ana", "win32"), "'$dev'");
  assert.equal(folderArgument("C:\\Users\\ana\\@game", "C:\\Users\\ana", "win32"), '"@game"');
  assert.equal(folderArgument("C:\\Users\\ana\\coil", "C:\\Users\\ana", "win32"), "coil");
});

/* The Windows path of the listing still refuses a real link: lstat says so there too. */
test("with Windows' listing check switched on, a real symlink in a build is still refused", async () => {
  const { collectFiles } = await import("../src/files");
  const { symlink } = await import("node:fs/promises");
  const root = await realpath(await mkdtemp(join(tmpdir(), "og-win-link-")));
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    await writeFile(join(root, "index.html"), "<!doctype html>");
    await mkdir(join(root, "outside"));
    await writeFile(join(root, "outside/secret.txt"), "secret");
    await mkdir(join(root, "game"));
    await writeFile(join(root, "game/index.html"), "<!doctype html>");
    await symlink(join(root, "outside"), join(root, "game/assets"));
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    await assert.rejects(collectFiles(join(root, "game")), { code: "symlink" });
  } finally { Object.defineProperty(process, "platform", platform); await rm(root, { recursive: true, force: true }); }
});

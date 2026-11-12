import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Output } from "../src/output";
import { build, commandNotFound } from "../src/deploy";
import { lockfileInstall, missingDependencies } from "../src/build-output";

/* On 11 Nov 2026 `opengame deploy` on a fresh clone of a Vite game ran `npm run build` and
   stopped at "sh: vite: command not found", exit 127. These run the real build runner against
   a fake package manager on PATH, so nothing touches the network and the install is visible. */

type Event = { type: string; stage?: string; message?: string; finding?: { evidence: { observed: string }; fix: string } };

/** A project folder. It has a .git, so the lockfile search stops there rather than finding
 * one somewhere above the temporary folder. */
async function project(t: import("node:test").TestContext, files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "og-build-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".git"));
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), text);
  }
  return root;
}

/** A package manager called `name` that records its arguments and installs `installs`, or
 * prints a failure and exits `fail`. Prepended to PATH for this test only. */
async function fakeManager(t: import("node:test").TestContext, name: string, installs: string[], fail?: number) {
  const bin = await mkdtemp(join(tmpdir(), "og-fake-pm-"));
  const log = join(bin, "calls.log");
  const lines = ["#!/bin/sh", `echo "$*" >> '${log}'`];
  if (fail !== undefined) lines.push("echo 'npm ERR! synthetic install failure' >&2", `exit ${fail}`);
  for (const pkg of installs) lines.push(`mkdir -p node_modules/${pkg} && echo '{"name":"${pkg}"}' > node_modules/${pkg}/package.json`);
  await writeFile(join(bin, name), lines.join("\n") + "\n");
  await chmod(join(bin, name), 0o755);
  const before = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${before}`;
  t.after(async () => { process.env.PATH = before; await rm(bin, { recursive: true, force: true }); });
  return { calls: () => readFile(log, "utf8").catch(() => "") };
}

/** No setting that would make an install leave devDependencies out, unless a test sets one. */
function plainEnvironment(t: import("node:test").TestContext, set: Record<string, string> = {}) {
  const names = ["NODE_ENV", "npm_config_omit", "npm_config_production"];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, set);
  t.after(() => { for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; } });
}

const SKIP = " To build with what is installed, add --no-install.";

function capture() {
  const events: Event[] = [];
  return { events, output: new Output("jsonl", line => events.push(JSON.parse(line) as Event)) };
}

const pkg = (extra: object = {}) => JSON.stringify({ name: "game", scripts: { build: "vite build" }, devDependencies: { "fake-tool": "1.0.0" }, ...extra });

test("a fresh checkout is installed from package-lock.json with npm ci first, and says so", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  const root = await project(t, { "package.json": pkg(), "package-lock.json": "{}" });
  const npm = await fakeManager(t, "npm", ["fake-tool"]);
  const { events, output } = capture();
  await build("test -f node_modules/fake-tool/package.json", root, output);
  assert.equal((await npm.calls()).trim(), "ci");
  const install = events.findIndex(event => event.type === "progress" && event.stage === "install");
  assert.ok(install >= 0, "no install progress event");
  assert.equal(events[install]!.message, "Installing dependencies (npm ci)");
  assert.ok(events.findIndex(event => event.type === "progress" && event.stage === "build") > install, "the build ran before the install");
  // Installed now, so a second build installs nothing.
  await build("true", root, output);
  assert.equal((await npm.calls()).trim(), "ci");
});

test("with no lockfile nothing is installed, and the error names npm install", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  const root = await project(t, { "package.json": pkg() });
  const npm = await fakeManager(t, "npm", ["fake-tool"]);
  const marker = join(root, "built");
  await assert.rejects(build(`touch '${marker}'`, root, capture().output), (error: { code: string; message: string; next?: string; exitCode: number }) => {
    assert.equal(error.code, "dependencies_missing");
    assert.equal(error.message, `Dependencies are not installed. Run npm install, then run opengame deploy again.${SKIP}`);
    assert.equal(error.next, "npm install");
    assert.equal(error.exitCode, 1);
    return true;
  });
  await assert.rejects(build("true", root, capture().output, undefined, { rerun: "opengame check --build" }), /then run opengame check --build again\. To build/);
  assert.equal(await npm.calls(), "", "an install ran without a lockfile");
  await assert.rejects(readFile(marker), "the build ran without its dependencies");
});

test("--no-install builds on whatever is there, and Plug'n'Play counts as installed", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  const root = await project(t, { "package.json": pkg(), "package-lock.json": "{}" });
  const npm = await fakeManager(t, "npm", ["fake-tool"]);
  await build("true", root, capture().output, undefined, { install: false });
  await writeFile(join(root, ".pnp.cjs"), "");
  await build("true", root, capture().output);
  assert.equal(await npm.calls(), "");
});

test("a failed install stops before the build, with its output in the finding", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  const root = await project(t, { "package.json": pkg(), "package-lock.json": "{}" });
  await fakeManager(t, "npm", [], 1);
  const { events, output } = capture();
  await assert.rejects(build("true", root, output), (error: { code: string; next?: string; message: string }) => {
    assert.equal(error.code, "install_failed");
    assert.equal(error.next, "npm ci");
    assert.match(error.message, /npm ci failed/);
    return true;
  });
  const finding = events.find(event => event.type === "finding")?.finding;
  assert.match(finding!.evidence.observed, /synthetic install failure/);
  assert.equal(events.filter(event => event.type === "progress" && event.stage === "build").length, 0);
});

test("a build that exits 127 says the tool is probably not installed and how to install it", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  // Installed as far as package.json goes, so the build runs and meets a missing program.
  const root = await project(t, { "package.json": pkg(), "package-lock.json": "{}", "node_modules/fake-tool/package.json": "{}" });
  await assert.rejects(build("og-tool-that-does-not-exist build", root, capture().output), (error: { code: string; message: string; next?: string; finding?: { fix: string } }) => {
    assert.equal(error.code, "build_failed");
    assert.equal(error.message, "The build could not find og-tool-that-does-not-exist, so the project's dependencies are probably not installed. Run npm install, then run opengame deploy again.");
    assert.equal(error.next, "npm install", "never npm ci, which deletes node_modules first");
    assert.equal(error.finding!.fix, error.message);
    return true;
  });
  const bare = await project(t, {});
  await assert.rejects(build("og-tool-that-does-not-exist build", bare, capture().output), (error: { message: string; next?: string }) => {
    assert.match(error.message, /could not find og-tool-that-does-not-exist, so it is probably not installed on this machine/);
    assert.equal(error.next, undefined);
    return true;
  });
});

/* npm ci deletes node_modules before it installs. Run over a tree that has one, it took linked
   and patched packages with it, left nothing offline, and under NODE_ENV=production installed
   no devDependencies again, so the next build failed on vite again (review, 11 Nov 2026). */
test("a tree that has node_modules is never installed over: the error names what is missing and npm install", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  const devDependencies = Object.fromEntries(["a", "b", "c", "d", "e", "f", "g"].map(name => [`tool-${name}`, "1.0.0"]));
  const root = await project(t, { "package.json": pkg({ devDependencies: { ...devDependencies, present: "1" } }), "package-lock.json": "{}", "node_modules/present/package.json": "{}" });
  const npm = await fakeManager(t, "npm", []);
  await assert.rejects(build("true", root, capture().output, undefined, { rerun: "opengame dev --build" }), (error: { code: string; message: string; next?: string }) => {
    assert.equal(error.code, "dependencies_missing");
    assert.equal(error.message, `tool-a, tool-b, tool-c, tool-d, tool-e and 2 more are in package.json but not installed. Run npm install, then run opengame dev --build again.${SKIP}`);
    assert.equal(error.next, "npm install");
    return true;
  });
  assert.equal(await npm.calls(), "", "an install ran over an existing node_modules");
});

test("a lockfile in a parent folder is a workspace's: nothing is installed, and the error says where to run it", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  const root = await project(t, { "pnpm-lock.yaml": "", "games/one/package.json": pkg() });
  const pnpm = await fakeManager(t, "pnpm", ["fake-tool"]);
  await assert.rejects(build("true", join(root, "games/one"), capture().output), (error: { code: string; message: string; next?: string }) => {
    assert.equal(error.code, "dependencies_missing");
    assert.match(error.message, new RegExp(`lockfile is in ${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, a workspace`));
    assert.match(error.message, /Run pnpm install there, then run opengame deploy again\./);
    assert.equal(error.next, "cd ../.. && pnpm install");
    return true;
  });
  assert.equal(await pnpm.calls(), "");
});

test("when an install would leave out devDependencies it is not run, and the error says why", { skip: process.platform === "win32" }, async t => {
  for (const setting of [{ NODE_ENV: "production" }, { npm_config_omit: "dev" }]) {
    plainEnvironment(t, setting);
    const root = await project(t, { "package.json": pkg(), "package-lock.json": "{}" });
    const npm = await fakeManager(t, "npm", ["fake-tool"]);
    await assert.rejects(build("true", root, capture().output), (error: { code: string; message: string }) => {
      assert.equal(error.code, "dependencies_missing");
      assert.match(error.message, setting.NODE_ENV ? /NODE_ENV is production, so an install leaves out devDependencies such as fake-tool/ : /npm's omit setting includes dev/);
      return true;
    });
    assert.equal(await npm.calls(), "");
  }
});

test("an install that succeeds and still leaves packages out stops before the build", { skip: process.platform === "win32" }, async t => {
  plainEnvironment(t);
  const root = await project(t, { "package.json": pkg(), "package-lock.json": "{}" });
  await fakeManager(t, "npm", []);
  const { events, output } = capture();
  await assert.rejects(build("true", root, output), (error: { code: string; message: string; next?: string }) => {
    assert.equal(error.code, "dependencies_missing");
    assert.match(error.message, /^npm ci finished, but fake-tool is still not installed\./);
    assert.equal(error.next, "npm install");
    return true;
  });
  assert.equal(events.filter(event => event.type === "progress" && event.stage === "build").length, 0);
});

test("each shell's way of saying a program is missing is read", () => {
  assert.deepEqual(commandNotFound(127, "> vite build\n\nsh: vite: command not found\n"), { tool: "vite" });
  assert.deepEqual(commandNotFound(127, "sh: 1: vite: not found\n"), { tool: "vite" });
  assert.deepEqual(commandNotFound(127, "bash: line 1: vite: command not found"), { tool: "vite" });
  assert.deepEqual(commandNotFound(127, "zsh: command not found: vite"), { tool: "vite" });
  assert.deepEqual(commandNotFound(1, "'vite' is not recognized as an internal or external command,\r\noperable program or batch file."), { tool: "vite" });
  assert.deepEqual(commandNotFound(127, "something else"), {});
  assert.equal(commandNotFound(1, "error TS2304: Cannot find name"), undefined);
});

test("the lockfile decides the package manager, its locked install and its adding install", async t => {
  const plan = async (files: Record<string, string>, extra: object = {}) =>
    (await lockfileInstall(await project(t, files), JSON.parse(pkg(extra))))?.command ?? null;
  assert.equal(await plan({ "package-lock.json": "{}" }), "npm ci");
  assert.equal(await plan({ "npm-shrinkwrap.json": "{}" }), "npm ci");
  assert.equal(await plan({ "pnpm-lock.yaml": "" }), "pnpm install --frozen-lockfile");
  assert.equal(await plan({ "yarn.lock": "" }), "yarn install --frozen-lockfile");
  assert.equal(await plan({ "yarn.lock": "", ".yarnrc.yml": "" }), "yarn install --immutable");
  assert.equal(await plan({ "yarn.lock": "" }, { packageManager: "yarn@4.5.0" }), "yarn install --immutable");
  assert.equal(await plan({ "bun.lock": "" }), "bun install --frozen-lockfile");
  assert.equal(await plan({ "bun.lockb": "" }), "bun install --frozen-lockfile");
  assert.equal(await plan({ "package-lock.json": "{}", "pnpm-lock.yaml": "" }), "pnpm install --frozen-lockfile");
  assert.equal(await plan({ "package-lock.json": "{}", "pnpm-lock.yaml": "" }, { packageManager: "npm@10.9.0" }), "npm ci");
  assert.equal(await plan({}), null);
  const adding = await lockfileInstall(await project(t, { "yarn.lock": "" }), {});
  assert.deepEqual([adding?.command, adding?.install], ["yarn install --frozen-lockfile", "yarn install"]);
  // Parent folders up to the one with .git, and not past it.
  const workspace = await project(t, { "bun.lock": "", "inner/.git/HEAD": "", "games/one/package.json": "{}", "inner/game/package.json": "{}" });
  assert.equal((await lockfileInstall(join(workspace, "games/one"), {}))?.folder, workspace);
  assert.equal(await lockfileInstall(join(workspace, "inner/game"), {}), null, "a lockfile above the repository is somebody else's");
});

test("dependencies count as installed when Node would resolve them, hoisted or not", async t => {
  const root = await project(t, { "app/package.json": pkg(), "node_modules/fake-tool/package.json": "{}" });
  assert.equal(await missingDependencies(join(root, "app")), null, "a workspace's hoisted package is installed");
  const lone = await project(t, { "package.json": pkg({ dependencies: { three: "1" } }), "node_modules/three/package.json": "{}" });
  assert.deepEqual((await missingDependencies(lone))?.missing, ["fake-tool"]);
  assert.equal(await missingDependencies(await project(t, { "package.json": JSON.stringify({ scripts: { build: "make" } }) })), null);
  assert.equal(await missingDependencies(await project(t, {})), null);
});

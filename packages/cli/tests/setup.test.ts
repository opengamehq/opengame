import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { binary, cleanEnv, manifest } from "./shell";
import { CLI_VERSION } from "../src/version";
import { afterRefresh } from "../src/setup";

/**
 * `opengame setup` and the refresh every other command runs (src/setup.ts), against the BUILT
 * CLI, in a scratch home: installing the CLI gives the agents on the machine the skills, the
 * first command does it for somebody who never ran setup, an update refreshes them, and edits,
 * removals and the opt-outs are honoured. Every case names its own HOME and XDG_CONFIG_HOME, and
 * cleanEnv drops CLAUDE_CONFIG_DIR and CODEX_HOME, because an inherited one is the developer's
 * real agent folder.
 */
const catalogue: { skills: { name: string; family: string }[] } = JSON.parse(await readFile(new URL("../../skills/skills.json", import.meta.url), "utf8"));
const every = catalogue.skills.filter((skill) => skill.family !== "bundle").map((skill) => skill.name).sort();
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function scratch(t: { after: (fn: () => Promise<void>) => void }, agents: string[] = [".claude"]) {
  const home = await mkdtemp(join(tmpdir(), "og-setup-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (const folder of agents) await mkdir(join(home, folder), { recursive: true });
  return home;
}

/** The CLI in that home. OPENGAME_SKILLS_AUTO is unset, so the refresh runs, unless `extra` says otherwise. */
function run(home: string, args: string[], extra: Record<string, string | undefined> = {}, cwd?: string) {
  const env = cleanEnv({ HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), OPENGAME_SKILLS_AUTO: undefined, OPENGAME_TEST_SKIP_LAUNCH_CHECK: "1", ...extra });
  const result = spawnSync(process.execPath, [binary, ...args, "--jsonl"], { encoding: "utf8", env, cwd });
  const events = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return { status: result.status, events, last: events.at(-1), notices: events.filter((event) => event.type === "notice") };
}

const list = async (path: string) => (await readdir(path).catch(() => [] as string[])).filter((name) => name.startsWith("opengame-")).sort();
const state = async (home: string) => JSON.parse(await readFile(join(home, ".config/opengame/skills.json"), "utf8"));
/** What an older CLI left: every recorded agent at version 0.0.1, so the next command refreshes them. */
async function age(home: string, only?: string[]) {
  const recorded = await state(home);
  for (const [agent, record] of Object.entries(recorded.agents as Record<string, { cli: string }>)) if (!only || only.includes(agent)) record.cli = "0.0.1";
  await writeFile(join(home, ".config/opengame/skills.json"), JSON.stringify(recorded));
}

/** Rewrites an installed skill as an older copy of ours: different bytes, with a marker that matches them. */
async function makeOlder(folder: string) {
  const skill = await readFile(join(folder, "SKILL.md"));
  const older = Buffer.concat([skill, Buffer.from("\nAn older paragraph.\n")]);
  await writeFile(join(folder, "SKILL.md"), older);
  const marker = JSON.parse(await readFile(join(folder, ".opengame-skill.json"), "utf8"));
  marker.files = marker.files.map((file: { path: string; sha256: string }) => file.path === "SKILL.md" ? { ...file, sha256: sha(older) } : file);
  const sorted = [...marker.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  marker.digest = sha(sorted.map((file: { path: string; sha256: string }) => `${file.path}\0${file.sha256}`).join("\n"));
  await writeFile(join(folder, ".opengame-skill.json"), JSON.stringify(marker, null, 2) + "\n");
}

test("setup installs every skill for each agent found in the home folder, and a second run changes nothing", async (t) => {
  const home = await scratch(t, [".claude", ".codex", ".cursor", ".config/opencode"]);
  const first = run(home, ["setup"]);
  assert.equal(first.status, 0, JSON.stringify(first.last));
  assert.deepEqual(first.last.data.agents, ["claude", "codex", "cursor", "opencode"]);
  for (const root of [".claude/skills", ".agents/skills", ".cursor/skills", ".config/opencode/skills"]) {
    assert.deepEqual(await list(join(home, root)), every, root);
    // Every agent reads the SKILL.md folder in its home, Cursor included: no .mdc rules here.
    assert.ok((await stat(join(home, root, "opengame-router", "SKILL.md"))).isFile());
  }
  assert.deepEqual((await readdir(join(home, ".cursor/skills"))).filter((name) => name.endsWith(".mdc")), []);
  assert.equal(first.last.data.counts.installed, every.length * 4);
  assert.match(first.last.data.message, /They update when the CLI does/);
  assert.equal(first.last.data.start, join(home, ".claude/skills/opengame-router/SKILL.md"));
  const recorded = await state(home);
  assert.equal(recorded.format, 2);
  assert.equal(recorded.auto, true);
  assert.deepEqual(Object.keys(recorded.agents), ["claude", "codex", "cursor", "opencode"]);
  for (const record of Object.values(recorded.agents) as { cli: string; skills: string[] }[]) assert.deepEqual({ cli: record.cli, skills: [...record.skills].sort() }, { cli: CLI_VERSION, skills: every });

  const second = run(home, ["setup"]);
  assert.equal(second.status, 0);
  assert.equal(second.last.data.counts.unchanged, every.length * 4);
  assert.equal(second.last.data.counts.installed, 0);
});

test("CLAUDE_CONFIG_DIR moves Claude Code's folder, as it does for Claude Code", async (t) => {
  const home = await scratch(t, []);
  const claude = join(home, "elsewhere");
  await mkdir(claude);
  const result = run(home, ["setup"], { CLAUDE_CONFIG_DIR: claude });
  assert.equal(result.status, 0);
  assert.deepEqual(await list(join(claude, "skills")), every);
  assert.deepEqual(await list(join(home, ".claude/skills")), []);
});

test("with no agent in the home folder, setup installs nothing and says how to name one", async (t) => {
  const home = await scratch(t, []);
  const result = run(home, ["setup"]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.last.data.agents, []);
  assert.match(result.last.data.message, /opengame setup --agent claude/);
  const named = run(home, ["setup", "--agent", "codex"]);
  assert.equal(named.status, 0);
  assert.deepEqual(await list(join(home, ".agents/skills")), every);
});

test("the first command installs the skills for somebody who never ran setup, and says so once", async (t) => {
  const home = await scratch(t);
  const first = run(home, ["skills", "list"]);
  // skills manages skills itself, so it leaves the home folder alone.
  assert.equal(first.status, 0);
  assert.deepEqual(await list(join(home, ".claude/skills")), []);
  const whoami = run(home, ["whoami"]);
  assert.deepEqual(await list(join(home, ".claude/skills")), every);
  const installed = whoami.notices.filter((notice) => notice.code === "skills_installed");
  assert.equal(installed.length, 1, JSON.stringify(whoami.events));
  assert.match(installed[0].message, /^Installed the OpenGame skills for Claude Code \(~\/\.claude\/skills\)\./);
  const again = run(home, ["whoami"]);
  assert.deepEqual(again.notices.filter((notice) => String(notice.code).startsWith("skills_")), []);
});

test("after an update the refresh brings older copies current, keeps edits, and leaves a removed skill removed", async (t) => {
  const home = await scratch(t);
  assert.equal(run(home, ["setup"]).status, 0);
  const root = join(home, ".claude/skills");
  await makeOlder(join(root, "opengame-deploy"));
  await writeFile(join(root, "opengame-cli", "SKILL.md"), "Mine now.\n");
  await rm(join(root, "opengame-jam"), { recursive: true });
  // What an older CLI wrote: the refresh runs once per CLI version.
  await age(home);

  const result = run(home, ["whoami"]);
  assert.match(result.notices.find((notice) => notice.code === "skills_installed")?.message ?? "", /^Updated the OpenGame skills for Claude Code/);
  const expected = await readFile(new URL("../dist/skills/opengame-deploy/SKILL.md", import.meta.url));
  assert.deepEqual(await readFile(join(root, "opengame-deploy", "SKILL.md")), expected);
  assert.equal(await readFile(join(root, "opengame-cli", "SKILL.md"), "utf8"), "Mine now.\n");
  assert.deepEqual(await list(root), every.filter((name) => name !== "opengame-jam"));
  assert.equal((await state(home)).agents.claude.cli, CLI_VERSION);
});

test("setup --no-skills stops the refresh for good, and setup turns it back on", async (t) => {
  const home = await scratch(t);
  const off = run(home, ["setup", "--no-skills"]);
  assert.equal(off.status, 0);
  assert.equal(off.last.data.auto, false);
  run(home, ["whoami"]);
  assert.deepEqual(await list(join(home, ".claude/skills")), []);
  assert.equal(run(home, ["setup"]).status, 0);
  assert.deepEqual(await list(join(home, ".claude/skills")), every);
  assert.equal((await state(home)).auto, true);
});

test("CI and OPENGAME_SKILLS_AUTO=0 leave the agents' folders alone for that run", async (t) => {
  const home = await scratch(t);
  run(home, ["whoami"], { CI: "true" });
  run(home, ["whoami"], { OPENGAME_SKILLS_AUTO: "0" });
  assert.deepEqual(await list(join(home, ".claude/skills")), []);
  run(home, ["whoami"], { CI: "false" });
  assert.deepEqual(await list(join(home, ".claude/skills")), every);
});

test("a command on a project brings that project's older skills up to date and leaves its edits", async (t) => {
  const home = await scratch(t, []);
  const project = await mkdtemp(join(tmpdir(), "og-setup-project-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await writeFile(join(project, "opengame.json"), JSON.stringify(manifest));
  await writeFile(join(project, "index.html"), "<!doctype html><title>Night shift</title><canvas></canvas>");
  assert.equal(run(home, ["skills", "add", project, "--agent", "claude"]).status, 0);
  const root = join(project, ".claude/skills");
  await makeOlder(join(root, "opengame-deploy"));
  await writeFile(join(root, "opengame-router", "SKILL.md"), "My router.\n");

  const result = run(home, ["check", project]);
  assert.equal(result.notices.find((notice) => notice.code === "skills_updated")?.message, "Updated 1 OpenGame skill in this project to the CLI's copy. Edited ones were left as they are.", JSON.stringify(result.events));
  assert.deepEqual(await readFile(join(root, "opengame-deploy", "SKILL.md")), await readFile(new URL("../dist/skills/opengame-deploy/SKILL.md", import.meta.url)));
  assert.equal(await readFile(join(root, "opengame-router", "SKILL.md"), "utf8"), "My router.\n");
  // The refresh updates what is there; it adds nothing to the project.
  assert.ok((await list(root)).length < every.length);
});

test("the project refresh updates each agent's own skills and gives no agent another's", async (t) => {
  const home = await scratch(t, []);
  const project = await mkdtemp(join(tmpdir(), "og-setup-project-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  await writeFile(join(project, "opengame.json"), JSON.stringify(manifest));
  await writeFile(join(project, "index.html"), "<!doctype html><title>Night shift</title><canvas></canvas>");
  assert.equal(run(home, ["skills", "add", project, "--agent", "claude", "--skill", "opengame-deploy"]).status, 0);
  assert.equal(run(home, ["skills", "add", project, "--agent", "codex", "--skill", "opengame-jam"]).status, 0);
  await makeOlder(join(project, ".claude/skills/opengame-deploy"));
  await makeOlder(join(project, ".agents/skills/opengame-jam"));
  const result = run(home, ["check", project]);
  assert.match(result.notices.find((notice) => notice.code === "skills_updated")?.message ?? "", /^Updated 2 OpenGame skills/);
  assert.deepEqual(await list(join(project, ".claude/skills")), ["opengame-deploy"]);
  assert.deepEqual(await list(join(project, ".agents/skills")), ["opengame-jam"]);
});

test("a read-only command leaves a project's skills as they are", async (t) => {
  const home = await scratch(t, []);
  const project = await mkdtemp(join(tmpdir(), "og-setup-project-"));
  t.after(() => rm(project, { recursive: true, force: true }));
  assert.equal(run(home, ["skills", "add", project, "--agent", "claude", "--skill", "opengame-deploy"]).status, 0);
  await makeOlder(join(project, ".claude/skills/opengame-deploy"));
  const before = await readFile(join(project, ".claude/skills/opengame-deploy/SKILL.md"));
  run(home, ["status", project], { OPENGAME_API_URL: "http://127.0.0.1:9" });
  assert.deepEqual(await readFile(join(project, ".claude/skills/opengame-deploy/SKILL.md")), before);
});

test("setup --agent adds to the agents set up before, so a later refresh keeps a removal", async (t) => {
  const home = await scratch(t, [".claude", ".codex"]);
  assert.equal(run(home, ["setup", "--agent", "claude"]).status, 0);
  await rm(join(home, ".claude/skills/opengame-jam"), { recursive: true });
  assert.equal(run(home, ["setup", "--agent", "codex"]).status, 0);
  assert.deepEqual(Object.keys((await state(home)).agents), ["claude", "codex"]);
  await age(home);
  run(home, ["whoami"]);
  assert.deepEqual(await list(join(home, ".claude/skills")), every.filter((name) => name !== "opengame-jam"));
});

/* Greptile on the public mirror, opengamehq/opengame#17: with one version for every agent,
   setup --agent codex after an update marked Claude Code current, and later commands never
   brought its older copies up. Mutation: record attempted agents as every recorded agent in
   afterRefresh, or compare one shared version in refreshSkills. Red here. */
test("setup for one agent after an update leaves the others to the refresh, which brings them current", async (t) => {
  const home = await scratch(t, [".claude", ".codex"]);
  assert.equal(run(home, ["setup"]).status, 0);
  await makeOlder(join(home, ".claude/skills/opengame-deploy"));
  await age(home);
  assert.equal(run(home, ["setup", "--agent", "codex"]).status, 0);
  const between = await state(home);
  assert.equal(between.agents.codex.cli, CLI_VERSION);
  assert.equal(between.agents.claude.cli, "0.0.1");
  const result = run(home, ["whoami"]);
  assert.match(result.notices.find((notice) => notice.code === "skills_installed")?.message ?? "", /Claude Code/);
  assert.deepEqual(await readFile(join(home, ".claude/skills/opengame-deploy/SKILL.md")), await readFile(new URL("../dist/skills/opengame-deploy/SKILL.md", import.meta.url)));
  assert.equal((await state(home)).agents.claude.cli, CLI_VERSION);
});

test("a state file from CLI 0.11.0, one version for every agent, is read as each agent's own", async (t) => {
  const home = await scratch(t, [".claude"]);
  await mkdir(join(home, ".config/opengame"), { recursive: true });
  await writeFile(join(home, ".config/opengame/skills.json"), JSON.stringify({ format: 1, auto: true, cli: "0.0.1", agents: ["claude"], skills: ["opengame-jam"] }));
  run(home, ["whoami"]);
  // opengame-jam was installed before and is not on disk, so the person removed it.
  assert.deepEqual(await list(join(home, ".claude/skills")), every.filter((name) => name !== "opengame-jam"));
  const recorded = await state(home);
  assert.equal(recorded.format, 2);
  assert.equal(recorded.agents.claude.cli, CLI_VERSION);
});

/* Greptile, opengamehq/opengame#17: the refresh wrote back the auto: true it read before
   installing, so a --no-skills saved meanwhile was undone. afterRefresh is what the refresh
   writes, computed from the file as it is at write time under the lock. Mutation: make it
   return auto: true. Red here. */
test("the refresh's write keeps an opt-out saved while it was installing, and every other agent's record", () => {
  const now = { format: 2 as const, auto: false, agents: { codex: { cli: "0.0.1", skills: ["opengame-cli"] } } };
  const next = afterRefresh(now, ["claude"], [{ agent: "claude", name: "opengame-deploy" }, { agent: "codex", name: "opengame-jam" }]);
  assert.equal(next.auto, false);
  assert.deepEqual(next.agents.codex, { cli: "0.0.1", skills: ["opengame-cli"] });
  assert.deepEqual(next.agents.claude, { cli: CLI_VERSION, skills: ["opengame-deploy"] });
  assert.equal(afterRefresh(null, [], []).auto, true);
});

/* Security review, 16 Nov 2026: a repository can carry a `.opengame-staging` beside its agent
   folders that links elsewhere, and the refresh before check reaches the sweep with no install
   asked for. Mutation: drop ownStaging's check in skills.ts. Red here. */
test("the refresh never follows a staging folder that is a link, nor sweeps for a folder it does not write", async (t) => {
  const home = await scratch(t, []);
  const project = await mkdtemp(join(tmpdir(), "og-setup-project-"));
  const victim = await mkdtemp(join(tmpdir(), "og-setup-victim-"));
  t.after(() => Promise.all([rm(project, { recursive: true, force: true }), rm(victim, { recursive: true, force: true })]).then(() => {}));
  for (const name of ["thesis-old-2023", "opengame-deploy-old-99999999", "opengame-deploy.mdc-new-99999998"]) await mkdir(join(victim, name));
  await writeFile(join(project, "opengame.json"), JSON.stringify(manifest));
  await writeFile(join(project, "index.html"), "<!doctype html><title>Night shift</title><canvas></canvas>");
  // A forged marker alone is kept and swept for nothing.
  await mkdir(join(project, ".claude/skills/opengame-router"), { recursive: true });
  await writeFile(join(project, ".claude/skills/opengame-router/.opengame-skill.json"), JSON.stringify({ name: "opengame-router", digest: "x" }));
  await symlink(victim, join(project, ".claude/.opengame-staging"));
  run(home, ["check", project]);
  assert.deepEqual((await readdir(victim)).sort(), ["opengame-deploy-old-99999999", "opengame-deploy.mdc-new-99999998", "thesis-old-2023"]);
  // An older copy that would be written refuses the linked staging folder before anything else.
  await rm(join(project, ".claude/.opengame-staging"));
  assert.equal(run(home, ["skills", "add", project, "--agent", "claude", "--skill", "opengame-deploy"]).status, 0);
  await makeOlder(join(project, ".claude/skills/opengame-deploy"));
  await symlink(victim, join(project, ".claude/.opengame-staging"));
  const result = run(home, ["check", project]);
  assert.ok(result.notices.some((notice) => notice.code === "skills_not_installed"), JSON.stringify(result.notices));
  assert.deepEqual((await readdir(victim)).sort(), ["opengame-deploy-old-99999999", "opengame-deploy.mdc-new-99999998", "thesis-old-2023"]);
});

test("help names the command, its opt-out and the variable that stops it for one run", () => {
  const help = spawnSync(process.execPath, [binary, "help", "--json"], { encoding: "utf8", env: cleanEnv() });
  const text = help.stdout;
  assert.match(text, /"setup"/);
  assert.match(text, /no-skills/);
  assert.match(text, /OPENGAME_SKILLS_AUTO/);
});

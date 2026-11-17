import { lstat, mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { configDirectory } from "./credentials";
import { replaceFile } from "./files";
import { CliError, type Output } from "./output";
import { AGENT_DIRS, AGENT_NAMES, bundledSkillsDir, chooseAgents, countSteps, installInto, installSkills, readBundle, type Agent, type InstalledStep, type Target } from "./skills";
import { CLI_VERSION } from "./version";

/**
 * Installing the CLI gives a person's coding agents the OpenGame skills, and keeps them current
 * (16 Nov 2026: installing the CLI should always bring the latest skills, as well as
 * updates). Three parts, none of them an npm lifecycle script:
 *
 * - `opengame setup` copies every skill this CLI carries into each agent's own skills folder in
 *   the home directory, where the agent reads it in every project: ~/.claude/skills,
 *   ~/.agents/skills (Codex), ~/.cursor/skills and ~/.config/opencode/skills. Every install
 *   step prints it under the CLI's own (npm-release.mjs, CLI_SETUP_COMMAND).
 * - Any other command does the same once, the first time it runs, for a person who installed the
 *   CLI and never ran setup; and again after the CLI has been updated, since the skills ship
 *   inside it. One small file in the CLI's config folder (`skills.json`) records, for each agent,
 *   the version that last did it and the skills it installed, so every other run costs one read.
 * - In a project whose agent folders hold copies from `opengame skills add`, check, dev and
 *   deploy bring any older copy up to this CLI's (cli.ts, REFRESHES_PROJECT_SKILLS), because a project's skill
 *   shadows the same skill in the home folder and would otherwise stay as old as the day it was
 *   added.
 *
 * Why not postinstall: npm skips it under --ignore-scripts and pnpm skips it by default, so a
 * good share of installs would never run it, and a package that writes into a person's agent
 * folders from inside `npm install` is the supply-chain behaviour people are right to distrust.
 * Here the writes happen when the person runs `opengame`, say so in a notice, and stop for good
 * with `opengame setup --no-skills`, or for one process with OPENGAME_SKILLS_AUTO=0. CI never
 * gets them: no agent reads skills there.
 *
 * Every write goes through skills.ts's install, so the rules are the same as `skills add`: a
 * folder somebody edited, or one we did not write, is left exactly as it is, and the refresh
 * never deletes anything. A skill the person removed after we installed it stays removed.
 */

/** Where an agent keeps the skills it reads in every project, and the folder whose presence says the agent is installed. */
export type HomeTarget = Target & { home: string; shown: string };

const absolute = (value: string | undefined) => value?.trim() && isAbsolute(value.trim()) ? value.trim() : undefined;

/**
 * Each agent's home folder for skills, where that agent documents it: Claude Code reads
 * $CLAUDE_CONFIG_DIR (default ~/.claude)/skills; Codex reads ~/.agents/skills and keeps its
 * own state in $CODEX_HOME (default ~/.codex); Cursor reads ~/.cursor/skills; OpenCode reads
 * $XDG_CONFIG_HOME/opencode/skills. All four read the SKILL.md folder, Cursor included: its
 * `.mdc` rule form is for a project's .cursor/rules, which `skills add` still writes.
 */
export function homeTargets(env: NodeJS.ProcessEnv = process.env, home = homedir()): Record<Agent, HomeTarget> {
  const claude = absolute(env.CLAUDE_CONFIG_DIR) ?? join(home, ".claude");
  const config = absolute(env.XDG_CONFIG_HOME) ?? join(home, ".config");
  const tilde = (path: string) => path.startsWith(home + "/") || path.startsWith(home + "\\") ? `~${path.slice(home.length)}` : path;
  const at = (agent: Agent, homeFolder: string, root: string): HomeTarget => ({ agent, root, layout: "folder", home: homeFolder, shown: tilde(root) });
  return {
    claude: at("claude", claude, join(claude, "skills")),
    codex: at("codex", absolute(env.CODEX_HOME) ?? join(home, ".codex"), join(home, ".agents", "skills")),
    cursor: at("cursor", join(home, ".cursor"), join(home, ".cursor", "skills")),
    opencode: at("opencode", join(config, "opencode"), join(config, "opencode", "skills")),
  };
}

const isDirectory = async (path: string) => { try { return (await stat(path)).isDirectory(); } catch { return false; } };

/** The agents installed on this machine, by their own folder in the home directory. Codex counts with ~/.agents alone. */
export async function detectAgents(targets = homeTargets()): Promise<Agent[]> {
  const found: Agent[] = [];
  for (const target of Object.values(targets)) {
    if (await isDirectory(target.home) || (target.agent === "codex" && await isDirectory(join(target.root, "..")))) found.push(target.agent);
  }
  return found;
}

/**
 * What the last setup did, in the CLI's config folder: whether the automatic install is on, and
 * for each agent the CLI version that last installed its skills and which skills those were.
 *
 * Per agent since 17 Nov 2026 (format 2). Format 1 kept one version and one list for every
 * agent, so `opengame setup --agent codex` after an update marked Claude Code current too and
 * later commands never refreshed it, and a skill new to Codex read as one the person had
 * removed from Claude Code (Greptile on the public mirror, opengamehq/opengame#17). A format 1
 * file is read as each of its agents holding that version and list.
 */
type AgentRecord = { cli: string; skills: string[] };
export type State = { format: 2; auto: boolean; agents: Partial<Record<Agent, AgentRecord>> };

const stateFile = () => join(configDirectory(), "skills.json");
const skillNames = (value: unknown) => Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : [];
const isAgent = (agent: string): agent is Agent => Object.hasOwn(AGENT_DIRS, agent);

async function readState(): Promise<State | null> {
  try {
    const value = JSON.parse(await readFile(stateFile(), "utf8")) as Record<string, unknown>;
    if (typeof value.auto !== "boolean") return null;
    const agents: State["agents"] = {};
    if (value.format === 1 && typeof value.cli === "string" && Array.isArray(value.agents)) {
      for (const agent of value.agents) if (typeof agent === "string" && isAgent(agent)) agents[agent] = { cli: value.cli, skills: skillNames(value.skills) };
    } else if (value.format === 2 && value.agents && typeof value.agents === "object") {
      for (const [agent, record] of Object.entries(value.agents as Record<string, { cli?: unknown; skills?: unknown } | null>)) {
        if (isAgent(agent) && typeof record?.cli === "string") agents[agent] = { cli: record.cli, skills: skillNames(record.skills) };
      }
    } else return null;
    return { format: 2, auto: value.auto, agents };
  } catch { return null; }
}

/** Written beside and renamed over, so a second CLI running at the same moment never reads half a file. */
async function writeState(state: State): Promise<void> {
  const file = stateFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await replaceFile(temporary, file);
}

/**
 * Every change to skills.json is read, changed and written under one lock, from the file as it
 * is at that moment rather than as it was when the command began. A refresh installs for
 * seconds between its first read and its write, and before 17 Nov 2026 it wrote back the
 * `auto: true` it had read, so an `opengame setup --no-skills` saved meanwhile was undone and
 * later commands went on changing the person's agent folders (Greptile,
 * opengamehq/opengame#17). The lock is a file made with O_EXCL; one left by a CLI that died is
 * taken over after a few seconds, since the work it guards is one small read and write.
 */
const LOCK_STALE_MS = 3_000;
async function updateState(change: (current: State | null) => State): Promise<State> {
  await mkdir(configDirectory(), { recursive: true, mode: 0o700 });
  const lock = `${stateFile()}.lock`;
  const started = Date.now();
  for (;;) {
    try { await (await open(lock, "wx", 0o600)).close(); break; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(lock).then((info) => Date.now() - info.mtimeMs, () => 0);
      if (age > LOCK_STALE_MS || Date.now() - started > LOCK_STALE_MS * 2) { await rm(lock, { force: true }); continue; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    const next = change(await readState());
    await writeState(next);
    return next;
  } finally { await rm(lock, { force: true }); }
}

/**
 * The state after an install for `attempted`: each of those agents is recorded at this CLI's
 * version with what it held before plus what was installed for it now, every other agent keeps
 * its own record, and the switch stays as the file has it now, so an opt-out saved by another
 * process while this one was installing stands.
 */
export function afterRefresh(current: State | null, attempted: Agent[], steps: Pick<InstalledStep, "agent" | "name">[]): State {
  const agents = { ...(current?.agents ?? {}) };
  for (const agent of attempted) {
    const installed = steps.filter((step) => step.agent === agent).map((step) => step.name);
    agents[agent] = { cli: CLI_VERSION, skills: [...new Set([...(agents[agent]?.skills ?? []), ...installed])] };
  }
  return { format: 2, auto: current?.auto ?? true, agents };
}

/** Whether the automatic install is off for this process: CI, or OPENGAME_SKILLS_AUTO=0. */
export function autoDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const ci = env.CI?.trim().toLowerCase();
  return env.OPENGAME_SKILLS_AUTO === "0" || Boolean(ci && ci !== "0" && ci !== "false");
}

/**
 * Installs every skill (the all-in-one bundle aside, which repeats them) for each target. On a
 * refresh, a skill this setup installed before that is no longer on disk was removed by the
 * person, and is left out; a skill new in this CLI is added.
 */
async function installHome(targets: HomeTarget[], previous: State | null): Promise<InstalledStep[]> {
  const bundle = await readBundle();
  const every = bundle.skills.filter((skill) => skill.family !== "bundle");
  const steps: InstalledStep[] = [];
  for (const target of targets) {
    const seen = new Set(previous?.agents[target.agent]?.skills ?? []);
    const present = new Set(await readdir(target.root).catch(() => [] as string[]));
    const selected = every.filter((skill) => !seen.has(skill.name) || present.has(skill.name));
    if (selected.length) steps.push(...await installInto([target], selected, bundle, "keep"));
  }
  return steps;
}

/** "Claude Code (~/.claude/skills) and Codex (~/.agents/skills)". */
const where = (targets: HomeTarget[]) => {
  const named = targets.map((target) => `${AGENT_NAMES[target.agent]} (${target.shown})`);
  return named.length < 2 ? named.join("") : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
};

export async function setupCommand(flags: Record<string, string | boolean>, output: Output) {
  if (flags["no-skills"] === true) {
    if (typeof flags.agent === "string") throw new CliError("arguments", "Use --no-skills on its own: it stops the skills for every agent.", undefined, { next: "opengame setup --no-skills" });
    await updateState((current) => ({ format: 2, auto: false, agents: current?.agents ?? {} }));
    output.emit({ type: "result", command: "setup", data: { auto: false, skills: [],
      message: "The CLI will no longer install or update the OpenGame skills in your agents' folders, and what is there stays as it is. Run opengame setup to turn it back on." } });
    return;
  }
  const all = homeTargets();
  // The flag is read the way `skills add` reads it; detection is the home folder's, not a project's.
  const agents = typeof flags.agent === "string" ? (await chooseAgents(flags.agent, "")).agents : await detectAgents(all);
  /* Every agent set up before keeps its own record, not only those named now: dropping one
     would make the next refresh treat it as new and bring back the skills its person had
     removed (code review, 16 Nov 2026). Setup is the one write that turns auto back on. */
  if (!agents.length) {
    await updateState((current) => ({ ...afterRefresh(current, [], []), auto: true }));
    output.emit({ type: "result", command: "setup", data: { auto: true, agents: [], skills: [], counts: countSteps([]),
      message: "No coding agent was found in your home folder, so no skills were installed (looked for ~/.claude, ~/.codex, ~/.cursor and ~/.config/opencode). Run opengame setup --agent claude, or codex, cursor or opencode, to install them for one." } });
    return;
  }
  const targets = agents.map((agent) => all[agent]);
  // An explicit setup also brings back a skill the person had removed: they asked for all of them.
  const steps = await installHome(targets, null);
  await updateState((current) => ({ ...afterRefresh(current, agents, steps), auto: true }));
  const counts = countSteps(steps);
  const parts = (Object.entries(counts) as [keyof typeof counts, number][]).filter(([, n]) => n).map(([state, n]) => `${n} ${state}`);
  const kept = steps.filter((step) => step.state === "kept");
  const router = steps.find((step) => step.name === "opengame-router" && step.state !== "kept");
  output.emit({ type: "result", command: "setup", data: { auto: true, agents, counts,
    skills: steps.map(({ agent, name, target, state, why }) => ({ agent, name, path: target, state, ...(why ? { why } : {}) })),
    start: router ? join(router.target, "SKILL.md") : null,
    message: `${new Set(steps.map((step) => step.name)).size} OpenGame skills for ${where(targets)}: ${parts.join(", ")}.` +
      (kept.length ? `\nLeft as they are, because they were edited or not installed by OpenGame: ${kept.map((step) => step.target).join(", ")}.` : "") +
      `\nThey update when the CLI does. Run opengame setup --no-skills to stop that.` +
      (router ? `\nAn agent in a session that started before this can read ${join(router.target, "SKILL.md")} to begin.` : "") } });
}

/** The skills a project's agent folders hold from `opengame skills add` that are older than this CLI's. */
async function staleProjectSkills(project: string): Promise<Map<Agent, string[]>> {
  const stale = new Map<Agent, string[]>();
  let manifest: { skills?: { name: string; digest: string }[] };
  try { manifest = JSON.parse(await readFile(join(bundledSkillsDir(), "manifest.json"), "utf8")); } catch { return stale; }
  const digests = new Map((manifest.skills ?? []).map((skill) => [skill.name, skill.digest]));
  // The folder agents only: a Cursor project rule's marker digest covers the converted rule, not the bundle's files.
  for (const agent of ["claude", "codex", "opencode"] as Agent[]) {
    const root = join(project, AGENT_DIRS[agent]);
    let entries: string[];
    try { if ((await lstat(root)).isSymbolicLink()) continue; entries = await readdir(root); } catch { continue; }
    for (const name of entries.filter((entry) => digests.has(entry))) {
      try {
        const marker = JSON.parse(await readFile(join(root, name, ".opengame-skill.json"), "utf8")) as { name?: string; digest?: string; rule?: unknown };
        if (marker.name === name && !marker.rule && typeof marker.digest === "string" && marker.digest !== digests.get(name)) stale.set(agent, [...(stale.get(agent) ?? []), name]);
      } catch { /* not ours, or not a skill folder */ }
    }
  }
  return stale;
}

/**
 * Before a command runs: the first-run install and the refresh after an update, and the
 * project's own copies when the command works on a project. Never fails the command: a
 * problem here is a notice, and the command goes on.
 */
export async function refreshSkills(output: Pick<Output, "emit">, project: string | null, env: NodeJS.ProcessEnv = process.env, home = homedir()): Promise<void> {
  if (autoDisabled(env)) return;
  let state: State | null = null;
  let found: Agent[] | null = null;
  let recordedHome = false;
  try {
    state = await readState();
    if (state?.auto === false) return;
    const all = homeTargets(env, home);
    found = await detectAgents(all);
    /* Only the agents this CLI version has not installed for: one brought current by
       `setup --agent` leaves the others to be refreshed here. */
    const due = found.filter((agent) => state?.agents[agent]?.cli !== CLI_VERSION);
    if (due.length) {
      const targets = due.map((agent) => all[agent]);
      const steps = await installHome(targets, state);
      await updateState((current) => afterRefresh(current, due, steps));
      recordedHome = true;
      const changed = steps.filter((step) => step.state === "installed" || step.state === "updated");
      if (changed.length) {
        const first = !state;
        output.emit({ type: "notice", code: "skills_installed",
          message: `${first ? "Installed" : "Updated"} the OpenGame skills for ${where(targets.filter((target) => changed.some((step) => step.agent === target.agent)))}. They update when the CLI does; opengame setup --no-skills stops that.` });
      }
    }
    if (project) {
      /* One agent at a time, with only the skills that agent's folder already holds: the
         refresh updates what a project has and adds nothing to it (code review, 16 Nov 2026,
         when both agents' names went to one install and each got the other's skills). */
      let updated = 0;
      for (const [agent, names] of await staleProjectSkills(project)) {
        const result = await installSkills({ project, agent, skill: names.join(","), keepEdited: true });
        updated += result.skills.filter((skill) => skill.state === "updated").length;
      }
      if (updated) output.emit({ type: "notice", code: "skills_updated", message: `Updated ${updated} OpenGame skill${updated === 1 ? "" : "s"} in this project to the CLI's copy. Edited ones were left as they are.` });
    }
  } catch (error) {
    /* Recorded as done for this version and for the agents found, so a folder that cannot be
       written does not print this on every command; setup tries again on request. When the
       home install already recorded itself, the failure was the project's, and that record
       stands. */
    if (!recordedHome) {
      const attempted = (found ?? []).filter((agent) => state?.agents[agent]?.cli !== CLI_VERSION);
      await updateState((current) => afterRefresh(current, attempted, [])).catch(() => {});
    }
    const detail = error instanceof CliError ? error.message : (error as NodeJS.ErrnoException)?.code ?? "an unexpected error";
    output.emit({ type: "notice", code: "skills_not_installed", message: `The OpenGame skills could not be installed in your agents' folders (${detail}). Your command was not affected. Run opengame setup to try again.` });
  }
}

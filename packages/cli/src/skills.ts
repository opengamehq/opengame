import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { replaceFile } from "./files";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, Output } from "./output";

/**
 * `opengame skills add` copies the skills bundled into this CLI into a project, where a
 * coding agent loads them. They are copied from the installed package, never fetched,
 * so the skill an agent reads is the one that shipped with the CLI it will run.
 *
 * Installing is idempotent and refuses to overwrite anything it did not write. Each
 * installed folder carries a marker naming the bundle digest and every file's hash, so a
 * second run can tell "already current" from "an older version we wrote" from "somebody
 * edited this" from "this is not ours at all", and only the first two proceed without
 * `--replace` or `--keep-edited`. Every conflict is found before anything is written, so
 * a refused run leaves the project exactly as it was.
 *
 * "Already current" is decided by comparing the files on disk with the files this CLI is
 * about to write, never by trusting the marker. The marker sits in the project, so a
 * cloned repository can carry one that describes whatever it likes; until 4 Oct 2026 a
 * planted opengame-deploy with a recomputed marker was reported "unchanged", and
 * `--replace` left it in place. The marker now only answers the weaker question of
 * whether a folder that differs from the bundle is an older copy of ours.
 */

export const AGENT_DIRS = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  cursor: ".cursor/rules",
  opencode: ".opencode/skills",
} as const;
export type Agent = keyof typeof AGENT_DIRS;
const AGENT_NAMES: Record<Agent, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor", opencode: "OpenCode" };
const MARKER = ".opengame-skill.json";
const NAME = /^opengame-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^(?:SKILL\.md|(?:references|helpers)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/;

type BundledFile = { path: string; sha256: string };
type BundledSkill = { name: string; family: "platform" | "craft"; default: boolean; description: string; files: BundledFile[]; digest: string };
type Bundle = { root: string; skills: BundledSkill[] };
type Marker = { name: string; digest: string; files: BundledFile[]; rule?: BundledFile };
type InstallState = "installed" | "updated" | "unchanged" | "replaced" | "kept";
type Mode = "refuse" | "replace" | "keep";

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const byPath = (a: BundledFile, b: BundledFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const digestOf = (files: BundledFile[]) => sha256([...files].sort(byPath).map((f) => `${f.path}\0${f.sha256}`).join("\n"));

/** Where the build put the skills: beside the bundled CLI, in `dist/skills/`. */
export function bundledSkillsDir(): string {
  return fileURLToPath(new URL("./skills/", import.meta.url));
}

const broken = (detail: string) => new CliError("skills_unavailable",
  `This CLI's bundled skills are missing or damaged (${detail}). Reinstall the OpenGame CLI, then run opengame skills add again.`, 5);

/** Reads the bundle and checks every file against the manifest the build wrote. */
export async function readBundle(root = bundledSkillsDir()): Promise<Bundle> {
  let manifest: { format?: unknown; skills?: unknown };
  try { manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")); }
  catch { throw broken("no manifest"); }
  if (manifest.format !== 1 || !Array.isArray(manifest.skills) || !manifest.skills.length) throw broken("unreadable manifest");
  const skills: BundledSkill[] = [];
  for (const entry of manifest.skills as BundledSkill[]) {
    if (!entry || typeof entry.default !== "boolean" || !NAME.test(entry.name) || !Array.isArray(entry.files) || !entry.files.some((f) => f.path === "SKILL.md")) throw broken("unreadable manifest");
    for (const file of entry.files) {
      if (typeof file.path !== "string" || !FILE.test(file.path) || file.path.split("/").some((part) => /^\.+$/.test(part)) ||
        typeof file.sha256 !== "string") throw broken(`bad path in ${entry.name}`);
      let bytes: Buffer;
      try { bytes = await readFile(join(root, entry.name, file.path)); } catch { throw broken(`${entry.name}/${file.path} is missing`); }
      if (sha256(bytes) !== file.sha256) throw broken(`${entry.name}/${file.path} does not match its hash`);
    }
    if (digestOf(entry.files) !== entry.digest) throw broken(`${entry.name} digest`);
    skills.push(entry);
  }
  return { root, skills };
}

/** Which agents to install for: the flag, else the agent running us, else the folders the project already has. */
export async function chooseAgents(flag: string | undefined, project: string, env = process.env): Promise<{ agents: Agent[]; reason: string }> {
  if (flag !== undefined) {
    const requested = flag.split(",").map((value) => value.trim()).filter(Boolean);
    const unknown = requested.filter((value) => !Object.hasOwn(AGENT_DIRS, value));
    if (!requested.length || unknown.length) {
      throw new CliError("invalid_agent", `Use --agent with ${Object.keys(AGENT_DIRS).join(", ")}, or several separated by commas.`);
    }
    return { agents: [...new Set(requested)] as Agent[], reason: "flag" };
  }
  const markers: [string, Agent][] = [["CLAUDECODE", "claude"], ["CODEX_SANDBOX", "codex"], ["CODEX_THREAD_ID", "codex"], ["CURSOR_AGENT", "cursor"], ["OPENCODE", "opencode"]];
  const running = [...new Set(markers.filter(([key]) => env[key]).map(([, agent]) => agent))];
  if (running.length) return { agents: running, reason: "running agent" };
  const present: Agent[] = [];
  for (const [agent, folder] of [["claude", ".claude"], ["codex", ".agents"], ["codex", ".codex"], ["cursor", ".cursor"], ["opencode", ".opencode"]] as [Agent, string][]) {
    try { if ((await stat(join(project, folder))).isDirectory() && !present.includes(agent)) present.push(agent); } catch { /* absent */ }
  }
  if (present.length) return { agents: present, reason: "project folders" };
  return { agents: ["claude"], reason: "default" };
}

/** Splits SKILL.md into its frontmatter description and its body. */
function splitSkill(text: string): { description: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw broken("a SKILL.md has no frontmatter");
  const line = match[1]!.split("\n").find((row) => row.startsWith("description:"));
  return { description: line ? line.slice("description:".length).trim() : "", body: text.slice(match[0].length) };
}

/**
 * The files one agent gets for one skill. Claude Code, Codex and OpenCode read the
 * SKILL.md folder as it is. Cursor reads rules from `.cursor/rules/*.mdc`, so the same
 * body becomes `<name>.mdc` beside the folder, requested by the agent from its
 * description rather than always applied, with its links pointed into the folder that
 * holds the references and helpers.
 */
async function filesFor(agent: Agent, skill: BundledSkill, bundle: Bundle): Promise<{ files: Map<string, Buffer>; rule?: Buffer }> {
  const files = new Map<string, Buffer>();
  for (const file of skill.files) files.set(file.path, await readFile(join(bundle.root, skill.name, file.path)));
  if (agent !== "cursor") return { files };
  const { description, body } = splitSkill(files.get("SKILL.md")!.toString("utf8"));
  files.delete("SKILL.md");
  const linked = body
    .replace(/\]\(((?:references|helpers)\/)/g, `](${skill.name}/$1`)
    .replace(/`((?:references|helpers)\/[A-Za-z0-9._/-]+)`/g, `\`${skill.name}/$1\``);
  return { files, rule: Buffer.from(`---\ndescription: ${JSON.stringify(description)}\nglobs:\nalwaysApply: false\n---\n${linked}`) };
}

async function listTree(root: string, dir = root): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listTree(root, path));
    else out.push(relative(root, path).split("\\").join("/"));
  }
  return out;
}

type Plan = { agent: Agent; skill: string; target: string; files: Map<string, Buffer>; rule?: { path: string; bytes: Buffer };
  marker: Marker; state: InstallState | "conflict"; why?: string; shared?: boolean };

async function exists(path: string) { try { await lstat(path); return true; } catch { return false; } }

/**
 * True when `path` is a plain file holding `sha256`'s bytes, give or take line ends. A link
 * or a folder where a file should be is an edit.
 *
 * Line ends are not. Git for Windows checks text out with CRLF by default (core.autocrlf
 * is true in its installer), so a project that commits its skills folder came back on a
 * Windows machine with every file reading as edited, and skills add then refused to
 * install anything. A file whose bytes match once CRLF is read as LF is the file we wrote.
 */
async function sameFile(path: string, sha: string | undefined): Promise<boolean> {
  try {
    if (!sha || !(await lstat(path)).isFile()) return false;
    const bytes = await readFile(path);
    if (sha256(bytes) === sha) return true;
    return bytes.includes("\r\n") && sha256(Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1")) === sha;
  } catch { return false; }
}

/** True when the folder holds exactly these files with exactly these hashes, and nothing else. */
async function holds(target: string, onDisk: string[], files: BundledFile[]): Promise<boolean> {
  if (onDisk.join("\n") !== files.map((f) => f.path).sort().join("\n")) return false;
  for (const file of files) if (!await sameFile(join(target, file.path), file.sha256)) return false;
  return true;
}

const withRule = (files: BundledFile[], rule?: BundledFile) => rule ? [...files, { ...rule, path: `../${rule.path}` }] : files;

/** Decides what would happen to one target without changing anything. */
async function plan(agent: Agent, skill: BundledSkill, bundle: Bundle, project: string, mode: Mode): Promise<Plan> {
  const target = join(project, AGENT_DIRS[agent], skill.name);
  const { files, rule } = await filesFor(agent, skill, bundle);
  const entries = [...files].map(([path, bytes]) => ({ path, sha256: sha256(bytes) }));
  const ruleEntry = rule ? { path: `${skill.name}.mdc`, sha256: sha256(rule) } : undefined;
  const marker: Marker = { name: skill.name, digest: digestOf(withRule(entries, ruleEntry)), files: entries, ...(ruleEntry ? { rule: ruleEntry } : {}) };
  const base = { agent, skill: skill.name, target, files, marker, ...(rule ? { rule: { path: join(dirname(target), `${skill.name}.mdc`), bytes: rule } } : {}) };
  const conflict = (why: string): Plan => ({ ...base, state: mode === "replace" ? "replaced" : mode === "keep" ? "kept" : "conflict", why });
  let info;
  try { info = await lstat(target); } catch {
    // No folder, but a rule file of the same name that we did not write.
    if (base.rule && await exists(base.rule.path)) return conflict("has a rule file that was not installed by opengame skills add");
    return { ...base, state: "installed" };
  }
  if (info.isSymbolicLink()) return { ...base, state: mode === "keep" ? "kept" : "conflict", why: "is a symbolic link; remove it or install into the folder it points at" };
  if (!info.isDirectory()) return conflict("is a file, not a skill folder");
  let existing: Marker | null = null;
  try { existing = JSON.parse(await readFile(join(target, MARKER), "utf8")) as Marker; } catch { existing = null; }
  if (!existing || existing.name !== skill.name || !Array.isArray(existing.files) ||
    !existing.files.every((f) => f && typeof f.path === "string" && FILE.test(f.path) && typeof f.sha256 === "string")) {
    return conflict("was not installed by opengame skills add");
  }
  const onDisk = (await listTree(target)).filter((path) => path !== MARKER).sort();
  // Already current: the bytes an agent would read are the bytes we would write.
  if (await holds(target, onDisk, entries) && (!ruleEntry || await sameFile(base.rule!.path, ruleEntry.sha256))) return { ...base, state: "unchanged" };
  // Otherwise it may be an older copy of ours, which is updated without asking. A marker
  // whose digest does not match its own file list was not written by us as it stands.
  const recordedRule = existing.rule && typeof existing.rule.sha256 === "string" ? existing.rule : undefined;
  const ours = existing.digest === digestOf(withRule(existing.files, recordedRule)) &&
    await holds(target, onDisk, existing.files) && (!base.rule || (recordedRule !== undefined && await sameFile(base.rule.path, recordedRule.sha256)));
  if (!ours) return conflict("has been edited since it was installed");
  return { ...base, state: "updated" };
}

/**
 * Staging lives BESIDE the agent's skills folder, not inside it: a half-built
 * `opengame-x.opengame-new-123/SKILL.md` inside `.claude/skills/` is a second skill named
 * opengame-x to every agent that scans that folder, and a crash between two renames left
 * one there for good. `.claude/.opengame-staging/` is on the same device as the folder it
 * renames into, because it is next to the folder's real path, and no agent scans it.
 */
async function stagingRoot(parent: string): Promise<string> {
  await mkdir(parent, { recursive: true });
  const root = join(dirname(await realpath(parent)), ".opengame-staging");
  await mkdir(root, { recursive: true });
  return root;
}

function alive(pid: number): boolean {
  if (pid === process.pid) return true;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

/** Removes what a run that died between its renames left behind, in either layout. */
async function sweep(parent: string): Promise<void> {
  const stale = (name: string, shape: RegExp) => { const match = shape.exec(name); return Boolean(match && !alive(Number(match[1]))); };
  try {
    for (const name of await readdir(parent)) {
      if (stale(name, /^opengame-[a-z0-9-]+(?:\.mdc)?\.opengame-(?:new|old)-(\d+)$/)) await rm(join(parent, name), { recursive: true, force: true });
    }
  } catch { /* no folder yet */ }
  let root: string;
  try { root = join(dirname(await realpath(parent)), ".opengame-staging"); } catch { return; }
  try {
    for (const name of await readdir(root)) {
      if (stale(name, /-(?:new|old)-(\d+)$/)) await rm(join(root, name), { recursive: true, force: true });
    }
    await rmdir(root);
  } catch { /* absent, or another run is using it */ }
}

/** Writes one planned folder: build it beside the agent's folder, then swap it in. */
async function apply(step: Plan): Promise<void> {
  if (step.state === "unchanged" || step.state === "conflict" || step.state === "kept") return;
  const root = await stagingRoot(dirname(step.target));
  const staging = join(root, `${step.skill}-new-${process.pid}`);
  const retired = join(root, `${step.skill}-old-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  try {
    // A Cursor rule for a skill with no references still gets its folder, for the marker.
    await mkdir(staging, { recursive: true });
    for (const [path, bytes] of step.files) {
      await mkdir(dirname(join(staging, path)), { recursive: true });
      await writeFile(join(staging, path), bytes);
    }
    await writeFile(join(staging, MARKER), JSON.stringify(step.marker, null, 2) + "\n");
    let moved = false;
    try { await lstat(step.target); await replaceFile(step.target, retired); moved = true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try { await replaceFile(staging, step.target); }
    catch (error) { if (moved) await replaceFile(retired, step.target); throw error; }
    if (moved) await rm(retired, { recursive: true, force: true });
    if (step.rule) {
      const temporary = join(root, `${step.skill}.mdc-new-${process.pid}`);
      await writeFile(temporary, step.rule.bytes);
      await replaceFile(temporary, step.rule.path);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
    try { await rmdir(root); } catch { /* another skill or run is still staging */ }
  }
}

export type InstallOptions = { project: string; agent?: string; replace?: boolean; keepEdited?: boolean; bundleDir?: string; env?: NodeJS.ProcessEnv; skill?: string; all?: boolean };

/** Installs the starting set or selected bundled skills for the chosen agents. Throws before writing if any target conflicts. */
export async function installSkills(options: InstallOptions) {
  let project: string;
  try {
    project = await realpath(resolve(options.project));
    if (!(await stat(project)).isDirectory()) throw new Error("not a directory");
  } catch { throw new CliError("invalid_dir", "Give an existing project folder: opengame skills add <folder>, or --dir <folder>."); }
  if (options.replace && options.keepEdited) throw new CliError("arguments", "Use --replace or --keep-edited, not both.");
  const mode: Mode = options.replace ? "replace" : options.keepEdited ? "keep" : "refuse";
  const bundle = await readBundle(options.bundleDir);
  if (options.all && options.skill !== undefined) throw new CliError("arguments", "Use --all or --skill, not both.");
  const names = options.skill?.split(",").map(name => name.trim()).filter(Boolean);
  const unknown = names?.filter(name => !bundle.skills.some(skill => skill.name === name));
  if (names && (!names.length || unknown?.length)) throw new CliError("invalid_skill", "Use --skill with names from opengame skills list, separated by commas.", undefined, { next: "opengame skills list" });
  const selected = bundle.skills.filter(skill => options.all || (names ? names.includes(skill.name) : skill.default));
  if (!selected.length) throw broken("no starting skills");
  const { agents, reason } = await chooseAgents(options.agent, project, options.env);
  const steps: Plan[] = [];
  for (const agent of agents) for (const skill of selected) steps.push(await plan(agent, skill, bundle, project, mode));
  // Two agents whose folders are one folder through a link (a common setup is
  // .claude/skills pointing at .agents/skills) share one install, written once.
  const written = new Map<string, Plan>();
  for (const step of steps) {
    let parent = dirname(step.target);
    try { parent = await realpath(parent); } catch { /* not created yet */ }
    const key = join(parent, step.skill);
    const first = written.get(key);
    if (first) { step.state = first.state; step.why = first.why; step.shared = true; }
    else written.set(key, step);
  }
  const conflicts = steps.filter((step) => step.state === "conflict" && !step.shared);
  if (conflicts.length) {
    const lines = conflicts.map((step) => `${relative(project, step.target)} ${step.why}`);
    throw new CliError("skills_conflict", `Nothing was installed. ${lines.join(". ")}. ` +
      "Run again with --keep-edited to install everything else and leave these as they are, or with --replace to overwrite them, which loses the changes in them.");
  }
  for (const parent of new Set(steps.filter((step) => !step.shared).map((step) => dirname(step.target)))) await sweep(parent);
  for (const step of steps) if (!step.shared) await apply(step);
  const counts = { installed: 0, updated: 0, unchanged: 0, replaced: 0, kept: 0 };
  for (const step of steps) counts[step.state as InstallState]++;
  return { project, agents, reason, counts,
    skills: steps.map((step) => ({ agent: step.agent, name: step.skill, path: relative(project, step.target), state: step.state as InstallState,
      ...(step.state === "kept" ? { why: step.why } : {}) })) };
}

function summary(result: Awaited<ReturnType<typeof installSkills>>, total: number): string {
  const where = result.agents.map((agent) => `${AGENT_NAMES[agent]} (${AGENT_DIRS[agent]})`).join(" and ");
  const parts = (Object.entries(result.counts) as [InstallState, number][]).filter(([, n]) => n).map(([state, n]) => `${n} ${state}`);
  const chosen = result.reason === "default" ? "\nNo agent folder was found in this project, so they went into Claude Code's. Use --agent to choose another." : "";
  const kept = result.skills.filter((skill) => skill.state === "kept");
  const left = kept.length ? `\nLeft as they are: ${kept.map((skill) => `${skill.path} (${skill.why})`).join(", ")}. Run with --replace to overwrite them with this CLI's copy.` : "";
  return `${total} OpenGame skills for ${where}: ${parts.join(", ")}.${chosen}${left}`;
}

export async function skillsCommand(action: string | undefined, folder: string | undefined, flags: Record<string, string | boolean>, output: Output) {
  if (action !== "add" && action !== "list") throw new CliError("skills_action", "Use opengame skills add or opengame skills list.", undefined, { next: "opengame help skills" });
  if (action === "list") {
    if (folder !== undefined) throw new CliError("arguments", "The skills list command does not take a project folder. It lists what this CLI carries, so run opengame skills list on its own.", undefined, { next: "opengame skills list" });
    for (const key of ["agent", "dir", "replace", "keep-edited", "skill", "all"]) if (key in flags) throw new CliError("unsupported_flag", `The skills list command does not use --${key}. Run opengame help skills.`, undefined, { next: "opengame help skills" });
    const bundle = await readBundle();
    const skills = bundle.skills.map(({ name, family, default: byDefault, description }) => ({ name, family, default: byDefault, description }));
    output.emit({ type: "result", command: "skills list", data: { skills,
      message: skills.map((skill) => `${skill.name.padEnd(26)} ${skill.family}${skill.default ? " (starting set)" : ""}`).join("\n") + "\n\nRun opengame skills add for the starting set, --skill <name> for a specialist, or --all for the catalog." } });
    return;
  }
  // `opengame skills add .` reads like every other command; --dir stays for scripts that use it.
  if (folder !== undefined && typeof flags.dir === "string") throw new CliError("arguments", "Give the project folder once: opengame skills add <folder>, or --dir <folder>.");
  const result = await installSkills({ project: folder ?? (typeof flags.dir === "string" ? flags.dir : "."), agent: typeof flags.agent === "string" ? flags.agent : undefined,
    replace: flags.replace === true, keepEdited: flags["keep-edited"] === true, skill: typeof flags.skill === "string" ? flags.skill : undefined, all: flags.all === true });
  const total = result.skills.length / result.agents.length;
  output.emit({ type: "result", command: "skills add", data: { ...result, message: summary(result, total) } });
}

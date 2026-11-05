#!/usr/bin/env node
/**
 * Renders every skill under `skills/` into an output folder, validates the result, and
 * writes `manifest.json` beside them. The CLI calls `buildSkills` from its own build so
 * the skills it installs are the skills that were validated, byte for byte; running
 * this file directly writes `dist/` here, which is what @opengamehq/skills publishes.
 *
 *   node build.mjs               # build the npm package's dist/ and validate
 *   node build.mjs --check       # validate only, write nothing
 *   node build.mjs --lock        # record every skill's released version and digest
 *   node build.mjs --public DIR  # write the public repository's skills/ and marketplace
 *
 * Every skill carries a version (`metadata.version` in its SKILL.md) and a CHANGELOG.md,
 * and `skills.lock.json` records the version and content digest each one was released
 * at. The build refuses a skill whose content no longer matches its recorded digest
 * while its version still matches its recorded version: that is a changed skill going
 * out under a number somebody already installed, and a person comparing versions would
 * be told nothing changed. Bump the version, add the CHANGELOG entry, run `--lock`.
 *
 * The digest is of the RENDERED files, so a change to limits.json that changes what a
 * platform skill says is a change to that skill, and needs a bump like any other. The same
 * holds for launch.json's dates.
 *
 * The npm install switch is the exception. npm-release.json decides whether `{{install cli}}`
 * prints the npm command or the sentence that says the packages are not on npm yet, and the
 * first publish renders the command before the committed switch says so. Neither is a
 * change in what a skill teaches, so the lock records each skill's digest in both states,
 * `digest` with the switch shut and `digestPublished` with it open, and a build compares the
 * rendering it made with the digest for the state it rendered in. Flipping the switch then
 * needs no bump, and a change to either rendering at an unchanged version is still refused.
 *
 * A failure prints every problem, not the first, because a skill author fixing one
 * line at a time against a build that stops early is a slow way to learn the rules.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { installsOpen } from "../shared/npm-release.mjs";
import { loadContext, render } from "./lib/render.mjs";
import { compareVersions, handTypedLimits, parseFrontmatter, typedLaunchDates, validateSkill } from "./lib/validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCE_DIR = join(here, "skills");
const REGISTRY = join(here, "skills.json");
export const LOCK = join(here, "skills.lock.json");
const CHANGELOG = "CHANGELOG.md";
const EM_DASH = "\u2014";

async function listFiles(root, dir = root) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(root, path));
    else if (entry.isFile()) out.push(relative(root, path).split("\\").join("/"));
    else throw new Error(`${relative(root, path)} is neither a file nor a folder; skills ship regular files only`);
  }
  return out.sort();
}

const isTest = (file) => /\.test\.m?js$/.test(file);

/**
 * Reads, renders and validates every skill. Returns `{ skills, problems }`; `skills`
 * holds the rendered files in memory so callers decide whether to write them, and
 * `published` says which state of the install switch they were rendered in. `npmRelease`
 * renders in a given state rather than the one the build would read.
 */
export async function collectSkills({ sourceDir = SOURCE_DIR, registryPath = REGISTRY, npmRelease } = {}) {
  const context = loadContext();
  if (npmRelease) context.npmRelease = npmRelease;
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const problems = [];
  const folders = (await readdir(sourceDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const registered = new Map(registry.skills.map((entry) => [entry.name, entry]));
  for (const folder of folders) if (!registered.has(folder)) problems.push(`${folder}: not listed in skills.json`);
  for (const name of registered.keys()) if (!folders.includes(name)) problems.push(`${name}: listed in skills.json but has no folder`);

  const skills = [];
  for (const name of folders) {
    const entry = registered.get(name);
    if (!entry) continue;
    if (entry.default !== undefined && typeof entry.default !== "boolean") problems.push(`${name}: default must be a boolean`);
    if (!["platform", "craft"].includes(entry.family)) problems.push(`${name}: family must be platform or craft`);
    const root = join(sourceDir, name);
    const files = {};
    for (const file of await listFiles(root)) {
      // Helper self-tests run in this package's suite and are not shipped: an agent
      // copies the helper, and the test imports node:test, which a browser cannot.
      if (isTest(file)) continue;
      // The changelog is for a person deciding whether to update, not for the agent
      // using the skill, so it is published beside the skill and never loaded with it.
      if (file === CHANGELOG) continue;
      const source = await readFile(join(root, file), "utf8");
      if (file.endsWith(".md")) {
        if (entry.family === "platform") {
          for (const hit of handTypedLimits(source, context.limits)) {
            problems.push(`${name}/${file}:${hit.line}: "${hit.spelling}" is a limits.json value typed by hand; use a {{...}} template`);
          }
        }
        for (const hit of typedLaunchDates(source, context.launch)) {
          problems.push(`${name}/${file}:${hit.line}: "${hit.spelling}" is a launch.json date typed by hand; use {{launch opens}}, {{launch kickoff}} or {{launch close}}`);
        }
        try { files[file] = render(source, context, `${name}/${file}`); }
        catch (error) { problems.push(error.message); files[file] = source; }
      } else files[file] = source;
    }
    problems.push(...validateSkill({ name, family: entry.family, files }));
    const front = parseFrontmatter(files["SKILL.md"] ?? "");
    const version = front?.fields?.metadata?.version ?? "";
    let changelog = "";
    try { changelog = await readFile(join(root, CHANGELOG), "utf8"); }
    catch { problems.push(`${name}/${CHANGELOG}: missing; every skill keeps one`); }
    if (changelog) {
      // Newest first, so the top entry is the one a person reads before updating.
      const newest = /^## (\S+)/m.exec(changelog)?.[1];
      if (newest !== version) problems.push(`${name}/${CHANGELOG}: the newest entry is "${newest ?? "none"}" and SKILL.md says ${version}; add a "## ${version}" entry at the top`);
      changelog.split("\n").forEach((line, i) => { if (line.includes(EM_DASH)) problems.push(`${name}/${CHANGELOG}:${i + 1}: contains an em dash`); });
    }
    skills.push({ name, family: entry.family, default: entry.default === true, description: front?.fields?.description ?? "", version, files, changelog });
  }
  return { skills, problems, version: context.limits.version, published: installsOpen(context.npmRelease) };
}

/** The two states the lock records, from the committed switch: shut, and open as the first
 * publish renders it. Only `published` and `scopeOwned` differ from the file. */
export function switchStates(release) {
  return { shut: { ...release, published: false }, published: { ...release, scopeOwned: true, published: true } };
}

/** Every skill rendered in both states, for `--lock` and `--check`. */
export async function collectBothStates(options = {}) {
  const states = switchStates(loadContext({ env: {} }).npmRelease);
  const [shut, published] = await Promise.all([collectSkills({ ...options, npmRelease: states.shut }), collectSkills({ ...options, npmRelease: states.published })]);
  return { shut, published, problems: [...new Set([...shut.problems, ...published.problems])] };
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** The manifest the CLI installs from. `digest` covers every file's path and bytes. */
export function manifestFor(skills, version) {
  return {
    format: 1,
    limitsVersion: version,
    skills: skills.map(({ name, family, default: byDefault, description, version: skillVersion, files }) => {
      // Code-unit order, which the CLI's installer reproduces exactly; a locale-aware
      // sort would put "helpers/" before "SKILL.md" on one side and not the other.
      const entries = Object.keys(files).sort().map((path) => ({ path, sha256: sha256(files[path]) }));
      return { name, family, default: byDefault === true, description, version: skillVersion, files: entries, digest: sha256(entries.map((e) => `${e.path}\0${e.sha256}`).join("\n")) };
    }),
  };
}

/**
 * What stops a skill being released: one with no entry in the lock, one whose recorded
 * version is not its current one (run `--lock`), and above all one whose content changed
 * while its version did not. `published` names the switch state `manifest` was rendered
 * in, which picks the digest it is held to. Returns problems in the same shape as validation.
 */
export function lockProblems(manifest, lock, { published = false } = {}) {
  const problems = [];
  const recorded = lock?.skills ?? {};
  for (const skill of manifest.skills) {
    const entry = recorded[skill.name];
    if (!entry) { problems.push(`${skill.name}: not in skills.lock.json; run npm run lock -w @opengamehq/skills`); continue; }
    const recordedDigest = published ? entry.digestPublished : entry.digest;
    if (entry.version === skill.version && recordedDigest === undefined) {
      problems.push(`${skill.name}: skills.lock.json records no digest for the ${published ? "published" : "unpublished"} install switch; run npm run lock -w @opengamehq/skills`);
    } else if (entry.version === skill.version && recordedDigest !== skill.digest) {
      problems.push(`${skill.name}: its content changed and its version is still ${skill.version}; bump metadata.version, add a CHANGELOG entry, then run npm run lock -w @opengamehq/skills`);
    } else if (entry.version !== skill.version) {
      problems.push(`${skill.name}: SKILL.md says ${skill.version} and skills.lock.json records ${entry.version}; run npm run lock -w @opengamehq/skills`);
    }
  }
  for (const name of Object.keys(recorded)) {
    if (!manifest.skills.some((s) => s.name === name)) problems.push(`${name}: in skills.lock.json but no longer built; run npm run lock -w @opengamehq/skills`);
  }
  return problems;
}

/**
 * The lock as it should be after this release, from the manifests of both switch states.
 * Refuses a skill whose content changed in either state without a newer version, so
 * `--lock` cannot paper over the check above. An entry missing either digest counts as
 * changed, so deleting one by hand cannot let a change through either.
 */
export function nextLock({ shut, published }, lock) {
  const recorded = lock?.skills ?? {};
  const problems = [];
  const skills = {};
  const open = new Map(published.skills.map((skill) => [skill.name, skill]));
  for (const skill of shut.skills) {
    const other = open.get(skill.name);
    if (!other || other.version !== skill.version) throw new Error(`${skill.name}: the two switch states built different skills`);
    const entry = recorded[skill.name];
    const changed = entry && (entry.digest !== skill.digest || entry.digestPublished !== other.digest);
    if (changed && compareVersions(skill.version, entry.version) <= 0) {
      problems.push(`${skill.name}: its content changed and ${skill.version} is not newer than the released ${entry.version}`);
    }
    skills[skill.name] = { version: skill.version, digest: skill.digest, digestPublished: other.digest };
  }
  if (problems.length) {
    const error = new Error(`Lock refused:\n  ${problems.join("\n  ")}`);
    error.problems = problems;
    throw error;
  }
  return { $comment: "The version and content digest each skill was last released at, rendered with the npm install switch shut (digest) and open (digestPublished). Written by npm run lock -w @opengamehq/skills; build.mjs says why.", skills };
}

async function readLock(lockPath) {
  try { return JSON.parse(await readFile(lockPath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

/**
 * Builds into `outDir`, replacing it. Throws listing every problem when validation fails
 * or the lock disagrees. `lockPath: null` skips the lock, for a build of planted skills;
 * `npmRelease` renders in a given switch state, for a test of each.
 */
export async function buildSkills({ outDir, sourceDir, registryPath, lockPath = LOCK, npmRelease } = {}) {
  const { skills, problems, version, published } = await collectSkills({ sourceDir, registryPath, npmRelease });
  const manifest = manifestFor(skills, version);
  if (!problems.length && lockPath) problems.push(...lockProblems(manifest, await readLock(lockPath), { published }));
  if (problems.length) {
    const error = new Error(`Skill validation failed:\n  ${problems.join("\n  ")}`);
    error.problems = problems;
    throw error;
  }
  if (outDir) {
    await rm(outDir, { recursive: true, force: true });
    await writeSkills(outDir, skills);
    await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
  return { skills, manifest };
}

async function writeSkills(dir, skills, { changelogs = false } = {}) {
  for (const skill of skills) {
    const files = changelogs ? { ...skill.files, [CHANGELOG]: skill.changelog } : skill.files;
    for (const [path, text] of Object.entries(files)) {
      const target = join(dir, skill.name, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text);
    }
  }
}

/**
 * The Claude Code plugin marketplace for the public repository, which `npx skills add`
 * reads as well. Two plugins, because somebody who wants the platform skills should not
 * have to carry twenty craft skills' descriptions into every session to get them.
 */
export function marketplaceFor(skills, skillsDir = "skills") {
  const plugin = (name, description, family) => ({
    name, description, source: "./", strict: false,
    skills: skills.filter((s) => s.family === family).map((s) => `./${skillsDir}/${s.name}`),
  });
  return {
    name: "opengame",
    owner: { name: "OpenGame", email: "team@opengame.io" },
    metadata: { description: "Agent skills for making browser games and putting them on OpenGame." },
    plugins: [
      plugin("opengame", "Put a browser game on OpenGame: the CLI, the API, the SDK, deploys and jams.", "platform"),
      plugin("opengame-craft", "Make a browser game good: look, lighting, feel, audio, performance, testing and the rest.", "craft"),
    ],
  };
}

/**
 * The public repository's half: `skills/<name>/` with each skill's changelog beside it,
 * and `.claude-plugin/marketplace.json`. Only those two paths under `outDir` are
 * replaced, because the repository holds other things the mirror writes.
 */
export async function buildPublic(outDir, options = {}) {
  const { skills, manifest } = await buildSkills(options);
  await rm(join(outDir, "skills"), { recursive: true, force: true });
  await writeSkills(join(outDir, "skills"), skills, { changelogs: true });
  await mkdir(join(outDir, ".claude-plugin"), { recursive: true });
  await writeFile(join(outDir, ".claude-plugin", "marketplace.json"), JSON.stringify(marketplaceFor(skills), null, 2) + "\n");
  return { skills, manifest };
}

/**
 * What the npm package ships: the public layout above, so `dist/` reads like the public
 * repository's skills half and works as a marketplace folder of its own, plus the
 * manifest the CLI installs from, in `dist/skills/` beside the folders it lists, which is
 * the layout the CLI's own `dist/skills/` has. Rendered output only: the templates in
 * `skills/`, the renderer and limits.json stay in the source, so a skill on npm carries
 * the numbers and none of the notes. The whole of `dist/` is replaced, because a skill
 * deleted from the source must not linger in the next package.
 */
export async function buildPackage(outDir = join(here, "dist"), options = {}) {
  await rm(outDir, { recursive: true, force: true });
  const { skills, manifest } = await buildPublic(outDir, options);
  await writeFile(join(outDir, "skills", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { skills, manifest };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--lock")) {
      const { shut, published, problems } = await collectBothStates();
      if (problems.length) throw new Error(`Skill validation failed:\n  ${problems.join("\n  ")}`);
      const manifests = { shut: manifestFor(shut.skills, shut.version), published: manifestFor(published.skills, published.version) };
      await writeFile(LOCK, JSON.stringify(nextLock(manifests, await readLock(LOCK)), null, 2) + "\n");
      console.log(`Locked ${shut.skills.length} skills.`);
    } else if (args.includes("--public")) {
      const dir = args[args.indexOf("--public") + 1];
      if (!dir || dir.startsWith("--")) throw new Error("--public needs the folder to write into");
      const { skills } = await buildPublic(dir);
      console.log(`Wrote ${skills.length} skills and the marketplace into ${dir}.`);
    } else {
      const check = args.includes("--check");
      // A check holds the lock in both switch states as well as the one this build reads,
      // so a stale open digest is found now rather than on the day the switch is flipped.
      if (check) {
        const both = await collectBothStates();
        const lock = await readLock(LOCK);
        const problems = [...both.problems, ...(both.problems.length ? [] : [
          ...lockProblems(manifestFor(both.shut.skills, both.shut.version), lock).map((p) => `switch shut: ${p}`),
          ...lockProblems(manifestFor(both.published.skills, both.published.version), lock, { published: true }).map((p) => `switch open: ${p}`)])];
        if (problems.length) throw new Error(`Skill validation failed:\n  ${problems.join("\n  ")}`);
      }
      const { skills } = check ? await buildSkills() : await buildPackage();
      const craft = skills.filter((s) => s.family === "craft").length;
      console.log(`${check ? "Validated" : "Built"} ${skills.length} skills (${skills.length - craft} platform, ${craft} craft).`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

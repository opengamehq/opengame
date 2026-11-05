#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, existsSync, readFileSync } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { limitsNotes, notesIn } from "../packages/shared/scripts/limits-values.mjs";
import { INSTALL_CLOSED, RELEASE_REF, closedWordingProblems, installMarkdown, installsOpen, npmReleaseForBuild, releaseWorkflowApproved, writeInstallBlocks } from "../packages/shared/npm-release.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const PUBLIC_REPOSITORY = "https://github.com/opengamehq/opengame";

/* A Supabase project's own addresses, each of which names the project's ref: its host and its
   functions host, a pooler user, a dashboard link and the auth cookie's name. Nothing
   published carries one. The site reaches production through auth.opengame.io (whose DNS
   names the project, so this keeps the ref out of our source, not out of the world). Read by
   inspectPackage below and by the public mirror's scan. */
export const SUPABASE_PROJECT = /(?<![a-z0-9])[a-z0-9]{20}\.(?:[a-z-]+\.)?supabase\.(?:co|in)\b|\bpostgres\.[a-z0-9]{20}\b|supabase\.com\/dashboard\/project\/[a-z0-9]{20}\b|\bsb-[a-z0-9]{20}-auth-token\b/i;

/* Production's own project hosts, in the monorepo only: the file is a test fixture that the
   public mirror does not export, so in the public repository this is empty and the pattern
   above is the whole check. Their refs are refused anywhere, in any case, on their own. */
export function privateProjectRefs(base = root) {
  const file = join(base, "packages/shared/tests/fixtures/production-database.json");
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")).hosts.filter(host => /\.supabase\.(?:co|in)$/.test(host)).map(host => host.split(".")[0]);
}
/* What each release ships, and what its package must contain. `files` is the package's
   own `files` list, held equal to it, so what npm would pack and what this script stages
   cannot drift apart. `builds` are the workspaces built first: the CLI serves the SDK's
   browser bundle from `opengame dev`, and its build refuses to run without it. */
export const TARGETS = {
  cli: { name: "@opengamehq/cli", files: ["dist", "README.md", "AGENTS.md", "CHANGELOG.md"],
    entries: ["dist/cli.mjs", "dist/preflight-worker.mjs", "dist/skills/manifest.json", "dist/opengame-global.js"], builds: ["@opengamehq/sdk"] },
  sdk: { name: "@opengamehq/sdk", files: ["dist", "README.md", "AGENTS.md", "CHANGELOG.md", "AVATAR-SPEC.md", "examples"],
    entries: ["dist/index.js", "dist/index.d.ts"], builds: [], internal: ["dist/engine-package-build.json"] },
  skills: { name: "@opengamehq/skills", files: ["dist", "README.md", "CHANGELOG.md"],
    entries: ["dist/skills/manifest.json", "dist/.claude-plugin/marketplace.json", "dist/skills/opengame-router/SKILL.md"], builds: [] },
};
/* `internal` names build output that stays in the monorepo. The SDK build writes
   dist/engine-package-build.json, the receipt the engine integrations' packagers read from
   packages/sdk/dist in this repository: it lists every source file the SDK is built
   from, private ones included, with the digest of the whole limits.json. Nothing installed
   from npm reads it, so it is left out of the staged package and refused if it gets in. */
const targetFor = name => Object.entries(TARGETS).find(([, target]) => target.name === name)?.[0];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// Every package uses these release workspaces. The CLI's skills renderer reads
// shared limits and genres; no build imports the UI, hosting or Worker
// sources. Record this actual scope so unrelated parallel edits do not invalidate
// a private candidate or get described as part of its source provenance.
const SOURCE_SCOPE = ["packages/cli", "packages/sdk", "packages/protocol", "packages/preflight", "packages/shared", "packages/skills",
  "package.json", "package-lock.json", "npm-shrinkwrap.json", "turbo.json", "tsconfig.json", "tsconfig.base.json", "scripts/release.mjs"];
// undici preserves ws's public MIT attribution; PeerJS includes its public team
// support contact. Keep those exact vetted texts intact. A bare address or a
// changed notice/message still fails, as does any private address beside them.
const PUBLIC_ADDRESS_TEXT_SHA256 = new Set([
  "f82fc066e1840224d9ac668e71a3d6a2ed7c82f9f5a2dcb106b6edcb4003202c",
  "fa90a14fc02a997f5f4b8116e01596aa4d933a50592079f4efb67dd7ea3c6cb4",
]);

function publicAddressSpans(text) {
  return [...text.matchAll(/ws\. MIT License\. Einar Otto Stangvik <[^>\r\n]+>|It looks like you're using the cloud server\. You can email [^\s]+ to enable peer listing for your API key\./g)]
    .filter(match => PUBLIC_ADDRESS_TEXT_SHA256.has(sha256(match[0])))
    .map(match => [match.index, match.index + match[0].length]);
}

/** HEAD identifies the base commit, not an uncommitted candidate. Hash the
 * tracked and non-ignored untracked release inputs without storing their text
 * or filenames in the report. Build output and local credentials stay ignored.
 * This records source plus the lockfile; it does not attest the installed
 * dependency tree or prove a reproducible build. */
export async function captureSourceState(workspace = root) {
  const git = args => execFileSync("git", args, { cwd: workspace, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const commit = git(["rev-parse", "HEAD"]).trim();
  const listPaths = () => [...new Set(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...SOURCE_SCOPE]).split("\0").filter(Boolean))].sort();
  const paths = listPaths();
  const entries = [];
  for (const path of paths) {
    let handle;
    try {
      handle = await open(join(workspace, path), constants.O_RDONLY | constants.O_NOFOLLOW);
      const before = await handle.stat();
      if (!before.isFile()) throw new Error("source_type");
      const digest = createHash("sha256");
      let bytes = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) { bytes += chunk.length; digest.update(chunk); }
      const after = await handle.stat();
      if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)
        throw new Error("source_changed");
      entries.push({ path, bytes, executable: before.mode & 0o111, sha256: digest.digest("hex") });
    } catch (error) {
      if (error.code === "ENOENT") entries.push({ path, missing: true });
      else throw new Error("Release source could not be read consistently for provenance. Freeze the source and retry.");
    } finally { await handle?.close(); }
  }
  if (git(["rev-parse", "HEAD"]).trim() !== commit || JSON.stringify(listPaths()) !== JSON.stringify(paths))
    throw new Error("Release source changed while provenance was being recorded. Freeze the source and retry.");
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return { format: 1, kind: status ? "working-tree" : "commit", commit, workingTreeDirty: Boolean(status),
    statusSha256: sha256(status), inputsSha256: sha256(JSON.stringify(entries)), inputFileCount: entries.length,
    inputScope: SOURCE_SCOPE, installedDependenciesAttested: false };
}

export function assertSourceUnchanged(before, after) {
  if (before.commit !== after.commit || before.inputsSha256 !== after.inputsSha256)
    throw new Error("Release source changed during preparation. Freeze the source and prepare the package again.");
}

/** Inspect the built package, including bundled skills and examples. Source-only scans
 * miss files npm includes through a package's files list or a generated artifact. */
export async function inspectPackage(directory, expectedName, version) {
  const policy = JSON.parse(await readFile(join(root, "packages/shared/limits.json"), "utf8")).credentialPatterns;
  /* The notes in limits.json are for whoever edits a limit, never for a package on npm. The
     CLI's build refuses them as well; this is the check that cannot be skipped by building
     some other way. */
  const limitNotes = limitsNotes();
  const projectRefs = privateProjectRefs();
  const credentialPatterns = [...policy.content, ...policy.suspicious].map(({ pattern, flags }) => new RegExp(pattern, flags));
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (manifest.name !== expectedName || manifest.version !== version || !versionPattern.test(version)) throw new Error("Package identity or version does not match the release request.");
  const target = targetFor(expectedName);
  if (!target) throw new Error("Package identity does not match the release request.");
  for (const key of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (Object.keys(manifest[key] ?? {}).length) throw new Error(`Bundled packages must have no ${key}.`);
  }
  if (manifest.bundledDependencies || manifest.bundleDependencies) throw new Error("Nested bundled packages are not allowed.");
  const paths = [];
  async function walk(folder, prefix = "") {
    for (const name of (await readdir(folder)).sort()) {
      const relative = prefix + name;
      if (/[\x00-\x1f\x7f]/.test(relative)) throw new Error("Package filenames must not contain control characters.");
      if (credentialPatterns.some(pattern => pattern.test(relative))) throw new Error("Possible credential in a package filename. Inspect and remove it before release.");
      const path = join(folder, name);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !(info.isFile() || info.isDirectory())) throw new Error(`Package contains a link or special file: ${relative}`);
      if (/(?:^|\/)(?:\.env|\.git)(?:[./]|$)|(?:^|\/)(?:auth\.json|credentials|transcripts?|node_modules|\.opengame)(?:[./]|$)|\.map$/i.test(relative)) throw new Error(`Private or development file in package: ${relative}`);
      if (info.isDirectory()) { await walk(path, relative + "/"); continue; }
      const bytes = await readFile(path);
      const text = bytes.toString("utf8");
      const leaks = [
        /Bearer\s+[A-Za-z0-9_-]{32,}/i,
        /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+\//,
      ];
      const readable = text.replaceAll("\0", "");
      if ([...credentialPatterns, ...leaks].some(pattern => pattern.test(readable))) throw new Error(`Possible credential or private path in ${relative}. Inspect and remove it before release.`);
      if (SUPABASE_PROJECT.test(readable) || projectRefs.some(ref => readable.toLowerCase().includes(ref))) throw new Error(`${relative} names a Supabase project. Remove it before release.`);
      // A skill is published as it renders, never as the template it renders from. The
      // skills validator refuses any {{ in a rendered page, so one here is a template that
      // skipped the renderer, whatever formatter it starts with ({{mib ...}}, {{raw ...}}).
      if (target === "skills" && readable.includes("{{")) throw new Error(`${relative} is an unrendered skill template. Build the skills package before release.`);
      const notes = notesIn(readable, limitNotes);
      if (notes.length) throw new Error(`${relative} carries ${notes.length} limits.json notes (${notes.slice(0, 3).join(", ")}). Bundle limits.values.json instead before release.`);
      // The team's machines and the network between them, as the public mirror's
      // internal-host marker reads them. A provenance note naming a worker reached the CLI
      // bundle through the engine registry on 5 Nov 2026 while the mirror refused it. After
      // the notes, which name them too and have their own remedy.
      if (/\bog-[1-9](?:-gpu)?\b|\btailscale\b|\.ts\.net\b/i.test(readable)) throw new Error(`Possible credential or private path in ${relative}: it names one of the team's machines. Inspect and remove it before release.`);
      const publicNotices = publicAddressSpans(readable);
      for (const match of readable.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
        if (publicNotices.some(([start, end]) => match.index >= start && match.index + match[0].length <= end)) continue;
        if (!/@(?:opengame\.(?:io|gg)|example\.(?:com|org|net)|example\.test)$/i.test(match[0])) throw new Error(`Possible personal address in ${relative}. Inspect it before release.`);
      }
      paths.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  await walk(directory);
  for (const path of TARGETS[target].entries) if (!paths.some(file => file.path === path)) throw new Error(`Required package entry missing: ${path}`);
  for (const path of TARGETS[target].internal ?? []) if (paths.some(file => file.path === path)) throw new Error(`${path} is a build receipt for this repository's own tools and does not ship.`);
  if (target === "cli") {
    const problem = await sdkCopyProblem(directory);
    if (problem) throw new Error(problem);
  }
  return paths;
}

/** Every version the browser SDK names itself by in a built global bundle: the
 * `sdkVersion` it reports to a page and the `sdk` in each ready message it posts. */
export function embeddedSdkVersions(text) {
  return [...new Set([...text.matchAll(/\bsdk(?:Version)?:"([^"\\]*)"/g)].map(match => match[1]))];
}

/** The CLI serves its copy of the SDK to every game run under `opengame dev`, and that copy
 * reports a version to the page. Until 5 Nov 2026 the release built it with the CLI's version
 * (0.4.0) while the SDK itself was 0.2.0, so a game was told it ran an SDK that never
 * existed. The copy must name the SDK's own version and nothing else. */
async function sdkCopyProblem(directory) {
  const expected = JSON.parse(await readFile(join(root, "packages/sdk/package.json"), "utf8")).version;
  const found = embeddedSdkVersions(await readFile(join(directory, "dist/opengame-global.js"), "utf8"));
  if (found.length === 1 && found[0] === expected) return null;
  return `dist/opengame-global.js names SDK version ${found.length ? found.join(", ") : "nothing"}, and packages/sdk/package.json is ${expected}. ` +
    "Build the SDK with its own version before the CLI.";
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The metadata npm shows on the package page and checks provenance against. Held on the
 * source package and again on the staged manifest, so neither a source edit nor the
 * staging step can publish a package that names another repository, ships a different
 * file list, or asks npm for provenance itself: publishConfig.provenance forces it on,
 * and npm refuses provenance from a private repository, which this monorepo is. The
 * publish workflow decides provenance from the repository it runs in. */
export function publicMetadataProblems(manifest, target) {
  const expected = TARGETS[target];
  if (!expected) return ["unknown release target"];
  const problems = [];
  if (manifest.name !== expected.name) problems.push(`name must be ${expected.name}`);
  if (manifest.license !== "Apache-2.0") problems.push("license must be Apache-2.0, the public repository's");
  if (!sameJson(manifest.repository, { type: "git", url: `git+${PUBLIC_REPOSITORY}.git`, directory: `packages/${target}` }))
    problems.push(`repository must be { type: git, url: git+${PUBLIC_REPOSITORY}.git, directory: packages/${target} }`);
  if (manifest.homepage !== "https://docs.opengame.io") problems.push("homepage must be https://docs.opengame.io");
  if (!sameJson(manifest.bugs, { url: `${PUBLIC_REPOSITORY}/issues` })) problems.push(`bugs must be { url: ${PUBLIC_REPOSITORY}/issues }`);
  if (typeof manifest.description !== "string" || !manifest.description.trim()) problems.push("description is required");
  if (!Array.isArray(manifest.keywords) || !manifest.keywords.length || manifest.keywords.some(word => typeof word !== "string" || !word)) problems.push("keywords are required");
  if (!sameJson(manifest.publishConfig, { access: "public" })) problems.push("publishConfig must be exactly { access: public }");
  if (!sameJson(manifest.files, expected.files)) problems.push(`files must be ${JSON.stringify(expected.files)}`);
  return problems;
}

/** The source package carries the public metadata and stays private. Private is what makes
 * npm itself refuse a publish from the source folder, with or without --ignore-scripts,
 * which is the flag this repository tells everybody to use and which skips a
 * prepublishOnly. The staged manifest is the one that drops it, here and only here, after
 * the audit. A security review on 5 Nov 2026 found the source packages public and one
 * skippable script between a stray `npm publish --ignore-scripts` and the registry. The
 * prepublishOnly stays as a second refusal with a sentence. The root manifest stays private
 * so the root itself can never be published. */
export function sourceManifestProblems(manifest, target, rootManifest) {
  const problems = publicMetadataProblems(manifest, target);
  if (manifest.private !== true) problems.push("the source package must stay private; release.mjs drops it from the staged manifest");
  if (!/process\.exit\(1\)/.test(manifest.scripts?.prepublishOnly ?? "")) problems.push("scripts.prepublishOnly must refuse a publish from source");
  if (rootManifest?.private !== true) problems.push("the repository root package.json must stay private");
  return problems;
}

/** Whether npm has ever heard of the package. A first publish is allowed only while the
 * answer is no, because npm lets a trusted publisher be set only on a package that exists,
 * so the very first version of each has to go out with an owner's own login; every later
 * version goes through the workflow. Fails closed: anything but a clean 404 refuses. */
export async function packageUnpublished(name, fetcher = fetch) {
  const response = await fetcher(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, { signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return true;
  if (response.ok) return false;
  throw new Error(`The npm registry answered ${response.status} for ${name}, so whether it was ever published is unknown.`);
}

/** Compare the bytes inside the archive with the bytes reviewed before packing.
 * Listing and reading to stdout avoids extracting links or paths to disk. npm's
 * integrity identifies an archive; it says nothing about which bytes we reviewed. */
export function verifyArchiveContents(archivePath, files) {
  const tar = args => {
    try { return execFileSync("tar", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }); }
    catch { throw new Error("The archive could not be listed consistently for package review."); }
  };
  const expected = files.map(file => "package/" + file.path).sort();
  const listed = tar(["-tzf", archivePath]).trimEnd().split("\n").sort();
  if (JSON.stringify(listed) !== JSON.stringify(expected)) throw new Error("The archive contains a different file list from the inspected package.");
  if (tar(["-tvzf", archivePath]).trimEnd().split("\n").some(line => !line.startsWith("-")))
    throw new Error("The archive contains a link or special file.");
  for (const file of files) {
    let bytes;
    try { bytes = execFileSync("tar", ["-xOzf", archivePath, "--", "package/" + file.path], { maxBuffer: Math.max(1024 * 1024, file.bytes + 1) }); }
    catch { throw new Error("The archive could not be read consistently for package review."); }
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw new Error("Archived file bytes differ from the inspected package. Freeze the source and prepare the package again.");
  }
}

/** The workspaces a release builds, in order, each with the version it is stamped with. The
 * requested version stamps the package being released; a workspace built first for it is
 * stamped with its own, since the CLI ships the SDK's browser bundle as the SDK built it, and
 * that bundle tells every game which SDK it is running. */
export async function releaseBuilds(target, version, base = root) {
  const builds = [];
  for (const workspace of TARGETS[target].builds) {
    const own = JSON.parse(await readFile(join(base, "packages", targetFor(workspace), "package.json"), "utf8")).version;
    builds.push([workspace, own]);
  }
  return [...builds, [TARGETS[target].name, version]];
}

/** Empties the dist folder of every workspace a release is about to build. Neither the SDK's
 * build nor the CLI's clears its own, and the package stages dist whole, so a file an older
 * build left in a reused clone (a dist/multiplayer.js from before multiplayer left the SDK)
 * would have shipped as if this build had made it. An SDK build that is running, or that
 * crashed and left its lock, is refused rather than swept away with the lock: the lock's own
 * message asks for a person to look at it. */
export async function clearBuildOutputs(workspaces, base = root) {
  for (const workspace of workspaces) {
    const dist = join(base, "packages", targetFor(workspace), "dist");
    try { await lstat(join(dist, ".engine-package-build.lock")); throw new Error(`${dist} holds an SDK build lock. Finish or inspect that build before releasing.`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await rm(dist, { recursive: true, force: true });
  }
}

/** The environment one release build runs in. OPENGAME_RELEASE_NPM_OPEN tells every build
 * that reads the switch (packages/cli/build.mjs's bundle, and the skills renderer the skills
 * package and the CLI's dist/skills both come from) to read it as published, through
 * npmReleaseForBuild in packages/shared/npm-release.mjs. It is set only when asked for, and
 * an inherited one is removed, so a local candidate cannot be opened by the caller's shell. */
export function buildEnvironment(stamp, { approved = false, firstPublish = false } = {}, env = process.env) {
  const { OPENGAME_RELEASE_NPM_OPEN: _inherited, ...rest } = env;
  const mode = approved ? "approved" : firstPublish ? "first-publish" : null;
  return { ...rest, OPENGAME_RELEASE_VERSION: stamp, ...(mode ? { OPENGAME_RELEASE_NPM_OPEN: mode } : {}) };
}

/** Refuses --approved outside the manually approved workflow on the release branch, which
 * npm-release.mjs names once for this and for the builds. */
export function assertPublishEnvironment({ approved = false, firstPublish = false } = {}, env = process.env) {
  if (approved && !releaseWorkflowApproved(env)) throw new Error(`Public staging requires the manually approved release environment on ${RELEASE_REF.replace("refs/heads/", "")}.`);
  if (approved && firstPublish) throw new Error("--first-publish is for an owner's own machine, never the workflow.");
}

/** The remote a first publish must be cloned from, in the three forms git writes for it. */
export const publicRemote = url => /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)opengamehq\/opengame(?:\.git)?$/.test(url);

/* The order the first publishes go in, sdk, then skills, then cli: each package names the
   ones before it, and the CLI, which names all three and ships the skills, goes last. */
export const FIRST_PUBLISH_ORDER = ["sdk", "skills", "cli"];

/** The packages whose install step a staged package may print as a command: every one once
 * the workflow publishes (it publishes only names npm already has), and for a first publish
 * the package itself and whichever of the others npm already has. Staging as published used
 * to open all three at once, so the first SDK told people to install the CLI from npm while
 * npm had nothing by that name. A first publish out of order is refused, because the CLI's
 * bundled skills would otherwise ship saying the CLI is not on npm. A local candidate gets
 * null: it keeps the committed switch. */
export async function openInstallNames(target, { approved = false, firstPublish = false } = {}, fetcher = fetch) {
  if (approved) return Object.keys(TARGETS);
  if (!firstPublish) return null;
  const open = [target];
  for (const other of Object.keys(TARGETS)) if (other !== target && !await packageUnpublished(TARGETS[other].name, fetcher)) open.push(other);
  const missing = FIRST_PUBLISH_ORDER.slice(0, FIRST_PUBLISH_ORDER.indexOf(target)).filter(name => !open.includes(name));
  if (missing.length) throw new Error(`${missing.map(name => TARGETS[name].name).join(" and ")} must be on npm before ${TARGETS[target].name}: the first publishes go ${FIRST_PUBLISH_ORDER.join(", then ")}.`);
  return FIRST_PUBLISH_ORDER.filter(name => open.includes(name));
}

/* The package's own prose, which ships as it is in the source folder. */
const STAGED_PROSE = ["README.md", "AGENTS.md", "CHANGELOG.md"];
const ALL_NAMES = Object.keys(TARGETS);
/* An install step is a package's, or the same step addressed to an agent (`cli-agent`). */
const packageOf = step => step.replace(/-agent$/, "");

/** A shipped text rewritten for `release`, opening only the steps for `names`: every marked
 * install block, and each shut sentence standing on a line of its own. That second form is
 * what scripts/docs-gen.mjs writes into AGENTS.md where for-agents.mdx has an install
 * component, so with every name open the result is what docs:gen would write with the switch
 * open. */
export function stageInstallText(text, release, names = ALL_NAMES) {
  if (!installsOpen(release)) return writeInstallBlocks(text, release);
  let staged = writeInstallBlocks(text, { ...release, published: false });
  for (const [step, sentence] of Object.entries(INSTALL_CLOSED)) {
    if (!names.includes(packageOf(step))) continue;
    const line = new RegExp(`^([ \\t]*)${sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`, "gm");
    staged = staged.replace(line, (_whole, indent) => installMarkdown(step, release).split("\n").map(row => indent + row).join("\n"));
  }
  return staged;
}

/** Lines of a staged text that still say an opened package is not on npm. With every name
 * open, any "not on npm yet" is one; with some, only the claim about one of them. */
export function stagedClosedProblems(text, release, names = ALL_NAMES) {
  if (!installsOpen(release)) return [];
  if (ALL_NAMES.every(name => names.includes(name))) return closedWordingProblems(text, release);
  const claims = [...new Set(Object.entries(INSTALL_CLOSED).filter(([step]) => names.includes(packageOf(step)))
    .map(([, sentence]) => sentence.match(/^.*?not on npm yet/i)?.[0]).filter(Boolean))];
  return text.split("\n").flatMap((line, index) => claims.some(claim => line.toLowerCase().includes(claim.toLowerCase())) ? [`line ${index + 1}: ${line.trim()}`] : []);
}

/** Rewrites the staged prose for `release` and `names`, and refuses a file that still says an
 * opened package is not on npm. */
export async function stageProse(staging, files, release, names = ALL_NAMES) {
  for (const file of files.filter(name => STAGED_PROSE.includes(name))) {
    const path = join(staging, file);
    const text = stageInstallText(await readFile(path, "utf8"), release, names);
    const problems = stagedClosedProblems(text, release, names);
    if (problems.length) throw new Error(`The staged ${file} is being published and still says the package is not on npm: ${problems.join("; ")}.`);
    await writeFile(path, text);
  }
}

const npmBuild = (workspace, env, base) => execFileSync("npm", ["run", "build", "--workspace", workspace], { cwd: base, stdio: "inherit", env });

/* `base`, `build` and `fetcher` are for the tests, which release from a scratch repository
   with a build of their own; the command line passes none of them. */
export async function prepareRelease({ target, version, outDir, approved = false, firstPublish = false, base = root, build = npmBuild, fetcher = fetch }) {
  const name = Object.hasOwn(TARGETS, target) ? TARGETS[target].name : undefined;
  if (!name || typeof version !== "string" || !versionPattern.test(version) || typeof outDir !== "string" || !outDir) throw new Error("Use release cli|sdk|skills --version <major.minor.patch> --out-dir <folder>.");
  assertPublishEnvironment({ approved, firstPublish });
  if (firstPublish) {
    // The first version of each package is published by hand, from a clean clone of the
    // public repository, opengamehq/opengame, at exactly its default branch, so the source
    // the package names is readable and its changelog is the public one, and only while npm
    // has never seen the name, so this path cannot become a way round the workflow for any
    // later release. origin/HEAD is the clone's default branch, which names no branch here,
    // so the mirror carries this unchanged.
    const git = args => execFileSync("git", args, { cwd: base, encoding: "utf8" }).trim();
    if (git(["status", "--porcelain=v1", "--untracked-files=normal"])) throw new Error("--first-publish needs a clean checkout.");
    if (!publicRemote(git(["remote", "get-url", "origin"]))) throw new Error("--first-publish runs in a clone of https://github.com/opengamehq/opengame, the public repository the package names.");
    if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", "origin/HEAD"])) throw new Error("--first-publish needs HEAD to be the public repository's default branch. Run git fetch origin && git switch --detach origin/HEAD first.");
    /* The two checks above read local state, which a checkout of the private monorepo can be
       made to show by renaming its remote. The remote's own answer cannot be: a commit of the
       private history is never the public repository's default branch. */
    if (git(["ls-remote", "origin", "HEAD"]).split(/\s+/)[0] !== git(["rev-parse", "HEAD"])) throw new Error("--first-publish needs HEAD to be the commit the public repository's default branch names now. Run git fetch origin && git switch --detach origin/HEAD first.");
    if (!await packageUnpublished(name, fetcher)) throw new Error(`${name} is already on npm. Every later version goes through .github/workflows/publish-packages.yml.`);
  }
  const source = join(base, "packages", target);
  const beforeBuild = await captureSourceState(base);
  const original = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const sourceProblems = sourceManifestProblems(original, target, JSON.parse(await readFile(join(base, "package.json"), "utf8")));
  if (sourceProblems.length) throw new Error(`packages/${target}/package.json is not ready to publish: ${sourceProblems.join("; ")}.`);
  // npm versions are permanent, so a typo in the workflow's version box must not become one
  // the source never had. The build would bake the typed version into the CLI and say so.
  if (original.version !== version) throw new Error(`packages/${target}/package.json is ${original.version}, and the release asked for ${version}. Change the source version in a reviewed commit first.`);
  if ((approved || firstPublish) && beforeBuild.workingTreeDirty) throw new Error("The publishing checkout must be clean before building.");
  // A local candidate stays private so it cannot be published by mistake; only the
  // approved run in the release environment, or an owner's first publish, stages one.
  const publishable = approved || firstPublish;
  /* The one decision about staging as published, npmReleaseForBuild, made with the
     environment a publishing build gets, so the prose staged here and the builds read the
     switch through the same guard. A local candidate gets the committed switch back. */
  const npmRelease = npmReleaseForBuild(JSON.parse(await readFile(join(base, "packages/shared/npm-release.json"), "utf8")), buildEnvironment(version, { approved, firstPublish }));
  const openNames = await openInstallNames(target, { approved, firstPublish }, fetcher) ?? ALL_NAMES;
  /* The CLI's bundle and the skills read the switch whole, shut or open, because the skills
     lock records a digest for those two states only. So the builds are told to open it only
     once every package will be on npm, which for a first publish in order is the CLI's; the
     skills package's first version is built shut and opens just its own prose. */
  const buildsOpen = publishable && ALL_NAMES.every(other => openNames.includes(other));
  const builds = await releaseBuilds(target, version, base);
  await clearBuildOutputs(builds.map(([workspace]) => workspace), base);
  for (const [workspace, stamp] of builds) build(workspace, buildEnvironment(stamp, buildsOpen ? { approved, firstPublish } : {}), base);
  const temporary = await mkdtemp(join(tmpdir(), "opengame-release-"));
  const staging = join(temporary, "package");
  try {
    await mkdir(staging);
    const allowed = TARGETS[target].files;
    for (const file of allowed) {
      try { await lstat(join(source, file)); } catch { throw new Error(`packages/${target}/${file} is in the package's files list and does not exist.`); }
      await cp(join(source, file), join(staging, file), { recursive: true, dereference: false });
    }
    for (const file of TARGETS[target].internal ?? []) await rm(join(staging, file), { force: true });
    await stageProse(staging, allowed, npmRelease, openNames);
    const { devDependencies, scripts, private: _private, ...metadata } = original;
    const staged = { ...metadata, version, ...(publishable ? {} : { private: true }), files: allowed };
    const stagedProblems = publicMetadataProblems(staged, target);
    if (stagedProblems.length) throw new Error(`The staged manifest lost its public metadata: ${stagedProblems.join("; ")}.`);
    await writeFile(join(staging, "package.json"), JSON.stringify(staged, null, 2) + "\n");
    const files = await inspectPackage(staging, name, version);
    const destination = resolve(outDir);
    await mkdir(destination, { recursive: true });
    const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], { cwd: staging, encoding: "utf8" }))[0];
    const packedPaths = packed.files.map(file => file.path).sort();
    if (JSON.stringify(packedPaths) !== JSON.stringify(files.map(file => file.path).sort())) throw new Error("npm packed a different file list from the inspected package.");
    const archive = await readFile(join(temporary, packed.filename));
    verifyArchiveContents(join(temporary, packed.filename), files);
    if (!(await readFile(join(temporary, packed.filename))).equals(archive)) throw new Error("The archive changed during package review. Prepare the package again.");
    const integrity = "sha512-" + createHash("sha512").update(archive).digest("base64");
    if (packed.integrity !== integrity) throw new Error("The packed archive does not match npm's reported integrity.");
    const sourceState = await captureSourceState(base);
    assertSourceUnchanged(beforeBuild, sourceState);
    if (publishable && sourceState.workingTreeDirty) throw new Error("The publishing checkout changed before package preparation finished.");
    const opened = installsOpen(npmRelease) ? openNames : [];
    const report = { format: 1, package: name, version, private: !publishable, ...(firstPublish ? { firstPublish: true } : {}),
      installWording: opened.length === ALL_NAMES.length ? "published" : opened.length ? "partly-published" : "not-on-npm", installCommands: opened,
      sourceCommit: sourceState.commit, sourceState: { ...sourceState, inputsMatchBeforeAndAfterPreparation: true },
      toolchain: { node: process.version, platform: process.platform, arch: process.arch },
      archive: packed.filename, sha256: sha256(archive), integrity, files };
    await writeFile(join(destination, packed.filename), archive, { flag: "wx" });
    await writeFile(join(destination, `${target}-release.json`), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    return report;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  try {
    const report = await prepareRelease({ target: args[0], version: flag("--version"), outDir: flag("--out-dir"), approved: args.includes("--approved"), firstPublish: args.includes("--first-publish") });
    console.log(`Prepared ${report.package}@${report.version}; private=${report.private}. ${report.files.length} inspected files. Nothing was published.`);
    if (report.firstPublish) console.log(`Publish it with your own npm login, two-factor code at hand:\n  npm publish ${join(resolve(flag("--out-dir")), report.archive)} --access public --ignore-scripts`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

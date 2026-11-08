/**
 * The build and the validator. Every rule is shown failing on a planted skill before
 * the real skills are trusted to pass it, because a validator that never fires reads
 * exactly like a clean set of skills.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPublic, buildSkills, collectBothStates, collectSkills, lockProblems, manifestFor, nextLock } from "../build.mjs";
import { loadContext, render } from "../lib/render.mjs";
import { handTypedLimits, readRules, typedLaunchDates, validateSkill } from "../lib/validate.mjs";

const good = `---
name: opengame-example
description: An example skill. Use when the person says example.
metadata:
  version: "1.0.0"
---

# Example

Read [references/more.md](references/more.md).
`;
const craftBody = (tags) => `---
name: opengame-example
description: An example craft skill. Use when the person says example.
metadata:
  version: "1.0.0"
---

## Rules

### A rule
${tags}
`;
const allTags = [
  "- **Invariant:** Something stays true.",
  "- **Technique:** One way to get there.",
  "- **Reference configuration:** AW: 0.35 m.",
  "- **Applies when:** Human scale.",
  "- **Verify:** Walk it.",
].join("\n");

test("a well-formed skill passes, and each rule fires on its own planted defect", () => {
  const ok = { name: "opengame-example", family: "platform", files: { "SKILL.md": good, "references/more.md": "More." } };
  assert.deepEqual(validateSkill(ok), []);
  const cases = [
    [{ ...ok, name: "example" }, /opengame-/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace("Use when", "Load if") } }, /Use when/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace("name: opengame-example", "name: opengame-other") } }, /folder is/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good + "\n".repeat(300) } }, /the limit is 300/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good + "\nA dash — here.\n" } }, /em dash/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good + "\n{{mib nowhere}}\n" } }, /unresolved template/],
    [{ ...ok, files: { "SKILL.md": good } }, /links references\/more.md, which is not shipped/],
    [{ ...ok, files: { ...ok.files, "references/orphan.md": "x" } }, /nothing links to this file/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace("description: An", "description: <b>An") } }, /angle brackets/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace("An example skill.", "Note: an example skill.") } }, /plain YAML value/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace("An example skill.", "An example skill - with a dash.") } }, /as a dash/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace("An example skill.", "A".repeat(490)) } }, /the limit is 500/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace('metadata:\n  version: "1.0.0"\n', "") } }, /metadata.version is required/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace('"1.0.0"', '"1.0"') } }, /major.minor.patch/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace('"1.0.0"', '"1.0.0-beta.1"') } }, /major.minor.patch/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace('  version: "1.0.0"\n', '  version: "1.0.0"\n  internal: true\n') } }, /unexpected metadata keys: internal/],
    [{ ...ok, files: { ...ok.files, "SKILL.md": good.replace("metadata:\n", "  stray: x\nmetadata:\n") } }, /cannot read frontmatter line/],
  ];
  for (const [skill, pattern] of cases) {
    const problems = validateSkill(skill);
    assert.ok(problems.some((p) => pattern.test(p)), `${pattern} not raised; got ${problems.join(" | ")}`);
  }
});

test("links resolve against the file that holds them", () => {
  const files = { "SKILL.md": good, "references/more.md": "See [the rest](rest.md).", "references/rest.md": "Rest." };
  assert.deepEqual(validateSkill({ name: "opengame-example", family: "platform", files }), []);
  const broken = { ...files, "references/more.md": "See [the rest](missing.md)." };
  assert.ok(validateSkill({ name: "opengame-example", family: "platform", files: broken }).some((p) => p.includes("references/missing.md")));
});

test("a craft rule needs all five tags, in order, with numbers only where they are attributed", () => {
  const skill = (body) => ({ name: "opengame-example", family: "craft", files: { "SKILL.md": craftBody(body) } });
  assert.deepEqual(validateSkill(skill(allTags)), []);
  const missing = validateSkill(skill(allTags.split("\n").filter((l) => !l.includes("Applies when")).join("\n")));
  assert.ok(missing.some((p) => /expected Invariant \/ Technique/.test(p)), missing.join(" | "));
  const reordered = allTags.split("\n"); [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.ok(validateSkill(skill(reordered.join("\n"))).some((p) => /in that order/.test(p)));
  for (const tag of ["Invariant", "Technique", "Applies when"]) {
    const numbered = allTags.replace(new RegExp(`(\\*\\*${tag}:\\*\\*) [^\\n]*`), "$1 Keep it under 2 mm.");
    const problems = validateSkill(skill(numbered));
    assert.ok(problems.some((p) => p.includes(`${tag} states a measured number`)), `${tag}: ${problems.join(" | ")}`);
  }
  assert.ok(validateSkill({ name: "opengame-example", family: "craft", files: { "SKILL.md": good, "references/more.md": "x" } }).some((p) => /## Rules/.test(p)));
});

test("templates render limits and refuse a path that does not exist", () => {
  const context = loadContext();
  assert.equal(render("{{mib bundle.archiveBytesMax}}", context), `${context.limits.bundle.archiveBytesMax / 1048576} MiB`);
  assert.equal(render("{{n bundle.fileCountMax}}", context), context.limits.bundle.fileCountMax.toLocaleString("en-US"));
  assert.equal(render("{{literal 256}}", context), "256");
  assert.match(render("{{genres}}", context), /`shooter-survival`/);
  assert.throws(() => render("{{mib bundle.nothingHere}}", context), /limits.json has no bundle.nothingHere/);
  assert.throws(() => render("{{shout bundle.fileCountMax}}", context), /unknown formatter/);
  assert.equal(render('{"a":{"b":1}}', context), '{"a":{"b":1}}', "JSON closing braces are not a template");
});

test("a limit typed by hand in a platform skill is found, outside code examples", () => {
  const { limits } = loadContext();
  const archive = limits.bundle.archiveBytesMax / 1048576;
  assert.equal(handTypedLimits(`Archives up to ${archive} MiB.`, limits).length, 1);
  assert.equal(handTypedLimits("Archives up to {{mib bundle.archiveBytesMax}}.", limits).length, 0);
  assert.equal(handTypedLimits(`\`\`\`js\nconst max = ${limits.bundle.fileCountMax}\n\`\`\``, limits).length, 0);
  assert.equal(handTypedLimits(`At most ${limits.bundle.fileCountMax.toLocaleString("en-US")} files.`, limits).length, 1);
  // The small limits, which prose quotes most, and the unit conversions the renderer makes.
  assert.equal(handTypedLimits(`Up to ${limits.platform.deploy.uploadAttemptsMax} upload attempts each.`, limits).length, 1);
  assert.equal(handTypedLimits(`Approve within ${limits.platform.device.expiresSeconds / 60} minutes.`, limits).length, 1);
  assert.equal(handTypedLimits(`At most ${limits.jam.entriesPerCreator} entries each.`, limits).length, 1);
  assert.equal(handTypedLimits("Up to {{raw platform.deploy.uploadAttemptsMax}} upload attempts.", limits).length, 0);
  // A numbered step or a count that is not a limit stays quiet.
  assert.equal(handTypedLimits("1. Run the thing.\nStep 2 of 3.\nTwo players, 4 corners.", limits).length, 0);
});

test("every bundled skill validates, and the registry, folders and families agree", async () => {
  const { skills, problems } = await collectSkills();
  assert.deepEqual(problems, []);
  const registry = JSON.parse(await readFile(new URL("../skills.json", import.meta.url), "utf8"));
  assert.deepEqual(skills.map((s) => s.name).sort(), registry.skills.map((s) => s.name).sort());
  const platform = skills.filter((s) => s.family === "platform").map((s) => s.name).sort();
  assert.deepEqual(platform, ["opengame-api", "opengame-cli", "opengame-deploy", "opengame-jam", "opengame-router", "opengame-sdk"]);
  const craft = skills.filter((s) => s.family === "craft").map((s) => s.name).sort();
  assert.deepEqual(craft, ["accessibility", "assets", "audio", "characters", "depth", "front-end", "game-feel", "lighting", "look",
    "performance", "quality-bar", "scene-audit", "verification", "world-physics",
    "weapons", "enemies", "loading", "mobile", "stability", "capture", "production"].sort().map((n) => `opengame-${n}`));
  for (const skill of skills.filter((s) => s.family === "craft")) {
    const rules = readRules(skill.files["SKILL.md"]);
    assert.ok(rules.length >= 4, `${skill.name} has ${rules.length} rules`);
  }
});

test("the plan's four helpers ship inside their skills and nothing ships a test", async () => {
  const { skills } = await collectSkills();
  const files = Object.fromEntries(skills.map((s) => [s.name, Object.keys(s.files)]));
  assert.ok(files["opengame-game-feel"].includes("helpers/spring.js"));
  assert.ok(files["opengame-lighting"].includes("helpers/light-pool.js"));
  assert.ok(files["opengame-audio"].includes("helpers/audio-chain.js"));
  assert.ok(files["opengame-scene-audit"].includes("helpers/scene-audit.js"));
  assert.ok(!Object.values(files).flat().some((f) => /\.test\./.test(f)));
});

test("a build writes every rendered file and a manifest whose digests match", async () => {
  const out = await mkdtemp(join(tmpdir(), "og-skills-"));
  try {
    const { manifest } = await buildSkills({ outDir: out });
    const written = JSON.parse(await readFile(join(out, "manifest.json"), "utf8"));
    assert.deepEqual(written, manifest);
    assert.equal(written.skills.length, 27);
    assert.deepEqual(written.skills.filter(skill => skill.default).map(skill => skill.name), ["opengame-deploy", "opengame-quality-bar", "opengame-router"]);
    const deploy = await readFile(join(out, "opengame-deploy", "SKILL.md"), "utf8");
    assert.ok(!deploy.includes("{{"));
    // Sizes render as units: the archive cap is GiB since the one flow, the file caps MiB.
    assert.match(deploy, /\d+(?:\.\d+)? [MG]iB/);
    const { createHash } = await import("node:crypto");
    for (const skill of written.skills) for (const file of skill.files) {
      const bytes = await readFile(join(out, skill.name, file.path));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, `${skill.name}/${file.path}`);
    }
  } finally { await rm(out, { recursive: true, force: true }); }
});

test("a build refuses an invalid skill and writes nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "og-skills-src-"));
  const out = join(root, "out");
  try {
    await mkdir(join(root, "skills", "opengame-bad"), { recursive: true });
    await writeFile(join(root, "skills", "opengame-bad", "SKILL.md"), good.replace("opengame-example", "opengame-bad"));
    await writeFile(join(root, "skills.json"), JSON.stringify({ skills: [{ name: "opengame-bad", family: "platform" }] }));
    await assert.rejects(buildSkills({ outDir: out, sourceDir: join(root, "skills"), registryPath: join(root, "skills.json") }), /references\/more.md/);
    await assert.rejects(readdir(out));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("no bundled skill teaches multiplayer, which the SDK does not have", async () => {
  const { skills } = await collectSkills();
  const hits = skills.flatMap((s) => Object.entries(s.files).flatMap(([path, text]) => String(text).split("\n")
    .map((line, i) => /multiplayer|\blobb(?:y|ies)\b|netcode|\bpeerjs\b/i.test(line) ? `${s.name}/${path}:${i + 1}` : null).filter(Boolean)));
  assert.deepEqual(hits, []);
});


test("the small starting set stays separate from specialists", async () => {
  const { skills, problems } = await collectSkills();
  assert.deepEqual(problems, []);
  assert.deepEqual(skills.filter(skill => skill.default).map(skill => skill.name),
    ["opengame-deploy", "opengame-quality-bar", "opengame-router"]);
  assert.equal(skills.find(skill => skill.name === "opengame-scene-audit").default, false);
  const router = skills.find(skill => skill.name === "opengame-router");
  assert.ok(router.files["references/process.md"]);
});

/** A planted skill set in a temporary folder: `skills` maps a name to its SKILL.md text
 * and changelog, so the lock and changelog rules can be shown failing on purpose. */
async function planted(skills) {
  const root = await mkdtemp(join(tmpdir(), "og-skills-lock-"));
  for (const [name, { skill, changelog }] of Object.entries(skills)) {
    await mkdir(join(root, "skills", name, "references"), { recursive: true });
    await writeFile(join(root, "skills", name, "SKILL.md"), skill);
    await writeFile(join(root, "skills", name, "references", "more.md"), "More.");
    if (changelog !== undefined) await writeFile(join(root, "skills", name, "CHANGELOG.md"), changelog);
  }
  await writeFile(join(root, "skills.json"), JSON.stringify({ skills: Object.keys(skills).map((name) => ({ name, family: "platform" })) }));
  return { root, sourceDir: join(root, "skills"), registryPath: join(root, "skills.json"), lockPath: join(root, "skills.lock.json") };
}
const at = (version, extra = "") => good.replace('"1.0.0"', `"${version}"`) + extra;
/** The lock `--lock` would write for a planted set: both switch states, held to `lock`. */
const relock = async (set, lock) => {
  const { shut, published, problems } = await collectBothStates(set);
  assert.deepEqual(problems, []);
  return nextLock({ shut: manifestFor(shut.skills, shut.version), published: manifestFor(published.skills, published.version) }, lock);
};
const log = (...versions) => `# opengame-example changelog\n\n${versions.map((v) => `## ${v}\n\nChanged.\n`).join("\n")}`;

test("a changed skill cannot ship under the version it was released at", async () => {
  const set = await planted({ "opengame-example": { skill: at("1.0.0"), changelog: log("1.0.0") } });
  try {
    await assert.rejects(buildSkills(set), /not in skills.lock.json/);
    const lock = await relock(set, null);
    await writeFile(set.lockPath, JSON.stringify(lock));
    await buildSkills(set);

    // The same version with different bytes is refused, by the build and by the lock.
    await writeFile(join(set.sourceDir, "opengame-example", "SKILL.md"), at("1.0.0", "\nA new line.\n"));
    await assert.rejects(buildSkills(set), /content changed and its version is still 1\.0\.0/);
    await assert.rejects(relock(set, lock), /1\.0\.0 is not newer than the released 1\.0\.0/);

    // A bump without a changelog entry is refused; with one, the lock moves and the build passes.
    await writeFile(join(set.sourceDir, "opengame-example", "SKILL.md"), at("1.1.0", "\nA new line.\n"));
    assert.ok((await collectSkills(set)).problems.some((p) => /newest entry is "1\.0\.0" and SKILL.md says 1\.1\.0/.test(p)));
    await writeFile(join(set.sourceDir, "opengame-example", "CHANGELOG.md"), log("1.1.0", "1.0.0"));
    assert.deepEqual((await collectSkills(set)).problems, []);
    await assert.rejects(buildSkills(set), /SKILL.md says 1\.1\.0 and skills.lock.json records 1\.0\.0/);
    await writeFile(set.lockPath, JSON.stringify(await relock(set, lock)));
    await buildSkills(set);

    // Going backwards is refused even with a matching changelog.
    await writeFile(join(set.sourceDir, "opengame-example", "SKILL.md"), at("1.0.1", "\nAnother line.\n"));
    await writeFile(join(set.sourceDir, "opengame-example", "CHANGELOG.md"), log("1.0.1", "1.1.0", "1.0.0"));
    const released = JSON.parse(await readFile(set.lockPath, "utf8"));
    await assert.rejects(relock(set, released), /1\.0\.1 is not newer than the released 1\.1\.0/);
  } finally { await rm(set.root, { recursive: true, force: true }); }
});

/* npm-release.json decides what {{install cli}} prints, and a package being published renders
   its skills with the switch open before the committed file says so. Neither is a change in
   what a skill teaches, so the lock holds a digest for each state and flipping the switch
   needs no bump. A real change at the same version is still refused, in either state, and so
   is a change that shows only with the switch open. */
test("the install switch needs no bump, and a change at the same version is refused in either state", async (t) => {
  const set = await planted({ "opengame-example": { skill: at("1.0.0", "\n## Install\n\n{{install cli}}\n"), changelog: log("1.0.0") } });
  t.after(() => rm(set.root, { recursive: true, force: true }));
  const { npmRelease } = loadContext({ env: {} });
  const shut = { ...npmRelease, scopeOwned: true, published: false }, open = { ...npmRelease, scopeOwned: true, published: true };
  const lock = await relock(set, null);
  const entry = lock.skills["opengame-example"];
  assert.notEqual(entry.digest, entry.digestPublished, "the two states render differently");
  await writeFile(set.lockPath, JSON.stringify(lock));
  const skillIn = async (npmRelease) => (await buildSkills({ ...set, npmRelease })).skills[0].files["SKILL.md"];
  assert.match(await skillIn(shut), /The CLI is not on npm yet\./);
  assert.match(await skillIn(open), /```bash\nnpm i -g @opengamehq\/cli\n```/);
  assert.doesNotMatch(await skillIn(open), /not on npm yet/);
  assert.deepEqual(await relock(set, lock), lock, "relocking either state changes nothing");

  // The open state only: a different package name is a different instruction.
  await assert.rejects(buildSkills({ ...set, npmRelease: { ...open, packages: { ...open.packages, cli: "@opengamehq/other" } } }), /content changed and its version is still 1\.0\.0/);
  // Each state is held to its own digest, not to whichever one matches.
  await writeFile(set.lockPath, JSON.stringify({ skills: { "opengame-example": { ...entry, digestPublished: entry.digest } } }));
  await skillIn(shut);
  await assert.rejects(buildSkills({ ...set, npmRelease: open }), /content changed and its version is still 1\.0\.0/);
  // An entry with no open digest is not a free pass: the build names it, and the lock refuses.
  const { digestPublished: _dropped, ...shutOnly } = entry;
  await writeFile(set.lockPath, JSON.stringify({ skills: { "opengame-example": shutOnly } }));
  await assert.rejects(buildSkills({ ...set, npmRelease: open }), /records no digest for the published install switch/);
  await assert.rejects(relock(set, { skills: { "opengame-example": shutOnly } }), /1\.0\.0 is not newer than the released 1\.0\.0/);

  // A real change at the same version, in both states.
  await writeFile(set.lockPath, JSON.stringify(lock));
  await writeFile(join(set.sourceDir, "opengame-example", "SKILL.md"), at("1.0.0", "\n## Install\n\n{{install cli}}\n\nA new line.\n"));
  await assert.rejects(buildSkills({ ...set, npmRelease: shut }), /content changed and its version is still 1\.0\.0/);
  await assert.rejects(buildSkills({ ...set, npmRelease: open }), /content changed and its version is still 1\.0\.0/);
  await assert.rejects(relock(set, lock), /1\.0\.0 is not newer than the released 1\.0\.0/);
});

/* scripts/release.mjs sets OPENGAME_RELEASE_NPM_OPEN for the builds of a package it is about
   to publish, and the skills read it through the same guard as the CLI's bundle. */
test("a publishing build renders the install steps open, and the variable is refused anywhere else", async (t) => {
  const keys = ["OPENGAME_RELEASE_NPM_OPEN", "OPENGAME_RELEASE_VERSION"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => { for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; });
  for (const key of keys) delete process.env[key];
  const committed = loadContext().npmRelease;
  Object.assign(process.env, { OPENGAME_RELEASE_NPM_OPEN: "first-publish", OPENGAME_RELEASE_VERSION: "1.0.0" });
  assert.equal(loadContext().npmRelease.published, true);
  assert.equal(committed.published, loadContext({ env: {} }).npmRelease.published, "the file is read as it is without the variable");
  const out = await mkdtemp(join(tmpdir(), "og-skills-publishing-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  const { skills } = await buildSkills({ outDir: out });
  for (const name of ["opengame-cli", "opengame-sdk", "opengame-deploy"]) {
    const text = await readFile(join(out, name, "SKILL.md"), "utf8");
    assert.equal(text, skills.find((skill) => skill.name === name).files["SKILL.md"]);
    assert.doesNotMatch(text, /not on npm yet/, name);
    assert.match(text, /```bash\nnpm i (?:-g )?@opengamehq\/(?:cli|sdk)\n```/, name);
  }
  delete process.env.OPENGAME_RELEASE_VERSION;
  assert.throws(() => loadContext(), /only by scripts\/release\.mjs/);
});

test("a skill without a changelog, or with an em dash in it, is refused", async () => {
  const set = await planted({ "opengame-example": { skill: at("1.0.0") } });
  try {
    assert.ok((await collectSkills(set)).problems.some((p) => /CHANGELOG.md: missing/.test(p)));
    await writeFile(join(set.sourceDir, "opengame-example", "CHANGELOG.md"), log("1.0.0") + "A dash — here.\n");
    assert.ok((await collectSkills(set)).problems.some((p) => /CHANGELOG.md:\d+: contains an em dash/.test(p)));
  } finally { await rm(set.root, { recursive: true, force: true }); }
});

test("the committed lock matches every skill in both switch states, and the changelog never ships to the CLI", async () => {
  const { shut, published, problems } = await collectBothStates();
  assert.deepEqual(problems, []);
  const lock = JSON.parse(await readFile(new URL("../skills.lock.json", import.meta.url), "utf8"));
  assert.deepEqual(lockProblems(manifestFor(shut.skills, shut.version), lock), []);
  assert.deepEqual(lockProblems(manifestFor(published.skills, published.version), lock, { published: true }), []);
  const { skills } = shut;
  for (const skill of skills) {
    assert.ok(!Object.hasOwn(skill.files, "CHANGELOG.md"), skill.name);
    assert.match(skill.version, /^\d+\.\d+\.\d+$/, skill.name);
    assert.match(skill.changelog, new RegExp(`^## ${skill.version.replace(/\./g, "\\.")}$`, "m"), skill.name);
  }
});

test("the public layout puts every skill under skills/ with its changelog, and the marketplace names each once", async () => {
  const out = await mkdtemp(join(tmpdir(), "og-skills-public-"));
  try {
    await writeFile(join(out, "README.md"), "kept");
    const { skills } = await buildPublic(out);
    assert.equal(await readFile(join(out, "README.md"), "utf8"), "kept", "only skills/ and .claude-plugin/ are replaced");
    const market = JSON.parse(await readFile(join(out, ".claude-plugin", "marketplace.json"), "utf8"));
    assert.equal(market.name, "opengame");
    assert.ok(market.owner?.name);
    const listed = market.plugins.flatMap((plugin) => plugin.skills);
    assert.deepEqual([...listed].sort(), skills.map((s) => `./skills/${s.name}`).sort());
    assert.equal(new Set(listed).size, listed.length);
    for (const plugin of market.plugins) assert.equal(plugin.source, "./");
    for (const skill of skills) {
      assert.equal(await readFile(join(out, "skills", skill.name, "SKILL.md"), "utf8"), skill.files["SKILL.md"]);
      assert.equal(await readFile(join(out, "skills", skill.name, "CHANGELOG.md"), "utf8"), skill.changelog);
    }
  } finally { await rm(out, { recursive: true, force: true }); }
});

test("every platform skill tells an agent that OpenGame is not open yet", async () => {
  const { skills } = await collectSkills();
  for (const skill of skills.filter((s) => s.family === "platform")) {
    const text = skill.files["SKILL.md"];
    /* The refusal names the kickoff, the day the CLI and uploads open (the owner, 8 Nov 2026),
       through {{launch kickoff}}, so the built text carries launch.json's own words. */
    assert.ok(text.includes(`OpenGame opens for creators on ${loadContext().launch.kickoffCopy}.`), skill.name);
  }
});

/* The launch instant lives in packages/shared/launch.json and nowhere else. A skill names it
   through {{launch ...}}, so a moved date reaches every skill at the next build, and the lock
   then asks for a version bump like any other change in what a skill says. */
test("the skills that say when OpenGame opens name launch.json's days, and none is typed", async () => {
  const context = loadContext();
  const { skills } = await collectSkills();
  const opens = render("{{launch opens}}", context);
  assert.match(opens, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  for (const name of ["opengame-deploy", "opengame-jam", "opengame-api", "opengame-cli", "opengame-router"]) {
    assert.ok(skills.find((s) => s.name === name).files["SKILL.md"].includes(`OpenGame opens on ${opens}`), name);
  }
  const jam = skills.find((s) => s.name === "opengame-jam").files["SKILL.md"];
  assert.ok(jam.includes(context.launch.kickoffCopy) && jam.includes(context.launch.closeCopy));
  assert.ok(skills.find((s) => s.name === "opengame-api").files["SKILL.md"].includes("`entries_closed`"));

  const moved = { ...context.launch, launchAt: "2027-03-02T08:00:00Z" };
  assert.equal(render("Opens {{launch opens}}.", { ...context, launch: moved }), "Opens 2 March 2027.", "midnight in Pacific time is that day");
  for (const typed of [`OpenGame opens on ${opens}.`, opens.replace(/ \d{4}$/, ""), "2026-11-17", context.launch.kickoffCopy, context.launch.closeCopy])
    assert.equal(typedLaunchDates(typed, context.launch).length, 1, typed);
  assert.deepEqual(typedLaunchDates("Opens {{launch opens}}; entries {{launch kickoff}} to {{launch close}}.", context.launch), []);
  assert.throws(() => render("{{launch someday}}", context), /opens, kickoff or close/);
});

/* An install step follows packages/shared/npm-release.json like every other surface: the
   sentence while the packages are not on npm, the command after. */
test("an install step prints the command only once npm-release.json says the packages are published", () => {
  const context = loadContext();
  const shut = { ...context.npmRelease, scopeOwned: true, published: false };
  const open = { ...context.npmRelease, scopeOwned: true, published: true };
  assert.equal(render("{{install cli}}", { ...context, npmRelease: shut }), "The CLI is not on npm yet. Write to team@opengame.io for a copy.");
  assert.equal(render("{{install sdk}}", { ...context, npmRelease: shut }), "The SDK is not on npm yet. Write to team@opengame.io for a copy.");
  assert.doesNotMatch(render("{{install skills}}", { ...context, npmRelease: shut }), /npx|opengamehq\//);
  assert.equal(render("{{install cli}}", { ...context, npmRelease: open }), `\`\`\`bash\nnpm i -g ${open.packages.cli}\n\`\`\``);
  assert.equal(render("{{install sdk}}", { ...context, npmRelease: open }), `\`\`\`bash\nnpm i ${open.packages.sdk}\n\`\`\``);
  assert.equal(render("{{install skills}}", { ...context, npmRelease: open }), "```bash\nnpx skills add opengamehq/opengame\n```", "the public repository, not the npm package");
  assert.throws(() => render("{{install studio}}", context), /cli, cli-agent, sdk, sdk-agent or skills/);
  // The agent's steps send the creator for a copy while shut, and are the same commands open.
  for (const [step, name] of [["cli-agent", "cli"], ["sdk-agent", "sdk"]]) {
    assert.match(render(`{{install ${step}}}`, { ...context, npmRelease: shut }), /not on npm yet\. If .* stop and tell the creator to write to team@opengame\.io/);
    assert.equal(render(`{{install ${step}}}`, { ...context, npmRelease: open }), render(`{{install ${name}}}`, { ...context, npmRelease: open }));
  }
});

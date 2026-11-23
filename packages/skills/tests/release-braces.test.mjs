import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* scripts/release.mjs refuses a skills package with any "{{" in it, reading one as a template the
   renderer skipped. Helpers and changelogs are copied as they are, never rendered, so a "{{" there (a JSDoc
   object type written {{ a: b }}) refused skills 1.8.0 at the publish step. Caught here instead. */
const skills = fileURLToPath(new URL("../skills/", import.meta.url));

test("no skill helper or changelog carries {{, which the release check reads as an unrendered template", async () => {
  const found = [];
  for (const skill of await readdir(skills)) {
    const files = [join(skill, "CHANGELOG.md")];
    try { files.push(...(await readdir(join(skills, skill, "helpers"))).filter(n => /\.(m?js|ts|glsl|wgsl|json)$/.test(n)).map(n => join(skill, "helpers", n))); } catch {}
    for (const file of files) {
      let text;
      try { text = await readFile(join(skills, file), "utf8"); } catch { continue; }
      text.split("\n").forEach((line, i) => { if (line.includes("{{")) found.push(`${file}:${i + 1}`); });
    }
  }
  assert.deepEqual(found, []);
});

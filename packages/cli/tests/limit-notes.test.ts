import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS } from "@opengame/shared";
import { buildRuntimeBuilder } from "../build.mjs";
import { scan } from "../../shared/scripts/limits-values.mjs";

/* This package goes to strangers on npm, and until R19 (26 Oct 2026) dist/cli.mjs and
   dist/runtime-builder.mjs each carried all 494 limits.json notes: `opengame dev` imports
   infra/worker modules, and the runtime builder a scripts/engine-runtimes one, that read
   limits.json by path. build.mjs sends that file to limits.values.json and refuses a dist
   with any note in it; these read what the build actually produced. */
const dist = fileURLToPath(new URL("../dist", import.meta.url));

test("the built CLI carries the limit values and none of the limits.json notes", async () => {
  const found = scan([dist]);
  assert.ok(found.read > 10, `read only ${found.read} files in dist; run the build first`);
  assert.deepEqual(found.map(({ file }) => file), []);
  assert.ok((await readFile(join(dist, "cli.mjs"), "utf8")).includes(CHECKS[1]!.hint), "the values did not arrive in cli.mjs");
});

test("the runtime builder resolves limits.json, by any path, to the values", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "og-cli-limits-"));
  try {
    const result = await buildRuntimeBuilder(join(scratch, "runtime-builder.mjs"));
    const inputs = Object.keys(result.metafile!.inputs).filter(path => /limits(\.values)?\.json$/.test(path));
    assert.ok(inputs.length > 0, "the runtime builder no longer reads limits at all, so this proves nothing");
    assert.deepEqual(inputs.filter(path => !path.endsWith("limits.values.json")), []);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

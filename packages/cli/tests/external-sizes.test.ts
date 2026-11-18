import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { externalFileSizes } from "../src/archive";

/* The sizes the CLI hands the first-download note for files its asset plan keeps out of the
   archive (a Unity .data): measured on disk, regular files only, and a file that cannot be
   measured left out rather than failing the check. */
test("measures each external file the plan names, and nothing else", async () => {
  const folder = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "og-external-sizes-"));
  try {
    await mkdir(join(folder, "Build"));
    await writeFile(join(folder, "Build/web.data"), new Uint8Array(4096));
    await writeFile(join(folder, "outside.bin"), new Uint8Array(10));
    await symlink(join(folder, "outside.bin"), join(folder, "Build/linked.data"));
    await mkdir(join(folder, "Build/folder.data"));
    const sizes = await externalFileSizes(folder, ["Build/web.data", "Build/missing.data", "Build/linked.data", "Build/folder.data"]);
    assert.deepEqual(sizes, { "Build/web.data": 4096 });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

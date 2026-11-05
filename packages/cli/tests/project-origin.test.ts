// A folder deployed through one server and opened by a CLI pointed at another. Area F,
// 1 Nov 2026: link, open and pull all said "Could not read .opengame/project.json. Restore
// the local project file", about a file that was intact.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProject } from "../src/project";

async function folder(origin: unknown, run: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "og-project-origin-")));
  try {
    await mkdir(join(root, ".opengame"));
    await writeFile(join(root, ".opengame/project.json"), JSON.stringify({ version: 1, origin, gameId: "6edd335a-2b27-4e5e-9822-8c074d76bf0b" }));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("another server's folder names that server and how to reach it", () => folder("http://localhost:4661", async root => {
  await assert.rejects(readProject(root, "http://localhost:4676"), (error: Error & { code?: string }) => {
    assert.equal(error.code, "project_state");
    assert.match(error.message, /deployed through http:\/\/localhost:4661, and this CLI is using http:\/\/localhost:4676/);
    assert.match(error.message, /OPENGAME_API_URL=http:\/\/localhost:4661/);
    assert.doesNotMatch(error.message, /Restore the local project file/);
    return true;
  });
  // The same file still reads for the server it belongs to.
  assert.equal((await readProject(root, "http://localhost:4661")).gameId, "6edd335a-2b27-4e5e-9822-8c074d76bf0b");
}));

test("an origin that is not one is not printed", () => folder("https://x.test/\u001b[2Jpath", async root => {
  await assert.rejects(readProject(root, "https://opengame.io"), (error: Error & { code?: string }) => {
    assert.equal(error.code, "project_state");
    assert.match(error.message, /another OpenGame server/);
    assert.doesNotMatch(error.message, /\u001b|x\.test/);
    return true;
  });
}));

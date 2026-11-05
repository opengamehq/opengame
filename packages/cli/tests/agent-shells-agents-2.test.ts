import test from "node:test";
import assert from "node:assert/strict";
import { sweep } from "./agent-shells-sweep";

/* The sweep inside the other two agents' shells, and Cursor's under a terminal. The rest of the agent-shell suite is agent-shells.test.ts, which says why. */

test("the same holds inside Cursor and OpenCode, by their own markers", async () => {
  for (const marker of [{ CURSOR_AGENT: "1" }, { OPENCODE: "1" }]) {
    assert.deepEqual(await sweep("json", marker), [], JSON.stringify(marker));
  }
  // Cursor's agent runs commands in a real terminal, so its marker is all there is to go on.
  assert.deepEqual(await sweep("plain", { CURSOR_AGENT: "1" }, true), [], "CURSOR_AGENT under a terminal");
});

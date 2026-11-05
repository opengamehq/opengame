import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "@opengame/shared";
import { cleanEnv, events, fakeApi, reply, spawnCli, token } from "./shell";

/* --token-stdin in an agent's shell. The rest of the agent-shell suite is agent-shells.test.ts, which says why. */

test("--token-stdin gives up on a pipe that never sends a token, and says how to send one", async () => {
  const run = await spawnCli(["whoami", "--token-stdin", "--jsonl"], { stdin: "open", deadlineMs: LIMITS.platform.credentials.stdinWaitMs + 15_000,
    env: cleanEnv({ OPENGAME_API_URL: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1" }) });
  assert.equal(run.hung, false, "whoami --token-stdin waited for ever on an open, silent stdin");
  const last = events(run.stdout).at(-1)!;
  assert.equal(last.code, "token_stdin");
  assert.equal(run.code, 2);
  assert.match(String(last.message), /OPENGAME_TOKEN|printf/);
});

test("--token-stdin still reads a token that is piped in and then closed", async () => {
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/auth/me") reply(res, 200, { handle: "nightshift", ogNumber: 7, avatar: { seed: 1, palette: "ink" } }); });
  try {
    const run = await spawnCli(["whoami", "--token-stdin", "--jsonl"], { stdin: token + "\n", env: cleanEnv({ OPENGAME_API_URL: api.origin, NO_PROXY: "127.0.0.1" }) });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.equal(api.seen.at(-1)!.headers.authorization, `Bearer ${token}`);
  } finally { await api.close(); }
});

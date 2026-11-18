import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "@opengame/shared";
import { cleanEnv, events, fakeApi, reply, spawnCli, token } from "./shell";

/* A token on a pipe that is never closed, which waits out LIMITS.platform.credentials.stdinWaitMs
   twice, so it is a file of its own and runs beside agent-shells-token.test.ts. The rest of
   the agent-shell suite is agent-shells.test.ts, which says why. */

test("a whole token on a pipe that is never closed is used once the pipe goes quiet", async () => {
  /* Both cases wait out the whole quiet period, so they run at once, each against an API of
     its own so neither reads the other's requests: one after another they were 61 s. */
  const me = () => fakeApi((req, res) => { if (req.url === "/api/v1/auth/me") reply(res, 200, { handle: "nightshift", ogNumber: 7, avatar: { seed: 1, palette: "ink" } }); });
  const [api, other] = await Promise.all([me(), me()]);
  try {
    const [run, partial] = await Promise.all([
      spawnCli(["whoami", "--token-stdin", "--jsonl"], { stdin: { write: token + "\n" }, deadlineMs: LIMITS.platform.credentials.stdinWaitMs + 15_000,
        env: cleanEnv({ OPENGAME_API_URL: api.origin, NO_PROXY: "127.0.0.1" }) }),
      spawnCli(["whoami", "--token-stdin", "--jsonl"], { stdin: { write: token.slice(0, 20) }, deadlineMs: LIMITS.platform.credentials.stdinWaitMs + 15_000,
        env: cleanEnv({ OPENGAME_API_URL: other.origin, NO_PROXY: "127.0.0.1" }) }),
    ]);
    assert.equal(run.hung, false);
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.equal(api.seen.at(-1)!.headers.authorization, `Bearer ${token}`);
    assert.equal(partial.code, 2);
    assert.match(String(events(partial.stdout).at(-1)!.message), /Part of a token/);
  } finally { await Promise.all([api.close(), other.close()]); }
});

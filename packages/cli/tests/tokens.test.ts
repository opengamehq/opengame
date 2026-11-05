import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const run = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const env = { ...process.env, OPENGAME_API_URL: "http://127.0.0.1:1", OPENGAME_TOKEN: "deliberately-invalid-must-not-be-read" };
const execute = async (...args: string[]) => JSON.parse((await run(process.execPath, [binary, "token", ...args, "--jsonl"], { env })).stdout.trim());

test("token commands hand off to the configured browser origin without reading credentials or making requests", async () => {
  for (const action of ["create", "list", "revoke"]) {
    const result = await execute(action);
    assert.equal(result.command, `token ${action}`);
    assert.equal(result.data.completed, false);
    assert.equal(result.data.requiresBrowser, true);
    assert.match(result.data.url, new RegExp(`^http://127.0.0.1:1/settings/tokens\\?action=${action}`));
    assert.ok(!JSON.stringify(result).includes(env.OPENGAME_TOKEN));
  }
  const created = await execute("create", "--name", "Build runner", "--scopes", "read,deploy", "--game", "littleorbit");
  const target = new URL(created.data.url);
  assert.equal(target.searchParams.get("name"), "Build runner");
  assert.equal(target.searchParams.get("scopes"), "read,deploy");
  assert.equal(target.searchParams.get("game"), "littleorbit");
  const revoked = await execute("revoke", "--id", "a".repeat(16));
  assert.equal(new URL(revoked.data.url).hash, `#token-${"a".repeat(16)}`);
});

test("invalid or secret-shaped token arguments fail before a browser handoff", async () => {
  for (const args of [[], ["unknown"], ["list", "--name", "Unused"], ["create", "--scopes", "admin"],
    ["create", "--scopes", "read,read"], ["create", "--game", "../someone"], ["create", "--name", "bad\nname"],
    ["revoke", "--id", "a".repeat(16) + "\n"], ["create", "--token-stdin"], ["revoke", "--id", "ogt_" + "a".repeat(16) + "_" + "b".repeat(43)]]) {
    await assert.rejects(execute(...args), (error: unknown) => {
      const value = error as { stdout: string; code: number };
      const result = JSON.parse(value.stdout.trim());
      assert.equal(value.code, 2); assert.equal(result.type, "error");
      assert.ok(!value.stdout.includes("b".repeat(43)));
      return true;
    });
  }
});

test("token commands take the global --human flag their help lists", async () => {
  // A person in a shell opened from Claude Code follows opengame help token, passes
  // --human, and was refused for it.
  for (const action of ["create", "list", "revoke"]) {
    const { stdout } = await run(process.execPath, [binary, "token", action, "--human", "--no-browser"], { env });
    assert.match(stdout, /Open http:\/\/127\.0\.0\.1:1\/settings\/tokens/);
  }
});

test("a refused token argument names the one that was wrong", async () => {
  for (const [args, field] of [[["create", "--scopes", "admin"], /--scopes/], [["create", "--name", "bad\nname"], /--name/],
    [["create", "--game", "../someone"], /--game/], [["revoke", "--id", "abc"], /--id/]] as const) {
    await assert.rejects(execute(...args), (error: unknown) => {
      const result = JSON.parse((error as { stdout: string }).stdout.trim());
      assert.equal(result.code, "token_request");
      assert.match(result.message, field);
      return true;
    });
  }
  await assert.rejects(execute("list", "--name", "Unused"), (error: unknown) => {
    assert.match(JSON.parse((error as { stdout: string }).stdout.trim()).message, /opengame help token/);
    return true;
  });
});

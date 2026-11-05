import test from "node:test";
import assert from "node:assert/strict";
import { Output } from "../src/output";
import { spawnCli } from "./shell";

test("JSON emits a single final object containing notices and JSONL streams each event", () => {
  for (const mode of ["json", "jsonl"] as const) {
    const lines: string[] = [];
    const output = new Output(mode, line => { lines.push(line); });
    output.emit({ type: "progress", stage: "upload", message: "Uploading" });
    output.emit({ type: "notice", code: "approval", message: "Open the approval page", url: "https://opengame.io/cli" });
    output.emit({ type: "result", command: "deploy", data: { releaseId: "release", url: "https://opengame.io/preview" } });
    if (mode === "json") {
      assert.equal(lines.length, 1);
      const result = JSON.parse(lines[0]!);
      assert.equal(result.ok, true);
      assert.equal(result.url, "https://opengame.io/preview");
      assert.equal(result.notices[0].code, "approval");
      assert.match(lines[0]!, /\n  "type"/);
    } else assert.deepEqual(lines.map(line => JSON.parse(line).type), ["progress", "notice", "result"]);
  }
});

test("agent mode defaults to formatted JSON and preserves advanced commands in structured help", async () => {
  const run = await spawnCli(["help"]);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, true);
  for (const name of ["deploy", "submit", "status", "open", "login", "pull", "link"]) assert.ok(result.data.commands[name]);
  const flags = await spawnCli(["version", "--json", "--jsonl"]);
  assert.equal(flags.code, 2);
  assert.equal(JSON.parse(flags.stdout).code, "conflicting_flags");
});

test("deploy begins browser sign-in in agent mode and returns its pending approval in the final error", async () => {
  const { fakeApi, reply, cleanEnv, tempDir, manifest } = await import("./shell");
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const project = await tempDir("og-deploy-login-");
  const config = await tempDir("og-deploy-login-config-");
  let origin = "";
  const api = await fakeApi((req, res) => {
    if (req.url === "/api/v1/auth/device") reply(res, 200, { device_code: "d".repeat(43), user_code: "BCDF-GHJK", verification_uri: `${origin}/cli`, expires_in: 600, interval: 5 });
  });
  origin = api.origin;
  try {
    await writeFile(join(project.dir, "opengame.json"), JSON.stringify(manifest));
    const run = await spawnCli(["deploy", project.dir, "--json", "--no-browser"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1" }) });
    const result = JSON.parse(run.stdout);
    assert.equal(run.code, 3, run.stdout);
    assert.equal(result.code, "login_pending");
    assert.equal(result.next, "opengame login --continue");
    assert.ok(result.notices.some((notice: { code: string }) => notice.code === "device_approval"));
    assert.equal(api.seen.filter(req => req.url === "/api/v1/auth/device").length, 1);
    assert.ok(!api.seen.some(req => req.url === "/api/v1/deploys"));
  } finally { await api.close(); await project.remove(); await config.remove(); }
});

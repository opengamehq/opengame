import { LIMITS } from "@opengame/shared";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, chmod, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Credentials, PendingLogins } from "../src/credentials";
import { Api, ApiError, apiOrigin } from "../src/http";
import { createServer } from "node:http";
import { once } from "node:events";

const token = "ogt_" + "a".repeat(16) + "_" + "b".repeat(43);

test("credentials are private, origin-bound and removed without affecting another origin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-"));
  try {
    const a = new Credentials("https://a.example", false, dir);
    const b = new Credentials("https://b.example", false, dir);
    assert.equal(await a.read(), null);
    assert.equal(await a.save(token), "file");
    assert.equal((await stat(a.file)).mode & 0o777, 0o600);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
    assert.equal(await b.read(), null);
    const other = token.replace("a".repeat(16), "c".repeat(16));
    await b.save(other);
    await a.remove(token);
    assert.equal(await a.read(), null);
    assert.equal(await b.read(), other);
    await chmod(b.file, 0o644);
    await assert.rejects(b.read(), /private credential storage/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a pending login keeps the server's pace, and one saved before the pace was kept still resumes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-pending-"));
  try {
    const origin = "https://a.example";
    const pending = new PendingLogins(origin, dir);
    const base = { origin, deviceCode: "d".repeat(43), userCode: "BCDF-GHJK", url: `${origin}/cli?code=BCDF-GHJK`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(), interval: 5, deviceName: "Laptop" };
    // Written by a CLI from before 11 Nov 2026: no nextPollAt at all.
    await pending.save(base);
    assert.deepEqual(await pending.read(), base);
    const paced = { ...base, interval: 20, nextPollAt: new Date(Date.now() + 20_000).toISOString() };
    await pending.save(paced);
    assert.deepEqual(await pending.read(), paced);
    // A time that cannot be read is dropped, not the whole login.
    await writeFile(pending.file, JSON.stringify({ [origin]: { ...base, nextPollAt: "soon" } }), { mode: 0o600 });
    assert.deepEqual(await pending.read(), base);
    await writeFile(pending.file, JSON.stringify({ [origin]: { ...base, nextPollAt: 7 } }), { mode: 0o600 });
    assert.deepEqual(await pending.read(), base);
    // A pace lands only on the login it was measured for.
    const later = new Date(Date.now() + 30_000).toISOString();
    assert.equal(await pending.pace(base.deviceCode, 25, later), true);
    assert.deepEqual(await pending.read(), { ...base, interval: 25, nextPollAt: later });
    await pending.save(null);
    assert.equal(await pending.pace(base.deviceCode, 30, later), false);
    assert.equal(await pending.read(), null);
    const newer = { ...base, deviceCode: "e".repeat(43) };
    await pending.save(newer);
    assert.equal(await pending.pace(base.deviceCode, 30, later), false);
    assert.deepEqual(await pending.read(), newer);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a jam upload token (oga_) is refused here with a sentence, not sent for /api/v1 to refuse", async () => {
  const jam = token.replace("ogt_", "oga_");
  const { suppliedToken } = await import("../src/credentials");
  const was = process.env.OPENGAME_TOKEN;
  process.env.OPENGAME_TOKEN = jam;
  try {
    await assert.rejects(suppliedToken(false), (error: { code: string; message: string }) =>
      error.code === "token_format" && /jam upload token \(oga_\).*opengame login/.test(error.message));
  } finally { if (was === undefined) delete process.env.OPENGAME_TOKEN; else process.env.OPENGAME_TOKEN = was; }
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-oga-"));
  try {
    const store = new Credentials("https://a.example", false, dir);
    await assert.rejects(store.save(jam), /private credential storage/);
    // One an older CLI stored reads as signed out, which opengame login fixes, and
    // opengame logout finds it and removes it rather than leaving it on disk.
    await writeFile(store.file, JSON.stringify({ "https://a.example": jam }), { mode: 0o600 });
    assert.equal(await store.read(), null);
    assert.equal(await store.storedJamToken(), jam);
    assert.equal(await store.remove(jam), true);
    assert.equal(await store.storedJamToken(), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("an empty OPENGAME_TOKEN reads as unset, not as a malformed token", async () => {
  const { suppliedToken } = await import("../src/credentials");
  const was = process.env.OPENGAME_TOKEN;
  process.env.OPENGAME_TOKEN = "";
  try {
    assert.equal(await suppliedToken(false), null);
  } finally { if (was === undefined) delete process.env.OPENGAME_TOKEN; else process.env.OPENGAME_TOKEN = was; }
});

test("a credential-file symlink is never read or overwritten", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-link-"));
  try {
    const target = join(dir, "other.json");
    await writeFile(target, "{}", { mode: 0o600 });
    const store = new Credentials("https://a.example", false, dir);
    await symlink(target, store.file);
    await assert.rejects(store.read(), /private credential storage/);
    await assert.rejects(store.save(token), /private credential storage/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("API origins disallow embedded secrets and remote plaintext", () => {
  for (const origin of ["http://example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com?token=x"]) {
    assert.throws(() => apiOrigin({ OPENGAME_API_URL: origin }), /HTTPS origin/);
  }
  assert.equal(apiOrigin({ OPENGAME_API_URL: "http://localhost:4590" }), "http://localhost:4590");
  assert.equal(apiOrigin({ OPENGAME_API_URL: "" }), "https://opengame.io");
});

test("API never follows a credential-bearing redirect or echoes an error body", async () => {
  let redirected = 0;
  const server = createServer((req, res) => {
    if (req.url === "/api/v1/redirect") { res.writeHead(307, { location: "/api/v1/stolen" }); res.end(); }
    else if (req.url === "/api/v1/stolen") { redirected++; res.end("{}"); }
    else { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ error: token })); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address() as { port: number };
  const api = new Api(`http://127.0.0.1:${address.port}`);
  try {
    await assert.rejects(api.json("/api/v1/redirect", { token }), /Could not reach/);
    assert.equal(redirected, 0);
    await assert.rejects(api.json("/api/v1/error", { token }), (error: unknown) => error instanceof Error && !error.message.includes(token));
  } finally { await api.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("a stale credential lock from an interrupted process is recoverable", async () => {
  const { mkdir, utimes } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-stale-"));
  try {
    const store = new Credentials("https://a.example", false, dir);
    const lock = store.file + ".lock";
    await mkdir(lock);
    const old = new Date(0); await utimes(lock, old, old);
    await store.save(token);
    assert.equal(await store.read(), token);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the bundled login, identity and logout commands preserve a token through an outage", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const exec = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "og-auth-flow-"));
  let origin = ""; let outage = true; let polls = 0;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/auth/device") {
      res.end(JSON.stringify({ device_code: "A".repeat(43), user_code: "KQ7P-M3XD", verification_uri: `${origin}/cli`, expires_in: 600, interval: 5 }));
    } else if (req.url === "/api/v1/auth/token") { polls++; res.end(JSON.stringify({ access_token: token })); }
    else if (req.headers.authorization !== `Bearer ${token}`) { res.statusCode = 401; res.end('{"error":"unauthorized"}'); }
    else if (req.url === "/api/v1/auth/me") { res.end(JSON.stringify({ handle: "tester", ogNumber: 7, avatar: { seed: 0, palette: "paper" } })); }
    else if (req.url === "/api/v1/auth/logout" && outage) { res.statusCode = 503; res.end('{"error":"temporarily_unavailable"}'); }
    else { res.end('{"revoked":true}'); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
  const env = { ...process.env, OPENGAME_TOKEN: "", OPENGAME_API_URL: origin, XDG_CONFIG_HOME: dir, OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" };
  delete (env as NodeJS.ProcessEnv).OPENGAME_TOKEN;
  const run = (command: string) => exec(process.execPath, [binary, command, "--jsonl", "--no-browser"], { env });
  const store = new Credentials(origin, false, join(dir, "opengame"));
  try {
    // --wait: the runner is not a terminal, which is agent mode, where login returns the code at once.
    const login = await exec(process.execPath, [binary, "login", "--wait", "--jsonl", "--no-browser"], { env });
    assert.equal(polls, 1); assert.ok(!login.stdout.includes(token));
    assert.match(login.stdout, /tester/); assert.match(login.stdout, /KQ7P-M3XD/);
    assert.equal(await store.read(), token);
    await assert.rejects(run("logout"));
    assert.equal(await store.read(), token);
    assert.match((await run("whoami")).stdout, /tester/);
    outage = false;
    assert.match((await run("logout")).stdout, /revoked/);
    assert.equal(await store.read(), null);
    // An oga_ an older CLI saved: logout removes it and says so, and asks the server nothing.
    const jam = token.replace("ogt_", "oga_");
    await writeFile(store.file, JSON.stringify({ [origin]: jam }), { mode: 0o600 });
    assert.match((await run("logout")).stdout, /Removed a jam upload token \(oga_\)/);
    assert.equal(await store.storedJamToken(), null);
    assert.match((await run("logout")).stdout, /already signed out/);
  } finally { await rm(dir, { recursive: true, force: true }); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("a recovered Keychain cannot override a newer fallback login", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-backend-"));
  let available = true;
  let stored: string | null = null;
  const keychain = {
    async read() { if (!available) throw new Error("locked"); return stored; },
    async save(_account: string, value: string) { if (!available) return false; stored = value; return true; },
    async remove() { stored = null; },
  };
  try {
    const store = new Credentials("https://a.example", true, dir, keychain);
    assert.equal(await store.save(token), "keychain");
    available = false;
    const next = token.replaceAll("b", "c");
    assert.equal(await store.save(next), "file");
    available = true;
    assert.equal(await store.read(), next);
    assert.equal(await store.save(next), "keychain");
    assert.equal(await store.read(), next);
    await store.remove(next);
    assert.equal(await store.read(), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("logging out of a login that already lapsed says so, and does not report a revocation", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const exec = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "og-auth-lapsed-"));
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(String(req.url));
    res.setHeader("content-type", "application/json"); res.statusCode = 401;
    // What credentialRefusal sends for a device login unused past the limit.
    res.end(JSON.stringify({ error: "token_invalid", message: "server words", token: { id: "a".repeat(16), name: "laptop" } }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, OPENGAME_API_URL: origin, XDG_CONFIG_HOME: dir, OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" };
  delete env.OPENGAME_TOKEN;
  const store = new Credentials(origin, false, join(dir, "opengame"));
  try {
    await store.save(token);
    const { stdout } = await exec(process.execPath, [fileURLToPath(new URL("../dist/cli.mjs", import.meta.url)), "logout", "--jsonl"], { env });
    const result = JSON.parse(stdout.trim().split("\n").at(-1)!);
    assert.equal(result.data.revoked, false);
    assert.equal(result.data.expired, true);
    assert.equal(result.data.message, `Signed out. This login had already expired after ${LIMITS.platform.device.inactiveDaysMax} days without use, so there was nothing for the server to revoke.`);
    assert.doesNotMatch(stdout, /has been revoked/);
    assert.equal(await store.read(), null);
    assert.deepEqual(seen, ["/api/v1/auth/logout"]);
  } finally { await rm(dir, { recursive: true, force: true }); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("logout preserves a credential replaced while revocation was in flight", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-replaced-"));
  let stored: string | null = null;
  const keychain = { async read() { return stored; }, async save(_account: string, value: string) { stored = value; return true; }, async remove() { stored = null; } };
  try {
    const store = new Credentials("https://a.example", true, dir, keychain);
    await store.save(token);
    const replacement = token.replaceAll("b", "d");
    await store.save(replacement);
    assert.equal(await store.remove(token), false);
    assert.equal(await store.read(), replacement);
    assert.equal(stored, replacement);
    await store.remove(replacement);
    assert.equal(await store.read(), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("profile throttling after redemption keeps the saved login and never polls again", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const exec = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "og-auth-profile-"));
  let origin = ""; let polls = 0;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/auth/device") res.end(JSON.stringify({ device_code: "A".repeat(43), user_code: "KQ7P-M3XD", verification_uri: `${origin}/cli`, expires_in: 600, interval: 5 }));
    else if (req.url === "/api/v1/auth/token") { polls++; res.end(JSON.stringify({ access_token: token })); }
    else { res.statusCode = 429; res.end('{"error":"slow_down"}'); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, XDG_CONFIG_HOME: dir, OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" };
  delete (env as NodeJS.ProcessEnv).OPENGAME_TOKEN;
  try {
    await assert.rejects(exec(process.execPath, [fileURLToPath(new URL("../dist/cli.mjs", import.meta.url)), "login", "--wait", "--jsonl", "--no-browser"], { env }), (error: unknown) => {
      const output = (error as { stdout: string }).stdout;
      assert.match(output, /profile_unavailable/); assert.match(output, /whoami/);
      assert.ok(!output.includes("login_expired")); assert.ok(!output.includes(token));
      return true;
    });
    assert.equal(polls, 1);
    assert.equal(await new Credentials(origin, false, join(dir, "opengame")).read(), token);
  } finally { await rm(dir, { recursive: true, force: true }); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("an unavailable Keychain is not reported as already signed out", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-locked-"));
  const keychain = { async read(): Promise<string | null> { throw new Error("locked"); }, async save() { return false; }, async remove() {} };
  try {
    const store = new Credentials("https://a.example", true, dir, keychain);
    await assert.rejects(store.read(), /Unlock it/);
    await store.save(token);
    assert.equal(await store.read(), token);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("logging out of a fallback login never restores its Keychain predecessor", async () => {
  for (const fileOnly of [false, true]) {
    const dir = await mkdtemp(join(tmpdir(), "og-credentials-fallback-logout-"));
    let available = true;
    let stored: string | null = null;
    const keychain = {
      async read() { if (!available) throw new Error("locked"); return stored; },
      async save(_account: string, value: string) { if (!available) return false; stored = value; return true; },
      async remove() { stored = null; },
    };
    try {
      const store = new Credentials("https://a.example", true, dir, keychain);
      await store.save(token);
      available = false;
      const replacement = token.replaceAll("b", "e");
      await store.save(replacement);
      available = true;
      const logoutStore = new Credentials("https://a.example", !fileOnly, dir, keychain);
      assert.equal(await logoutStore.remove(replacement), true);
      assert.equal(await store.read(), null);
      assert.equal(await logoutStore.read(), null);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test("invalid fallback storage is detected before creating a Keychain credential", async () => {
  const dir = await mkdtemp(join(tmpdir(), "og-credentials-partial-"));
  let writes = 0;
  const keychain = { async read() { return null; }, async save() { writes++; return true; }, async remove() {} };
  try {
    const store = new Credentials("https://a.example", true, dir, keychain);
    await writeFile(store.file, "invalid", { mode: 0o600 });
    await assert.rejects(store.save(token), /private credential storage/);
    assert.equal(writes, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a credential refusal says which one, names a revoked token and never echoes server prose", () => {
  const revoked = new ApiError(401, "token_revoked", { token: { id: "a".repeat(16), name: "laptop · 2026-10-04" }, message: "server words" });
  assert.equal(revoked.exitCode, 3);
  assert.match(revoked.message, /^This token \(laptop · 2026-10-04, a{16}\) was revoked/);
  assert.ok(!revoked.message.includes("server words"));
  // A lapsed device login: token_invalid naming the token. Each source keeps its own fix.
  const lapsed = { token: { id: "b".repeat(16), name: "laptop" }, message: "server words" };
  assert.equal(new ApiError(401, "token_invalid", lapsed, "", "stored").message,
    `Your saved login (laptop, ${"b".repeat(16)}) expired after ${LIMITS.platform.device.inactiveDaysMax} days without use. Run opengame login to sign in again.`);
  assert.match(new ApiError(401, "token_invalid", lapsed).message, new RegExp(`^This login \\(laptop, b{16}\\) expired after ${LIMITS.platform.device.inactiveDaysMax} days without use\\. Run opengame login`));
  assert.match(new ApiError(401, "token_invalid", lapsed, "", "env").message, new RegExp(`^OPENGAME_TOKEN \\(laptop, b{16}\\) expired after ${LIMITS.platform.device.inactiveDaysMax} days`));
  // Unnamed, it is still a token nobody issued.
  assert.match(new ApiError(401, "token_invalid", {}, "", "stored").message, /^Your saved login is not valid\. Run opengame login/);
  const member = new ApiError(403, "not_member", {});
  assert.match(member.message, /does not have platform access/);
  assert.ok(!/opengame login/.test(member.message), "a removed tester is not told to log in again");
  assert.equal(new ApiError(409, "handle_required", {}).exitCode, 3);
  const bug = new ApiError(500, "internal_error", { retry: "never", requestId: "11111111-2222-4333-8444-555555555555" });
  assert.match(bug.message, /retrying will not fix\. Report request 11111111-2222-4333-8444-555555555555/);
  assert.equal(new ApiError(503, "temporarily_unavailable", {}).exitCode, 5);
});

test("login survives a server error while polling and makes its last poll before the server's expiry", { timeout: 30_000 }, async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const exec = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "og-auth-poll-"));
  let origin = ""; let polls = 0; let expiresAt = 0;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/auth/device") {
      // Like platform_redeem_device: expiry is stamped here, before the answer leaves, and
      // this server is honest about it -- the client's clock starts a little later.
      expiresAt = Date.now() + 8_000 - 400;
      res.end(JSON.stringify({ device_code: "A".repeat(43), user_code: "KQ7P-M3XD", verification_uri: `${origin}/cli`, expires_in: 8, interval: 5 }));
    } else if (req.url === "/api/v1/auth/token") {
      polls++;
      if (Date.now() >= expiresAt) { res.statusCode = 400; res.end('{"error":"expired_token"}'); }
      else if (polls === 1) { res.statusCode = 503; res.end('{"error":"temporarily_unavailable"}'); }
      // Allow was pressed in the final interval: the next poll inside the code's life wins.
      else res.end(JSON.stringify({ access_token: token }));
    } else if (req.url === "/api/v1/auth/me") res.end(JSON.stringify({ handle: "tester", ogNumber: 7, avatar: { seed: 0, palette: "paper" } }));
    else { res.statusCode = 404; res.end("{}"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
  const env = { ...process.env, OPENGAME_API_URL: origin, XDG_CONFIG_HOME: dir, OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" };
  delete (env as NodeJS.ProcessEnv).OPENGAME_TOKEN;
  try {
    const login = await exec(process.execPath, [binary, "login", "--wait", "--jsonl", "--no-browser"], { env });
    assert.equal(polls, 2);
    assert.match(login.stdout, /Still waiting \(the server is busy\)/);
    assert.match(login.stdout, /Signed in as @tester/);
  } finally { await rm(dir, { recursive: true, force: true }); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("a server that names a different origin is reported as a configuration mismatch", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const exec = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "og-auth-origin-"));
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ device_code: "A".repeat(43), user_code: "KQ7P-M3XD", verification_uri: "http://localhost:4591/cli", expires_in: 600, interval: 5 }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
  const env = { ...process.env, OPENGAME_API_URL: origin, XDG_CONFIG_HOME: dir, OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" };
  delete (env as NodeJS.ProcessEnv).OPENGAME_TOKEN;
  try {
    const failed = await exec(process.execPath, [binary, "login", "--wait", "--jsonl", "--no-browser"], { env }).then(() => null, (error: { stdout: string; code: number }) => error);
    assert.ok(failed);
    assert.equal(failed.code, 5);
    assert.match(failed.stdout, /says its address is http:\/\/localhost:4591\. Set both to the same origin/);
  } finally { await rm(dir, { recursive: true, force: true }); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("a login the server has not let in yet ends with not_launched and exit 7, not a profile failure", async () => {
  // Before launch, an account outside the team signs in and is then refused at /auth/me. That
  // refusal is the sentence the person should read; profile_unavailable told them to retry.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const exec = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "og-auth-launch-"));
  let origin = "";
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/auth/device") res.end(JSON.stringify({ device_code: "A".repeat(43), user_code: "KQ7P-M3XD", verification_uri: `${origin}/cli`, expires_in: 600, interval: 5 }));
    else if (req.url === "/api/v1/auth/token") res.end(JSON.stringify({ access_token: token }));
    else if (req.url === "/api/v1/auth/me") { res.statusCode = 403; res.end('{"error":"not_launched","message":"OpenGame opens for creators on 18 November."}'); }
    else { res.statusCode = 404; res.end('{"error":"not_found"}'); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const env = { ...process.env, OPENGAME_API_URL: origin, XDG_CONFIG_HOME: dir, OPENGAME_CREDENTIAL_STORE: "file", NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" };
  delete (env as NodeJS.ProcessEnv).OPENGAME_TOKEN;
  try {
    await assert.rejects(exec(process.execPath, [fileURLToPath(new URL("../dist/cli.mjs", import.meta.url)), "login", "--wait", "--jsonl", "--no-browser"], { env }), (error: unknown) => {
      const failure = error as { stdout: string; code: number };
      assert.equal(failure.code, 7, failure.stdout);
      assert.match(failure.stdout, /not_launched/);
      assert.doesNotMatch(failure.stdout, /profile_unavailable/);
      assert.ok(!failure.stdout.includes(token));
      return true;
    });
  } finally { await rm(dir, { recursive: true, force: true }); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

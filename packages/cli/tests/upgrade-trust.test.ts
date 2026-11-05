import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { trustedBrowserUrl } from "../src/browser";
import { CLI_REGISTRY, REGISTRY_RELEASE, registryMetadata, verifyCliArchive } from "../src/registry-release";
import { cleanEnv, events, fakeApi, reply, spawnCli, token } from "./shell";
import { startupInformation } from "./bootstrap-fixture";
import cliPackage from "../package.json" with { type: "json" };

// The server offers the CLI that is running: an older one is a downgrade, which is
// refused on its own test, and this one would fail at every version bump.
const version = cliPackage.version;
const spec = `@opengamehq/cli@${version}`;
const tarball = `${CLI_REGISTRY}/@opengamehq/cli/-/cli-${version}.tgz`;
const pkg = { name: "@opengamehq/cli", version, bin: { opengame: "dist/cli.mjs" } };

function archive(manifest: unknown, duplicate = false): Buffer {
  const content = Buffer.from(JSON.stringify(manifest));
  const header = Buffer.alloc(512);
  header.write("package/package.json");
  header.write("0000644\0", 100);
  header.write("0000000\0", 108); header.write("0000000\0", 116);
  header.write(content.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write("00000000000\0", 136);
  header.fill(32, 148, 156);
  header.write("0", 156); header.write("ustar\0", 257); header.write("00", 263);
  header.write([...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148);
  const file = Buffer.concat([header, content, Buffer.alloc((512 - content.length % 512) % 512)]);
  return gzipSync(Buffer.concat([file, ...(duplicate ? [file] : []), Buffer.alloc(1024)]));
}
const integrity = (bytes: Buffer) => "sha512-" + createHash("sha512").update(bytes).digest("base64");

test("browser links require the configured HTTPS origin or its exact loopback development origin", () => {
  assert.equal(trustedBrowserUrl("https://opengame.io/certify/123?next=game#terms", "https://opengame.io"), "https://opengame.io/certify/123?next=game#terms");
  for (const origin of ["http://127.0.0.1:4590", "http://localhost:4590", "http://[::1]:4590"]) {
    assert.equal(trustedBrowserUrl(origin + "/certify/123", origin), origin + "/certify/123");
  }
  for (const value of ["https://evil.example/certify", "https://opengame.io.evil.example/", "https://opengame.io@evil.example/", "https://user:secret@opengame.io/", "http://opengame.io/", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "https://opengame.io:444/", "https://opengame.io\\@evil.example/", "https://opengame.io/\ncertify"]) {
    assert.throws(() => trustedBrowserUrl(value, "https://opengame.io"), /unsafe browser link/);
  }
  assert.throws(() => trustedBrowserUrl("http://127.0.0.1:4591/", "http://127.0.0.1:4590"));
  assert.throws(() => trustedBrowserUrl("http://private.example/", "http://private.example"));
});

test("the updater accepts only the exact official package and registry artifact", () => {
  assert.ok(REGISTRY_RELEASE.test(spec));
  for (const value of ["@opengamehq/cli@latest", "@opengamehq/cli@01.2.0", "@opengamehq/other@0.2.0", "@opengamehq/cli@0.2.0\n", "https://opengame.io/cli.tgz", "file:cli.tgz"]) assert.equal(REGISTRY_RELEASE.test(value), false, value);
  const bytes = archive(pkg);
  const valid = { name: pkg.name, version, dist: { tarball, integrity: integrity(bytes) } };
  assert.deepEqual(registryMetadata(valid, spec), { tarball, integrity: integrity(bytes), version });
  for (const bad of [
    { ...valid, name: "@attacker/cli" }, { ...valid, version: "9.9.9" },
    { ...valid, dist: { ...valid.dist, tarball: "https://evil.example/cli.tgz" } },
    { ...valid, dist: { ...valid.dist, tarball: tarball + "?redirect=evil" } },
    { ...valid, dist: { ...valid.dist, integrity: "sha1-abc" } },
    { ...valid, dist: { ...valid.dist, integrity: valid.dist.integrity + " sha512-other" } },
  ]) assert.throws(() => registryMetadata(bad, spec), /could not be verified/);
});

test("the downloaded bytes, embedded identity and dependency-free executable must all match", () => {
  const good = archive(pkg);
  verifyCliArchive(good, { version, integrity: integrity(good) });
  assert.throws(() => verifyCliArchive(Buffer.concat([good, Buffer.from("changed")]), { version, integrity: integrity(good) }));
  assert.throws(() => verifyCliArchive(good, { version, integrity: "sha512-bad" }));
  for (const manifest of [{ ...pkg, name: "@attacker/cli" }, { ...pkg, version: "9.9.9" },
    { ...pkg, dependencies: { malware: "https://evil.example/malware.tgz" } },
    { ...pkg, optionalDependencies: { malware: "1.0.0" } },
    { ...pkg, peerDependencies: { malware: "https://evil.example/malware.tgz" } },
    { ...pkg, bin: { opengame: "dist/cli.mjs", another: "dist/other.mjs" } }]) {
    const bytes = archive(manifest);
    assert.throws(() => verifyCliArchive(bytes, { version, integrity: integrity(bytes) }), /could not be verified/);
  }
  const duplicate = archive(pkg, true);
  assert.throws(() => verifyCliArchive(duplicate, { version, integrity: integrity(duplicate) }));
  const invalid = Buffer.from("not a gzip file");
  assert.throws(() => verifyCliArchive(invalid, { version, integrity: integrity(invalid) }));
});

test("a server-supplied tarball never produces an npm install command", async () => {
  for (const modern of [true, false]) {
    const information = startupInformation({ minimumCliVersion: version, package: "https://opengame.io/cli/private.tgz" });
    const api = await fakeApi((req, res) => {
      // Both a complete current bootstrap and a genuine legacy-route fallback
      // must reach the same updater trust check.
      if (req.url === (modern ? "/api/v1/bootstrap" : "/api/v1/cli")) reply(res, 200, information);
    });
    try {
      const result = await spawnCli(["upgrade", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
      assert.equal(result.code, 5, result.stdout);
      assert.equal(events(result.stdout).at(-1)!.code, "upgrade_untrusted");
      assert.doesNotMatch(result.stdout, /npm install|private\.tgz/);
      assert.deepEqual(api.seen.map(request => request.url), modern ? ["/api/v1/bootstrap"] : ["/api/v1/bootstrap", "/api/v1/cli"]);
    } finally { await api.close(); }
  }
});

test("an agent receives a pinned official command without downloading or installing it", async () => {
  for (const modern of [true, false]) {
    const information = startupInformation({ minimumCliVersion: version, package: spec });
    const api = await fakeApi((req, res) => {
      if (req.url === (modern ? "/api/v1/bootstrap" : "/api/v1/cli")) reply(res, 200, information);
    });
    try {
      const result = await spawnCli(["upgrade", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
      assert.equal(result.code, 0, result.stdout);
      const data = events(result.stdout).at(-1)!.data as { upgraded: boolean; command: string };
      assert.equal(data.upgraded, false);
      assert.ok(data.command.endsWith(`${spec} --registry=https://registry.npmjs.org --ignore-scripts`), data.command);
      assert.deepEqual(api.seen.map(request => request.url), modern ? ["/api/v1/bootstrap"] : ["/api/v1/bootstrap", "/api/v1/cli"]);
    } finally { await api.close(); }
  }
});

/* OPENGAME_API_URL can point the CLI at a server other than opengame.io, so the sentence
   names the server it asked rather than OpenGame (design review, 5 Nov 2026). */
test("a signed-in upgrade against a server that names no package says so and installs nothing", async () => {
  const information = startupInformation({ minimumCliVersion: version, package: null });
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/bootstrap" || req.url === "/api/v1/cli") reply(res, 200, information); });
  try {
    const result = await spawnCli(["upgrade", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }) });
    assert.equal(result.code, 0, result.stdout);
    const data = events(result.stdout).at(-1)!.data as { upgraded: boolean; command: string | null; message: string };
    assert.equal(data.upgraded, false);
    assert.equal(data.command, null);
    assert.match(data.message, /This server did not name a CLI package to install\. Write to team@opengame\.io for the current release\.$/);
    assert.doesNotMatch(result.stdout, /npm install/);
  } finally { await api.close(); }
});

test("an older version from the server is refused unless the person passes --allow-downgrade", async () => {
  const older = "@opengamehq/cli@0.1.9";
  const information = startupInformation({ minimumCliVersion: "0.1.0", package: older });
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/bootstrap") reply(res, 200, information); });
  try {
    const env = cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" });
    const refused = await spawnCli(["upgrade", "--jsonl"], { env });
    assert.equal(refused.code, 5, refused.stdout);
    const error = events(refused.stdout).at(-1)!;
    assert.equal(error.code, "upgrade_untrusted");
    // The bypass is for a person to choose, so it is not an agent's next step.
    assert.equal(error.next, undefined);
    assert.equal(error.retry, "never");
    assert.match(String(error.message), /offers 0\.1\.9, which is older\. Nothing was installed/);
    assert.doesNotMatch(refused.stdout, /npm install/);
    // An agent that read the flag out of that sentence is refused too, and is not handed
    // the npm line to run itself. Every spawnCli run is non-interactive, so this is the
    // agent case; the person at a terminal is the only one the flag is for.
    for (const args of [["upgrade", "--allow-downgrade", "--jsonl"], ["upgrade", "--allow-downgrade", "--human"]]) {
      const agent = await spawnCli(args, { env });
      assert.equal(agent.code, 5, agent.stdout + agent.stderr);
      assert.match(agent.stdout + agent.stderr, /for a person at a terminal, so nothing was installed/);
      assert.doesNotMatch(agent.stdout + agent.stderr, /npm install|@opengamehq\/cli@0\.1\.9 --registry/);
    }
    // A person at a terminal gets past the guard. This install is not global, so the CLI
    // prints the line for them rather than running it.
    const person = await spawnCli(["upgrade", "--allow-downgrade", "--human"], { env, tty: true, deadlineMs: 20_000 });
    assert.equal(person.code, 0, person.stdout + person.stderr);
    assert.match(person.stdout, /@opengamehq\/cli@0\.1\.9 --registry=/);
  } finally { await api.close(); }
});

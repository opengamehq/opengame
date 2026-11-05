import test from "node:test";
import { readableBytes } from "../src/bytes";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, readdir, readFile, symlink, truncate, writeFile } from "node:fs/promises";
import { createServer as createHttps } from "node:https";
import { createServer as createHttp } from "node:http";
import { connect } from "node:net";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { unzipSync } from "fflate";
import { LIMITS } from "@opengame/shared";
import { CLI_PACKAGE_PATTERN } from "@opengame/protocol";
import { createArchive } from "../src/archive";
import { bundlePathOf, collectFiles, insideProject, loadManifest, replaceFile, sameComposedName, unportableName } from "../src/files";
import { Output } from "../src/output";
import { cleanEnv, events, fakeApi, manifest, reply, spawnCli, tempDir, token } from "./shell";
import { startupInformation } from "./bootstrap-fixture";
import release from "../../shared/npm-release.json";
import { installsOpen } from "../../shared/npm-release.mjs";

/**
 * Where the CLI runs, and what it is handed: terminals and pipes, proxies, Windows paths
 * and line endings, names in every script, links, empty files, projects at the limits,
 * manifests from other CLI versions, and a server that has moved on. Everything that
 * drives the binary goes through `spawnCli`, so scripts/node-matrix.mjs runs this file
 * against Node 18, 20, 22 and 24 by setting OPENGAME_TEST_NODE.
 */

const ANSI = /\x1b\[/;

async function project(files: Record<string, string | Uint8Array> = {}, manifestValue: unknown = manifest) {
  const root = await tempDir("og-env-");
  await writeFile(join(root.dir, "opengame.json"), typeof manifestValue === "string" ? manifestValue : JSON.stringify(manifestValue));
  await writeFile(join(root.dir, "index.html"), "<!doctype html><title>Night shift</title>");
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(join(root.dir, name)), { recursive: true });
    await writeFile(join(root.dir, name), body);
  }
  return root;
}

const quietOutput = () => new Output(true, () => {}, () => {});

test("colour and motion only reach a person's terminal, and NO_COLOR, TERM=dumb, CI and agents turn them off", async () => {
  const root = await project();
  try {
    const colored = await spawnCli(["check", root.dir], { tty: true, stdin: "open" });
    assert.match(colored.stdout, ANSI, "a bare terminal should get the styled output, or this test proves nothing");
    for (const extra of [{ NO_COLOR: "1" }, { TERM: "dumb" }, { CI: "true" }, { CLAUDECODE: "1" }, { CURSOR_AGENT: "1" }, { CODEX_THREAD_ID: "x" }, { OPENCODE: "1" }]) {
      const run = await spawnCli(["check", root.dir], { tty: true, stdin: "open", env: cleanEnv(extra) });
      assert.equal(run.code, 0, run.stdout);
      assert.doesNotMatch(run.stdout, ANSI, JSON.stringify(extra));
    }
    for (const stdin of ["open", "closed"] as const) {
      const piped = await spawnCli(["check", root.dir], { stdin });
      assert.doesNotMatch(piped.stdout + piped.stderr, ANSI);
    }
  } finally { await root.remove(); }
});

/** A forward proxy that tunnels CONNECT to a local HTTPS server (and to loopback), so the
 * CLI can reach `https://api.opengame.test` only by going through it. */
async function proxyRig() {
  const dir = await tempDir("og-proxy-");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir.dir, "key.pem"), "-out", join(dir.dir, "cert.pem"),
    "-subj", "/CN=api.opengame.test", "-addext", "subjectAltName=DNS:api.opengame.test", "-days", "2"], { stdio: "ignore" });
  const api = createHttps({ key: await readFile(join(dir.dir, "key.pem")), cert: await readFile(join(dir.dir, "cert.pem")) }, (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/v1/auth/me") return reply(res, 200, { handle: "nightshift", ogNumber: 7, avatar: { seed: 1, palette: "ink" } });
    reply(res, 404, { error: "not_found" });
  });
  api.listen(0, "127.0.0.1"); await once(api, "listening");
  const apiPort = (api.address() as { port: number }).port;
  const tunnels: { target: string; auth?: string }[] = [];
  let refuse = false;
  const proxy = createHttp((_req, res) => { res.statusCode = 405; res.end(); });
  proxy.on("connect", (req, socket, head) => {
    tunnels.push({ target: req.url!, auth: req.headers["proxy-authorization"] });
    if (refuse) { socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic\r\n\r\n"); return; }
    const [host, port] = req.url!.split(":");
    if (req.url !== "api.opengame.test:443" && host !== "127.0.0.1") { socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"); return; }
    const upstream = connect(host === "127.0.0.1" ? Number(port) : apiPort, "127.0.0.1", () => { socket.write("HTTP/1.1 200 Connection Established\r\n\r\n"); upstream.write(head); upstream.pipe(socket); socket.pipe(upstream); });
    upstream.on("error", () => socket.destroy());
  });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  const proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  return { proxyUrl, tunnels, cert: join(dir.dir, "cert.pem"), refuse: (value: boolean) => { refuse = value; },
    close: async () => { api.closeAllConnections(); proxy.closeAllConnections(); api.close(); proxy.close(); await dir.remove(); } };
}

test("HTTPS_PROXY carries every request, in either spelling, and NO_PROXY goes around it", async () => {
  const rig = await proxyRig();
  try {
    const base = { OPENGAME_API_URL: "https://api.opengame.test", OPENGAME_TOKEN: token, NODE_EXTRA_CA_CERTS: rig.cert };
    for (const variable of ["HTTPS_PROXY", "https_proxy"]) {
      const run = await spawnCli(["whoami", "--jsonl"], { env: cleanEnv({ ...base, [variable]: rig.proxyUrl }), stdin: "closed" });
      assert.equal(run.code, 0, `${variable}: ${run.stdout}${run.stderr}`);
      assert.equal((events(run.stdout).at(-1)!.data as { handle: string }).handle, "nightshift");
    }
    assert.deepEqual(rig.tunnels.map(t => t.target), ["api.opengame.test:443", "api.opengame.test:443"]);

    // Around the proxy, api.opengame.test does not resolve: a network error, which is the proof.
    const bypass = await spawnCli(["whoami", "--jsonl"], { env: cleanEnv({ ...base, HTTPS_PROXY: rig.proxyUrl, NO_PROXY: "api.opengame.test" }), stdin: "closed" });
    assert.equal(bypass.code, 5);
    assert.equal(events(bypass.stdout).at(-1)!.code, "network");
    // It says which origin it could not reach, so "check your API origin" can be checked.
    assert.equal(events(bypass.stdout).at(-1)!.message,
      "Could not reach the OpenGame API at https://api.opengame.test. Check your connection, HTTPS_PROXY and OPENGAME_API_URL, then retry.");
    assert.equal(rig.tunnels.length, 2, "NO_PROXY was ignored");

    // A proxy that wants credentials: the refusal names the proxy setting, never the password.
    rig.refuse(true);
    const refused = await spawnCli(["whoami", "--jsonl"], { env: cleanEnv({ ...base, HTTPS_PROXY: rig.proxyUrl.replace("http://", "http://builder:hunter2-not-real@") }), stdin: "closed" });
    assert.equal(refused.code, 5);
    assert.match(String(events(refused.stdout).at(-1)!.message), /HTTPS_PROXY/);
    assert.ok(!(refused.stdout + refused.stderr).includes("hunter2"), "the proxy password was printed");
    assert.match(String(rig.tunnels.at(-1)!.auth), /^Basic /);
  } finally { await rig.close(); }
});

/* undici tunnels every proxied request with CONNECT, http:// included, so a development
   origin reaches the proxy as a tunnel rather than as an absolute-form GET. */
test("HTTP_PROXY carries requests to an http:// development origin", async () => {
  const rig = await proxyRig();
  const api = await fakeApi((req, res) => { if (req.url === "/api/v1/auth/me") reply(res, 200, { handle: "nightshift", ogNumber: 7, avatar: { seed: 1, palette: "ink" } }); });
  try {
    const run = await spawnCli(["whoami", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, HTTP_PROXY: rig.proxyUrl }), stdin: "closed" });
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.deepEqual(rig.tunnels.map(t => t.target), [api.origin.replace("http://", "")]);
  } finally { await rig.close(); await api.close(); }
});

test("Windows paths: separators, drive letters and containment are read the Windows way", () => {
  const win = path.win32;
  assert.equal(bundlePathOf("C:\\Users\\dev\\game\\dist", "C:\\Users\\dev\\game\\dist\\assets\\Hero.png", win), "assets/Hero.png");
  assert.equal(bundlePathOf("D:\\g", "D:\\g\\Café\\cafe\u0301.png", win), "Café/café.png");
  assert.equal(insideProject("C:\\Users\\dev\\game", "C:\\Users\\dev\\game\\dist", win), true);
  assert.equal(insideProject("C:\\Users\\dev\\game", "C:\\Users\\dev\\game", win), true);
  assert.equal(insideProject("C:\\Users\\dev\\game", "C:\\Users\\dev\\game-old\\dist", win), false);
  assert.equal(insideProject("C:\\", "C:\\dist", win), true);
  assert.equal(insideProject("/home/dev/game", "/home/dev/game-old", path.posix), false);
  assert.match(String(unportableName("sprites\\hero.png")), /backslash/);
  assert.match(String(unportableName("C:hero.png")), /drive/);
  assert.equal(unportableName("hero.png"), null);
});

test("on Windows a rename waits out a file another process has open, and nowhere else does it retry", async () => {
  const busy = (code: string, times: number) => {
    let calls = 0;
    return { move: async () => { calls++; if (calls <= times) throw Object.assign(new Error(code), { code }); }, calls: () => calls };
  };
  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    const scanned = busy(code, 3);
    await replaceFile("a", "b", "win32", scanned.move);
    assert.equal(scanned.calls(), 4, code);
  }
  const elsewhere = busy("EPERM", 1);
  await assert.rejects(replaceFile("a", "b", "linux", elsewhere.move), /EPERM/);
  assert.equal(elsewhere.calls(), 1);
  const missing = busy("ENOENT", 1);
  await assert.rejects(replaceFile("a", "b", "win32", missing.move), /ENOENT/);
  assert.equal(missing.calls(), 1, "a real error is not retried");
});

test("a package spec that reaches cmd.exe through upgrade can carry none of cmd's metacharacters", () => {
  const good = "https://opengame.io/cli/opengamehq-cli-0.2.0.tgz";
  assert.ok(CLI_PACKAGE_PATTERN.test(good) && CLI_PACKAGE_PATTERN.test("@opengamehq/cli@0.2.0"));
  for (const char of ["&", "|", "<", ">", "^", "%", "!", "\"", "(", ")", " ", "\t", "\n", "\r", ";", "`", "$", ","]) {
    assert.equal(CLI_PACKAGE_PATTERN.test(good.replace("cli-0", `cli${char}0`)), false, JSON.stringify(char));
  }
});

test("every file the CLI replaces goes through replaceFile, so none of them fails on a Windows virus scan", async () => {
  const src = fileURLToPath(new URL("../src/", import.meta.url));
  const direct = [];
  for (const name of await readdir(src)) {
    if (!name.endsWith(".ts") || name === "files.ts") continue;
    const text = await readFile(join(src, name), "utf8");
    if (/import \{[^}]*\brename\b[^}]*\} from "(?:node:)?fs(?:\/promises)?"/.test(text) || /\brenameSync\(|\.rename\(/.test(text)) direct.push(name);
  }
  assert.deepEqual(direct, []);
});

test("a manifest saved on Windows, with a byte-order mark and CRLF line ends, reads like any other", async () => {
  const text = "\ufeff" + JSON.stringify(manifest, null, 2).replace(/\n/g, "\r\n") + "\r\n";
  const root = await project({ "game.js": "console.log(1)\r\n" }, text);
  try {
    assert.equal((await loadManifest(root.dir)).title, manifest.title);
    await writeFile(join(root.dir, "index.html"), "<!doctype html>\r\n<title>x</title>\r\n<script type=\"module\" src=\"./missing.js\"></script>\r\n");
    const run = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
    assert.equal(run.code, 1, "a CRLF page's missing script is still caught");
    assert.ok(events(run.stdout).some(event => event.type === "finding" && JSON.stringify(event).includes("missing.js")));
  } finally { await root.remove(); }
});

test("a Windows path in opengame.json is refused with the sentence that fixes it", async () => {
  for (const [output, sentence] of [["dist\\web", /forward slashes/], ["C:/game/dist", /drive letter/]] as const) {
    const root = await project({}, { ...manifest, build: { output } });
    try {
      const run = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
      assert.equal(run.code, 1);
      const findings = events(run.stdout).filter(event => event.type === "finding");
      assert.equal(findings.length, 1, "one finding for one field");
      assert.match(JSON.stringify(findings[0]), sentence);
    } finally { await root.remove(); }
  }
});

test("a decomposed name from macOS is packaged composed, the way a page asks for it", async () => {
  const root = await project({ "cafe\u0301.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });
  try {
    await writeFile(join(root.dir, "index.html"), "<!doctype html><title>x</title><img src=\"caf\u00e9.png\">");
    const stored = (await readdir(root.dir)).find(name => name.startsWith("caf"))!;
    const archive = await createArchive(root.dir, manifest as never, quietOutput());
    const names = Object.keys(unzipSync(archive.bytes));
    assert.ok(names.includes("caf\u00e9.png"), `archive names: ${JSON.stringify(names)}; on disk: ${JSON.stringify(stored)}`);
    const run = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
    assert.ok(!run.stdout.includes("missing-ref"), "the composed reference should find the file");
  } finally { await root.remove(); }
});

test("a composed and a decomposed name for one file are refused rather than one silently replacing the other", () => {
  // Only a normalisation-sensitive file system (Linux) can hold both, so this is the rule on its own.
  const seen = new Map<string, string>();
  assert.equal(sameComposedName(seen, "café.png", "caf\u00e9.png"), null);
  assert.equal(sameComposedName(seen, "café.png", "caf\u00e9.png"), null, "the same name seen twice is not a collision");
  assert.equal(sameComposedName(seen, "café.png", "cafe\u0301.png"), '"caf\u00e9.png" and "cafe\u0301.png"');
});

test("unicode names survive packaging, flagged as UTF-8", async () => {
  const root = await project({ "日本/絵.png": new Uint8Array([1]), "emoji_🎮.json": "{}", "Ünïcødé/naïve.txt": "x" });
  try {
    const archive = await createArchive(root.dir, manifest as never, quietOutput());
    assert.deepEqual(Object.keys(unzipSync(archive.bytes)).sort(), ["emoji_🎮.json", "index.html", "Ünïcødé/naïve.txt", "日本/絵.png"].sort());
    // General purpose bit 11 on every non-ASCII entry, or the archive stage reads the names as cp437.
    const bytes = Buffer.from(archive.bytes);
    for (let at = bytes.indexOf("PK\x01\x02"); at >= 0; at = bytes.indexOf("PK\x01\x02", at + 4)) {
      const name = bytes.subarray(at + 46, at + 46 + bytes.readUInt16LE(at + 28)).toString("utf8");
      if (/[^\x00-\x7f]/.test(name)) assert.ok(bytes.readUInt16LE(at + 8) & 0x800, `${name} is not flagged UTF-8`);
    }
  } finally { await root.remove(); }
});

test("a backslash inside a filename is refused by name, not as an archive that could not be assembled", async () => {
  if (process.platform === "win32") return;
  const root = await project({ "sprites\\hero.png": new Uint8Array([1]) });
  try {
    const run = await spawnCli(["deploy", root.dir, "--dry-run", "--jsonl"], { stdin: "closed" });
    assert.equal(run.code, 1);
    const last = events(run.stdout).at(-1)!;
    assert.equal(last.code, "unportable_name", run.stdout);
    assert.match(String(last.message), /sprites\\hero\.png/);
  } finally { await root.remove(); }
});

test("a path too long to store is refused before upload; a long one that fits is packaged", async () => {
  const segment = (n: number) => "level_directory_" + String(n).padStart(2, "0");
  const fits = Array.from({ length: 30 }, (_, i) => segment(i)).join("/") + "/a.png";
  // Just past the cap: a few bytes over it is still inside what macOS's 1024-byte PATH_MAX allows.
  const tooLong = Array.from({ length: Math.ceil(LIMITS.bundle.pathBytesMax / 19) + 1 }, (_, i) => segment(i)).join("/") + "/a.png";
  assert.ok(Buffer.byteLength(fits) < LIMITS.bundle.pathBytesMax && Buffer.byteLength(tooLong) > LIMITS.bundle.pathBytesMax);
  const root = await project({ [fits]: new Uint8Array([1]) });
  try {
    assert.equal((await spawnCli(["deploy", root.dir, "--dry-run", "--jsonl"], { stdin: "closed" })).code, 0);
    await mkdir(path.dirname(join(root.dir, tooLong)), { recursive: true });
    await writeFile(join(root.dir, tooLong), new Uint8Array([1]));
    const run = await spawnCli(["deploy", root.dir, "--dry-run", "--jsonl"], { stdin: "closed" });
    assert.equal(run.code, 1);
    assert.ok(events(run.stdout).some(event => event.type === "finding" && (event.finding as { check: string }).check === "path-too-long"));
  } finally { await root.remove(); }
});

test("links are refused where they would be packaged and ignored where nothing is", async () => {
  const root = await project({ "real/asset.png": new Uint8Array([1]), "node_modules/.pnpm/x/index.js": "x" });
  try {
    await symlink(join(root.dir, "node_modules/.pnpm/x"), join(root.dir, "node_modules/x"));
    const ignored = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
    assert.equal(ignored.code, 0, ignored.stdout);
    await symlink(join(root.dir, "real"), join(root.dir, "linked"));
    const refused = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
    assert.equal(refused.code, 1);
    assert.equal(events(refused.stdout).at(-1)!.code, "symlink");
    assert.match(String(events(refused.stdout).at(-1)!.message), /^linked is a symlink/);
  } finally { await root.remove(); }
});

test("an empty file is a file", async () => {
  const root = await project({ "empty.bin": new Uint8Array(0), "levels/blank.json": "" });
  try {
    const archive = await createArchive(root.dir, manifest as never, quietOutput());
    const entries = unzipSync(archive.bytes);
    assert.equal(entries["empty.bin"]!.byteLength, 0);
    assert.equal(entries["levels/blank.json"]!.byteLength, 0);
  } finally { await root.remove(); }
});

test("a project at the file-count limit packages, and one file more is refused with the number", async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < LIMITS.bundle.fileCountMax - 1; i++) files[`tiles/t${i}.json`] = "{}";
  const root = await project(files);
  try {
    const atLimit = await spawnCli(["deploy", root.dir, "--dry-run", "--jsonl"], { stdin: "closed", deadlineMs: 60_000 });
    assert.equal(atLimit.code, 0, atLimit.stdout.slice(-400));
    assert.equal((events(atLimit.stdout).at(-1)!.data as { files: number }).files, LIMITS.bundle.fileCountMax);
    await writeFile(join(root.dir, "tiles/one-more.json"), "{}");
    const over = await spawnCli(["deploy", root.dir, "--dry-run", "--jsonl"], { stdin: "closed", deadlineMs: 60_000 });
    assert.equal(over.code, 1);
    assert.equal(events(over.stdout).at(-1)!.code, "bundle_limit");
    assert.match(String(events(over.stdout).at(-1)!.message), new RegExp(LIMITS.bundle.fileCountMax.toLocaleString("en-GB")));
  } finally { await root.remove(); }
});

test("a project exactly at the uncompressed limit is collected, and one byte more is refused in MiB", async () => {
  const root = await project();
  try {
    const page = (await readFile(join(root.dir, "index.html"))).byteLength;
    // Sparse: the size is what is counted, and nothing here reads the bytes. In files no
    // bigger than one may be (bundle.fileBytesMax), so only the total is at the limit.
    let index = 0;
    for (let left = LIMITS.bundle.uncompressedBytesMax - page; left > 0; left -= LIMITS.bundle.fileBytesMax, index += 1) {
      await writeFile(join(root.dir, `world${index}.bin`), "");
      await truncate(join(root.dir, `world${index}.bin`), Math.min(left, LIMITS.bundle.fileBytesMax));
    }
    assert.equal((await collectFiles(root.dir)).files.reduce((sum, file) => sum + file.size, 0), LIMITS.bundle.uncompressedBytesMax);
    await writeFile(join(root.dir, "one-more.bin"), "x");
    await assert.rejects(collectFiles(root.dir), (error: Error & { code?: string }) =>
      error.code === "bundle_limit" && error.message.includes(`over the ${readableBytes(LIMITS.bundle.uncompressedBytesMax)} limit`));
  } finally { await root.remove(); }
});

test("a game over the archive cap uncompressed, but under it compressed, is accepted as the web uploader accepts it", async () => {
  const mib = 1048576, cap = LIMITS.bundle.archiveBytesMax, file = LIMITS.bundle.fileBytesMax;
  // Just over the archive cap in all, in files no bigger than bundle.fileBytesMax:
  // incompressible media at half the cap and level data at three fifths of it, each cut
  // into as many files as the per-file cap needs (a 1 GiB cap is two media files and three
  // of level data). One buffer of each is written under every name, so the test holds two
  // files' worth of bytes however large the cap is.
  const split = (total: number) => { const count = Math.ceil(total / file); return { count, size: Math.floor(total / count) }; };
  const media = split(Math.floor(cap * 0.5)), data = split(Math.floor(cap * 0.6));
  const total = media.count * media.size + data.count * data.size;
  assert.ok(total > cap && total < LIMITS.bundle.uncompressedBytesMax);
  // Four symbols, so it deflates about four to one: compressible, nowhere near a bomb.
  const clip = randomBytes(media.size), levels = randomBytes(data.size).map(byte => 0x41 + (byte & 3));
  const root = await project({
    ...Object.fromEntries(Array.from({ length: media.count }, (_, n) => [`media/clip-${n}.mp4`, clip])),
    ...Object.fromEntries(Array.from({ length: data.count }, (_, n) => [n ? `data/levels-${n + 1}.bin` : "data/levels.bin", levels])) });
  try {
    const archive = await createArchive(root.dir, manifest as never, quietOutput());
    assert.ok(archive.bytes.byteLength <= cap, `${Math.round(archive.bytes.byteLength / mib)} MiB`);
    assert.ok(total / archive.bytes.byteLength < LIMITS.bundle.compressionRatioMax);
    const entries = unzipSync(archive.bytes, { filter: file => file.name === "data/levels.bin" });
    assert.equal(entries["data/levels.bin"]!.byteLength, data.size);
  } finally { await root.remove(); }
});

test("an archive that would expand past the ratio guard is stored instead of deflated", async () => {
  // Zeros deflate about a thousand to one, which the archive stage reads as a bomb.
  const root = await project({ "data/zeros.bin": new Uint8Array(8 * 1048576) });
  try {
    const archive = await createArchive(root.dir, manifest as never, quietOutput());
    assert.ok(8 * 1048576 / archive.bytes.byteLength <= LIMITS.bundle.compressionRatioMax);
  } finally { await root.remove(); }
});

/* Retain each CLI writer's actual manifests. A new version must have its own
   output recorded beside earlier snapshots, so the reader cannot silently lose
   compatibility when the manifest shape or default output selection changes. */
test("opengame.json files written by every CLI version still read, and the current version has its own", async () => {
  const fixtures = new URL("./fixtures/manifests/", import.meta.url);
  const versions = await readdir(fixtures);
  const current = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
  assert.ok(versions.includes(current), `CLI ${current} has no recorded manifests in tests/fixtures/manifests/${current}; write them with this CLI before the version ships`);
  for (const version of versions) {
    const dir = new URL(`${version}/`, fixtures);
    for (const name of await readdir(dir)) {
      const root = await project({}, await readFile(new URL(name, dir), "utf8"));
      try { await loadManifest(root.dir); }
      catch (error) { assert.fail(`${version}/${name} no longer reads: ${(error as Error).message}`); }
      finally { await root.remove(); }
    }
  }
});

test("a field a newer CLI wrote is named, and the fix offered is an upgrade as well as a removal", async () => {
  const root = await project({}, { ...manifest, storage: { saves: true }, leaderboards: [{ key: "rounds", order: "desc", label: "Rounds", unit: "rounds" }] });
  try {
    const run = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
    assert.equal(run.code, 1);
    const findings = events(run.stdout).filter(event => event.type === "finding").map(event => event.finding as { evidence: { observed: string }; fix: string; certainty: string });
    assert.ok(findings.some(f => /storage/.test(f.evidence.observed) && /upgrade/.test(f.fix) && f.certainty === "heuristic"), JSON.stringify(findings));
    assert.ok(findings.some(f => /leaderboards\.0\.unit/.test(f.evidence.observed)), JSON.stringify(findings));
  } finally { await root.remove(); }
});

/* The fix names the npx form only once packages/shared/npm-release.json says the CLI is on
   npm. It printed the npx command with the switch shut until 5 Nov 2026. */
test("the upgrade fix for an unknown field names npm only when the switch is open", async () => {
  const emitted: { type: string; finding?: { fix: string } }[] = [];
  const root = await project({}, { ...manifest, storage: { saves: true } });
  try {
    await assert.rejects(loadManifest(root.dir, { emit: (event: unknown) => emitted.push(event as never) } as unknown as Output));
    const fix = emitted.find(event => event.type === "finding")?.finding?.fix ?? "";
    assert.match(fix, /upgrade with opengame upgrade/);
    if (installsOpen(release)) assert.ok(fix.includes(`(or npx ${release.packages.cli}@latest)`), fix);
    else assert.doesNotMatch(fix, /@opengamehq|npx/, fix);
  } finally { await root.remove(); }
});

test("a manifest finding and a preflight finding carry one check version", async () => {
  // The manifest finding said "1" beside preflight's "packaging@1", two schemes for one
  // contract, in one run of opengame check.
  const { localFinding } = await import("../src/archive");
  const emitted: { type: string; finding?: { check: string; checkVersion: string } }[] = [];
  const root = await project({}, { ...manifest, description: "Too short." });
  try {
    await assert.rejects(loadManifest(root.dir, { emit: (event: unknown) => emitted.push(event as never) } as unknown as Output));
    const found = emitted.find(event => event.type === "finding" && event.finding?.check === "manifest");
    assert.ok(found, JSON.stringify(emitted));
    const preflight = localFinding({ code: "missing-ref", severity: "blocker", title: "x" });
    assert.equal(found.finding!.checkVersion, preflight.checkVersion);
    assert.equal(preflight.checkVersion, `packaging@${LIMITS.platform.packagingContract}`);
  } finally { await root.remove(); }
});

test("a missing asset is named in the finding, not only counted", async () => {
  const root = await project();
  try {
    await writeFile(join(root.dir, "index.html"), "<!doctype html><title>x</title><img src=\"art/missing-tile.png\">");
    const run = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
    const finding = events(run.stdout).find(event => event.type === "finding" && (event.finding as { check: string }).check === "missing-ref");
    assert.ok(finding, run.stdout);
    assert.match(JSON.stringify(finding), /art\/missing-tile\.png/);
  } finally { await root.remove(); }
});

test("only a missing reference says Not found; two roots name the candidates and a name rule names the other file", async () => {
  const fixes = async (files: Record<string, string>, check: string) => {
    const root = await tempDir("og-env-more-");
    try {
      await writeFile(join(root.dir, "opengame.json"), JSON.stringify(manifest));
      for (const [name, body] of Object.entries(files)) {
        await mkdir(path.dirname(join(root.dir, name)), { recursive: true });
        await writeFile(join(root.dir, name), body);
      }
      const run = await spawnCli(["check", root.dir, "--jsonl"], { stdin: "closed" });
      const finding = events(run.stdout).map(event => event.finding as { check: string; fix: string } | undefined).find(f => f?.check === check);
      assert.ok(finding, `${check} not reported: ${run.stdout}`);
      return finding.fix;
    } finally { await root.remove(); }
  };
  const roots = await fixes({ "a/index.html": "<!doctype html><title>a</title>", "b/index.html": "<!doctype html><title>b</title>" }, "root-ambiguous");
  assert.doesNotMatch(roots, /Not found/);
  assert.match(roots, /^Candidates: a\/index\.html; b\/index\.html\. /);
  /* Two archives inside the game: both are present, and the list names the second. (A
     case clash goes the same way through names.ts, but cannot be written on the
     case-insensitive disk most Macs have.) */
  const nested = await fixes({ "index.html": "<!doctype html><title>x</title>", "one.zip": "PK", "two.zip": "PK" }, "nested-archive");
  assert.doesNotMatch(nested, /Not found/);
  assert.match(nested, /^Also: two\.zip\. /);
  const missing = await fixes({ "index.html": "<!doctype html><title>x</title><img src=\"art/gone.png\">" }, "missing-ref");
  assert.match(missing, /^Not found: index\.html:1 → art\/gone\.png\. /);
});

test("a server that needs a newer CLI stops every command that talks to it with exit 6 and the upgrade line", async () => {
  const gameId = "44444444-4444-4444-8444-444444444444";
  const api = await fakeApi((req, res) => {
    // As the server does: every answer names the minimum except the ones a sign-in is made of.
    if (!req.url?.startsWith("/api/v1/auth/device")) res.setHeader("x-opengame-min-cli", "99.0.0");
    if (req.url === "/api/v1/bootstrap") return reply(res, 200, startupInformation({ minimumCliVersion: "99.0.0", package: "@opengamehq/cli@99.0.0" }));
    if (req.url === "/api/v1/cli") return reply(res, 200, { minimumCliVersion: "99.0.0", package: req.headers.authorization ? "@opengamehq/cli@99.0.0" : null });
    if (req.url?.startsWith("/api/v1/auth/device")) return reply(res, 200, { device_code: "A".repeat(43), user_code: "BCDF-GHJK", verification_uri: `${api.origin}/cli`, expires_in: 600, interval: 5 });
    reply(res, 200, {});
  });
  const root = await project();
  const config = await tempDir("og-env-upgrade-");
  try {
    await mkdir(join(root.dir, ".opengame"));
    await writeFile(join(root.dir, ".opengame/project.json"), JSON.stringify({ version: 1, origin: api.origin, gameId }));
    const env = cleanEnv({ OPENGAME_API_URL: api.origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1", XDG_CONFIG_HOME: config.dir, OPENGAME_CREDENTIAL_STORE: "file" });
    const runs = [["whoami"], ["games"], ["link", root.dir, "--game", "abc123"], ["open", root.dir], ["pull", root.dir], ["jams"],
      ["submit", root.dir, "--release", "11111111-1111-4111-8111-111111111111", "--no-jam"], ["status", root.dir], ["deploy", root.dir, "--no-wait"], ["logout", "--revoke"]];
    for (const args of runs) {
      const run = await spawnCli([...args, "--jsonl"], { env, stdin: "open" });
      const last = events(run.stdout).at(-1)!;
      assert.deepEqual([run.code, last.code, last.next], [6, "upgrade_required", "opengame upgrade"], `${args[0]}: ${run.stdout}`);
    }
    const plain = await spawnCli(["whoami"], { env, stdin: "open", tty: true });
    assert.equal(plain.code, 6);
    assert.match(plain.stdout + plain.stderr, /server needs 99\.0\.0 or newer\. Run opengame upgrade; if you are signed out, run opengame login first/);
    assert.doesNotMatch(plain.stdout + plain.stderr, /^\s*\{/, "a human terminal must receive readable error text rather than agent JSON");
    /* Signed out, login and upgrade used to send a person to each other for ever. The
       sign-in answers carry no minimum, so login reaches the code, and upgrade says to log in. */
    const signedOut = { ...env }; delete signedOut.OPENGAME_TOKEN;
    const login = await spawnCli(["login", "--jsonl"], { env: signedOut, stdin: "open" });
    assert.equal(login.code, 3, login.stdout);
    assert.equal(events(login.stdout).at(-1)!.code, "login_pending");
    const outdated = await spawnCli(["upgrade", "--jsonl"], { env: signedOut, stdin: "open" });
    assert.equal(outdated.code, 0, outdated.stdout);
    assert.equal((events(outdated.stdout).at(-1)!.data as { next: string }).next, "opengame login");
    const upgrade = await spawnCli(["upgrade", "--dry-run", "--jsonl"], { env, stdin: "open" });
    assert.equal(upgrade.code, 0, upgrade.stdout);
    assert.equal((events(upgrade.stdout).at(-1)!.data as { behind: boolean }).behind, true);
  } finally { await api.close(); await root.remove(); await config.remove(); }
});

test("an origin that answers with something other than the API is not called unreachable", async () => {
  // A captive portal, a proxy's sign-in page or a wrong OPENGAME_API_URL answers 200 with
  // HTML. "Could not reach" sent people to check a connection that was working.
  const server = createHttp((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>Sign in to the network</title>"); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const run = await spawnCli(["whoami", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }), stdin: "closed" });
    assert.equal(run.code, 5);
    const last = events(run.stdout).at(-1)!;
    assert.equal(last.code, "network");
    assert.equal(last.message, `The OpenGame API at ${origin} sent an answer this CLI could not read. Check OPENGAME_API_URL and HTTPS_PROXY, then retry.`);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("a connection that drops partway through the answer is still could not reach", async () => {
  // Headers arrived, the body did not: nothing was answered, so the advice is the network.
  const server = createHttp((_req, res) => { res.writeHead(200, { "content-type": "application/json", "content-length": "400" }); res.write("{\"apiVersion\":"); setTimeout(() => res.socket?.destroy(), 20); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const run = await spawnCli(["whoami", "--jsonl"], { env: cleanEnv({ OPENGAME_API_URL: origin, OPENGAME_TOKEN: token, NO_PROXY: "127.0.0.1" }), stdin: "closed" });
    assert.equal(run.code, 5);
    assert.match(String(events(run.stdout).at(-1)!.message), /^Could not reach the OpenGame API at /);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

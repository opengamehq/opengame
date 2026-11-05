import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, link, mkdir, readFile, readdir, realpath, rename, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { devSnapshot } from "../src/dev";
import { createHash } from "node:crypto";
import { BUILD_CHANGED, PYTHON_CANDIDATES, readGroups, safeHashFiles, safeReadFile, safeReadFiles, safeSnapshot, writeStage, type HashProgress } from "../src/safe-fs";
import { CliError } from "../src/output";
import { LIMITS } from "@opengame/shared";
import { inspectArchive } from "../src/archive";
import { Output } from "../src/output";
import { tempDir } from "./shell";

const helper = fileURLToPath(new URL("../src/safe-fs.py", import.meta.url));
// Patches only the OS call boundary in the real helper. Each swap happens after
// the parent fd has been opened, precisely where another realpath would lose.
const race = String.raw`
import base64, io, json, os, runpy, sys
job = json.load(sys.stdin)
execute = runpy.run_path(job.pop("helper"))["execute"]
mode = job.pop("race")
root, outside = job["root"], job.pop("outside")
original_open, original_mkdir, original_stat = os.open, os.mkdir, os.stat
swapped = False
outside_opened = False

def swap(path):
    global swapped
    os.rename(path, path + "-moved")
    os.symlink(outside, path)
    swapped = True

def opening(path, flags, *args, **kwargs):
    global outside_opened
    if not swapped and path == "asset.js" and mode in ("read", "write"):
        swap(root + ("/assets" if mode == "read" else "/stage/assets"))
    # The export root itself, after its fd and the file's ancestors are already held.
    if not swapped and path == "asset.js" and mode == "root":
        swap(root)
    fd = original_open(path, flags, *args, **kwargs)
    if path == "asset.js":
        expected = os.stat(outside + "/asset.js")
        actual = os.fstat(fd)
        outside_opened = (actual.st_dev, actual.st_ino) == (expected.st_dev, expected.st_ino)
    return fd

def making(path, *args, **kwargs):
    if not swapped and mode == "parent" and path == "stage":
        swap(root + "/parent")
    return original_mkdir(path, *args, **kwargs)

def checking(path, *args, **kwargs):
    global swapped
    if not swapped and mode == "state_gone" and path == ".opengame":
        os.rename(root + "/.opengame", root + "/.opengame-moved")
        swapped = True
    # "sizes" stats the leaf rather than opening it, so its race is here.
    if not swapped and mode == "sizes" and path == "asset.js":
        swap(root + "/assets")
    return original_stat(path, *args, **kwargs)

os.open, os.mkdir, os.stat = opening, making, checking
# Capability detection describes the underlying OS, not these test wrappers.
os.supports_dir_fd = set(os.supports_dir_fd) | {opening, making, checking}
stream = io.BytesIO(base64.b64decode(job.pop("stream"))) if "stream" in job else None
result = execute(job, stream)
result.update(swapped=swapped, outsideOpened=outside_opened)
print(json.dumps(result))
`;

function runRace(job: Record<string, unknown>) {
  const result = spawnSync("python3", ["-I", "-c", race], { input: JSON.stringify({ helper, ...job }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("dev snapshot rejects ancestor symlinks and serves only a bounded memory copy", async () => {
  const fixture = await tempDir("og-safe-snapshot-");
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "index.html"), "game");
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets/asset.js"), "original");
    const snapshot = await devSnapshot(root);
    await writeFile(join(root, "assets/asset.js"), "changed!");
    assert.equal(snapshot.get("assets/asset.js")!.toString(), "original");
    await rename(join(root, "assets"), join(root, "assets-real"));
    await symlink(join(root, "assets-real"), join(root, "assets"));
    await assert.rejects(devSnapshot(root), { code: "symlink" });
  } finally { await fixture.remove(); }
});

test("a read ancestor swapped after its fd opens cannot expose an equal-sized outside file", async () => {
  const fixture = await tempDir("og-safe-read-race-");
  try {
    const root = await realpath(fixture.dir);
    await mkdir(join(root, "assets")); await mkdir(join(root, "outside"));
    await writeFile(join(root, "assets/asset.js"), "inside!");
    await writeFile(join(root, "outside/asset.js"), "secret!");
    const result = runRace({ operation: "read", root, outside: join(root, "outside"), race: "read", maximum: 100,
      files: [{ path: "assets/asset.js", relative: "assets/asset.js", size: 7 }] });
    assert.equal(result.swapped, true);
    assert.equal(result.outsideOpened, false);
    assert.equal(result.error, "build_changed");
    assert.equal(result.files, undefined);
  } finally { await fixture.remove(); }
});

test("staging pins ancestor directories and never recursively cleans exchanged paths", async () => {
  for (const operation of ["stage", "stage-stream"]) for (const mode of ["write", "parent"]) {
    const fixture = await tempDir("og-safe-write-race-");
    try {
      const root = await realpath(fixture.dir);
      await mkdir(join(root, "outside")); await mkdir(join(root, "parent"));
      await writeFile(join(root, "outside/asset.js"), "keep private");
      const bytes = Buffer.from("public export");
      const result = runRace({ operation, root, outside: join(root, "outside"), race: mode,
        target: mode === "parent" ? "parent/stage" : "stage",
        files: [["assets/asset.js", operation === "stage" ? bytes.toString("base64") : bytes.length]],
        ...(operation === "stage-stream" ? { stream: bytes.toString("base64") } : {}) });
      assert.equal(result.swapped, true);
      assert.equal(result.outsideOpened, false);
      assert.equal(result.error, "build_changed");
      assert.equal(await readFile(join(root, "outside/asset.js"), "utf8"), "keep private");
      assert.deepEqual(await readdir(join(root, "outside")), ["asset.js"]);
      const partial = mode === "parent" ? "parent-moved/stage/assets/asset.js" : "stage/assets-moved/asset.js";
      assert.equal(await readFile(join(root, partial), "utf8"), "public export", "partial output stays for inspection");
    } finally { await fixture.remove(); }
  }
});

test("exclusive staging never replaces an existing export", async () => {
  const fixture = await tempDir("og-safe-stage-");
  try {
    const root = await realpath(fixture.dir);
    const files = new Map([["index.html", Buffer.from("game")]]);
    await writeStage(root, "export", files);
    await assert.rejects(writeStage(root, "export", new Map([["index.html", Buffer.from("other")]])), { code: "vendor_output_exists" });
    assert.equal(await readFile(join(root, "export/index.html"), "utf8"), "game");
  } finally { await fixture.remove(); }
});

test("streamed staging preserves chunk boundaries, empty files and binary bytes", async () => {
  const fixture = await tempDir("og-safe-stage-stream-");
  try {
    const root = await realpath(fixture.dir);
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 7, 255);
    bytes[1024 * 1024] = 0;
    const files = new Map<string, Buffer>([["assets/large.bin", bytes], ["empty.bin", Buffer.alloc(0)], ["tail.bin", Buffer.from([0, 10, 255])]]);
    await writeStage(root, "export", files);
    for (const [name, wanted] of files) assert.deepEqual(await readFile(join(root, "export", name)), wanted);
  } finally { await fixture.remove(); }
});

test("streamed staging refuses truncated and extra bytes without removing partial output", async () => {
  for (const bytes of [Buffer.from("ab"), Buffer.from("abcd")]) {
    const fixture = await tempDir("og-safe-stage-length-");
    try {
      const root = await realpath(fixture.dir);
      const header = { operation: "stage-stream", root, target: "export", files: [["asset.bin", 3]] };
      const result = spawnSync("python3", ["-I", "-S", helper], { input: Buffer.concat([Buffer.from(JSON.stringify(header) + "\n"), bytes]) });
      assert.equal(result.status, 0, result.stderr.toString());
      assert.deepEqual(JSON.parse(result.stdout.toString()), { error: "build_changed" });
      assert.deepEqual(await readFile(join(root, "export/asset.bin")), bytes.subarray(0, 3));
    } finally { await fixture.remove(); }
  }
});


test("single-file reads distinguish missing state from an ancestor symlink to missing state", async () => {
  const fixture = await tempDir("og-safe-state-");
  try {
    const root = await realpath(fixture.dir);
    await assert.rejects(safeReadFile(root, ".opengame/project.json", 100), { code: "ENOENT" });
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(root, ".opengame"));
    await assert.rejects(safeReadFile(root, ".opengame/project.json", 100), { code: "build_changed" });
  } finally { await fixture.remove(); }
});

test("missing Python fails explicitly without falling back to path writes", async () => {
  const fixture = await tempDir("og-missing-python-");
  const before = PYTHON_CANDIDATES.splice(0);
  try {
    const root = await realpath(fixture.dir);
    PYTHON_CANDIDATES.push(join(root, "no-executables/python3"));
    await assert.rejects(writeStage(root, "export", new Map([["index.html", Buffer.from("game")]])), { code: "filesystem_unsupported" });
    assert.deepEqual(await readdir(root), []);
  } finally {
    PYTHON_CANDIDATES.splice(0, Infinity, ...before);
    await fixture.remove();
  }
});

test("a candidate that exists but cannot run falls through, and the helper gets -I -S and almost no environment", async () => {
  /* The first stands in for the macOS /usr/bin/python3 stub on a machine without the
     Command Line Tools: present, executable, exits non-zero. The second wraps a real
     interpreter and records its arguments and environment before running it. */
  const fixture = await tempDir("og-python-probe-");
  const before = PYTHON_CANDIDATES.splice(0);
  const real = before.find(candidate => spawnSync(candidate, ["-c", "import os"]).status === 0);
  assert.ok(real, "this machine needs a working Python 3 at one of the fixed paths");
  process.env.OG_TEST_LEAK = "must-not-reach-the-helper";
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "game.txt"), "the real bytes");
    await writeFile(join(root, "stub"), "#!/bin/sh\nexit 1\n");
    await writeFile(join(root, "wrapped"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${join(root, "args")}"\nenv >> "${join(root, "env")}"\nexec "${real}" "$@"\n`);
    await chmod(join(root, "stub"), 0o755); await chmod(join(root, "wrapped"), 0o755);
    PYTHON_CANDIDATES.push(join(root, "stub"), join(root, "wrapped"));
    assert.equal((await safeReadFile(root, "game.txt", 100)).toString(), "the real bytes");
    const args = (await readFile(join(root, "args"), "utf8")).trim().split("\n");
    assert.ok(args.length >= 2 && args.every(line => line.startsWith("-I -S ")), args.join(" | "));
    const env = await readFile(join(root, "env"), "utf8");
    assert.doesNotMatch(env, /OG_TEST_LEAK/);
    assert.match(env, /^PATH=\/usr\/bin:\/bin$/m);
  } finally {
    delete process.env.OG_TEST_LEAK;
    PYTHON_CANDIDATES.splice(0, Infinity, ...before);
    await fixture.remove();
  }
});

test("no working interpreter names the fix", async () => {
  const fixture = await tempDir("og-python-none-");
  const before = PYTHON_CANDIDATES.splice(0);
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "stub"), "#!/bin/sh\nexit 1\n"); await chmod(join(root, "stub"), 0o755);
    PYTHON_CANDIDATES.push(join(root, "stub"));
    await assert.rejects(safeReadFile(root, "game.txt", 100), (error: Error & { code?: string }) =>
      error.code === "filesystem_unsupported" && /python\.org or Homebrew/.test(error.message));
  } finally { PYTHON_CANDIDATES.splice(0, Infinity, ...before); await fixture.remove(); }
});

test("a python3 on PATH, such as one in the project's node_modules/.bin, is never the interpreter", async () => {
  /* npm run puts node_modules/.bin first on PATH, so any dependency could ship a python3
     there. This one records that it ran and answers with a file that is not in the
     project, which is what a planted interpreter would do with every read. */
  const fixture = await tempDir("og-python-shadow-");
  const before = process.env.PATH;
  try {
    const root = await realpath(fixture.dir);
    const bin = join(root, "node_modules/.bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(root, "game.txt"), "the real bytes");
    await writeFile(join(bin, "python3"), `#!/bin/sh\ntouch "${join(root, "planted-ran")}"\nprintf '{"files":[["game.txt","cGxhbnRlZA=="]]}'\n`);
    await chmod(join(bin, "python3"), 0o755);
    process.env.PATH = `${bin}:${before ?? ""}`;
    assert.equal((await safeReadFile(root, "game.txt", 100)).toString(), "the real bytes");
    await assert.rejects(access(join(root, "planted-ran")), { code: "ENOENT" });
  } finally {
    if (before === undefined) delete process.env.PATH; else process.env.PATH = before;
    await fixture.remove();
  }
});


test("a state directory disappearing after the read cannot be mistaken for an unlinked game", async () => {
  const fixture = await tempDir("og-state-read-race-");
  try {
    const root = await realpath(fixture.dir);
    await mkdir(join(root, ".opengame"));
    await writeFile(join(root, ".opengame/project.json"), "{}");
    const result = runRace({ operation: "read", root, outside: root, race: "state_gone", maximum: 100, allowMissing: true,
      files: [{ path: ".opengame/project.json", relative: ".opengame/project.json" }] });
    assert.equal(result.swapped, true);
    assert.equal(result.error, "build_changed");
    assert.equal(result.files, undefined);
  } finally { await fixture.remove(); }
});


test("a size refusal is the caller's own, and a refused read uses the caller's words", async () => {
  const fixture = await tempDir("og-safe-words-");
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "big.bin"), Buffer.alloc(64));
    const tooLarge = () => Object.assign(new Error("too large"), { code: "cover_size" });
    await assert.rejects(safeReadFile(root, "big.bin", 10, { tooLarge: tooLarge as never }), { code: "cover_size" });
    // Without a size refusal of its own, over the limit is a change, in the caller's words.
    await assert.rejects(safeReadFile(root, "big.bin", 10, { changed: "caller words" }), { code: "build_changed", message: "caller words" });
    await mkdir(join(root, "real")); await writeFile(join(root, "real/x.txt"), "x");
    await symlink(join(root, "real"), join(root, "linked"));
    await assert.rejects(safeReadFile(root, "linked/x.txt", 10, { changed: "caller words" }), { code: "build_changed", message: "caller words" });
  } finally { await fixture.remove(); }
});

test("check and deploy say the build changed; vendor keeps its staging sentence", async () => {
  /* The helper is replaced by one that always answers build_changed, which is what a file
     changing between collection and read produces, and is otherwise a race to arrange. */
  const fixture = await tempDir("og-safe-check-words-");
  const before = PYTHON_CANDIDATES.splice(0);
  const real = before.find(candidate => spawnSync(candidate, ["-c", "import os"]).status === 0)!;
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "index.html"), "<!doctype html><title>Game</title>");
    await writeFile(join(root, "changed"), `#!/bin/sh\ncase "$*" in *safe-fs.py*) cat >/dev/null; printf '{"error":"build_changed"}';; *) exec "${real}" "$@";; esac\n`);
    await chmod(join(root, "changed"), 0o755);
    PYTHON_CANDIDATES.push(join(root, "changed"));
    const manifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] } as never;
    const silent = new Output(true, () => {});
    await assert.rejects(inspectArchive(root, manifest, silent), { code: "build_changed", message: BUILD_CHANGED });
    await assert.rejects(inspectArchive(root, manifest, silent, root, { vendor: true }), { code: "build_changed", message: /retry with a new output folder/ });
  } finally { PYTHON_CANDIDATES.splice(0, Infinity, ...before); await fixture.remove(); }
});

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const roomy = { fileBytes: 64 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024 };

test("batched hashing returns each file's exact size and SHA-256, streaming files larger than one read", async () => {
  const fixture = await tempDir("og-safe-hash-");
  try {
    const root = await realpath(fixture.dir);
    await mkdir(join(root, "cooked/world"), { recursive: true });
    // Three reads and a remainder of the helper's 1 MiB chunk, an empty file, and small ones.
    const files = new Map<string, Buffer>([["cooked/world/big.hza", Buffer.alloc(3 * 1024 * 1024 + 7, 7)], ["cooked/empty.bin", Buffer.alloc(0)],
      ...Array.from({ length: 20 }, (_, index) => [`cooked/f${index}.hza`, Buffer.from(`asset ${index} `.repeat(index + 1))] as [string, Buffer])]);
    files.get("cooked/world/big.hza")![3 * 1024 * 1024 + 3] = 1;
    for (const [path, bytes] of files) await writeFile(join(root, path), bytes);
    const names = [...files.keys()];
    const seen: HashProgress[] = [];
    const digests = await safeHashFiles(root, names, roomy, { progress: done => seen.push(done) });
    assert.deepEqual(digests, names.map(path => ({ path, byteSize: files.get(path)!.byteLength, sha256: sha256(files.get(path)!) })));
    const total = [...files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
    assert.deepEqual(seen[0], { files: 0, bytes: 0, totalFiles: names.length, totalBytes: total });
    assert.deepEqual(seen.at(-1), { files: names.length, bytes: total, totalFiles: names.length, totalBytes: total });
  } finally { await fixture.remove(); }
});

test("batched hashing refuses a link, a missing file and a file over its own maximum", async () => {
  const fixture = await tempDir("og-safe-hash-refuse-");
  try {
    const root = await realpath(fixture.dir);
    await mkdir(join(root, "cooked")); await mkdir(join(root, "outside"));
    await writeFile(join(root, "cooked/a.hza"), "inside"); await writeFile(join(root, "outside/b.hza"), "outside bytes");
    await symlink(join(root, "outside/b.hza"), join(root, "cooked/linked.hza"));
    await symlink(join(root, "outside"), join(root, "cooked/folder"));
    const changed = { code: "build_changed", message: /missing, changed, or exceeds its size limit/ };
    await assert.rejects(safeHashFiles(root, ["cooked/a.hza", "cooked/linked.hza"], roomy), changed);
    await assert.rejects(safeHashFiles(root, ["cooked/a.hza", "cooked/folder/b.hza"], roomy), changed);
    await assert.rejects(safeHashFiles(root, ["cooked/a.hza", "cooked/gone.hza"], roomy), changed);
    // "inside" is six bytes: five is over its own maximum, though the total has room.
    await assert.rejects(safeHashFiles(root, ["cooked/a.hza"], { fileBytes: 5, totalBytes: 100 }), changed);
    assert.equal((await safeHashFiles(root, ["cooked/a.hza"], { fileBytes: 6, totalBytes: 6 }))[0]!.byteSize, 6);
    // Over the total is the caller's own refusal, and a different one.
    const overTotal = () => new CliError("unity_assets_limit", "over the plan", 1);
    await assert.rejects(safeHashFiles(root, ["cooked/a.hza"], { fileBytes: 6, totalBytes: 5 }, { words: { overTotal } }), { code: "unity_assets_limit" });
  } finally { await fixture.remove(); }
});

test("a hash or size job whose ancestor or root is swapped mid-walk reads nothing from outside", async () => {
  for (const [operation, race] of [["hash", "read"], ["hash", "root"], ["sizes", "sizes"]] as const) {
    const fixture = await tempDir("og-safe-hash-race-");
    try {
      const base = await realpath(fixture.dir);
      const root = join(base, "export");
      await mkdir(join(root, "assets"), { recursive: true }); await mkdir(join(base, "outside/assets"), { recursive: true });
      await writeFile(join(root, "assets/asset.js"), "inside!");
      // The ancestor swap links assets/ to outside/, the root swap links export/ to it, so
      // outside/asset.js and outside/assets/asset.js are one file: the race script compares
      // what was opened against the first, and a re-resolved root would reach the second.
      await writeFile(join(base, "outside/assets/asset.js"), "secret!");
      await link(join(base, "outside/assets/asset.js"), join(base, "outside/asset.js"));
      const result = runRace({ operation, root, outside: join(base, "outside"), race,
        fileMaximum: 100, totalMaximum: 100, files: [{ path: "assets/asset.js", relative: "assets/asset.js", size: 7 }] });
      assert.equal(result.swapped, true, `${operation}/${race} swapped`);
      assert.equal(result.outsideOpened, false, `${operation}/${race}`);
      assert.equal(result.error, "build_changed", `${operation}/${race}`);
      assert.equal(result.digests, undefined); assert.equal(result.sizes, undefined);
    } finally { await fixture.remove(); }
  }
});

test("batched small reads return exact bytes and refuse a file whose size moved", async () => {
  const fixture = await tempDir("og-safe-read-many-");
  try {
    const root = await realpath(fixture.dir);
    await mkdir(join(root, "cooked"));
    await writeFile(join(root, "cooked/a.hza"), "aaa"); await writeFile(join(root, "cooked/b.hza"), "bb");
    const read = await safeReadFiles(root, [{ path: "cooked/a.hza", byteSize: 3 }, { path: "cooked/b.hza", byteSize: 2 }]);
    assert.deepEqual([...read].map(([path, bytes]) => [path, bytes.toString()]), [["cooked/a.hza", "aaa"], ["cooked/b.hza", "bb"]]);
    await assert.rejects(safeReadFiles(root, [{ path: "cooked/a.hza", byteSize: 3 }, { path: "cooked/b.hza", byteSize: 3 }], { changed: "caller words" }),
      { code: "build_changed", message: "caller words" });
  } finally { await fixture.remove(); }
});


test("a snapshot is read in runs a JSON reply can carry, and a run never splits a file", () => {
  // V8 holds a string to 2^29 - 24 characters, and the reply is base64 of every file read.
  const sizes = [5, 5, 5, 12, 1, 1, 30, 2].map((size, index) => ({ path: `f${index}`, size }));
  const groups = readGroups(sizes, 12);
  assert.deepEqual(groups.map(group => group.map(file => file.path)), [["f0", "f1"], ["f2"], ["f3"], ["f4", "f5"], ["f6"], ["f7"]]);
  assert.deepEqual(groups.flat(), sizes);
  assert.ok(groups.every(group => group.length === 1 || group.reduce((sum, file) => sum + file.size, 0) <= 12));
  assert.deepEqual(readGroups([], 12), []);
});

test("a snapshot read in several runs holds every file", async t => {
  // Runs of bundle.fileBytesMax, lowered here so six small files cannot share one read.
  const saved = LIMITS.bundle.fileBytesMax;
  (LIMITS.bundle as { fileBytesMax: number }).fileBytesMax = 2100;
  const fixture = await tempDir("og-safe-runs-");
  const root = fixture.dir;
  t.after(fixture.remove);
  const files: Record<string, Buffer> = {};
  for (let index = 0; index < 5; index += 1) files[`part${index}.bin`] = Buffer.alloc(1024 + index, index);
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(root, name), bytes);
  await writeFile(join(root, "index.html"), "<!doctype html>");
  let snapshot: Map<string, Buffer>;
  try { ({ snapshot } = await safeSnapshot(root)); } finally { (LIMITS.bundle as { fileBytesMax: number }).fileBytesMax = saved; }
  for (const [name, bytes] of Object.entries(files)) assert.deepEqual(snapshot.get(name), bytes);
  assert.equal(snapshot.get("index.html")?.toString(), "<!doctype html>");
});

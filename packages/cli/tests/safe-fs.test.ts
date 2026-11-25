import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, link, mkdir, readFile, readdir, realpath, rename, rm, stat, utimes, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { devSnapshot } from "../src/dev";
import { createHash } from "node:crypto";
import { BUILD_CHANGED, PYTHON_CANDIDATES, READER, descriptorReaderAvailable, readGroups, safeCopySnapshot, safeHashFiles, safeReadFile, safeReadFiles, safeReadLargeFile, safeSnapshot, writeStage, type HashProgress } from "../src/safe-fs";
import { nodeIo, runNodeJob, type NodeIo } from "../src/safe-fs-node";
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
    await assert.rejects(inspectArchive(root, manifest, silent, { vendor: true }), { code: "build_changed", message: /retry with a new output folder/ });
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

/* The in-process reader that runs these jobs on Windows (safe-fs-node.ts), run here on Linux
   with every Python candidate taken away, so each answer below came from it and none from the
   helper. Until 25 Nov 2026 Windows had no reader at all: `opengame init` stopped on "needs
   Python 3 on macOS or Linux" before reading a byte. */
async function throughNode<T>(work: () => Promise<T>): Promise<T> {
  const saved = PYTHON_CANDIDATES.splice(0, Infinity, "/nonexistent/og-no-python/python3");
  const open = nodeIo.open;
  READER.node = true;
  nodeIo.open = windowsOpen;
  try { return await work(); } finally { nodeIo.open = open; READER.node = false; PYTHON_CANDIDATES.splice(0, Infinity, ...saved); }
}

/* Windows has no O_NOFOLLOW or O_NONBLOCK: an open there follows a link wherever it sits. On
   Linux the flag would refuse a linked file before the reader's own checks run, so these tests
   open as Windows does and only those checks stand between a link and its target's bytes. */
const posixOnly = (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
const linuxOpen = nodeIo.open;
const windowsOpen: NodeIo["open"] = (target, flags, mode) => linuxOpen(target, flags & ~posixOnly, mode);
const windowsIo: NodeIo = { ...nodeIo, open: windowsOpen };

test("without Python, the Windows reader reads, refuses links and missing state as the helper does", () => throughNode(async () => {
  const fixture = await tempDir("og-node-reader-");
  try {
    const root = await realpath(fixture.dir);
    assert.equal(await descriptorReaderAvailable(), true);
    await writeFile(join(root, "package.json"), '{"name":"game"}');
    assert.equal((await safeReadFile(root, "package.json", 100)).toString(), '{"name":"game"}');
    // Missing state is ENOENT, at the file or at a folder on its way, as init reads it.
    await assert.rejects(safeReadFile(root, "opengame.json", 100), { code: "ENOENT" });
    await assert.rejects(safeReadFile(root, ".opengame/project.json", 100), { code: "ENOENT" });
    await mkdir(join(root, "outside")); await writeFile(join(root, "outside/project.json"), "secret");
    await symlink(join(root, "outside"), join(root, ".opengame"));
    await assert.rejects(safeReadFile(root, ".opengame/project.json", 100), { code: "build_changed" });
    await symlink(join(root, "outside/project.json"), join(root, "linked.json"));
    await assert.rejects(safeReadFile(root, "linked.json", 100), { code: "build_changed" });
    await assert.rejects(safeReadFile(root, "package.json", 5, { changed: "caller words" }), { code: "build_changed", message: "caller words" });
    // A link above the root is refused too: the walk starts at the filesystem's root.
    await mkdir(join(root, "real/export"), { recursive: true }); await writeFile(join(root, "real/export/a.txt"), "a");
    await symlink(join(root, "real"), join(root, "via"));
    await assert.rejects(safeReadFiles(join(root, "via/export"), [{ path: "a.txt", byteSize: 1 }]), { code: "build_changed" });
    // That refusal is safeDirectoryIdentity's realpath check; the reader holds it on its own.
    const job = { operation: "read", maximum: 100, files: [{ path: "a.txt", relative: "a.txt", size: 1 }] };
    assert.deepEqual((await runNodeJob({ ...job, root: join(root, "real/export") }, undefined, windowsIo)).files?.map(([name, bytes]) => [name, bytes.toString()]), [["a.txt", "a"]]);
    assert.deepEqual(await runNodeJob({ ...job, root: join(root, "via/export") }, undefined, windowsIo), { error: "build_changed" });
    assert.deepEqual(await runNodeJob({ ...job, root: join(root, "real/export"), identity: { dev: "1", ino: "2" } }, undefined, windowsIo), { error: "build_changed" });
  } finally { await fixture.remove(); }
}));

test("without Python, the Windows reader stages, hashes, copies and reads in parts", () => throughNode(async () => {
  const fixture = await tempDir("og-node-reader-io-");
  try {
    const root = await realpath(fixture.dir);
    const staged = new Map<string, Buffer>([["assets/large.bin", Buffer.alloc(3 * 1024 * 1024 + 7, 255)], ["empty.bin", Buffer.alloc(0)], ["tail.bin", Buffer.from([0, 10, 255])]]);
    await writeStage(root, "export", staged);
    for (const [name, wanted] of staged) assert.deepEqual(await readFile(join(root, "export", name)), wanted);
    await assert.rejects(writeStage(root, "export", new Map([["index.html", Buffer.from("other")]])), { code: "vendor_output_exists" });
    assert.deepEqual((await readdir(join(root, "export"))).sort(), ["assets", "empty.bin", "tail.bin"]);

    const exported = join(root, "export");
    const names = [...staged.keys()];
    assert.deepEqual(await safeHashFiles(exported, names, roomy), names.map(path => ({ path, byteSize: staged.get(path)!.byteLength, sha256: sha256(staged.get(path)!) })));
    const changed = { code: "build_changed", message: /missing, changed, or exceeds its size limit/ };
    await assert.rejects(safeHashFiles(exported, ["tail.bin", "gone.bin"], roomy), changed);
    await assert.rejects(safeHashFiles(exported, ["tail.bin"], { fileBytes: 2, totalBytes: 100 }), changed);
    const overTotal = () => new CliError("unity_assets_limit", "over the plan", 1);
    await assert.rejects(safeHashFiles(exported, ["tail.bin"], { fileBytes: 3, totalBytes: 2 }, { words: { overTotal } }), { code: "unity_assets_limit" });
    await assert.rejects(safeReadFiles(exported, [{ path: "tail.bin", byteSize: 4 }], { changed: "caller words" }), { code: "build_changed", message: "caller words" });

    const large = staged.get("assets/large.bin")!;
    assert.deepEqual(await safeReadLargeFile(exported, "assets/large.bin", large.byteLength), large);
    assert.deepEqual(await safeReadLargeFile(exported, "assets/large.bin", large.byteLength, undefined, { offset: 1024 * 1024, length: 5, size: large.byteLength }), large.subarray(1024 * 1024, 1024 * 1024 + 5));
    await assert.rejects(safeReadLargeFile(exported, "assets/large.bin", large.byteLength, undefined, { offset: 0, length: 5, size: large.byteLength + 1 }), { code: "build_changed" });

    await writeFile(join(exported, "index.html"), "<!doctype html>");
    const { snapshot } = await safeSnapshot(exported);
    assert.deepEqual(snapshot.get("assets/large.bin"), large);
    const into = join(root, "copy"); await mkdir(into);
    const { copied } = await safeCopySnapshot(exported, into);
    for (const row of copied) assert.equal(sha256(await readFile(join(into, row.file))), row.sha256);
    assert.deepEqual(copied.map(row => row.path).sort(), ["assets/large.bin", "empty.bin", "index.html", "tail.bin"]);
  } finally { await fixture.remove(); }
}));

test("without Python, check reads through the Windows reader and announces no fallback", () => throughNode(async () => {
  const fixture = await tempDir("og-node-reader-check-");
  try {
    const root = await realpath(fixture.dir);
    await writeFile(join(root, "index.html"), "<!doctype html><title>Game</title>");
    const manifest = { title: "Night shift", description: "Survive until dawn with a light and a dwindling battery.", genre: "shooter-survival", controls: ["keyboard"] } as never;
    const check = async () => {
      const notices: string[] = [];
      const { snapshot } = await inspectArchive(root, manifest, new Output("jsonl", line => {
        const event = JSON.parse(line) as { type?: string; code?: string };
        if (event.type === "notice") notices.push(String(event.code));
      }));
      assert.equal(Buffer.from(await snapshot.bytes("index.html")).toString(), "<!doctype html><title>Game</title>");
      await snapshot.dispose();
      return notices;
    };
    assert.ok(!(await check()).includes("node_reader_fallback"));
    // The notice is printed once a process, so prove it was still there to print: the same
    // check with the Windows reader off, and still no Python, announces it.
    READER.node = false;
    try { assert.ok((await check()).includes("node_reader_fallback"), "an earlier test spent the once-a-process notice, so the line above proved nothing"); }
    finally { READER.node = true; }
  } finally { await fixture.remove(); }
}));

/* The races safe-fs.py's tests arrange by patching os, arranged here at the reader's own
   filesystem calls: a folder is swapped for a link to `outside` at the named moment. */
function racing(root: string, outside: string, when: (call: "lstat" | "open" | "mkdir", target: string) => string | undefined, options: { back?: boolean } = {}) {
  const state = { swapped: false, outsideOpened: false };
  let swappedFolder: string | undefined;
  const swap = async (folder: string) => { await rename(folder, folder + "-moved"); await symlink(outside, folder); state.swapped = true; swappedFolder = folder; };
  const maybe = async (call: "lstat" | "open" | "mkdir", target: string) => {
    const folder = !state.swapped ? when(call, target) : undefined;
    if (folder) await swap(join(root, folder));
  };
  const io: NodeIo = {
    lstat: async target => { await maybe("lstat", target); return nodeIo.lstat(target); },
    open: async (target, flags, mode) => {
      await maybe("open", target);
      const handle = await windowsOpen(target, flags, mode);
      // Put the folder back once the open has gone through it, so the re-check after the
      // read finds nothing wrong and only the handle's identity can refuse what was opened.
      if (options.back && swappedFolder) { const folder = swappedFolder; swappedFolder = undefined; await rm(folder); await rename(folder + "-moved", folder); }
      const opened = await handle.stat({ bigint: true });
      const secret = await nodeIo.lstat(join(outside, "asset.js")).catch(() => null);
      if (secret && opened.ino === secret.ino && opened.dev === secret.dev) state.outsideOpened = true;
      return handle;
    },
    mkdir: async target => { await maybe("mkdir", target); return nodeIo.mkdir(target); },
    realpath: target => nodeIo.realpath(target),
  };
  return { io, state };
}

test("the Windows reader never returns an outside file's bytes when a folder is swapped mid-read", async () => {
  // Each: which folder is swapped, and when. The last three swap after the file's own lstat,
  // so the open follows the link and only the handle's identity check stands between.
  const cases: [string, (call: string, target: string) => string | undefined][] = [
    ["ancestor before the file's lstat", (call, target) => call === "lstat" && target.endsWith("assets/asset.js") ? "assets" : undefined],
    ["ancestor before the file's open", (call, target) => call === "open" && target.endsWith("assets/asset.js") ? "assets" : undefined],
    ["ancestor before the file's open, and back after it", (call, target) => call === "open" && target.endsWith("assets/asset.js") ? "assets" : undefined],
  ];
  for (const operation of ["read", "hash", "sizes", "copy"] as const) for (const [name, when] of cases) {
    if (operation === "sizes" && name.includes("open")) continue;
    const fixture = await tempDir("og-node-race-");
    try {
      const base = await realpath(fixture.dir);
      const root = join(base, "export");
      await mkdir(join(root, "assets"), { recursive: true }); await mkdir(join(base, "outside"));
      await writeFile(join(root, "assets/asset.js"), "inside!");
      await writeFile(join(base, "outside/asset.js"), "secret!");
      const into = join(base, "into"); await mkdir(into);
      const { io, state } = racing(root, join(base, "outside"), when as never, { back: name.includes("back") });
      const result = await runNodeJob({ operation, root, destination: into, maximum: 100, fileMaximum: 100, totalMaximum: 100,
        files: [{ path: "assets/asset.js", relative: "assets/asset.js", size: 7, target: "0" }] }, undefined, io);
      assert.equal(state.swapped, true, `${operation}, ${name}: swapped`);
      assert.equal(result.error, "build_changed", `${operation}, ${name}`);
      assert.equal(result.files ?? result.digests ?? result.sizes, undefined, `${operation}, ${name}`);
      // The open followed the swapped folder to the outside file, as it would on Windows; the
      // handle's identity, not the open, is what refused it.
      if (name.includes("open")) assert.equal(state.outsideOpened, true, `${operation}, ${name}: reached the outside file`);
    } finally { await fixture.remove(); }
  }
});

test("the Windows reader refuses a swapped root, and a vanished state folder is a change, not a missing file", async () => {
  const fixture = await tempDir("og-node-race-root-");
  try {
    const base = await realpath(fixture.dir);
    const root = join(base, "export");
    await mkdir(join(root, "assets"), { recursive: true }); await mkdir(join(base, "outside/assets"), { recursive: true });
    await writeFile(join(root, "assets/asset.js"), "inside!");
    await writeFile(join(base, "outside/assets/asset.js"), "secret!");
    const { io, state } = racing(base, join(base, "outside"), (call, target) => call === "lstat" && target.endsWith("assets/asset.js") ? "export" : undefined);
    const result = await runNodeJob({ operation: "read", root, maximum: 100, files: [{ path: "assets/asset.js", relative: "assets/asset.js", size: 7 }] }, undefined, io);
    assert.equal(state.swapped, true);
    assert.deepEqual(result, { error: "build_changed" });

    await mkdir(join(base, "state/.opengame"), { recursive: true });
    await writeFile(join(base, "state/.opengame/project.json"), "{}");
    let gone = false;
    const vanishing: NodeIo = { ...windowsIo, lstat: async target => {
      if (!gone && target.endsWith(".opengame/project.json")) { gone = true; await rename(join(base, "state/.opengame"), join(base, "state/.opengame-moved")); }
      return nodeIo.lstat(target);
    } };
    const state_ = await runNodeJob({ operation: "read", root: join(base, "state"), maximum: 100, allowMissing: true,
      files: [{ path: ".opengame/project.json", relative: ".opengame/project.json" }] }, undefined, vanishing);
    assert.equal(gone, true);
    assert.deepEqual(state_, { error: "build_changed" });
  } finally { await fixture.remove(); }
});

test("the Windows reader's staging writes nothing through a folder swapped for a link, and never replaces a file", async () => {
  const fixture = await tempDir("og-node-race-stage-");
  try {
    const root = await realpath(fixture.dir);
    const bytes = Buffer.from("public export");
    const swap = async (folder: string, outside: string) => { await rename(folder, folder + "-moved"); await symlink(outside, folder); };
    // stage/assets is made and bound, then swapped before the check that runs right before
    // its file is created: refused, and nothing reaches the folder it now points at.
    await mkdir(join(root, "outside"));
    // Swapped once the folder has passed its lstat and real-path checks, so the check right
    // before the create is the only thing left to see it.
    let looks = 0;
    const early: NodeIo = { ...windowsIo, realpath: async target => {
      const real = await nodeIo.realpath(target);
      if (target === join(root, "stage/assets") && ++looks === 1) await swap(target, join(root, "outside"));
      return real;
    } };
    const result = await runNodeJob({ operation: "stage-stream", root, target: "stage", files: [["assets/asset.js", bytes.length]] }, [bytes], early);
    assert.equal(looks >= 1, true);
    assert.deepEqual(result, { error: "build_changed" });
    assert.deepEqual(await readdir(join(root, "outside")), []);
    // Swapped after that check, in the moment before the create: the residual the reader's
    // header names. The create is exclusive, so an existing file is never replaced, and the
    // job is refused.
    await mkdir(join(root, "outside2"));
    await writeFile(join(root, "outside2/asset.js"), "keep private");
    let swapped = false;
    const late: NodeIo = { ...nodeIo, open: async (target, flags, mode) => {
      if (!swapped && target === join(root, "stage2/assets/asset.js")) { swapped = true; await swap(join(root, "stage2/assets"), join(root, "outside2")); }
      return windowsOpen(target, flags, mode);
    } };
    const second = await runNodeJob({ operation: "stage-stream", root, target: "stage2", files: [["assets/asset.js", bytes.length]] }, [bytes], late);
    assert.equal(swapped, true);
    assert.deepEqual(second, { error: "build_changed" });
    assert.equal(await readFile(join(root, "outside2/asset.js"), "utf8"), "keep private");
  } finally { await fixture.remove(); }
});

/* libuv reports a Windows junction as a link only when its target reads like \??\C:\...; one
   aimed at \??\Volume{GUID}\... is stat'ed through, and lstat says a plain folder with its
   target's identity. Here that is a symlink lstat'ed by following it, so every lstat check
   passes and only the real path can refuse it. */
function guidJunctions(): NodeIo {
  return { ...windowsIo, lstat: async target => {
    const seen = await nodeIo.lstat(target);
    return seen.isSymbolicLink() ? stat(target, { bigint: true }) : seen;
  } };
}

test("the Windows reader refuses a junction that lstat reports as a plain folder", async () => {
  const fixture = await tempDir("og-node-guid-junction-");
  try {
    const base = await realpath(fixture.dir);
    const root = join(base, "export");
    await mkdir(join(root), { recursive: true }); await mkdir(join(base, "outside"));
    await writeFile(join(base, "outside/asset.js"), "secret!");
    await symlink(join(base, "outside"), join(root, "assets"));
    await symlink(join(base, "outside/asset.js"), join(root, "leaf.js"));
    const io = guidJunctions();
    for (const relative of ["assets/asset.js", "leaf.js"]) for (const operation of ["read", "hash", "sizes", "copy"]) {
      const into = join(base, `into-${operation}-${relative.length}`); await mkdir(into);
      const result = await runNodeJob({ operation, root, destination: into, maximum: 100, fileMaximum: 100, totalMaximum: 100,
        files: [{ path: relative, relative, size: 7, target: "0" }] }, undefined, io);
      assert.deepEqual(result, { error: "build_changed" }, `${operation} ${relative}`);
    }
    // Above the root, and as a folder staging would write into.
    await mkdir(join(base, "real/export"), { recursive: true }); await writeFile(join(base, "real/export/a.txt"), "a");
    await symlink(join(base, "real"), join(base, "via"));
    assert.deepEqual(await runNodeJob({ operation: "read", root: join(base, "via/export"), maximum: 100, files: [{ path: "a.txt", relative: "a.txt", size: 1 }] }, undefined, io), { error: "build_changed" });
    const bytes = Buffer.from("public export");
    assert.deepEqual(await runNodeJob({ operation: "stage-stream", root, target: "assets/stage", files: [["x.js", bytes.length]] }, [bytes], io), { error: "build_changed" });
    // The snapshot copy's destination: its own real path is the one check before the writes.
    await writeFile(join(root, "plain.js"), "public!");
    await symlink(join(base, "outside"), join(base, "dest"));
    assert.deepEqual(await runNodeJob({ operation: "copy", root, destination: join(base, "dest"), maximum: 100,
      files: [{ path: "plain.js", relative: "plain.js", size: 7, target: "0" }] }, undefined, io), { error: "build_changed" });
    assert.deepEqual(await readdir(join(base, "outside")), ["asset.js"]);
  } finally { await fixture.remove(); }
});

test("the Windows reader refuses a file rewritten at the same length while it is read", async () => {
  const fixture = await tempDir("og-node-torn-");
  try {
    const root = await realpath(fixture.dir);
    const size = 3 * 1024 * 1024;
    await writeFile(join(root, "big.bin"), Buffer.alloc(size, 1));
    for (const operation of ["read", "hash", "copy"]) {
      let rewritten = false;
      // The first read of the handle rewrites the file in place, same length, and moves its
      // time on, as an editor saving over it would: only the stat comparison can see it.
      const io: NodeIo = { ...windowsIo, open: async (target, flags, mode) => {
        const handle = await windowsOpen(target, flags, mode);
        if (!target.endsWith("big.bin")) return handle;
        const read = handle.read.bind(handle);
        (handle as { read: unknown }).read = async (...args: unknown[]) => {
          if (!rewritten) { rewritten = true; await writeFile(target, Buffer.alloc(size, 2), { flag: "r+" }); const later = new Date(Date.now() + 5000); await utimes(target, later, later); }
          return (read as (...a: unknown[]) => unknown)(...args);
        };
        return handle;
      } };
      const into = join(root, `into-${operation}`); await mkdir(into);
      const result = await runNodeJob({ operation, root, destination: into, maximum: size, fileMaximum: size, totalMaximum: size,
        files: [{ path: "big.bin", relative: "big.bin", size, target: "0" }] }, undefined, io);
      assert.equal(rewritten, true, operation);
      // Never deepEqual a reply that may carry the 3 MiB file: on a regression the assertion's
      // diff of the bytes took 91 GB and hung the run rather than failing it (25 Nov 2026).
      assert.equal(result.error, "build_changed", operation);
      assert.ok(!result.files && !result.digests, operation);
      await writeFile(join(root, "big.bin"), Buffer.alloc(size, 1));
    }
  } finally { await fixture.remove(); }
});

test("the Windows reader's staging checks each file's own folders, not every folder so far", async () => {
  const fixture = await tempDir("og-node-stage-cost-");
  try {
    const root = await realpath(fixture.dir);
    const files = Array.from({ length: 400 }, (_, index) => [`f${index % 200}/x${index}.js`, Buffer.from("x")] as [string, Buffer]);
    let lstats = 0;
    const counting: NodeIo = { ...windowsIo, lstat: target => { lstats += 1; return nodeIo.lstat(target); } };
    const result = await runNodeJob({ operation: "stage-stream", root, target: "stage", files: files.map(([name, bytes]) => [name, bytes.length]) }, files.map(([, bytes]) => bytes), counting);
    assert.deepEqual(result, { ok: true });
    // Linear: the walk to the stage and each file's own folder, per file, then one sweep.
    // Re-checking every folder made so far, as the first version did, is over 40,000 here.
    const depth = root.split("/").length + 1;
    assert.ok(lstats < 400 * (depth + 3) + 200 + depth * 2 + 400, `${lstats} lstats`);
  } finally { await fixture.remove(); }
});

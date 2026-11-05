import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseManifest } from "@opengame/protocol";
import { sourceSettingsDiagnostics } from "../src/engines";

const metadata = { title: "Source settings", description: "Collect the hidden treasures in this small test world.", genre: "action-adventure", controls: ["keyboard"] };
const manifest = (output = "dist", command?: string) => parseManifest({ ...metadata, build: { output, ...(command ? { command } : {}) } });
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "og-source-settings-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function put(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
// Field spelling and values come from the retained Godot 4.5.1 fixture's two
// presets; the selected output is changed to keep each test self-contained.
const godot4 = (options: string, output = "dist/index.html", id = 0) => `[preset.${id}]
name="Web ${id}"
platform="Web"
export_path="${output}"
[preset.${id}.options]
${options}
`;

test("Godot settings are attributed only to the preset matching this manifest output", async () => fixture(async root => {
  await put(root, "project.godot", "config_version=5\n");
  await put(root, "export_presets.cfg", godot4("progressive_web_app/enabled=true\nvariant/thread_support=true", "other/index.html") +
    godot4("progressive_web_app/enabled=false\nvariant/thread_support=false", "dist/index.html", 1));
  const result = await sourceSettingsDiagnostics(root, manifest());
  assert.equal(result.engine, "godot");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.observed.find(row => row.field.endsWith("thread_support"))?.value, false);
  assert.ok(result.observed.every(row => row.field.startsWith("preset.1.")));
}));

test("Godot PWA gets actionable advice and enabled threads remain a note", async () => fixture(async root => {
  await put(root, "project.godot", "config_version=5\n");
  await put(root, "export_presets.cfg", godot4("progressive_web_app/enabled=true\nvariant/thread_support=true\nvariant/extensions_support=true"));
  const result = await sourceSettingsDiagnostics(root, manifest());
  assert.deepEqual(result.diagnostics.map(row => [row.code, row.severity]), [["source-godot-pwa", "warning"], ["source-godot-threads", "note"]]);
  assert.match(result.diagnostics[0]!.fix, /Turn off Progressive Web App/);
  // 2027-04, where a threaded release frozen on 2027-03 (current since 26 Oct 2026) is
  // sealed. Eval is allowed there, so the sentence that said otherwise went.
  assert.match(result.diagnostics[1]!.message, /supports threaded exports: .* onto contract 2027-04 automatically, which adds cross-origin isolation\.$/);
  assert.match(result.diagnostics[1]!.fix, /opengame dev \. --contract 2027-04/);
  assert.doesNotMatch(result.diagnostics[1]!.message, /experimental|not yet tested/);
  assert.ok(result.diagnostics.every(row => row.path === "export_presets.cfg" && row.verify && row.value === true));
}));

test("Godot 3 uses the measured HTML5 export_type values without inventing a thread_support default", async () => fixture(async root => {
  await put(root, "project.godot", "config_version=4\n");
  for (const variant of [0, 1]) {
    await put(root, "export_presets.cfg", `[preset.0]\nplatform="HTML5"\nexport_path="dist/index.html"\n[preset.0.options]\nvariant/export_type=${variant}\nprogressive_web_app/enabled=false\n`);
    const result = await sourceSettingsDiagnostics(root, manifest());
    assert.equal(result.diagnostics.length, variant);
    assert.equal(result.observed.find(row => row.field.endsWith("export_type"))?.value, variant);
    assert.deepEqual(result.unmeasured, []);
  }
}));

test("absent, malformed, duplicate and unmeasured Godot fields never become blockers or guessed defaults", async () => fixture(async root => {
  await put(root, "project.godot", "config_version=5\n");
  const absent = await sourceSettingsDiagnostics(root, manifest());
  assert.equal(absent.diagnostics.length, 0);
  assert.ok(absent.unmeasured.length);
  for (const options of ["", "progressive_web_app/enabled=maybe\nvariant/thread_support=1", "progressive_web_app/enabled=true\nprogressive_web_app/enabled=false\nvariant/thread_support=oops", "pwa/enabled=true\nthreads/thread_support=true\ncompression=99"]) {
    await put(root, "export_presets.cfg", godot4(options));
    const result = await sourceSettingsDiagnostics(root, manifest());
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.unmeasured.length);
  }
  for (const text of [godot4("progressive_web_app/enabled=true", "other/index.html"), godot4("progressive_web_app/enabled=true") + godot4("progressive_web_app/enabled=false", "dist/other.html", 1), godot4("progressive_web_app/enabled=true") + godot4("progressive_web_app/enabled=true")]) {
    await put(root, "export_presets.cfg", text);
    const result = await sourceSettingsDiagnostics(root, manifest());
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.unmeasured[0]!, /No unique/);
  }
}));

test("source reader handles BOM and CRLF and refuses settings symlinked outside the project", async () => fixture(async root => {
  await put(root, "project.godot", "config_version=5\n");
  await put(root, "export_presets.cfg", "\ufeff" + godot4("progressive_web_app/enabled=true\nvariant/thread_support=false").replaceAll("\n", "\r\n"));
  assert.equal((await sourceSettingsDiagnostics(root, manifest())).diagnostics[0]?.code, "source-godot-pwa");
  await fixture(async outside => {
    await put(outside, "settings.cfg", godot4("progressive_web_app/enabled=true"));
    await rm(join(root, "export_presets.cfg"));
    await symlink(join(outside, "settings.cfg"), join(root, "export_presets.cfg"));
    const result = await sourceSettingsDiagnostics(root, manifest());
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.unmeasured[0]!, /unreadable/);
  });
}));

test("Unity reports the source version without guessing serialization for publishing settings", async () => fixture(async root => {
  await put(root, "ProjectSettings/ProjectVersion.txt", "m_EditorVersion: 6000.0.23f1\n");
  // Deliberately plausible but unmeasured keys must not produce policy advice.
  await put(root, "ProjectSettings/ProjectSettings.asset", "webGLDataCaching: 0\nwebGLNameFilesAsHashes: 0\nwebGLCompressionFormat: 99\nwebGLThreadsSupport: 1\n");
  const result = await sourceSettingsDiagnostics(root, manifest());
  assert.deepEqual(result.observed, [{ path: "ProjectSettings/ProjectVersion.txt", field: "m_EditorVersion", value: "6000.0.23f1" }]);
  assert.deepEqual(result.diagnostics.map(row => row.severity), ["note"]);
  assert.match(result.unmeasured[0]!, /no measured ProjectSettings.asset schema/);
  for (const text of ["invalid", "m_EditorVersion: 6000.0.23f1\nm_EditorVersion: 6000.0.24f1\n"]) {
    await put(root, "ProjectSettings/ProjectVersion.txt", text);
    assert.deepEqual((await sourceSettingsDiagnostics(root, manifest())).diagnostics, []);
  }
}));

test("Flutter source advice distinguishes explicit local resources from an unmeasured wrapper build", async () => fixture(async root => {
  // This is the exact placeholder in templates/flame/web/index.html, which
  // exists before its build script creates a pubspec under .build/flutter.
  const template = await readFile(new URL("../../../templates/flame/web/index.html", import.meta.url), "utf8");
  await put(root, "web/index.html", template);
  const wrapper = await sourceSettingsDiagnostics(root, manifest("dist", "npm run build"));
  assert.equal(wrapper.engine, "flutter");
  assert.deepEqual(wrapper.diagnostics.map(row => row.code), ["source-flutter-base"]);
  assert.ok(wrapper.unmeasured.some(text => text.includes("no direct Flutter")));
  for (const [command, severity] of [["flutter build web", "warning"], ["flutter build web --no-web-resources-cdn", "note"]] as const) {
    const result = await sourceSettingsDiagnostics(root, manifest("dist", command));
    assert.equal(result.diagnostics.find(row => row.code === "source-flutter-resources")?.severity, severity);
  }
  const chained = await sourceSettingsDiagnostics(root, manifest("dist", "echo flutter build web && npm run build"));
  assert.ok(!chained.diagnostics.some(row => row.code === "source-flutter-resources"));
}));

test("export-only and malformed Flutter projects have no invented setting failures", async () => fixture(async root => {
  assert.deepEqual(await sourceSettingsDiagnostics(root, manifest()), { engine: null, observed: [], diagnostics: [], unmeasured: [] });
  await put(root, "pubspec.yaml", "dependencies:\n  flutter:\n    sdk: flutter\n");
  await put(root, "web/index.html", '<base href="unterminated>');
  const result = await sourceSettingsDiagnostics(root, manifest());
  assert.equal(result.engine, "flutter");
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.unmeasured.length);
  for (const html of ['<!--\n<base href="$FLUTTER_BASE_HREF">\n-->', '<script>const example = \'<base href="$FLUTTER_BASE_HREF">\';</script>', '<base href="/"><base href="$FLUTTER_BASE_HREF">']) {
    await put(root, "web/index.html", html);
    assert.deepEqual((await sourceSettingsDiagnostics(root, manifest())).diagnostics, []);
  }
}));

test("bundled check emits source advice before a failing build and includes structured settings on success", async () => fixture(async root => {
  const binary = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
  await put(root, "project.godot", "config_version=5\n");
  await put(root, "export_presets.cfg", godot4("progressive_web_app/enabled=true\nvariant/thread_support=false"));
  await put(root, "dist/index.html", "<!doctype html><title>Source settings</title>");
  await put(root, "opengame.json", JSON.stringify(manifest("dist", 'node -e "process.exit(7)"')));
  const failed = spawnSync(process.execPath, [binary, "check", root, "--build", "--jsonl"], { encoding: "utf8" });
  assert.notEqual(failed.status, 0, failed.stdout + failed.stderr);
  const events = failed.stdout.trim().split("\n").map(line => JSON.parse(line));
  const sourceIndex = events.findIndex(row => row.type === "notice" && row.code === "source-godot-pwa");
  const errorIndex = events.findIndex(row => row.type === "error");
  assert.ok(sourceIndex >= 0 && errorIndex > sourceIndex, failed.stdout);
  await put(root, "opengame.json", JSON.stringify(manifest()));
  const success = spawnSync(process.execPath, [binary, "check", root, "--json"], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stdout + success.stderr);
  const result = JSON.parse(success.stdout);
  assert.equal(result.data.sourceSettings.engine, "godot");
  assert.equal(result.data.sourceSettings.diagnostics[0].severity, "warning");
  assert.equal(result.data.ok, true);
}));

test('source probes reject a FIFO without blocking check', { skip: process.platform === 'win32', timeout: 5000 }, async () => {
  await fixture(async root => {
    const { execFileSync } = await import('node:child_process');
    execFileSync('mkfifo', [join(root, 'project.godot')]);
    const result = await sourceSettingsDiagnostics(root, manifest());
    assert.equal(result.engine, null);
  });
});

test('conflicting Flutter resource flags do not emit positive source advice', async () => {
  await fixture(async root => {
    await put(root, 'pubspec.yaml', 'name: sample\ndependencies:\n  flutter:\n    sdk: flutter\n');
    const result = await sourceSettingsDiagnostics(root, manifest('build/web', 'flutter build web --no-web-resources-cdn --web-resources-cdn'));
    assert.ok(result.unmeasured.some(item => item.includes('conflict')));
    assert.equal(result.diagnostics.some(item => item.code === 'source-flutter-resources'), false);
  });
});

test("Godot source settings never attribute a preset outside the project to its root export", async () => fixture(async root => {
  await put(root, "project.godot", "config_version=5\n");
  for (const target of ["../outside/index.html", "/outside/index.html", "dist/../index.html"]) {
    await put(root, "export_presets.cfg", godot4("progressive_web_app/enabled=true\nvariant/thread_support=true", target));
    const result = await sourceSettingsDiagnostics(root, manifest("."));
    assert.deepEqual(result.diagnostics, [], target);
    assert.match(result.unmeasured[0]!, /No unique/);
  }
}));

test("check reads through Python when an interpreter works, and through the Node fallback, once announced, when none does", async () => fixture(async root => {
  await put(root, "index.html", "<!doctype html><title>Static export</title>");
  const { inspectArchive } = await import("../src/archive");
  const { PYTHON_CANDIDATES } = await import("../src/safe-fs");
  const { Output } = await import("../src/output");
  const { chmod, readFile: read } = await import("node:fs/promises");
  const before = PYTHON_CANDIDATES.splice(0);
  const real = before.find(candidate => spawnSync(candidate, ["-c", "import os"]).status === 0)!;
  const run = async () => {
    const notices: string[] = [];
    const { snapshot } = await inspectArchive(root, parseManifest(metadata), new Output("jsonl", line => {
      const event = JSON.parse(line) as { type?: string; code?: string };
      if (event.type === "notice") notices.push(String(event.code));
    }));
    assert.equal(Buffer.from(snapshot.get("index.html")!).toString(), "<!doctype html><title>Static export</title>");
    return notices;
  };
  try {
    // A working interpreter: the helper reads the files, and nothing is announced.
    const bin = await mkdtemp(join(tmpdir(), "og-wrapped-python-"));
    const wrapped = join(bin, "python3");
    await writeFile(wrapped, `#!/bin/sh\ncase "$*" in *safe-fs.py*) echo helper >> "${wrapped}.log";; esac\nexec "${real}" "$@"\n`);
    await chmod(wrapped, 0o755);
    PYTHON_CANDIDATES.push(wrapped);
    assert.ok(!(await run()).includes("node_reader_fallback"));
    assert.match(await read(`${wrapped}.log`, "utf8"), /helper/);
    // None works: the Node reader, and one notice for the run however many checks it makes.
    PYTHON_CANDIDATES.splice(0, Infinity, join(root, "no-python-installed/python3"));
    assert.deepEqual((await run()).filter(code => code === "node_reader_fallback"), ["node_reader_fallback"]);
    assert.deepEqual((await run()).filter(code => code === "node_reader_fallback"), []);
    await rm(bin, { recursive: true, force: true });
  } finally { PYTHON_CANDIDATES.splice(0, Infinity, ...before); }
}));

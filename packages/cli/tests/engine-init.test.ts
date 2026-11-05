import test from "node:test";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initProject } from "../src/init";
import { detectBuildOutput, readBuildPackage } from "../src/build-output";
import { engineGuide, engineSetup, ENGINE_IDS, ENGINE_PRESETS } from "../src/engines";
import { ENGINE_REGISTRY } from "../../preflight/src/engines";
import { LIMITS } from "@opengame/shared";

const metadata = { title: "Engine fixture", description: "Explore a small test world and collect the hidden treasures.", genre: "action-adventure" };
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "og-engine-init-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

/* 30 Oct 2026: a two-file HTML game was told "OpenGame has not tested this engine's
   recipe yet". A static export with index.html at its root has no recipe to test; the
   sentence is for a named engine whose export steps nobody has walked yet. */
test("a plain static export is not told its engine recipe is untested", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), "<!doctype html><title>Brickwork</title><canvas></canvas><script>/* game */</script>");
  const plain = await initProject(root, metadata);
  assert.equal(plain.engine.id, "custom");
  assert.match(plain.engine.instructions, /needs index\.html at its root/);
  assert.doesNotMatch(plain.engine.instructions, /has not tested/);
}));

test("editor projects receive export advice without an invented build command", async () => fixture(async root => {
  await mkdir(join(root, "ProjectSettings"));
  await writeFile(join(root, "ProjectSettings/ProjectVersion.txt"), "m_EditorVersion: 6000.0.23f1");
  const result = await initProject(root, metadata);
  assert.equal(result.engine.id, "unity");
  assert.equal(result.manifest.build?.output, "Build");
  assert.equal(result.manifest.build?.command, undefined);
  // A threaded Unity build is supported, and a new release reaches 2027-04: 2027-03, where
  // new games are published since 26 Oct 2026, plus isolation. Eval is allowed on both, so
  // the sentence that warned about a .jslib calling eval went.
  assert.match(result.engine.instructions, /threaded build .* is supported: .* moved onto contract 2027-04 automatically/);
  assert.doesNotMatch(result.engine.instructions, /Eval is still not allowed|eval will fail/);
  assert.doesNotMatch(result.engine.instructions, /experimental|will not run yet/);
}));

test("Godot uses a real Web export preset and quotes its name", async () => fixture(async root => {
  await writeFile(join(root, "project.godot"), "config_version=5");
  await writeFile(join(root, "export_presets.cfg"), '[preset.0]\nname="Browser Game"\nplatform="Web"\nexport_path="release/browser/index.html"\n');
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.build?.output, "release/browser");
  assert.equal(result.manifest.build?.command, "godot --headless --export-release 'Browser Game' 'release/browser/index.html'");
}));

/* The C, C++ and raylib starters, and the Emscripten guide, build with -o dist/index.html.
   init said build for all four until 5 Nov 2026, so a creator who ran init on their own
   Emscripten project was pointed at a folder the docs never write. */
test("the Emscripten presets name the folder their starters and guide write", async () => {
  for (const id of ["emscripten", "c", "cpp", "raylib"]) assert.equal(ENGINE_PRESETS[id]!.output, "dist", id);
  for (const id of ["c", "cpp", "raylib"]) {
    const starter = JSON.parse(await readFile(new URL(`../../../templates/${id}/opengame.json`, import.meta.url), "utf8"));
    assert.equal(starter.build.output, ENGINE_PRESETS[id]!.output, id);
  }
  // The guides' half of this (they build with `-o dist/index.html`) is in
  // scripts/tests/docs-claims.test.mjs, because the docs are not in the public repository
  // this test is mirrored to.
});

/* The KNI starter is the folder a creator turns into a KNI Blazor project, and once they
   have, init and the starter must agree. They did not until 23 Oct 2026: the starter said
   dist with no command, init wrote publish/wwwroot with dotnet publish, and nothing
   compared the two because check:templates skips a starter with no export. */
test("the KNI starter's build matches what init writes for its Blazor project", async () => fixture(async root => {
  const starter = JSON.parse(await readFile(new URL("../../../templates/kni/opengame.json", import.meta.url), "utf8"));
  await writeFile(join(root, "Game.csproj"), '<Project Sdk="Microsoft.NET.Sdk.BlazorWebAssembly"></Project>');
  const result = await engineSetup(root, {}, "kni");
  assert.deepEqual(starter.build, { command: result.command, output: result.output });
}));

/* The fixture above is a bare .csproj, and a real one is not: `dotnet new blazorwasm` and
   KNI's kni-blazor-gl both put the page in wwwroot beside it. init took that folder as the
   export, dropped the publish command because it was not the recipe's folder, and once
   published called the two folders ambiguous (1 Nov 2026, SDK 8.0.427). The publish also
   has to leave out the .br and .gz copies the check refuses as nested archives. */
const BLAZOR_PAGE = '<!DOCTYPE html><html><head><title>BlazorGame</title><base href="/" /></head><body><div id="app"></div><script src="_framework/blazor.webassembly.js"></script></body></html>';
const blazorProject = async (root: string, sdk = "Microsoft.NET.Sdk.BlazorWebAssembly") => {
  await writeFile(join(root, "BlazorGame.csproj"), `<Project Sdk="${sdk}"></Project>`);
  await mkdir(join(root, "wwwroot"));
  await writeFile(join(root, "wwwroot/index.html"), BLAZOR_PAGE);
};

test("a template-fresh Blazor project gets the publish command and folder, not its own wwwroot", async () => fixture(async root => {
  await blazorProject(root);
  const fresh = await initProject(root, metadata);
  assert.equal(fresh.engine.id, "dotnet");
  assert.deepEqual(fresh.manifest.build, { command: "dotnet publish -c Release -o publish -p:CompressionEnabled=false", output: "publish/wwwroot" });
}));

test("a published Blazor project is not ambiguous between its page and its export", async () => fixture(async root => {
  await blazorProject(root);
  await mkdir(join(root, "publish/wwwroot/_framework"), { recursive: true });
  await writeFile(join(root, "publish/wwwroot/index.html"), BLAZOR_PAGE);
  await writeFile(join(root, "publish/wwwroot/_framework/blazor.webassembly.js"), "");
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.build?.output, "publish/wwwroot");
  assert.match(result.manifest.build?.command ?? "", /-p:CompressionEnabled=false$/);
}));

test("Blazor package builds prepare source before publishing with the project's package manager", async () => {
  for (const [lock, runner] of [[null, "npm run build"], ["pnpm-lock.yaml", "pnpm run build"], ["yarn.lock", "yarn build"], ["bun.lock", "bun run build"]] as const) {
    await fixture(async root => {
      await blazorProject(root);
      await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "tailwindcss -o wwwroot/css/app.css" } }));
      if (lock) await writeFile(join(root, lock), "");
      const result = await initProject(root, metadata);
      assert.deepEqual(result.manifest.build, {
        command: `${runner} && dotnet publish -c Release -o publish -p:CompressionEnabled=false`, output: "publish/wwwroot",
      });
    });
  }
});

test("the generated Blazor build creates fresh output, refreshes old output, and stops if preparation fails", { skip: process.platform === "win32" }, async () => fixture(async root => {
  await blazorProject(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "node prepare.cjs" } }));
  await writeFile(join(root, "prepare.cjs"), `require('node:fs').writeFileSync('wwwroot/app.css', 'prepared');`);
  await mkdir(join(root, "tools"));
  // This publish double copies only prepared bytes. Executing the manifest catches
  // a missing publish, reversed order, and continuing after a failed CSS build.
  await writeFile(join(root, "tools/dotnet"), `#!${process.execPath}
const fs = require('node:fs');
fs.mkdirSync('publish/wwwroot', { recursive: true });
fs.copyFileSync('wwwroot/app.css', 'publish/wwwroot/app.css');
`, { mode: 0o755 });
  const result = await initProject(root, metadata);
  const run = () => promisify(exec)(result.manifest.build!.command!, {
    cwd: root, env: { ...process.env, PATH: join(root, "tools") + ":" + process.env.PATH }, timeout: 30_000,
  });
  await run();
  const output = join(root, result.manifest.build!.output!, "app.css");
  assert.equal(await readFile(output, "utf8"), "prepared");
  await writeFile(output, "old publish");
  await writeFile(join(root, "prepare.cjs"), `require('node:fs').writeFileSync('wwwroot/app.css', 'updated');`);
  await run();
  assert.equal(await readFile(output, "utf8"), "updated");
  await writeFile(join(root, "wwwroot/app.css"), "must not publish");
  await writeFile(join(root, "prepare.cjs"), "process.exit(1);");
  await assert.rejects(run());
  assert.equal(await readFile(output, "utf8"), "updated");
}));

test("a Blazor package build targeting a different chosen export keeps its command", async () => fixture(async root => {
  await blazorProject(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "node custom-export.cjs" } }));
  const chosen = await initProject(root, { ...metadata, output: "custom-web" });
  assert.deepEqual(chosen.manifest.build, { command: "npm run build", output: "custom-web" });
}));

test("wwwroot is still the export beside a .csproj that is not Blazor WebAssembly", async () => fixture(async root => {
  // A console .csproj is no Blazor app, so its wwwroot is whatever the creator put there.
  await blazorProject(root, "Microsoft.NET.Sdk");
  assert.equal((await initProject(root, metadata)).manifest.build?.output, "wwwroot");
}));

test("a Blazor project's wwwroot is still the export when chosen by name", async () => fixture(async root => {
  await blazorProject(root);
  const chosen = await initProject(root, { ...metadata, output: "wwwroot" });
  assert.equal(chosen.manifest.build?.output, "wwwroot");
  assert.equal(chosen.manifest.build?.command, undefined);
}));

const godotPreset = (id: number, name: string, output: string, platform = "Web") =>
  `[preset.${id}]\nname="${name}"\nplatform="${platform}"\nexport_path="${output}/index.html"\n[preset.${id}.options]\nprogressive_web_app/enabled=false\nvariant/thread_support=${id === 1}\n`;

test("Godot variants require an output choice and retain the chosen preset", async () => fixture(async root => {
  await writeFile(join(root, "project.godot"), "config_version=5");
  await writeFile(join(root, "export_presets.cfg"), godotPreset(0, "Single", "release/single") + godotPreset(1, "Threaded", "release/threaded"));
  await assert.rejects(initProject(root, metadata), { code: "build_output_ambiguous" });
  await assert.rejects(readFile(join(root, "opengame.json")), { code: "ENOENT" });
  const result = await initProject(root, { ...metadata, output: "release/threaded" });
  assert.equal(result.manifest.build?.output, "release/threaded");
  assert.equal(result.manifest.build?.command, "godot --headless --export-release 'Threaded' 'release/threaded/index.html'");
}));

test("a discovered completed Godot export selects its command instead of the first source preset", async () => fixture(async root => {
  await writeFile(join(root, "project.godot"), "config_version=5");
  await writeFile(join(root, "export_presets.cfg"), godotPreset(0, "Other", "release/other") + godotPreset(1, "Completed", "release/ready"));
  await mkdir(join(root, "release/ready"), { recursive: true });
  await writeFile(join(root, "release/ready/index.html"), "<!doctype html><title>Completed</title>");
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.build?.output, "release/ready");
  assert.equal(result.manifest.build?.command, "godot --headless --export-release 'Completed' 'release/ready/index.html'");
}));

test("Godot command inference uses unique bounded fields and a matching output", async () => fixture(async root => {
  await writeFile(join(root, "project.godot"), "config_version=5");
  const preset = godotPreset(0, "Creator's Web", "./release/browser");
  await writeFile(join(root, "export_presets.cfg"), "\ufeff" + preset.replaceAll("\n", "\r\n"));
  const result = await engineSetup(root, {}, "godot");
  assert.equal(result.output, "release/browser");
  assert.equal(result.command, "godot --headless --export-release 'Creator'\\''s Web' 'release/browser/index.html'");
  assert.equal((await engineSetup(root, {}, "godot", "different")).command, undefined);
  for (const text of [
    preset + preset,
    preset.replace('platform="Web"', 'platform="Web"\nplatform="HTML5"'),
    preset.replace('export_path="./release/browser/index.html"', 'export_path="../outside/index.html"'),
    preset.replace('export_path="./release/browser/index.html"', 'export_path="/outside/index.html"'),
    godotPreset(0, "One", "release") + godotPreset(1, "Two", "release"),
  ]) {
    await writeFile(join(root, "export_presets.cfg"), text);
    assert.equal((await engineSetup(root, {}, "godot")).command, undefined, text);
  }
}));

test("Godot 3 HTML5 output is detected without applying a Godot 4 export command", async () => fixture(async root => {
  await writeFile(join(root, "project.godot"), "config_version=4");
  await writeFile(join(root, "export_presets.cfg"), godotPreset(0, "HTML5", "release/legacy", "HTML5"));
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.build?.output, "release/legacy");
  assert.equal(result.manifest.build?.command, undefined);
  assert.match(result.engine.instructions, /matching Godot 3 editor/);
}));

test("an inferred Godot output cannot follow an outward symlink even before it is built", async () => fixture(async root => {
  await fixture(async outside => {
    await writeFile(join(root, "project.godot"), "config_version=5");
    await writeFile(join(root, "export_presets.cfg"), godotPreset(0, "Web", "release/web"));
    await symlink(outside, join(root, "release"));
    await assert.rejects(initProject(root, metadata), { code: "output_outside_project" });
    await assert.rejects(readFile(join(root, "opengame.json")), { code: "ENOENT" });
  });
}));

test("duplicate Godot preset names and named HTML targets never produce an ambiguous build command", async () => fixture(async root => {
  await writeFile(join(root, "project.godot"), "config_version=5");
  await writeFile(join(root, "export_presets.cfg"), godotPreset(0, "Web", "release/single") + godotPreset(1, "Web", "release/threaded"));
  const duplicate = await engineSetup(root, {}, "godot", "release/threaded");
  assert.equal(duplicate.command, undefined);
  assert.match(duplicate.instructions, /unique preset name/);
  await writeFile(join(root, "export_presets.cfg"), godotPreset(0, "Web", "release").replace("release/index.html", "release/game.html"));
  const named = await initProject(root, metadata);
  assert.equal(named.manifest.build?.output, "release");
  assert.equal(named.manifest.build?.command, undefined);
  assert.match(named.engine.instructions, /index.html destination/);
}));

test("Vite JavaScript starter input is excluded before and after building while a completed root export remains", async () => fixture(async root => {
  const pkg = { scripts: { build: "vite build" }, devDependencies: { vite: "1" } };
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/main.js"), "import 'phaser';");
  await writeFile(join(root, "index.html"), '<script type="module" src="/src/main.js"></script>');
  assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/index.html"), '<script src="game.js"></script>');
  assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
  await rm(join(root, "dist"), { recursive: true });
  // A root module page in a project with Vite and a build script is Vite's input
  // whatever the module is called; the same page with no build script, or no Vite,
  // is a finished static game and ships as itself.
  await writeFile(join(root, "index.html"), '<script type="module" src="game.js"></script>');
  await writeFile(join(root, "game.js"), "document.body.textContent='Built';");
  assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
  assert.equal((await detectBuildOutput(root, {})).output, ".");
  assert.equal((await detectBuildOutput(root, { scripts: { build: "node pack.js" } })).output, ".");
}));

test("Vite's vanilla layout, a root index.html loading /main.js, builds to dist rather than shipping its source", async () => fixture(async root => {
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { dev: "vite", build: "vite build" }, devDependencies: { vite: "1" } }));
  await writeFile(join(root, "index.html"), '<!doctype html><title>Root main</title><script type="module" src="/main.js?v=2"></script>');
  await writeFile(join(root, "main.js"), "import './style.css';");
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.build?.output, "dist");
  assert.equal(result.manifest.build?.command, "npm run build");
  // A module from a CDN is not Vite input, so it does not make the root a source page.
  const pkg = { dependencies: { vite: "1" }, scripts: { build: "vite build" } };
  await writeFile(join(root, "index.html"), '<script type="module" src="https://cdn.example.com/game.js"></script>');
  assert.equal((await detectBuildOutput(root, pkg)).output, ".");
}));

test("vite.config's build.outDir is the output when it is a plain string, and an unreadable one asks", async () => fixture(async root => {
  const pkg = { scripts: { build: "vite build" }, devDependencies: { vite: "1" } };
  await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>');
  await writeFile(join(root, "main.js"), "");
  await writeFile(join(root, "vite.config.js"), "export default { build: { outDir: './public-build/' } };");
  assert.equal((await detectBuildOutput(root, pkg)).output, "public-build");
  await writeFile(join(root, "vite.config.js"), "export default { build: { outDir: process.env.OUT } };");
  await assert.rejects(detectBuildOutput(root, pkg), { code: "build_output_required" });
  await writeFile(join(root, "vite.config.js"), "export default { build: { outDir: process.env.CI ? 'ci' : 'web', outDir: 'web' } };");
  await assert.rejects(detectBuildOutput(root, pkg), { code: "build_output_required" });
  await writeFile(join(root, "vite.config.js"), "export default { build: { outDir: '../outside' } };");
  await assert.rejects(detectBuildOutput(root, pkg), { code: "build_output_required" });
  await writeFile(join(root, "vite.config.js"), "export default { build: { outDir: 'web' }, preview: { outDir: 'other' } };");
  await assert.rejects(detectBuildOutput(root, pkg), { code: "build_output_required" }, "two literals give no single answer");
  await writeFile(join(root, "vite.config.js"), "// outDir: 'old'\n/* build: { outDir: 'older' } */\nexport default { base: 'https://cdn.example.com/' };");
  assert.equal((await detectBuildOutput(root, pkg)).output, "dist", "a commented-out outDir is not the config");
  await writeFile(join(root, "vite.config.js"), "export default { root: 'app', build: { outDir: 'out' } };");
  await assert.rejects(detectBuildOutput(root, pkg), { code: "build_output_required" }, "root moves the output, so it is not guessed");
  await rm(join(root, "vite.config.js"));
  await writeFile(join(root, "vite.config.ts"), "export default defineConfig({ base: './' });");
  assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
  const script = (build: string) => ({ ...pkg, scripts: { build } });
  assert.equal((await detectBuildOutput(root, script("vite build --mode production --outDir=www"))).output, "www");
  assert.equal((await detectBuildOutput(root, script("tsc && vite build --outDir ./www/"))).output, "www");
  await assert.rejects(detectBuildOutput(root, script("vite build --config other.config.js")), { code: "build_output_required" });
}));

test("vite build with a positional root asks rather than shipping that folder's source page", async () => fixture(async root => {
  await mkdir(join(root, "app"));
  await writeFile(join(root, "app/main.js"), "");
  await writeFile(join(root, "app/index.html"), '<script type="module" src="/main.js"></script>');
  await assert.rejects(detectBuildOutput(root, { scripts: { build: "vite build app" }, devDependencies: { vite: "1" } }), { code: "build_output_required" });
}));

test("an inline module, a hoisted Vite and Vite's public folder do not make a Vite project ship its source", async () => fixture(async root => {
  const pkg = { scripts: { build: "vite build" }, devDependencies: { vite: "1" } };
  await writeFile(join(root, "main.js"), "");
  await writeFile(join(root, "index.html"), '<script type="module">import "./main.js";</script>');
  assert.equal((await detectBuildOutput(root, pkg)).output, "dist", "Vite bundles an inline module like a linked one");
  await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>');
  assert.equal((await detectBuildOutput(root, { scripts: { build: "tsc && vite build" } })).output, "dist", "a workspace root can hold Vite");
  assert.equal((await detectBuildOutput(root, { scripts: { build: "node pack.js" } })).output, ".");
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public/index.html"), "copied into dist by Vite");
  assert.equal((await detectBuildOutput(root, pkg)).output, "dist");
}));

test("oversized HTML cannot drive unbounded automatic source-root selection", async () => fixture(async root => {
  await writeFile(join(root, "main.ts"), "export const game=1;");
  await writeFile(join(root, "index.html"), " ".repeat(LIMITS.platform.packagingRepair.textBytesMax) + '<script type="module" src="/main.ts"></script>');
  await assert.rejects(detectBuildOutput(root, { scripts: { build: "vite build" }, devDependencies: { vite: "1" } }), { code: "build_output_required" });
}));

test("package discovery rejects oversized and symlinked JSON through bounded reads", async () => fixture(async root => {
  await writeFile(join(root, "package.json"), " ".repeat(LIMITS.platform.manifest.bytesMax + 1));
  await assert.rejects(readBuildPackage(root), { code: "package_unreadable" });
  await rm(join(root, "package.json"));
  await writeFile(join(root, "actual.json"), '{"name":"not-a-real-package"}');
  await symlink(join(root, "actual.json"), join(root, "package.json"));
  await assert.rejects(readBuildPackage(root), { code: "package_unreadable" });
}));

test("package discovery refuses a FIFO without waiting for a writer", { skip: process.platform === 'win32', timeout: 5000 }, async () => fixture(async root => {
  const { execFileSync } = await import('node:child_process');
  execFileSync('mkfifo', [join(root, 'package.json')]);
  await assert.rejects(readBuildPackage(root), { code: 'package_unreadable' });
}));

test("Flutter's default build command is omitted for a separately selected completed export", async () => fixture(async root => {
  await writeFile(join(root, "pubspec.yaml"), "name: game\ndependencies:\n  flutter:\n    sdk: flutter\n");
  await mkdir(join(root, "release"));
  await writeFile(join(root, "release/index.html"), "<!doctype html><title>Earlier export</title>");
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.build?.output, "release");
  assert.equal(result.manifest.build?.command, undefined);
  assert.match(result.engine.instructions, /differs from this recipe's build destination/);
  assert.equal((await engineSetup(root, {}, "flutter", "build/web")).command, "flutter build web --no-web-resources-cdn");
}));

test("Flutter source HTML is excluded before and after the actual web build", async () => fixture(async root => {
  await writeFile(join(root, "pubspec.yaml"), "name: game\ndependencies:\n  flutter:\n    sdk: flutter\n");
  await mkdir(join(root, "web"));
  await writeFile(join(root, "web/index.html"), '<!doctype html><base href="$FLUTTER_BASE_HREF"><script src="flutter_bootstrap.js" async></script>');
  for (const built of [false, true]) {
    if (built) {
      await rm(join(root, "opengame.json"));
      await mkdir(join(root, "build/web"), { recursive: true });
      await writeFile(join(root, "build/web/index.html"), '<!doctype html><base href="/"><script src="flutter_bootstrap.js" async></script>');
    }
    const result = await initProject(root, metadata);
    assert.equal(result.manifest.build?.output, "build/web");
    assert.equal(result.manifest.build?.command, "flutter build web --no-web-resources-cdn");
  }
}));

test("Trunk source HTML does not replace the release output before or after building", async () => fixture(async root => {
  await writeFile(join(root, "Trunk.toml"), '[build]\n');
  await writeFile(join(root, "index.html"), '<!doctype html><link data-trunk rel="rust" href="Cargo.toml">');
  for (const built of [false, true]) {
    if (built) {
      await rm(join(root, "opengame.json"));
      await mkdir(join(root, "dist"));
      await writeFile(join(root, "dist/index.html"), '<!doctype html><script type="module" src="game.js"></script>');
    }
    const result = await initProject(root, metadata);
    assert.equal(result.manifest.build?.output, "dist");
    assert.equal(result.manifest.build?.command, "trunk build --release");
  }
}));

// Ids and names are the registry's. A recipe for an engine the registry does not know, or
// a registry engine init cannot choose, is the drift this table used to carry.
test("every recipe is a registry engine under the registry's name, and every registry engine has a recipe", () => {
  assert.deepEqual([...ENGINE_IDS].sort(), Object.keys(ENGINE_REGISTRY).sort());
  for (const [id, row] of Object.entries(ENGINE_REGISTRY)) assert.equal(ENGINE_PRESETS[id]?.name, row.name, id);
});

test("unknown projects fall back to custom and unsupported IDs are explicit errors", async () => fixture(async root => {
  assert.equal((await engineSetup(root, {})).id, "custom");
  await assert.rejects(engineSetup(root, {}, "unreal"), { code: "engine_invalid" });
  assert.equal((await engineSetup(root, {}, "flame")).command, "flutter build web --no-web-resources-cdn");
  assert.equal((await engineSetup(root, {}, "stride")).command, undefined);
}));

test("a plain Cargo project is not silently treated as a browser export", async () => fixture(async root => {
  await writeFile(join(root, "Cargo.toml"), '[package]\nname="cli-tool"');
  assert.equal((await engineSetup(root, {})).id, "custom");
  await mkdir(join(root, ".cargo")); await writeFile(join(root, ".cargo/config.toml"), '[build]\ntarget="wasm32-unknown-unknown"');
  assert.equal((await engineSetup(root, {})).id, "rust");
}));

test("source marker symlinks are ignored and package build scripts retain precedence", async () => fixture(async root => {
  await writeFile(join(root, "marker.txt"), "config_version=5");
  await symlink(join(root, "marker.txt"), join(root, "project.godot"));
  assert.equal((await engineSetup(root, {})).id, "custom");
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "vite build" }, devDependencies: { vite: "1" } }));
  const result = await initProject(root, { ...metadata, engine: "phaser" });
  assert.equal(result.manifest.build?.command, "npm run build");
  assert.equal(result.manifest.build?.output, "dist");
  assert.match(await readFile(join(root, "opengame.json"), "utf8"), /npm run build/);
}));

test("named exports are found by the same signatures as preflight", async () => fixture(async root => {
  await mkdir(join(root, "release/my-game/Build"), { recursive: true });
  await writeFile(join(root, "release/my-game/index.html"), '<script src="Build/Game.loader.js"></script>');
  await writeFile(join(root, "release/my-game/Build/Game.loader.js"), "createUnityInstance(canvas, {});");
  await writeFile(join(root, "release/my-game/Build/Game.wasm"), new Uint8Array([0,97,115,109]));
  const result = await detectBuildOutput(root, {});
  assert.equal(result.output, "release/my-game");
  assert.equal(result.engine, "unity");
}));


/* Kaigen has no editor export, so the editor sentence init used to print ("For Cocos choose
   Web Mobile") told a Kaigen creator nothing, and the build folder it wrote, build/, is not
   where Kaigen writes. hzproject.hzt marks the project root; hz/hzbuild sits beside it. */
test("a Kaigen project gets its own build, folder, renderer and instructions", async () => fixture(async root => {
  await writeFile(join(root, "hzproject.hzt"), "name: oc\n");
  const result = await initProject(root, metadata);
  assert.equal(result.engine.id, "kaigen");
  assert.equal(result.engine.evidence, "hzproject.hzt");
  assert.deepEqual(result.manifest.build, { command: "hz/hzbuild wasm --release", output: "out/wasm/release" });
  assert.deepEqual(JSON.parse(await readFile(join(root, "opengame.json"), "utf8")).requires, { renderer: "webgpu" });
  for (const words of [/hz\/hzbuild wasm --release/, /hz\/hzbuild wasm ios --release/, /out\/wasm-ios\/release/, /opengame-global\.js/, /templates\/kaigen\/opengame-kaigen\.js/, /staging folder such as dist\//]) {
    assert.match(result.engine.instructions, words);
  }
  assert.doesNotMatch(result.engine.instructions, /editor|Cocos|—/);
  assert.equal(result.engine.docs, "https://docs.opengame.io/engines/kaigen");
}));

/* A real Kaigen project holds thousands of cooked files, so the output search refused OG Clash
   with build_output_required. The build tool decides the folder; init takes it without a walk. */
test("a Kaigen source tree past the search limit still gets its output folder", async () => fixture(async root => {
  await writeFile(join(root, "hzproject.hzt"), "name: oc\n");
  await mkdir(join(root, "cooked"), { recursive: true });
  for (let i = 0; i <= LIMITS.bundle.fileCountMax; i++) await writeFile(join(root, "cooked", `f${i}.hza`), "");
  const result = await initProject(root, metadata);
  assert.equal(result.manifest.build?.output, "out/wasm/release");
}));

test("Kaigen without hzproject.hzt, or on Windows, gets no invented build command", async () => fixture(async root => {
  const named = await initProject(root, { ...metadata, engine: "kaigen" });
  assert.deepEqual(named.manifest.build, { output: "out/wasm/release" });
  assert.deepEqual(named.manifest.requires, { renderer: "webgpu" });
  assert.match(named.engine.instructions, /No hzproject\.hzt was found here, so init set no build command/);
  await writeFile(join(root, "hzproject.hzt"), "name: oc\n");
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { ...platform, value: "win32" });
  try {
    const windows = await engineSetup(root, {}, "kaigen");
    assert.equal(windows.command, undefined);
    assert.match(windows.instructions, /On Windows the build tool is hz\\hzbuild, so init set no build command/);
  } finally { Object.defineProperty(process, "platform", platform); }
  // Another engine's recipe carries no renderer requirement.
  assert.equal((await engineSetup(root, {}, "threejs")).requires, undefined);
}));

test("the Kaigen starter asks for the renderer init writes", async () => fixture(async root => {
  const starter = JSON.parse(await readFile(new URL("../../../templates/kaigen/opengame.json", import.meta.url), "utf8"));
  assert.deepEqual(starter.requires, (await engineSetup(root, {}, "kaigen")).requires);
}));

/* Luau's own configuration marks a Luau project, and a Rojo project beside it is a Roblox
   one, which has no web export. A Luau game on the web embeds a Luau VM compiled to
   WebAssembly, so the package that carries the VM says the same. */
test("a .luaurc or a Luau VM package is a Luau project, and a Rojo project is not", async () => fixture(async root => {
  await writeFile(join(root, ".luaurc"), '{ "languageMode": "strict" }');
  const marked = await engineSetup(root, {});
  assert.deepEqual([marked.id, marked.name, marked.output, marked.evidence], ["luau", "Luau", "dist", ".luaurc"]);
  assert.equal(marked.docs, "https://docs.opengame.io/engines/javascript");
  await writeFile(join(root, "default.project.json"), '{ "name": "place", "tree": { "$className": "DataModel" } }');
  assert.equal((await engineSetup(root, {})).id, "custom", "Rojo builds for Roblox");
  for (const name of ["luau-web", "@luau-rs/luau"]) {
    const result = await engineSetup(root, { dependencies: { [name]: "1" } });
    assert.deepEqual([result.id, result.evidence], ["luau", `package.json: ${name}`]);
  }
}));

test("raw WebAssembly has a recipe when asked for and no marker of its own", async () => fixture(async root => {
  await writeFile(join(root, "index.html"), '<script type="module">WebAssembly.instantiateStreaming(fetch("game.wasm"), {});</script>');
  assert.equal((await engineSetup(root, {})).id, "custom");
  const named = await engineSetup(root, {}, "webassembly");
  assert.deepEqual([named.id, named.name, named.output], ["webassembly", "WebAssembly", "."]);
  assert.equal(named.docs, "https://docs.opengame.io/engines/webassembly");
  assert.equal(named.command, undefined);
}));

/* Where init and the size refusal send each engine. An Emscripten build has a guide of its
   own under WebAssembly, and until 5 Nov 2026 init sent C, C++ and raylib to the general
   WebAssembly page instead, past the flags, saves and player behaviour written for them. */
test("each engine's guide link is its own page, its family's, or the overview", () => {
  for (const id of ["emscripten", "c", "cpp", "raylib"]) assert.equal(engineGuide(id), "https://docs.opengame.io/engines/emscripten", id);
  assert.equal(engineGuide("rust"), "https://docs.opengame.io/engines/webassembly");
  assert.equal(engineGuide("phaser"), "https://docs.opengame.io/engines/javascript");
  assert.equal(engineGuide("godot"), "https://docs.opengame.io/engines/godot");
  assert.equal(engineGuide("renpy"), "https://docs.opengame.io/engines/overview");
  for (const id of ENGINE_IDS) assert.match(engineGuide(id), /^https:\/\/docs\.opengame\.io\/engines\/[a-z]+$/, id);
});

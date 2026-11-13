import test from "node:test";
import assert from "node:assert/strict";
import { preflight, type PreflightFile } from "../src/index";
import { nativeBuild } from "../src/native-build";

/* Launch round 4 (13 Nov 2026) dropped a Unity Windows build and was told to rename a file
   or to drop dist/ instead of the source. A desktop or phone build is named as one, with the
   engine's own way to export for the web when the files say which engine it is. */

const file = (path: string, text = "x"): PreflightFile => ({ path, size: Buffer.byteLength(text), text: async () => text });
const entry = async (paths: string[]) => (await preflight(paths.map((p) => file(p)))).findings.find((row) => row.severity === "blocker");

test("a Unity Windows build is named, with Unity's own way to export for the web", async () => {
  const finding = await entry(["SkyRacer.exe", "UnityPlayer.dll", "SkyRacer_Data/globalgamemanagers", "SkyRacer_Data/Managed/Assembly-CSharp.dll", "README.txt"]);
  assert.equal(finding?.code, "native-build");
  assert.match(finding!.title, /^This is a Windows build, and OpenGame runs games in a web browser/);
  assert.match(finding!.detail!, /In Unity, open Build Profiles .* choose Web or WebGL/);
  assert.doesNotMatch(finding!.title + finding!.detail, /—/, "no em dashes in what a creator reads");
});

test("Godot, macOS, Linux and Android builds are named too", () => {
  assert.match(nativeBuild([{ path: "Dodge.exe" }, { path: "Dodge.pck" }])!.advice, /In Godot, open Project > Export, add a Web preset/);
  assert.equal(nativeBuild([{ path: "Game.app/Contents/MacOS/Game" }])!.kind, "a macOS");
  assert.equal(nativeBuild([{ path: "game.x86_64" }, { path: "game.pck" }])!.kind, "a Linux");
  assert.equal(nativeBuild([{ path: "game.apk" }])!.kind, "an Android");
});

test("a folder with no page and no program is still told it has no page", async () => {
  assert.equal((await entry(["readme.txt", "art/hero.png"]))?.code, "no-entry");
  assert.equal(nativeBuild([{ path: "index.js" }, { path: "art.png" }]), null);
});

test("a source project carrying tool programs is still told to build, and a stray shortcut is not a desktop build", async () => {
  const codes = (await preflight(["package.json", "src/main.js", "node_modules/@esbuild/win32-x64/esbuild.exe", "node_modules/.bin/vite.cmd"].map((p) => file(p)))).findings.map((row) => row.code);
  assert.ok(codes.includes("source-not-build") && !codes.includes("native-build"), codes.join(","));
  assert.equal((await entry(["MyGame.html", "assets/a.png", "Play.lnk", "run-local-server.bat"]))?.code, "no-entry", "a misnamed page with a shortcut beside it is told to rename the page");
  assert.equal(nativeBuild([{ path: "gradle/wrapper/gradle-wrapper.jar" }, { path: "gradlew.bat" }]), null);
});

test("Unity's advice needs Unity's own files, not any folder ending in _Data", () => {
  assert.match(nativeBuild([{ path: "Game.exe" }, { path: "Save_Data/slot1.sav" }])!.advice, /^Export or build the game for the web/);
  assert.match(nativeBuild([{ path: "Game.exe" }, { path: "Game_Data/Managed/Assembly-CSharp.dll" }])!.advice, /^In Unity/);
});

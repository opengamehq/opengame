/*
 * A desktop or phone build, recognised from its file names, so a folder with no page in it
 * is told what it is rather than to rename a file. A Unity Windows build (Game.exe beside
 * UnityPlayer.dll and Game_Data/) used to be told to drop dist/ instead of the source, or
 * that it had no index.html: both true, and neither the one thing to change, which is to
 * export for the web. The server refuses a program's bytes whatever its name; this only
 * chooses the words. It imports nothing, because the upload page reads it in the browser
 * and the CLI bundles it, and one set of words for both is the point.
 */
export function nativeBuild(files: { path: string }[]): { kind: string; advice: string; path: string } | null {
  /* A program a player would launch, not every refused extension: a stray .bat, .lnk or .jar
     beside a misnamed page is a page to rename, and the tools a source project carries
     (node_modules/.bin/vite.cmd, esbuild.exe, gradle-wrapper.jar) are a build to run. */
  const tooling = /(^|\/)(node_modules|\.git|gradle|\.gradle|vendor|tools?|bin\/Debug|obj)\//i;
  const shipped = files.filter((f) => !tooling.test(f.path));
  const ext = (p: string) => /\.([^./]+)$/.exec(p)?.[1]?.toLowerCase() ?? "";
  const programs = new Set(["exe", "msi", "msix", "appx", "apk", "aab", "xapk", "ipa", "dmg", "pkg", "mpkg", "appimage", "deb", "rpm"]);
  const program = shipped.find((f) => programs.has(ext(f.path)) || /\.x86(?:_64)?$/i.test(f.path) || /\.app\/Contents\/MacOS\//.test(f.path));
  if (!program) return null;
  const has = (re: RegExp) => shipped.some((f) => re.test(f.path));
  const e = ext(program.path);
  const kind = /^(apk|aab|xapk)$/.test(e) ? "an Android" : e === "ipa" ? "an iOS"
    : /^(dmg|pkg|mpkg)$/.test(e) || /\.app\/Contents\//.test(program.path) ? "a macOS"
    : /^(deb|rpm|appimage)$/.test(e) || /\.x86(?:_64)?$/i.test(program.path) ? "a Linux" : "a Windows";
  /* Unity's own files, not any folder ending in _Data, which other engines' saves use too. */
  const unity = has(/(^|\/)UnityPlayer\.(dll|so|dylib)$/i) || has(/(^|\/)[^/]+_Data\/(globalgamemanagers|Managed\/|il2cpp_data\/|data\.unity3d$)/i) || has(/(^|\/)UnityFramework\.framework\//);
  const advice = unity
    ? "In Unity, open Build Profiles (File > Build Settings in older versions), choose Web or WebGL, and build."
    : has(/\.pck$/i) ? "In Godot, open Project > Export, add a Web preset, and export it."
    : "Export or build the game for the web (HTML5 or WebGL) from your engine.";
  return { kind, advice, path: program.path };
}

/** The finding's two sentences, for the CLI's preflight and for Drop, in one place. */
export function nativeBuildWords(native: { kind: string; advice: string }, entry = "index.html"): { title: string; detail: string } {
  return {
    title: `This is ${native.kind} build, and OpenGame runs games in a web browser. There is no ${entry} in it.`,
    detail: `${native.advice} Then drop the folder that export writes, with ${entry} at its top.`,
  };
}

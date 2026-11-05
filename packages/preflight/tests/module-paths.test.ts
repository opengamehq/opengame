import test from "node:test";
import assert from "node:assert/strict";
import { preflight, type PreflightFile } from "../src/index";
const file = (path: string, text: string): PreflightFile => ({ path, size: Buffer.byteLength(text), text: async () => text });
const module = '<script type="module" src="./assets/main.js"></script>';
const issues = async (files: PreflightFile[]) => (await preflight(files)).findings.filter(row => ["bare-import", "missing-module-path"].includes(row.code));

test("compressed module children retain their actual URLs while resolving imports and maps", async () => {
  const compressed = (path: string, source: string): PreflightFile => ({ path, size: source.length, text: async () => "compressed bytes", decodedText: async () => source });
  for (const suffix of ["gz", "br"]) {
    const files = [file("index.html", `<script type="module" src="assets/main.js.${suffix}"></script>`),
      compressed(`assets/main.js.${suffix}`, `import "./child.js.${suffix}";`),
      compressed(`assets/child.js.${suffix}`, 'import "missing-package";')];
    const failed = await issues(files);
    assert.equal(failed[0]?.code, "bare-import");
    assert.equal(failed[0]?.path, `assets/child.js.${suffix}`);
    files[0] = file("index.html", `<script type="importmap">{"imports":{"missing-package":"./vendor.js.${suffix}"}}</script><script type="module" src="assets/main.js.${suffix}"></script>`);
    files.push(compressed(`vendor.js.${suffix}`, "export default 1;"));
    assert.deepEqual(await issues(files), []);
    files.pop();
    assert.equal((await issues(files))[0]?.code, "missing-module-path");
    const mapped = await preflight([
      file("index.html", `<script type="importmap">{"imports":{"lib/":"./assets/"}}</script><script type="module" src="main.js.${suffix}"></script>`),
      compressed(`main.js.${suffix}`, 'import "lib/core.js";'), file("assets/core.js", "export default 1;"),
    ]);
    assert.equal(mapped.ok, true, JSON.stringify(mapped.findings));
    const missing = await preflight([file("index.html", `<script src="missing.js.${suffix}"></script>`)]);
    assert.ok(missing.findings.some(finding => finding.code === "missing-import"));
  }
});

test("bare imports require the importing entry's local import map", async () => {
  const files = [file("index.html", module), file("assets/main.js", 'import * as THREE from "three";')];
  assert.equal((await issues(files))[0]?.code, "bare-import");
  files.push(file("editor.html", '<script type="importmap">{"imports":{"three":"./vendor/three.js"}}</script>'), file("vendor/three.js", "export const x=1;"));
  assert.equal((await issues(files))[0]?.code, "bare-import", "an unrelated map cannot satisfy the game's dependency");
  files[0] = file("index.html", '<script type="importmap">{"imports":{"three":"./vendor/three.js"}}</script>' + module);
  assert.deepEqual(await issues(files), []);
});

test("module paths resolve beside the importing file even when a root twin exists", async () => {
  const files = [file("index.html", module), file("assets/main.js", 'import "./dependency.js";'), file("dependency.js", "export default 1;")];
  assert.equal((await issues(files))[0]?.code, "missing-module-path");
  files.push(file("assets/dependency.js", "export default 1;"));
  assert.deepEqual(await issues(files), []);
});

test("comments, classic scripts and unloaded modules do not create bare import findings", async () => {
  assert.deepEqual(await issues([file("index.html", '<script>const example="import x from three";</script>' + module),
    file("assets/main.js", '// import x from "three";\nconst message="import x from three";'), file("unused.js", 'import x from "three";')]), []);
});

test("mapped prefixes and scopes still require the resulting staged file", async () => {
  const page = '<script type="importmap">{"imports":{"lib/":"./vendor/"},"scopes":{"./assets/":{"lib/":"./scoped/"}}}</script>' + module;
  const files = [file("index.html", page), file("assets/main.js", 'import "lib/helper.js";'), file("vendor/helper.js", "export default 1;")];
  assert.equal((await issues(files))[0]?.code, "missing-module-path");
  files.push(file("scoped/helper.js", "export default 1;"));
  assert.deepEqual(await issues(files), []);
});

test("local document bases and encoded spaces resolve to the files the host serves", async () => {
  const result = await preflight([file("index.html", '<base href="./assets/"><script type="module" src="./main.js"></script>'),
    file("assets/main.js", 'import "./helper%20file.js";'), file("assets/helper file.js", "export default 1;")]);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test("classic scripts still need a valid path for dynamic module imports", async () => {
  const result = await preflight([file("index.html", '<script src="./main.js"></script>'), file("main.js", 'import("three");')]);
  assert.ok(result.findings.some(row => row.code === "bare-import"));
});

test("import maps can remap URL-like specifiers as well as bare names", async () => {
  for (const key of ["./old.js", "/old.js"]) {
    const result = await preflight([file("index.html", `<script type="importmap">{"imports":{"${key}":"./vendor/new.js"}}</script><script type="module" src="./main.js"></script>`),
      file("main.js", `import "${key}";`), file("vendor/new.js", "export default 1;")]);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
  }
});

test("URL-like map keys cannot satisfy bare specifiers and bare keys cannot remap URLs", async () => {
  for (const [key, specifier] of [["./foo.js", "foo.js"], ["foo.js", "./foo.js"]]) {
    const result = await preflight([file("index.html", `<script type="importmap">{"imports":{"${key}":"./vendor.js"}}</script><script type="module" src="./main.js"></script>`),
      file("main.js", `import "${specifier}";`), file("vendor.js", "export default 1;")]);
    assert.equal(result.ok, false);
    assert.ok(result.findings.some(row => ["bare-import", "missing-module-path"].includes(row.code)));
  }
});

test("URL import-map keys retain query identity", async () => {
  const result = await preflight([file("index.html", '<script type="importmap">{"imports":{"./foo.js?one":"./vendor.js"}}</script><script type="module" src="./main.js"></script>'),
    file("main.js", 'import "./foo.js?two";'), file("vendor.js", "export default 1;")]);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some(row => row.code === "missing-module-path"));
});

/* An import map's type is matched without regard to case and without trimming, as Chrome
   does. Reading an upper-case map matters in both directions: it can make an import that
   looks local load something else, and it can make a bare import resolvable. */
test("an import map typed in upper case is read, and one with spaces around it is not", async () => {
  const remapped = await preflight([file("index.html", '<script type="IMPORTMAP">{"imports":{"./a.js":"data:text/javascript,export default 1"}}</script><script type="module" src="./main.js"></script>'),
    file("main.js", 'import "./a.js";'), file("a.js", "export default 1;")]);
  assert.equal(remapped.ok, false, "./a.js is staged, but the map sends it to a data: module");
  assert.ok(remapped.findings.some(row => row.code === "bare-import" && row.title.includes("./a.js")));
  const mapped = await preflight([file("index.html", '<script type="ImportMap">{"imports":{"three":"./vendor/three.js"}}</script><script type="module" src="./main.js"></script>'),
    file("main.js", 'import "three";'), file("vendor/three.js", "export default 1;")]);
  assert.equal(mapped.ok, true, JSON.stringify(mapped.findings));
  for (const type of [" importmap ", "importmap ", "\timportmap"]) {
    const ignored = await preflight([file("index.html", `<script type="${type}">{"imports":{"three":"./vendor/three.js"}}</script><script type="module" src="./main.js"></script>`),
      file("main.js", 'import "three";'), file("vendor/three.js", "export default 1;")]);
    assert.ok(ignored.findings.some(row => row.code === "bare-import"), JSON.stringify(type));
  }
});

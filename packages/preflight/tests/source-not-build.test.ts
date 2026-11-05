import test from "node:test";
import assert from "node:assert/strict";
import { preflight, type PreflightFile } from "../src/index";

/* An unbuilt project arrives two ways. With no page at all, which diagnoseMissingEntry has
   named for a long time, and with a page that loads its own source, which passed until
   30 Oct 2026: a Vite project's root index.html is `<script type="module"
   src="/src/main.ts">`, and the review corpus's source-upload case went through preflight
   clean while a player would have got a blank page. */

const file = (path: string, text: string): PreflightFile => ({ path, size: Buffer.byteLength(text), text: async () => text });
const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Snake</title></head><body><canvas id="c"></canvas>${body}</body></html>`;
const snake = 'const c = document.getElementById("c"); c.getContext("2d").fillRect(0, 0, 10, 10);';
const unbuilt = async (files: PreflightFile[]) => (await preflight(files)).findings.filter(row => row.code === "source-not-build");

test("a Vite project uploaded unbuilt is refused, naming the file the page loads and where the build goes", async () => {
  const files = [
    file("index.html", page('<script type="module" src="/src/main.ts"></script>')),
    file("src/main.ts", `const c = document.getElementById("c") as HTMLCanvasElement;\n${snake}`),
    file("package.json", '{ "scripts": { "build": "vite build" } }'),
  ];
  const result = await preflight(files);
  assert.equal(result.ok, false);
  const [finding] = result.findings.filter(row => row.code === "source-not-build");
  assert.ok(finding, JSON.stringify(result.findings));
  assert.equal(finding.severity, "blocker");
  assert.equal(finding.path, "index.html");
  assert.match(finding.title, /index\.html loads src\/main\.ts, which is TypeScript/);
  assert.match(finding.detail!, /upload what it produces, usually dist\//);
  assert.doesNotMatch(finding.title + finding.detail, /—/, "no em dashes in what a creator reads");

  /* With the config file in the upload, the tool is named, from the same table the
     no-page case reads. */
  const named = await unbuilt([...files, file("vite.config.ts", "export default {};")]);
  assert.match(named[0]!.detail!, /Run your Vite build step/);
});

test("a .tsx module is refused, and so is a module preload of source", async () => {
  const tsx = await unbuilt([file("index.html", page('<script type="module" src="./src/main.tsx"></script>')),
    file("src/main.tsx", "export const App = () => <canvas />;")]);
  assert.equal(tsx.length, 1);
  assert.match(tsx[0]!.title, /loads src\/main\.tsx, which is TypeScript/);

  const preload = await unbuilt([file("index.html", page('<link rel="modulepreload" href="src/game.ts"><script src="boot.js"></script>')),
    file("boot.js", snake), file("src/game.ts", "export {};")]);
  assert.equal(preload.length, 1);
  assert.match(preload[0]!.title, /loads src\/game\.ts/);

  for (const [name, kind] of [["App.jsx", "JSX"], ["App.vue", "a Vue component"], ["App.svelte", "a Svelte component"]] as const) {
    const found = await unbuilt([file("index.html", page(`<script type="module" src="src/${name}"></script>`)), file(`src/${name}`, "x")]);
    assert.match(found[0]?.title ?? "", new RegExp(`which is ${kind},`), name);
  }
});

test("a built game whose page loads its bundle passes", async () => {
  const result = await preflight([
    file("index.html", page('<link rel="modulepreload" href="/assets/vendor-x1y2.js"><script type="module" crossorigin src="/assets/index-abc.js"></script>')),
    file("assets/index-abc.js", `import "./vendor-x1y2.js";\n${snake}`),
    file("assets/vendor-x1y2.js", "export const v = 1;"),
  ]);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.findings.some(row => row.code === "source-not-build"), false);
});

test("TypeScript that ships in the folder but is not loaded by the page does not refuse it", async () => {
  /* Some games ship their source beside the build, for modders or by accident. It costs
     bytes and nothing else, because the browser never asks for it. */
  const result = await preflight([
    file("index.html", page('<script src="game.js"></script>')),
    file("game.js", snake),
    file("src/main.ts", "export {};"),
    file("types/game.d.ts", "export declare const x: number;"),
  ]);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test("only the entry page, and only a script the browser runs", async () => {
  // A level editor beside the game is not what a player opens.
  assert.deepEqual(await unbuilt([file("index.html", page('<script src="game.js"></script>')), file("game.js", snake),
    file("editor/index.html", page('<script type="module" src="./editor.ts"></script>')), file("editor/editor.ts", "export {};")]), []);
  // Babel standalone fetches and compiles `text/babel` itself; the browser never runs it as a script.
  assert.deepEqual(await unbuilt([file("index.html", page('<script src="babel.min.js"></script><script type="text/babel" src="app.jsx"></script>')),
    file("babel.min.js", "window.Babel = {};"), file("app.jsx", "x")]), []);
  // Remote is not a file in this game.
  assert.equal((await unbuilt([file("index.html", page('<script type="module" src="https://esm.sh/x.tsx"></script>'))])).length, 0);
});

test("a query does not compile anything on the games origin, and neither does a module in between", async () => {
  // The Worker types by pathname, so this arrives as the same bytes as /src/main.ts.
  assert.equal((await unbuilt([file("index.html", page('<script type="module" src="/src/main.ts?import"></script>')),
    file("src/main.ts", "export {};")])).length, 1);
  // index.html -> boot.js -> ./src/main.ts is a blank page one fetch later.
  assert.equal((await unbuilt([file("index.html", page('<script type="module" src="boot.js"></script>')),
    file("boot.js", 'import "./src/main.ts";'), file("src/main.ts", "export {};")])).length, 1);
  // A dynamic import from a classic script reaches the same file.
  assert.equal((await unbuilt([file("index.html", page('<script src="boot.js"></script>')),
    file("boot.js", 'import("./src/main.tsx");'), file("src/main.tsx", "export {};")])).length, 1);
});

test("a project nested one folder down is still caught after the root is stripped", async () => {
  const found = await unbuilt([file("snake/index.html", page('<script type="module" src="/src/main.ts"></script>')),
    file("snake/src/main.ts", "export {};"), file("snake/vite.config.ts", "export default {};")]);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.path, "index.html");
  assert.match(found[0]!.detail!, /Vite build step/);
});

test("the no-page case reads the same toolchain table", async () => {
  const result = await preflight([file("src/main.ts", "export {};"), file("svelte.config.js", "export default {};")]);
  const [finding] = result.findings.filter(row => row.code === "source-not-build");
  assert.match(finding!.title, /There is no index\.html anywhere in it/);
  assert.match(finding!.detail!, /Run your SvelteKit build step and upload what it produces, usually build\//);
});

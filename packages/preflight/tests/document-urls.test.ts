import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, type PreflightFile } from '../src/index';

/**
 * A URL built against the page's own address, and the SDK's local manifest.
 *
 * Every deploy of a starter printed "Worth a look: 1 referenced file is not in the
 * folder. Not found: assets/index-<hash>.js:4108 → assets/opengame.json". The SDK's bundled
 * line is `new URL("./opengame.json", i.location.href)`, which a browser resolves against
 * the page, and it runs only outside OpenGame, where the page does not hand the SDK its
 * manifest. Preflight read it against the module's folder and then reported it missing.
 */

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const page = '<!doctype html><script type="module" src="./assets/index-a1b2.js"></script>';
const missing = async (files: PreflightFile[]) =>
  (await preflight(files)).findings.find((f) => f.code === 'missing-ref')?.more ?? [];

test("the SDK's bundled manifest read is not a missing file when the build has no opengame.json", async () => {
  const sdk = 'const r=await this.json(new URL("./opengame.json",i.location.href),{cache:"no-store"});\n' +
    'storageKey(e){return`og:dev:${new URL("./opengame.json",this.context().win.location.href).pathname}:${e}`}\n';
  assert.deepEqual(await missing([file('index.html', page), file('assets/index-a1b2.js', sdk)]), []);
});

test('a page-relative URL is resolved against the entry document, and only there', async () => {
  const code = (literal: string, base = 'location.href') => `const u = new URL("${literal}", ${base});\n`;
  // Missing: named where the browser will ask, at the root, not under assets/.
  assert.deepEqual(await missing([file('index.html', page), file('assets/index-a1b2.js', code('./levels/one.json'))]),
    ['assets/index-a1b2.js:1 → levels/one.json']);
  // Present at the root: satisfied.
  assert.deepEqual(await missing([file('index.html', page), file('assets/index-a1b2.js', code('./levels/one.json')),
    file('levels/one.json', '{}')]), []);
  // Present only beside the module: the page would not find it, so it is still missing.
  assert.deepEqual(await missing([file('index.html', page), file('assets/index-a1b2.js', code('./levels/one.json')),
    file('assets/levels/one.json', '{}')]), ['assets/index-a1b2.js:1 → levels/one.json']);
  for (const base of ['window.location.href', 'self.location.href', 'document.baseURI', 'globalThis.document.baseURI']) {
    assert.deepEqual(await missing([file('index.html', page), file('assets/index-a1b2.js', code('./levels/one.json', base))]),
      ['assets/index-a1b2.js:1 → levels/one.json'], base);
  }
});

test('a module-relative URL and a plain fetch keep the two bases they always had', async () => {
  // import.meta.url is the module itself, so beside it is found.
  assert.deepEqual(await missing([file('index.html', page),
    file('assets/index-a1b2.js', 'const u = new URL("./sprite.png", import.meta.url);\n'), file('assets/sprite.png', 'x')]), []);
  // A game's own request for opengame.json, outside the SDK's page-relative read, is not excused.
  assert.deepEqual(await missing([file('index.html', page), file('assets/index-a1b2.js', 'fetch("./opengame.json");\n')]),
    ['assets/index-a1b2.js:1 → assets/opengame.json']);
});

test('an opengame.json that is in the build is simply found, and a wrong case still says so', async () => {
  const sdk = 'new URL("./opengame.json",i.location.href);\n';
  assert.deepEqual(await missing([file('index.html', page), file('assets/index-a1b2.js', sdk), file('opengame.json', '{}')]), []);
  const result = await preflight([file('index.html', page), file('assets/index-a1b2.js', sdk), file('OpenGame.json', '{}')]);
  assert.ok(result.findings.some((f) => f.code === 'case-mismatch' && /asks for opengame\.json, but the file is OpenGame\.json/.test(f.title)));
});

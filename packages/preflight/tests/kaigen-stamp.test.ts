/* A Kaigen web build carries its licence's stamp, ingest token included, by design, and
   OpenGame accepted that for its own licence on 24 Oct 2026. The check says so as a note and
   never fails on it. It exempts nothing to get there: the stamp's fields are hex and match
   none of limits.json's credential shapes, so a key-shaped string anywhere in the build,
   inside a stamp included, is refused exactly as before. These are the decoys that hold
   that line. The server reads the .wasm for keys as well, and holds the same line in
   apps/pipeline/tests/test_credential_patterns.py.

   The module is the synthetic one in fixtures/synthetic_kaigen.py: no Kaigen byte may sit
   in this repository (Kaigen's beta agreement, 7(a)). The stamp below is shaped like a
   real one, `HZLICSTAMP1|` then a 16-hex licence id, a 40-hex ingest token and a channel,
   measured from Hearthguard's build without copying a value; both hex fields are SHA-1s
   of a sentence saying what they are not. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { preflight, type PreflightFile } from '../src/index';

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const module = (path: string, bytes: Uint8Array): PreflightFile =>
  ({ path, size: bytes.length, bytes: async () => bytes, text: async () => { throw new Error('binary'); } });
const KAIGEN = (JSON.parse(readFileSync(new URL('./fixtures/engine-signatures.json', import.meta.url), 'utf8')) as
  { id: string; text: string; wasm?: { path: string; base64: string }[] }[]).find((row) => row.id === 'kaigen' && row.wasm)!;
const KAIGEN_WASM = new Uint8Array(Buffer.from(KAIGEN.wasm![0]!.base64, 'base64'));
const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');
const LICENCE = sha1('not a kaigen licence id').slice(0, 16);
const INGEST = sha1('not a kaigen ingest token');
const stamp = (ingest: string) => `HZLICSTAMP1|${LICENCE}|${ingest}|dev`;
// Shaped like each pattern and valid for none of them.
const GITHUB = `ghp_${'A1b2C3d4E5'.repeat(4)}`;
const AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP';

const kaigen = (extra: PreflightFile[] = [], shell = 'export function createGame(e){return e.wasmUrl}') => preflight([
  file('index.html', '<canvas id="c"></canvas><script type="module" src="shell.js"></script>'),
  file('shell.js', shell), file('main_worker.js', KAIGEN.text), module('st/game.wasm', KAIGEN_WASM), ...extra]);
const blockers = (result: { findings: { code: string; severity: string }[] }) =>
  result.findings.filter((f) => f.severity === 'blocker').map((f) => f.code);

test('a Kaigen build\'s licence stamp is a note that says it is normal, and the build passes', async () => {
  const result = await kaigen();
  assert.equal(result.engine?.id, 'kaigen', JSON.stringify(result.engine));
  assert.deepEqual(result.engine?.licences, ['kaigen']);
  const note = result.findings.filter((f) => f.code === 'engine-licence-stamp');
  assert.deepEqual(note.map((f) => [f.severity, f.title]), [['note', 'Kaigen licence stamp found; this is normal for Kaigen web builds.']]);
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('the stamp written out in a script, with a real-shaped ingest token, is not a credential', async () => {
  const result = await kaigen([], `export const LICENCE=${JSON.stringify(stamp(INGEST))};export function createGame(e){return e.wasmUrl}`);
  assert.deepEqual(result.findings.filter((f) => /credential|secret/.test(f.code)), []);
  assert.equal(result.ok, true);
});

test('a key-shaped value in the stamp\'s ingest field is still refused', async () => {
  for (const [kind, key] of [['a GitHub token', GITHUB], ['an AWS access key id', AWS]]) {
    const result = await kaigen([], `export const LICENCE=${JSON.stringify(stamp(key))};`);
    assert.ok(blockers(result).includes('credential-in-file'), `${kind}: ${JSON.stringify(result.findings)}`);
    assert.ok(!JSON.stringify(result).includes(key), 'the key is never repeated');
  }
});

test('a real key elsewhere in a stamped Kaigen build is still refused', async () => {
  const result = await kaigen([file('config.json', JSON.stringify({ deploy: GITHUB }))]);
  assert.deepEqual(result.engine?.licences, ['kaigen']);
  assert.ok(blockers(result).includes('credential-in-file'), JSON.stringify(result.findings));
  assert.equal(result.ok, false);
});

test('a stamp outside a recognised Kaigen build is noted as copied, not as normal', async () => {
  const result = await preflight([file('index.html', '<canvas></canvas><script src="a.js"></script>'), file('a.js', `const s=${JSON.stringify(stamp(INGEST))};`)]);
  assert.deepEqual(result.findings.filter((f) => f.code === 'engine-licence-stamp').map((f) => f.title),
    ['Kaigen licence stamp found in a build that is not recognised as a Kaigen export.']);
});

/* The limit, written down so nobody reads the note as more than it is: this check never
   reads a .wasm for keys, so a key inside the stamped module passes here and is refused by
   the server's content scan (test_credential_patterns.py). */
test("a key inside the stamped .wasm is the server's to refuse, not this check's", async () => {
  const keyed = new Uint8Array([...KAIGEN_WASM, ...Buffer.from(`\0${stamp(GITHUB)}\0`)]);
  const result = await preflight([file('index.html', '<canvas id="c"></canvas><script type="module" src="shell.js"></script>'),
    file('shell.js', 'export function createGame(e){return e.wasmUrl}'), file('main_worker.js', KAIGEN.text), module('st/game.wasm', keyed)]);
  assert.equal(result.credentialScan?.files.find((f) => f.path === 'st/game.wasm')?.inspected ?? false, false);
  assert.equal(blockers(result).includes('credential-in-file'), false);
});

test('without a stamp there is no note', async () => {
  const result = await preflight([file('index.html', '<canvas></canvas><script src="a.js"></script>'), file('a.js', 'const a=1;')]);
  assert.equal(result.findings.some((f) => f.code === 'engine-licence-stamp'), false);
});

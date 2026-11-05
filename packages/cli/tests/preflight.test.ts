import test from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { runPreflight, snapshotPreflightFiles } from '../src/preflight';

test('isolated preflight uses the supplied snapshot and returns its finding', async () => {
  const text = '<!doctype html><html><body><canvas></canvas><script>new Phaser.Game({});screen.orientation.lock("portrait");</script></body></html>';
  const result = await runPreflight([{ path: 'index.html', size: Buffer.byteLength(text), text: async () => text }]);
  assert.equal(result.ok, false);
  assert.equal(result.checks.engine, 'inconclusive');
  assert.equal(result.checks.desktop, 'failed');
  assert.ok(result.findings.some(finding => finding.code === 'platform-desktop' && finding.severity === 'blocker'));
});

test('a Phaser export can proceed to runtime review without a static engine refusal', async () => {
  const text = '<!doctype html><script>new Phaser.Game({});</script>';
  const result = await runPreflight([{ path: 'index.html', size: Buffer.byteLength(text), text: async () => text }]);
  assert.equal(result.ok, true);
  assert.equal(result.checks.engine, 'inconclusive');
});

test('a stalled preflight is cancelled without freezing the CLI event loop', async () => {
  let heartbeat = false;
  const timer = setTimeout(() => { heartbeat = true; }, 10);
  const started = performance.now();
  await assert.rejects(runPreflight([{ path: 'index.html', size: 1, text: () => new Promise(() => {}) }], 100),
    (error: { code: string; exitCode: number }) => error.code === 'preflight_unavailable' && error.exitCode === 5);
  clearTimeout(timer);
  assert.equal(heartbeat, true);
  assert.ok(performance.now() - started < 3000);
});

test('a warning about code we ship tells an agent to change nothing', async () => {
  const { localFinding } = await import('../src/archive');
  const ours = localFinding({ code: 'ice-server', severity: 'warning', title: 'peer.js line 1 names the relay eu-0.turn.peerjs.com.', detail: 'Nothing has to change.', path: 'peer.js', line: 1, ours: true });
  assert.equal(ours.fault, 'unknown');
  assert.equal(ours.retry, 'never');
  assert.match(ours.fix, /Nothing has to change/);
  assert.equal(ours.fix.match(/Nothing has to change/g)?.length, 1, 'the fix says it twice');
  const theirs = localFinding({ code: 'ice-server', severity: 'warning', title: 'x', path: 'peer.js', line: 1 });
  assert.equal(theirs.fault, 'game');
});

/* The CLI's own worker, over the bytes it would package: the threads note a creator sees
   before upload has to agree with what the server's scan will put in the receipt, which
   moves the release onto an isolated contract. Both are the shared checker; this proves the
   worker hands it module bytes and decoded .br text, which is where the two new signs live. */
test('the local check sees a threaded build in a worker.js and in a compressed module, and not in a feature detect', async () => {
  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  const memory = (flags: number) => new Uint8Array([...header, 0x02, 0x10, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, flags, 0x01, 0x02]);
  const page = '<!doctype html><html><body><canvas></canvas><script src="game.js"></script></body></html>';
  const check = (files: Record<string, string | Uint8Array>) => runPreflight(snapshotPreflightFiles(new Map(Object.entries(files)
    .map(([path, value]) => [path, typeof value === 'string' ? new TextEncoder().encode(value) : value]))));
  const silent = 'WebAssembly.instantiateStreaming(fetch("game.wasm.br"),{env:{memory:m}});';
  const worker = await check({ 'index.html': page, 'game.js': 'new Worker("game.worker.js");',
    'game.worker.js': 'self.onmessage=e=>{Module["ENVIRONMENT_IS_PTHREAD"]=true;Module["PThread"].receiveObjectTransfer(e.data)};' });
  assert.equal(worker.threaded, true);
  assert.equal(worker.findings.find(row => row.code === 'engine-threads')?.path, 'game.worker.js');
  const shared = await check({ 'index.html': page, 'game.js': silent, 'game.wasm.br': new Uint8Array(brotliCompressSync(memory(0x03))) });
  assert.equal(shared.threaded, true);
  assert.equal(shared.findings.find(row => row.code === 'engine-threads')?.path, 'game.wasm.br');
  const plain = await check({ 'index.html': page, 'game.js': silent, 'game.wasm.br': new Uint8Array(brotliCompressSync(memory(0x01))) });
  assert.notEqual(plain.threaded, true);
  const probe = await check({ 'index.html': page, 'game.js': 'class WebGLRenderer{} const ok = typeof SharedArrayBuffer !== "undefined" && crossOriginIsolated;' });
  assert.equal(probe.threaded, false);
});

/* What real Godot web exports look like to the check, from builds made on 22 Oct 2026 with
   the official Godot 4.5.1 and 3.6.2 editors and export templates. The snippets and the pack headers
   below are copied byte for byte from those exports, so each case is a thing a real
   engine wrote rather than a thing somebody expected it to. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '@opengame/shared';
import { engineFindings, encryptedPckFindings, withGodotPckVersion } from '../src/engine-findings';
import { readFileSync } from 'node:fs';
import { ENGINE_NAMES, godotPackOrder, godotPckVersion, type EngineId, type EngineReport } from '../src/engines';
import { preflight, type PreflightFile } from '../src/index';

// Godot 4.5.1, index.js, Engine.installServiceWorker.
const GODOT4_REGISTER = `const Engine={installServiceWorker:function(){if(this.config.serviceWorker&&'serviceWorker' in navigator){try{return navigator.serviceWorker.register(this.config.serviceWorker)}catch(e){return Promise.reject(e)}}return Promise.resolve()}};`;
// Godot 3.6.2, index.js, after callMain.
const GODOT3_REGISTER = `me.rtenv['callMain'](me.config.args);initPromise=null;if(me.config.serviceWorker&&'serviceWorker' in navigator){navigator.serviceWorker.register(me.config.serviceWorker);}resolve();`;
// Godot 4.5.1, index.html shell: the PWA branch, which only ever calls the guarded hook.
const GODOT4_SHELL = `<script>const GODOT_CONFIG = {"executable":"index","fileSizes":{"index.pck":3160}};const GODOT_THREADS_ENABLED = false;if (GODOT_CONFIG['serviceWorker'] && 'serviceWorker' in navigator) { navigator.serviceWorker.getRegistration().then(() => engine.installServiceWorker()); }</script>`;

const report = (id: EngineId): EngineReport => ({ id, name: ENGINE_NAMES[id], version: null, evidence: 'index.pck, index.wasm and the loader in index.html', also: [] });
const codes = (engine: EngineId, sources: { path: string; text: string }[], paths: string[] = sources.map(s => s.path)) =>
  engineFindings(paths, sources, report(engine)).map(row => row.code);

test('Godot\'s guarded PWA hook is not a service worker; a real registration still is', () => {
  for (const text of [GODOT4_REGISTER, GODOT3_REGISTER]) {
    assert.deepEqual(codes('godot', [{ path: 'index.js', text }, { path: 'index.html', text: GODOT4_SHELL }]), []);
    // The exemption belongs to Godot: the same line in a bundle nobody identified counts.
    assert.ok(codes('custom', [{ path: 'index.js', text }]).includes('engine-service-worker'));
  }
  // Somebody else's registration inside a Godot export is still a registration, and the
  // finding names the file it is in rather than the first that mentions serviceWorker.
  const rows = engineFindings(['index.js', 'boot.js'], [{ path: 'index.js', text: GODOT4_REGISTER }, { path: 'boot.js', text: 'navigator.serviceWorker.register("sw.js");' }], report('godot'));
  assert.equal(rows.find(row => row.code === 'engine-service-worker')?.path, 'boot.js');
  assert.ok(codes('godot', [{ path: 'index.js', text: 'window.navigator.serviceWorker.register(cfg.worker);' }]).includes('engine-service-worker'));
  // A PWA export ships its worker, so the file alone is enough for both findings.
  const pwa = codes('godot', [{ path: 'index.js', text: GODOT4_REGISTER }, { path: 'index.html', text: GODOT4_SHELL.replace('"executable"', '"serviceWorker":"index.service.worker.js","executable"') }],
    ['index.js', 'index.html', 'index.service.worker.js']);
  assert.ok(pwa.includes('engine-service-worker') && pwa.includes('godot-pwa'));
});

test('Godot\'s guarded register still counts once anything names a worker, whatever it is called', () => {
  // The dodge a review found: arm Godot's own guard with a worker no file-name rule knows.
  for (const named of [
    GODOT4_SHELL.replace('"executable"', '"serviceWorker":"boot.js","executable"'),
    '<script>const engine = new Engine({ ...GODOT_CONFIG, serviceWorker: "cache/x.js" });</script>',
    '<script>GODOT_CONFIG.serviceWorker = "offline";</script>',
    '<script>GODOT_CONFIG["serviceWorker"] = location.hash.slice(1);</script>',
  ]) {
    const rows = engineFindings(['index.js', 'index.html', 'boot.js'], [{ path: 'index.js', text: GODOT4_REGISTER }, { path: 'index.html', text: named }], report('godot'));
    assert.equal(rows.find(row => row.code === 'engine-service-worker')?.path, 'index.html', named);
  }
  // Outside the guard, the config argument is an ordinary registration.
  assert.ok(codes('godot', [{ path: 'index.js', text: 'const config={};navigator.serviceWorker.register(this.config.serviceWorker);' }]).includes('engine-service-worker'));
  assert.ok(codes('godot', [{ path: 'index.js', text: 'if (ready) { navigator.serviceWorker.register(me.config.serviceWorker); }' }]).includes('engine-service-worker'));
  // Inside the guard, any other argument is too.
  assert.ok(codes('godot', [{ path: 'index.js', text: 'if (me.config.serviceWorker) { navigator.serviceWorker.register("w.js"); }' }]).includes('engine-service-worker'));
  // Godot's own defaults, the empty EngineConfig value and its parse() copy, name nothing.
  const defaults = `const C={serviceWorker: '',};function f(){this.serviceWorker = parse('serviceWorker', this.serviceWorker);}${GODOT4_REGISTER}`;
  assert.deepEqual(codes('godot', [{ path: 'index.js', text: defaults }, { path: 'index.html', text: GODOT4_SHELL }]), []);
});

type Case = { name: string; paths: string[]; sources: { path: string; text: string }[]; heads: Record<string, string>; order: string[]; version: string | null; from: string | null };
const PARITY: Case[] = JSON.parse(readFileSync(new URL('./fixtures/godot-pack-order.json', import.meta.url), 'utf8')).cases;

test('pack order and version match the shared fixture engines.py reads too', async () => {
  for (const row of PARITY) {
    assert.deepEqual(godotPackOrder(row.paths, row.sources), row.order, row.name);
    const reads: string[] = [];
    const files: PreflightFile[] = row.paths.map(path => ({ path, size: 1 << 30, text: async () => { throw new Error('binary'); },
      // The whole-file reader must never be used for this.
      bytes: async () => { throw new Error(`whole read of ${path}`); },
      ...(row.heads[path] === undefined ? {} : { head: async (n: number) => { reads.push(`${path}:${n}`); return Uint8Array.from(Buffer.from(row.heads[path]!, 'hex')); } }) }));
    const result = await withGodotPckVersion(report('godot'), files, row.sources);
    assert.equal(result.version, row.version, row.name);
    if (row.from) assert.match(result.evidence, new RegExp(`version from the ${row.from.replace(/[.]/g, '\\.')} header$`), row.name);
    assert.ok(reads.every(read => read.endsWith(':20')), row.name);
  }
});

// The first 20 bytes of each real index.pck.
const PCK_451 = Uint8Array.from([0x47, 0x44, 0x50, 0x43, 3, 0, 0, 0, 4, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0]);
const PCK_362 = Uint8Array.from([0x47, 0x44, 0x50, 0x43, 1, 0, 0, 0, 3, 0, 0, 0, 6, 0, 0, 0, 2, 0, 0, 0]);
const header = (format: number, major: number, minor: number, patch: number) => {
  const bytes = new Uint8Array(24); bytes.set([0x47, 0x44, 0x50, 0x43]);
  const view = new DataView(bytes.buffer);
  [format, major, minor, patch].forEach((value, i) => view.setUint32(4 + 4 * i, value, true));
  return bytes;
};

test('the .pck header gives the Godot version and tells 3.x from 4.x', () => {
  assert.equal(godotPckVersion(PCK_451), '4.5.1');
  assert.equal(godotPckVersion(PCK_362), '3.6.2');
  assert.equal(godotPckVersion(header(2, 4, 3, 0)), '4.3.0');
  // 4.7.2's real export header, read on 5 Nov 2026: GDPC 04000000 04000000 07000000 02000000.
  assert.equal(godotPckVersion(header(4, 4, 7, 2)), '4.7.2');
  assert.equal(godotPckVersion(header(5, 4, 8, 0)), null);
  // Format and major have to agree, as they do in everything Godot writes.
  assert.equal(godotPckVersion(header(1, 4, 5, 1)), null);
  assert.equal(godotPckVersion(header(3, 3, 6, 2)), null);
  assert.equal(godotPckVersion(header(4, 5, 0, 0)), null);
  assert.equal(godotPckVersion(header(3, 4, 4000, 1)), null);
  assert.equal(godotPckVersion(PCK_451.subarray(0, 19)), null);
  assert.equal(godotPckVersion(Uint8Array.from([0x50, 0x4b, 3, 4, ...PCK_451.subarray(4)])), null);
});

const text = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const pack = (bytes: Uint8Array): PreflightFile => ({ path: 'index.pck', size: 3160, text: async () => { throw new Error('binary'); }, head: async n => bytes.slice(0, n) });
const wasm: PreflightFile = { path: 'index.wasm', size: 8, text: async () => { throw new Error('binary'); } };
const exportOf = (bytes: Uint8Array) => [text('index.html', `<!doctype html><html><body><canvas id="canvas"></canvas><script src="index.js"></script>${GODOT4_SHELL}</body></html>`),
  text('index.js', `var Godot=(()=>{function GodotRuntime(){}return GodotRuntime})();${GODOT4_REGISTER}`), wasm, pack(bytes)];

test('a checked Godot export carries the version from its pack', async () => {
  for (const [bytes, version] of [[PCK_451, '4.5.1'], [PCK_362, '3.6.2']] as const) {
    const result = await preflight(exportOf(bytes));
    assert.equal(result.engine?.id, 'godot');
    assert.equal(result.engine?.version, version);
    assert.match(result.engine?.evidence ?? '', /version from the index\.pck header/);
    assert.ok(!result.findings.some(row => row.code === 'engine-service-worker'));
  }
  // Something that only looks like a pack leaves the version unknown and nothing else changes.
  assert.equal((await preflight(exportOf(header(9, 4, 5, 1)))).engine?.version, null);
  // A second engine in the bundle still gets its Godot version in `also`.
  const also = await withGodotPckVersion({ ...report('threejs'), also: [{ id: 'godot', name: 'Godot', version: null, evidence: 'x' }] }, [pack(PCK_451)], []);
  assert.equal(also.also[0]?.version, '4.5.1');
});

test('a threaded Godot export gets the one threads message: an isolated contract, chosen from the scan', () => {
  const rows = engineFindings(['index.html'], [{ path: 'index.html', text: GODOT4_SHELL.replace('GODOT_THREADS_ENABLED = false', 'GODOT_THREADS_ENABLED = true') }], report('godot'));
  const row = rows.find(r => r.code === 'engine-threads');
  assert.equal(row?.severity, 'note');
  assert.equal(row!.detail, engineFindings([], [{ path: 'a.js', text: 'new SharedArrayBuffer(8)' }], report('custom')).find(r => r.code === 'engine-threads')!.detail);
  assert.doesNotMatch(row!.detail!, /Thread Support off/);
  assert.deepEqual(engineFindings(['index.html'], [{ path: 'index.html', text: GODOT4_SHELL }], report('godot')).filter(r => r.code === 'engine-threads'), []);
});

test('an encrypted pack from Godot 4.4 on (format 3) is reported too', async () => {
  const bytes = header(3, 4, 5, 1);
  new DataView(bytes.buffer).setUint32(20, 3, true);
  assert.deepEqual((await encryptedPckFindings([pack(bytes)])).map(row => row.code), ['godot-pck-encrypted']);
  new DataView(bytes.buffer).setUint32(20, 2, true);
  assert.deepEqual(await encryptedPckFindings([pack(bytes)]), []);
});

test('an encrypted pack from Godot 4.7 (format 4) is reported too', async () => {
  const bytes = header(4, 4, 7, 2);
  new DataView(bytes.buffer).setUint32(20, 3, true);
  assert.deepEqual((await encryptedPckFindings([pack(bytes)])).map(row => row.code), ['godot-pck-encrypted']);
  new DataView(bytes.buffer).setUint32(20, 2, true);
  assert.deepEqual(await encryptedPckFindings([pack(bytes)]), []);
});

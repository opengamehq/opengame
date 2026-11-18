import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, formatBytes } from '@opengame/shared';
import { bootDownloadFindings } from '../src/engine-findings';

const MB = 1_000_000;
/* The line and the note's threshold, read from limits.json so these cases follow it. */
const noteBytes = (LIMITS.performance.bootDownloadNoteSeconds * LIMITS.performance.bootDownloadMbps * MB) / 8;

test('a small boot says nothing', () => {
  assert.deepEqual(bootDownloadFindings([{ path: 'index.wasm', size: 4 * MB }, { path: 'index.pck', size: 2 * MB }], new Set(['godot'])), []);
});

test('a Godot export is estimated from its wasm in transit and its pck whole, with Godot advice', () => {
  const [row, ...rest] = bootDownloadFindings([
    { path: 'index.html', size: 5_000 }, { path: 'index.wasm', size: 39_500_000 }, { path: 'index.pck', size: 12 * MB },
    { path: 'music/theme.ogg', size: 40 * MB },
  ], new Set(['godot']));
  assert.equal(rest.length, 0);
  assert.equal(row?.code, 'boot-download');
  assert.equal(row?.severity, 'note');
  assert.equal(row?.path, 'index.pck', 'the biggest file on the wire leads, not the biggest stored');
  const wire = 12 * MB + Math.round(39_500_000 * LIMITS.performance.wasmTransitRatio);
  assert.match(row!.title, new RegExp(`up to about ${Math.round((wire * 8) / (LIMITS.performance.bootDownloadMbps * MB))} s on a ${LIMITS.performance.bootDownloadMbps} Mbps`),
    'a plain .pck is compressed on the way by an unknown amount, so the estimate says it is a ceiling');
  assert.match(row!.detail!, /In Godot/);
  assert.doesNotMatch(row!.detail!, /theme\.ogg/, 'media a game streams later is not counted');
});

test('a compressed twin stands for its plain file, and is counted at its stored size', () => {
  const files = [{ path: 'Build/game.wasm', size: 140 * MB }, { path: 'Build/game.wasm.br', size: 26 * MB }];
  const [row] = bootDownloadFindings(files, new Set(['unreal']));
  assert.ok(row);
  assert.ok(row.detail!.includes(`Build/game.wasm.br (about ${formatBytes(26 * MB)})`));
  assert.doesNotMatch(row.detail!, /Build\/game\.wasm \(/);
  assert.match(row.detail!, /In Unreal/);
});

test('a Unity build counts its stored Brotli data, wasm and framework', () => {
  const [row] = bootDownloadFindings([
    { path: 'Build/web.data.br', size: 30 * MB }, { path: 'Build/web.wasm.br', size: 8 * MB },
    { path: 'Build/web.framework.js.br', size: 100_000 }, { path: 'Build/web.loader.js', size: 30_000 },
  ], new Set(['unity']));
  assert.ok(row);
  assert.ok(row.title.includes(`about ${formatBytes(38 * MB + 100_000)} on the wire`));
  assert.match(row.detail!, /In Unity/);
});

test('the threshold is the line, not a size', () => {
  const at = Math.ceil(noteBytes);
  assert.equal(bootDownloadFindings([{ path: 'a.data', size: at - 1_000 }], new Set()).length, 0);
  const [row] = bootDownloadFindings([{ path: 'a.data', size: at + 1_000 }], new Set());
  assert.ok(row);
  assert.match(row.detail!, /after the game starts/);
});

test('a file with both a .br and a .gz twin is counted once, as the .br og-games sends', () => {
  const [row] = bootDownloadFindings([
    { path: 'Build/game.wasm', size: 140 * MB }, { path: 'Build/game.wasm.gz', size: 22 * MB }, { path: 'Build/game.wasm.br', size: 26 * MB },
  ], new Set(['emscripten']));
  assert.ok(row);
  assert.ok(row.title.includes(`about ${formatBytes(26 * MB)} on the wire`), row.title);
  assert.doesNotMatch(row.detail!, /game\.wasm\.gz/, 'the .br is sent even where the .gz is smaller');
  assert.doesNotMatch(row.title, /up to/, 'every file counted is stored compressed, so this is not a ceiling');
});

test('Unreal containers are left out, since the engine reads them by range', () => {
  const files = [
    { path: 'Game/Binaries/Wasm/Game-Wasm-Shipping.wasm.br', size: 26 * MB },
    { path: 'Game/Content/Paks/pakchunk0-Wasm.ucas', size: 37 * MB },
    { path: 'Game/Content/Paks/pakchunk0-Wasm.pak', size: 9_100_000 }, { path: 'Game/Content/Paks/pakchunk0-Wasm.pak.br', size: 7_700_000 },
  ];
  const [row] = bootDownloadFindings(files, new Set(['unreal']));
  assert.ok(row);
  assert.ok(row.title.includes(`about ${formatBytes(26 * MB)} on the wire`), row.title);
  assert.doesNotMatch(row.detail!, /pakchunk/);
  assert.match(row.detail!, /In Unreal/);
});

/* A Unity build whose .data goes through the asset plan (Greptile on the public mirror's #19):
   the plan changes how the file is uploaded, not whether Unity's loader waits for it, so the
   first-download note counts it on both checks that see it, the platform's (which has the
   declared row) and the CLI's (which has the name, and the size it measured on disk). */
test('a Unity build counts a .data sent through the asset plan, on the platform and in the CLI', async () => {
  const { preflight } = await import('../src/index');
  const { platformPreflight } = await import('../src/platform');
  const text = (path: string, body: string) => ({ path, size: Buffer.byteLength(body), text: async () => body });
  const unity = () => [
    text('index.html', '<script src="Build/web.loader.js"></script><script>createUnityInstance(canvas, {dataUrl:"Build/web.data"})</script>'),
    text('Build/web.loader.js', 'function createUnityInstance() {}'),
    text('Build/web.framework.js', 'var unityFramework = function () {};'),
    { path: 'Build/web.wasm', size: 8, text: async () => { throw Error('binary'); } },
  ];
  const dataBytes = 60 * MB;
  const row = { path: 'Build/web.data', byteSize: dataBytes, sha256: 'a'.repeat(64) };
  const unread = { path: row.path, size: dataBytes,
    text: async () => { throw Error('external bytes must remain unread'); }, bytes: async () => { throw Error('external bytes must remain unread'); } };
  const expected = `about ${formatBytes(dataBytes + Buffer.byteLength('var unityFramework = function () {};') + Math.round(8 * LIMITS.performance.wasmTransitRatio))}`;

  const platform = await platformPreflight([...unity(), unread], { externalAssets: [row] });
  const platformNote = platform.findings.find(finding => finding.code === 'boot-download');
  assert.ok(platformNote, 'the platform check counts the external .data');
  assert.equal(platformNote.path, row.path);
  assert.match(platformNote.title, /up to about/, 'a plain .data is compressed on the way by an unknown amount');

  const cli = await preflight(unity(), { authoritative: true, externalPaths: [row.path], externalSizes: { [row.path]: dataBytes } });
  const cliNote = cli.findings.find(finding => finding.code === 'boot-download');
  assert.ok(cliNote, 'the CLI check counts the external .data from its measured size');
  assert.equal(cliNote.path, row.path);
  assert.ok(cliNote.title.includes(expected.replace('about', 'up to about')), cliNote.title);
  assert.ok(dataBytes > noteBytes, 'the case is above the note on its .data alone');

  const unmeasured = await preflight(unity(), { authoritative: true, externalPaths: [row.path] });
  assert.equal(unmeasured.findings.find(finding => finding.code === 'boot-download'), undefined,
    'a name with no size is not counted at a guess');
});

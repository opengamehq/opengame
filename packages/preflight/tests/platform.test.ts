import test from 'node:test';
import assert from 'node:assert/strict';
import { platformPreflight } from '../src/platform';
import type { PreflightFile } from '../src/index';
import { gzipSync } from 'node:zlib';
import { compressedTextReaders } from '../src/node-compression';

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const page = '<!doctype html><html><body><canvas id="game"></canvas><script src="game.js"></script></body></html>';
const inspect = (code: string, html = page) => platformPreflight([file('index.html', html), file('game.js', code)]);

test('source engine names cannot certify or refuse browser exports', async () => {
  assert.equal((await inspect('class WebGLRenderer {} const REVISION="test";')).checks.engine, 'inconclusive');
  assert.equal((await inspect('console.log("hello");')).checks.engine, 'inconclusive');
  const other = await inspect('new Phaser.Game({});');
  assert.equal(other.checks.engine, 'inconclusive');
  assert.equal(other.ok, true);
  assert.equal((await inspect('class WebGLRenderer {} const REVISION=1; new Phaser.Game({});')).checks.engine, 'inconclusive');
  assert.equal((await inspect('// new Phaser.Game({});\nconsole.log("hello");')).checks.engine, 'inconclusive');
});

test('portrait locks fail, ambiguous touch input requires review', async () => {
  assert.equal((await inspect('screen.orientation.lock("portrait-primary");')).checks.desktop, 'failed');
  assert.equal((await inspect('window.addEventListener("touchstart",()=>{});')).checks.desktop, 'inconclusive');
  assert.equal((await inspect('window.addEventListener("touchstart",()=>{}); window.addEventListener("keydown",()=>{});')).checks.desktop, 'passed');
  assert.equal((await inspect('', page.replace('<canvas id="game">', '<canvas width="320" height="640">'))).checks.desktop, 'inconclusive');
  for (const canvas of ['<canvas data-width="320" data-height="640" width="640" height="320">', '<canvas data-note=" width=320 height=640" width="640" height="320">']) {
    assert.equal((await inspect('', page.replace('<canvas id="game">', canvas))).checks.desktop, 'passed');
  }
  assert.equal((await inspect('// screen.orientation.lock("portrait");')).checks.desktop, 'passed');
});

test('authoritative preflight does not skip a large script or unreadable text', async () => {
  const padded = ' '.repeat(2 * 1024 * 1024 + 1) + 'const credential="AKIAABCDEFGHIJKLMNOP";';
  const result = await inspect(padded);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === 'credential-in-file'));
  const unreadable = await platformPreflight([file('index.html', page), { path: 'game.js', size: 1, text: async () => { throw new Error('unreadable'); } }]);
  assert.equal(unreadable.ok, false);
  assert.ok(unreadable.findings.some((finding) => finding.code === 'unreadable-file'));
});

test('normalized nested roots use the same engine and desktop checks', async () => {
  const result = await platformPreflight([file('dist/index.html', page), file('dist/game.js', 'new Phaser.Game({});')]);
  assert.equal(result.strippedRoot, 'dist/');
  assert.equal(result.checks.engine, 'inconclusive');
});

test('prose, strings and inert HTML are not executable eligibility evidence', async () => {
  for (const code of [
    'const help = "new Phaser.Game({})";',
    'const help = "createUnityInstance({}, {}); new Engine(GODOT_CONFIG);";',
    '// createUnityInstance({}, {}); new Engine(GODOT_CONFIG); screen.orientation.lock("portrait");',
    'const help = `screen.orientation.lock("portrait")`;',
  ]) {
    const result = await inspect(code);
    assert.equal(result.checks.engine, 'inconclusive', 'source names provide no runtime compatibility result');
    assert.equal(result.checks.desktop, 'passed', 'inert orientation prose cannot require portrait mode');
    assert.equal(result.ok, true, 'inert engine names cannot stop a runtime playtest');
  }
  for (const html of [
    '<p>new Phaser.Game({}); screen.orientation.lock("portrait")</p>',
    '<script type="application/ld+json">{"example":"new Phaser.Game({})"}</script>',
    '<p>createUnityInstance({}, {}); new Engine(GODOT_CONFIG); screen.orientation.lock("portrait")</p>',
    '<script type="application/ld+json">{"example":"createUnityInstance({}, {}); new Engine(GODOT_CONFIG);"}</script>',
    '<!-- createUnityInstance({}, {}); new Engine(GODOT_CONFIG); screen.orientation.lock("portrait") -->',
    '<template><canvas width="320" height="640"></canvas></template>',
  ]) {
    const result = await inspect('', page.replace('<canvas id="game"></canvas>', html));
    assert.equal(result.checks.engine, 'inconclusive', 'inert HTML cannot certify a working engine export');
    assert.equal(result.checks.desktop, 'passed', 'only executable orientation locks are eligibility evidence');
    assert.equal(result.ok, true, 'inert engine names cannot create a blocker');
  }
  const active = await inspect('screen.orientation.lock("portrait");');
  assert.equal(active.checks.engine, 'inconclusive');
  assert.equal(active.checks.desktop, 'failed');
  assert.equal(active.ok, false, 'an actual mandatory portrait lock remains a compatibility blocker');
});

test('warnings cannot hide a blocking origin after the display cutoff', async () => {
  const links = Array.from({ length: 10 }, (_, n) => `<a href="https://example${n}.com">Credit</a>`).join('');
  // Plain http, which is still refused on every contract: the page is https.
  const result = await inspect('fetch("http://blocked.example.com/data");', page.replace('<canvas id="game"></canvas>', links));
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === 'outbound-origin' && finding.severity === 'blocker'));
  // And a blocked service behind ten link warnings to blocked services.
  const tips = Array.from({ length: 10 }, (_, n) => `<a href="https://ko-fi.com/c${n}">Tip</a>`).join('\n');
  const stripe = await inspect('fetch("https://api.stripe.com/v1/charges");', page.replace('<canvas id="game"></canvas>', tips));
  assert.equal(stripe.ok, false);
  assert.ok(stripe.findings.some((finding) => finding.code === 'blocked-service' && finding.severity === 'blocker'));
});

test('dense large source has bounded reference work and still checks its last bytes', { timeout: 15000 }, async () => {
  const code = ('/* a library example: "missing.png" */\nvoid "pixel.png";\n').repeat(45000)
    + '\nconst credential="AKIAABCDEFGHIJKLMNOP";';
  const started = performance.now();
  const result = await inspect(code);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === 'credential-in-file'));
  assert.ok(performance.now() - started < 10000);
});


test('secondary canvases and partially parsed bundles do not falsely reject a game', async () => {
  const html = page.replace('<canvas id="game"></canvas>', '<canvas width="1280" height="720"></canvas><canvas hidden width="256" height="512"></canvas>');
  assert.equal((await inspect('', html)).checks.desktop, 'passed');
  const partial = await platformPreflight([file('index.html', page), file('game.js', 'new Phaser.Game({});'), file('unknown.js', 'unexpected syntax ???')]);
  assert.equal(partial.checks.engine, 'inconclusive');
  const classic = await inspect('with (window) { console.log("classic"); } class WebGLRenderer {} const REVISION=1;');
  assert.equal(classic.checks.engine, 'inconclusive');
});

test("credential coverage is explicit and an unreadable file cannot pass", async () => {
  const files = [
    { path: "index.html", size: 40, text: async () => "<html><body><canvas></canvas></body></html>" },
    { path: "data.json", size: 2, text: async () => "{}" },
  ];
  const complete = await platformPreflight(files);
  assert.equal(complete.checks.secrets, "passed");
  assert.deepEqual(complete.credentialScan, { policyVersion: "1", complete: true, expectedFiles: 2, inspectedFiles: 2, blocked: false,
    files: files.map(file => ({ path: file.path, required: true, inspected: true })) });
  files[1].text = async () => { throw new Error("unreadable"); };
  const incomplete = await platformPreflight(files);
  assert.equal(incomplete.checks.secrets, "inconclusive");
  assert.equal(incomplete.credentialScan?.complete, false);
  assert.equal(incomplete.credentialScan?.inspectedFiles, 1);
});


test("credential inventory accounts for binary assets without claiming they were read as text", async () => {
  const result = await platformPreflight([file("index.html", page),
    { path: "cover.png", size: 100, text: async () => { throw new Error("binary asset must not be read"); } }]);
  assert.equal(result.credentialScan?.complete, true);
  assert.equal(result.credentialScan?.expectedFiles, 1);
  assert.deepEqual(result.credentialScan?.files.find(row => row.path === "cover.png"), { path: "cover.png", required: false, inspected: false });
});

test('an image format the server cannot read is refused locally with the server code', async () => {
  const binary = (path: string): PreflightFile => ({ path, size: 4, bytes: async () => new Uint8Array([0, 0, 0, 0]), text: async () => { throw Error('binary'); } });
  const result = await platformPreflight([file('index.html', page), file('game.js', 'class WebGLRenderer {} const REVISION="x";'), binary('art/sky.HEIC'), binary('art/ok.ktx2'),
    // KTX1 is what Kaigen cooks to; the server decodes BC, ASTC and plain pixels in it.
    binary('cooked/rock_bc7.ktx'), binary('cooked/rock_astc.KTX')]);
  assert.equal(result.ok, false);
  assert.equal(result.checks.preflight, 'failed');
  const findings = result.findings.filter(row => row.code === 'image_format_unsupported');
  assert.deepEqual(findings.map(row => row.path), ['art/sky.HEIC']);
  assert.match(findings[0]!.detail, /Convert art\/sky\.HEIC to PNG, JPEG or WebP/);
});

test('a KTX1 texture in a format the server cannot decode is refused at check time', async () => {
  const header = (internal: number, type = 0, format = 0) => {
    const bytes = new Uint8Array(64 + 4 + 16);
    bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    [0x04030201, type, type ? 1 : 0, format, internal, format || 0x1908, 4, 4, 0, 0, 1, 1, 0].forEach((v, i) => view.setUint32(12 + i * 4, v, true));
    return bytes;
  };
  const ktx1 = (path: string, internal: number, type = 0, format = 0): PreflightFile => {
    const bytes = header(internal, type, format);
    return { path, size: bytes.length, bytes: async () => bytes, text: async () => { throw Error('binary'); } };
  };
  // Precompressed, through the same decoder the CLI and the pipeline use.
  const decode = compressedTextReaders(() => 0);
  const gzipped = (path: string, internal: number): PreflightFile => {
    const bytes = new Uint8Array(gzipSync(header(internal)));
    return { path, size: bytes.length, bytes: async () => bytes, text: async () => { throw Error('binary'); },
      decodedText: decode(path, bytes.length, async () => bytes) };
  };
  const result = await platformPreflight([file('index.html', page), file('game.js', 'const x=1;'),
    ktx1('t/bc7.ktx', 0x8e8d), ktx1('t/astc.ktx', 0x93b0), ktx1('t/rgba8.ktx', 0x8058, 0x1401, 0x1908),
    ktx1('t/etc2.ktx', 0x9274), ktx1('t/pvrtc.ktx', 0x8c02), ktx1('t/etc2_as_rgba.ktx', 0x9274, 0x1401, 0x1908),
    gzipped('t/etc2z.ktx.gz', 0x9274), gzipped('t/bc7z.ktx.gz', 0x8e8d)]);
  assert.deepEqual(result.findings.filter(row => row.code === 'image_format_unsupported').map(row => row.path),
    ['t/etc2.ktx', 't/pvrtc.ktx', 't/etc2_as_rgba.ktx', 't/etc2z.ktx.gz']);
  // ETC is told why and what to ship instead; any other format keeps the conversion advice.
  const detail = (path: string) => result.findings.find(row => row.path === path && row.code === 'image_format_unsupported')?.detail ?? '';
  for (const path of ['t/etc2.ktx', 't/etc2_as_rgba.ktx', 't/etc2z.ktx.gz']) {
    assert.match(detail(path), /no ETC decoder/);
    assert.match(detail(path), /BC and ASTC/);
    assert.doesNotMatch(detail(path), /PNG/);
  }
  assert.match(detail('t/pvrtc.ktx'), /Ship it as BC1-5, BC7 or ASTC/);
});

test('external ICE findings are unchanged by SDK-looking markers in the same or another file', async () => {
  const { preflight } = await import('../src/index');
  const html = '<!doctype html><html><body><script type="module" src="sdk.js"></script><script type="module" src="peer.js"></script></body></html>';
  const peer = 'const config = { iceServers: [{ urls: "turn:relay.mygame.example:3478" }] };';
  const relayFindings = (result: Awaited<ReturnType<typeof preflight>>) => result.findings.filter(finding => finding.code === 'ice-server');
  const baseline = relayFindings(await preflight([file('index.html', html), file('sdk.js', 'export {};'), file('peer.js', peer)]));
  assert.equal(baseline.length, 1);
  assert.equal(baseline[0]!.severity, 'warning', 'a bundled default alone is not proof that the game connects to it');
  assert.equal(baseline[0]!.ours, undefined);
  assert.doesNotMatch(baseline[0]!.detail ?? '', /Nothing has to change/);
  for (const sdk of ['throw new Error("relay_unavailable");', '// relay_unavailable', 'const marker = "relay_unavailable";']) {
    const split = relayFindings(await preflight([file('index.html', html), file('sdk.js', sdk), file('peer.js', peer)]));
    assert.deepEqual(split, baseline, sdk);
    const sameFile = relayFindings(await preflight([file('index.html', html), file('sdk.js', 'export {};'), file('peer.js', peer + ' ' + sdk)]));
    assert.deepEqual(sameFile, baseline, sdk);
    const reversed = relayFindings(await preflight([file('index.html', html), file('peer.js', peer), file('sdk.js', sdk)]));
    assert.deepEqual(reversed, baseline, sdk);
  }
});

test('configured ICE destinations stay allowed while foreign destinations remain visible offline', async () => {
  const { preflight } = await import('../src/index');
  const { LIMITS } = await import('@opengame/shared');
  const configured = LIMITS.platform.sdk.roomStunUrls.map(url => JSON.stringify(url)).join(',');
  const result = await preflight([file('index.html', page), file('game.js', `const marker = "relay_unavailable"; const urls = [${configured}, "stun:stun.l.google.com:19302", "turns:relay.example.com:443"];`)]);
  const relays = result.findings.filter(finding => finding.code === 'ice-server');
  assert.equal(relays.length, 2);
  // A relay of the game's own choosing is the warning; a library's public default is a note.
  assert.deepEqual(relays.filter(finding => finding.severity === 'warning').map(finding => finding.title),
    ['game.js line 1 names the relay relay.example.com.']);
  assert.match(relays.find(finding => finding.severity === 'note')?.title ?? '', /stun\.l\.google\.com/);
  assert.ok(relays.every(finding => finding.ours === undefined));
});

test('optional account guidance does not block a standalone game or claim lost local saves', async () => {
  const result = await inspect('window.addEventListener("keydown", () => {});');
  const note = result.findings.find(finding => finding.code === 'platform-account');
  assert.equal(note?.severity, 'note');
  assert.match(note?.detail ?? '', /keep local progress/);
  assert.equal(result.ok, true);
});

// 30 Oct 2026: a two-file canvas game read "Custom browser export: custom code. Built
// browser exports from Three.js, Phaser, ... can proceed to review", which says a custom
// export cannot. Any static browser export goes to review; the playtest decides.
test('the engine note says a custom export goes to review too', async () => {
  const plain = await inspect('window.addEventListener("keydown", () => {});');
  const detail = plain.findings.find(finding => finding.code === 'platform-engine')?.detail ?? '';
  assert.match(detail, /any engine, or none, go to review/);
  assert.doesNotMatch(detail, /Built browser exports from/);
});

// A Phaser game was told to "integrate the SDK" it already used, and to "use a
// single-thread export", a setting only wasm builds have (stranger walk, 22 Oct 2026).
test('account and thread advice appear only for games they apply to', async () => {
  const sdk = await inspect('const key = `og:dev:leaderboard:v1:${path}:points`; window.addEventListener("keydown", () => {});');
  assert.equal(sdk.findings.find(finding => finding.code === 'platform-account'), undefined);
  const plain = await inspect('window.addEventListener("keydown", () => {});');
  assert.doesNotMatch(plain.findings.find(finding => finding.code === 'platform-engine')?.detail ?? '', /single-thread/);
  const wasm = await platformPreflight([file('index.html', page), file('game.js', 'window.addEventListener("keydown", () => {});'), file('game.wasm', '\0asm')]);
  assert.match(wasm.findings.find(finding => finding.code === 'platform-engine')?.detail ?? '', /single-thread export/);
  // A threaded export runs on the isolated contract; the advice contradicted the note that
  // says so (Hearthguard, 25 Oct 2026).
  const threaded = await platformPreflight([file('index.html', page), file('game.js', 'window.addEventListener("keydown", () => {}); const m = new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true }); new Worker("w.js");'),
    file('w.js', 'onmessage = () => {};'), file('game.wasm', '\0asm')]);
  assert.ok(threaded.findings.some(finding => finding.code === 'engine-threads'), 'the fixture has to be threaded for this to mean anything');
  assert.doesNotMatch(threaded.findings.find(finding => finding.code === 'platform-engine')?.detail ?? '', /single-thread/);
});

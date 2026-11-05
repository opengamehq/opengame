/* Strings an engine writes into its own runtime that the check read as something the game
   asks for. Each was found on 24 Oct 2026 by submitting a showcase game built in that
   engine, and each snippet below is copied byte for byte from that game's real export:
   Cinderhold (Unity 6), Lanternhill (Godot 4.5.1), Shiftlight (wasm-bindgen). Kaigen's is
   in kaigen-stamp.test.ts, because no Kaigen byte may sit in this repository. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, type PreflightFile } from '../src/index';
import { godotLocated } from '../src/engines';

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const binary = (path: string, bytes = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])): PreflightFile =>
  ({ path, size: bytes.length, bytes: async () => bytes, text: async () => { throw new Error('binary'); } });
const missing = (result: { findings: { code: string; more?: string[] }[] }) =>
  result.findings.find((f) => f.code === 'missing-ref')?.more ?? [];
const origins = (result: { findings: { code: string; severity: string; title: string }[] }) =>
  result.findings.filter((f) => f.code === 'outbound-origin' || f.code === 'blocked-service').map((f) => `${f.severity}: ${f.title}`);
/* The adversarial cases below hid a request behind something read as an anchor. They used
   `evil.example`, which was a blocker while every other host was. Since 2027-03 an ordinary
   host is allowed and only a blocked service is still a blocker, so the cases fetch one: an
   anchor misread now hides a refused tip jar rather than a refused origin, the same hole. */

// Unity 6000.4 Build/<hash>.loader.js, the Brotli error it writes as HTML for its banner.
const UNITY_BROTLI = `n=/Firefox/.test(navigator.userAgent)?"Unable to parse "+m.frameworkUrl+'!<br>If using custom web server, verify that web server is sending .br files with HTTP Response Header "Content-Encoding: br". Brotli compression may not be supported in Firefox over HTTP connections. '+r+' See <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1670675">https://bugzilla.mozilla.org/show_bug.cgi?id=1670675</a> for more information.':"Unable to parse "+m.frameworkUrl;`;

test('Unity\'s own Brotli error is a sentence with a link in it, not a link the creator wrote', async () => {
  const result = await preflight([file('index.html', '<canvas></canvas><script src="Build/x.loader.js"></script>'), file('Build/x.loader.js', UNITY_BROTLI)]);
  assert.deepEqual(origins(result), []);
});

test('a link in a page, or one in a script that no sentence holds, is still reported', async () => {
  const page = await preflight([file('index.html', '<p>Made by <a href="https://bugzilla.mozilla.org/x">me</a></p>')]);
  assert.deepEqual(origins(page), ['warning: index.html line 1 reaches bugzilla.mozilla.org.'], 'a credit in markup is the creator\'s');
  const bare = await preflight([file('index.html', '<script src="a.js"></script>'), file('a.js', `el.innerHTML='<a href="https://ok.example/">https://ok.example/</a>';`)]);
  assert.deepEqual(origins(bare), ['warning: a.js line 1 reaches ok.example.'], 'the visible text is a link too, never a fetch');
});

test('a string that only starts an anchor does not swallow the request after it', async () => {
  // Each was a warning on master and went silent under a looser reading (two reviews, 24 Oct 2026).
  for (const js of [
    "var m='See <a href=';fetch(`https://ko-fi.com/steal`);",
    "var m='See <a href=';new WebSocket(`wss://ko-fi.com/s`);",
    `var m='See <a ';var href="https://ko-fi.com/steal";fetch(href);`,
    "var m='See <a ';location.href='https://ko-fi.com/steal';",
    `var m='See <a ';fetch(href="https://ko-fi.com/steal");`,
    `var m='See <a ';u.href="https://ko-fi.com/steal";`,
    `var m='See <a ';var x=">https://ko-fi.com/steal";fetch(x);`,
    // Automatic semicolon insertion spelling a tag across lines (third review).
    'var count=0,a=1,href\ncount <a\nhref="https://ko-fi.com/steal";fetch(href)',
    "var count=0,a=1,x,href\ncount <a\nx='y>1'\nhref=\"https://ko-fi.com/steal\";fetch(href)",
    "var count=0,a=1,x,href\ncount <a\nx='a<b'\nhref=\"https://ko-fi.com/steal\";fetch(href)",
    'var count=0,a=1\ncount <a\nvar href="https://ko-fi.com/steal";fetch(href)',
    "let count=0,a=1,s\ncount <a\ns='<b>'\nlet href='https://ko-fi.com/steal';fetch(href)",
    // A ternary's or a case's colon read as an attribute name (fourth review).
    'var ok=0,count=2,a=3,href;ok ? count <a : href="https://ko-fi.com/steal"; fetch(href);',
    'var count=2,a=3,href;switch(1){case count <a : href="https://ko-fi.com/steal";fetch(href)}',
    'var ok=0,count=2,a=3;with(location) ok ? count <a : href="https://ko-fi.com/steal";',
    "var ok=0,count=2,a=3;with(location) ok ? count <a\t:\thref='https://ko-fi.com/steal';",
    'var ok=0,count=2,a=3,b={},href;ok ? count <a in b : href="https://ko-fi.com/steal"; fetch(href);',
    // A quoted "value" that is the gap between two strings (fifth review).
    'console.log("See <a href=" ); fetch(">https://ko-fi.com/x".slice(1));',
    'var m="See <a href=";fetch(">https://ko-fi.com/x".slice(1));',
    `var m="See <a href='";fetch('>https://ko-fi.com/x'.slice(1));`,
    'var m="See <a href=";var x=">https://ko-fi.com/x";fetch(x.slice(1));',
    'var m="See <a href=";fetch(">https://ko-fi.com/x".replace(">",""));',
  ]) {
    const result = await preflight([file('index.html', '<script src="a.js"></script>'), file('a.js', js)]);
    assert.ok(origins(result).length > 0, js);
  }
});

test('a bare <a>, or one whose text is not its own href, is not an anchor, so the address is a request', async () => {
  for (const [path, page, js] of [
    ['index.html', '<script>var s="<a>https://ko-fi.com/x";fetch(s.slice(3))</script>', null],
    ['index.html', '<script>var m="See <a href=";fetch(">https://ko-fi.com/x".slice(1));</script>', null],
    ['a.js', '<script src="a.js"></script>', 'var m="<a href=";fetch(">https://ko-fi.com/x".slice(1));'],
  ] as const) {
    const result = await preflight(js ? [file('index.html', page), file(path, js)] : [file(path, page)]);
    assert.ok(origins(result).some((row) => row.startsWith('blocker:')), `${js ?? page}: ${origins(result).join(' | ')}`);
  }
});

test('a credit link in a page stays a warning however its href is written', async () => {
  for (const href of [' https://ex-credit.example/x', '\nhttps://ex-credit.example/x', './go?u=https://ex-credit.example/x', 'https://ex-credit.example/x']) {
    for (const quote of ['"', "'"]) {
      const result = await preflight([file('index.html', `<p>Art by <a class="c" href=${quote}${href}${quote}>them</a></p>`)]);
      assert.deepEqual(origins(result), ['warning: index.html line 1 reaches ex-credit.example.'].map((row) => href.startsWith('\n') ? row.replace('line 1', 'line 2') : row), JSON.stringify(href));
    }
  }
});

test('a fetch on the same line as a link to the same host keeps its blocker', async () => {
  // Minified code is one line, so dedupe used to keep whichever finding came first.
  const js = `var a='<a href="https://ko-fi.com/">x</a>';fetch("https://ko-fi.com/steal");`;
  const result = await preflight([file('index.html', '<script src="a.js"></script>'), file('a.js', js)]);
  assert.equal(result.ok, false, js);
  assert.ok(origins(result).some((row) => row.startsWith('blocker:')), origins(result).join(' | '));
  // Unity's banner links bugzilla in a sentence, which is skipped; a fetch to the same host
  // after it is still read as a request, and an ordinary host's request is a line in the note.
  const unity = await preflight([file('index.html', '<script src="a.js"></script>'), file('a.js', `${UNITY_BROTLI}fetch("https://bugzilla.mozilla.org/steal");`)]);
  assert.match(unity.findings.find((f) => f.code === 'external-hosts')?.title ?? '', /bugzilla\.mozilla\.org/);
});

// Godot 4.5.1 index.js: the template's own names, and the loader that rewrites them.
const GODOT_TEMPLATE = `var wasmBinaryFile;function findWasmBinary(){return locateFile("godot.web.template_release.wasm32.nothreads.wasm")}`
  + `const path=GodotConfig.locate_file("godot.audio.position.worklet.js");`
  + `create:function(channels){const path=GodotConfig.locate_file("godot.audio.worklet.js");}\n`;
const GODOT_LOCATE = `			'locateFile': function (path) {
				if (!path.startsWith('godot.')) {
					return path;
				} else if (path.endsWith('.audio.worklet.js')) {
					return \`\${loadPath}.audio.worklet.js\`;
				} else if (path.endsWith('.audio.position.worklet.js')) {
					return \`\${loadPath}.audio.position.worklet.js\`;
				} else if (path.endsWith('.js')) {
					return \`\${loadPath}.js\`;
				} else if (path in gdext) {
					return path;
				} else if (path.endsWith('.side.wasm')) {
					return \`\${loadPath}.side.wasm\`;
				} else if (path.endsWith('.wasm')) {
					return \`\${loadPath}.wasm\`;
				}
				return path;
			},
`;
const GODOT_SHELL = '<canvas id="canvas"></canvas><script src="index.js"></script><script>const GODOT_CONFIG = {"args":[],"executable":"index","fileSizes":{"index.pck":13082308,"index.wasm":38034280}};const engine = new Engine(GODOT_CONFIG);</script>';
const godot = (extra: PreflightFile[]) => preflight([file('index.html', GODOT_SHELL), file('index.js', GODOT_TEMPLATE + GODOT_LOCATE),
  binary('index.wasm'), binary('index.pck', new Uint8Array(32)), ...extra]);

test('Godot\'s template names are the files its loader asks for under the executable\'s name', async () => {
  const result = await godot([file('index.audio.worklet.js', ''), file('index.audio.position.worklet.js', '')]);
  assert.equal(result.engine?.id, 'godot', JSON.stringify(result.engine));
  assert.deepEqual(missing(result), []);
});

test('a Godot export without its worklet is still told, under the name the loader really asks for', async () => {
  const result = await godot([file('index.audio.position.worklet.js', '')]);
  assert.deepEqual(missing(result), ['index.js:1 → index.audio.worklet.js']);
});

test('the loader\'s mapping follows its own order, and leaves names that are not Godot\'s alone', () => {
  assert.equal(godotLocated('godot.web.template_release.wasm32.nothreads.wasm', 'index'), 'index.wasm');
  assert.equal(godotLocated('godot.audio.position.worklet.js', 'game/index'), 'game/index.audio.position.worklet.js');
  assert.equal(godotLocated('godot.web.template_release.wasm32.side.wasm', 'index'), 'index.side.wasm');
  assert.equal(godotLocated('godot.web.template_debug.wasm32.js', 'index'), 'index.js');
  assert.equal(godotLocated('libgdx.wasm', 'index'), 'libgdx.wasm');
});

test('outside a Godot export, a locateFile name is read as written', async () => {
  const result = await preflight([file('index.html', '<canvas></canvas><script src="boot.js"></script>'),
    file('boot.js', 'function findWasmBinary(){return locateFile("godot.web.template_release.wasm32.nothreads.wasm")}'), binary('index.wasm')]);
  assert.deepEqual(missing(result), ['boot.js:1 → godot.web.template_release.wasm32.nothreads.wasm']);
});

// wasm-bindgen 0.2 --target web, shiftlight.js, the end of __wbg_get_imports.
const WASM_BINDGEN = `    return {
        __proto__: null,
        "./shiftlight_bg.js": import0,
        "./snippets/shiftlight-92e8049e1dcb91a6/js/og.js": import1,
    };
`;

test('wasm-bindgen\'s import keys name modules, not files', async () => {
  const result = await preflight([file('index.html', '<script type="module" src="shiftlight.js"></script>'), file('shiftlight.js', WASM_BINDGEN)]);
  assert.deepEqual(missing(result), []);
});

// Hearthguard's shell.js, a paste handler that wraps text in a File of its own.
test('a File made in memory is named, not fetched', async () => {
  const result = await preflight([file('index.html', '<script src="shell.js"></script>'),
    file('shell.js', '    t.items.add(new File([text], "ks_page.txt", { type: "text/plain" }));\n')]);
  assert.deepEqual(missing(result), []);
});

test('a value, a ternary branch and a call argument are still references', async () => {
  const result = await preflight([file('index.html', '<script src="a.js"></script>'),
    file('a.js', 'const a={sprite:"hero.png"};const b=big?"large.png":"small.png";load("level.json");new Blob([await fetch("data.bin")]);')]);
  assert.deepEqual(missing(result).sort(), ['a.js:1 → data.bin', 'a.js:1 → hero.png', 'a.js:1 → large.png', 'a.js:1 → level.json', 'a.js:1 → small.png']);
});

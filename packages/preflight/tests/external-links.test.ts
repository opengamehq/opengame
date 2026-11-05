import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { platformPreflight } from '../src/platform';
import type { PreflightFile } from '../src/index';

/**
 * `og.openLink(url)` asks the OpenGame page to open a link outside the frame. It is the
 * SDK's documented way to credit somebody, and the game origin fetches nothing for it.
 * A new plain-JS SDK game (Firefly Field, SDK e2e acceptance, 16 Oct 2026) was refused
 * at `opengame check` for `og.openLink('https://example.com/')`.
 */
const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const page = '<!doctype html><html><body><canvas id="game"></canvas><script type="module" src="game.js"></script></body></html>';
const inspect = (code: string) => platformPreflight([file('index.html', page), file('game.js', code)]);
const outbound = async (code: string) => (await inspect(code)).findings.filter((f) => f.code === 'outbound-origin');
/* Since 2027-03 an ordinary https host is allowed, so "read as a request" means one of two
   things: a blocker when the host is a blocked service, or a line in the external-hosts
   note when it is not. The skips below still decide which, so they are still worth
   pinning, and the sharp version of each is the blocked host. */
const blocked = async (code: string) => (await inspect(code)).findings.filter((f) => f.code === 'blocked-service');
const externalNote = async (code: string) => (await inspect(code)).findings.find((f) => f.code === 'external-hosts')?.title ?? '';

test('a literal URL passed to og.openLink is a link, not a request', async () => {
  for (const code of [
    "button.onclick = () => og.openLink('https://example.com/credits');",
    'b.onclick=()=>o.openLink("https://example.com/credits")',
    'const { openLink } = og; openLink( `https://example.com/source` );',
  ]) {
    assert.deepEqual(await outbound(code), [], code);
    assert.equal((await inspect(code)).ok, true, code);
  }
});

test('requests next to an openLink call are still refused', async () => {
  const code = "og.openLink('https://example.com/credits');\nfetch('https://js.stripe.com/v3');\nconst u = openLinkHost + 'https://checkout.stripe.com/x';";
  const found = await blocked(code);
  assert.ok(found.some((f) => f.severity === 'blocker' && f.title.includes('js.stripe.com')));
  assert.ok(found.some((f) => f.severity === 'blocker' && f.title.includes('checkout.stripe.com')));
  assert.ok(!(await inspect(code)).findings.some((f) => f.title.includes(' example.com')));
  assert.equal((await inspect(code)).ok, false);
});

test('a second argument or a fetch named like openLink is not skipped', async () => {
  for (const code of ["fetch('https://js.stripe.com/a', openLink('https://example.com/'));", "myopenLink('https://js.stripe.com/a');"]) {
    const found = await blocked(code);
    assert.ok(found.some((f) => f.severity === 'blocker' && f.title.includes('js.stripe.com')), code);
  }
});

/* The one place a link WORKS. og.openLink opens a real tab outside the frame, which is how
   a tip jar or a checkout would reach a player, so a blocked host there is a blocker even
   though the same address in an <a href> is only a warning. */
test('og.openLink to a blocked service is a blocker, and an anchor to it is a warning', async () => {
  for (const code of ["og.openLink('https://ko-fi.com/me');", 'o.openLink("https://buy.stripe.com/abc")']) {
    const found = await blocked(code);
    assert.equal(found.length, 1, code);
    assert.equal(found[0]!.severity, 'blocker', code);
    assert.match(found[0]!.detail!, /free to play/);
    assert.equal((await inspect(code)).ok, false, code);
  }
  const html = '<!doctype html><html><body><canvas></canvas><a href="https://ko-fi.com/me">Tip me</a><script src="game.js"></script></body></html>';
  const result = await platformPreflight([file('index.html', html), file('game.js', 'start();')]);
  const link = result.findings.filter((f) => f.code === 'blocked-service');
  assert.deepEqual(link.map((f) => [f.severity, f.title]), [['warning', 'index.html line 1 reaches ko-fi.com, a tip jar.']]);
  assert.equal(result.ok, true);
});

/* OG Clash R196 (22 Oct 2026): its catalogue bundles a copy of our limits.json, and two
   values in it, a DNS resolver and the Creative Commons licence URLs, blocked the upload.
   Written by hand in the same minified shape; no text from the game itself. */
const OG_CLASH_DATA = 'var cfg={moderation:{dnsResolver:"https://cloudflare-dns.com/dns-query",textCharsMax:200},'
  + 'licences:{"cc0-1.0":{name:"CC0 1.0",url:"https://creativecommons.org/publicdomain/zero/1.0/",attribution:!1},'
  + '\'cc-by-4.0\':{name:"CC BY 4.0",url:\'https://creativecommons.org/licenses/by/4.0/\',attribution:!0}}};';

test('a URL that is only a value in a data object is allowed, and named in the note', async () => {
  assert.deepEqual(await outbound(OG_CLASH_DATA), []);
  const note = await externalNote(OG_CLASH_DATA);
  assert.match(note, /cloudflare-dns\.com/);
  assert.match(note, /creativecommons\.org/);
  assert.equal((await inspect(OG_CLASH_DATA)).ok, true);
});

test('a blocked service in a data value is a warning, not a blocker', async () => {
  const code = 'var credits={tips:"https://ko-fi.com/maker",art:"https://example.com/art"};';
  const found = await blocked(code);
  assert.deepEqual(found.map((f) => [f.severity, f.title]), [['warning', 'game.js line 1 reaches ko-fi.com, a tip jar.']]);
  assert.equal((await inspect(code)).ok, true);
});

test('a request shape around the same URL is still a blocker', async () => {
  for (const code of [
    'fetch("https://js.stripe.com/dns-query")',
    'const r = "https://js.stripe.com/dns-query";',
    'x.src = "https://ko-fi.com/a.png";',
    'var c={u:"https://ko-fi.com/" + id};',
    'var c={u:`https://ko-fi.com/${id}`};',
    'var c=[{u:"https://ko-fi.com/x"}].map(fetch); fetch({u:1}, "https://js.stripe.com/q")',
    'f({}, "https://js.stripe.com/q", 1)',
    // A data value first must not stand in for a request to the same host after it.
    'var c={u:"https://js.stripe.com/x"};\nfetch("https://js.stripe.com/dns-query")',
  ]) {
    const found = await blocked(code);
    assert.ok(found.some((f) => f.severity === 'blocker'), code);
  }
});

test('an import map in a page is fetched, so its values are requests', async () => {
  const html = (url: string) => `<!doctype html><script type="importmap">{"imports":{"three":"${url}"}}</script><script type="module" src="game.js"></script>`;
  const cdn = await platformPreflight([file('index.html', html('https://unpkg.com/three@0.160.0/build/three.module.js')), file('game.js', 'import "three";')]);
  assert.match(cdn.findings.find((f) => f.code === 'external-hosts')?.title ?? '', /unpkg\.com/);
  assert.ok(!cdn.findings.some((f) => f.severity === 'blocker' && /unpkg/.test(f.title)));
  const wallet = await platformPreflight([file('index.html', html('https://cdn.walletconnect.com/x.js')), file('game.js', 'import "three";')]);
  assert.ok(wallet.findings.some((f) => f.code === 'blocked-service' && f.severity === 'blocker' && f.title.includes('cdn.walletconnect.com')));
});

/* Documentation links inside engine messages, copied from real exports (22 Oct 2026):
   Emscripten's glue in every stock Godot 3 and 4 export and in Unity's framework.js, and
   Unity's own deprecation text. Each failed `opengame check` as an outbound blocker. */
const ENGINE_MESSAGES = [
  "if(isFileURI(wasmBinaryFile)){err(`warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`)}",
  'var _emscripten_check_blocking_allowed=()=>{if(ENVIRONMENT_IS_WORKER)return;warnOnce("Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread")};',
  'var dlopenMissingError="To use dlopen, you need enable dynamic linking, see https://emscripten.org/docs/compiling/Dynamic-Linking.html";',
  'error.message=\'Detected use of deprecated "Module.dynCall_*" API. Use "makeDynCall" API instead. Refer to https://docs.unity3d.com/6000.0/Documentation/Manual/web-interacting-browser-deprecated.html#dyncall for more information.\';',
  "warnOnce('Applying workaround to Firefox bug https://bugzilla.mozilla.org/show_bug.cgi?id=1397977');",
  "warnOnce('Safari loses the context here, tracked at https://bugs.webkit.org/show_bug.cgi?id=222116');",
  // OG Clash's bundled limits.json, where the citation sits in parentheses.
  '_c:"OpenAI\'s own API sells it (service_tier ultrafast, Responses API, https://developers.openai.com/api/docs/guides/ultrafast-mode, read 29 Sep 2026)",',
  '_tiersComment:"Entries that share an id are spellings of one tier: the docs (https://openrouter.ai/docs/guides/features/service-tiers, read 29 Sep 2026) say so.",',
];

test('a documentation link in the middle of an engine message is not a request', async () => {
  for (const code of ENGINE_MESSAGES) {
    assert.deepEqual(await outbound(code), [], code);
    assert.equal((await inspect(code)).ok, true, code);
  }
});

test('a real request beside an engine message still fails, and so does a URL list', async () => {
  for (const code of [
    `${ENGINE_MESSAGES[0]}\nfetch('https://ko-fi.com/collect');`,
    'fetch("https://ko-fi.com")',
    'img.srcset = "a.png 1x, https://ko-fi.com/b.png 2x";',
    'img.srcset = "a.png 100w, https://ko-fi.com/b.png 200w";',
  ]) {
    const found = await blocked(code);
    assert.ok(found.some((f) => f.severity === 'blocker' && /ko-fi\.com/.test(f.title)), code);
  }
  // Not a sentence, so read as the request it is: named in the note, not skipped as prose.
  assert.match(await externalNote('const u = "https://emscripten.org/x"; fetch(u)'), /emscripten\.org/);
});

/* PostHog's bot list, as shipped in posthog-js 1.438.3: user-agent substrings, one of
   them a URL that nothing requests. It refused Super Mario Zombies on 27 Oct 2026. */
const POSTHOG_BOTS = 'var Fi=["backlinksextendedbot","baiduspider","facebookcatalog","http://yandex.com/bots","hubspot","ia_archiver"];';

test('a URL in a list of plain words is a value, not a request', async () => {
  const report = await inspect(POSTHOG_BOTS);
  const origin = report.findings.filter((f) => f.code === 'outbound-origin');
  assert.ok(!origin.some((f) => f.severity === 'blocker'), JSON.stringify(origin));
  assert.ok(origin.some((f) => f.severity === 'warning' && /yandex\.com over plain http in a data value/.test(f.title)), JSON.stringify(origin));
  assert.equal(report.ok, true);
  // A blocked host in the same shape is a warning, the same verdict a data value gets.
  assert.deepEqual((await blocked('var a=["one","https://ko-fi.com/maker","two"];')).map((f) => f.severity), ['warning']);
});

test('plain http next to a string is still a request when the shape is a request', async () => {
  for (const code of [
    'x.open("GET","http://yandex.com/bots");',
    'x.open("GET","http://yandex.com/bots",true);',
    'fetch(base, "http://yandex.com/bots")',
    '["http://yandex.com/a","http://yandex.com/b"].map(fetch)',
    'var a=["one","http://yandex.com/" + id,"two"];',
    'go("one","http://yandex.com/bots")',
    // A call's argument list is the same shape between its commas, and is a load.
    'importScripts("a.js","http://yandex.com/bots","b.js")',
    'importScripts( "a.js" , "http://yandex.com/bots" , "b.js" )',
  ]) {
    const origin = (await inspect(code)).findings.filter((f) => f.code === 'outbound-origin');
    assert.ok(origin.some((f) => f.severity === 'blocker'), code);
  }
});

/* OG Clash keys its cooked files in Cache Storage as `https://oc-cooked.invalid/<hash>`,
   and the check failed the build for "reaching" a name RFC 6761 guarantees never resolves. */
test('a host under the reserved .invalid TLD is not a request anybody can answer', async () => {
  for (const code of [
    "const key = new Request('https://oc-cooked.invalid/' + hash); await cache.put(key, response);",
    "fetch('https://oc-cooked.invalid/3f9a.hza')",
    "const base = '//assets.cache.INVALID/x';",
  ]) {
    assert.deepEqual(await outbound(code), [], code);
    assert.equal((await inspect(code)).ok, true, code);
  }
});

/* The upload scan must exempt exactly the hosts a browser would send to `.invalid`: R36 found it exempting
   `https://evil.com\\x.invalid/`, where a browser goes to evil.com. This check no longer refuses an outside host at
   all (open hosting), so the table it shares with apps/pipeline/tests/test_reserved_invalid_hosts.py is held here to
   the browser's own parser, row by row, and the scan is held to the table there. */
test('the reserved-host table agrees with the browser on where an odd URL goes', async () => {
  const { cases } = JSON.parse(fs.readFileSync(new URL('./fixtures/reserved-invalid-hosts.json', import.meta.url), 'utf8')) as
    { cases: { url: string; browserHost: string }[] };
  assert.ok(cases.length >= 10);
  for (const { url, browserHost } of cases) {
    assert.equal(new URL(url, 'https://game.opengame.gg/').hostname, browserHost, url);
    if (browserHost.endsWith('.invalid')) assert.deepEqual(await outbound(`fetch(${JSON.stringify(url)})`), [], url);
  }
});

test('a blocked host in a call argument list is a blocker, not a list member', async () => {
  assert.deepEqual((await blocked('importScripts("a.js","https://js.stripe.com/v3","b.js");')).map((f) => f.severity), ['blocker']);
});

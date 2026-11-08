import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { platformPreflight } from '../src/platform';
import { inertRanges, type PreflightFile } from '../src/index';

/**
 * ONE LINE OF MINIFIED CODE, AND WHAT A WRONG GUESS COSTS ON IT.
 *
 * `inertRanges` answers per byte, and in a minified bundle the whole library is one
 * line. So a comment opened by mistake does not cost a line, it costs the rest of the
 * file: on 26 Oct 2026 a reviewer measured the walk calling 278 KB of
 * firebase-firestore-compat's 346 KB inert, and 58% of three.js's own WebGPU build.
 * Nothing failed. A walk that is wrong in the inert direction reports NOTHING, so every
 * suite stayed green over a check that could not see a Stripe call.
 *
 * The fixtures are the reviewer's, copied rather than paraphrased, and they are the same
 * ones `apps/pipeline/tests/test_comments_are_not_requests.py` runs through `inert.py`.
 * Each puts a payment call, a wallet request and a fetch after the shape that used to
 * blind the line.
 */
const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });
const page = '<!doctype html><html><body><canvas></canvas><script type="module" src="./game.js"></script></body></html>';
const AFTER = 'const st=Stripe("pk_live_abc");window.ethereum.request({method:"eth_requestAccounts"});fetch("https://api.stripe.com/v1/x");';

/* By title rather than severity: whether a wallet is a warning or a refusal is a policy
   decision made elsewhere, and the question here is only whether the walk let the
   check see it at all. */
const seen = async (code: string) => {
  const { findings } = await platformPreflight([file('index.html', page), file('game.js', code)]);
  const titles = findings.filter((f) => f.code === 'blocked-service').map((f) => f.title);
  return {
    stripe: titles.some((t) => /uses Stripe/.test(t)),
    fetch: titles.some((t) => t.includes('api.stripe.com')),
    wallet: titles.some((t) => /crypto wallet/.test(t)),
  };
};
const ALL = { stripe: true, fetch: true, wallet: true };

const SHAPES: [string, string][] = [
  /* e03: a protocol picked at runtime, then `//` and a host. A shader comment to the old
     rule, so the closing backtick and everything after it went with it. */
  ['e03 a protocol-relative template', 'const u=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/ws`;'],
  /* e06: the same shape from a URL builder, `//` straight after the backtick. */
  ['e06 `//` first in a template', 'c.authority&&(t+=`//${c.authority}`);'],
  /* e07: an error message that mentions the characters. */
  ['e07 `//` in an error message', 'throw new Error(`Paths must not contain // in them.`);}'],
  /* e05: a regex after `return`, which the one-character rule read as division, so the
     `//` inside the pattern opened a comment. */
  ['e05 a regex after return', 'function f(e){return/firefox\\//i.test(e)};'],
  ['a regex after typeof', 'function g(e){if(typeof/x\\//.source)return 1};'],
  ['a regex after case', 'switch(1){case/a\\//.test(""):break};'],
  ['a regex after yield', 'function*h(){yield/b\\//};'],
  ['a regex after throw', 'function k(){throw/c\\//};'],
  ['a regex after else', 'if(0)1;else/d\\//.test("");'],
  ['a regex after void', 'void/e\\//;'],
  /* pixi.js: a `/` inside a character class does not end a pattern. */
  ['a slash in a character class', 'const re=/[/]\\//;'],
  ['a slash in a class after return', 'function p(r){return/[/]\\//.test(r)};'],
];

for (const [name, before] of SHAPES) {
  test(`what follows it on the same line is still seen: ${name}`, async () => {
    assert.deepEqual(await seen(before + AFTER), ALL);
  });
}

test('e04, the control: the same template with a newline after it was always seen', async () => {
  assert.deepEqual(await seen('const u=`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/ws`;\n' + AFTER), ALL);
});

test('a multi-line template handed to Error does not unpair the quotes after it', async () => {
  /* firebase app-check, in every compat bundle: a template with newlines and an
     apostrophe, handed to `Error`. The sink pass stepped over it as a quote, so it
     stopped at the first newline, the apostrophe in "Can't" opened a string, and the
     strings it went on to mark inert were the code between real ones -- 248 KB of it in
     firebase-compat. The later backtick is what re-pairs them. */
  assert.deepEqual(await seen("function q(){throw Error(`\n  Can't get debug token.\n`)};" + AFTER + 'const m=`)`;'), ALL);
});

test('a request in a hole of a template handed to console.warn is still a request', async () => {
  assert.equal((await seen('console.warn(`see ${fetch("https://api.stripe.com/v1/x")}`);\n')).fetch, true);
});

const covers = (text: string, at: number) => inertRanges('game.js', text).some(([a, b]) => a <= at && at < b);

test('a shader comment still counts, and ends at the closing backtick', () => {
  const text = "const s=`x // see https://jcgt.org/x`;fetch('https://evil.example/x');";
  assert.equal(covers(text, text.indexOf('// see')), true);
  assert.equal(covers(text, text.indexOf('jcgt')), true);
  assert.equal(covers(text, text.indexOf('fetch')), false);
});

test('a hole interrupts a shader comment, is walked as code, and the comment resumes', () => {
  const text = "const s=`// see ${fetch('https://evil.example/x')} https://a.example\n`;";
  assert.equal(covers(text, text.indexOf('// see')), true);
  assert.equal(covers(text, text.indexOf('evil.example')), false);
  assert.equal(covers(text, text.indexOf('a.example')), true);
});

test('an unclosed block comment in a template ends at the template', () => {
  const text = "const s=`/* never closed`;fetch('https://evil.example/x');";
  assert.equal(covers(text, text.indexOf('evil.example')), false);
});

test('a keyword only counts as a whole word, not as a property or a prefix', () => {
  for (const text of ['a=x.in / 2 // https://evil.example\n', 'a=ofs / 2 // https://evil.example\n']) {
    assert.equal(covers(text, text.indexOf('// https')), true, text);
  }
});

/* AFTER `of`, `await` AND `yield` the walk follows a `/` as a pattern AND as a division
   and keeps what both call inert (review R33b N1). The probe bundles show the requests it
   stops hiding; these show what it must not cost, and what it does when a file is written
   to make it expensive. The same three as TestBothReadings in the pipeline. */
test('two readings that rejoin keep the comment after them', () => {
  /* `of/2/3` read as a pattern and as two divisions meet at the `3`. A walk that gave up
     at every ambiguous `/` would pass the bundle rows and fail this. */
  for (const text of ['a=of/2/3 // https://evil.example\n', 'async function f(s){await /x/.test(s) // https://evil.example\n}']) {
    assert.equal(covers(text, text.indexOf('// https')), true, text);
  }
});

test('a file ambiguous everywhere stays linear, and what it could not settle is live', () => {
  /* Every `of/[(` can be a pattern running to the last `]/`, so asking each one cost the
     rest of the file: 40 KB took eleven seconds in the pipeline before this change. Past
     the budget nothing more is recorded, so the comment at the end is live. */
  const text = 'var of;' + 'of/[('.repeat(100_000) + ']/;\n// https://evil.example\n';
  const started = performance.now();
  const inert = covers(text, text.indexOf('// https'));
  assert.ok(performance.now() - started < 10_000);
  assert.equal(inert, false);
});

test('what inert.py counts as part of a name, this does too', () => {
  /* Review R33c D1 found the two walkers disagreeing on characters in front of a keyword.
     These two are syntax errors outside a string, so nothing they hide could run, and
     the reason to pin them is that the two checkers are one algorithm: an astral symbol
     (inert.py counts every code point past U+FFFF, this counts both halves) and a code
     point no Unicode has assigned (Cn in both). Either makes `return/1` the end of a
     name, so the `/` is division and not a pattern running to the `/` of `https://`. */
  for (const c of ['\u{1F600}', '\u0378']) {
    const text = `var z=${c}return/1;fetch("https://evil.example/x");var q=1/1;`;
    assert.equal(covers(text, text.indexOf('https://evil')), false, JSON.stringify(c));
  }
});

test('the sink pass is charged to the same budget, and a sink past it is live', () => {
  /* Each `console.log(` read its argument list to the closing bracket, and here none
     closes, so the pass read the rest of the file once per call: quadratic, 5.4 s for
     400 KB in this file and 54 s in inert.py (review R33c). A megabyte of it would take
     half a minute without the budget. Past the budget nothing more is marked, so the
     warning at the end is live, which is the safe way to be wrong. */
  const text = 'console.log('.repeat(90_000) + '\nconsole.warn("https://evil.example");\n';
  const started = performance.now();
  const inert = covers(text, text.indexOf('https://evil'));
  assert.ok(performance.now() - started < 5_000);
  assert.equal(inert, false);
  const alone = 'console.warn("https://evil.example");\n';
  assert.equal(covers(alone, alone.indexOf('https://evil')), true, 'a warning on its own is still inert');
});

test('a string does not end at a line separator', () => {
  /* A string may hold U+2028, so it does not stop there the way a `//` comment and a
     pattern do. Stopping would walk the rest of the string as code, and the `//` in it
     would open a comment over the fetch. */
  const text = 'var s="a\u2028//b";fetch("https://evil.example/x");';
  assert.equal(covers(text, text.indexOf('evil.example')), false);
});

/* THE MEASUREMENT, on libraries a game ships and this repository installs: three is a
   direct dependency of apps/web, and posthog-js -- whose rrweb build is session replay,
   a review signal in its own right -- is too. Measured on 26 Oct 2026, the share of each
   file the walk called inert, before and after this change, the same here and in
   `inert.py`:

     three/build/three.webgpu.min.js   58.2%  ->  0.8%
     posthog-js/dist/rrweb.js          82.5%  ->  1.8%

   and outside the repository, firebase-firestore-compat 80.7% -> 0.6%, firebase-compat
   90.7% -> 1.1%, hls.min.js 92.8% -> 1.3%, playcanvas.min.mjs 5.4% -> 0.3%. Five percent
   is the line: twice the worst honest figure measured among minified bundles, and an
   order of magnitude under anything the bugs produced. A library that really is a fifth
   comments is not minified. */
const repo = fileURLToPath(new URL('../../../', import.meta.url));
for (const rel of ['node_modules/three/build/three.webgpu.min.js', 'node_modules/posthog-js/dist/rrweb.js']) {
  const path = repo + rel;
  test(`a minified library is mostly live code: ${rel}`, { skip: existsSync(path) ? false : `${rel} is not installed; run npm install at the repository root` }, () => {
    const text = readFileSync(path, 'utf8');
    const merged = inertRanges(path, text).slice().sort((a, b) => a[0] - b[0]);
    let inert = 0;
    let reached = 0;
    for (const [a, b] of merged) {
      const from = Math.max(a, reached);
      if (b > from) inert += b - from;
      reached = Math.max(reached, b);
    }
    assert.ok(inert / text.length < 0.05, `${rel}: ${inert} of ${text.length} characters inert`);
  });
}

/* AN SVG SCRIPT IS READ AS THE TEXT IT RUNS, as `test_comments_are_not_requests.py`
   pins it for the pipeline: the text directly in the script, CDATA opened, joined, and the
   JavaScript walk's ranges mapped back onto the page. */
test('an SVG script is read as the text it runs, and its ranges land where they were', () => {
  const page = '<svg><script>/*a*/x<!--c-->y<![CDATA[/*b*/]]>z</script></svg>';
  const merged = inertRanges('index.html', page).slice().sort((a, b) => a[0] - b[0]);
  assert.deepEqual(merged, [[13, 18], [19, 27], [37, 42]]);
});

/* `&#42;/` closes the comment once decoded, so `go()` runs. Until 7 Nov 2026 the walk did not
   decode and such a script kept no inert range at all; the reference itself is now the end of
   the first comment, and `&ast;` and an `&amp;` without its semicolon decode the same way, by the
   rules for text rather than for attributes. */
test('an SVG script is read after its references are decoded', () => {
  const sorted = (page: string) => inertRanges('index.html', page).slice().sort((a, b) => a[0] - b[0]);
  assert.deepEqual(sorted('<svg><script>/* &#42;/ go() /* */</script></svg>'), [[13, 22], [28, 33]]);
  assert.deepEqual(sorted('<svg><script>/* &ast;/ go() //&ampx\n</script></svg>'), [[13, 22], [28, 35]]);
});

test('deep foreign content gives up rather than going quadratic, and leaves the rest live', () => {
  /* The `<b>` stops each climb at the HTML rules, so no end tag forks and only the depth and
     the budget bound the walk. */
  const deep = `<svg><foreignObject><b><svg>${'<g>'.repeat(266)}${'</x>'.repeat(20000)}`;
  const page = `${deep}<script>// https://js.stripe.com/v3/\n</script>`;
  const started = Date.now();
  const at = page.indexOf('https://');
  assert.ok(!inertRanges('index.html', page).some(([a, b]) => a <= at && at < b));
  assert.ok(Date.now() - started < 10_000);
});

test('a page with more inert spans than a call can take as arguments still answers', () => {
  /* `push(...spans)` throws past about 120,000 arguments, and the first draft of this walk
     spread a script's spans that way: a 1 MB inline script of comments threw. */
  const html = `<script>${'/*a*/'.repeat(200_000)}</script>`;
  assert.ok(inertRanges('index.html', html).length > 0);
  const svg = `<svg><script>${'/*a*/<!---->'.repeat(128_000)}</script></svg>`;
  const started = Date.now();
  assert.ok(inertRanges('index.html', svg).length > 0);
  /* Mapping an SVG script's spans back onto its pieces walked from the first piece for every
     span, so this took seconds at a third of the size. */
  assert.ok(Date.now() - started < 10_000);
});

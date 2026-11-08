/* The texts the browser assembles out of a page (src/assembled.ts), read the way it reads them.
   game-policy-probes.json holds the two checkers to one verdict on whole pages, every must-block
   row run in Chromium and Firefox. These pin the pieces underneath, and the tables against the
   two references this runtime has: its own URL parser, and parse5's decoding. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFragment } from 'parse5';
import { HTML_ENTITIES } from '@opengame/shared/url-tables';
import { ExpansionLimit, Mapped, cssUnescape, decodeReferences, dropUrlWhitespace, foldHosts, foldWindows, jsonUnescape, xmlExpand } from '../src/assembled';
import { assembledViews, inertRanges } from '../src/index';
import { platformPreflight } from '../src/platform';
import { computeFold, readFold } from '../../shared/scripts/url-host-fold.mjs';

/* The table is the union of what Node, Chromium and Firefox fold (url-host-fold.mjs says why), so
   it has to cover everything this runtime folds, the same way. */
test('the fold table covers what this runtime\'s URL parser folds', () => {
  const table = readFold();
  const missing = [...computeFold()].filter(([cp, ascii]) => table.get(cp) !== ascii);
  assert.deepEqual(missing, [], 'Node folds hosts the table does not: run node packages/shared/scripts/url-host-fold-write.mjs');
  assert.equal(table.get(0x3164), '');
  assert.equal(table.get(0xa7f1), 's');
});

test('every named reference decodes as parse5 decodes it in an attribute', () => {
  const differ: string[] = [];
  for (const [name, value] of Object.entries(HTML_ENTITIES)) {
    const node = parseFragment(`<p title="&${name}">`).childNodes[0] as unknown as { attrs: { value: string }[] };
    if (node.attrs[0].value !== value) differ.push(name);
  }
  assert.deepEqual(differ, []);
  assert.equal(Object.keys(HTML_ENTITIES).length, 2231);
});

const decoded = (text: string, mode: 'attribute' | 'text' | 'xml') => decodeReferences(Mapped.of(text), mode).text;

test('references decode by the rules of their context', () => {
  assert.equal(decoded('js.stripe&#46;com &#x2E; &period; &shy;', 'attribute'), 'js.stripe.com . . \xad');
  /* A legacy name without its semicolon: decoded in text, left alone in an attribute before `=`
     or a letter, so a query keeps its names. */
  assert.equal(decoded('&ampx &copy=1 &copy;', 'text'), '&x \xa9=1 \xa9');
  assert.equal(decoded('&ampx &copy=1 &copy;', 'attribute'), '&ampx &copy=1 \xa9');
  assert.equal(decoded('&#0;&#x110000;&#xD800;&#128;&#;&#x;', 'text'), '���€&#;&#x;');
  assert.equal(decoded('&#46 &#46; &amp; &apos; &constructor;', 'xml'), "&#46 . & ' &constructor;");
});

test('each character lands on the bytes it was read from', () => {
  const page = 'x src="https://js.stripe&#46;com/v3"';
  const a = page.indexOf('https');
  const m = foldHosts(dropUrlWhitespace(decodeReferences(Mapped.of(page, a, page.length - 1), 'attribute')));
  assert.equal(m.text, 'https://js.stripe.com/v3');
  const dot = m.text.indexOf('.com');
  assert.deepEqual(m.rawAt(dot), [page.indexOf('&#46;'), page.indexOf('&#46;') + 5]);
  assert.deepEqual(m.rawAt(0), [a, a + 1]);
  assert.deepEqual(m.rawAt(dot + 1), [page.indexOf('com'), page.indexOf('com') + 1]);
});

test('CSS escapes', () => {
  assert.equal(cssUnescape(Mapped.of('a\\2e b \\. \\\nc \\1F3AE x \\0')).text, 'a.b . c \u{1F3AE}x �');
});

test('hosts fold and nothing else moves', () => {
  assert.equal(foldHosts(Mapped.of('js.ｓtripe。com/%73%2F%C2%AD%EF%BD%93')).text, 'js.stripe.com/s%2Fs');
  const plain = Mapped.of('const a = b % 2;');
  assert.equal(foldHosts(plain), plain);
  assert.deepEqual(foldWindows('ASCII only, % 2 and https://example.com'), []);
  /* An astral character folds whole, and one the parser does not fold is stepped over whole. A
     no-break space ends a window, and a window with no `//` holds no URL and is passed over. */
  assert.equal(foldHosts(Mapped.of('\u{1D42C}\u{1F3AE}s')).text, 's\u{1F3AE}s');
  assert.deepEqual(foldWindows('a\xa0b //ｓ ｓ').map((w) => w.text), ['//s']);
});

test('an honest ASCII page has no views', () => {
  const page = '<!doctype html><html><body><a href="/x?a=1">x</a><svg><path d="M0 0"/></svg><script>go()</script></body></html>';
  assert.deepEqual(assembledViews('index.html', page), []);
  assert.deepEqual(assembledViews('game.js', "fetch('https://example.com/a?b=1&c=2')"), []);
});

const bomb = (fanout: number, depth: number) => {
  let decls = '<!ENTITY a0 "stripe">';
  for (let k = 1; k <= depth; k += 1) decls += `<!ENTITY a${k} "${`&a${k - 1};`.repeat(fanout)}">`;
  return `<!DOCTYPE svg [${decls}]><svg xmlns="http://www.w3.org/2000/svg"><text>&a${depth};</text></svg>`;
};

/* Twenty references to twenty, seven deep, ran for minutes before every character of every
   expansion was charged to one budget (review of 7 Nov 2026). */
test('an entity bomb is held quickly', async () => {
  const started = performance.now();
  assert.throws(() => xmlExpand(bomb(20, 7)), ExpansionLimit);
  assert.ok(performance.now() - started < 2000);
  const result = await platformPreflight([{ path: 'pay.svg', size: 1, text: async () => bomb(20, 7) }] as never);
  assert.ok(result.findings.some((f) => f.code === 'unreadable-file' && f.severity === 'blocker' && f.path === 'pay.svg'), JSON.stringify(result.findings));
  assert.ok(xmlExpand(bomb(2, 3)).text.includes('stripe'));
});

test('a span read from an entity is inert only where all of it is', () => {
  const page = '<!DOCTYPE svg [<!ENTITY a "/**/fetch(\'x\')"><!ENTITY c "/* all */">]>'
    + '<svg xmlns="http://www.w3.org/2000/svg"><script>&a;</script><script>&c;</script></svg>';
  const whole = page.indexOf('&c;');
  assert.deepEqual(inertRanges('pay.svg', page), [[whole, whole + 3]]);
});

test('the doctype is the document\'s, and parameter entities expand', () => {
  assert.ok(xmlExpand('<!-- <!DOCTYPE x> --><!DOCTYPE s [<!ENTITY s "stripe">]><s>api.&s;.com</s>').text.includes('api.stripe.com'));
  assert.ok(xmlExpand('<!DOCTYPE s [<?x ]>?><!ENTITY s "stripe">]><s>api.&s;.com</s>').text.includes('api.stripe.com'));
  assert.ok(xmlExpand('<!DOCTYPE s [<!ENTITY é "stripe">]><s>api.&é;.com</s>').text.includes('api.stripe.com'));
  assert.ok(xmlExpand('<!DOCTYPE s [<!ENTITY % p "&#60;!ENTITY s \'stripe\'>"> %p;]><s>api.&s;.com</s>').text.includes('api.stripe.com'));
});

test('JSON escapes', () => {
  assert.equal(jsonUnescape(Mapped.of('"js\\u002estripe.com\\/v3 \\ud83c\\udfae \\q"')).text, '"js.stripe.com/v3 \u{1F3AE} \\q"');
});

/* A chain nine deep, and a copy cached unexpanded at depth seven and handed to a use at the top:
   both loaded Stripe in both browsers (second review, 7 Nov 2026). Eight deep expands. */
test('entities nested past the depth are held, not left', () => {
  const chain = (n: number) => {
    let decls = '';
    for (let k = 1; k < n; k += 1) decls += `<!ENTITY e${k} "&e${k + 1};">`;
    return `<!DOCTYPE svg [${decls}<!ENTITY e${n} "stripe">]><svg><script>x("https://api.&e1;.com")</script></svg>`;
  };
  assert.ok(xmlExpand(chain(8)).text.includes('api.stripe.com'));
  assert.throws(() => xmlExpand(chain(9)), ExpansionLimit);
  let poison = '';
  for (let k = 1; k < 7; k += 1) poison += `<!ENTITY p${k} "&p${k + 1};">`;
  poison += '<!ENTITY p7 "&s;"><!ENTITY s "str&t;"><!ENTITY t "ipe">';
  assert.throws(() => xmlExpand(`<!DOCTYPE svg [${poison}]><svg><desc>&p1;</desc><script>x("https://api.&s;.com")</script></svg>`), ExpansionLimit);
});

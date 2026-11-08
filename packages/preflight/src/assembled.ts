/**
 * The text a browser reads where it is not the text on disk.
 *
 * Both upload checkers match a blocked service's URL in the page as written. The browser does
 * not fetch the page as written. It decodes `&#46;` in an attribute before it asks for
 * `<script src="https://js.stripe&#46;com/v3/">`, runs an SVG script's text with its comments
 * taken out and its character references decoded, unescapes `\2e` in a stylesheet, and maps a
 * host through UTS 46, so `ｓ`, `𝐬`, `。` and a soft hyphen all reach `stripe.com`. Each of those
 * loaded Stripe in headless Chromium and Firefox on 7 Nov 2026 and passed both checkers.
 *
 * So this module builds those texts, each as a `Mapped`: the decoded characters, and for each
 * one the span of the page it came from. `findOutboundOrigins` matches URLs in them and judges
 * every new one at that byte of the page, with the same inert ranges and allowances as a URL
 * written plainly. Nothing here replaces the match over the page as written; it only adds to it.
 *
 * Which decoding applies is the browser's choice per context, and so it is here. An HTML
 * `<script>` or `<style>` body is raw text and has no character references. An attribute value
 * has them, decoded by the attribute rules. An SVG script's text has them, and CDATA, and
 * comments between its pieces. A stylesheet has its own escapes. JavaScript has string escapes
 * and concatenation, and none of that is read here: `"js." + "stripe.com"` is evaluation, the
 * sandbox run's job and the reviewer's, not a decoding.
 *
 * The pipeline's `assembled.py` is this module in Python, function for function, and the bundles
 * in packages/shared/game-policy-probes.json hold the two to one answer. Offsets here are UTF-16
 * code units and there code points, as everywhere else the two checkers share a walk.
 */
import { HOST_FOLD, HTML_ENTITIES } from "@opengame/shared/url-tables";

export type Span = [number, number];

const LONGEST_NAME = Math.max(...Object.keys(HTML_ENTITIES).map((name) => name.length));
const ALNUM = /^[A-Za-z0-9]$/;
const HEX = /^[0-9A-Fa-f]$/;
/* The numeric references the standard reads as Windows-1252 rather than as C1 controls. */
const C1 = new Map<number, number>([[0x80, 0x20ac], [0x82, 0x201a], [0x83, 0x0192], [0x84, 0x201e], [0x85, 0x2026],
  [0x86, 0x2020], [0x87, 0x2021], [0x88, 0x02c6], [0x89, 0x2030], [0x8a, 0x0160], [0x8b, 0x2039], [0x8c, 0x0152],
  [0x8e, 0x017d], [0x91, 0x2018], [0x92, 0x2019], [0x93, 0x201c], [0x94, 0x201d], [0x95, 0x2022], [0x96, 0x2013],
  [0x97, 0x2014], [0x98, 0x02dc], [0x99, 0x2122], [0x9a, 0x0161], [0x9b, 0x203a], [0x9c, 0x0153], [0x9e, 0x017e],
  [0x9f, 0x0178]]);
const XML_PREDEFINED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/* ASCII and any non-ASCII character, which is wider than XML's name characters and so only
   expands more: `<!ENTITY é "stripe">` is a declaration the parser honours. Without the `u`
   flag an astral character is its two halves, both in range, as Python's code point is. */
const XML_NAME = /[A-Za-z_:\u0080-\uffff][-A-Za-z0-9._:\u0080-\uffff]*/y;
const HOST_ASCII = /^[a-z0-9.-]$/;
const FOLD_TRIGGER = /[^\x00-\x7f]|%/g;
const URL_WHITESPACE = /[\t\n\r]/g;
const CSS_WS = " \t\n\r\f";

const has = (table: Readonly<Record<string, string>>, key: string) => Object.prototype.hasOwnProperty.call(table, key);
const runOf = (re: RegExp, s: string, at: number) => { re.lastIndex = at; return re.exec(s) ? re.lastIndex : at; };
const DEC_RUN = /[0-9]*/y;
const HEX_RUN = /[0-9A-Fa-f]*/y;
const ALNUM_RUN = /[A-Za-z0-9]*/y;

/**
 * Text and, for each of its characters, the span of the page it was read from. Kept as pieces
 * rather than an entry per character, because a stylesheet can be most of four MiB and nearly
 * all of it maps one to one: a copy piece is a run whose characters map to consecutive bytes
 * from `raw`, and an atom piece is characters that all map to the one span [raw, rawEnd), such
 * as `.` read from `&#46;`.
 */
export class Mapped {
  constructor(public readonly text: string, readonly at: number[], readonly raw: number[],
              readonly rawEnd: number[], readonly atom: boolean[]) {}

  static of(text: string, start = 0, end = text.length): Mapped {
    if (end <= start) return new Mapped("", [], [], [], []);
    return new Mapped(text.slice(start, end), [0], [start], [end], [false]);
  }

  private piece(k: number): number {
    let lo = 0;
    let hi = this.at.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.at[mid] <= k) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /** The span of the page character `k` was read from. */
  rawAt(k: number): Span {
    const i = this.piece(k);
    if (this.atom[i]) return [this.raw[i], this.rawEnd[i]];
    const r = this.raw[i] + k - this.at[i];
    return [r, r + 1];
  }

  /** [text start, text end, raw start, raw end, atom] for each piece over [a, b). */
  *pieces(a: number, b: number): Generator<[number, number, number, number, boolean]> {
    if (a >= b) return;
    const n = this.at.length;
    for (let i = this.piece(a); i < n && this.at[i] < b; i += 1) {
      const lo = Math.max(a, this.at[i]);
      const hi = Math.min(b, i + 1 < n ? this.at[i + 1] : this.text.length);
      if (lo >= hi) continue;
      if (this.atom[i]) yield [lo, hi, this.raw[i], this.rawEnd[i], true];
      else yield [lo, hi, this.raw[i] + lo - this.at[i], this.raw[i] + hi - this.at[i], false];
    }
  }

  /** Spans of this text as spans of the page, clipped piece by piece, so a gap between two
      pieces (the comment an SVG script was joined across) is never covered. A span of the page
      that several characters were read from, such as `&a;` expanding to `/**\/fetch('...')`,
      is covered only when every character read from it is: a comment that is part of an entity
      does not make the call beside it in the same entity inert. Found by the review of 7 Nov
      2026, where one piece of `&a;` covered all of it. */
  private totals: Map<string, number> | null = null;

  rawSpans(spans: Iterable<readonly [number, number]>): Span[] {
    const out: Span[] = [];
    const covered = new Map<string, number>();
    for (const [a, b] of spans) {
      for (const [lo, hi, ra, rb, atom] of this.pieces(a, b)) {
        if (atom) covered.set(`${ra},${rb}`, (covered.get(`${ra},${rb}`) ?? 0) + hi - lo);
        else out.push([ra, rb]);
      }
    }
    if (covered.size) {
      /* Counted once per text: counted per call, a srcdoc page asked once per nested view was
         quadratic in Python, 14.6 s at 192 KB (second review, 7 Nov 2026). */
      if (!this.totals) {
        this.totals = new Map<string, number>();
        for (let i = 0; i < this.atom.length; i += 1) {
          if (!this.atom[i]) continue;
          const end = i + 1 < this.at.length ? this.at[i + 1] : this.text.length;
          const key = `${this.raw[i]},${this.rawEnd[i]}`;
          this.totals.set(key, (this.totals.get(key) ?? 0) + end - this.at[i]);
        }
      }
      const total = this.totals;
      for (const [key, n] of covered) {
        if (n === total.get(key)) out.push(key.split(",").map(Number) as Span);
      }
    }
    const merged: Span[] = [];
    for (const [ra, rb] of out.sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
      const last = merged[merged.length - 1];
      if (last && ra <= last[1]) last[1] = Math.max(last[1], rb);
      else merged.push([ra, rb]);
    }
    return merged;
  }

  /** The same mapping over text of the same length, for a change that moves nothing. */
  withText(text: string): Mapped { return new Mapped(text, this.at, this.raw, this.rawEnd, this.atom); }
}

/* A new `Mapped` read out of `src`, piece by piece. */
class Builder {
  private parts: string[] = [];
  private at: number[] = [];
  private raw: number[] = [];
  private rawEnd: number[] = [];
  private atom: boolean[] = [];
  private n = 0;
  constructor(private readonly src: Mapped) {}

  private push(length: number, raw: number, rawEnd: number, atom: boolean): void {
    const last = this.atom.length - 1;
    if (!atom && last >= 0 && !this.atom[last] && this.rawEnd[last] === raw) this.rawEnd[last] = rawEnd;
    else { this.at.push(this.n); this.raw.push(raw); this.rawEnd.push(rawEnd); this.atom.push(atom); }
    this.n += length;
  }

  /** `src.text[a:b]` unchanged. */
  copy(a: number, b: number): void {
    if (a >= b) return;
    this.parts.push(this.src.text.slice(a, b));
    for (const [lo, hi, ra, rb, atom] of this.src.pieces(a, b)) this.push(hi - lo, ra, rb, atom);
  }

  /** `value`, read from `src.text[a:b]`. */
  put(value: string, a: number, b: number): void {
    if (!value) return;
    this.parts.push(value);
    this.push(value.length, this.src.rawAt(a)[0], this.src.rawAt(b - 1)[1], true);
  }

  done(): Mapped { return new Mapped(this.parts.join(""), this.at, this.raw, this.rawEnd, this.atom); }
}

export function concat(parts: Mapped[]): Mapped {
  const at: number[] = [];
  const raw: number[] = [];
  const rawEnd: number[] = [];
  const atom: boolean[] = [];
  let n = 0;
  for (const m of parts) {
    for (let i = 0; i < m.at.length; i += 1) {
      at.push(m.at[i] + n); raw.push(m.raw[i]); rawEnd.push(m.rawEnd[i]); atom.push(m.atom[i]);
    }
    n += m.text.length;
  }
  return new Mapped(parts.map((m) => m.text).join(""), at, raw, rawEnd, atom);
}

/** `inner` was read out of `outer.text`; the same text, mapped onto the page `outer` was. */
export function compose(outer: Mapped, inner: Mapped): Mapped {
  const b = new Builder(outer);
  for (const [lo, hi, ra, rb, atom] of inner.pieces(0, inner.text.length)) {
    if (atom) b.put(inner.text.slice(lo, hi), ra, rb);
    else b.copy(ra, rb);
  }
  return b.done();
}

/* --- character references ------------------------------------------------------------------ */

function numeric(value: number, xml: boolean): string {
  if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return "�";
  if (!xml && C1.has(value)) return String.fromCodePoint(C1.get(value)!);
  return String.fromCodePoint(value);
}

export type ReferenceMode = "attribute" | "text" | "xml";

/**
 * The character reference at `s[p]` (an `&`): how many characters it takes and what it reads
 * as, or null where the browser leaves the `&` as it is. `mode` is "attribute" or "text", the
 * standard's two rules, which differ only on a legacy name such as `&amp` written without its
 * semicolon: in an attribute one followed by `=` or a letter or digit is left alone, so
 * `?a=1&copy=2` keeps its query. "xml" is an XML document, where every reference ends in `;`.
 * Its named references are the five XML predefines, and otherwise any HTML name, which is wider
 * than the parser (it stops at an undeclared one) and so can only find more.
 */
function reference(s: string, p: number, mode: ReferenceMode): [number, string] | null {
  const n = s.length;
  let q = p + 1;
  if (q >= n) return null;
  if (s[q] === "#") {
    q += 1;
    const hexa = q < n && (s[q] === "x" || s[q] === "X");
    if (hexa) q += 1;
    const k = runOf(hexa ? HEX_RUN : DEC_RUN, s, q);
    if (k === q) return null;
    const digits = s.slice(q, k).replace(/^0+/, "");
    const value = digits.length > 8 ? 0x110000 : parseInt(digits || "0", hexa ? 16 : 10);
    const semi = k < n && s[k] === ";";
    if (mode === "xml" && !semi) return null;
    return [k + (semi ? 1 : 0) - p, numeric(value, mode === "xml")];
  }
  if (!ALNUM.test(s[q])) return null;
  if (mode === "xml") {
    XML_NAME.lastIndex = q;
    const m = XML_NAME.exec(s);
    const end = m ? XML_NAME.lastIndex : q;
    if (!m || end >= n || s[end] !== ";") return null;
    const value = has(XML_PREDEFINED, m[0]) ? XML_PREDEFINED[m[0]]
      : has(HTML_ENTITIES, `${m[0]};`) ? HTML_ENTITIES[`${m[0]};`] : undefined;
    return value === undefined ? null : [end + 1 - p, value];
  }
  const run = Math.min(runOf(ALNUM_RUN, s, q), q + LONGEST_NAME);
  if (run < n && s[run] === ";" && has(HTML_ENTITIES, `${s.slice(q, run)};`)) return [run + 1 - p, HTML_ENTITIES[`${s.slice(q, run)};`]];
  for (let end = run; end > q; end -= 1) {
    const name = s.slice(q, end);
    if (!has(HTML_ENTITIES, name)) continue;
    if (mode === "attribute" && end < n && (s[end] === "=" || ALNUM.test(s[end]))) return null;
    return [end - p, HTML_ENTITIES[name]];
  }
  return null;
}

/** `m` with its character references decoded as the browser decodes them in `mode`. */
export function decodeReferences(m: Mapped, mode: ReferenceMode): Mapped {
  const s = m.text;
  if (!s.includes("&")) return m;
  const b = new Builder(m);
  let run = 0;
  let i = 0;
  for (;;) {
    const p = s.indexOf("&", i);
    if (p === -1) break;
    const ref = reference(s, p, mode);
    if (!ref) { i = p + 1; continue; }
    b.copy(run, p);
    b.put(ref[1], p, p + ref[0]);
    i = run = p + ref[0];
  }
  b.copy(run, s.length);
  return b.done();
}

/* --- stylesheets ---------------------------------------------------------------------------- */

/** `m` with CSS escapes read as the tokenizer reads them: `\` and up to six hex digits, then one
    optional whitespace, is that code point; `\` and a line break is nothing; `\` and any other
    character is that character. Over the whole text, comments included: a comment is already
    inert, and nothing else in CSS reads a backslash. */
export function cssUnescape(m: Mapped): Mapped {
  const s = m.text;
  if (!s.includes("\\")) return m;
  const b = new Builder(m);
  const n = s.length;
  let run = 0;
  let i = 0;
  for (;;) {
    const p = s.indexOf("\\", i);
    if (p === -1) break;
    const q = p + 1;
    let value: string;
    let end: number;
    if (q >= n) { value = "�"; end = q; }
    else if (HEX.test(s[q])) {
      let k = q;
      while (k < n && k - q < 6 && HEX.test(s[k])) k += 1;
      value = numeric(parseInt(s.slice(q, k), 16), true);
      end = k;
      if (end < n && CSS_WS.includes(s[end])) end += s.startsWith("\r\n", end) ? 2 : 1;
    } else if (s[q] === "\n" || s[q] === "\r" || s[q] === "\f") {
      value = "";
      end = q + (s.startsWith("\r\n", q) ? 2 : 1);
    } else {
      /* A whole code point, so `\` before an astral character takes both halves. */
      value = String.fromCodePoint(s.codePointAt(q)!);
      end = q + value.length;
    }
    b.copy(run, p);
    b.put(value, p, end);
    i = run = end;
  }
  b.copy(run, n);
  return b.done();
}

/* --- the URL parser ------------------------------------------------------------------------- */

/** `m` without the tab, LF and CR the URL parser removes from anywhere in a URL, so
    `https://js.str<newline>ipe.com` in an attribute is Stripe. */
export function dropUrlWhitespace(m: Mapped): Mapped {
  const s = m.text;
  if (!/[\t\n\r]/.test(s)) return m;
  const b = new Builder(m);
  let run = 0;
  for (const found of s.matchAll(URL_WHITESPACE)) {
    b.copy(run, found.index);
    run = found.index + 1;
  }
  b.copy(run, s.length);
  return b.done();
}

const HEX2 = /^[0-9A-Fa-f]{2}$/;

/* The `%XX` run at `s[p]` read as one UTF-8 character the host parser folds into ASCII. */
function percent(s: string, p: number): [number, string] | null {
  const byte = (at: number): number | null => {
    if (at + 3 > s.length || s[at] !== "%") return null;
    const digits = s.slice(at + 1, at + 3);
    return HEX2.test(digits) ? parseInt(digits, 16) : null;
  };
  const first = byte(p);
  if (first === null) return null;
  if (first < 0x80) {
    const c = String.fromCharCode(first).toLowerCase();
    return HOST_ASCII.test(c) ? [3, c] : null;
  }
  const need = first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : first >= 0xf0 && first <= 0xf4 ? 4 : 0;
  if (!need) return null;
  const data = [first];
  for (let k = 1; k < need; k += 1) {
    const next = byte(p + 3 * k);
    if (next === null || next < 0x80 || next > 0xbf) return null;
    data.push(next);
  }
  let char: string;
  try {
    char = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(data));
  } catch {
    return null;
  }
  const folded = HOST_FOLD.get(char.codePointAt(0)!);
  return folded === undefined ? null : [3 * need, folded];
}

/** `m` with every character the URL parser turns into a host's ASCII turned into it: a `%XX`
    escape of a letter, digit, dot or hyphen, and every code point in url-host-fold.json, which
    the parser maps (`ｓ` to `s`, `。` to `.`) or drops (a soft hyphen). Everything else is left,
    so ASCII text reads exactly as it did. */
export function foldHosts(m: Mapped): Mapped {
  const s = m.text;
  FOLD_TRIGGER.lastIndex = 0;
  if (!FOLD_TRIGGER.test(s)) return m;
  const b = new Builder(m);
  let run = 0;
  let changed = false;
  FOLD_TRIGGER.lastIndex = 0;
  for (;;) {
    const found = FOLD_TRIGGER.exec(s);
    if (!found) break;
    const p = found.index;
    let hit: [number, string] | null;
    if (s[p] === "%") hit = percent(s, p);
    else {
      const cp = s.codePointAt(p)!;
      const folded = HOST_FOLD.get(cp);
      hit = folded === undefined ? null : [cp > 0xffff ? 2 : 1, folded];
    }
    if (!hit) {
      /* Past the whole code point, so the low half of a pair is not read as a character. */
      FOLD_TRIGGER.lastIndex = p + (s.codePointAt(p)! > 0xffff ? 2 : 1);
      continue;
    }
    b.copy(run, p);
    b.put(hit[1], p, p + hit[0]);
    changed = true;
    FOLD_TRIGGER.lastIndex = run = p + hit[0];
  }
  if (!changed) return m;
  b.copy(run, s.length);
  return b.done();
}

/* The characters a URL match can never contain, so a window between two of them holds every
   match that touches a character inside it. ASCII only, and the same in Python: the two
   languages' `\s` differ (this one has U+FEFF, which a host drops), and a window that broke at a
   character the fold removes left `api.str\ufeffipe.com` to Python alone. */
const WINDOW_BREAK = /[\n\v\f\r "'`<>]/;
const WINDOW_BREAK_G = /[\n\v\f\r "'`<>]/g;
/* A tab is no break and is a reason to look: it is legal inside a JavaScript or CSS string, and the
   URL parser drops it, so `fetch('//ap<tab>i.stripe.com')` is Stripe. A line break cannot sit
   inside either string, so it still ends a window. */
const WINDOW_TRIGGER = /[^\x00-\x7f]|[%\t]/g;
/** What every URL either checker matches starts with: two slashes or backslashes in any mix, or a
    special scheme and its colon. A text without one holds no URL, and no decoding here makes one
    out of nothing it was given, so it is no view. */
export const URL_START = /[\\/][\\/]|(?:https?|wss?):/i;

/** The page as written, with its tabs dropped and its hosts folded, in windows: one for each run
    without a break character that holds something to change and a `//`. Honest ASCII pages have
    none. */
export function foldWindows(text: string): Mapped[] {
  const out: Mapped[] = [];
  const n = text.length;
  let i = 0;
  for (;;) {
    WINDOW_TRIGGER.lastIndex = i;
    const found = WINDOW_TRIGGER.exec(text);
    if (!found) return out;
    const p = found.index;
    /* A no-break space or another non-ASCII space: it ends a match, it does not fold. */
    if (WINDOW_BREAK.test(text[p])) { i = p + 1; continue; }
    let left = p;
    while (left > i && !WINDOW_BREAK.test(text[left - 1])) left -= 1;
    WINDOW_BREAK_G.lastIndex = p;
    const brk = WINDOW_BREAK_G.exec(text);
    const right = brk ? brk.index : n;
    /* No URL starts without `//`, and no folding makes one. */
    if (!URL_START.test(text.slice(left, right).replace(/\t/g, ""))) { i = right; continue; }
    const folded = foldHosts(dropUrlWhitespace(Mapped.of(text, left, right)));
    if (folded.text !== text.slice(left, right)) out.push(folded);
    i = right;
  }
}

/* --- XML ------------------------------------------------------------------------------------ */

const DOCTYPE = /<!DOCTYPE/iy;
/* XML's own whitespace, not either language's `\s`, so the two read the same declarations. */
const ENTITY_DECL = /<!ENTITY[\t\n\r ]+(%?)[\t\n\r ]*([A-Za-z_:\u0080-\uffff][-A-Za-z0-9._:\u0080-\uffff]*)[\t\n\r ]+(?:"([^"]*)"|'([^']*)')[\t\n\r ]*>/g;
const ENTITY_DEPTH = 8;
const ENTITY_REF = { "&": new RegExp(`&(${XML_NAME.source});`, "g"), "%": new RegExp(`%(${XML_NAME.source});`, "g") };

/** An XML document whose entities expand past what the scan reads. The upload is held for it,
    as for a file the scan cannot read to the end: no honest SVG amplifies, and an expansion
    left unread is a request left unread. */
export class ExpansionLimit extends Error {}

/* Where the document's DOCTYPE starts: before the root element, and not inside a comment or a
   processing instruction, where `<!-- <!DOCTYPE x> -->` once hid the real one. */
function doctypeStart(text: string): number | null {
  let i = 0;
  for (;;) {
    const j = text.indexOf("<", i);
    if (j === -1) return null;
    const opened = [["<!--", "-->"], ["<?", "?>"]].find(([opener]) => text.startsWith(opener, j));
    if (opened) {
      const close = text.indexOf(opened[1], j + opened[0].length);
      i = close === -1 ? text.length : close + opened[1].length;
      continue;
    }
    DOCTYPE.lastIndex = j;
    return DOCTYPE.test(text) ? j : null;
  }
}

/** Past the `>` that ends the declaration at `j`, stepping over an internal subset's brackets,
    quotes, comments and processing instructions. */
export function doctypeEnd(text: string, j: number): number {
  const n = text.length;
  let i = j + 2;
  let depth = 0;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      i = close === -1 ? n : close + 1;
      continue;
    }
    if (text.startsWith("<!--", i) || text.startsWith("<?", i)) {
      const closer = text[i + 1] === "!" ? "-->" : "?>";
      const close = text.indexOf(closer, i + closer.length);
      i = close === -1 ? n : close + closer.length;
      continue;
    }
    if (c === "[") depth += 1;
    else if (c === "]") depth = Math.max(0, depth - 1);
    else if (c === ">" && depth === 0) return i + 1;
    i += 1;
  }
  return n;
}

/* The general entities of one document, each expanded once and every character of every
   expansion, its own and each use of it, charged to one budget: four times the document plus
   1 MiB. Ten references to ten references seven deep took minutes before it was charged so, and
   a parser's own guard against amplification stops well short of the budget. */
class Expander {
  private done = new Map<string, string>();
  constructor(private readonly declared: Map<string, string>, public budget: number) {}

  charge(n: number): void {
    this.budget -= n;
    if (this.budget < 0) throw new ExpansionLimit("entity expansion past the budget");
  }

  entity(name: string, depth: number): string {
    if (!this.done.has(name)) {
      /* A reference to itself, directly or not, is an error and is left as written. */
      this.done.set(name, `&${name};`);
      this.done.set(name, this.expand(this.declared.get(name)!, depth + 1));
    }
    return this.done.get(name)!;
  }

  expand(value: string, depth: number, refs: Map<string, string> | null = null, mark = "&"): string {
    if (!value.includes(mark)) return value;
    const names = refs ?? this.declared;
    if (depth >= ENTITY_DEPTH) {
      /* Deeper than the scan follows is held rather than left as written: a chain nine deep
         loaded Stripe in both browsers, and a copy left unexpanded at depth seven was cached and
         handed to a use at the top (second review, 7 Nov 2026). */
      if ([...value.matchAll(ENTITY_REF[mark as "&" | "%"])].some((m) => names.has(m[1]))) {
        throw new ExpansionLimit("entity references nested past the depth the scan follows");
      }
      return value;
    }
    const out: string[] = [];
    let run = 0;
    let i = 0;
    for (;;) {
      const p = value.indexOf(mark, i);
      if (p === -1) break;
      const name = xmlNameAt(value, p + 1);
      if (!name || name[1] >= value.length || value[name[1]] !== ";" || !names.has(name[0])) { i = p + 1; continue; }
      const inner = refs ? this.expand(names.get(name[0])!, depth + 1, refs, mark) : this.entity(name[0], depth);
      this.charge(inner.length);
      out.push(value.slice(run, p), inner);
      i = run = name[1] + 1;
    }
    out.push(value.slice(run));
    return out.join("");
  }
}

/* An entity value as declared: its character references decoded, its entity references kept for
   when it is used. */
function numericOnly(value: string): string {
  const out: string[] = [];
  let run = 0;
  let i = 0;
  for (;;) {
    const p = value.indexOf("&#", i);
    if (p === -1) break;
    const ref = reference(value, p, "xml");
    if (!ref) { i = p + 1; continue; }
    out.push(value.slice(run, p), ref[1]);
    i = run = p + ref[0];
  }
  out.push(value.slice(run));
  return out.join("");
}

const XML_OPENERS: [string, string][] = [["<!--", "-->"], ["<![CDATA[", "]]>"], ["<?", "?>"]];

/* `p` if the `&` at `p` is in markup the parser reads references in, else past the comment,
   CDATA section or processing instruction it is in. Looks only between `i` and `p`. */
function xmlSkipTo(text: string, i: number, p: number): number {
  let k = i;
  for (;;) {
    const lt = text.indexOf("<", k);
    if (lt === -1 || lt >= p) return p;
    const opened = XML_OPENERS.find(([opener]) => text.startsWith(opener, lt));
    if (!opened) { k = lt + 1; continue; }
    const found = text.indexOf(opened[1], lt + opened[0].length);
    const close = found === -1 ? text.length : found + opened[1].length;
    if (close > p) return close;
    k = close;
  }
}

function xmlNameAt(s: string, at: number): [string, number] | null {
  XML_NAME.lastIndex = at;
  const m = XML_NAME.exec(s);
  return m ? [m[0], XML_NAME.lastIndex] : null;
}

/**
 * An XML document with the general entities its internal subset declares expanded where they
 * are referenced, as the parser expands them. `<!ENTITY s "stripe">` and then
 * `https://js.&s;.com` is Stripe. An entity's value has its character references decoded when it
 * is declared and its entity references expanded when it is used, so `<!ENTITY a "&#38;#46;">`
 * is `&#46;` and then `.`. A parameter entity is expanded inside the subset first, since Firefox
 * reads the declarations one writes. Throws ExpansionLimit past the budget (`Expander`).
 */
export function xmlExpand(text: string): Mapped {
  const start = doctypeStart(text);
  if (start === null) return Mapped.of(text);
  const end = doctypeEnd(text, start);
  let budget = 4 * text.length + (1 << 20);
  let subset = text.slice(start, end);
  const params = new Map<string, string>();
  /* The first declaration of a name binds, as XML has it, parameter entities as general ones. */
  for (const m of subset.matchAll(ENTITY_DECL)) if (m[1] && !params.has(m[2])) params.set(m[2], numericOnly(m[3] ?? m[4] ?? ""));
  if (params.size) {
    const expander = new Expander(new Map(), budget);
    subset = expander.expand(subset, 0, params, "%");
    budget = expander.budget;
  }
  const declared = new Map<string, string>();
  for (const m of subset.matchAll(ENTITY_DECL)) {
    if (!m[1] && !declared.has(m[2])) declared.set(m[2], numericOnly(m[3] ?? m[4] ?? ""));
  }
  if (!declared.size) return Mapped.of(text);
  const expander = new Expander(declared, budget);
  const b = new Builder(Mapped.of(text));
  const n = text.length;
  b.copy(0, end);
  let run = end;
  let i = end;
  for (;;) {
    const p = text.indexOf("&", i);
    if (p === -1) break;
    /* Not inside a comment, a CDATA section or a processing instruction. */
    const skip = xmlSkipTo(text, i, p);
    if (skip > p) { i = skip; continue; }
    const name = xmlNameAt(text, p + 1);
    if (!name || name[1] >= n || text[name[1]] !== ";" || !declared.has(name[0])) { i = p + 1; continue; }
    const value = expander.entity(name[0], 0);
    expander.charge(value.length);
    b.copy(run, p);
    b.put(value, p, name[1] + 1);
    i = run = name[1] + 1;
  }
  b.copy(run, n);
  return b.done();
}

/* --- JSON ----------------------------------------------------------------------------------- */

const JSON_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const HEX4 = /^[0-9A-Fa-f]{4}$/;

/** `m` with JSON's string escapes read, as the browser's JSON parser reads an import map or
    speculation rules: `"https://js\u002estripe.com/v3/"` is Stripe. Over the whole text, which is
    all strings and punctuation; a pair of `\u` escapes is one astral character. */
export function jsonUnescape(m: Mapped): Mapped {
  const s = m.text;
  if (!s.includes("\\")) return m;
  const b = new Builder(m);
  const n = s.length;
  let run = 0;
  let i = 0;
  for (;;) {
    const p = s.indexOf("\\", i);
    if (p === -1 || p + 1 >= n) break;
    const c = s[p + 1];
    let value: string;
    let end: number;
    if (has(JSON_ESCAPES, c)) { value = JSON_ESCAPES[c]; end = p + 2; }
    else if (c === "u" && HEX4.test(s.slice(p + 2, p + 6))) {
      let code = parseInt(s.slice(p + 2, p + 6), 16);
      end = p + 6;
      if (code >= 0xd800 && code <= 0xdbff && s.startsWith("\\u", end) && HEX4.test(s.slice(end + 2, end + 6))) {
        const low = parseInt(s.slice(end + 2, end + 6), 16);
        if (low >= 0xdc00 && low <= 0xdfff) { code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00); end += 6; }
      }
      value = String.fromCodePoint(code);
    } else { i = p + 1; continue; }
    b.copy(run, p);
    b.put(value, p, end);
    i = run = end;
  }
  b.copy(run, n);
  return b.done();
}

export type Seg = [number, number, boolean];

/** What an XML walk of a standalone SVG found: its comments, the text directly inside each
    `<script>` and `<style>` (any namespace, which only reads more), the span of every attribute
    value of every start tag, and where the walk stopped trusting the document (a malformed
    token, where the parser stops too). */
export type XmlDocument = { comments: Span[]; scripts: Seg[][]; styles: Seg[][]; values: Span[]; clip: number };

const XML_ATTR = /[\t\n\r ]+([^\t\n\r />=]+)[\t\n\r ]*=[\t\n\r ]*(?:"([^"<]*)"|'([^'<]*)')/y;
const XML_TAG_END = /[\t\n\r ]*(\/?)>/y;
const PSEUDO_ATTR = /=[\t\n\r ]*(?:"([^"]*)"|'([^']*)')/g;

export function xmlWalk(text: string): XmlDocument {
  const n = text.length;
  const doc: XmlDocument = { comments: [], scripts: [], styles: [], values: [], clip: n };
  /* Each open element: its qualified name, its local name, and for a script or a style the text
     directly in it. */
  const stack: [string, string, Seg[] | null][] = [];
  let i = 0;
  let mark = 0;
  const textTo = (at: number) => {
    const top = stack[stack.length - 1];
    if (top?.[2] && mark < at) top[2].push([mark, at, false]);
  };
  const close = ([, local, segs]: [string, string, Seg[] | null]) => {
    if (segs) (local === "script" ? doc.scripts : doc.styles).push(segs);
  };
  for (;;) {
    const j = text.indexOf("<", i);
    if (j === -1) { textTo(n); break; }
    if (text.startsWith("<!--", j)) {
      textTo(j);
      const e = text.indexOf("-->", j + 4);
      const end = e === -1 ? n : e + 3;
      doc.comments.push([j, end]);
      i = mark = end;
      continue;
    }
    if (text.startsWith("<![CDATA[", j)) {
      textTo(j);
      const e = text.indexOf("]]>", j + 9);
      const inner = e === -1 ? n : e;
      const top = stack[stack.length - 1];
      if (top?.[2] && j + 9 < inner) top[2].push([j + 9, inner, true]);
      i = mark = e === -1 ? n : e + 3;
      continue;
    }
    if (text.startsWith("<?", j)) {
      textTo(j);
      const e = text.indexOf("?>", j + 2);
      /* `<?xml-stylesheet href="...&#46;..."?>` is fetched, its pseudo-attributes decoded as an
         attribute's are (second review, 7 Nov 2026). */
      if (text.startsWith("<?xml-stylesheet", j)) {
        const body = text.slice(0, e === -1 ? n : e);
        PSEUDO_ATTR.lastIndex = j + 16;
        for (let attr = PSEUDO_ATTR.exec(body); attr; attr = PSEUDO_ATTR.exec(body)) {
          const value = attr[1] ?? attr[2] ?? "";
          const valueEnd = PSEUDO_ATTR.lastIndex - 1;
          doc.values.push([valueEnd - value.length, valueEnd]);
        }
      }
      i = mark = e === -1 ? n : e + 2;
      continue;
    }
    if (text.startsWith("<!", j)) {
      textTo(j);
      i = mark = doctypeEnd(text, j);
      continue;
    }
    const closing = text.startsWith("</", j);
    const name = xmlNameAt(text, j + (closing ? 2 : 1));
    if (!name) { doc.clip = j; break; }
    textTo(j);
    const [qualified, nameEnd] = name;
    if (closing) {
      XML_TAG_END.lastIndex = nameEnd;
      const end = XML_TAG_END.exec(text);
      if (!end || end[1] || !stack.length || stack[stack.length - 1][0] !== qualified) { doc.clip = j; break; }
      close(stack.pop()!);
      i = mark = XML_TAG_END.lastIndex;
      continue;
    }
    let k = nameEnd;
    for (;;) {
      XML_ATTR.lastIndex = k;
      const attr = XML_ATTR.exec(text);
      if (!attr) break;
      const value = attr[2] ?? attr[3] ?? "";
      const valueEnd = XML_ATTR.lastIndex - 1;
      doc.values.push([valueEnd - value.length, valueEnd]);
      k = XML_ATTR.lastIndex;
    }
    XML_TAG_END.lastIndex = k;
    const end = XML_TAG_END.exec(text);
    if (!end) { doc.clip = j; break; }
    i = mark = XML_TAG_END.lastIndex;
    if (!end[1]) {
      const local = qualified.slice(qualified.lastIndexOf(":") + 1).toLowerCase();
      stack.push([qualified, local, local === "script" || local === "style" ? [] : null]);
    }
  }
  /* A document that ends with elements open is malformed and the parser stops at its end; what
     each script held by then is what it ran. */
  for (let k = stack.length - 1; k >= 0; k -= 1) close(stack[k]);
  return doc;
}

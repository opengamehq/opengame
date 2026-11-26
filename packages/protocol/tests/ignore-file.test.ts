import test from "node:test";
import assert from "node:assert/strict";
import { ignoreRules } from "../src/ignore-file";

test("an empty or missing file leaves everything in", () => {
  for (const text of [null, undefined, "", "\n# only a comment\n   \n"]) {
    const rules = ignoreRules(text);
    assert.equal(rules.size, 0);
    assert.equal(rules.ignores("tools/probe.png"), false);
  }
});

test("a folder pattern takes everything under it, at any depth unless anchored", () => {
  const rules = ignoreRules("tools/\n");
  assert.equal(rules.ignores("tools", true), true);
  assert.equal(rules.ignores("tools/probe.html"), true);
  assert.equal(rules.ignores("tools/shots/a.png"), true);
  // A pattern with no slash but the last is a name, matched wherever it is.
  assert.equal(rules.ignores("src/tools/x.js"), true);
  // And a file called tools is not a folder.
  assert.equal(rules.ignores("tools"), false);
  const anchored = ignoreRules("/tools/");
  assert.equal(anchored.ignores("tools/x.js"), true);
  assert.equal(anchored.ignores("src/tools/x.js"), false);
});

test("stars stay within one name, double stars cross folders", () => {
  const rules = ignoreRules("*.psd\nshots/*.png\ndocs/**/draft-?.md\n");
  assert.equal(rules.ignores("art/hero.psd"), true);
  assert.equal(rules.ignores("shots/a.png"), true);
  assert.equal(rules.ignores("shots/deep/a.png"), false);
  assert.equal(rules.ignores("docs/draft-1.md"), true);
  assert.equal(rules.ignores("docs/a/b/draft-2.md"), true);
  assert.equal(rules.ignores("docs/a/b/draft-10.md"), false);
  assert.equal(rules.ignores("index.html"), false);
});

test("a later ! brings a file back, but not out of a folder that is left out", () => {
  const rules = ignoreRules("*.png\n!cover.png\nraw/\n!raw/keep.png\n");
  assert.equal(rules.ignores("a.png"), true);
  assert.equal(rules.ignores("cover.png"), false);
  assert.equal(rules.ignores("raw/keep.png"), true);
});

test("regular-expression characters in a name are literal, and CRLF and a BOM are read", () => {
  const rules = ignoreRules("\uFEFFnotes (old).txt\r\nbuild+1/\r\n\\#hash.txt\r\n");
  assert.equal(rules.ignores("notes (old).txt"), true);
  assert.equal(rules.ignores("notesXoldX.txt"), false);
  assert.equal(rules.ignores("build+1/x.js"), true);
  assert.equal(rules.ignores("buildd1/x.js"), false);
  assert.equal(rules.ignores("#hash.txt"), true);
});

test("a long run of double stars answers at once", () => {
  const rules = ignoreRules(`${"**/".repeat(200)}x`);
  const started = performance.now();
  assert.equal(rules.ignores(`${"a/".repeat(100)}b`), false);
  assert.ok(performance.now() - started < 100);
});

/* Review of the first version: it built a regular expression, and this pattern against a
   40-character name took 2.2 s with eight stars and 22 s with ten, per path. The GitHub door
   reads the file from any public repository in the visitor's tab. */
test("many stars in one name answer at once", () => {
  const rules = ignoreRules(`${"*a".repeat(30)}*b\n`);
  const started = performance.now();
  for (let i = 0; i < 50; i++) assert.equal(rules.ignores(`x/${"a".repeat(60)}`), false);
  assert.ok(performance.now() - started < 200, String(performance.now() - started));
  assert.equal(ignoreRules("*a*a*b").ignores("xaya-ab"), true);
});

test("sets, ranges and escapes read as git reads them", () => {
  const rules = ignoreRules("[Tt]ools/\nshot-[0-9].png\nlog[!s].txt\nliteral\\*.md\nspace\\ \n");
  assert.equal(rules.ignores("tools/a.js"), true);
  assert.equal(rules.ignores("Tools/a.js"), true);
  assert.equal(rules.ignores("shot-7.png"), true);
  assert.equal(rules.ignores("shot-x.png"), false);
  assert.equal(rules.ignores("log1.txt"), true);
  assert.equal(rules.ignores("logs.txt"), false);
  assert.equal(rules.ignores("literal*.md"), true);
  assert.equal(rules.ignores("literalX.md"), false);
  assert.equal(rules.ignores("space "), true);
  assert.equal(rules.ignores("space"), false);
});

test("what left a path out is named at its outermost folder", () => {
  const rules = ignoreRules("tools/\n*.psd\n");
  assert.equal(rules.ignoredAt("tools/shots/a.png"), "tools/");
  assert.equal(rules.ignoredAt("art/hero.psd"), "art/hero.psd");
  assert.equal(rules.ignoredAt("index.html"), null);
});

test("a file that leaves out the entry page says so, and one that does not has no problem", () => {
  assert.match(ignoreRules("*.html\n").problem ?? "", /leaves out index\.html, the page the game starts from/);
  assert.equal(ignoreRules("*.html\n!/index.html\n").problem, null);
  assert.equal(ignoreRules("tools/\n").problem, null);
});

test("names are compared composed, as every door writes paths", () => {
  const rules = ignoreRules("caf\u00e9/\n");
  assert.equal(rules.ignores("cafe\u0301/menu.png"), true);
});

/* Second review of 25 Nov 2026: a trailing `**` matched zero names, so `abc/**` left out abc
   itself and `!abc/keep.txt` could never bring a file back, which is git's usual idiom. */
test("abc/** is everything inside abc, so a later ! can keep one file", () => {
  const rules = ignoreRules("abc/**\n!abc/keep.txt\n");
  assert.equal(rules.ignores("abc/drop.txt"), true);
  assert.equal(rules.ignores("abc/keep.txt"), false);
  assert.equal(rules.ignores("abc", true), false);
  const folders = ignoreRules("tools/**/\n");
  assert.equal(folders.ignores("tools/b.js"), false);
  assert.equal(folders.ignores("tools/sub/b.js"), true);
});

test("POSIX classes, and a trailing tab is kept as git keeps it", () => {
  const rules = ignoreRules("shot-[[:digit:]].png\nnote\t\n");
  assert.equal(rules.ignores("shot-4.png"), true);
  assert.equal(rules.ignores("shot-x.png"), false);
  assert.equal(rules.ignores("note\t"), true);
  assert.equal(rules.ignores("note"), false);
});

test("too many patterns or too long a line is a problem, read as nothing", () => {
  const many = ignoreRules(Array.from({ length: 1001 }, (_, i) => `f${i}`).join("\n"));
  assert.match(many.problem ?? "", /more than 1,000 patterns/);
  assert.equal(many.ignores("f1"), false);
  assert.match(ignoreRules(`${"a".repeat(1001)}\n`).problem ?? "", /at most 1,000/);
  const started = performance.now();
  ignoreRules(`a${" ".repeat(65_000)}b\n`);
  assert.ok(performance.now() - started < 200, "a long run of spaces parses at once");
});

test("a full list over a big build answers in time a tab can afford", () => {
  const rules = ignoreRules(Array.from({ length: 1000 }, (_, i) => i % 2 ? `/dir${i}/` : `*.x${i}`).join("\n"));
  const paths = Array.from({ length: 25_000 }, (_, i) => `assets/level${i % 50}/sub${i % 7}/file${i}.png`);
  const started = performance.now();
  for (const path of paths) rules.ignores(path);
  assert.ok(performance.now() - started < 8_000, String(performance.now() - started));
});

/* Third review of 25 Nov 2026: the caps bound a list's size, not its work. A star before a
   long literal over long names is refused once it costs more than any real list. */
test("a list too costly to match throws the one refusal every door gives", async () => {
  const { IgnoreFileTooComplex } = await import("../src/ignore-file");
  const rules = ignoreRules(Array.from({ length: 900 }, (_, i) => `*${"a".repeat(60)}${i}b`).join("\n"));
  const started = performance.now();
  assert.throws(() => { for (let i = 0; i < 2000; i++) rules.ignores(`x/${"a".repeat(240)}${i}.png`); }, IgnoreFileTooComplex);
  assert.ok(performance.now() - started < 15_000, String(performance.now() - started));
});

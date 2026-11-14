import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, type PreflightFile } from '../src/index';
import "./credential-checks-on";

const file = (path: string, content: string): PreflightFile => ({ path, size: Buffer.byteLength(content), text: async () => content });

/* Final production pass, D13, 14 Nov 2026: CLI 0.9.7 shipped the .gitignore `opengame init`
   writes. Whatever client sent it, the bundle leaves git's own files out, and keeps a
   dot-named path a web export serves on purpose. */
test("git's own files are dropped from the bundle, .well-known is kept", async () => {
  const result = await preflight([
    file('index.html', '<!doctype html><canvas></canvas><script src="game.js"></script>'),
    file('game.js', 'requestAnimationFrame(function loop(){ requestAnimationFrame(loop); });'),
    file('.gitignore', '.opengame/\n'),
    file('assets/.gitkeep', ''),
    file('.gitattributes', '* text=auto\n'),
    file('.well-known/security.txt', 'Contact: mailto:security@example.com\n'),
    file('gitignore.txt', 'notes'),
  ]);
  assert.deepEqual([...result.include].sort(), ['.well-known/security.txt', 'game.js', 'gitignore.txt', 'index.html']);
});

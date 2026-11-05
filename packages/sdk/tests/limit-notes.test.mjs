import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/* A limits.json note is prose for people, and a bundle that ships one ships it to every game.
   `_requestsPerAddressNote` (5 Nov 2026) reached dist through a spread that dropped only
   `_comment`, and broke the CLI's typecheck and the template check. No `_` key of
   limits.json, at any depth, may reach dist: its name is looked for in every built file. */
const limits = JSON.parse(readFileSync(new URL('../../shared/limits.json', import.meta.url), 'utf8'));
const notes = new Set();
(function walk(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('_') && key.length > 4) notes.add(key);
    walk(child);
  }
})(limits);
const files = [];
(function list(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) list(path);
    else if (/\.(m?js|d\.ts|json)$/.test(name)) files.push(path);
  }
})(new URL('../dist', import.meta.url).pathname);

test('no limits.json note reaches the built SDK', () => {
  assert.ok(files.length > 0, 'dist is empty: build the SDK first');
  const found = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const note of notes) if (text.includes(`${note}"`) || text.includes(`${note}:`)) found.push(`${note} in ${file}`);
  }
  assert.deepEqual(found, []);
});

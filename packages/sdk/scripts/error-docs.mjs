#!/usr/bin/env node
/**
 * Write the error catalogue into the docs beside this package, from src/errors.ts,
 * the same table the SDK reads a failed result's `reason` from.
 *
 * README.md always carries the catalogue. AGENTS.md carries the same table in this
 * monorepo. The public repository does not ship that file: the mirror refuses the
 * name, and the published package lists README.md instead. A checkout without
 * AGENTS.md checks README.md alone. One that has the file still has to keep it
 * current, so deleting the markers there fails the check.
 *
 *   node scripts/error-docs.mjs          rewrite the copies that exist
 *   node scripts/error-docs.mjs --check  exit 1 if a copy that exists is out of date
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const start = '<!-- errors:start -->';
const end = '<!-- errors:end -->';

/** README, and AGENTS.md when this checkout has one. */
export function catalogueFileNames(directory) {
  if (!existsSync(resolve(directory, 'README.md'))) throw new Error(`${directory} has no README.md`);
  return existsSync(resolve(directory, 'AGENTS.md')) ? ['README.md', 'AGENTS.md'] : ['README.md'];
}

export async function errorCatalogueTable() {
  // Bundled rather than transformed, because a hint can be built from a generated module
  // (invalid_meta's comes from src/score-meta.ts) and a data: URL has nothing to import from.
  const source = await build({ entryPoints: [fileURLToPath(new URL('src/errors.ts', root))], bundle: true, write: false, format: 'esm', platform: 'neutral' });
  const { errorCatalogue } = await import(`data:text/javascript;base64,${Buffer.from(source.outputFiles[0].text).toString('base64')}`);
  const where = { room: 'thrown by rooms', result: 'returned', both: 'both' };
  return ['| Code | Where | Retry? | What to do |', '| --- | --- | --- | --- |',
    ...errorCatalogue.map(entry => `| \`${entry.code}\` | ${where[entry.where]} | ${entry.retryable ? 'yes' : 'no'} | ${entry.hint.replaceAll('|', '\\|')} |`)].join('\n');
}

function rewrite(text, table, name) {
  const from = text.indexOf(start), to = text.indexOf(end);
  if (from === -1 || to < from) throw new Error(`${name} has no ${start} ... ${end} block`);
  return `${text.slice(0, from + start.length)}\n${table}\n${text.slice(to)}`;
}

async function main() {
  const table = await errorCatalogueTable();
  let stale = false;
  for (const name of catalogueFileNames(fileURLToPath(root))) {
    const file = new URL(name, root);
    const next = rewrite(readFileSync(file, 'utf8'), table, name);
    if (next === readFileSync(file, 'utf8')) continue;
    if (process.argv.includes('--check')) { console.error(`${name}: the error catalogue is out of date. Run node scripts/error-docs.mjs.`); stale = true; }
    else writeFileSync(file, next);
  }
  process.exit(stale ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

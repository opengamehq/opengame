import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// The repository uses bundler resolution, which accepts declarations that fail
// in a consumer's NodeNext project. Compile outside the workspace so neither
// that setting nor the unpublished shared package can hide a packaging defect.
test('the built package supports a strict isolated NodeNext consumer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'og-sdk-types-'));
  try {
    const installed = join(root, 'node_modules/@opengamehq/sdk');
    await mkdir(installed, { recursive: true });
    await cp(new URL('../dist/', import.meta.url), join(installed, 'dist'), { recursive: true });
    await writeFile(join(installed, 'package.json'), await readFile(new URL('../package.json', import.meta.url)));
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'check.ts'), `import { og, type Leaderboard, type ScoreEntry, type Achievement, type AchievementUnlock, type AchievementResult } from '@opengamehq/sdk';
import { bridge, type BridgeOperation, type OpenGameBridge } from '@opengamehq/sdk/bridge';
import { og as adapterOg } from '@opengamehq/sdk/og-platform';
import { readAvatar, watchAvatar, type Avatar } from '@opengamehq/sdk/avatar';
const drawn: Avatar | null = readAvatar(og.player.avatar);
const shirt: string | null | undefined = drawn?.outfit?.colors.shirt.hex;
const stopWatching: () => void = watchAvatar(og, (next) => console.log(next?.head.shape, shirt));
stopWatching();
const sameApi: typeof og = adapterOg;
const achievements: AchievementResult<Achievement[]> = await sameApi.achievements.list();
const unlock: AchievementResult<AchievementUnlock> = await og.achievements.unlock('first_win');
console.log(achievements, unlock);
const native: OpenGameBridge = bridge;
const operation: BridgeOperation = 'board.top';
native.setHandler((kind, id, name, json) => { console.log(kind, id, name, JSON.parse(json)); });
native.request(operation, '{}');
const board: Leaderboard = og.leaderboard('points');
const result = await board.me();
if (result.ok) { const entry: ScoreEntry | null = result.value; console.log(entry?.score); }
const scored = await board.submit(10, { level: 'night 3', mode: 'siege', duration_ms: 1200 });
console.log(scored.ok);
// @ts-expect-error Score metadata takes level as a string, so a number fails at compile time.
await board.submit(10, { level: 3 });
// @ts-expect-error Only the policy's keys are allowed.
await board.submit(10, { stage: 'night 3' });
`);
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: false, noEmit: true, types: [],
    }, include: ['check.ts'] }));
    const require = createRequire(import.meta.url);
    const tsc = fileURLToPath(new URL('../bin/tsc', `file://${require.resolve('typescript')}`));
    let diagnostics;
    try {
      diagnostics = execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')], { encoding: 'utf8' });
    } catch (error) {
      // The compiler normally writes type errors to stdout. Preserve that
      // evidence before finally removes the isolated consumer directory.
      throw new Error(`Isolated NodeNext consumer failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`, { cause: error });
    }
    assert.equal(diagnostics, '');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the error catalogue in README.md and AGENTS.md matches src/errors.ts', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [new URL('../scripts/error-docs.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' });
});

test('a checkout without AGENTS.md checks the README catalogue only', async () => {
  const { catalogueFileNames } = await import('../scripts/error-docs.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'og-sdk-catalogue-'));
  try {
    await writeFile(join(dir, 'README.md'), 'readme\n');
    assert.deepEqual(catalogueFileNames(dir), ['README.md']);
    await writeFile(join(dir, 'AGENTS.md'), 'agents\n');
    assert.deepEqual(catalogueFileNames(dir), ['README.md', 'AGENTS.md']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

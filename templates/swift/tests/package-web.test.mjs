import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// These tiny files exercise filesystem commit/rollback only; they are not an
// engine fixture, compiled game or evidence that SwiftWasm runs.
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'opengame-swift-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'export'));
  mkdirSync(join(root, 'opengame-sdk/Web'), { recursive: true }); mkdirSync(join(root, 'Web'));
  cpSync(new URL('../scripts/package-web.mjs', import.meta.url), join(root, 'scripts/package-web.mjs'));
  writeFileSync(join(root, 'export/index.html'), '<html><script src="runtime.js"></script></html>');
  writeFileSync(join(root, 'export/game.wasm'), new Uint8Array(12));
  writeFileSync(join(root, 'opengame-sdk/Web/lifecycle.js'), 'helper');
  writeFileSync(join(root, 'opengame-sdk/LICENSE'), 'license');
  writeFileSync(join(root, 'Web/game-host.js'), 'host');
  writeFileSync(join(root, 'opengame.json'), '{}');
  // A stand-in for the installed SDK, resolved the way the script resolves the real one.
  const sdk = join(root, 'node_modules/@opengamehq/sdk');
  mkdirSync(join(sdk, 'dist'), { recursive: true });
  writeFileSync(join(sdk, 'package.json'), JSON.stringify({ name: '@opengamehq/sdk', version: '0.0.0', exports: { './global': './dist/opengame-global.js' } }));
  writeFileSync(join(sdk, 'dist/opengame-global.js'), 'sdk');
  writeFileSync(join(sdk, 'dist/opengame-global.js.LEGAL.txt'), 'notice');
  const { packageWeb } = await import(pathToFileURL(join(root, 'scripts/package-web.mjs')));
  return { root, packageWeb };
}

test('failed staged copy preserves previous export and allows normal retry', async t => {
  const { root, packageWeb } = await fixture(t);
  packageWeb(join(root, 'export'));
  const before = readFileSync(join(root, 'dist/index.html'), 'utf8');
  rmSync(join(root, 'Web/game-host.js'));
  assert.throws(() => packageWeb(join(root, 'export')), /ENOENT/);
  assert.equal(readFileSync(join(root, 'dist/index.html'), 'utf8'), before);
  writeFileSync(join(root, 'Web/game-host.js'), 'restored');
  assert.doesNotThrow(() => packageWeb(join(root, 'export')));
  assert.ok(existsSync(join(root, 'dist/.opengame-swift-export')));
});

test('the packaged page loads the bundled SDK, not /_og/sdk.js, and ships it with its notice', async t => {
  const { root, packageWeb } = await fixture(t);
  packageWeb(join(root, 'export'));
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  assert.doesNotMatch(html, /\/_og\/sdk\.js/);
  assert.ok(html.indexOf('src="opengame-global.js"') < html.indexOf('opengame-sdk/lifecycle.js'));
  assert.equal(readFileSync(join(root, 'dist/opengame-global.js'), 'utf8'), 'sdk');
  assert.equal(readFileSync(join(root, 'dist/opengame-global.js.LEGAL.txt'), 'utf8'), 'notice');
  rmSync(join(root, 'node_modules'), { recursive: true });
  assert.throws(() => packageWeb(join(root, 'export')), /OpenGame SDK is not installed/);
});

test('backup left by an interrupted swap is recovered before retry', async t => {
  const { root, packageWeb } = await fixture(t);
  packageWeb(join(root, 'export'));
  const { renameSync } = await import('node:fs');
  renameSync(join(root, 'dist'), join(root, '.build/opengame-swift-previous'));
  assert.doesNotThrow(() => packageWeb(join(root, 'export')));
  assert.ok(existsSync(join(root, 'dist/.opengame-swift-export')));
});

test('interrupted backup cleanup can retry using its external ownership record', async t => {
  const { root, packageWeb } = await fixture(t);
  packageWeb(join(root, 'export'));
  const backup = join(root, '.build/opengame-swift-previous');
  mkdirSync(backup); writeFileSync(join(backup, 'leftover'), 'partial cleanup');
  writeFileSync(backup + '.owned', 'opengame-swift-backup-v1\n');
  assert.doesNotThrow(() => packageWeb(join(root, 'export')));
  assert.equal(existsSync(backup), false);
});

test('build refuses reserved output before it can invoke a compiler', async t => {
  const { root, packageWeb } = await fixture(t);
  packageWeb(join(root, 'export'));
  cpSync(new URL('../scripts/build.mjs', import.meta.url), join(root, 'scripts/build.mjs'));
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
    encoding: 'utf8', env: { ...process.env, PACKAGE_TO_JS_OUTPUT: join(root, 'dist'), SWIFT_BIN: '/compiler-must-not-run' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output must be separate/);
  assert.ok(existsSync(join(root, 'dist/.opengame-swift-export')));
});

test('build refuses reserved output through direct, ancestor and dangling symlinks', async t => {
  const { root, packageWeb } = await fixture(t);
  packageWeb(join(root, 'export'));
  cpSync(new URL('../scripts/build.mjs', import.meta.url), join(root, 'scripts/build.mjs'));
  const { symlinkSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  symlinkSync(join(root, 'dist'), join(root, 'alias-dist'));
  symlinkSync(root, join(root, 'alias-root'));
  symlinkSync(join(root, '.build/opengame-swift-previous'), join(root, 'alias-backup'));
  for (const output of [join(root, 'alias-dist'), join(root, 'alias-root/dist/new-output'), join(root, 'alias-backup')]) {
    const result = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
      encoding: 'utf8', env: { ...process.env, PACKAGE_TO_JS_OUTPUT: output, SWIFT_BIN: '/compiler-must-not-run' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /output must be separate/);
  }
});

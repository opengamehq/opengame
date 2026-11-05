import { randomUUID } from 'node:crypto';
import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { binding, compare, inventory, json, readSafe, sourceTree } from './files.mjs';

// A bundled production dependency embeds its own packages, so esbuild's input
// list alone cannot identify every dependency whose copyright must travel with
// the SDK. Walk the dependencies package.json names and retain their notice
// files. The SDK ships none: multiplayer is not part of the SDK, and PeerJS
// left with it.
export async function sdkDependencyNotices(sdkRoot) {
  sdkRoot = await realpath(sdkRoot);
  const root = resolve(sdkRoot, '../..'), files = new Map(), packages = new Map(), sections = [];
  const ownPath = relative(root, join(sdkRoot, 'package.json')).split(sep).join('/');
  const declared = Object.keys(JSON.parse(await readSafe(root, ownPath)).dependencies ?? {}).sort(compare);
  // The CLI copies this file beside the global and refuses a zero-byte notice.
  // No bundled dependency is still a notice, not a missing one.
  if (!declared.length) return { files, packages, text: Buffer.from("This SDK build bundles no third-party runtime dependencies. Multiplayer is not part of the SDK.\n") };
  async function visit(name, from) {
    const require = createRequire(join(from, 'package.json'));
    let entry;
    try { entry = require.resolve(`${name}/package.json`); }
    catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; entry = require.resolve(name); }
    let directory = dirname(entry), manifest, manifestBytes;
    for (;;) {
      try {
        manifestBytes = await readSafe(root, relative(root, join(directory, 'package.json')).split(sep).join('/'));
        manifest = JSON.parse(manifestBytes);
        if (manifest.name === name) break;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const parent = dirname(directory);
      if (parent === directory) throw new Error(`Cannot locate dependency manifest: ${name}`);
      directory = parent;
    }
    if (packages.has(directory)) return;
    if (!manifest.version || typeof manifest.license !== 'string') throw new Error(`Missing dependency license identity: ${name}`);
    packages.set(directory, manifest);
    const prefix = relative(root, directory).split(sep).join('/');
    files.set(`${prefix}/package.json`, manifestBytes);
    const notices = (await readdir(directory)).filter(file => /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(file)).sort(compare);
    if (!notices.some(file => /^(?:licen[cs]e|copying)(?:[.-].*)?$/i.test(file))) throw new Error(`Missing dependency license text: ${name}`);
    sections.push(Buffer.from(`\n===== ${manifest.name}@${manifest.version} (${manifest.license}) =====\n`));
    for (const file of notices) {
      const path = `${prefix}/${file}`, bytes = await readSafe(root, path);
      if (!bytes.toString('utf8').trim()) throw new Error(`Empty dependency notice: ${path}`);
      files.set(path, bytes);
      sections.push(Buffer.from(`\n--- ${file} ---\n`), bytes, Buffer.from('\n'));
    }
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort(compare)) await visit(dependency, directory);
  }
  for (const name of declared) await visit(name, sdkRoot);
  return { files, packages, text: Buffer.concat(sections) };
}

export async function writeSdkBundleWithNotices(sdkRoot, result, outfile) {
  const notices = await sdkDependencyNotices(sdkRoot);
  const inputRoot = await realpath(sdkRoot);
  for (const input of Object.keys(result.metafile.inputs)) {
    const path = resolve(inputRoot, input);
    const parts = path.split(sep), moduleIndex = parts.lastIndexOf('node_modules');
    if (moduleIndex !== -1) {
      // A nested node_modules package is a different owner, even when its
      // ancestor's package has already supplied a license.
      const end = moduleIndex + (parts[moduleIndex + 1]?.startsWith('@') ? 3 : 2);
      if (!notices.packages.has(parts.slice(0, end).join(sep))) throw new Error(`Unaccounted SDK dependency: ${input}`);
    }
  }
  const target = resolve(sdkRoot, outfile), legal = `${target}.LEGAL.txt`;
  const script = result.outputFiles.find(file => file.path === target);
  if (!script || result.outputFiles.some(file => file.path !== target && file.path !== legal)) throw new Error(`Unexpected SDK bundle outputs: ${outfile}`);
  const retained = result.outputFiles.find(file => file.path === legal)?.contents ?? Buffer.alloc(0);
  await writeFile(legal, Buffer.concat([Buffer.from(retained), notices.text]));
  await writeFile(target, script.contents);
}

const locks = new Map();
function release(sdkRoot, token) {
  const lock = locks.get(resolve(sdkRoot));
  if (lock?.token !== token) return;
  locks.delete(resolve(sdkRoot));
  try { unlinkSync(lock.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
process.once('exit', () => { for (const [root, lock] of locks) { try { release(root, lock.token); } catch {} } });
/* Everything in this repository the SDK build reads, which is therefore what its receipt
   hashes, what check:deploys compares og-games and the pipeline against (both serve the
   built global to games), and what the compat harness copies to rebuild an older ref. It
   was two lists until 28 Oct 2026: the receipt learned about packages/ui's mascot folder
   when dist/avatar.js started reading it, check-deploys.mjs did not, and the compat copy
   built from that list failed on a folder it had never been told to extract. build.mjs
   refuses a build that reads a file outside this, so a new import cannot fall out of it;
   that is how limits.values.json, read by character-look.ts, was found missing too.
   Installed packages are not here: package-lock.json is, and sdkDependencyNotices above
   records the bytes of each one the SDK ships. */
export const SDK_SOURCE_TREES = ['packages/sdk/src', 'packages/shared/src',
  // dist/avatar.js carries the mascot colours, read from this folder at build time.
  'packages/ui/src/components/mascot'];
export const SDK_SOURCE_FILES = ['packages/sdk/avatar-catalogues.ts', 'packages/sdk/build.mjs', 'packages/sdk/package.json',
  'packages/sdk/tsconfig.json', 'packages/shared/package.json', 'packages/shared/limits.json', 'packages/shared/limits.values.json', 'packages/shared/limits.browser.json', 'package-lock.json',
  'scripts/engine-integrations/sdk-receipt.mjs', 'scripts/engine-integrations/files.mjs'];
export const SDK_SOURCE = [...SDK_SOURCE_TREES, ...SDK_SOURCE_FILES];

/** The inputs in an esbuild metafile, from a build run in `sdkRoot`, that the receipt does not hash. */
export function unhashedSdkInputs(sdkRoot, metafile) {
  const root = resolve(sdkRoot, '../..');
  return Object.keys(metafile.inputs).filter(input => {
    // esbuild names what is not a file in angle brackets: <stdin>, and one <define:...> per define.
    if (/^<[^>]*>$/.test(input)) return false;
    const path = relative(root, resolve(sdkRoot, input)).split(sep).join('/');
    if (path.split('/').includes('node_modules')) return false;
    return !SDK_SOURCE_FILES.includes(path) && !SDK_SOURCE_TREES.some(tree => path.startsWith(`${tree}/`));
  });
}

export async function sdkInputs(sdkRoot) {
  const root = resolve(sdkRoot, '../..'), files = new Map();
  for (const tree of SDK_SOURCE_TREES) for (const [name, bytes] of await sourceTree(root, tree)) files.set(name, bytes);
  for (const name of SDK_SOURCE_FILES) files.set(name, await readSafe(root, name));
  for (const [name, bytes] of (await sdkDependencyNotices(sdkRoot)).files) files.set(name, bytes);
  return { sha256: binding(files), files: inventory(files) };
}
export async function beginSdkBuild(sdkRoot) {
  const path = join(sdkRoot, 'dist/.engine-package-build.lock'), token = randomUUID();
  await mkdir(join(sdkRoot, 'dist'), { recursive: true });
  let fd;
  try { fd = openSync(path, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`SDK build already locked: ${path}. A crashed build's lock requires explicit inspection/removal.`); throw error; }
  try { writeFileSync(fd, json({ pid: process.pid, token })); } finally { closeSync(fd); }
  locks.set(resolve(sdkRoot), { path, token });
  try {
    await rm(join(sdkRoot, 'dist/engine-package-build.json'), { force: true });
    return { ...await sdkInputs(sdkRoot), buildToken: token };
  } catch (error) { release(sdkRoot, token); throw error; }
}
export async function writeSdkBuildReceipt(sdkRoot, { version, inputs }) {
  if (!inputs?.buildToken || locks.get(resolve(sdkRoot))?.token !== inputs.buildToken) throw new Error('SDK receipt requires ownership of the current build lock');
  try {
    const current = await sdkInputs(sdkRoot);
    if (inputs.sha256 !== current.sha256) throw new Error('SDK source changed during build; rebuild after source freezes');
    const files = new Map();
    for (const name of ['opengame-global.js', 'opengame-global.js.LEGAL.txt']) files.set(name, await readSafe(join(sdkRoot, 'dist'), name));
    if (!files.get('opengame-global.js.LEGAL.txt').includes((await sdkDependencyNotices(sdkRoot)).text)) throw new Error('SDK dependency notices are incomplete');
    const receipt = { schemaVersion: 1, name: '@opengamehq/sdk', version, source: current, artifacts: inventory(files) };
    await writeFile(join(sdkRoot, 'dist/engine-package-build.json'), json(receipt));
    return receipt;
  } finally { release(sdkRoot, inputs.buildToken); }
}
export async function verifiedSdk(root) {
  const sdkRoot = join(root, 'packages/sdk'), dist = join(sdkRoot, 'dist');
  try { await lstat(join(dist, '.engine-package-build.lock')); throw new Error('SDK build is in progress or left a lock; complete/inspect it before packaging'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let receipt, marker;
  try { marker = await readSafe(dist, 'engine-package-build.json'); receipt = JSON.parse(marker.toString()); }
  catch (error) { throw new Error(`SDK build marker missing/invalid. Rebuild packages/sdk after source freezes: ${error.message}`); }
  const pkg = JSON.parse((await readSafe(sdkRoot, 'package.json')).toString());
  const inputs = await sdkInputs(sdkRoot);
  if (receipt.schemaVersion !== 1 || receipt.name !== pkg.name || !/^\d+\.\d+\.\d+$/.test(receipt.version) || receipt.source?.sha256 !== inputs.sha256 ||
      JSON.stringify(receipt.source.files) !== JSON.stringify(inputs.files)) throw new Error('Stale SDK dist: source/build inputs do not match its build marker');
  const files = new Map();
  for (const name of ['opengame-global.js', 'opengame-global.js.LEGAL.txt']) files.set(name, await readSafe(dist, name));
  if (!files.get('opengame-global.js.LEGAL.txt').includes((await sdkDependencyNotices(sdkRoot)).text)) throw new Error('SDK dependency notices are incomplete');
  if (JSON.stringify(inventory(files)) !== JSON.stringify(receipt.artifacts)) throw new Error('SDK artifact digest does not match the successful build');
  // Detect a new build that began while this read was in flight. Return only the
  // exact bytes parsed above, never a second unvalidated read of the marker.
  try { await lstat(join(dist, '.engine-package-build.lock')); throw new Error('SDK build changed while packaging'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!(await readSafe(dist, 'engine-package-build.json')).equals(marker)) throw new Error('SDK build changed while packaging');
  return { receipt, files, marker };
}

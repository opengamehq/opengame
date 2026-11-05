import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync, lstatSync, mkdtempSync, renameSync, realpathSync, readlinkSync } from 'node:fs';
import { resolve, join, relative, sep, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function wasmIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).some(entry => entry.isDirectory()
    ? wasmIn(join(directory, entry.name)) : entry.name.endsWith('.wasm') && statSync(join(directory, entry.name)).size > 8);
}
function owned(directory) {
  return existsSync(directory) && !lstatSync(directory).isSymbolicLink() && existsSync(join(directory, '.opengame-swift-export'));
}
// Resolve existing aliases and then reconstruct missing output descendants.
// A dangling symlink is still an alias, so inspect it before walking upward.
function physicalPath(path, seen = new Set()) {
  path = resolve(path);
  if (seen.has(path)) throw new Error('Output path contains a symlink cycle.');
  seen.add(path);
  try { return realpathSync(path); }
  catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }
  try {
    if (lstatSync(path).isSymbolicLink()) return physicalPath(resolve(dirname(path), readlinkSync(path)), seen);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }
  const parent = dirname(path);
  if (parent === path) throw new Error('Output path cannot be resolved.');
  return join(physicalPath(parent, seen), basename(path));
}
export function validateSource(source) {
  source = physicalPath(source);
  const reserved = [join(root, 'dist'), join(root, '.build/opengame-swift-previous'), join(root, '.build/opengame-swift-previous.owned'), join(root, '.build/opengame-swift-previous.owned.tmp')];
  const overlaps = (a, b) => { const path = relative(a, b); return path === '' || (!path.startsWith(`..${sep}`) && path !== '..'); };
  if (reserved.map(path => physicalPath(path)).some(path => overlaps(source, path) || overlaps(path, source))) {
    throw new Error('PackageToJS output must be separate from dist/ and the package backup.');
  }
  return source;
}
// The SDK ships inside the build, from the same file: dependency the npm starters bundle.
// The page used to load /_og/sdk.js instead, which og-games serves only under 2027-02, a
// contract a release reaches only when its scan finds threads, so under 2026-11 it 404'd
// and the game found no OpenGame. build.mjs resolves it before the compiler runs, so a
// missing SDK stops the build at once and says what to do; packageWeb resolves it again
// for an export packaged on its own.
export function sdkGlobal() {
  try {
    const path = fileURLToPath(import.meta.resolve('@opengamehq/sdk/global'));
    if (existsSync(path)) return path;
  } catch {}
  // A copy outside the repository keeps a file: link to a folder that is not there, and npm
  // install reports success anyway, so "run npm install" alone would send people in a circle.
  throw new Error(existsSync(join(root, 'node_modules/@opengamehq/sdk/package.json'))
    ? 'The OpenGame SDK is installed but not built. Run npm run build in its packages/sdk folder, then build again.'
    : 'The OpenGame SDK is not installed. Install it as https://docs.opengame.io/quickstart describes, or inside the OpenGame repository run npm install here. Then build again.');
}
export function packageWeb(source) {
  source = validateSource(source);
  const destination = join(root, 'dist');
  const temporary = join(root, '.build');
  const backup = join(temporary, 'opengame-swift-previous');
  const record = backup + '.owned';
  const identity = 'opengame-swift-backup-v1\n';
  const recorded = () => existsSync(record) && readFileSync(record, 'utf8') === identity;
  const mark = () => {
    if (existsSync(record)) {
      if (!recorded()) throw new Error('The backup ownership record is not recognized.');
      return;
    }
    writeFileSync(record + '.tmp', identity);
    renameSync(record + '.tmp', record);
  };
  const removeBackup = () => {
    mark();
    rmSync(backup, { recursive: true });
    rmSync(record);
  };
  if (!existsSync(join(source, 'index.html')) || !wasmIn(source)) throw new Error('Expected a real PackageToJS web output with index.html and nonempty wasm.');
  let html = readFileSync(join(source, 'index.html'), 'utf8');
  if (html.includes('<!-- OpenGame Swift shell -->')) throw new Error('Use the original PackageToJS export, not an already patched shell.');
  const firstScript = html.search(/<script\b/i);
  if (firstScript < 0) throw new Error('PackageToJS output has no runtime script.');
  const sdk = sdkGlobal();
  const scripts = '<!-- OpenGame Swift shell -->\n<script src="opengame-global.js"></script>\n<script src="opengame-sdk/lifecycle.js"></script>\n<script src="game-host.js"></script>\n';
  html = html.slice(0, firstScript) + scripts + html.slice(firstScript);
  mkdirSync(temporary, { recursive: true });
  // Recover either side of an interrupted directory swap before retrying.
  if (existsSync(backup)) {
    if (!owned(backup) && !(recorded() && owned(destination))) throw new Error('The Swift package backup is not owned by this script.');
    if (!existsSync(destination)) { renameSync(backup, destination); if (recorded()) rmSync(record); }
    else if (owned(destination)) removeBackup();
    else throw new Error('dist/ is unrelated to the saved package backup.');
  }
  if (!existsSync(backup) && recorded()) rmSync(record);
  if (existsSync(destination) && !owned(destination)) throw new Error('dist/ is not a package made by this script. Move it aside first.');
  const staging = mkdtempSync(join(temporary, 'opengame-swift-stage-'));
  try {
    cpSync(source, staging, { recursive: true });
    mkdirSync(join(staging, 'opengame-sdk'), { recursive: true });
    cpSync(join(root, 'opengame-sdk/Web/lifecycle.js'), join(staging, 'opengame-sdk/lifecycle.js'));
    cpSync(join(root, 'opengame-sdk/LICENSE'), join(staging, 'opengame-sdk/LICENSE'));
    cpSync(join(root, 'Web/game-host.js'), join(staging, 'game-host.js'));
    cpSync(join(root, 'opengame.json'), join(staging, 'opengame.json'));
    cpSync(sdk, join(staging, 'opengame-global.js'));
    cpSync(`${sdk}.LEGAL.txt`, join(staging, 'opengame-global.js.LEGAL.txt'));
    writeFileSync(join(staging, 'index.html'), html);
    writeFileSync(join(staging, '.opengame-swift-export'), 'Generated by scripts/package-web.mjs\n');
    if (existsSync(destination)) { mark(); renameSync(destination, backup); }
    try { renameSync(staging, destination); }
    catch (error) {
      if (!existsSync(destination) && existsSync(backup)) { renameSync(backup, destination); if (recorded()) rmSync(record); }
      throw error;
    }
    if (existsSync(backup)) removeBackup();
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true });
  }
  console.log('Packaged the genuine SwiftWasm export into dist/.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: npm run package:web -- /absolute/path/to/PackageToJS/output');
  packageWeb(process.argv[2]);
}

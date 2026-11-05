import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The SDK ships inside the build, from the same file: dependency the npm starters bundle.
// The page used to load /_og/sdk.js instead, which og-games serves only under 2027-02, a
// contract a release reaches only when its scan finds threads, so under 2026-11 it 404'd
// and the game found no OpenGame. Resolved before the compiler runs, so a missing SDK
// stops the build at once and says what to do.
const sdk = sdkGlobal();
const root = fileURLToPath(new URL('.', import.meta.url));
const project = join(root, '.build/flutter');
mkdirSync(join(root, '.build'), { recursive: true });
if (!existsSync(join(project, 'pubspec.yaml'))) {
  execFileSync('flutter', ['create', '--platforms=web', '--project-name=opengame_target', project], { cwd: root, stdio: 'inherit' });
}
if (!/^  flame:/m.test(readFileSync(join(project, 'pubspec.yaml'), 'utf8'))) {
  execFileSync('flutter', ['pub', 'add', 'flame'], { cwd: project, stdio: 'inherit' });
}
execFileSync('flutter', ['pub', 'add', 'opengame:{"path":"../../opengame-sdk"}'], { cwd: project, stdio: 'inherit' });
cpSync(join(root, 'lib'), join(project, 'lib'), { recursive: true });
cpSync(join(root, 'web'), join(project, 'web'), { recursive: true });
// Flutter copies web assets into its export. Put the helper in that input tree
// before building, so index.html never points at an unpackaged native adapter.
cpSync(join(root, 'opengame-sdk/web/lifecycle.js'), join(project, 'web/opengame-lifecycle.js'));
// The SDK goes into the same input tree, for the same reason.
copyFileSync(sdk, join(project, 'web/opengame-global.js'));
copyFileSync(`${sdk}.LEGAL.txt`, join(project, 'web/opengame-global.js.LEGAL.txt'));
execFileSync('flutter', ['build', 'web', '--no-web-resources-cdn'], { cwd: project, stdio: 'inherit' });
const output = join(root, 'dist');
rmSync(output, { recursive: true, force: true });
cpSync(join(project, 'build/web'), output, { recursive: true });
cpSync(join(root, 'opengame.json'), join(output, 'opengame.json'));

function sdkGlobal() {
  try {
    const path = fileURLToPath(import.meta.resolve('@opengamehq/sdk/global'));
    if (existsSync(path)) return path;
  } catch {}
  // A copy outside the repository keeps a file: link to a folder that is not there, and npm
  // install reports success anyway, so "run npm install" alone would send people in a circle.
  throw new Error(existsSync('node_modules/@opengamehq/sdk/package.json')
    ? 'The OpenGame SDK is installed but not built. Run npm run build in its packages/sdk folder, then build again.'
    : 'The OpenGame SDK is not installed. Install it as https://docs.opengame.io/quickstart describes, or inside the OpenGame repository run npm install here. Then build again.');
}

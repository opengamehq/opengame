import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The SDK ships inside the build, from the same file: dependency the npm starters bundle.
// The page used to load /_og/sdk.js instead, which og-games serves only under 2027-02, a
// contract a release reaches only when its scan finds threads, so under 2026-11 it 404'd
// and the game found no OpenGame. Resolved before the compiler runs, so a missing SDK
// stops the build at once and says what to do.
const sdk = sdkGlobal();
const root = fileURLToPath(new URL('.', import.meta.url));
const project = join(root, '.build/browser');
const published = join(root, '.build/published');
const output = join(root, 'dist');
mkdirSync(join(root, '.build'), { recursive: true });
if (!existsSync(project)) {
  execFileSync('dotnet', ['new', 'wasmbrowser', '-n', 'OpenGameTarget', '-o', project], { cwd: root, stdio: 'inherit' });
}

const projectFile = join(project, 'OpenGameTarget.csproj');
let definition = readFileSync(projectFile, 'utf8');
const reference = '../../opengame-sdk/OpenGame.Sdk.csproj';
if (!definition.includes(reference)) {
  if (!definition.includes('</Project>')) throw new Error('The generated .NET project has no closing Project element.');
  definition = definition.replace('</Project>', `  <PropertyGroup>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="${reference}" />
  </ItemGroup>
</Project>`);
  writeFileSync(projectFile, definition);
}
cpSync(join(root, 'Program.cs'), join(project, 'Program.cs'));
rmSync(published, { recursive: true, force: true });
// No .br or .gz copies. Publish writes them for a server that picks an encoding per
// request; the runtime asks for the plain names either way, so they are never loaded
// here. OpenGame refuses the ones whose inner file is not on its precompressed list
// (blazor.boot.json.br, icudt_*.dat.gz, the .pdb.gz symbols) as nested archives. Passed
// on the command line rather than written into the project so an existing
// .build/browser gets it too.
execFileSync('dotnet', ['publish', '-c', 'Release', '-o', published, '-p:CompressionEnabled=false'], { cwd: project, stdio: 'inherit' });

function findBrowserRoot(directory) {
  if (existsSync(join(directory, '_framework/dotnet.js'))) return directory;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findBrowserRoot(join(directory, entry.name));
    if (found) return found;
  }
  return null;
}
const browserRoot = findBrowserRoot(published);
if (!browserRoot) throw new Error('The installed .NET SDK did not produce a browser publish with _framework/dotnet.js.');
rmSync(output, { recursive: true, force: true });
cpSync(browserRoot, output, { recursive: true });
cpSync(join(root, 'index.html'), join(output, 'index.html'));
cpSync(join(root, 'main.js'), join(output, 'main.js'));
cpSync(join(root, 'node-only.js'), join(output, 'node-only.js'));
// A plain wasmbrowser export need not publish Razor static web assets. Ship
// both module dependencies explicitly at the URL passed to ConnectAsync.
cpSync(join(root, 'opengame-sdk/wwwroot'), join(output, 'opengame-sdk'), { recursive: true });
cpSync(join(root, 'opengame.json'), join(output, 'opengame.json'));
copyFileSync(sdk, join(output, 'opengame-global.js'));
copyFileSync(`${sdk}.LEGAL.txt`, join(output, 'opengame-global.js.LEGAL.txt'));

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

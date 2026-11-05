import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packageWeb, sdkGlobal, validateSource, root } from './package-web.mjs';

const swift = process.env.SWIFT_BIN || 'swift';
const sdk = process.env.SWIFT_WASM_SDK || 'wasm32-unknown-wasip1';
const base = ['package', '--swift-sdk', sdk];
// Reject paths the packager owns before even asking the toolchain to run.
const output = validateSource(resolve(root, process.env.PACKAGE_TO_JS_OUTPUT || '.build/opengame-web'));
// Before the compiler too: a missing SDK should not cost a release build to discover.
sdkGlobal();
// The installed plugin is the authority for flags. Do not substitute a native
// swift build or manufacture an HTML/wasm pair when the web packager is missing.
const help = spawnSync(swift, [...base, 'js', '--help'], { cwd: root, encoding: 'utf8' });
if (help.error) throw new Error(`Install Swift with a matching WebAssembly SDK: ${help.error.message}`);
if (help.status !== 0) throw new Error(`PackageToJS (swift package js) is required.\n${help.stderr || help.stdout}`);
const usage = `${help.stdout}\n${help.stderr}`;
const supportsOutput = /--output(?:\s|=|,|<|\[|$)/m.test(usage);
if (!supportsOutput && !process.env.PACKAGE_TO_JS_OUTPUT) {
  throw new Error('This PackageToJS version does not advertise --output. Set PACKAGE_TO_JS_OUTPUT to its documented output directory, or run it separately and use npm run package:web -- <export>.');
}
const ownedOutput = join(root, '.build/opengame-web');
if (output === ownedOutput && existsSync(output)) rmSync(output, { recursive: true });
const args = [...base, '-c', 'release', 'js'];
if (/--product\b/.test(usage)) args.push('--product', 'SwiftTarget');
if (supportsOutput) args.push('--output', output);
const result = spawnSync(swift, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
packageWeb(output);

import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
execFileSync('cargo', ['build', '--target', 'wasm32-unknown-unknown', '--release'], { stdio: 'inherit' });
copyFileSync('target/wasm32-unknown-unknown/release/opengame_rust_target.wasm', 'dist/game.wasm');
copyFileSync('shell.html', 'dist/index.html');

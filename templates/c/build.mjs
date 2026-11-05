import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
execFileSync('emcc', ['main.c', '-O2', '-sALLOW_MEMORY_GROWTH=1', '-o', 'dist/index.html'], { stdio: 'inherit' });

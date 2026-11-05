import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
const lib = process.env.RAYLIB_WEB_LIBRARY, include = process.env.RAYLIB_INCLUDE;
if (!lib || !include) throw new Error('Set RAYLIB_WEB_LIBRARY to a web-built libraylib.a and RAYLIB_INCLUDE to its headers.');
execFileSync('emcc', ['main.c', lib, '-I', include, '-O2', '-sUSE_GLFW=3', '-sASYNCIFY', '-sALLOW_MEMORY_GROWTH=1', '-o', 'dist/index.html'], { stdio: 'inherit' });

import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
const { existsSync, cpSync } = await import('node:fs');
const runtime=process.env.PYODIDE_RUNTIME_DIR;
if (!runtime || !existsSync(`${runtime}/pyodide.js`) || !existsSync(`${runtime}/pyodide.asm.wasm`)) throw new Error('Set PYODIDE_RUNTIME_DIR to a complete, pinned Pyodide distribution.');
cpSync(runtime,'dist/runtime',{recursive:true});
copyFileSync('main.py','dist/main.py');copyFileSync('shell.html','dist/index.html');

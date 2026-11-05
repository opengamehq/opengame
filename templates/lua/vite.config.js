import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [{
    name: 'opengame-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'opengame.json', source: readFileSync(new URL('./opengame.json', import.meta.url), 'utf8') });
      // src/main.js bundles the SDK's global build, so its licence notice ships too.
      const notice = `${fileURLToPath(import.meta.resolve('@opengamehq/sdk/global'))}.LEGAL.txt`;
      this.emitFile({ type: 'asset', fileName: 'opengame-global.js.LEGAL.txt', source: readFileSync(notice, 'utf8') });
    },
  }],
});

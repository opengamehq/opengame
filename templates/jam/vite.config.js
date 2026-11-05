import { defineConfig } from "vite";

// Relative asset URLs, so the build works on any host and in a private preview.
// Source maps stay off: they are left out of the upload anyway.
export default defineConfig({
  base: "./",
  // The built game is one chunk of about 560 kB, nearly all of it three.js (555.5 kB with
  // three r185 on 23 Oct 2026), so Vite's default 500 kB warning would always fire.
  build: { outDir: "dist", sourcemap: false, target: "es2022", chunkSizeWarningLimit: 1024 },
});

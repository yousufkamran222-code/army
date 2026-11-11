import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  server: { host: true },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const webDir = fileURLToPath(new URL('./', import.meta.url));
const distDir = fileURLToPath(new URL('../dist', import.meta.url));

export default defineConfig({
  root: webDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: distDir,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Frontend dev server talks to the real readingroom server.
      '/api': 'http://127.0.0.1:9345',
    },
  },
});

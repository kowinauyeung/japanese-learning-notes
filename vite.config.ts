import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { buildInfo } from './build-info';

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: buildInfo(mode),
  resolve: {
    // Array form, because the e2e override has to be matched before the bare
    // `@` prefix that would otherwise swallow it.
    alias: [
      // The one seam the end-to-end build replaces: `src/lib/backend.ts` names
      // the real adapters, `backend.e2e.ts` names in-memory ones. Swapping the
      // module rather than reading a runtime flag is what keeps the fakes out
      // of every other build — in `dev`, `production` and any other mode this
      // entry does not exist, so nothing can resolve them.
      ...(mode === 'e2e'
        ? [{ find: /^@\/lib\/backend$/, replacement: src('lib/backend.e2e.ts') }]
        : []),
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
}));

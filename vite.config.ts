import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildInfo } from './build-info.ts';
import { devManifestPlugin } from './manifest-plugin.ts';
import { pwaOptions } from './pwa-config.ts';

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig(({ mode }) => {
  // The default 'VITE_' prefix filter is enough: VITE_FIREBASE_PROJECT_ID
  // already carries it, and there is no reason for this config to see every
  // other environment variable on the machine or CI runner building it.
  const env = loadEnv(mode, process.cwd());

  return {
    // The worker's settings live in pwa-config.ts, where a test can read them
    // back — see the comment at the top of that file.
    plugins: [
      react(),
      tailwindcss(),
      VitePWA(pwaOptions(mode)),
      devManifestPlugin(mode, env.VITE_FIREBASE_PROJECT_ID ?? ''),
    ],
    define: buildInfo(mode),
    resolve: {
      // Array form, because the e2e override has to be matched before the bare
      // `@` prefix that would otherwise swallow it.
      alias: [
        // The one seam the end-to-end build replaces: `src/lib/backend.ts`
        // names the real adapters, `backend.e2e.ts` names in-memory ones.
        // Swapping the module rather than reading a runtime flag is what keeps
        // the fakes out of every other build — in `dev`, `production` and any
        // other mode this entry does not exist, so nothing can resolve them.
        ...(mode === 'e2e'
          ? [{ find: /^@\/lib\/backend$/, replacement: src('lib/backend.e2e.ts') }]
          : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
  };
});

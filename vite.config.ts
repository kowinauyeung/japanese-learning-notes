import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildInfo } from './build-info.ts';
import {
  CORE_FONT_DIR,
  RUNTIME_FONT_DIR,
  assetsInlineLimit,
  isCoreFontFile,
} from './font-config.ts';
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
    // Its own directory, because Playwright starts the two end-to-end servers
    // in parallel: sharing `dist/` would let whichever build finished second
    // empty the other's output from under a server already serving it.
    build: {
      outDir: mode === 'e2e-pwa' ? 'dist-e2e-pwa' : 'dist',

      // Fonts are never inlined, whatever their size — see `font-config.ts`,
      // where the reason is the same one that splits them into two directories.
      assetsInlineLimit,

      rollupOptions: {
        output: {
          /**
           * Font files are emitted into one of two directories according to
           * `font-config.ts`, and everything else keeps Vite's default layout.
           *
           * The split exists so the service worker can treat the two halves
           * differently — `pwa-config.ts` precaches one directory and
           * runtime-caches the other. Doing it by directory rather than by
           * matching file names in the worker's configuration is what keeps
           * that decision in one place: Workbox sees paths, and a path is
           * something a glob can say something true about, whereas the file
           * names here arrive hashed and would need the rule restated as a
           * pattern that has to stay in step with this one.
           */
          assetFileNames: (asset) => {
            const name = asset.names?.[0] ?? '';
            if (!name.endsWith('.woff2')) return 'assets/[name]-[hash][extname]';
            const directory = isCoreFontFile(name) ? CORE_FONT_DIR : RUNTIME_FONT_DIR;
            return `${directory}/[name]-[hash][extname]`;
          },
        },
      },
    },
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
        //
        // `e2e-pwa` is the same build with the live service worker left in, and
        // it needs a third module rather than a flag: see `backend.e2e-pwa.ts`
        // for why the fake update port is what keeps the worker unregistered.
        ...(mode === 'e2e' || mode === 'e2e-pwa'
          ? [
              {
                find: /^@\/lib\/backend$/,
                replacement: src(
                  mode === 'e2e-pwa' ? 'lib/backend.e2e-pwa.ts' : 'lib/backend.e2e.ts',
                ),
              },
            ]
          : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
  };
});

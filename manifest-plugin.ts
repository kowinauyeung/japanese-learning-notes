import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

interface WebManifest {
  name: string;
  short_name: string;
  [key: string]: unknown;
}

/**
 * `src/lib/build.ts`'s `siteTitle` says the same thing, but this file loads
 * before any Vite `define` exists to answer it: importing that module here
 * would run its top-level `__APP_VERSION__` read against an identifier
 * nothing has defined yet and crash `vite build` itself. Kept in step by
 * hand instead — the call `vitest.config.ts` already makes about
 * `vite.config.ts`, for the same reason.
 */
function isDevBuild(projectId: string, mode: string): boolean {
  if (mode !== 'production') return true;
  return projectId.endsWith('-dev') || projectId.startsWith('demo-');
}

function devTitle(name: string, projectId: string, mode: string): string {
  return isDevBuild(projectId, mode) ? `[DEV]${name}` : name;
}

export function withDevTitle(manifest: WebManifest, projectId: string, mode: string): WebManifest {
  return {
    ...manifest,
    name: devTitle(manifest.name, projectId, mode),
    short_name: devTitle(manifest.short_name, projectId, mode),
  };
}

/**
 * iOS's "Add to Home Screen" reads the linked manifest's `name`/`short_name`
 * for the icon label, not `<title>` — so telling the deployed dev site apart
 * from production there means rewriting the one manifest file both share
 * (see `pwa-config.ts`'s `manifest: false`).
 *
 * `closeBundle`, because it fires once the whole build — including Vite's own
 * copy of `public/` into the output directory — has finished writing, so this
 * reads back the file that is about to be deployed rather than the source
 * template in `public/`.
 */
export function devManifestPlugin(mode: string, projectId: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'dev-manifest-title',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const path = resolve(outDir, 'manifest.webmanifest');
      const manifest = JSON.parse(readFileSync(path, 'utf-8')) as WebManifest;
      writeFileSync(path, `${JSON.stringify(withDevTitle(manifest, projectId, mode), null, 2)}\n`);
    },
  };
}

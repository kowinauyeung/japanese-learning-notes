/**
 * Which build is this — the three facts every bug report needs first.
 *
 * Injected by Vite at build time (see `vite.config.ts`), not read at runtime,
 * so they cannot drift from the bundle they describe. A build timestamp was
 * considered and rejected: it says *when* a bundle was made, and the question
 * a report has to answer is *what source it came from*.
 */
declare const __APP_VERSION__: string;
declare const __COMMIT_SHA__: string;
declare const __BUILD_MODE__: string;

export const appVersion = __APP_VERSION__;
export const commitSha = __COMMIT_SHA__;

/**
 * The environment as a reader understands it, not as Vite names it.
 *
 * `production` is the mode used for every non-development build, including the
 * one deployed to `goitei-dev`, so the mode alone would label the dev site
 * "Production". The project id is what actually distinguishes them.
 */
export type Environment = 'Production' | 'Development' | 'Local';

export function environmentOf(projectId: string, mode = __BUILD_MODE__): Environment {
  if (mode !== 'production') return 'Local';
  return projectId.endsWith('-dev') || projectId.startsWith('demo-') ? 'Development' : 'Production';
}

/** `v0.1.0 · d406a07 · Production` — one line, the same everywhere it appears. */
export function buildLine(projectId: string): string {
  return `v${appVersion} · ${commitSha} · ${environmentOf(projectId)}`;
}

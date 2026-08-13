import pkg from './package.json' with { type: 'json' };

/**
 * The three build facts, as Vite `define` entries.
 *
 * Shared by `vite.config.ts` and `vitest.config.ts` rather than written twice.
 * The alias below them is duplicated by hand on purpose — importing one config
 * from the other drags its plugins along — but these are values, not plugins,
 * and a test that reads a different version from the bundle it is testing would
 * be measuring nothing.
 *
 * The commit is what CI supplies and the part that matters: a version alone
 * cannot tell two deploys of `0.1.0` apart, and a build timestamp records when
 * a bundle was made rather than what source it came from. Outside Actions it is
 * `dev`, which is the honest answer for a bundle built from a working tree that
 * may not be committed at all.
 */
export const buildInfo = (mode: string) => ({
  __APP_VERSION__: JSON.stringify(pkg.version),
  __COMMIT_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
  __BUILD_MODE__: JSON.stringify(mode),
});

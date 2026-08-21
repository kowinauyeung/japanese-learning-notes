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
 *
 * **The end-to-end build is pinned, and it has to be** — even though nothing
 * currently screenshots it. It used to: the build line rendered in the
 * footer, so the commit sat inside two baselines, and unpinned it changes on
 * every commit — measured once at exactly the width of a seven-character SHA,
 * 314 pixels, identically on both images. The build line has since moved to
 * the account page, which no baseline captures, but the pin stays so the next
 * baseline anywhere near build info does not rediscover the same flake.
 * `.env.e2e`'s fixed project id is the same reasoning, and it is still live:
 * the login screen prints it into `login.png` today.
 */
const E2E_COMMIT = 'e2e0000';

/**
 * `DEPLOY_SHA` first, and it is not a preference.
 *
 * On a `workflow_dispatch` run `GITHUB_SHA` is the commit the *workflow* ran
 * on — the default branch's head — not the one being released. The production
 * workflow takes a SHA as input and builds that, so the two differ in exactly
 * the case that matters: a rollback deploys an older commit while the account
 * page claims the newer one, sending whoever reads a bug report to source
 * that was never running.
 */
const deployedSha = () => process.env.DEPLOY_SHA || process.env.GITHUB_SHA;

export const buildInfo = (mode: string) => ({
  __APP_VERSION__: JSON.stringify(pkg.version),
  __COMMIT_SHA__: JSON.stringify(
    mode === 'e2e' ? E2E_COMMIT : (deployedSha() ?? 'dev').slice(0, 7),
  ),
  __BUILD_MODE__: JSON.stringify(mode),
});

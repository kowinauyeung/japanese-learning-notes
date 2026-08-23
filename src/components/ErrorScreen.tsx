import { useEffect, useMemo } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { CopyDiagnostics } from '@/components/CopyDiagnostics';
import { useI18n } from '@/i18n/context';
import { newErrorId } from '@/lib/diagnostics';
import { Component as NotFound } from '@/routes/NotFound';

/**
 * What a thrown render or a failed lazy import looks like to a user.
 *
 * Two things it deliberately does not do. **It does not print the error**: the
 * message can carry a document id or a query, and the person reading it cannot
 * act on a stack trace anyway. And **it does not offer to go back** — whatever
 * threw is one route back, so the only reliable exits are a reload and the
 * dashboard.
 *
 * The error is logged to the console, where a developer with the tab open can
 * still see it, and identified by a short id so a screenshot and a report can
 * be matched to each other.
 */
export function ErrorScreen() {
  const error = useRouteError();
  const errorId = useMemo(() => newErrorId(), []);
  const { t } = useI18n();

  // In an effect, not the render body: StrictMode double-invokes render, so
  // this logged twice per error and again on every re-render.
  //
  // Above the 404 branch below, because a hook behind an early return runs in
  // a different order depending on the error — which is the rule, and here it
  // is also the bug: a 404 would leave the previous error's log unrepeated.
  useEffect(() => {
    console.error(`[${errorId}]`, error);
  }, [errorId, error]);

  /**
   * A mistyped address arrives here, not at a catch-all route.
   *
   * `/` is a layout route with children, so React Router matches it, fails to
   * find a child for the rest of the path, and throws a 404 *through this
   * boundary* — a top-level `path: '*'` never gets a turn. Measured: before this
   * branch existed, /no-such-page rendered 問題が発生しました with an error id
   * and a link to the report form, which invites a bug report for a typo.
   *
   * Rendered rather than redirected, so the address the user typed stays in the
   * bar where they can see what went wrong.
   */
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-md rounded-card bg-card p-8 text-center shadow-panel">
        <h1 className="font-display text-xl font-bold">{t('error.title')}</h1>
        <p className="mt-3 text-sm text-muted">{t('error.description')}</p>
        <p className="mt-2 font-display text-sm tabular-nums">{t('error.id', { id: errorId })}</p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 flex-1 rounded-pill bg-accent text-sm font-semibold text-on-accent"
          >
            {t('error.reload')}
          </button>
          <Link
            to="/support"
            className="grid min-h-11 flex-1 place-items-center rounded-pill bg-bg-alt text-sm font-semibold text-ink"
          >
            {t('error.report')}
          </Link>
        </div>

        <div className="mt-4">
          <CopyDiagnostics errorId={errorId} />
        </div>
      </div>
    </main>
  );
}

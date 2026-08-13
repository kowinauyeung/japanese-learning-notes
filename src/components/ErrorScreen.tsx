import { useMemo } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { CopyDiagnostics } from '@/components/CopyDiagnostics';
import { newErrorId } from '@/lib/diagnostics';

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

  console.error(`[${errorId}]`, error);

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-md rounded-card bg-card p-8 text-center shadow-panel">
        <h1 className="font-display text-xl font-bold">問題が発生しました</h1>
        <p className="mt-3 text-sm text-muted">
          画面を再読み込みすると直ることがあります。直らないときは、下の診断情報を添えてお知らせください。
        </p>
        <p className="mt-2 font-display text-sm tabular-nums">エラー ID: {errorId}</p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 flex-1 rounded-pill bg-accent text-sm font-semibold text-on-accent"
          >
            再読み込み
          </button>
          <Link
            to="/support"
            className="grid min-h-11 flex-1 place-items-center rounded-pill bg-bg-alt text-sm font-semibold text-ink"
          >
            報告する
          </Link>
        </div>

        <div className="mt-4">
          <CopyDiagnostics errorId={errorId} />
        </div>
      </div>
    </main>
  );
}

import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/context';
import { collectDiagnostics, formatDiagnostics } from '@/lib/diagnostics';
import { projectId } from '@/lib/env';

/**
 * Shows what will be copied, then copies it.
 *
 * The preview is not decoration. A support form asking for "diagnostic
 * information" is asking somebody to paste an opaque blob about themselves, and
 * the only honest version of that lets them read it first. It also makes the
 * absence of a uid, an email and a word visible rather than promised.
 */
export function CopyDiagnostics({ errorId }: { errorId: string }) {
  const { pathname } = useLocation();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { t } = useI18n();
  // Memoised, or `at` is re-read on every render — including the one caused by
  // reporting a successful copy, so the text in the box and the text on the
  // clipboard could differ by the moment each was made.
  const text = useMemo(
    () => formatDiagnostics(collectDiagnostics({ projectId, pathname, errorId })),
    [pathname, errorId],
  );

  return (
    <details className="rounded-panel border border-line p-3 text-left">
      <summary className="cursor-pointer text-xs text-muted">{t('diagnostics.summary')}</summary>
      <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-muted">{text}</pre>
      {/*
        Both failure modes are handled, on the one screen whose entire purpose
        is filing a report. `writeText` rejects on a permission or focus
        failure, which with no catch is an unhandled rejection and a label that
        never changes. `navigator.clipboard` is undefined outside a secure
        context, and calling `writeText` on it throws synchronously — which
        React does not route to an error boundary, so the button simply appears
        inert.

        The call is split rather than chained off `?.` because optional
        chaining short-circuits **the whole rest of the chain**: written as
        `navigator.clipboard?.writeText(t).then(…).catch(…)` the missing-
        clipboard case evaluates to `undefined` and neither handler runs, which
        is the same inert button with the throw removed. The `if` is what turns
        it back into a visible failure.

        The `<pre>` above means the text is always selectable by hand. That is
        the saving grace, and it is only a saving grace if somebody says so.
      */}
      <button
        type="button"
        onClick={() => {
          const written = navigator.clipboard?.writeText(text);
          // Compared against undefined rather than tested for truthiness: a
          // promise is always truthy, and `no-misused-promises` is right that
          // reading one as a boolean is a question nobody means to ask.
          if (written === undefined) {
            setState('failed');
            return;
          }
          written
            .then(() => {
              setState('copied');
              setTimeout(() => setState('idle'), 1800);
            })
            .catch(() => setState('failed'));
        }}
        className="mt-2 min-h-9 w-full rounded-pill bg-bg-alt text-xs font-semibold text-ink"
      >
        {state === 'copied' ? t('diagnostics.copied') : t('diagnostics.copy')}
      </button>
      {state === 'failed' && (
        <p className="mt-2 text-[11px] text-danger">{t('diagnostics.copyError')}</p>
      )}
      <p className="mt-2 text-[11px] text-muted">{t('diagnostics.privacy')}</p>
    </details>
  );
}

import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  // Memoised, or `at` is re-read on every render — including the one caused by
  // reporting a successful copy, so the text in the box and the text on the
  // clipboard could differ by the moment each was made.
  const text = useMemo(
    () => formatDiagnostics(collectDiagnostics({ projectId, pathname, errorId })),
    [pathname, errorId],
  );

  return (
    <details className="rounded-panel border border-line p-3 text-left">
      <summary className="cursor-pointer text-xs text-muted">診断情報を見る・コピーする</summary>
      <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-muted">{text}</pre>
      {/*
        Both failure modes are handled, on the one screen whose entire purpose
        is filing a report. `navigator.clipboard` is undefined outside a secure
        context, so the property access throws synchronously — and React does
        not route an event-handler error to an error boundary, so the button
        would simply appear inert. `writeText` can also reject on a permission
        or focus failure, which with no catch is an unhandled rejection and a
        label that never changes.

        The `<pre>` above means the text is always selectable by hand. That is
        the saving grace, and it is only a saving grace if somebody says so.
      */}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(text)
            .then(() => {
              setState('copied');
              setTimeout(() => setState('idle'), 1800);
            })
            .catch(() => setState('failed'));
        }}
        className="mt-2 min-h-9 w-full rounded-pill bg-bg-alt text-xs font-semibold text-ink"
      >
        {state === 'copied' ? 'コピーしました' : '診断情報をコピー'}
      </button>
      {state === 'failed' && (
        <p className="mt-2 text-[11px] text-danger">
          コピーできませんでした。上のテキストを選択してコピーしてください。
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        ユーザー ID、メールアドレス、登録した単語は含まれません。
      </p>
    </details>
  );
}

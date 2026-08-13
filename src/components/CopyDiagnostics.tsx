import { useState } from 'react';
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
  const [copied, setCopied] = useState(false);
  const text = formatDiagnostics(collectDiagnostics({ projectId, pathname, errorId }));

  return (
    <details className="rounded-panel border border-line p-3 text-left">
      <summary className="cursor-pointer text-xs text-muted">診断情報を見る・コピーする</summary>
      <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-muted">{text}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          });
        }}
        className="mt-2 min-h-9 w-full rounded-pill bg-bg-alt text-xs font-semibold text-ink"
      >
        {copied ? 'コピーしました' : '診断情報をコピー'}
      </button>
      <p className="mt-2 text-[11px] text-muted">
        ユーザー ID、メールアドレス、登録した単語は含まれません。
      </p>
    </details>
  );
}

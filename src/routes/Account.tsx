import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CopyDiagnostics } from '@/components/CopyDiagnostics';
import { deleteEverything, exportEverything, exportFilename } from '@/lib/accountData';
import { useAuth } from '@/lib/auth';
import { appVersion, buildLine } from '@/lib/build';
import { newErrorId } from '@/lib/diagnostics';
import { useEntries } from '@/lib/entries';
import { projectId } from '@/lib/env';
import { useProgress } from '@/lib/progress';
import { useWordSets } from '@/lib/wordSets';

export function Component() {
  const { user, signOutUser } = useAuth();
  const entries = useEntries();
  const wordSets = useWordSets();
  const progress = useProgress();

  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  const runExport = async () => {
    setBusy('export');
    setError(null);
    setNote(null);
    try {
      const bundle = await exportEverything({
        appVersion,
        profile: { displayName: user?.displayName ?? null, email: user?.email ?? null },
        entries: entries.repository,
        wordSets: wordSets.repository,
        progress: progress.repository,
      });
      // Built and downloaded in the browser. Uploading it to Storage first
      // would put a complete copy of somebody's notebook on a public-ish URL to
      // solve a problem the browser does not have.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename();
      link.click();
      URL.revokeObjectURL(url);
      setNote(
        `${bundle.entries.length} 語、${bundle.wordSets.length} 個の単語集、${bundle.practiceSessions.length} 件の練習記録を書き出しました。`,
      );
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : 'エクスポートできませんでした。');
    } finally {
      setBusy(null);
    }
  };

  const runDelete = async () => {
    setBusy('delete');
    setError(null);
    setNote(null);
    try {
      const removed = await deleteEverything({
        entries: entries.repository,
        wordSets: wordSets.repository,
      });
      setNote(`${removed.entries} 語と ${removed.wordSets} 個の単語集を削除しました。`);
      await signOutUser();
    } catch (cause) {
      console.error(cause);
      // Deliberately not "failed": some of it may be gone. Saying so is the
      // difference between a user retrying and a user assuming their data is
      // intact when half of it is not.
      setError('削除の途中で失敗しました。残っている可能性があります。もう一度お試しください。');
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  return (
    <section className="mx-auto max-w-md space-y-4">
      <div className="rounded-card bg-card p-8 shadow-panel">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-pill bg-accent font-display text-3xl font-bold text-on-accent">
          {initial}
        </div>

        <dl className="mt-8 space-y-4 text-sm">
          <div>
            <dt className="text-xs text-muted">表示名</dt>
            <dd className="mt-1">{user?.displayName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">メールアドレス</dt>
            <dd className="mt-1">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">バージョン</dt>
            <dd className="mt-1 tabular-nums">{buildLine(projectId)}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="mt-8 min-h-11 w-full rounded-pill bg-bg-alt text-sm font-semibold text-ink"
        >
          ログアウト
        </button>
      </div>

      <div className="rounded-card bg-card p-6 shadow-panel">
        <h2 className="font-display text-sm font-bold">データ</h2>
        <p className="mt-2 text-xs text-muted">
          登録した単語、単語集、練習記録をすべて JSON
          で書き出します。個人の学習内容が含まれるので、保存先にご注意ください。
        </p>
        <button
          type="button"
          onClick={() => void runExport()}
          disabled={busy !== null}
          className="mt-4 min-h-11 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {busy === 'export' ? '書き出しています…' : 'データをエクスポート'}
        </button>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy !== null}
          className="mt-2 min-h-11 w-full rounded-pill bg-danger-soft text-sm font-semibold text-danger disabled:opacity-60"
        >
          アカウントとデータを削除
        </button>

        {note && <p className="mt-3 text-xs text-accent">{note}</p>}
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </div>

      <div className="rounded-card bg-card p-6 shadow-panel">
        <h2 className="font-display text-sm font-bold">サポート</h2>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-accent">
          <Link to="/support" className="hover:underline">
            問題を報告する
          </Link>
          <Link to="/privacy" className="hover:underline">
            プライバシーポリシー
          </Link>
          <Link to="/terms" className="hover:underline">
            利用規約
          </Link>
          <Link to="/about" className="hover:underline">
            語彙庭について
          </Link>
        </div>
        <div className="mt-4">
          <CopyDiagnostics errorId={newErrorId()} />
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="アカウントとデータを削除"
        message="登録した単語、単語集、練習記録をすべて削除します。取り消せません。先にエクスポートすることをおすすめします。"
        confirmLabel="削除する"
        busy={busy === 'delete'}
        onConfirm={() => void runDelete()}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
}

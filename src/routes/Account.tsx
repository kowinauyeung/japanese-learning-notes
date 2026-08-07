import { useAuth } from '@/lib/auth';
import { projectId } from '@/lib/firebase';

export function Component() {
  const { user, signOutUser } = useAuth();
  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <section className="mx-auto max-w-md rounded-card bg-card p-8 shadow-panel">
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
          <dt className="text-xs text-muted">接続先プロジェクト</dt>
          <dd className="mt-1">{projectId}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => void signOutUser()}
        className="mt-8 min-h-11 w-full rounded-pill bg-danger-soft text-sm font-semibold text-danger"
      >
        ログアウト
      </button>
    </section>
  );
}

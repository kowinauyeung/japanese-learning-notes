import { useAuth } from '@/lib/auth';
import { projectId } from '@/lib/firebase';

export function Component() {
  const { user, signOutUser } = useAuth();
  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <section className="rounded-card bg-card shadow-panel mx-auto max-w-md p-8">
      <div className="rounded-pill bg-accent text-on-accent font-display mx-auto grid h-20 w-20 place-items-center text-3xl font-bold">
        {initial}
      </div>

      <dl className="mt-8 space-y-4 text-sm">
        <div>
          <dt className="text-muted text-xs">表示名</dt>
          <dd className="mt-1">{user?.displayName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">メールアドレス</dt>
          <dd className="mt-1">{user?.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">接続先プロジェクト</dt>
          <dd className="mt-1">{projectId}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => void signOutUser()}
        className="rounded-pill bg-danger-soft text-danger mt-8 min-h-11 w-full text-sm font-semibold"
      >
        ログアウト
      </button>
    </section>
  );
}

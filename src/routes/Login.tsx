import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { projectId } from '../lib/firebase';
import { LogoMark } from '../components/Logo';

/**
 * Where to land after signing in. `state.from` is set by `AppLayout` when it
 * bounces an unauthenticated visitor, but it arrives through history state,
 * which any page can write — so only a same-origin relative path is honoured.
 * `//evil.com` and `https://…` are both rejected, since the browser would read
 * the first as a protocol-relative URL.
 */
function safeRedirect(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string') return '/';
  return from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

export function Component() {
  const { user, loading, signIn } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg">
        <p className="text-muted text-sm">読み込み中…</p>
      </main>
    );
  }
  if (user) return <Navigate to={safeRedirect(location.state)} replace />;

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (cause) {
      // A closed popup is the user changing their mind, not a failure worth showing.
      const code = (cause as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('ログインできませんでした。もう一度お試しください。');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="rounded-card bg-card shadow-panel w-full max-w-[360px] p-8">
        <h1 className="flex flex-col items-center gap-3">
          <LogoMark className="h-16 w-16" />
          <span className="font-display text-3xl font-bold text-accent">語彙庭</span>
        </h1>
        <p className="text-muted mt-2 text-center text-sm">ログインして続ける</p>

        <button
          type="button"
          onClick={() => void onSignIn()}
          disabled={busy}
          className="rounded-pill bg-accent text-on-accent mt-8 min-h-12 w-full text-sm font-semibold disabled:opacity-60"
        >
          {busy ? 'ログイン中…' : 'Google でログイン'}
        </button>

        {error && <p className="text-danger mt-3 text-center text-sm">{error}</p>}

        {/* Two projects share this build; knowing which one is live avoids
            editing production while thinking it is the dev copy. */}
        <p className="text-muted mt-6 text-center text-xs">{projectId}</p>
      </div>
    </main>
  );
}

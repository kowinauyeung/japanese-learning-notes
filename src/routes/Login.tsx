import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { LogoMark } from '@/components/Logo';
import { PublicFooter } from '@/components/PublicLayout';
import { useI18n } from '@/i18n/context';
import { useAuth } from '@/lib/auth';
import { projectId } from '@/lib/env';
import { safeRedirect } from '@/lib/redirect';

export function Component() {
  const { t } = useI18n();
  const { user, loading, signIn } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg">
        <p className="text-sm text-muted">{t('common.loading')}</p>
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
        setError(t('auth.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    /* A column with the card centred in the growing part, so the footer sits on
       the bottom edge instead of wherever the card happens to end. */
    <div className="flex min-h-dvh flex-col bg-bg pt-safe">
      <main className="grid flex-1 place-items-center px-4 py-8">
        <div className="w-full max-w-[360px] rounded-card bg-card p-8 shadow-panel">
          <h1 className="flex flex-col items-center gap-3">
            <LogoMark className="h-16 w-16" />
            <span className="font-display text-3xl font-bold text-accent">{t('brand.name')}</span>
          </h1>
          <p className="mt-2 text-center text-sm text-muted">{t('auth.continue')}</p>

          <button
            type="button"
            onClick={() => void onSignIn()}
            disabled={busy}
            className="mt-8 min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {busy ? t('auth.loggingIn') : t('auth.google')}
          </button>

          {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}

          {/* Two projects share this build; knowing which one is live avoids
              editing production while thinking it is the dev copy. */}
          <p className="mt-6 text-center text-xs text-muted">{projectId}</p>

          {/* The policies are agreed to by signing in, so this is the last
              screen on which they have to be one tap away. */}
          <p className="mt-4 text-center text-xs text-muted">
            {t('auth.consentPrefix')}
            <Link to="/terms" className="underline">
              {t('public.terms')}
            </Link>
            {t('auth.consentJoin')}
            <Link to="/privacy" className="underline">
              {t('public.privacyPolicy')}
            </Link>
            {t('auth.consentSuffix')}
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

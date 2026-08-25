import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CopyDiagnostics } from '@/components/CopyDiagnostics';
import { useI18n } from '@/i18n/context';
import {
  deleteEverything,
  exportEverything,
  exportFilename,
  NothingDeleted,
} from '@/lib/accountData';
import { useAuth } from '@/lib/auth';
import { authPort, userRepository } from '@/lib/backend';
import { appVersion, buildLine } from '@/lib/build';
import { newErrorId } from '@/lib/diagnostics';
import { useEntries } from '@/lib/entries';
import { loadErrorMessage } from '@/lib/loadError';
import { useProgress } from '@/lib/progress';
import { useUserSettings } from '@/lib/userSettingsContext';
import { useWordSets } from '@/lib/wordSets';

export function Component() {
  const { user, signOutUser } = useAuth();
  const entries = useEntries();
  const wordSets = useWordSets();
  const progress = useProgress();
  const settings = useUserSettings();
  const { t } = useI18n();

  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Minted once. Called during render it changed on every state change — and
  // this component sets four — so the id a user reads off the screen was not
  // the id in the text they had just copied.
  const errorId = useMemo(() => newErrorId(), []);

  const initial = (settings.profile.nickname || user?.email || '?').charAt(0).toUpperCase();

  const runExport = async () => {
    setBusy('export');
    setError(null);
    setNote(null);
    try {
      const bundle = await exportEverything({
        appVersion,
        profile: {
          displayName: user?.displayName ?? null,
          email: user?.email ?? null,
          settings: settings.profile,
        },
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
        t('account.exported', {
          entries: bundle.entries.length,
          sets: bundle.wordSets.length,
          sessions: bundle.practiceSessions.length,
        }),
      );
    } catch (cause) {
      console.error(cause);
      setError(
        cause instanceof Error && cause.message.startsWith('エクスポートが終わりませんでした')
          ? t('load.exportWalk')
          : // A denial fell through to the generic 「エクスポートできませんでした」,
            // indistinguishable from any other failure and unclearable by
            // retrying. `loadErrorMessage` is the seam #22 built for exactly
            // this distinction.
            loadErrorMessage(
              cause,
              t('account.exportError'),
              t('load.accessDenied'),
              t('load.unreachableSave'),
            ),
      );
    } finally {
      setBusy(null);
    }
  };

  const runDelete = async () => {
    setBusy('delete');
    setError(null);
    setNote(null);
    try {
      await deleteEverything({
        entries: entries.repository,
        wordSets: wordSets.repository,
        progress: progress.repository,
        userProfiles: userRepository,
        uid: settings.profile.uid,
        auth: authPort,
      });
      // No success note: the account is gone, so there is nobody left to read
      // it. An earlier version set one and signed out on the next line, which
      // rendered for a frame and then vanished with the session.
      await signOutUser();
    } catch (cause) {
      console.error(cause);
      // Branching on what happened, not on which code the provider chose.
      //
      // The list this replaces was wrong in both directions, and one of the
      // errors was the dangerous kind. `auth/requires-recent-login` is
      // `CREDENTIAL_TOO_OLD_LOGIN_AGAIN`, raised for a *sensitive operation* —
      // which here is `deleteAccount()`, the last thing `deleteEverything`
      // does. Treating it as "the popup was refused" meant telling a user
      // 「データは削除されていません」 at the one moment everything already had
      // been. It also missed `auth/user-mismatch`, `auth/popup-blocked` and the
      // adapter's own error, which carries no `code` at all.
      //
      // `NothingDeleted` is thrown by the only code that knows.
      setError(
        cause instanceof NothingDeleted
          ? t('account.reauthError')
          : // Deliberately not "failed": some of it may be gone. Saying so is
            // the difference between a user retrying and a user assuming their
            // data is intact when half of it is not.
            t('account.deletePartialError'),
      );
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  };

  return (
    <section className="mx-auto max-w-md space-y-4">
      <div className="rounded-card bg-card p-8 shadow-panel">
        <Avatar
          photoUrl={user?.photoUrl}
          initial={initial}
          alt={t('account.photo')}
          className="mx-auto h-20 w-20 font-display text-3xl"
        />

        <dl className="mt-8 space-y-4 text-sm">
          <div>
            <dt className="text-xs text-muted">{t('account.displayName')}</dt>
            <dd className="mt-1">{settings.profile.nickname || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('account.email')}</dt>
            <dd className="mt-1">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('account.version')}</dt>
            <dd className="mt-1 tabular-nums">{buildLine()}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="mt-8 min-h-11 w-full rounded-pill bg-bg-alt text-sm font-semibold text-ink"
        >
          {t('account.signOut')}
        </button>
      </div>

      <div className="rounded-card bg-card p-6 shadow-panel">
        <h2 className="font-display text-sm font-bold">{t('account.data')}</h2>
        <p className="mt-2 text-xs text-muted">{t('account.exportDescription')}</p>
        <button
          type="button"
          onClick={() => void runExport()}
          disabled={busy !== null}
          className="mt-4 min-h-11 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {busy === 'export' ? t('account.exporting') : t('account.export')}
        </button>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy !== null}
          className="mt-2 min-h-11 w-full rounded-pill bg-danger-soft text-sm font-semibold text-danger disabled:opacity-60"
        >
          {t('account.delete')}
        </button>

        {note && <p className="mt-3 text-xs text-accent">{note}</p>}
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </div>

      <div className="rounded-card bg-card p-6 shadow-panel">
        <h2 className="font-display text-sm font-bold">{t('account.support')}</h2>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-accent">
          <Link to="/support" className="hover:underline">
            {t('account.reportIssue')}
          </Link>
          <Link to="/privacy" className="hover:underline">
            {t('public.privacyPolicy')}
          </Link>
          <Link to="/terms" className="hover:underline">
            {t('public.terms')}
          </Link>
          <Link to="/about" className="hover:underline">
            {t('public.about')}
          </Link>
        </div>
        <div className="mt-4">
          <CopyDiagnostics errorId={errorId} />
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t('account.delete')}
        message={t('account.deleteMessage')}
        confirmLabel={t('account.deleteConfirm')}
        busy={busy === 'delete'}
        onConfirm={() => void runDelete()}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
}

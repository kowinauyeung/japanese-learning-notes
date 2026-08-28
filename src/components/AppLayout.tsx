import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { VocabDialog } from '@/components/VocabDialog';
import type { TranslationLanguage } from '@/domain/user';
import { useI18n } from '@/i18n/context';
import { I18nProvider } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/messages';
import { useAuth } from '@/lib/auth';
import { EntriesProvider } from '@/lib/entries';
import { ProgressProvider } from '@/lib/progress';
import { useClickOutside } from '@/lib/useClickOutside';
import { UserSettingsProvider } from '@/lib/userSettings';
import { useUserSettings } from '@/lib/userSettingsContext';
import { VocabDialogProvider } from '@/lib/vocabDialog';
import { WordSetsProvider } from '@/lib/wordSets';
import { Avatar } from './Avatar';
import { EntryFormModal } from './entry-form/EntryFormModal';
import { LogoMark } from './Logo';
import { PublicFooter } from './PublicLayout';

/**
 * Ordered the way the notebook is used, not the way it was built: collect
 * words, organise them, drill them, look back. 単語 and 単語集 sit together
 * because one is made out of the other, and the two drills sit together
 * because choosing between them is a single decision.
 */
/**
 * Lazy like every route below it. Imported eagerly it pulled the landing page
 * and `content/about.ts` into the signed-in bundle, for users who by definition
 * never see either.
 */
const Home = lazy(async () => ({ default: (await import('@/routes/Home')).Component }));

const NAV = [
  { to: '/', label: 'nav.dashboard', end: true },
  { to: '/vocabulary', label: 'nav.vocabulary', end: false },
  { to: '/wordsets', label: 'nav.wordSets', end: false },
  { to: '/practice/flashcards', label: 'nav.flashcards', end: false },
  { to: '/practice/dictation', label: 'nav.dictation', end: false },
  { to: '/history', label: 'nav.history', end: false },
] satisfies ReadonlyArray<{ to: string; label: MessageKey; end: boolean }>;

export function AppLayout() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (!user) {
    // `/` is a public homepage, not a redirect to the login form. A visitor
    // deciding whether to hand over a Google account has to be able to read
    // what the app is for without handing it over first, and Google's OAuth
    // review asks for the same thing.
    if (location.pathname === '/') {
      return (
        <Suspense fallback={null}>
          <Home />
        </Suspense>
      );
    }
    // Every other route redirects, and the search string goes with it: it
    // carries the entire Browse filter state, so dropping it would silently
    // return a bookmarked filtered view to the unfiltered one.
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return (
    <UserSettingsProvider uid={user.uid} displayName={user.displayName} email={user.email}>
      <LocalizedApp uid={user.uid} />
    </UserSettingsProvider>
  );
}

function LocalizedApp({ uid }: { uid: string }) {
  const { profile } = useUserSettings();
  return (
    <I18nProvider locale={profile.language}>
      <AuthenticatedLayout uid={uid} translationLanguage={profile.translationLanguage} />
    </I18nProvider>
  );
}

function AuthenticatedLayout({
  uid,
  translationLanguage,
}: {
  uid: string;
  translationLanguage: TranslationLanguage;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  return (
    <EntriesProvider uid={uid}>
      <ProgressProvider uid={uid}>
        <WordSetsProvider uid={uid}>
          {/* Below the data providers because the dialog reads the notebook
              they hold, and above the outlet because any page may open it. */}
          <VocabDialogProvider>
            {/* A column, not a plain block: a short page used to leave the
                footer floating with page background under it, which reads as a
                stray edge across the screen in dark mode. */}
            <div className="flex min-h-dvh flex-col bg-bg text-ink">
              <header className="sticky top-0 z-30 border-b border-line bg-card/85 pt-safe px-safe backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
                  {/* Centred below the `nav` breakpoint, because the bar at
                      the bottom of the screen now holds everything the header
                      used to: with the hamburger and the avatar gone there is
                      nothing else in this row, and a brand pinned left with
                      empty space beside it reads as a row that lost something. */}
                  <NavLink
                    to="/"
                    className="mx-auto flex items-center gap-1.5 font-display text-lg font-bold text-accent nav:mx-0 nav:mr-1"
                  >
                    <LogoMark className="h-7 w-7" />
                    {t('brand.name')}
                  </NavLink>

                  {/* Desktop: the full pill row. */}
                  <nav className="hidden flex-1 items-center gap-1 nav:flex">
                    {NAV.map((item) => (
                      <NavLink key={item.to} to={item.to} end={item.end} className={pillClass}>
                        {t(item.label)}
                      </NavLink>
                    ))}
                  </nav>

                  <div className="hidden items-center justify-end gap-2 nav:flex">
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
                    >
                      {t('action.add')}
                    </button>
                    <AvatarMenu />
                  </div>
                </div>
              </header>

              {/* Two boxes rather than one, because `px-4` and the side inset
                  both want padding-inline and a single element cannot hold both.
                  The outer one takes the device's strips, the inner one the
                  gutter and the width — so the page centres inside the space
                  the screen actually gives, not inside the notch.

                  `pb-28` below the `nav` breakpoint is the bottom bar's
                  clearance: the bar is fixed, so it is out of flow and the last
                  card would otherwise end underneath it. `pb-safe` on top of
                  that is the device's own strip — the bar covers it today, and
                  the padding is what keeps the page correct on a phone that
                  reports an inset with the bar hidden, which is every landscape
                  width above the breakpoint. Above it the footer follows and
                  carries its own. */}
              <main className="w-full flex-1 px-safe pb-safe nav:pb-0">
                <div className="mx-auto max-w-5xl px-4 py-6 pb-28 nav:pb-10">
                  <Outlet />
                </div>
              </main>

              {/* The same footer the public pages carry, so the two never
                  disagree about where the policies live — and so the build line
                  is one scroll away from any screen a bug is reported from.
                  Hidden on phones, where the bottom nav already occupies it. */}
              <div className="hidden nav:block">
                <PublicFooter width="max-w-5xl" />
              </div>

              <BottomNav onAdd={() => setAdding(true)} />

              <EntryFormModal
                open={adding}
                translationLanguage={translationLanguage}
                onClose={() => setAdding(false)}
                onSaved={(id) => void navigate(`/vocabulary/${id}`)}
              />

              <VocabDialog />
            </div>
          </VocabDialogProvider>
        </WordSetsProvider>
      </ProgressProvider>
    </EntriesProvider>
  );
}

function pillClass({ isActive }: { isActive: boolean }) {
  return `rounded-pill px-3.5 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-accent text-on-accent' : 'text-muted hover:bg-bg-alt'
  }`;
}

function AvatarMenu() {
  const { t } = useI18n();
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(
    ref,
    useCallback(() => setOpen(false), []),
  );

  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('account.menu')}
        aria-expanded={open}
        className="block rounded-pill"
      >
        {/* Decorative: the button already carries the label, and an alt here
            would have a screen reader announce the account twice. */}
        <Avatar photoUrl={user?.photoUrl} initial={initial} alt="" className="h-10 w-10 text-sm" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-panel border border-line bg-card p-1.5 shadow-panel">
          <button
            type="button"
            onClick={() => {
              void navigate('/account');
              setOpen(false);
            }}
            className="flex min-h-11 w-full items-center rounded-panel px-3 text-sm hover:bg-bg-alt"
          >
            {t('account.account')}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigate('/settings');
              setOpen(false);
            }}
            className="flex min-h-11 w-full items-center rounded-panel px-3 text-sm hover:bg-bg-alt"
          >
            {t('account.settings')}
          </button>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="flex min-h-11 w-full items-center rounded-panel px-3 text-sm text-danger hover:bg-danger-soft"
          >
            {t('account.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

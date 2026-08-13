import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { VocabDialog } from '@/components/VocabDialog';
import { useAuth } from '@/lib/auth';
import { EntriesProvider } from '@/lib/entries';
import { ProgressProvider } from '@/lib/progress';
import { useTheme } from '@/lib/theme';
import { useClickOutside } from '@/lib/useClickOutside';
import { VocabDialogProvider } from '@/lib/vocabDialog';
import { WordSetsProvider } from '@/lib/wordSets';
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
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/vocabulary', label: '単語', end: false },
  { to: '/wordsets', label: '単語集', end: false },
  { to: '/practice/flashcards', label: 'フラッシュカード', end: false },
  { to: '/practice/dictation', label: '書き取り練習', end: false },
  { to: '/history', label: '履歴', end: false },
];

export function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <p className="text-sm text-muted">読み込み中…</p>
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
    <EntriesProvider uid={user.uid}>
      <ProgressProvider uid={user.uid}>
        <WordSetsProvider uid={user.uid}>
          {/* Below the data providers because the dialog reads the notebook
              they hold, and above the outlet because any page may open it. */}
          <VocabDialogProvider>
            {/* A column, not a plain block: a short page used to leave the
                footer floating with page background under it, which reads as a
                stray edge across the screen in dark mode. */}
            <div className="flex min-h-dvh flex-col bg-bg text-ink">
              <header className="sticky top-0 z-30 border-b border-line bg-card/85 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
                  <NavLink
                    to="/"
                    className="mr-1 flex items-center gap-1.5 font-display text-lg font-bold text-accent"
                  >
                    <LogoMark className="h-7 w-7" />
                    語彙庭
                  </NavLink>

                  {/* Desktop: the full pill row. */}
                  <nav className="hidden flex-1 items-center gap-1 nav:flex">
                    {NAV.map((item) => (
                      <NavLink key={item.to} to={item.to} end={item.end} className={pillClass}>
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>

                  <div className="flex flex-1 items-center justify-end gap-2 nav:flex-none">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((open) => !open)}
                      aria-label="メニュー"
                      aria-expanded={menuOpen}
                      className="grid h-11 w-11 place-items-center rounded-pill text-xl hover:bg-bg-alt nav:hidden"
                    >
                      {menuOpen ? '✕' : '☰'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="hidden rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-on-accent nav:block"
                    >
                      ＋追加
                    </button>
                    <AvatarMenu />
                  </div>
                </div>

                {menuOpen && <MobileNav onNavigate={() => setMenuOpen(false)} />}
              </header>

              <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 nav:pb-10">
                <Outlet />
              </main>

              {/* The same footer the public pages carry, so the two never
                  disagree about where the policies live — and so the build line
                  is one scroll away from any screen a bug is reported from.
                  Hidden on phones, where the bottom nav already occupies it. */}
              <div className="hidden nav:block">
                <PublicFooter width="max-w-5xl" />
              </div>

              <button
                type="button"
                onClick={() => setAdding(true)}
                aria-label="単語を追加"
                className="fixed right-5 bottom-5 z-20 grid h-14 w-14 place-items-center rounded-pill bg-accent text-2xl text-on-accent shadow-panel nav:hidden"
              >
                ＋
              </button>

              <EntryFormModal
                open={adding}
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

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav className="border-t border-line bg-card px-3 py-2 nav:hidden">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center rounded-panel px-4 text-base font-medium ${
              isActive ? 'bg-accent-soft text-accent' : 'text-ink'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function AvatarMenu() {
  const { user, signOutUser } = useAuth();
  const { theme, toggle } = useTheme();
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
        aria-label="アカウントメニュー"
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-pill bg-accent text-sm font-bold text-on-accent"
      >
        {initial}
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
            アカウント
          </button>
          <button
            type="button"
            onClick={toggle}
            className="flex min-h-11 w-full items-center justify-between rounded-panel px-3 text-sm hover:bg-bg-alt"
          >
            <span>テーマ</span>
            <span className="text-muted">{theme === 'dark' ? '🌙 ダーク' : '☀️ ライト'}</span>
          </button>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="flex min-h-11 w-full items-center rounded-panel px-3 text-sm text-danger hover:bg-danger-soft"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}

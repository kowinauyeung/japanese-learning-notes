import { useCallback, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { EntriesProvider } from '@/lib/entries';
import { EntryFormModal } from './entry-form/EntryFormModal';
import { LogoMark } from './Logo';
import { useTheme } from '@/lib/theme';
import { useClickOutside } from '@/lib/useClickOutside';

const NAV = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/vocabulary', label: '一覧', end: false },
  { to: '/practice/flashcards', label: 'フラッシュカード', end: false },
  { to: '/practice/dictation', label: '書き取り練習', end: false },
  { to: '/wordsets', label: '単語集', end: false },
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
        <p className="text-muted text-sm">読み込み中…</p>
      </div>
    );
  }
  // The search string carries the entire Browse filter state, so dropping it
  // would silently return a bookmarked filtered view to the unfiltered one.
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return (
    <EntriesProvider>
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-line bg-card/85 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <NavLink
            to="/"
            className="font-display mr-1 flex items-center gap-1.5 text-lg font-bold text-accent"
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
              className="rounded-pill hover:bg-bg-alt grid h-11 w-11 place-items-center text-xl nav:hidden"
            >
              {menuOpen ? '✕' : '☰'}
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-pill bg-accent text-on-accent hidden px-4 py-2 text-sm font-semibold nav:block"
            >
              ＋追加
            </button>
            <AvatarMenu />
          </div>
        </div>

        {menuOpen && <MobileNav onNavigate={() => setMenuOpen(false)} />}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-28 nav:pb-10">
        <Outlet />
      </main>

      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label="単語を追加"
        className="rounded-pill bg-accent text-on-accent shadow-panel fixed right-5 bottom-5 z-20 grid h-14 w-14 place-items-center text-2xl nav:hidden"
      >
        ＋
      </button>

      <EntryFormModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(id) => void navigate(`/vocabulary/${id}`)}
      />
    </div>
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
    <nav className="border-line bg-card border-t px-3 py-2 nav:hidden">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `rounded-panel flex min-h-11 items-center px-4 text-base font-medium ${
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
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="アカウントメニュー"
        aria-expanded={open}
        className="rounded-pill bg-accent text-on-accent grid h-10 w-10 place-items-center text-sm font-bold"
      >
        {initial}
      </button>

      {open && (
        <div className="rounded-panel border-line bg-card shadow-panel absolute right-0 mt-2 w-52 border p-1.5">
          <button
            type="button"
            onClick={() => {
              void navigate('/account');
              setOpen(false);
            }}
            className="rounded-panel hover:bg-bg-alt flex min-h-11 w-full items-center px-3 text-sm"
          >
            アカウント
          </button>
          <button
            type="button"
            onClick={toggle}
            className="rounded-panel hover:bg-bg-alt flex min-h-11 w-full items-center justify-between px-3 text-sm"
          >
            <span>テーマ</span>
            <span className="text-muted">{theme === 'dark' ? '🌙 ダーク' : '☀️ ライト'}</span>
          </button>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="rounded-panel hover:bg-danger-soft text-danger flex min-h-11 w-full items-center px-3 text-sm"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}

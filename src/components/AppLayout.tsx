import { NavLink, Outlet } from 'react-router-dom';

// Placeholder shell — the pill nav, hamburger/FAB breakpoint behaviour and
// avatar menu from the handoff are built in the app-shell task.
const NAV = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/vocabulary', label: '一覧', end: false },
];

export function AppLayout() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <span className="font-display mr-3 text-lg font-bold text-accent">単語帳</span>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-pill px-4 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-accent text-on-accent' : 'text-muted hover:bg-bg-alt'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

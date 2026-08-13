import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/Logo';
import { buildLine } from '@/lib/build';
import { projectId } from '@/lib/env';

const LINKS = [
  { to: '/about', label: '語彙庭について' },
  { to: '/privacy', label: 'プライバシー' },
  { to: '/terms', label: '利用規約' },
  { to: '/support', label: 'サポート' },
];

/**
 * The shell every page outside the auth gate shares.
 *
 * Separate from `AppLayout` rather than a mode of it: that one mounts three data
 * providers and redirects when there is no user, and a privacy policy that
 * cannot be read without signing in is not a public document. Nothing here
 * touches Firestore.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-lg font-bold text-accent">語彙庭</span>
          </Link>
          <Link
            to="/login"
            className="ml-auto rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
          >
            ログイン
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>

      <PublicFooter />
    </div>
  );
}

/**
 * Also rendered inside the signed-in layout, so the two never disagree about
 * where the policies are — and so the build line is reachable from every screen
 * rather than only from the ones a signed-out visitor sees.
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5 text-xs text-muted">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="hover:text-ink hover:underline">
            {link.label}
          </Link>
        ))}
        <span className="ml-auto tabular-nums">{buildLine(projectId)}</span>
      </div>
    </footer>
  );
}

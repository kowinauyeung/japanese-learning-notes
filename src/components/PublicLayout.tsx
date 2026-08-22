import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/Logo';
import { useI18n } from '@/i18n/context';
import type { MessageKey } from '@/i18n/messages';
import { appVersion } from '@/lib/build';

const LINKS = [
  { to: '/about', label: 'public.about' },
  { to: '/privacy', label: 'public.privacy' },
  { to: '/terms', label: 'public.terms' },
  { to: '/support', label: 'public.support' },
] satisfies ReadonlyArray<{ to: string; label: MessageKey }>;

/**
 * The shell every page outside the auth gate shares.
 *
 * Separate from `AppLayout` rather than a mode of it: that one mounts three data
 * providers and redirects when there is no user, and a privacy policy that
 * cannot be read without signing in is not a public document. Nothing here
 * touches Firestore.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="border-b border-line bg-card pt-safe px-safe">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-lg font-bold text-accent">{t('brand.name')}</span>
          </Link>
          <Link
            to="/login"
            className="ml-auto rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
          >
            {t('auth.login')}
          </Link>
        </div>
      </header>

      {/* Split for the same reason as `AppLayout`: the outer box takes the
          device's side strips, the inner one the reading gutter and the
          measure. */}
      <main className="w-full flex-1 px-safe">
        <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>
      </main>

      <PublicFooter />
    </div>
  );
}

/**
 * Also rendered inside the signed-in layout, so the two never disagree about
 * where the policies are.
 *
 * The width is passed in rather than fixed, because the two shells are not the
 * same width: the public pages are `max-w-3xl` for reading prose and the app is
 * `max-w-5xl` for a card grid. Hard-coding one of them left the footer's
 * contents visibly out of line with the page above it everywhere else.
 *
 * Centred rather than left-aligned below `sm`: at that width the four links
 * plus the version do not fit on one line, and a second line that is still
 * left-anchored (with the version pinned to the far right by `ml-auto`) reads
 * as two mismatched rows instead of one wrapped group.
 */
export function PublicFooter({ width = 'max-w-3xl' }: { width?: string }) {
  const { t } = useI18n();
  // The bottom inset lives here rather than on each shell, because this is the
  // last element of all three of them — the public pages, the login screen, and
  // the signed-in layout above the `nav` breakpoint.
  return (
    <footer className="border-t border-line bg-card px-safe pb-safe">
      <div
        className={`mx-auto flex ${width} flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-5 text-xs text-muted sm:justify-start`}
      >
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="hover:text-ink hover:underline">
            {t(link.label)}
          </Link>
        ))}
        <span className="tabular-nums sm:ml-auto">v{appVersion}</span>
      </div>
    </footer>
  );
}

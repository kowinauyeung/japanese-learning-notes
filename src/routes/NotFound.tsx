import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/PublicLayout';
import { useI18n } from '@/i18n/context';

/**
 * A mistyped address, which is not a crash.
 *
 * Without this route an unknown path fell through to the router's error
 * boundary and rendered 問題が発生しました with an error id and a link to the
 * report form — inviting a bug report for a typo, and burying real reports
 * under them.
 *
 * It is public for the same reason: sending somebody to a login screen because
 * they mistyped a URL answers a question they did not ask.
 */
export function Component() {
  const { t } = useI18n();
  return (
    <PublicLayout>
      <section className="py-16 text-center">
        <p className="font-display text-5xl font-bold text-accent">404</p>
        <h1 className="mt-4 font-display text-xl font-bold">{t('notFound.title')}</h1>
        <p className="mt-3 text-sm text-muted">{t('notFound.description')}</p>
        <Link
          to="/"
          className="mt-8 inline-block min-h-11 rounded-pill bg-accent px-8 py-3 text-sm font-semibold text-on-accent"
        >
          {t('notFound.home')}
        </Link>
      </section>
    </PublicLayout>
  );
}

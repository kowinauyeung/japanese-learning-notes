import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/PublicLayout';
import { homeContent } from '@/content/home';
import { useI18n } from '@/i18n/context';
import { useBrandName } from '@/i18n/useBrandName';

/**
 * What `/` shows to somebody who is not signed in.
 *
 * It exists because a homepage that is only a login form is not a homepage:
 * Google's OAuth review expects a publicly reachable page describing the app
 * and linking its policies, and a visitor deciding whether to hand over a Google
 * account should be able to read what it is for without handing it over first.
 *
 * The landing copy is part of the translated shell. The longer public documents
 * remain a separate migration slice because their policy wording needs its own
 * review in every language.
 */
export function Component() {
  const { locale, t } = useI18n();
  const content = homeContent[locale];
  const brandName = useBrandName();

  return (
    <PublicLayout>
      <section className="py-6 text-center">
        <h1 className="font-display text-4xl font-bold">{brandName}</h1>
        <p className="mt-3 text-sm text-muted">{content.lead}</p>
        <Link
          to="/login"
          className="mt-8 inline-block min-h-11 rounded-pill bg-accent px-8 py-3 text-sm font-semibold text-on-accent"
        >
          {t('auth.google')}
        </Link>
        <p className="mt-3 text-xs text-muted">
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
      </section>

      <section className="prose-cjk mt-10 border-t border-line pt-8">
        <h2 className="font-display text-lg font-bold">{content.purpose.heading}</h2>
        {content.purpose.body.map((paragraph) => (
          <p key={paragraph} className="mt-3 text-sm leading-relaxed">
            {paragraph}
          </p>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">{content.features.heading}</h2>
        <ul className="mt-3 space-y-2">
          {content.features.list.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed">
              <span className="text-accent">・</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <Link to="/about" className="mt-4 inline-block text-sm text-accent hover:underline">
          {t('home.learnMore')}
        </Link>
      </section>
    </PublicLayout>
  );
}

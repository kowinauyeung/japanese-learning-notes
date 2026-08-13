import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/PublicLayout';
import { about } from '@/content/about';

/**
 * What `/` shows to somebody who is not signed in.
 *
 * It exists because a homepage that is only a login form is not a homepage:
 * Google's OAuth review expects a publicly reachable page describing the app
 * and linking its policies, and a visitor deciding whether to hand over a Google
 * account should be able to read what it is for without handing it over first.
 *
 * The copy is `about.ts` rather than a second description that would drift from
 * it — this page is the first two sections, the About page is all of them.
 */
export function Component() {
  const [purpose, features] = about.sections;

  return (
    <PublicLayout>
      <section className="py-6 text-center">
        <h1 className="font-display text-4xl font-bold">語彙庭</h1>
        <p className="mt-3 text-sm text-muted">{about.lead}</p>
        <Link
          to="/login"
          className="mt-8 inline-block min-h-11 rounded-pill bg-accent px-8 py-3 text-sm font-semibold text-on-accent"
        >
          Google でログイン
        </Link>
        <p className="mt-3 text-xs text-muted">
          ログインすると
          <Link to="/terms" className="underline">
            利用規約
          </Link>
          と
          <Link to="/privacy" className="underline">
            プライバシーポリシー
          </Link>
          に同意したものとみなします。
        </p>
      </section>

      {purpose && (
        <section className="prose-cjk mt-10 border-t border-line pt-8">
          <h2 className="font-display text-lg font-bold">{purpose.heading}</h2>
          {purpose.body.map((paragraph, index) => (
            <p key={index} className="mt-3 text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
        </section>
      )}

      {features?.list && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">{features.heading}</h2>
          <ul className="mt-3 space-y-2">
            {features.list.map((item, index) => (
              <li key={index} className="flex gap-2 text-sm leading-relaxed">
                <span className="text-accent">・</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link to="/about" className="mt-4 inline-block text-sm text-accent hover:underline">
            もっと詳しく
          </Link>
        </section>
      )}
    </PublicLayout>
  );
}

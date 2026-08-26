import type { ReactNode } from 'react';

/**
 * Where a section is being rendered, which decides how it is separated from
 * what is around it.
 *
 * `card` is the page: a raised card on the page background. `panel` is the
 * dialog, whose body is already `bg-card` — a second card on top of it has no
 * edge at all, so the boundary is drawn with a border instead. The background
 * stays transparent either way, so the `bg-bg-alt` blockquotes inside keep the
 * contrast they were chosen for.
 */
export type SectionSurface = 'card' | 'panel';

/**
 * The emoji headers mirror the original markdown notes (📋🔧📌🌐📝🗣️🔗) and are
 * kept deliberately — they are how these notes have always been scanned.
 */
export function Section({
  emoji,
  title,
  surface = 'card',
  children,
}: {
  emoji: string;
  title: string;
  surface?: SectionSurface;
  children: ReactNode;
}) {
  return (
    <section
      className={
        surface === 'panel'
          ? 'rounded-panel border border-line p-4'
          : 'rounded-card bg-card p-5 shadow-panel sm:p-6'
      }
    >
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden>{emoji}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface KeyValueRow {
  label: string;
  value: string;
  /**
   * What language the *value* is in, when it is content rather than an
   * interface string — `lang="ja"` for a citation form, the reader's
   * translation language for a translation equivalent. The label never takes
   * one: it is always localised interface text.
   *
   * Optional because most rows carry a value that is already localised, and a
   * tag those rows do not need would be a claim this file cannot back up.
   *
   * `| undefined` written out because `exactOptionalPropertyTypes` is on and
   * the translation language genuinely is undefined on a public entry, where
   * the reader's profile does not know the author's — see
   * `useTranslationLang`. React drops the attribute for that value, which is
   * the behaviour wanted.
   */
  lang?: string | undefined;
}

export function KeyValueTable({ rows }: { rows: KeyValueRow[] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
          <dt className="text-muted">{row.label}</dt>
          <dd className="prose-cjk" lang={row.lang}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

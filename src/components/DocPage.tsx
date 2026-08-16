import type { Doc } from '@/content/doc';
import { PublicLayout } from './PublicLayout';

/**
 * One renderer for all four public documents, so the prose in `src/content` can
 * be rewritten — or handed to somebody to polish — without touching markup.
 *
 * The updated date is shown rather than hidden: a policy a reader cannot date
 * cannot be compared with the one they agreed to.
 */
export function DocPage({ doc }: { doc: Doc }) {
  return (
    <PublicLayout>
      <article className="prose-cjk">
        <h1 className="font-display text-3xl font-bold">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted">{doc.lead}</p>
        <p className="mt-1 text-xs text-muted tabular-nums">最終更新 {doc.updated}</p>

        <div className="mt-8 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-lg font-bold">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="mt-3 text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
              {section.link && (
                <a
                  href={section.link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-4 inline-block min-h-11 rounded-pill bg-accent px-6 py-3 text-sm font-semibold text-on-accent"
                >
                  {section.link.label}
                </a>
              )}
              {section.list && (
                <ul className="mt-3 space-y-2">
                  {section.list.map((item, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-relaxed">
                      <span className="text-muted">・</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </article>
    </PublicLayout>
  );
}

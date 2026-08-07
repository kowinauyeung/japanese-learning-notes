import type { ReactNode } from 'react';

/**
 * The emoji headers mirror the original markdown notes (📋🔧📌🌐📝🗣️🔗) and are
 * kept deliberately — they are how these notes have always been scanned.
 */
export function Section({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card bg-card p-5 shadow-panel sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden>{emoji}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function KeyValueTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
          <dt className="text-muted">{row.label}</dt>
          <dd className="prose-cjk">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

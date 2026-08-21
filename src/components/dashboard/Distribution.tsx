import { useState } from 'react';
import { useI18n } from '@/i18n/context';

/**
 * Rows beyond this stay in the DOM but hidden on narrow screens, so
 * "show more" reveals them without a refetch. Desktop has room for the full
 * list already, so the cap only ever bites below the `sm` breakpoint.
 */
const COLLAPSED_ROWS = 5;

/**
 * A bar list: one series showing magnitude per category, so a single accent
 * hue throughout — colour here encodes nothing, the bar length does. Labels and
 * counts stay in text tokens so identity never depends on colour.
 */
export function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="rounded-card bg-card p-5 shadow-panel">
      <h2 className="text-xs font-semibold tracking-wide text-muted">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {rows.map((row, index) => (
          <li
            key={row.label}
            className={`flex items-center gap-3 text-sm ${
              index >= COLLAPSED_ROWS && !expanded ? 'hidden sm:flex' : ''
            }`}
          >
            <span className="w-20 shrink-0 truncate" title={row.label}>
              {row.label}
            </span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-alt">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </span>
            <span className="w-7 shrink-0 text-right text-muted tabular-nums">{row.count}</span>
          </li>
        ))}
        {!rows.length && <li className="text-sm text-muted">{t('dashboard.noData')}</li>}
      </ul>
      {rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-xs font-medium text-accent sm:hidden"
        >
          {expanded ? t('dashboard.showLess') : t('dashboard.showMore')}
        </button>
      )}
    </section>
  );
}

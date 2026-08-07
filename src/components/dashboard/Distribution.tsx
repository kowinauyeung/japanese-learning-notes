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
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className="rounded-card bg-card p-5 shadow-panel">
      <h2 className="text-xs font-semibold tracking-wide text-muted">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 text-sm">
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
        {!rows.length && <li className="text-sm text-muted">データがありません</li>}
      </ul>
    </section>
  );
}

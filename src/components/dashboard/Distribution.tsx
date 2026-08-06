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
    <section className="rounded-card bg-card shadow-panel p-5">
      <h2 className="text-muted text-xs font-semibold tracking-wide">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0 truncate" title={row.label}>
              {row.label}
            </span>
            <span className="bg-bg-alt h-2.5 flex-1 overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </span>
            <span className="text-muted w-7 shrink-0 text-right tabular-nums">{row.count}</span>
          </li>
        ))}
        {!rows.length && <li className="text-muted text-sm">データがありません</li>}
      </ul>
    </section>
  );
}

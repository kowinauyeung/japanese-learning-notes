/**
 * Three headline numbers — no plot, so no tooltip layer and no legend.
 *
 * Stacked rather than side by side: the column sits beside the word of the day
 * at half width, which is too narrow for three centred tiles. `flex-1` splits
 * whatever height the neighbouring card sets, so the two stay level.
 */
export function StatTiles({ week, month, year }: { week: number; month: number; year: number }) {
  const tiles = [
    { label: '今週学んだ語', value: week },
    { label: '今月学んだ語', value: month },
    { label: '今年学んだ語', value: year },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-1 items-center justify-between gap-3 rounded-card bg-accent-soft px-5 py-4"
        >
          <p className="text-sm text-muted">{tile.label}</p>
          <p className="font-display text-3xl font-bold text-accent tabular-nums">{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

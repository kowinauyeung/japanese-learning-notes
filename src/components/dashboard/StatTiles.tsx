/** Three headline numbers — no plot, so no tooltip layer and no legend. */
export function StatTiles({ week, month, year }: { week: number; month: number; year: number }) {
  const tiles = [
    { label: '今週学んだ語', value: week },
    { label: '今月学んだ語', value: month },
    { label: '今年学んだ語', value: year },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-card bg-accent-soft p-4 text-center sm:p-5">
          <p className="font-display text-3xl font-bold text-accent tabular-nums sm:text-4xl">
            {tile.value}
          </p>
          <p className="text-muted mt-1 text-xs">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

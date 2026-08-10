/** 「3 / 12」 plus the bar, shared by both modes so they stay in step visually. */
export function SessionHeader({
  title,
  index,
  total,
  onQuit,
}: {
  title: string;
  /** Zero-based position of the card on screen. */
  index: number;
  total: number;
  onQuit: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xs font-semibold tracking-wide text-muted">{title}</h1>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted tabular-nums" aria-label="進捗">
            {index + 1} / {total}
          </p>
          <button type="button" onClick={onQuit} className="text-xs text-muted hover:text-ink">
            中断
          </button>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-bg-alt">
        <span
          className="block h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

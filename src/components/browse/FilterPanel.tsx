import type { Filters, SortKey } from '@/lib/filters';
import { JLPT_LEVELS, POS, STYLES, WORD_ORIGINS } from '@/types/entry';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'new', label: '追加日（新しい順）' },
  { value: 'old', label: '追加日（古い順）' },
  { value: 'headword', label: '見出し語順' },
];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function chipClass(active: boolean) {
  return `rounded-pill px-3 py-1 text-xs font-medium transition ${
    active ? 'bg-accent text-on-accent' : 'bg-bg-alt text-muted hover:text-ink'
  }`;
}

const selectClass =
  'rounded-panel border-line bg-bg text-ink min-h-9 border px-2 text-xs w-full';

export function FilterPanel({
  filters,
  allTags,
  onChange,
}: {
  filters: Filters;
  allTags: string[];
  onChange: (next: Filters) => void;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="rounded-card bg-card shadow-panel space-y-4 p-4">
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => set('tags', toggle(filters.tags, tag))}
              className={chipClass(filters.tags.includes(tag))}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {JLPT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => set('jlpt', toggle(filters.jlpt, level))}
            className={chipClass(filters.jlpt.includes(level))}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-muted text-[11px]">品詞</span>
          <select
            value={filters.pos}
            onChange={(event) => set('pos', event.target.value)}
            className={selectClass}
          >
            <option value="">すべて</option>
            {POS.map((part) => (
              <option key={part} value={part}>
                {part}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-muted text-[11px]">語種</span>
          <select
            value={filters.origin}
            onChange={(event) => set('origin', event.target.value)}
            className={selectClass}
          >
            <option value="">すべて</option>
            {WORD_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {origin}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-muted text-[11px]">文体</span>
          <select
            value={filters.style}
            onChange={(event) => set('style', event.target.value)}
            className={selectClass}
          >
            <option value="">すべて</option>
            {STYLES.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-muted text-[11px]">頻度（以上）</span>
          <select
            value={filters.minFreq}
            onChange={(event) => set('minFreq', Number(event.target.value))}
            className={selectClass}
          >
            <option value={0}>すべて</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {'★'.repeat(value)}
                {'☆'.repeat(5 - value)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-muted text-[11px]">開始日</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => set('from', event.target.value)}
            className={selectClass}
          />
        </label>

        <label className="space-y-1">
          <span className="text-muted text-[11px]">終了日</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => set('to', event.target.value)}
            className={selectClass}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-muted text-[11px]">並び順</span>
        <select
          value={filters.sort}
          onChange={(event) => set('sort', event.target.value as SortKey)}
          className={selectClass}
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

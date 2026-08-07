import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEntries } from '@/lib/entries';
import {
  EMPTY_FILTERS,
  fromSearchParams,
  isDefault,
  matches,
  sortEntries,
  toSearchParams,
} from '@/lib/filters';
import type { Filters } from '@/lib/filters';
import { EntryCard } from '@/components/browse/EntryCard';
import { FilterPanel } from '@/components/browse/FilterPanel';

export function Component() {
  const { entries, loading, error } = useEntries();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => fromSearchParams(searchParams), [searchParams]);
  const update = (next: Filters) => setSearchParams(toSearchParams(next), { replace: true });

  const allTags = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b, 'ja')),
    [entries],
  );

  const results = useMemo(
    () => sortEntries(entries.filter((entry) => matches(entry, filters)), filters.sort),
    [entries, filters],
  );

  const active = activeChips(filters);

  if (loading) return <p className="text-muted py-16 text-center text-sm">読み込み中…</p>;
  if (error) return <p className="text-danger py-16 text-center text-sm">{error}</p>;

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={filters.q}
        onChange={(event) => update({ ...filters, q: event.target.value })}
        placeholder="見出し語・読み方・タグ・意味・例文で検索"
        className="rounded-pill border-line bg-card text-ink placeholder:text-muted min-h-12 w-full border px-5 text-sm"
      />

      <FilterPanel filters={filters} allTags={allTags} onChange={update} />

      {!isDefault(filters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.clear(filters))}
              className="rounded-pill bg-accent-soft text-accent px-3 py-1 text-xs font-medium"
            >
              {chip.label} ✕
            </button>
          ))}
          <button
            type="button"
            onClick={() => update({ ...EMPTY_FILTERS, sort: filters.sort })}
            className="text-muted hover:text-ink px-2 text-xs underline"
          >
            すべて解除
          </button>
        </div>
      )}

      <p className="text-muted text-xs">{results.length} 語</p>

      {results.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {results.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="text-muted py-16 text-center text-sm">条件に合う単語がありません</p>
      )}
    </div>
  );
}

/** Removable summary of what is currently narrowing the list. */
function activeChips(filters: Filters) {
  const chips: { key: string; label: string; clear: (f: Filters) => Filters }[] = [];

  if (filters.q) {
    chips.push({ key: 'q', label: `「${filters.q}」`, clear: (f) => ({ ...f, q: '' }) });
  }
  for (const tag of filters.tags) {
    chips.push({
      key: `tag-${tag}`,
      label: `#${tag}`,
      clear: (f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }),
    });
  }
  for (const level of filters.jlpt) {
    chips.push({
      key: `jlpt-${level}`,
      label: level,
      clear: (f) => ({ ...f, jlpt: f.jlpt.filter((l) => l !== level) }),
    });
  }
  if (filters.pos) chips.push({ key: 'pos', label: filters.pos, clear: (f) => ({ ...f, pos: '' }) });
  if (filters.origin) {
    chips.push({ key: 'origin', label: filters.origin, clear: (f) => ({ ...f, origin: '' }) });
  }
  if (filters.style) {
    chips.push({ key: 'style', label: filters.style, clear: (f) => ({ ...f, style: '' }) });
  }
  if (filters.minFreq) {
    chips.push({
      key: 'freq',
      label: `${'★'.repeat(filters.minFreq)} 以上`,
      clear: (f) => ({ ...f, minFreq: 0 }),
    });
  }
  if (filters.from) {
    chips.push({ key: 'from', label: `${filters.from} 〜`, clear: (f) => ({ ...f, from: '' }) });
  }
  if (filters.to) {
    chips.push({ key: 'to', label: `〜 ${filters.to}`, clear: (f) => ({ ...f, to: '' }) });
  }
  return chips;
}

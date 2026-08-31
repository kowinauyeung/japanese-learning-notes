import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntryCard } from '@/components/browse/EntryCard';
import { FilterPanel } from '@/components/browse/FilterPanel';
import { VocabularySearch } from '@/components/browse/VocabularySearch';
import { useI18n } from '@/i18n/context';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
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
import { recentTags } from '@/lib/tags';

export function Component() {
  const { entries, loading, error } = useEntries();
  const errorMessage = useLoadErrorMessage(error);
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();

  const filters = useMemo(() => fromSearchParams(searchParams), [searchParams]);
  const update = (next: Filters) => setSearchParams(toSearchParams(next), { replace: true });

  const visibleTags = useMemo(() => recentTags(entries), [entries]);

  const results = useMemo(
    () =>
      sortEntries(
        entries.filter((entry) => matches(entry, filters)),
        filters.sort,
      ),
    [entries, filters],
  );

  const active = activeChips(filters, (stars) => t('vocabulary.frequencyAtLeastChip', { stars }));

  /**
   * Collapsed to start, on a phone. What is *doing* the narrowing stays on
   * screen either way — the removable chips below sit outside this — so a
   * folded panel hides the controls, never the state of the list.
   */
  const [open, setOpen] = useState(false);

  if (loading)
    return <p className="py-16 text-center text-sm text-muted">{t('vocabulary.loading')}</p>;
  if (errorMessage) return <p className="py-16 text-center text-sm text-danger">{errorMessage}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <VocabularySearch value={filters.q} onChange={(q) => update({ ...filters, q })} />
        </div>
        {/*
          Phones only, and it is the panel's own height that decides it: the
          filters are around 480px tall on a 390px screen — tags, levels, four
          dropdowns, two dates and a sort — so opening this page put the search
          box, the filters and nothing else on screen. The first word of a
          notebook the reader came to read was two scrolls down.

          Not a media query in JavaScript: `open` is what a phone follows and
          the panel is `nav:block` regardless, so above the breakpoint it is
          always shown and this button is not there to be pressed. That also
          means rotating a phone into a tablet width reveals the panel rather
          than hiding a control that was doing something.
        */}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
          className={`min-h-12 shrink-0 rounded-pill px-4 text-xs font-medium nav:hidden ${
            isDefault(filters) ? 'bg-bg-alt text-muted' : 'bg-accent-soft text-accent'
          }`}
        >
          {t('vocabulary.filter')}
          {open ? ' ▲' : ' ▼'}
        </button>
      </div>

      <div className={open ? 'block' : 'hidden nav:block'}>
        <FilterPanel
          filters={filters}
          tags={visibleTags}
          tagsLabel={t('vocabulary.recentTags')}
          onChange={update}
        />
      </div>

      {!isDefault(filters) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {active.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.clear(filters))}
              className="max-w-full rounded-pill bg-accent-soft px-3 py-1 text-left text-xs font-medium [overflow-wrap:anywhere] text-accent"
            >
              {chip.label} ✕
            </button>
          ))}
          <button
            type="button"
            onClick={() => update({ ...EMPTY_FILTERS, sort: filters.sort })}
            className="px-2 text-xs text-muted underline hover:text-ink"
          >
            {t('vocabulary.clearFilters')}
          </button>
        </div>
      )}

      <p className="text-xs text-muted">{t('vocabulary.resultCount', { count: results.length })}</p>

      {results.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {results.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-muted">{t('vocabulary.noResults')}</p>
      )}
    </div>
  );
}

/** Removable summary of what is currently narrowing the list. */
function activeChips(filters: Filters, frequencyLabel: (stars: string) => string) {
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
  if (filters.pos)
    chips.push({ key: 'pos', label: filters.pos, clear: (f) => ({ ...f, pos: '' }) });
  if (filters.origin) {
    chips.push({ key: 'origin', label: filters.origin, clear: (f) => ({ ...f, origin: '' }) });
  }
  if (filters.style) {
    chips.push({ key: 'style', label: filters.style, clear: (f) => ({ ...f, style: '' }) });
  }
  if (filters.minFreq) {
    chips.push({
      key: 'freq',
      label: frequencyLabel('★'.repeat(filters.minFreq)),
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

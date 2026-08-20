import { useState } from 'react';
import { FilterPanel } from '@/components/browse/FilterPanel';
import { INPUT_LIMITS } from '@/domain/limits';
import { useI18n } from '@/i18n/context';
import { EMPTY_FILTERS, isDefault } from '@/lib/filters';
import type { Filters } from '@/lib/filters';

/**
 * The search and filters, above both lists rather than inside the one they
 * narrow.
 *
 * They only affect 単語を探す, but they sit across the top so the two panels
 * below start at the same height and neither is pushed off screen by a filter
 * being opened — the point of the whole layout is that the drag's source and
 * its target are visible at once.
 */
export function PickerToolbar({
  filters,
  allTags,
  onChange,
}: {
  filters: Filters;
  allTags: string[];
  onChange: (next: Filters) => void;
}) {
  /**
   * Folded until asked for. 単語's filter panel is around 200px tall; open by default
   * it takes that much off both lists at once.
   */
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const narrowed = !isDefault(filters);

  return (
    <section className="space-y-3 rounded-card bg-card p-4 shadow-panel">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.q}
          onChange={(event) => onChange({ ...filters, q: event.target.value })}
          maxLength={INPUT_LIMITS.search}
          placeholder={t('vocabulary.searchPlaceholder')}
          className="min-h-11 min-w-0 flex-1 rounded-pill border border-line bg-bg px-4 text-sm text-ink placeholder:text-muted"
        />
        {narrowed && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}
            className="text-xs text-muted underline hover:text-ink"
          >
            {t('vocabulary.clearFilters')}
          </button>
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((shown) => !shown)}
          className={`min-h-11 shrink-0 rounded-pill px-4 text-xs font-medium ${
            narrowed ? 'bg-accent-soft text-accent' : 'bg-bg-alt text-muted hover:text-ink'
          }`}
        >
          {t('wordSets.filter')}
          {open ? ' ▲' : ' ▼'}
        </button>
      </div>

      {open && <FilterPanel filters={filters} allTags={allTags} onChange={onChange} />}
    </section>
  );
}

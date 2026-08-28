import { SelectControl, controlClass } from '@/components/controls';
import { JLPT_LEVELS, POS, STYLES, WORD_ORIGINS } from '@/domain/entry';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import type { Filters, SortKey } from '@/lib/filters';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function chipClass(active: boolean) {
  return `rounded-pill px-3 py-1 text-xs font-medium transition ${
    active ? 'bg-accent text-on-accent' : 'bg-bg-alt text-muted hover:text-ink'
  }`;
}

export function FilterPanel({
  filters,
  tags,
  tagsLabel,
  onChange,
}: {
  filters: Filters;
  /**
   * Shared with `PickerToolbar`, whose caller (`WordSetDetail`) passes every
   * tag in the notebook rather than a recency-limited sample — so this
   * component makes no claim either way about what the list contains. Say so
   * with `tagsLabel`, not by naming this prop after one caller's choice.
   */
  tags: string[];
  /** Shown above the chips when given; omitted, they render unlabeled. */
  tagsLabel?: string;
  onChange: (next: Filters) => void;
}) {
  const { t } = useI18n();
  const entryLabel = useEntryLabel();
  const sorts: { value: SortKey; label: string }[] = [
    { value: 'new', label: t('vocabulary.sortNewest') },
    { value: 'old', label: t('vocabulary.sortOldest') },
    { value: 'headword', label: t('vocabulary.sortHeadword') },
  ];
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="space-y-4 rounded-card bg-card p-4 shadow-panel">
      {tags.length > 0 && (
        <div className="space-y-1.5">
          {tagsLabel && <span className="text-[11px] text-muted">{tagsLabel}</span>}
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
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
          <span className="text-[11px] text-muted">{t('vocabulary.partOfSpeech')}</span>
          <SelectControl value={filters.pos} onChange={(event) => set('pos', event.target.value)}>
            <option value="">{t('vocabulary.all')}</option>
            {POS.map((part) => (
              <option key={part} value={part}>
                {entryLabel(part)}
              </option>
            ))}
          </SelectControl>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">{t('vocabulary.origin')}</span>
          <SelectControl
            value={filters.origin}
            onChange={(event) => set('origin', event.target.value)}
          >
            <option value="">{t('vocabulary.all')}</option>
            {WORD_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {entryLabel(origin)}
              </option>
            ))}
          </SelectControl>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">{t('vocabulary.style')}</span>
          <SelectControl
            value={filters.style}
            onChange={(event) => set('style', event.target.value)}
          >
            <option value="">{t('vocabulary.all')}</option>
            {STYLES.map((style) => (
              <option key={style} value={style}>
                {entryLabel(style)}
              </option>
            ))}
          </SelectControl>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">{t('vocabulary.frequencyAtLeast')}</span>
          <SelectControl
            value={filters.minFreq}
            onChange={(event) => set('minFreq', Number(event.target.value))}
          >
            <option value={0}>{t('vocabulary.all')}</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {'★'.repeat(value)}
                {'☆'.repeat(5 - value)}
              </option>
            ))}
          </SelectControl>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">{t('vocabulary.startDate')}</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => set('from', event.target.value)}
            className={controlClass}
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-muted">{t('vocabulary.endDate')}</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => set('to', event.target.value)}
            className={controlClass}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted">{t('vocabulary.sort')}</span>
        <SelectControl
          value={filters.sort}
          onChange={(event) => set('sort', event.target.value as SortKey)}
        >
          {sorts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectControl>
      </label>
    </div>
  );
}

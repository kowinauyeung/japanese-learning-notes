import { Link } from 'react-router-dom';
import { Ruby } from '@/components/Ruby';
import { VocabLink } from '@/components/VocabLink';
import type { Entry } from '@/domain/entry';
import { useI18n } from '@/i18n/context';
import { practiceFiltersToParams } from '@/lib/practice';
import type { PracticeFilters } from '@/lib/practice';

/**
 * 苦手な語 — every word whose most recent attempt was wrong, and the two
 * buttons that drill exactly those.
 *
 * The buttons are links, not handlers. A drill scoped to a filter is a place,
 * so it gets a URL: the back button leaves the drill, the link can be kept, and
 * the practice screen has one way in rather than two.
 */
export function WeakWords({
  words,
  filters,
}: {
  words: readonly Entry[];
  filters: PracticeFilters;
}) {
  const { t } = useI18n();
  if (words.length === 0) return null;

  // `start=1` is what makes it a review rather than a setup screen. It is a
  // separate parameter from the filters because it is not one: it says what to
  // do with them, and a link without it opens the same scope for editing.
  const query = practiceFiltersToParams(filters);
  query.set('start', '1');
  const review = `?${query.toString()}`;

  return (
    <section className="space-y-3 rounded-card bg-card p-5 shadow-panel">
      <h2 className="text-sm font-semibold">
        {t('history.weakWords')}
        <span className="ml-2 text-xs font-normal text-muted tabular-nums">{words.length}</span>
      </h2>

      <ul className="divide-y divide-line">
        {words.map((entry) => (
          <li key={entry.id}>
            <VocabLink entryId={entry.id} className="flex items-center justify-between gap-3 py-2">
              <Ruby
                headword={entry.headword}
                reading={entry.reading}
                className="has-ruby min-w-0 truncate font-display text-base font-bold"
              />
              <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                {entry.jlpt}
              </span>
            </VocabLink>
          </li>
        ))}
      </ul>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          to={`/practice/flashcards${review}`}
          className="grid min-h-11 place-items-center rounded-pill bg-bg-alt text-sm font-semibold text-ink"
        >
          {t('history.reviewFlashcards')}
        </Link>
        <Link
          to={`/practice/dictation${review}`}
          className="grid min-h-11 place-items-center rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          {t('history.reviewDictation')}
        </Link>
      </div>
    </section>
  );
}

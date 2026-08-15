import { Link } from 'react-router-dom';
import type { WordSet } from '@/domain/wordSet';
import { useI18n } from '@/i18n/context';

/**
 * One 単語集 in the list.
 *
 * `count` is passed in rather than read off `set.entryIds.length`, because the
 * two disagree once a word in the set has been deleted — see `membersOf`. The
 * caller resolves the members, so the card shows the number the detail page
 * will actually list.
 */
export function WordSetCard({ set, count }: { set: WordSet; count: number }) {
  const { t } = useI18n();
  return (
    <Link
      to={`/wordsets/${set.id}`}
      className="flex flex-col gap-2 rounded-card bg-card p-4 shadow-panel transition hover:-translate-y-0.5"
    >
      <h2 className="font-display text-lg font-bold">{set.name}</h2>
      {set.description && (
        <p className="prose-cjk line-clamp-2 text-sm text-muted">{set.description}</p>
      )}
      <p className="mt-auto text-xs text-muted tabular-nums">{t('wordSets.count', { count })}</p>
    </Link>
  );
}

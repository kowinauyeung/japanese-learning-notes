import { Link } from 'react-router-dom';
import { PitchAccent } from '@/components/PitchAccent';
import { Ruby } from '@/components/Ruby';
import type { Entry } from '@/domain/entry';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { stars } from '@/lib/entryFormat';
import { accentKana } from '@/lib/mora';

/**
 * Who the word is: the headword, how it is read and said, and the handful of
 * attributes that identify it at a glance.
 *
 * Shared by the detail page and the dialog so the two cannot drift — the dialog
 * used to show a shorter set, which made the same word look like two different
 * records depending on how it was opened. Only the type scale differs, because
 * a sheet on a phone has less room for a 40px headword than a page does.
 *
 * The action buttons are *not* here. The page carries edit and delete beside
 * the headword and the dialog carries edit alone, in a different arrangement,
 * so each renders its own cluster and passes it in.
 */
export function EntryHeadline({
  entry,
  compact = false,
  actions,
}: {
  entry: Entry;
  /** Dialog scale: a smaller headword and tighter spacing. */
  compact?: boolean;
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  const entryLabel = useEntryLabel();

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-full min-w-0">
        <Ruby
          headword={entry.headword}
          reading={entry.reading}
          className={
            compact
              ? 'has-ruby block font-display text-3xl font-bold [overflow-wrap:anywhere]'
              : 'has-ruby block font-display text-[34px] font-bold [overflow-wrap:anywhere] sm:text-[40px]'
          }
        />
        {entry.pitchAccent !== null && (
          <PitchAccent
            kana={accentKana(entry.headword, entry.reading)}
            pitchAccent={entry.pitchAccent}
            className={`mt-2 block font-display ${compact ? 'text-base' : 'text-lg'}`}
          />
        )}
        <div className={`${compact ? 'mt-2' : 'mt-3'} flex flex-wrap items-center gap-2 text-xs`}>
          <span className="rounded-pill bg-accent-soft px-2.5 py-1 font-semibold text-accent">
            {entry.jlpt}
          </span>
          {entry.pos.map((part) => (
            <span key={part} className="rounded-pill bg-bg-alt px-2.5 py-1 text-muted">
              {entryLabel(part)}
            </span>
          ))}
          <span className="text-accent" title={`${t('vocabulary.frequency')} ${entry.freq}/5`}>
            {stars(entry.freq)}
          </span>
          <span className="text-muted tabular-nums">{entry.learnedOn}</span>
        </div>
        {entry.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <Link
                key={tag}
                to={`/vocabulary?tag=${encodeURIComponent(tag)}`}
                className="text-xs text-accent"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Playing the word sits with edit and delete rather than beside the
          headword: the heading is a block that fills its column, and moving
          it into a row with a button next to it re-flows the box that
          `tests/e2e/visual.spec.ts` crops to prove furigana lands above the
          word it reads. */}
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

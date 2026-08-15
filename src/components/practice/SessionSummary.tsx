import { Link } from 'react-router-dom';
import { Ruby } from '@/components/Ruby';
import { VocabLink } from '@/components/VocabLink';
import type { Entry } from '@/domain/entry';

/**
 * End of a session: the score, what was missed, and the two ways back in.
 *
 * The missed list links each word to its detail page — the point of failing a
 * card is to go and read the note, and making the learner search for it again
 * is where a drill stops being a study tool.
 */
export function SessionSummary({
  total,
  correct,
  missed,
  saving,
  saveError,
  onRestart,
  onRetryMissed,
}: {
  total: number;
  correct: number;
  missed: Entry[];
  saving: boolean;
  saveError: string | null;
  onRestart: () => void;
  onRetryMissed: () => void;
}) {
  return (
    <section className="mx-auto max-w-2xl space-y-5 rounded-card bg-card p-6 shadow-panel">
      <header className="text-center">
        <h1 className="text-xs font-semibold tracking-wide text-muted">結果</h1>
        <p className="mt-2 font-display text-4xl font-bold tabular-nums">
          {correct} <span className="text-muted">/ {total}</span>
        </p>
        {saving && <p className="mt-1 text-xs text-muted">記録中…</p>}
        {saveError && <p className="mt-1 text-xs text-danger">{saveError}</p>}
      </header>

      {missed.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">間違えた語</p>
          <ul className="divide-y divide-line">
            {missed.map((entry) => (
              <li key={entry.id}>
                <VocabLink
                  entryId={entry.id}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                >
                  <Ruby
                    headword={entry.headword}
                    reading={entry.reading}
                    className="has-ruby font-display font-bold"
                  />
                  <span className="line-clamp-1 text-xs text-muted">
                    {entry.senses[0]?.description || entry.definition}
                  </span>
                </VocabLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={onRestart}
          className="min-h-11 flex-1 rounded-pill bg-accent px-4 text-sm font-semibold text-on-accent"
        >
          もう一度
        </button>
        {missed.length > 0 && (
          <button
            type="button"
            onClick={onRetryMissed}
            className="min-h-11 flex-1 rounded-pill bg-accent-soft px-4 text-sm font-semibold text-accent"
          >
            間違えた語だけ
          </button>
        )}
        <Link
          to="/"
          className="grid min-h-11 flex-1 place-items-center rounded-pill px-4 text-sm text-muted hover:bg-bg-alt"
        >
          学習サマリーに戻る
        </Link>
      </div>
    </section>
  );
}

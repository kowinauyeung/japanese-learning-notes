import { Link } from 'react-router-dom';
import type { Entry } from '@/domain/entry';
import type { PracticeMode, PracticeSession } from '@/domain/practice';
import { missedWords, sessionTime } from '@/lib/history';

const MODE_LABEL: Record<PracticeMode, string> = {
  flashcard: 'フラッシュカード',
  dictation: '書き取り練習',
};

/** One finished drill, as it reads weeks later. */
export function SessionRow({
  session,
  entries,
}: {
  session: PracticeSession;
  entries: readonly Entry[];
}) {
  const missed = missedWords(session, entries);

  return (
    <li className="space-y-1 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{MODE_LABEL[session.mode]}</span>
        <span className="font-display text-sm font-bold tabular-nums">
          {session.correct} / {session.total}
        </span>
      </div>

      {/* The filter label is stored, not rebuilt: it says what was drilled that
          day, and a 単語集 renamed since would otherwise rewrite history. */}
      <p className="text-xs text-muted">
        {sessionTime(session.finishedAt)} · {session.filterLabel}
      </p>

      {missed.length > 0 && (
        <p className="prose-cjk text-xs text-danger">
          間違えた語：
          {missed.map((entry, index) => (
            <span key={entry.id}>
              {index > 0 && '、'}
              <Link to={`/vocabulary/${entry.id}`} className="underline">
                {entry.headword}
              </Link>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

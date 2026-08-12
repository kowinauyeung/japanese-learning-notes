import type { Entry } from '@/domain/entry';
import type { PracticeMode, PracticeSession } from '@/domain/practice';
import { missedWords, sessionTime } from '@/lib/history';

const MODE_LABEL: Record<PracticeMode, string> = {
  flashcard: 'フラッシュカード',
  dictation: '書き取り練習',
};

/**
 * One finished drill, as it reads weeks later.
 *
 * The whole row is one button and the missed words are a count rather than a
 * list of links, which is the trade that made the row openable at all: a row
 * that is itself a control cannot hold controls, and a list of links inside a
 * clickable row is both a nesting error and a target nobody can hit reliably.
 * The words themselves are in the dialog, where there is room for them.
 */
export function SessionRow({
  session,
  entries,
  onOpen,
}: {
  session: PracticeSession;
  entries: readonly Entry[];
  onOpen: (session: PracticeSession) => void;
}) {
  const missed = missedWords(session, entries);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(session)}
        className="w-full space-y-1 rounded-panel px-2 py-3 text-left transition hover:bg-bg-alt"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{MODE_LABEL[session.mode]}</span>
          <span className="font-display text-sm font-bold tabular-nums">
            {session.correct} / {session.total}
          </span>
        </div>

        <p className="truncate text-xs text-muted">
          {sessionTime(session.finishedAt)} · {session.filterLabel}
        </p>

        {missed.length > 0 && (
          <p className="text-xs text-danger tabular-nums">間違えた語 {missed.length}</p>
        )}
      </button>
    </li>
  );
}

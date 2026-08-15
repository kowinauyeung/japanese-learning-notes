import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SessionDialog } from '@/components/history/SessionDialog';
import { SessionRow } from '@/components/history/SessionRow';
import { WeakWords } from '@/components/history/WeakWords';
import type { PracticeSession } from '@/domain/practice';
import { useI18n } from '@/i18n/context';
import { useEntries } from '@/lib/entries';
import { weakWords } from '@/lib/history';
import { loadErrorMessage } from '@/lib/loadError';
import { EMPTY_PRACTICE_FILTERS } from '@/lib/practice';
import { useProgress } from '@/lib/progress';
import { useVocabDialog } from '@/lib/vocabDialog';

/**
 * How many sessions a page holds.
 *
 * Small on purpose. Unlike the notebook, this collection only grows and nothing
 * reduces over it — no count, no chart — so there is never a reason to hold
 * more than is on screen.
 */
const PAGE_SIZE = 20;

/**
 * 履歴 — what has been drilled, and what is still going wrong.
 *
 * The one screen in the app that pages rather than loading everything. Sessions
 * accumulate for the life of the notebook and nothing aggregates over them, so
 * a walk is both cheaper and simpler than a provider holding the lot.
 */
export function Component() {
  const { entries, loading: entriesLoading, error: entriesError } = useEntries();
  const { weakIds, loading: progressLoading, error: progressError, repository } = useProgress();
  const { t } = useI18n();

  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The row that has been opened out, or null. Held here so the dialog is a
   *  sibling of the list rather than something each row carries. */
  const [opened, setOpened] = useState<PracticeSession | null>(null);

  /**
   * Which walk may publish, the shape the providers settled on.
   *
   * `more` is a button, so two presses can overlap on a slow connection — and
   * the second would otherwise append a page the first had already appended.
   */
  const walk = useRef(0);

  const loadPage = useCallback(
    async (after: string | null) => {
      const mine = (walk.current += 1);
      setLoading(true);
      setError(null);
      try {
        const page = await repository.listSessions({ limit: PAGE_SIZE, cursor: after });
        if (walk.current !== mine) return;
        // Appended, never replaced: `after` is where the previous page ended,
        // so a page fetched with one is the continuation of what is on screen.
        setSessions((current) => (after === null ? page.items : [...current, ...page.items]));
        setCursor(page.cursor);
      } catch (cause) {
        console.error(cause);
        if (walk.current === mine)
          setError(loadErrorMessage(cause, t('history.loadError'), t('load.accessDenied')));
      } finally {
        if (walk.current === mine) setLoading(false);
      }
    },
    [repository, t],
  );

  useEffect(() => {
    void loadPage(null);
  }, [loadPage]);

  const weak = useMemo(() => weakWords(weakIds, entries), [weakIds, entries]);

  /**
   * Opening a word from inside the session dialog closes the session dialog.
   *
   * Two modals over each other is one Escape closing both and a backdrop that
   * belongs to neither. The word is what was asked for, so it is the one that
   * stays.
   */
  const { openId } = useVocabDialog();
  useEffect(() => {
    if (openId !== null) setOpened(null);
  }, [openId]);

  if (entriesLoading || progressLoading)
    return <p className="py-16 text-center text-sm text-muted">{t('vocabulary.loading')}</p>;
  // Both feed this page: the sessions name entry ids, and 苦手な語 is the
  // progress map resolved against the notebook. Either failing leaves rows that
  // would silently render short.
  if (entriesError || progressError)
    return <p className="py-16 text-center text-sm text-danger">{entriesError ?? progressError}</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">{t('history.title')}</h1>

      {/* 苦手のみ, so the button drills the list printed above it. */}
      <WeakWords words={weak} filters={{ ...EMPTY_PRACTICE_FILTERS, weakOnly: true }} />

      <section className="space-y-2 rounded-card bg-card p-5 shadow-panel">
        <h2 className="text-sm font-semibold">{t('history.practiceHistory')}</h2>

        {error && <p className="text-sm text-danger">{error}</p>}

        {sessions.length > 0 ? (
          <ul className="divide-y divide-line">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} entries={entries} onOpen={setOpened} />
            ))}
          </ul>
        ) : (
          !loading &&
          !error && <p className="py-8 text-center text-sm text-muted">{t('history.empty')}</p>
        )}

        {loading && (
          <p className="py-4 text-center text-sm text-muted">{t('vocabulary.loading')}</p>
        )}

        {cursor !== null && !loading && (
          <button
            type="button"
            onClick={() => void loadPage(cursor)}
            className="min-h-11 w-full rounded-pill bg-bg-alt text-sm font-semibold text-ink"
          >
            {t('history.more')}
          </button>
        )}
      </section>

      <SessionDialog session={opened} entries={entries} onClose={() => setOpened(null)} />
    </div>
  );
}

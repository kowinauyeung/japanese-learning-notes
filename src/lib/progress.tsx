import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ProgressRepository } from '@/domain/ports';
import type { EntryProgress, PracticeSessionDraft } from '@/domain/practice';
import { progressRepositoryFor } from '@/lib/backend';
import { weakIdsOf } from '@/lib/practice';

interface ProgressValue {
  progress: EntryProgress[];
  /** Entries whose most recent attempt was wrong — what 苦手のみ selects. */
  weakIds: Set<string>;
  loading: boolean;
  error: string | null;
  /** Writes a finished session and folds its rows into the state in memory. */
  record: (session: PracticeSessionDraft, rows: EntryProgress[]) => Promise<void>;
  /**
   * Exposed for 履歴, which pages `listSessions` itself.
   *
   * Sessions are not held here: this provider keeps the one document every
   * screen needs, and the session log is an unbounded collection only one route
   * reads. Loading it on sign-in would be a read nobody asked for, and holding
   * a page cursor in a provider would put one screen's scroll position in
   * global state.
   */
  repository: ProgressRepository;
}

const ProgressContext = createContext<ProgressValue | null>(null);

/**
 * Practice state for the signed-in user, loaded once.
 *
 * Unlike `EntriesProvider` this is a single document, so "load it all" carries
 * no growth cost worth planning around: one read on sign-in and one write per
 * finished session, whatever the size of the notebook.
 *
 * A failed load is not fatal and deliberately does not block the practice
 * screen. Without progress, 苦手のみ has nothing to offer and is disabled; every
 * other filter still works, and a learner who cannot reach their weak-word list
 * should still be able to drill.
 */
export function ProgressProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [progress, setProgress] = useState<EntryProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repository = useMemo(() => progressRepositoryFor(uid), [uid]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    repository
      .listAll()
      .then((rows) => {
        if (!cancelled) setProgress(rows);
      })
      .catch((cause: unknown) => {
        console.error(cause);
        if (!cancelled) setError('練習の記録を読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const record = useCallback(
    async (session: PracticeSessionDraft, rows: EntryProgress[]) => {
      await repository.recordSession(session, rows);
      // Merged locally rather than re-read. The rows written are exactly the
      // rows computed from what is already in state, so a round trip would
      // return the same values and cost a read on every finished session.
      setProgress((current) => {
        const byId = new Map(current.map((row) => [row.entryId, row]));
        for (const row of rows) byId.set(row.entryId, row);
        return [...byId.values()];
      });
    },
    [repository],
  );

  const value = useMemo(
    () => ({ progress, weakIds: weakIdsOf(progress), loading, error, record, repository }),
    [progress, loading, error, record, repository],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const value = useContext(ProgressContext);
  if (!value) throw new Error('useProgress must be used inside <ProgressProvider>');
  return value;
}

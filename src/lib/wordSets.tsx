import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { WordSet } from '@/domain/wordSet';
import { wordSetRepositoryFor } from '@/lib/backend';

interface WordSetsValue {
  sets: WordSet[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const WordSetsContext = createContext<WordSetsValue | null>(null);

/**
 * A page size that is really a ceiling: a learner with more than 200 named
 * 単語集 has a different problem, and every screen that wants sets wants all
 * of them — the practice filter, the detail page's "which sets is this in",
 * and `/wordsets` itself.
 */
const PAGE_SIZE = 200;

/**
 * The user's 単語集, loaded once.
 *
 * Nothing creates a set yet — `/wordsets` is still a placeholder — so in the
 * running app this list is empty and the practice filter that reads it stays
 * hidden. That is the design's own rule for the chips ("only shown if any
 * exist") rather than a stub: the read path is real, and the filter starts
 * working the day the first set is written.
 */
export function WordSetsProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [sets, setSets] = useState<WordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const repository = useMemo(() => wordSetRepositoryFor(uid), [uid]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: WordSet[] = [];
      let cursor: string | null = null;
      do {
        const page = await repository.list({ limit: PAGE_SIZE, cursor });
        all.push(...page.items);
        cursor = page.cursor;
      } while (cursor);
      setSets(all);
    } catch (cause) {
      console.error(cause);
      setError('単語集を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ sets, loading, error, refresh }), [sets, loading, error, refresh]);
  return <WordSetsContext.Provider value={value}>{children}</WordSetsContext.Provider>;
}

export function useWordSets() {
  const value = useContext(WordSetsContext);
  if (!value) throw new Error('useWordSets must be used inside <WordSetsProvider>');
  return value;
}

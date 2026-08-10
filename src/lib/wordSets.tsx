import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
 * A page size, and only that: the loop below walks every page there is. Every
 * screen that wants sets wants all of them — the practice filter, the detail
 * page's "which sets is this in", and `/wordsets` itself — so there is nothing
 * to cap it at. 200 is a round number of round trips, not a limit.
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

  /**
   * Which walk is allowed to publish its result.
   *
   * The loop below awaits a page at a time, so a `uid` change part-way through
   * leaves an in-flight walk that would otherwise finish by calling `setSets`
   * with the previous account's 単語集. `ProgressProvider` uses a `cancelled`
   * flag scoped to its effect; that does not fit here because `refresh` is
   * also called by hand, and a counter covers both — a superseded walk simply
   * stops being the current one.
   */
  const walk = useRef(0);

  const refresh = useCallback(async () => {
    const mine = (walk.current += 1);
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
      if (walk.current === mine) setSets(all);
    } catch (cause) {
      console.error(cause);
      if (walk.current === mine) setError('単語集を読み込めませんでした。');
    } finally {
      if (walk.current === mine) setLoading(false);
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

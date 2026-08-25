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
import type { WordSetRepository } from '@/domain/ports';
import type { WordSet } from '@/domain/wordSet';
import { wordSetRepositoryFor } from '@/lib/backend';
import { captureLoadFailure, isUnreachable } from '@/lib/loadError';
import type { LoadFailure } from '@/lib/loadError';
import { useRetryOnReconnect } from '@/lib/retryOnReconnect';

interface WordSetsValue {
  sets: WordSet[];
  loading: boolean;
  error: LoadFailure | null;
  refresh: () => Promise<void>;
  /**
   * Exposed for the same reason `EntriesProvider` exposes its own: `/wordsets`
   * writes through the instance the list was read from, so a write and the
   * refresh that follows it can never be talking to two different accounts.
   */
  repository: WordSetRepository;
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
 * Every screen wants all of them and there are few, so this is one list rather
 * than a query per page: `/wordsets` renders it, `/wordsets/:id` picks one out
 * of it, and the practice filter builds its chips from it.
 */
export function WordSetsProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [sets, setSets] = useState<WordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);

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

  /**
   * Re-read the sets. **Deliberately does not raise `loading`.**
   *
   * Every write on `/wordsets` ends here, and the routes treat `loading` as
   * "replace the page with 読み込み中…" — so raising it took the whole screen
   * down and put it back on every add, rename and reorder. The list in hand is
   * not invalid during a refresh, it is one write out of date, and the screen
   * that has it is the right thing to keep showing.
   *
   * The gate still goes up where nothing valid *is* in hand: on mount, and when
   * `repository` changes because the account did. That is the effect below.
   */
  const refresh = useCallback(async () => {
    const mine = (walk.current += 1);
    try {
      const all: WordSet[] = [];
      let cursor: string | null = null;
      do {
        const page = await repository.list({ limit: PAGE_SIZE, cursor });
        all.push(...page.items);
        cursor = page.cursor;
      } while (cursor);
      // Cleared here, not eagerly — see the same comment on `EntriesProvider`.
      if (walk.current === mine) {
        setSets(all);
        setError(null);
      }
    } catch (cause) {
      console.error(cause);
      if (walk.current === mine) setError(captureLoadFailure(cause, 'load.wordSets'));
    } finally {
      if (walk.current === mine) setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  /** See the same guard on `EntriesProvider` — denial is not cleared by reconnecting. */
  useRetryOnReconnect(error !== null && isUnreachable(error.cause), refresh);

  const value = useMemo(
    () => ({ sets, loading, error, refresh, repository }),
    [sets, loading, error, refresh, repository],
  );
  return <WordSetsContext.Provider value={value}>{children}</WordSetsContext.Provider>;
}

export function useWordSets() {
  const value = useContext(WordSetsContext);
  if (!value) throw new Error('useWordSets must be used inside <WordSetsProvider>');
  return value;
}

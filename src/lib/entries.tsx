import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Entry } from '@/domain/entry';
import type { EntryRepository } from '@/domain/ports';
import { entryRepositoryFor } from '@/lib/backend';

interface EntriesValue {
  entries: Entry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * Exposed so the form and the detail page write through the same instance the
   * list was read from, instead of each building their own. It is the only
   * thing in the app that knows where entries are stored.
   */
  repository: EntryRepository;
}

const EntriesContext = createContext<EntriesValue | null>(null);

/**
 * Pages are requested in chunks rather than as one unbounded read, but every
 * chunk is still fetched: the dashboard statistics, the heatmap and the Browse
 * filters all reduce over the complete set, so partial data would silently show
 * wrong counts. Teaching those views to work from a partial set is a separate
 * change from moving them behind a repository, and this one preserves behaviour.
 */
const PAGE_SIZE = 200;

/**
 * The whole collection is loaded once and kept in memory.
 *
 * At this size that is both faster and more capable than querying: search and
 * every filter combination the handoff asks for run over the array in
 * microseconds, with no composite indexes and no Firestore limits on how many
 * inequality filters can be combined.
 *
 * It does not survive growth. Reads scale with users × words, and a lifetime
 * notebook only gains words, so the free daily read quota is reached somewhere
 * around 125 users at 200 words each. The repository is already paged for that.
 *
 * `uid` is a prop rather than a `useAuth()` call because this provider only
 * ever renders below the auth gate in `AppLayout`. Taking it from the caller
 * is what lets `repository` be non-null, which removes a null branch from
 * every write site.
 */
export function EntriesProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rebuilt when the signed-in user changes, so the `users/{uid}` path baked
  // into the repository can never outlive the session it belongs to.
  const repository = useMemo(() => entryRepositoryFor(uid), [uid]);

  /**
   * Re-read the notebook. **Deliberately does not raise `loading`.**
   *
   * Saving a word and deleting one both end here, and every route treats
   * `loading` as "replace the page with 読み込み中…" — so raising it blanked
   * Browse behind the add sheet on every save, losing the scroll position with
   * it. The entries in hand are one write out of date, not invalid.
   *
   * The gate goes up on mount and on an account change, in the effect below.
   */
  const refresh = useCallback(async () => {
    setError(null);
    try {
      const all: Entry[] = [];
      let cursor: string | null = null;
      do {
        const page = await repository.list({ limit: PAGE_SIZE, cursor });
        all.push(...page.items);
        cursor = page.cursor;
      } while (cursor);
      setEntries(all);
    } catch (cause) {
      console.error(cause);
      setError('単語を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ entries, loading, error, refresh, repository }),
    [entries, loading, error, refresh, repository],
  );
  return <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>;
}

export function useEntries() {
  const value = useContext(EntriesContext);
  if (!value) throw new Error('useEntries must be used inside <EntriesProvider>');
  return value;
}

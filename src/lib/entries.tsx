import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import type { Entry } from '../types/entry';
import { db } from './firebase';

interface EntriesValue {
  entries: Entry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EntriesContext = createContext<EntriesValue | null>(null);

/**
 * The whole collection is loaded once and kept in memory.
 *
 * At this size that is both faster and more capable than querying: search and
 * every filter combination the handoff asks for run over the array in
 * microseconds, with no composite indexes and no Firestore limits on how many
 * inequality filters can be combined.
 */
export function EntriesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDocs(collection(db, 'entries'));
      setEntries(snapshot.docs.map((doc) => ({ ...(doc.data() as Omit<Entry, 'id'>), id: doc.id })));
    } catch (cause) {
      console.error(cause);
      setError('単語を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ entries, loading, error, refresh }),
    [entries, loading, error, refresh],
  );
  return <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>;
}

export function useEntries() {
  const value = useContext(EntriesContext);
  if (!value) throw new Error('useEntries must be used inside <EntriesProvider>');
  return value;
}

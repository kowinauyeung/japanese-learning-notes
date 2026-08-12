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
import { useLocation } from 'react-router-dom';

interface VocabDialogValue {
  /** The word being looked at, or null. */
  openId: string | null;
  open: (entryId: string) => void;
  close: () => void;
}

const VocabDialogContext = createContext<VocabDialogValue | null>(null);

/**
 * Looking at a word without leaving the page you found it on.
 *
 * **Why this does not go through the router.** The three things asked of it
 * pull against each other: the page underneath has to stay mounted, the address
 * bar has to read `/vocabulary/:id`, and a reload of that address has to give
 * the full page rather than the dialog. The last two mean the dialog cannot be
 * encoded in the URL, and the first means the router must not navigate — so the
 * only thing left that can tell them apart is state that does *not* survive a
 * reload. `location.state` does survive it: React Router keeps it in
 * `history.state`, which the browser restores. React state does not, which is
 * exactly the property required.
 *
 * So the URL is pushed directly and the router is left alone. It never learns
 * about the entry, `useLocation()` keeps reporting the page underneath, and
 * that page stays mounted because nothing asked it to unmount.
 *
 * Two listeners keep the two halves in agreement:
 *
 *  - `popstate` closes the dialog. Back therefore returns to the page you were
 *    on rather than leaving it, which is what a dialog's back button should do.
 *    Forward lands on the real address and the router renders the full page,
 *    with no dialog over it — coherent, if not symmetric.
 *  - a change in the router's own location closes it too, because an in-app
 *    link was followed and the dialog now belongs to a page that is gone.
 */
export function VocabDialogProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const location = useLocation();

  /** Where the address bar was before the dialog borrowed it. */
  const restore = useRef<string | null>(null);

  const open = useCallback((entryId: string) => {
    restore.current = window.location.pathname + window.location.search;
    setOpenId(entryId);
    // A push, not a replace: replacing would spend the entry the page under it
    // occupies, and Back would then leave the page instead of closing this.
    window.history.pushState(window.history.state, '', `/vocabulary/${entryId}`);
  }, []);

  const close = useCallback(() => {
    setOpenId(null);
    // Unwinds the entry pushed above, which puts the address back without
    // adding a third one. `popstate` then fires and finds nothing to close.
    if (restore.current !== null) {
      restore.current = null;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      restore.current = null;
      setOpenId(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /**
   * The router moved, so the page this was opened over is no longer showing.
   *
   * Skipped on the render that opens the dialog, because opening does not
   * change the router's location — that is the whole point — so this only ever
   * fires for a real navigation.
   */
  const routerPath = `${location.pathname}${location.search}`;
  useEffect(() => {
    setOpenId(null);
    restore.current = null;
  }, [routerPath]);

  const value = useMemo(() => ({ openId, open, close }), [openId, open, close]);
  return <VocabDialogContext.Provider value={value}>{children}</VocabDialogContext.Provider>;
}

export function useVocabDialog() {
  const value = useContext(VocabDialogContext);
  if (!value) throw new Error('useVocabDialog must be used inside <VocabDialogProvider>');
  return value;
}

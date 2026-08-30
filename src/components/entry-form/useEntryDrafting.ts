import { useEffect, useRef, useState } from 'react';
import { EntryDraftingError, type EntryDraftingFailure } from '@/domain/ports';
import { entryDraftingPort } from '@/lib/backend';

/**
 * One request to the drafting port, with the guards that request needs.
 *
 * Extracted from `JsonImport` when a second caller appeared — the 簡易 tab's
 * 「AIで作成して保存」. None of what it holds is boilerplate: the unmount guard,
 * the `finally` that clears `drafting`, and the classification of a rejection
 * into one of four reasons are each a defect that was fixed once, and a second
 * hand-written copy is where the next one comes back.
 *
 * **The unmount guard is why this is a hook and not a function.** A reply that
 * arrives after its caller is gone must be dropped, not applied: `EntryFormModal`
 * stays mounted when it is closed — `AppLayout` renders it unconditionally and
 * only `Modal` returns null — so a reply resolving after a close would otherwise
 * write into the state the *next* opening is about to reset, and in the 簡易
 * tab's case would create an entry for a dialog the user had dismissed.
 *
 * That makes the mounting position load-bearing. Call this from a component
 * that is rendered *inside* `Modal`'s children and inside the panel it belongs
 * to — both `JsonImport` and `SimpleForm` are — so that closing the dialog or
 * leaving the tab really does unmount it. Calling it from `EntryFormModal`
 * itself would compile and would silently have no guard at all.
 */
export function useEntryDrafting() {
  const [drafting, setDrafting] = useState(false);

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /*
    Asked at render rather than stored: `available()` is a synchronous read of
    whether the SDK initialised, and it does not change during a session. It can
    change *between* renders — a permanent failure makes it answer false from
    then on — which is why callers keep the explanation on screen after the
    control it explains has gone.
  */
  const available = entryDraftingPort.available();

  /**
   * Ask for one draft.
   *
   * Never rejects: both outcomes are handed to a callback instead, so a caller
   * can write `void draft(...)` without an unhandled rejection and without a
   * `catch` of its own that would have to re-derive the four reasons.
   */
  const draft = async (
    prompt: string,
    handlers: { onReply: (raw: string) => void; onFailure: (reason: EntryDraftingFailure) => void },
  ) => {
    setDrafting(true);
    try {
      const raw = await entryDraftingPort.draft(prompt);
      if (!alive.current) return;
      handlers.onReply(raw);
    } catch (cause) {
      // Anything that is not the port's own error is `failed` — the one reason
      // of the four that invites a retry, which is the right default for a
      // rejection nobody anticipated.
      if (alive.current) {
        handlers.onFailure(cause instanceof EntryDraftingError ? cause.reason : 'failed');
      }
    } finally {
      // In `finally` rather than after the call: an error path that leaves this
      // true is a button disabled for the rest of the session.
      if (alive.current) setDrafting(false);
    }
  };

  return { available, drafting, draft };
}

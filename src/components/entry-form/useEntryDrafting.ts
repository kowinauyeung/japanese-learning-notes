import { useEffect, useRef, useState } from 'react';
import { EntryDraftingError, type EntryDraftingFailure } from '@/domain/ports';
import { entryDraftingPort } from '@/lib/backend';

/**
 * One request to the drafting port, with the guards that request needs.
 *
 * Extracted from `JsonImport` when a second caller appeared — the 簡単 tab's
 * 「AIで作成して保存」. None of what it holds is boilerplate: the unmount guard,
 * the `finally` that clears `drafting`, and the classification of a rejection
 * into one of four reasons are each a defect that was fixed once, and a second
 * hand-written copy is where the next one comes back.
 *
 * **The unmount guard is why this is a hook and not a function.** A reply that
 * arrives after its caller is gone must be dropped, not applied: `EntryFormModal`
 * stays mounted when it is closed — `AppLayout` renders it unconditionally and
 * only `Modal` returns null — so a reply resolving after a close would otherwise
 * write into the state the *next* opening is about to reset, and in the 簡単
 * tab's case would create an entry for a dialog the user had dismissed.
 *
 * That makes the mounting position load-bearing. Call this from a component
 * that is rendered *inside* `Modal`'s children and inside the panel it belongs
 * to — both `JsonImport` and `SimpleForm` are — so that closing the dialog or
 * leaving the tab really does unmount it. Calling it from `EntryFormModal`
 * itself would compile and would silently have no guard at all.
 */
/**
 * Identifies one request, so a caller can tell which one is reporting.
 *
 * An opaque object rather than a counter: two panels hold two hook instances
 * and a counter local to either would collide with the other's.
 */
export type DraftRequest = object;

export function useEntryDrafting(onBusyChange?: (busy: boolean, request: DraftRequest) => void) {
  const [drafting, setDrafting] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    // Set on the way in as well as cleared on the way out, and the setup half is
    // not ceremony.
    //
    // `<StrictMode>` — which `main.tsx` wraps the whole app in — mounts, runs
    // effects, runs their cleanups and runs them again, in development only. A
    // cleanup-only effect therefore ends its *first* mount with this false and
    // nothing anywhere to put it back, so every reply is dropped for the life of
    // the session: nothing imported, nothing saved, no message, and a button
    // that never leaves 作成中 because the flag that clears it is behind the same
    // guard. Three symptoms, one cause, and it reads exactly like a request that
    // never came back.
    //
    // Production does not double-invoke, so this was invisible outside `yarn dev`
    // — which is where the feature is developed, and where it had never once
    // worked.
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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
    const request: DraftRequest = {};
    setDrafting(true);
    onBusyChange?.(true, request);
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
      /*
        Reported unconditionally, but *named*, and both halves matter.

        Unconditional, because the caller is not the thing the guard above
        protects: it outlives this hook, which is the whole reason it needs
        telling. Skip it when the panel unmounts mid-request and the caller is
        left locked with nothing on its way to unlock it.

        Named, because "unconditional" alone was wrong in the other direction.
        The dialog can be closed while a request is out — the close button stays
        live on purpose, as the way out of a request that hangs — and reopening
        it starts a second one. The first then settles and unlocked the second,
        re-enabling the save over a form the second request was still about to
        overwrite. The caller compares this against the request it is waiting on
        and ignores anything else.
      */
      onBusyChange?.(false, request);
    }
  };

  return { available, drafting, draft };
}

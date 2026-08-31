import { onSnapshot } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';

export const LOCAL_WRITE_FALLBACK_MS = 1_000;

const rejection = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export class LocalWriteTracker {
  #fallbackMs: number;
  #terminalFailures: Error[] = [];
  #outcomes = new Set<Promise<unknown>>();

  constructor(fallbackMs = LOCAL_WRITE_FALLBACK_MS) {
    this.#fallbackMs = fallbackMs;
  }

  write(
    ref: DocumentReference,
    write: () => Promise<unknown>,
    { missingIsSaved = false }: { missingIsSaved?: boolean } = {},
  ): Promise<void> {
    return waitForLocalWrite(ref, write, {
      fallbackMs: this.#fallbackMs,
      missingIsSaved,
      onWriteSettled: (handled) => {
        // `handled` resolves only after `waitForLocalWrite` has finished acting
        // on the write's own result — `onLateRejection` included. Holding it is
        // what lets `settle` read `#terminalFailures` after every failure has
        // been recorded rather than racing the callback that records them.
        const tracked = handled.catch(() => undefined);
        this.#outcomes.add(tracked);
        void tracked.finally(() => this.#outcomes.delete(tracked));
      },
      onLateRejection: (error) => {
        this.#terminalFailures.push(error);
        console.error('Firestore write rejected after local persistence', error);
      },
    });
  }

  async settle(waitForBackend: () => Promise<void>): Promise<void> {
    await waitForBackend();
    // `waitForPendingWrites` resolves once the backend has *acknowledged* every
    // queued write, and a write it refused is acknowledged too. The refusal
    // reaches the write's own promise on a separate callback, so the barrier
    // above says nothing about whether that callback has run — and the caller
    // this exists for, `deleteEverything`, removes the Auth credential needed to
    // retry the moment this resolves. Waiting for each write's own outcome is
    // the only ordering that holds; a bare microtask hop is not one.
    await Promise.all([...this.#outcomes]);
    if (this.#terminalFailures.length === 0) return;
    const failures = this.#terminalFailures.splice(0);
    const firstFailure = failures[0];
    if (failures.length === 1 && firstFailure) throw firstFailure;
    const error = new Error('Firestore writes rejected after local persistence') as Error & {
      errors: Error[];
    };
    error.errors = failures;
    throw error;
  }
}

/**
 * Plain Firestore writes are visible in the local cache before the server
 * acknowledges them, but their returned promises wait for that acknowledgement.
 * Offline, that leaves a UI spinner running for a write the device already has.
 *
 * The grace period keeps the normal online path on the server acknowledgement,
 * so serverTimestamp fields are still resolved before the repository reports
 * success and avoids installing per-write listeners for fast writes. Only a
 * write that is both unacknowledged after the grace period and then observed as
 * pending or deleted in the local cache is treated as saved locally.
 *
 * `missingIsSaved` is what tells those two apart, and it is off by default. A
 * document that is not in the cache is proof of a local delete and of nothing
 * else: an offline `updateDoc` against an id that has since been deleted is not
 * applied to the local view at all, so the snapshot comes back missing with no
 * pending write against it. Reading that as success closes the edit screen over
 * a change the server is going to refuse. Only `remove()` may pass it.
 */
export function waitForLocalWrite(
  ref: DocumentReference,
  write: () => Promise<unknown>,
  {
    fallbackMs = LOCAL_WRITE_FALLBACK_MS,
    missingIsSaved = false,
    onWriteSettled = () => {},
    onLateRejection = (error: Error) => {
      console.error('Firestore write rejected after local persistence', error);
    },
  }: {
    fallbackMs?: number;
    missingIsSaved?: boolean;
    onWriteSettled?: (handled: Promise<void>) => void;
    onLateRejection?: (error: Error) => void;
  } = {},
): Promise<void> {
  let unsubscribe: (() => void) | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  return new Promise((resolve, reject) => {
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribe?.();
      complete();
    };

    const startFallbackListener = () => {
      if (settled) return;
      try {
        unsubscribe = onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (snapshot.metadata.hasPendingWrites) finish(resolve);
            else if (missingIsSaved && !snapshot.exists()) finish(resolve);
          },
          (cause) => finish(() => reject(rejection(cause))),
        );
      } catch (cause) {
        finish(() => reject(rejection(cause)));
      }
    };

    let writePromise: Promise<unknown>;
    try {
      writePromise = write();
    } catch (cause) {
      finish(() => reject(rejection(cause)));
      return;
    }

    const handled = writePromise.then(
      () => finish(resolve),
      (cause) => {
        const error = rejection(cause);
        if (settled) {
          onLateRejection(error);
          return;
        }
        finish(() => reject(error));
      },
    );
    onWriteSettled(handled);

    fallbackTimer = setTimeout(() => {
      startFallbackListener();
    }, fallbackMs);
  });
}

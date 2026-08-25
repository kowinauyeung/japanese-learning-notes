import { onSnapshot } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';

export const LOCAL_WRITE_FALLBACK_MS = 1_000;

const rejection = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export class LocalWriteTracker {
  #fallbackMs: number;
  #terminalFailures: Error[] = [];

  constructor(fallbackMs = LOCAL_WRITE_FALLBACK_MS) {
    this.#fallbackMs = fallbackMs;
  }

  write(ref: DocumentReference, write: () => Promise<unknown>): Promise<void> {
    return waitForLocalWrite(ref, write, {
      fallbackMs: this.#fallbackMs,
      onLateRejection: (error) => {
        this.#terminalFailures.push(error);
        console.error('Firestore write rejected after local persistence', error);
      },
    });
  }

  async settle(waitForBackend: () => Promise<void>): Promise<void> {
    await waitForBackend();
    await Promise.resolve();
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
 */
export function waitForLocalWrite(
  ref: DocumentReference,
  write: () => Promise<unknown>,
  {
    fallbackMs = LOCAL_WRITE_FALLBACK_MS,
    onLateRejection = (error: Error) => {
      console.error('Firestore write rejected after local persistence', error);
    },
  }: { fallbackMs?: number; onLateRejection?: (error: Error) => void } = {},
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
            if (snapshot.metadata.hasPendingWrites || !snapshot.exists()) finish(resolve);
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

    writePromise.then(
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

    fallbackTimer = setTimeout(() => {
      startFallbackListener();
    }, fallbackMs);
  });
}

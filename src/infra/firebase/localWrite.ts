import { onSnapshot } from 'firebase/firestore';
import type { DocumentReference } from 'firebase/firestore';

export const LOCAL_WRITE_FALLBACK_MS = 1_000;

const rejection = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/**
 * Plain Firestore writes are visible in the local cache before the server
 * acknowledges them, but their returned promises wait for that acknowledgement.
 * Offline, that leaves a UI spinner running for a write the device already has.
 *
 * The grace period keeps the normal online path on the server acknowledgement,
 * so serverTimestamp fields are still resolved before the repository reports
 * success. Only a write that is both locally accepted and still unacknowledged
 * after the grace period is treated as saved locally.
 */
export function waitForLocalWrite(
  ref: DocumentReference,
  write: () => Promise<unknown>,
  fallbackMs = LOCAL_WRITE_FALLBACK_MS,
): Promise<void> {
  let unsubscribe: (() => void) | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let locallyAccepted = false;
  let fallbackElapsed = false;
  let writeStarted = false;
  let settled = false;

  return new Promise((resolve, reject) => {
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribe?.();
      complete();
    };

    const resolveIfFallbackApplies = () => {
      if (locallyAccepted && fallbackElapsed) finish(resolve);
    };

    try {
      unsubscribe = onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!writeStarted || !snapshot.metadata.hasPendingWrites) return;
          locallyAccepted = true;
          resolveIfFallbackApplies();
        },
        (cause) => finish(() => reject(rejection(cause))),
      );
    } catch {
      unsubscribe = undefined;
    }

    let writePromise: Promise<unknown>;
    try {
      writePromise = write();
      writeStarted = true;
    } catch (cause) {
      finish(() => reject(rejection(cause)));
      return;
    }

    writePromise.then(
      () => finish(resolve),
      (cause) => {
        const error = rejection(cause);
        if (settled) {
          console.error('Firestore write rejected after local persistence', error);
          return;
        }
        finish(() => reject(error));
      },
    );

    fallbackTimer = setTimeout(() => {
      fallbackElapsed = true;
      resolveIfFallbackApplies();
    }, fallbackMs);
  });
}

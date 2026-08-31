import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalWriteTracker, waitForLocalWrite } from '@/infra/firebase/localWrite';

type Snapshot = { exists: () => boolean; metadata: { hasPendingWrites: boolean } };

const firestore = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  onSnapshot: firestore.onSnapshot,
}));

const ref = {} as never;
const never = new Promise<never>(() => {});
const shortFallbackMs = 10;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Whether `promise` has settled by the time `graceMs` has elapsed.
 *
 * The grace period is a real timer rather than `Promise.resolve()`, which is
 * what this was. A microtask cannot lose to another microtask: `promise.then()`
 * resolves one tick behind an already-resolved promise however long `promise`
 * settled ago, so the race always answered "pending" and every assertion
 * written against it held whatever the code did.
 */
async function state<T>(
  promise: Promise<T>,
  graceMs = 0,
): Promise<{ status: 'pending' } | { status: 'value'; value: T }> {
  return Promise.race([
    promise.then((value) => ({ status: 'value' as const, value })),
    sleep(graceMs).then(() => ({ status: 'pending' as const })),
  ]);
}

describe('waitForLocalWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.onSnapshot.mockImplementation(
      (_ref: unknown, _options: unknown, onNext: (snapshot: Snapshot) => void) => {
        setTimeout(() => onNext({ exists: () => true, metadata: { hasPendingWrites: true } }), 0);
        return vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The local view of a document that is not in the cache: deleted, or never there. */
  const missingDocument = () =>
    firestore.onSnapshot.mockImplementation(
      (_ref: unknown, _options: unknown, onNext: (snapshot: Snapshot) => void) => {
        setTimeout(() => onNext({ exists: () => false, metadata: { hasPendingWrites: false } }), 0);
        return vi.fn();
      },
    );

  it('waitForLocalWrite keeps fast writes on the server result without opening a listener', async () => {
    await expect(
      waitForLocalWrite(ref, () => Promise.resolve(), { fallbackMs: shortFallbackMs }),
    ).resolves.toBeUndefined();

    expect(firestore.onSnapshot).not.toHaveBeenCalled();
  });

  it('waitForLocalWrite opens the metadata listener only after the grace period', async () => {
    // A wider grace than the rest of the file uses, and the margins are the
    // point: `state` costs a timer tick now that it is capable of answering
    // "settled", so a check one millisecond inside a ten millisecond window
    // lands outside it and reads the listener this asserts is not open yet.
    const graceMs = 50;
    const saved = waitForLocalWrite(ref, () => never, { fallbackMs: graceMs });

    await sleep(20);
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    await expect(state(saved)).resolves.toEqual({ status: 'pending' });

    await sleep(40);
    expect(firestore.onSnapshot).toHaveBeenCalled();
    await expect(saved).resolves.toBeUndefined();
  });

  it('waitForLocalWrite resolves delayed local deletes from the cached missing document', async () => {
    missingDocument();
    const saved = waitForLocalWrite(ref, () => never, {
      fallbackMs: shortFallbackMs,
      missingIsSaved: true,
    });

    await sleep(shortFallbackMs + 1);

    await expect(saved).resolves.toBeUndefined();
  });

  it('waitForLocalWrite keeps an update against a missing document unresolved, rather than closing the edit screen over a write the server will refuse', async () => {
    // The same cached snapshot as the delete above, and the reason the two are
    // told apart by the caller rather than by the snapshot: an offline
    // `updateDoc` against an id deleted elsewhere is never applied to the local
    // view, so it reads back exactly like a completed local delete — missing,
    // with nothing pending against it. Resolving here reports a save the
    // backend is going to reject, and `EntryFormModal` closes on it.
    missingDocument();
    const saved = waitForLocalWrite(ref, () => never, { fallbackMs: shortFallbackMs });

    await expect(state(saved, shortFallbackMs + 5)).resolves.toEqual({ status: 'pending' });
  });

  it('waitForLocalWrite rejects when the fallback listener cannot be installed', async () => {
    const error = new Error('listener setup failed');
    firestore.onSnapshot.mockImplementation(() => {
      throw error;
    });
    const saved = waitForLocalWrite(ref, () => never, { fallbackMs: shortFallbackMs });
    const rejected = expect(saved).rejects.toBe(error);

    await sleep(shortFallbackMs + 1);

    await rejected;
  });

  it('LocalWriteTracker rejects settlement after a locally persisted write later fails', async () => {
    const error = new Error('rules rejected the write');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tracker = new LocalWriteTracker(shortFallbackMs);
    const saved = tracker.write(
      ref,
      () => new Promise((_resolve, reject) => setTimeout(() => reject(error), shortFallbackMs + 5)),
    );

    await sleep(shortFallbackMs + 1);
    await expect(saved).resolves.toBeUndefined();

    await sleep(5);
    await expect(tracker.settle(() => Promise.resolve())).rejects.toBe(error);
    expect(consoleError).toHaveBeenCalledWith(
      'Firestore write rejected after local persistence',
      error,
    );
  });

  it('LocalWriteTracker holds settlement for a rejection the backend barrier does not order ahead of it', async () => {
    // `waitForPendingWrites` resolves once the backend has *acknowledged* every
    // queued write, and a write it refused is acknowledged too — the refusal
    // then arrives on the write's own promise, on a callback the barrier orders
    // nothing against. `settle` therefore cannot read its failures the moment
    // the barrier clears, which is what a bare microtask hop amounted to.
    //
    // This matters because of the one caller: `deleteEverything` removes the
    // user profile and the Auth account as soon as this resolves, and the
    // credential it removes is the one needed to retry a refused delete. A
    // settlement that returns early reports every row gone while one is not.
    const error = new Error('rules rejected the write');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tracker = new LocalWriteTracker(shortFallbackMs);
    let refuse!: (cause: Error) => void;
    const saved = tracker.write(
      ref,
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );

    await sleep(shortFallbackMs + 1);
    await expect(saved).resolves.toBeUndefined();

    // The ordering the barrier does not establish, at its narrowest: the
    // acknowledgement lands, and the refusal is delivered one tick behind it.
    // Nothing between those two statements may await, or the hazard is gone.
    let acknowledge!: () => void;
    const acknowledged = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const settling = tracker.settle(() => acknowledged);
    acknowledge();
    queueMicrotask(() => refuse(error));

    await expect(settling).rejects.toBe(error);
  });
});

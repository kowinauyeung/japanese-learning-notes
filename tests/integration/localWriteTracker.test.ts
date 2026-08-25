import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalWriteTracker, waitForLocalWrite } from '@/infra/firebase/localWrite';

type Snapshot = { metadata: { hasPendingWrites: boolean } };

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

async function state<T>(
  promise: Promise<T>,
): Promise<{ status: 'pending' } | { status: 'value'; value: T }> {
  return Promise.race([
    promise.then((value) => ({ status: 'value' as const, value })),
    Promise.resolve({ status: 'pending' as const }),
  ]);
}

describe('waitForLocalWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.onSnapshot.mockImplementation(
      (_ref: unknown, _options: unknown, onNext: (snapshot: Snapshot) => void) => {
        setTimeout(() => onNext({ metadata: { hasPendingWrites: true } }), 0);
        return vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waitForLocalWrite keeps fast writes on the server result without opening a listener', async () => {
    await expect(
      waitForLocalWrite(ref, () => Promise.resolve(), { fallbackMs: shortFallbackMs }),
    ).resolves.toBeUndefined();

    expect(firestore.onSnapshot).not.toHaveBeenCalled();
  });

  it('waitForLocalWrite opens the metadata listener only after the grace period', async () => {
    const saved = waitForLocalWrite(ref, () => never, { fallbackMs: shortFallbackMs });

    await sleep(shortFallbackMs - 1);
    await expect(state(saved)).resolves.toEqual({ status: 'pending' });
    expect(firestore.onSnapshot).not.toHaveBeenCalled();

    await sleep(2);
    expect(firestore.onSnapshot).toHaveBeenCalled();
    await expect(saved).resolves.toBeUndefined();
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
});

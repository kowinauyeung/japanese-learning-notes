import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_WRITE_FALLBACK_MS, waitForLocalWrite } from '@/infra/firebase/localWrite';

type Snapshot = { metadata: { hasPendingWrites: boolean } };

const firestore = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  onSnapshot: firestore.onSnapshot,
}));

const ref = {} as never;
const never = new Promise<never>(() => {});

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
    vi.useFakeTimers();
    vi.clearAllMocks();
    firestore.onSnapshot.mockImplementation(
      (_ref: unknown, _options: unknown, onNext: (snapshot: Snapshot) => void) => {
        setTimeout(() => onNext({ metadata: { hasPendingWrites: true } }), 0);
        return vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits out the grace period before resolving from local persistence', async () => {
    const saved = waitForLocalWrite(ref, () => never);

    await vi.advanceTimersByTimeAsync(0);
    // Resolving here would close the form before an ordinary online write has
    // returned serverTimestamp fields, so the local fallback must wait out the
    // grace period before it changes user-visible save state.
    await expect(state(saved)).resolves.toEqual({ status: 'pending' });

    await vi.advanceTimersByTimeAsync(LOCAL_WRITE_FALLBACK_MS);
    await expect(saved).resolves.toBeUndefined();
  });

  it('keeps fast writes on the server result', async () => {
    await expect(waitForLocalWrite(ref, () => Promise.resolve())).resolves.toBeUndefined();
  });

  it('rejects write failures before local persistence is reported', async () => {
    const error = new Error('rules rejected the write');

    await expect(waitForLocalWrite(ref, () => Promise.reject(error))).rejects.toBe(error);
  });

  it('reports a server rejection that arrives after local persistence already resolved', async () => {
    const error = new Error('rules rejected the write');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const saved = waitForLocalWrite(
      ref,
      () =>
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(error), LOCAL_WRITE_FALLBACK_MS + 1),
        ),
    );

    await vi.advanceTimersByTimeAsync(LOCAL_WRITE_FALLBACK_MS);
    await expect(saved).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(consoleError).toHaveBeenCalledWith(
      'Firestore write rejected after local persistence',
      error,
    );
  });
});

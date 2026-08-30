import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMED_OUT, within } from '@/infra/ai/deadline';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('within', () => {
  it('gives up on work that never settles, which is what leaves 作成中 on screen forever', async () => {
    // The shape both unbounded awaits on the drafting path reach: a promise
    // with no rejection path. `@firebase/app-check` gets there on an ordinary
    // browser — `loadReCAPTCHAV3Script` sets `onload` and no `onerror`, so a
    // blocked script never settles, and the App Check token the AI SDK awaits
    // before it builds its fetch never arrives.
    const settled = within(new Promise<string>(() => {}), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(settled).resolves.toBe(TIMED_OUT);
  });

  it('returns the value when the work wins', async () => {
    // Asserted without advancing first: the work is already settled, and an
    // intervening await would let it settle with no handler attached.
    await expect(within(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('lets a rejection through rather than reporting it as a deadline', async () => {
    // The four reasons the port classifies all arrive as rejections. Swallowing
    // one into TIMED_OUT would report a permanent refusal as something to retry.
    // The assertion attaches in the same tick the rejection is created in. An
    // await in between — which this had — leaves the already-rejected promise
    // unobserved for a turn, and Node reports it as unhandled: a test that
    // passes while printing the failure it exists to prevent.
    await expect(within(Promise.reject(new Error('refused')), 1000)).rejects.toThrow('refused');
  });

  it('clears the timer the work beat, which would otherwise hold a handle for its full duration', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    await within(Promise.resolve('ok'), 60_000);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });

  it('does not leave an unhandled rejection when the work loses and then fails', async () => {
    // `Promise.race` attaches to `work` whether or not it wins, so a rejection
    // arriving after the deadline is already handled. Asserted because the
    // obvious alternative — racing a promise nothing else observes — makes this
    // an unhandled rejection that crashes a Node process rather than a browser
    // tab, and would surface first in CI.
    // Real timers: an unhandled rejection is reported on a macrotask tick that
    // the fake ones never deliver, so the fake-timer version of this passed by
    // timing out rather than by observing anything.
    vi.useRealTimers();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    let fail!: (cause: Error) => void;
    const settled = within(
      new Promise<string>((_, reject) => {
        fail = reject;
      }),
      5,
    );
    await expect(settled).resolves.toBe(TIMED_OUT);

    fail(new Error('late'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });
});

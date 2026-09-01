import { act, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRetryOnReconnect } from '@/lib/retryOnReconnect';

function RetryHarness({
  failed,
  loadSucceeded,
  retryResult,
}: {
  failed: boolean;
  loadSucceeded: boolean;
  retryResult?: Promise<void>;
}) {
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => {
    setRetryCount((count) => count + 1);
    return retryResult;
  }, [retryResult]);

  useRetryOnReconnect(failed, loadSucceeded, retry);
  return <output data-testid="retry-count">{retryCount}</output>;
}

const deferred = () => {
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
};

const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
};

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('useRetryOnReconnect', () => {
  it('retries when an offline read fails after the browser has reconnected', () => {
    setOnline(false);
    const view = render(<RetryHarness failed={false} loadSucceeded={false} />);

    setOnline(true);
    view.rerender(<RetryHarness failed loadSucceeded={false} />);

    expect(screen.getByTestId('retry-count')).toHaveTextContent('1');
  });

  it('does not retry an online failure after the reconnected read succeeded', () => {
    setOnline(false);
    const view = render(<RetryHarness failed={false} loadSucceeded={false} />);

    setOnline(true);
    view.rerender(<RetryHarness failed={false} loadSucceeded />);
    view.rerender(<RetryHarness failed loadSucceeded={false} />);

    expect(screen.getByTestId('retry-count')).toHaveTextContent('0');
  });

  it('uses a later reconnect when the in-flight retry fails', async () => {
    setOnline(false);
    const firstRetry = deferred();
    render(<RetryHarness failed loadSucceeded={false} retryResult={firstRetry.promise} />);

    setOnline(true);
    expect(screen.getByTestId('retry-count')).toHaveTextContent('1');

    setOnline(false);
    setOnline(true);
    act(() => firstRetry.reject(new Error('unavailable')));

    await waitFor(() => {
      expect(screen.getByTestId('retry-count')).toHaveTextContent('2');
    });
  });
});

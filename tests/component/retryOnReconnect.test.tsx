import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRetryOnReconnect } from '@/lib/retryOnReconnect';

function RetryHarness({ failed, retry }: { failed: boolean; retry: () => void }) {
  useRetryOnReconnect(failed, retry);
  return null;
}

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
    const retry = vi.fn();
    const view = render(<RetryHarness failed={false} retry={retry} />);

    setOnline(true);
    view.rerender(<RetryHarness failed retry={retry} />);

    expect(retry).toHaveBeenCalledOnce();
  });
});

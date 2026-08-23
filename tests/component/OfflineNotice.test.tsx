import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineNotice } from '@/components/OfflineNotice';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

/**
 * `navigator.onLine` is a browser-owned getter, so the browser is what has to
 * be told — not our code. Redefining the property and firing the real `online`
 * and `offline` events drives the component exactly the way a dropped
 * connection does, without substituting anything of ours.
 */
const setOnline = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
};

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('OfflineNotice', () => {
  it('stays out of the way while there is a network, since nothing is wrong then', () => {
    setOnline(true);
    render(<OfflineNotice />);

    // Absence is the assertion. A permanent "offline" pill on a working
    // connection is worse than none: the reader learns to ignore it, and it is
    // then ignored on the one day it is true.
    expect(screen.queryByText('オフライン')).not.toBeInTheDocument();
  });

  it('names the state when the connection drops, rather than waiting for a read to fail', () => {
    setOnline(true);
    render(<OfflineNotice />);

    setOnline(false);

    // The whole point of #63: offline is a state the app is in, and the reader
    // should learn it from the interface rather than from a sentence about a
    // word they happened to open.
    expect(screen.getByText('オフライン')).toBeInTheDocument();
  });

  it('says the saved words still work, because the reader cannot otherwise tell', () => {
    setOnline(false);
    render(<OfflineNotice />);

    // Without this the pill reads as "the app is broken". With
    // persistentLocalCache most of the notebook is still readable, and that is
    // the difference between a reader closing the app and carrying on.
    expect(screen.getByText(/保存済みの単語は読めます/)).toBeInTheDocument();
  });

  it('clears itself when the network returns, without needing a reload', () => {
    setOnline(false);
    render(<OfflineNotice />);
    expect(screen.getByText('オフライン')).toBeInTheDocument();

    setOnline(true);

    // A notice that outlived the condition would be the same defect as never
    // showing one, in the other direction.
    expect(screen.queryByText('オフライン')).not.toBeInTheDocument();
  });

  it('announces politely rather than interrupting, since it can arrive mid-sentence', () => {
    setOnline(false);
    render(<OfflineNotice />);

    // Queried by role, and that is the assertion: `status` is a polite live
    // region. Reached for as `alert` instead, a connection flickering on a
    // train would cut into a dictation answer being typed, repeatedly.
    expect(screen.getByRole('status')).toHaveTextContent('オフライン');
  });
});

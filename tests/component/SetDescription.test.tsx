import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SetDescription } from '@/components/wordsets/SetDescription';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

/**
 * jsdom lays nothing out: every element reports a height of zero, so the
 * overflow measurement this component is built around always answers "no". Both
 * substitutions below stand in for the browser rather than for anything in
 * `src`. `ResizeObserver` does not exist in jsdom at all, and the geometry is
 * defined so that a long text overflows its clamp and a short one does not,
 * which is the only distinction the component reads.
 */
const LONG = 'あ'.repeat(400);
const SHORT = '短い';

let originals: [PropertyDescriptor | undefined, PropertyDescriptor | undefined];

beforeEach(() => {
  originals = [
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
  ];
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    // Clamped to ten lines, so only the long description has more to show.
    get(this: HTMLElement) {
      return (this.textContent?.length ?? 0) > 100 ? 400 : 100;
    },
  });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  const [scroll, client] = originals;
  if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scroll);
  if (client) Object.defineProperty(HTMLElement.prototype, 'clientHeight', client);
});

describe('SetDescription', () => {
  it('offers to open a description that is clipped, and not one that fits', () => {
    const { unmount } = render(<SetDescription description={LONG} />);
    expect(screen.getByRole('button', { name: 'もっと見る' })).toBeInTheDocument();
    unmount();

    render(<SetDescription description={SHORT} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /**
   * Editing a word set happens on the page that renders this, so a new
   * description arrives at a component that is already mounted and may already
   * be open. Without the reset, `expanded` survives the edit — and the
   * measurement declines to run while it is set, because an expanded element
   * has grown to fit and would measure as needing no control at all. What is
   * left on screen is 折りたたむ under a two-word description, which collapses
   * nothing.
   */
  it('closes and re-measures when the description is edited to something shorter', () => {
    const { rerender } = render(<SetDescription description={LONG} />);

    fireEvent.click(screen.getByRole('button', { name: 'もっと見る' }));
    expect(screen.getByRole('button', { name: '折りたたむ' })).toBeInTheDocument();

    rerender(<SetDescription description={SHORT} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(SHORT)).toBeInTheDocument();
  });
});

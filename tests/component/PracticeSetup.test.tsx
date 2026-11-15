import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PracticeSetup } from '@/components/practice/PracticeSetup';
import { PRACTICE_MODES } from '@/domain/practice';
import { EMPTY_PRACTICE_FILTERS } from '@/lib/practice';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

const [FLASHCARD_MODE] = PRACTICE_MODES;

describe('PracticeSetup — mode switch semantics', () => {
  it('does not announce route-changing practice modes as tabs without panels', () => {
    render(
      <PracticeSetup
        mode={FLASHCARD_MODE}
        filters={EMPTY_PRACTICE_FILTERS}
        recentTags={[]}
        allSets={[]}
        now={new Date('2026-06-24T00:00:00.000Z')}
        matchCount={0}
        weakCount={0}
        weakState="ready"
        onChange={vi.fn()}
        onModeChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Tabs promise several panels with one visible. These buttons navigate to
    // separate routes, so that announcement would describe a UI that is not there.
    expect(screen.getByRole('group', { name: '練習' })).toBeInTheDocument();
    // The selected drill must be announced as pressed, or a screen reader user
    // cannot tell which exercise the setup below will start.
    expect(screen.getByRole('button', { name: 'フラッシュカード' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The other drill must not also be pressed, or both choices sound active
    // even though selecting one route replaces the other.
    expect(screen.getByRole('button', { name: '書き取り練習' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // A tablist would promise a set of panels to navigate between, but changing
    // mode instead leaves this route and loads another one.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    // Individual tabs would make the same false promise for each drill button.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

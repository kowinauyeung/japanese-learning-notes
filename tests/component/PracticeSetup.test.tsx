import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PracticeSetup } from '@/components/practice/PracticeSetup';
import { EMPTY_PRACTICE_FILTERS } from '@/lib/practice';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

describe('PracticeSetup — mode switch semantics', () => {
  it('does not announce route-changing practice modes as tabs without panels', () => {
    render(
      <PracticeSetup
        mode="flashcard"
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
    expect(screen.getByRole('button', { name: 'フラッシュカード' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '書き取り練習' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterPanel } from '@/components/browse/FilterPanel';
import { EMPTY_FILTERS } from '@/lib/filters';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

/**
 * `FilterPanel` is shared by two callers that pass very different lists under
 * the same `tags` prop: Browse passes a recency-limited sample (`recentTags`
 * in `src/lib/tags.ts`), and the word-set member picker (`PickerToolbar`)
 * passes every tag in the notebook. Neither claim belongs to the component —
 * it renders whatever `tagsLabel` the caller supplies, or nothing, rather
 * than asserting either one on the caller's behalf.
 */
describe('FilterPanel — the tags label', () => {
  it('shows the caller-supplied label above the tag chips', () => {
    render(
      <FilterPanel
        filters={EMPTY_FILTERS}
        tags={['動詞']}
        tagsLabel="最近のタグ"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('最近のタグ')).toBeInTheDocument();
  });

  /**
   * `PickerToolbar` passes every tag in the notebook and omits `tagsLabel` for
   * exactly this reason: labelling a complete list "recent" would be wrong.
   */
  it('renders the chips unlabeled when the caller has no claim to make about the list', () => {
    render(<FilterPanel filters={EMPTY_FILTERS} tags={['動詞']} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: '#動詞' })).toBeInTheDocument();
    expect(screen.queryByText('最近のタグ')).not.toBeInTheDocument();
  });
});

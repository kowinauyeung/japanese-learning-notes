import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Distribution } from '@/components/dashboard/Distribution';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

/**
 * jsdom applies no CSS, so the `sm:flex` half of the responsive class the
 * component relies on cannot be exercised here — that half is a layout fact
 * and belongs to a real browser. What is checkable without one is the
 * structural rule: rows past the fifth carry `hidden` until expanded, and the
 * button that clears it exists only when there is anything for it to reveal.
 */
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: `label-${i}`, count: i + 1 }));

describe('Distribution — the mobile row cap', () => {
  it('renders no control under six rows, since nothing is hidden', () => {
    render(<Distribution title="JLPT" rows={rows(5)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('marks rows past the fifth hidden, and reveals them on "もっと見る"', () => {
    render(<Distribution title="JLPT" rows={rows(7)} />);

    const sixthRow = screen.getByText('label-5').closest('li')!;
    expect(sixthRow.className).toContain('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'もっと見る' }));

    expect(sixthRow.className).not.toContain('hidden');
    expect(screen.getByRole('button', { name: '折りたたむ' })).toBeInTheDocument();
  });
});

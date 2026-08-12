import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PitchAccent } from '@/components/PitchAccent';

/**
 * The pitch line is drawn with borders on the mora spans, so the assertions
 * below are about class names. That reads like an implementation detail and is
 * not one: the border *is* the notation. A top border on the wrong span puts
 * the high register over the wrong syllable, and a missing right border turns
 * 尾高 into 平板 — two different words, rendered identically.
 */
const mora = (container: HTMLElement) =>
  [...container.querySelectorAll('span > span')].filter((node) => node.children.length === 0);

describe('PitchAccent', () => {
  it('puts the fall after the named mora, not after the named character', () => {
    // びょういん is four mora; a drop after mora 1 belongs on びょ, which is two
    // characters. Splitting by character would mark び and leave ょ behind it.
    const { container } = render(<PitchAccent kana="びょういん" pitchAccent={1} />);
    const spans = mora(container).filter((node) => node.textContent !== '1（頭高）');

    expect(spans.map((node) => node.textContent)).toEqual(['びょ', 'う', 'い', 'ん']);
    expect(spans[0]?.className).toContain('border-r-current');
    expect(spans[1]?.className).not.toContain('border-r-current');
  });

  /**
   * 尾高 and 平板 have the same registers across the word; only the mark at the
   * end tells them apart, because the fall lands on the following particle.
   * Without it the detail page shows おとこ and さくら as the same accent.
   */
  it('distinguishes 尾高 from 平板 by the mark on the last mora', () => {
    const owari = render(<PitchAccent kana="おとこ" pitchAccent={3} />);
    const heiban = render(<PitchAccent kana="さくら" pitchAccent={0} />);

    expect(owari.container.innerHTML).toContain('border-r-current');
    expect(heiban.container.innerHTML).not.toContain('border-r-current');
  });

  it('renders nothing when the accent does not fit the reading', () => {
    const { container } = render(<PitchAccent kana="たまご" pitchAccent={9} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('prints the number with its class, so the value is readable as text', () => {
    const { container } = render(<PitchAccent kana="たまご" pitchAccent={2} />);

    expect(container.textContent).toContain('2（中高）');
  });
});

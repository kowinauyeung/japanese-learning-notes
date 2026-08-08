import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Ruby } from '@/components/Ruby';

/**
 * The defect this exists for: putting the caller's classes on `<ruby>` itself
 * overrides its display, which drops the element out of the ruby formatting
 * context. The browser then lays `<rt>` out as ordinary inline text *beside*
 * the word instead of above it. It shipped once, and TypeScript cannot see it.
 *
 * Note what this file can and cannot do. The markup is byte-for-byte identical
 * whether the class lands on the wrapper or on `<ruby>` minus that one
 * attribute, so a serialised DOM snapshot would not have caught it either. What
 * is checkable here is the structural rule — classes on the wrapper, never on
 * `<ruby>`. Whether the annotation actually renders above the word is a layout
 * fact, and belongs to the Playwright screenshot in tests/e2e/visual.spec.ts.
 */

const rubies = (container: HTMLElement) => [...container.querySelectorAll('ruby')];

describe('Ruby — structure', () => {
  it('gives each kanji run its own ruby element with its own annotation', () => {
    const { container } = render(<Ruby headword="切り分け" reading="きりわけ" />);

    expect(rubies(container).map((el) => el.textContent)).toEqual(['切き', '分わ']);
    expect([...container.querySelectorAll('rt')].map((el) => el.textContent)).toEqual(['き', 'わ']);
  });

  it('renders okurigana as plain text, outside any ruby element', () => {
    const { container } = render(<Ruby headword="切り分け" reading="きりわけ" />);

    // り and け must not be inside a <ruby>: an empty <rt> above them would
    // still reserve the line box and push the whole word down.
    for (const ruby of rubies(container)) {
      expect(ruby.textContent).not.toContain('り');
      expect(ruby.textContent).not.toContain('け');
    }
    expect(container.textContent).toBe('切きり分わけ');
  });

  it('renders no ruby at all when there is nothing to annotate', () => {
    const { container } = render(<Ruby headword="ちょっと" reading="ちょっと" />);
    expect(rubies(container)).toHaveLength(0);
    expect(container.textContent).toBe('ちょっと');
  });

  it('keeps a run of adjacent kanji under a single annotation', () => {
    const { container } = render(<Ruby headword="兆候" reading="ちょうこう" />);
    expect(rubies(container)).toHaveLength(1);
    expect(container.querySelector('rt')?.textContent).toBe('ちょうこう');
  });
});

describe('Ruby — where the classes go', () => {
  /**
   * The regression test. Asserting the absence of a class on `<ruby>` reads as
   * a strange thing to check until you know that a display override there is
   * what breaks the annotation's placement.
   */
  it('never puts a class on the ruby element itself', () => {
    const { container } = render(
      <Ruby headword="切り分け" reading="きりわけ" className="has-ruby block text-4xl font-bold" />,
    );

    for (const ruby of rubies(container)) {
      expect(ruby.getAttribute('class')).toBeNull();
    }
  });

  it('puts the caller classes on a wrapper around the whole word', () => {
    const { container } = render(
      <Ruby headword="切り分け" reading="きりわけ" className="has-ruby block text-4xl" />,
    );

    const wrapper = container.firstElementChild;
    expect(wrapper?.tagName).toBe('SPAN');
    expect(wrapper).toHaveClass('has-ruby', 'block', 'text-4xl');
    // And the annotated word is inside it, not a sibling.
    expect(wrapper?.querySelectorAll('ruby')).toHaveLength(2);
  });

  it('renders without a wrapper class when none is given', () => {
    const { container } = render(<Ruby headword="兆候" reading="ちょうこう" />);
    expect(container.firstElementChild?.getAttribute('class')).toBeNull();
  });
});

describe('Ruby — the reading is readable', () => {
  it('exposes the headword and its reading as text, in order', () => {
    render(<Ruby headword="食べ物" reading="たべもの" />);
    // Screen readers and the search box both see this flattened text; the
    // interleaving is what tells 食(た) apart from 食(もの).
    expect(screen.getByText('た')).toBeInTheDocument();
    expect(screen.getByText('もの')).toBeInTheDocument();
  });
});

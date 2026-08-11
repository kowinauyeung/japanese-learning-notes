import { describe, expect, it } from 'vitest';
import { beyondSlop, dropIndexFor, edgeScrollFor } from '@/lib/listDrag';

/**
 * Where a pointer sitting over a row means the word should land.
 *
 * The whole gesture is judged by this one number, and it is the only part of it
 * a test can hold still: everything above it is a browser delivering pointer
 * events over a layout that changes as rows move.
 */
describe('dropIndexFor', () => {
  // Row 2 of a list, 40px tall, starting 100px down the viewport.
  const row = { index: 2, top: 100, height: 40 };
  const at = (clientY: number) => dropIndexFor(row.index, row.top, row.height, clientY);

  it('drops before the row while the pointer is in its top half', () => {
    expect(at(101)).toBe(2);
    expect(at(119)).toBe(2);
  });

  it('drops after the row once the pointer passes the middle', () => {
    expect(at(121)).toBe(3);
    expect(at(139)).toBe(3);
  });

  /**
   * The midpoint and not the edge. Judging by edges leaves the centre of every
   * row meaning nothing, so a careful drop aimed at a word — which is where a
   * hand naturally aims — would be the one place the gesture does nothing.
   */
  it('has no dead zone: the midpoint itself already means after', () => {
    expect(at(120)).toBe(3);
  });
});

/**
 * The threshold that separates a click on a row from a drag of it.
 *
 * A whole row is draggable, and a row also holds a link to the word and a
 * button that removes it. Without this every press on either would begin a
 * drag, and the click that follows would be swallowed as the drag's own — so
 * opening a word from the set would stop working entirely.
 */
describe('beyondSlop', () => {
  const from = { x: 100, y: 100 };

  it.each([
    ['exactly at the threshold', { x: 105, y: 100 }],
    ['a hand that shook', { x: 102, y: 97 }],
    ['not at all', { x: 100, y: 100 }],
  ])('is still a click: %s', (_case, to) => {
    expect(beyondSlop(from, to, 5)).toBe(false);
  });

  it.each([
    ['sideways', { x: 106, y: 100 }],
    ['upward', { x: 100, y: 93 }],
  ])('has become a drag: %s', (_case, to) => {
    expect(beyondSlop(from, to, 5)).toBe(true);
  });
});

/**
 * Scrolling a bounded panel while a drag is held near its edge.
 *
 * Both lists scroll inside themselves so they can sit side by side, which means
 * the row a word is being dragged to is often not rendered when the drag
 * starts. Without this, those rows are unreachable.
 */
describe('edgeScrollFor', () => {
  // A panel occupying 200…600, with a 50px band at each end.
  const at = (clientY: number) => edgeScrollFor(200, 600, clientY, 50, 10);

  it('does not scroll while the pointer is in the middle', () => {
    expect(at(400)).toBe(0);
    expect(at(251)).toBe(0);
    expect(at(549)).toBe(0);
  });

  it('scrolls up near the top and down near the bottom', () => {
    expect(at(210)).toBeLessThan(0);
    expect(at(590)).toBeGreaterThan(0);
  });

  /**
   * Proportional, so the list creeps at the edge of the band and runs at the
   * edge of the panel. A single speed makes the only usable gesture a
   * fully-committed one, and overshoots every short move.
   */
  it('speeds up the closer the pointer gets to the edge', () => {
    // Both bands, because they are two branches: 205 is nearer the top than
    // 245 and so must scroll harder, which for an upward scroll means lower.
    expect(at(205)).toBeLessThan(at(245));
    expect(at(560)).toBeLessThan(at(595));
    expect(at(600)).toBe(10);
    expect(at(200)).toBe(-10);
  });

  /** Past the edge entirely — a pointer dragged off the panel — stays capped. */
  it('does not accelerate without limit past the edge', () => {
    expect(at(900)).toBe(10);
    expect(at(-100)).toBe(-10);
  });
});

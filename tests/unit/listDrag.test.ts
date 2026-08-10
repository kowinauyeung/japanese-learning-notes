import { describe, expect, it } from 'vitest';
import { dropIndexFor } from '@/lib/listDrag';

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

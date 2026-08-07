import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '@/infra/firebase/cursor';

/**
 * The defect these cover: the cursor used to be built from the mapped domain
 * entry, whose `createdAt` is an ISO string. Firestore orders every string above
 * every timestamp, so `startAfter(<string>)` on a descending query starts above
 * the whole collection and returns page one again — and `EntriesProvider` pages
 * until the cursor is null, so it never terminated. Asserting the decoded type
 * is therefore the regression test, not an incidental detail.
 */
describe('pagination cursor', () => {
  it('decodes to a Timestamp, not a string', () => {
    const decoded = decodeCursor(encodeCursor(new Timestamp(1_754_000_000, 123_456_789), 'abc'));
    expect(decoded?.[0]).toBeInstanceOf(Timestamp);
  });

  it('round-trips seconds, nanoseconds and the document id exactly', () => {
    const original = new Timestamp(1_754_000_000, 123_456_789);
    const decoded = decodeCursor(encodeCursor(original, 'AbC123'));

    expect(decoded?.[0].seconds).toBe(original.seconds);
    expect(decoded?.[0].nanoseconds).toBe(original.nanoseconds);
    expect(decoded?.[1]).toBe('AbC123');
  });

  it('keeps nanosecond precision, which is what separates a batched import', () => {
    // The 67 migrated entries are written in one batch and agree to the
    // microsecond; losing the tail would drop or repeat rows at a page edge.
    const a = encodeCursor(new Timestamp(1_754_000_000, 123_456_000), 'x');
    const b = encodeCursor(new Timestamp(1_754_000_000, 123_456_001), 'x');
    expect(a).not.toBe(b);
  });

  it('survives a zero nanosecond component', () => {
    const decoded = decodeCursor(encodeCursor(new Timestamp(1_754_000_000, 0), 'x'));
    expect(decoded?.[0].nanoseconds).toBe(0);
  });

  it.each(['', 'nonsense', 'noseparator', '123.456|', '|abc', 'x.y|abc', '1.2.3|abc'])(
    'returns null for the malformed cursor %o',
    (cursor) => {
      expect(decodeCursor(cursor)).toBeNull();
    },
  );
});

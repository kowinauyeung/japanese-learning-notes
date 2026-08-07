import { Timestamp } from 'firebase/firestore';
import type { IsoDateTime } from '@/domain/common';

/**
 * The only module that knows both `Timestamp` and `IsoDateTime`.
 *
 * Everything above this line works in ISO strings, so swapping the datasource
 * means writing another mapper rather than touching the domain. Conversion runs
 * *before* `sanitizeEntry`, which keeps that function — and all of `src/lib` —
 * free of any vendor type.
 */

/**
 * Firestore hands back a `Timestamp`, but a document written by an older
 * client, a migration script or a hand edit in the console can hold a string,
 * a `Date`, or nothing at all. Total by the same rule as `lib/sanitize.ts`:
 * anything unusable becomes the empty string, and the caller's fallback
 * decides what to do about it.
 */
export function toIso(value: unknown): IsoDateTime {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }
  return '';
}

/**
 * Shallow-converts the timestamp fields of a raw document.
 *
 * Only the known bookkeeping fields are touched; everything else passes through
 * untouched for `sanitizeEntry` to coerce. Walking the whole object looking for
 * Timestamps would also rewrite user content that merely looked like one.
 */
export function withIsoTimestamps(
  data: Record<string, unknown>,
  fields: readonly string[] = ['createdAt', 'updatedAt'],
): Record<string, unknown> {
  const out = { ...data };
  for (const field of fields) {
    if (field in out) out[field] = toIso(out[field]);
  }
  return out;
}

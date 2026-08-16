import { Timestamp } from 'firebase/firestore';

/**
 * Opaque pagination cursors for a `createdAt desc, __name__ desc` listing.
 *
 * Encoded from the raw `Timestamp`, never from the mapped domain value. The
 * domain carries `createdAt` as an ISO string, and Firestore's type ordering
 * puts every string above every timestamp: a string handed to `startAfter()` in
 * a descending query lands above the whole collection, so page two comes back
 * identical to page one and a caller that pages until the cursor is null never
 * terminates. Round-tripping seconds and nanoseconds keeps both the type and
 * the precision.
 *
 * The document id is part of the cursor because the migrated entries are
 * written in one batch and share a `createdAt` to the microsecond — ordering on
 * the timestamp alone would drop or repeat rows at a page boundary.
 *
 * Kept in its own module so it can be tested without initialising the Firebase
 * app, which reads env config at import time.
 */

const SEPARATOR = '|';

export function encodeCursor(createdAt: Timestamp, id: string): string {
  return `${createdAt.seconds}.${createdAt.nanoseconds}${SEPARATOR}${id}`;
}

/** Null for anything malformed, which callers treat as "no more pages". */
export function decodeCursor(cursor: string): [Timestamp, string] | null {
  const separator = cursor.indexOf(SEPARATOR);
  if (separator < 0) return null;

  const id = cursor.slice(separator + 1);
  const parts = cursor.slice(0, separator).split('.');
  // Exactly two parts: anything else was not produced here, and silently
  // reading the first two would turn a corrupt cursor into a plausible position
  // somewhere in the middle of the collection.
  if (!id || parts.length !== 2) return null;

  const [seconds, nanoseconds] = parts;
  if (seconds === undefined || nanoseconds === undefined) return null;

  const s = Number(seconds);
  const n = Number(nanoseconds);
  if (!Number.isInteger(s) || !Number.isInteger(n)) return null;

  try {
    return [new Timestamp(s, n), id];
  } catch {
    // The constructor rejects out-of-range seconds and nanoseconds. A cursor is
    // caller-supplied, so that has to degrade to "no more pages" rather than
    // throw out of a listing.
    return null;
  }
}

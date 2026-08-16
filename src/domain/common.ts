/**
 * Primitives shared across the domain.
 *
 * Nothing in `src/domain` may import a vendor SDK — the ESLint fence enforces
 * it. Timestamps are plain ISO strings here, and the Firestore `Timestamp` is
 * converted at the adapter boundary in `infra/firebase/mappers.ts`. That one
 * rule is what keeps the datasource swappable: a vendor type in the domain
 * propagates through `Entry` into every component that touches it.
 */

/** An instant with timezone, e.g. `2026-08-07T12:34:56.789Z`. */
export type IsoDateTime = string;

/**
 * A local calendar day, `YYYY-MM-DD`, with no timezone by design — see
 * `lib/dates.ts` for why these are parsed in local time.
 */
export type IsoDate = string;

/**
 * Free-form, user-created tags, following the same rule as an Instagram
 * hashtag: any script's letters, digits and underscores, nothing else. Kanji
 * and kana are fine. Excluding whitespace and punctuation is what keeps a tag
 * usable in `?tag=…` — the value still gets percent-encoded, but it survives
 * the round trip and browsers display it decoded.
 */
export const TAG_PATTERN = /^[\p{L}\p{N}_]{1,32}$/u;
export type Tag = string;

/**
 * Where a copied entry or set came from.
 *
 * Deliberately a snapshot rather than a reference: nothing ever reads through
 * it to the original, so the source owner deleting their account cannot break
 * or blank out somebody else's copy. That independence is the entire point of
 * copying rather than linking.
 */
export interface Attribution {
  ownerNickname: string;
  sourceKind: 'entry' | 'set';
  copiedAt: IsoDateTime;
}

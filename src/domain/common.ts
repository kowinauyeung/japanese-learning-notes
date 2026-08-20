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
 *
 * The length is built into the pattern rather than checked beside it because
 * both sides of the tag rule read this one value: `invalidTags` refuses a bad
 * tag on save, and `validTags` drops one on read. A separate length check would
 * have to be added to both, and the read path is the one that gets forgotten.
 *
 * **Tightening this drops stored tags that were legal when they were written.**
 * `validTags` runs on every read, so a tag above the limit stops appearing
 * rather than being reported — which is the right degradation for a value no
 * filter chip could match anyway, and is worth knowing before changing it.
 */
export const TAG_MAX_LENGTH = 10;
export const TAG_PATTERN = new RegExp(`^[\\p{L}\\p{N}_]{1,${TAG_MAX_LENGTH}}$`, 'u');
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

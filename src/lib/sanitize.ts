import type { Attribution } from '@/domain/common';
import { JLPT_LEVELS, POLITENESS, POS, STYLES, WORD_ORIGINS } from '@/domain/entry';
import type {
  Entry,
  EntryContext,
  EntryDraft,
  Example,
  Frequency,
  PosInfo,
  RelatedWord,
  Sense,
  UsageNotes,
} from '@/domain/entry';
import { PRACTICE_MODES } from '@/domain/practice';
import type { EntryProgress, PracticeSession } from '@/domain/practice';
import type { WordSet } from '@/domain/wordSet';
import { emptyDraft, parseTags } from './draft';

/**
 * Coercion for `Entry` data arriving from outside the app — assistant-written
 * JSON at the import boundary, and Firestore documents on read.
 *
 * Neither source is trustworthy. An assistant will happily emit `"senses":
 * [null]` or `"jlpt": "N9"`, and Firestore returns whatever was written to it,
 * including documents from an older schema. Both flow into the same shared
 * `Entry` shape that the provider, filters, cards, dashboard, detail page and
 * form all read, so a single bad value crashes a route far from where it
 * entered.
 *
 * The rule here is total: every function returns a valid value for any input.
 * Unusable data degrades to the blank default rather than propagating, because
 * losing one optional field is always better than a white screen.
 */

const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/** Same as `oneOf`, but for the fields whose blank state is the empty string. */
const oneOfOptional = <T extends string>(value: unknown, allowed: readonly T[]): T | '' =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : '';

/**
 * The mora the pitch drops after: a non-negative integer, or nothing.
 *
 * `typeof value === 'number'` was the whole check until the accent field was
 * built, and it admits `NaN`, `Infinity`, `-3` and `2.7` — all of which render
 * as garbage over the kana. 0 is meaningful (平板), so the guard cannot lean on
 * falsiness.
 *
 * **No upper bound here, deliberately.** A drop after mora 4 of a three-mora
 * word is wrong, but it is wrong in a way only the reading can reveal, and the
 * reading is editable: bounding it here would silently delete a value the user
 * typed the moment they shortened the kana. The form owns that rule, where it
 * can be shown and corrected instead — and `pitchShape` draws nothing rather
 * than drawing a lie in the meantime.
 */
const pitchAccent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** `freq` drives `'★'.repeat()`, so it must be an integer in 1..5 or nothing. */
const frequency = (value: unknown, fallback: Frequency): Frequency => {
  const n = typeof value === 'number' ? value : Number.parseInt(str(value), 10);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Frequency) : fallback;
};

/**
 * A real calendar day in `YYYY-MM-DD`.
 *
 * Shape and non-`NaN` are both insufficient. `Date` rejects an out-of-range
 * month or a day above 31, but rolls a day that is merely wrong for its month
 * forward instead: `2026-02-31` parses happily as `2026-03-03`. Only comparing
 * the parsed components back against the input catches that.
 *
 * The value is stored and compared as a plain string, so an impossible date
 * would sort and filter as if it were real, and `parseLocalDate` would hand the
 * dashboard an Invalid Date.
 */
export const isValidIsoDate = (value: unknown): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${match[0]}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
};

const isoDate = (value: unknown, fallback: string): string => {
  const raw = str(value).trim();
  return isValidIsoDate(raw) ? raw : fallback;
};

/**
 * A full instant, as written by `infra/firebase/mappers.ts`.
 *
 * Unlike `learnedOn` these are never user input, but they can still be absent:
 * `serverTimestamp()` resolves asynchronously, so a document read back from the
 * local cache immediately after a write has `null` there until the server
 * round-trip lands. An empty string is the honest answer, and no view reads
 * these today — the dashboard counts `learnedOn`.
 */
const isoDateTime = (value: unknown): string => {
  const raw = str(value).trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const nonNegativeInt = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number.parseInt(str(value), 10);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

/** Drops non-objects (the `[null]` case) before the mapper can touch them. */
const objects = <T>(value: unknown, map: (item: Record<string, unknown>) => T): T[] =>
  Array.isArray(value)
    ? value
        .filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
        )
        .map(map)
    : [];

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(str).filter(Boolean) : [];

const sense = (raw: Record<string, unknown>): Sense => ({
  label: str(raw.label),
  description: str(raw.description),
  example: str(raw.example),
  exampleGloss: str(raw.exampleGloss),
  translation: str(raw.translation),
  usage: str(raw.usage),
});

const example = (raw: Record<string, unknown>): Example => ({
  ja: str(raw.ja),
  translation: str(raw.translation),
});

const related = (raw: Record<string, unknown>): RelatedWord => ({
  headword: str(raw.headword),
  note: str(raw.note),
});

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const entryContext = (value: unknown): EntryContext => {
  const raw = record(value);
  return { original: str(raw.original), ja: str(raw.ja), translation: str(raw.translation) };
};

const usage = (value: unknown): UsageNotes => {
  const raw = record(value);
  return { when: str(raw.when), translation: str(raw.translation), caution: str(raw.caution) };
};

/**
 * Null unless every part of it survives coercion. A half-populated attribution
 * is worse than none: it would render as an empty creator name next to a real
 * "copied from" label.
 */
const attribution = (value: unknown): Attribution | null => {
  if (value === null || value === undefined) return null;
  const raw = record(value);
  const ownerNickname = str(raw.ownerNickname).trim();
  const copiedAt = isoDateTime(raw.copiedAt);
  if (!ownerNickname || !copiedAt) return null;
  return {
    ownerNickname,
    sourceKind: raw.sourceKind === 'set' ? 'set' : 'entry',
    copiedAt,
  };
};

const posInfo = (value: unknown): PosInfo | null => {
  if (value === null || value === undefined) return null;
  const raw = record(value);
  return {
    title: str(raw.title),
    rows: objects(raw.rows, (row) => ({ label: str(row.label), value: str(row.value) })),
  };
};

/**
 * Coerce an arbitrary object into a valid draft.
 *
 * `fallback` supplies the defaults for absent fields — a blank draft on import,
 * the stored entry on read — so this doubles as "fill in what is missing".
 */
export function sanitizeDraft(value: unknown, fallback: EntryDraft = emptyDraft()): EntryDraft {
  const raw = record(value);
  return {
    headword: str(raw.headword).trim() || fallback.headword,
    reading: str(raw.reading) || fallback.reading,
    pitchAccent: pitchAccent(raw.pitchAccent),
    pos: strings(raw.pos).filter((p): p is (typeof POS)[number] =>
      (POS as readonly string[]).includes(p),
    ),
    jlpt: oneOf(raw.jlpt, JLPT_LEVELS, fallback.jlpt),
    origin: oneOfOptional(raw.origin, WORD_ORIGINS),
    style: oneOfOptional(raw.style, STYLES),
    politeness: oneOfOptional(raw.politeness, POLITENESS),
    freq: frequency(raw.freq, fallback.freq),
    citationForm: str(raw.citationForm),
    posInfo: posInfo(raw.posInfo),
    definition: str(raw.definition).trim() || fallback.definition,
    definitionSub: str(raw.definitionSub),
    senses: objects(raw.senses, sense),
    examples: objects(raw.examples, example),
    related: objects(raw.related, related),
    source: str(raw.source),
    context: entryContext(raw.context),
    usage: usage(raw.usage),
    tags: parseTags(strings(raw.tags).join(' ')),
    learnedOn: isoDate(raw.learnedOn, fallback.learnedOn),
  };
}

/**
 * Coerce a stored document into an `Entry`.
 *
 * The bookkeeping and ownership fields used to be `as`-cast straight through,
 * which was the one place this module did the very thing it exists to prevent.
 * They are coerced now — the adapter has already turned any `Timestamp` into a
 * string by this point, so there is no vendor type left to cast around.
 *
 * `ownerUid` is trusted from the document rather than passed in: it is written
 * by the repository and enforced by the security rules, and re-deriving it from
 * the caller would invent a second source of truth for who owns the row.
 */
export function sanitizeEntry(id: string, data: unknown): Entry {
  const raw = record(data);
  return {
    ...sanitizeDraft(raw),
    id,
    ownerUid: str(raw.ownerUid),
    publishedId: str(raw.publishedId) || null,
    publishedVersion: nonNegativeInt(raw.publishedVersion),
    copiedFrom: attribution(raw.copiedFrom),
    createdAt: isoDateTime(raw.createdAt),
    updatedAt: isoDateTime(raw.updatedAt),
  };
}

// ------------------------------------------------------------------ practice

/**
 * Practice records, coerced by the same rule as entries.
 *
 * These have one source the entry path does not: the progress map is a single
 * document, so one malformed key would otherwise take down every word's state
 * at once rather than one row's.
 */

/**
 * One row of the progress map. The key is the entry id — the value carries it
 * too, so a row stays self-describing once it is out of the map.
 */
const progressRow = (entryId: string, value: unknown): EntryProgress => {
  const raw = record(value);
  return {
    entryId,
    status: oneOf(raw.status, ['correct', 'wrong'] as const, 'wrong'),
    lastMode: oneOf(raw.lastMode, PRACTICE_MODES, 'flashcard'),
    lastAt: isoDateTime(raw.lastAt),
    attempts: nonNegativeInt(raw.attempts),
    correctCount: nonNegativeInt(raw.correctCount),
  };
};

/**
 * `status` defaults to `'wrong'` rather than `'correct'`, and that direction is
 * deliberate: an unreadable row surfaces the word in 苦手な語, where the learner
 * sees it and drills it again. Defaulting the other way would silently drop a
 * word they are getting wrong out of the one list built to catch that.
 */
export function sanitizeProgressMap(value: unknown): EntryProgress[] {
  const raw = record(value);
  return Object.entries(raw).map(([entryId, row]) => progressRow(entryId, row));
}

export function sanitizeSession(id: string, data: unknown): PracticeSession {
  const raw = record(data);
  return {
    id,
    mode: oneOf(raw.mode, PRACTICE_MODES, 'flashcard'),
    filterLabel: str(raw.filterLabel),
    total: nonNegativeInt(raw.total),
    correct: nonNegativeInt(raw.correct),
    missed: strings(raw.missed),
    startedAt: isoDateTime(raw.startedAt),
    finishedAt: isoDateTime(raw.finishedAt),
  };
}

/**
 * A 単語集, coerced on read.
 *
 * `entryIds` is deduped here rather than only on write: the order *is* the
 * study order, and a duplicate would deal the same card twice in one session.
 */
export function sanitizeWordSet(id: string, data: unknown): WordSet {
  const raw = record(data);
  return {
    id,
    ownerUid: str(raw.ownerUid),
    name: str(raw.name),
    description: str(raw.description),
    entryIds: [...new Set(strings(raw.entryIds))],
    level: oneOfOptional(raw.level, JLPT_LEVELS),
    topics: strings(raw.topics),
    publishedId: str(raw.publishedId) || null,
    publishedVersion: nonNegativeInt(raw.publishedVersion),
    copiedFrom: attribution(raw.copiedFrom),
    createdAt: isoDateTime(raw.createdAt),
    updatedAt: isoDateTime(raw.updatedAt),
  };
}

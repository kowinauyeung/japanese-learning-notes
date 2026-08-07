import {
  JLPT_LEVELS,
  POLITENESS,
  POS,
  STYLES,
  WORD_ORIGINS,
} from '@/types/entry';
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
} from '@/types/entry';
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

/** Drops non-objects (the `[null]` case) before the mapper can touch them. */
const objects = <T>(value: unknown, map: (item: Record<string, unknown>) => T): T[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
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
export function sanitizeDraft(
  value: unknown,
  fallback: EntryDraft = emptyDraft(),
): EntryDraft {
  const raw = record(value);
  return {
    headword: str(raw.headword).trim() || fallback.headword,
    reading: str(raw.reading) || fallback.reading,
    pitchAccent: typeof raw.pitchAccent === 'number' ? raw.pitchAccent : null,
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
    wordSets: strings(raw.wordSets),
    learnedOn: isoDate(raw.learnedOn, fallback.learnedOn),
  };
}

/**
 * Coerce a Firestore document into an `Entry`.
 *
 * `createdAt` / `updatedAt` pass through untouched: they are Firestore
 * `Timestamp`s written only by `entryWrite.ts`, never user input, and no view
 * reads them today.
 */
export function sanitizeEntry(id: string, data: unknown): Entry {
  const raw = record(data);
  return {
    ...sanitizeDraft(raw),
    id,
    createdAt: raw.createdAt as Entry['createdAt'],
    updatedAt: raw.updatedAt as Entry['updatedAt'],
  };
}

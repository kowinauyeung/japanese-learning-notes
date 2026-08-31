import { JLPT_LEVELS, POS, WORD_ORIGINS } from '@/domain/entry';
import type { Entry } from '@/domain/entry';
import { SESSION_LIMITS } from '@/domain/limits';
import type { EntryProgress, PracticeMode, PracticeSessionDraft } from '@/domain/practice';
import type { WordSet } from '@/domain/wordSet';
import { addDays, dateKey, subtractMonths } from '@/lib/dates';
import { isValidIsoDate } from '@/lib/sanitize';

/**
 * Everything a practice session is decided by, before any of it is rendered.
 *
 * Kept apart from `lib/filters.ts` on purpose. Browse filters answer "which
 * words do I want to look at" and grew a search box, date range, 頻度 floor and
 * a sort order to do it; a session only needs "which words am I drilling", and
 * folding the two would put a sort order on something that is deliberately
 * shuffled and a 苦手のみ toggle on a list that has no notion of practice.
 */
export interface PracticeFilters {
  /** 単語集 ids. Membership lives on the set, so this resolves via `scopeFor`. */
  sets: string[];
  tags: string[];
  jlpt: string[];
  /** Single-valued, matching Browse: one 品詞 and one 語種 at a time. */
  pos: string;
  origin: string;
  /** Inclusive `learnedOn` bounds, `YYYY-MM-DD`. Empty means unbounded. */
  from: string;
  to: string;
  /** Only entries whose most recent attempt was wrong. */
  weakOnly: boolean;
}

export const EMPTY_PRACTICE_FILTERS: PracticeFilters = {
  sets: [],
  tags: [],
  jlpt: [],
  pos: '',
  origin: '',
  from: '',
  to: '',
  weakOnly: false,
};

/** A value from a query string, or `''` when it is not one this app knows. */
function oneOf(value: string | null, allowed: readonly string[]): string {
  return value !== null && allowed.includes(value) ? value : '';
}

/**
 * A `learnedOn` bound, or `''` when what arrived is not a date.
 *
 * The bounds are compared as plain strings, so anything sorting above a real
 * date — `?from=zzz` — excludes every entry at once. The learner then sees a
 * blank date field, 「0 件が対象」 and nothing on screen accounting for either,
 * which is exactly the filter the note above refuses to allow. `isValidIsoDate`
 * is the same check the entry form already applies to this field.
 */
function isoBound(value: string | null): string {
  return isValidIsoDate(value) ? (value as string) : '';
}

/**
 * Practice filters in a query string, so a drill can be linked to.
 *
 * The one caller that needs it today is 履歴's 復習 button, which has to hand
 * the next screen a scope — but the shape is the whole filter rather than a
 * single `weak` flag, because a link to "N2 verbs I got wrong" is the same
 * feature and a bespoke parameter would have to be replaced to get it.
 *
 * Unknown values are dropped rather than trusted. A query string is user input:
 * `?pos=nonsense` has to leave the setup screen showing 品詞（すべて）, not a
 * select with no matching option and a filter nothing can satisfy.
 *
 * `sets` and `tags` pass through unvalidated because both are user-defined —
 * an id that names no set resolves to an empty scope, which `scopeFor` already
 * distinguishes from "no set selected".
 */
export function practiceFiltersFromParams(params: URLSearchParams): PracticeFilters {
  return {
    sets: params.getAll('set'),
    tags: params.getAll('tag'),
    jlpt: params
      .getAll('jlpt')
      .filter((level) => (JLPT_LEVELS as readonly string[]).includes(level)),
    pos: oneOf(params.get('pos'), POS),
    origin: oneOf(params.get('origin'), WORD_ORIGINS),
    from: isoBound(params.get('from')),
    to: isoBound(params.get('to')),
    weakOnly: params.get('weak') === '1',
  };
}

export function practiceFiltersToParams(filters: PracticeFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const id of filters.sets) params.append('set', id);
  for (const tag of filters.tags) params.append('tag', tag);
  for (const level of filters.jlpt) params.append('jlpt', level);
  if (filters.pos) params.set('pos', filters.pos);
  if (filters.origin) params.set('origin', filters.origin);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.weakOnly) params.set('weak', '1');
  return params;
}

export type QuickRangeKey = 'week' | 'month' | 'year';

export const QUICK_RANGES: { key: QuickRangeKey; label: string }[] = [
  { key: 'week', label: '1週間' },
  { key: 'month', label: '1ヶ月' },
  { key: 'year', label: '1年' },
];

/**
 * Where 「直近1ヶ月」 starts, as a `learnedOn` key.
 *
 * `now` is an argument for the reason everything else here takes one: a
 * function that reads the clock can only be tested on the day it was written.
 * A month is a calendar month rather than 30 days, so 「直近1ヶ月」 on the 15th
 * always means "since the 15th of last month" and does not drift.
 */
export function quickRangeStart(key: QuickRangeKey, now: Date): string {
  if (key === 'week') return dateKey(addDays(now, -7));
  return dateKey(subtractMonths(now, key === 'month' ? 1 : 12));
}

/**
 * Which quick range the current bounds *are*, so the chip can show as selected.
 *
 * A quick range sets only the start, so an explicit end means the learner has
 * since narrowed it by hand and no chip should claim to describe it.
 */
export function activeQuickRange(filters: PracticeFilters, now: Date): QuickRangeKey | null {
  if (filters.to || !filters.from) return null;
  return (
    QUICK_RANGES.find((range) => quickRangeStart(range.key, now) === filters.from)?.key ?? null
  );
}

/**
 * 苦手な語 is the *most recent* attempt, never an accumulated ratio: answering
 * a word correctly today has to clear it, or the list only ever grows and stops
 * describing what the learner still gets wrong.
 */
export function weakIdsOf(progress: readonly EntryProgress[]): Set<string> {
  return new Set(progress.filter((row) => row.status === 'wrong').map((row) => row.entryId));
}

/**
 * The two filters that are answered by an id lookup rather than by a field on
 * the entry, resolved once per render instead of per entry.
 *
 * A named object rather than two positional `Set`s: they are the same type,
 * so swapping them at a call site is invisible to the compiler and turns
 * 苦手のみ into 単語集 without a single error.
 */
export interface PracticeScope {
  /** Entries whose most recent attempt was wrong. */
  weak: ReadonlySet<string>;
  /** Members of the selected 単語集, or null when none is selected. */
  inSets: ReadonlySet<string> | null;
}

/**
 * Resolves the selected 単語集 into the entry ids they hold.
 *
 * Null rather than an empty set when nothing is selected, because those two
 * mean opposite things: "do not filter by set" and "a set with no words in it",
 * and collapsing them makes an empty set select everything.
 */
export function scopeFor(
  filters: PracticeFilters,
  sets: readonly WordSet[],
  weak: ReadonlySet<string>,
): PracticeScope {
  if (!filters.sets.length) return { weak, inSets: null };
  const selected = new Set(filters.sets);
  return {
    weak,
    inSets: new Set(sets.filter((set) => selected.has(set.id)).flatMap((set) => set.entryIds)),
  };
}

/**
 * Same combination rule as Browse: different filters AND, chips within one
 * filter OR. Two tags means "either tag", because a word normally has one.
 */
export function matchesPractice(
  entry: Entry,
  filters: PracticeFilters,
  scope: PracticeScope,
): boolean {
  if (scope.inSets && !scope.inSets.has(entry.id)) return false;
  if (filters.tags.length && !filters.tags.some((tag) => entry.tags.includes(tag))) return false;
  if (filters.jlpt.length && !filters.jlpt.includes(entry.jlpt)) return false;
  if (filters.pos && !entry.pos.includes(filters.pos as Entry['pos'][number])) return false;
  if (filters.origin && entry.origin !== filters.origin) return false;
  // `learnedOn` is a zero-padded ISO day, so a string comparison is a date
  // comparison — the same trick `lib/filters.ts` relies on.
  if (filters.from && entry.learnedOn < filters.from) return false;
  if (filters.to && entry.learnedOn > filters.to) return false;
  if (filters.weakOnly && !scope.weak.has(entry.id)) return false;
  return true;
}

/**
 * Fisher–Yates, with the source of randomness passed in.
 *
 * `Math.random()` inside would make the queue order untestable, and the order
 * is the entire point of a shuffle: an implementation that only ever moved the
 * first element would look fine in a browser and be a broken drill.
 */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * The human-readable label stored on the session, e.g. 「#仕事 / N1 / 苦手のみ」.
 *
 * Stored rather than recomputed because 履歴 has to keep describing a session
 * after the tag it was filtered by has been renamed or deleted.
 */
export interface PracticeFilterLabels {
  set: (name: string) => string;
  metadata: (value: string) => string;
  unknown: string;
  weakOnly: string;
  all: string;
}

const JAPANESE_FILTER_LABELS: PracticeFilterLabels = {
  set: (name) => `単語集:${name}`,
  metadata: (value) => value,
  unknown: '不明',
  weakOnly: '苦手のみ',
  all: 'すべての語',
};

export function describeFilters(
  filters: PracticeFilters,
  sets: readonly WordSet[] = [],
  labels: PracticeFilterLabels = JAPANESE_FILTER_LABELS,
): string {
  // Named, not by id: 履歴 is read by a person. A set deleted between the
  // session and the reading is named as missing rather than dropped, because
  // silently omitting a filter misdescribes what was drilled.
  const setNames = filters.sets.map((id) =>
    labels.set(sets.find((set) => set.id === id)?.name ?? labels.unknown),
  );
  // The bounds are written out rather than as 「直近1ヶ月」: a quick range is
  // relative to the day it was picked, and a label read back a month later has
  // to still name the same days.
  const range = filters.from || filters.to ? [`${filters.from}〜${filters.to}`] : [];
  const parts = [
    ...setNames,
    ...filters.tags.map((tag) => `#${tag}`),
    ...filters.jlpt,
    ...(filters.pos ? [labels.metadata(filters.pos)] : []),
    ...(filters.origin ? [labels.metadata(filters.origin)] : []),
    ...range,
    ...(filters.weakOnly ? [labels.weakOnly] : []),
  ];
  return parts.length ? parts.join(' / ') : labels.all;
}

export interface Answer {
  entryId: string;
  correct: boolean;
}

/**
 * Folds a session's answers into the progress rows it touched, and returns
 * only those rows.
 *
 * Returning the full map instead would make every session overwrite every
 * entry, which is how a session finished on a phone silently reverts one
 * finished on a laptop a minute earlier.
 */
export function mergeProgress(
  existing: readonly EntryProgress[],
  answers: readonly Answer[],
  mode: PracticeMode,
  at: string,
): EntryProgress[] {
  const byId = new Map(existing.map((row) => [row.entryId, row]));
  const touched = new Map<string, EntryProgress>();

  for (const answer of answers) {
    const previous = touched.get(answer.entryId) ?? byId.get(answer.entryId);
    touched.set(answer.entryId, {
      entryId: answer.entryId,
      status: answer.correct ? 'correct' : 'wrong',
      lastMode: mode,
      lastAt: at,
      attempts: (previous?.attempts ?? 0) + 1,
      correctCount: (previous?.correctCount ?? 0) + (answer.correct ? 1 : 0),
    });
  }

  return [...touched.values()];
}

/**
 * `text` shortened to at most `max` UTF-16 code units, ellipsis included.
 *
 * The slice is by code unit because the limit is, and a set name may end in an
 * emoji — so a cut that lands between the two halves of a surrogate pair leaves
 * a lone high surrogate as the last character. That is not a character: it
 * renders as a replacement glyph, and it is not encodable as UTF-8, so what
 * Firestore stores is not what was measured. Dropping the orphan costs one more
 * unit off a caption that is already being shortened.
 */
function ellipsise(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/u, '')}…`;
}

export function summariseSession(input: {
  mode: PracticeMode;
  filterLabel: string;
  answers: readonly Answer[];
  startedAt: string;
  /**
   * The words that were dealt, so each one can be copied into the record rather
   * than only pointed at — see `MissedWord`. The queue, not the whole notebook:
   * an answer can only name a card this session dealt.
   */
  entries: readonly Entry[];
}): PracticeSessionDraft {
  const byId = new Map(input.entries.map((entry) => [entry.id, entry]));
  return {
    mode: input.mode,
    /*
      Truncated rather than refused, and it is the one place in this change that
      is right.

      Nothing here is typed: the label is assembled from the tag, set and level
      names already chosen on the setup screen, so its length is a consequence
      of choices the user made somewhere else entirely. Refusing the write would
      throw away a finished practice run — the answers, the score, the missed
      words — to protect a caption, and there is no field to send them back to
      to fix it. An ellipsis loses the tail of a description of filters they can
      see on screen anyway.
    */
    filterLabel: ellipsise(input.filterLabel, SESSION_LIMITS.filterLabel),
    total: input.answers.length,
    correct: input.answers.filter((answer) => answer.correct).length,
    /*
      Every answer, right and wrong, in the order they were given — `answers`
      is appended to as the session runs, so its order is the deal order.

      A word the queue cannot name still gets a row, with an empty snapshot.
      That should not happen, and if it does the honest record is the id: it is
      the part that was actually observed, and dropping the answer would put
      `words.length` below `total` in the one record whose whole job is to say
      what happened.
    */
    words: input.answers.map((answer) => {
      const entry = byId.get(answer.entryId);
      return {
        entryId: answer.entryId,
        headword: entry?.headword ?? '',
        reading: entry?.reading ?? '',
        correct: answer.correct,
      };
    }),
    startedAt: input.startedAt,
  };
}

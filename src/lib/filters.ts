import { JLPT_LEVELS, POS, STYLES, WORD_ORIGINS } from '@/types/entry';
import type { Entry } from '@/types/entry';

export type SortKey = 'new' | 'old' | 'headword';

const SORT_KEYS: readonly SortKey[] = ['new', 'old', 'headword'];

/** Highest 頻度 a filter can ask for; also the width of the ★ display. */
export const MAX_FREQ = 5;

export interface Filters {
  q: string;
  tags: string[];
  jlpt: string[];
  pos: string;
  origin: string;
  style: string;
  /** Minimum 頻度; 0 means "any". */
  minFreq: number;
  from: string;
  to: string;
  sort: SortKey;
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  tags: [],
  jlpt: [],
  pos: '',
  origin: '',
  style: '',
  minFreq: 0,
  from: '',
  to: '',
  sort: 'new',
};

/**
 * Everything the search box looks at, flattened once per entry.
 *
 * Substring matching is enough here and is what makes searching Japanese work
 * without a tokenizer: 「兆」 finds 兆候 because it is literally a substring,
 * which a word-boundary full-text index would miss.
 */
function haystack(entry: Entry): string {
  return [
    entry.headword,
    entry.reading,
    entry.citationForm,
    ...entry.tags,
    entry.definition,
    entry.definitionSub,
    entry.context.original,
    ...entry.senses.flatMap((s) => [s.label, s.description, s.example, s.translation]),
    ...entry.examples.flatMap((e) => [e.ja, e.translation]),
    ...entry.related.map((r) => r.headword),
  ]
    .join('\n')
    .toLowerCase();
}

const cache = new WeakMap<Entry, string>();
function cachedHaystack(entry: Entry): string {
  let value = cache.get(entry);
  if (value === undefined) {
    value = haystack(entry);
    cache.set(entry, value);
  }
  return value;
}

/**
 * Different filters combine with AND; multiple chips *within* one filter are
 * OR. Picking two tags means "either tag", the same way picking N1 and N2 means
 * "either level" — an AND there would silently return nothing, since a word has
 * one JLPT level and, today, one tag.
 */
export function matches(entry: Entry, filters: Filters): boolean {
  const q = filters.q.trim().toLowerCase();
  if (q && !cachedHaystack(entry).includes(q)) return false;
  if (filters.tags.length && !filters.tags.some((tag) => entry.tags.includes(tag))) return false;
  if (filters.jlpt.length && !filters.jlpt.includes(entry.jlpt)) return false;
  if (filters.pos && !entry.pos.includes(filters.pos as Entry['pos'][number])) return false;
  if (filters.origin && entry.origin !== filters.origin) return false;
  if (filters.style && entry.style !== filters.style) return false;
  if (filters.minFreq && entry.freq < filters.minFreq) return false;
  if (filters.from && entry.learnedOn < filters.from) return false;
  if (filters.to && entry.learnedOn > filters.to) return false;
  return true;
}

export function sortEntries(entries: Entry[], sort: SortKey): Entry[] {
  const sorted = [...entries];
  if (sort === 'headword') {
    return sorted.sort((a, b) => a.headword.localeCompare(b.headword, 'ja'));
  }
  const direction = sort === 'new' ? -1 : 1;
  return sorted.sort(
    (a, b) => direction * (a.learnedOn.localeCompare(b.learnedOn) || a.id.localeCompare(b.id)),
  );
}

export function isDefault(filters: Filters): boolean {
  return (
    !filters.q &&
    !filters.tags.length &&
    !filters.jlpt.length &&
    !filters.pos &&
    !filters.origin &&
    !filters.style &&
    !filters.minFreq &&
    !filters.from &&
    !filters.to
  );
}

// ------------------------------------------------------------- URL round-trip

/** The query string is user-editable, so nothing coming out of it may be
 *  trusted. Anything unrecognised degrades to "no filter" rather than reaching
 *  a consumer: `minFreq` in particular feeds `'★'.repeat()`, where a negative
 *  or non-integer value throws and takes the whole route down. */
const oneOf = <T extends string>(raw: string | null, allowed: readonly T[]): T | '' =>
  raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : '';

/** Filters live in the query string so a filtered view can be linked and the
 *  back button steps through refinements. */
export function fromSearchParams(params: URLSearchParams): Filters {
  const freq = Number.parseInt(params.get('freq') ?? '', 10);
  return {
    q: params.get('q') ?? '',
    tags: params.getAll('tag'),
    jlpt: params
      .getAll('jlpt')
      .filter((level) => (JLPT_LEVELS as readonly string[]).includes(level)),
    pos: oneOf(params.get('pos'), POS),
    origin: oneOf(params.get('origin'), WORD_ORIGINS),
    style: oneOf(params.get('style'), STYLES),
    minFreq: Number.isInteger(freq) && freq > 0 ? Math.min(freq, MAX_FREQ) : 0,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: oneOf(params.get('sort'), SORT_KEYS) || 'new',
  };
}

export function toSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  for (const tag of filters.tags) params.append('tag', tag);
  for (const level of filters.jlpt) params.append('jlpt', level);
  if (filters.pos) params.set('pos', filters.pos);
  if (filters.origin) params.set('origin', filters.origin);
  if (filters.style) params.set('style', filters.style);
  if (filters.minFreq) params.set('freq', String(filters.minFreq));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.sort !== 'new') params.set('sort', filters.sort);
  return params;
}

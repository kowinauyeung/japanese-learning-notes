import type { Entry } from '@/domain/entry';

/**
 * A complete, valid `Entry` with every field populated, so a test that cares
 * about one field can override it and trust the rest.
 *
 * Built by hand rather than by running `sanitizeEntry` over a blob: the
 * sanitiser is itself under test, and deriving fixtures from it would let a
 * regression there quietly change what every other test is asserting against.
 */
export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    ownerUid: 'uid-alice',

    headword: '兆候',
    reading: 'ちょうこう',
    pitchAccent: 0,

    pos: ['名詞'],
    jlpt: 'N2',
    origin: '漢語',
    style: '書き言葉',
    politeness: '普通',
    freq: 3,
    citationForm: '兆候',
    posInfo: null,

    definition: '何かが起こる前ぶれ。',
    definitionSub: '徵兆',
    senses: [],
    examples: [],
    related: [],

    source: '新聞',
    context: { original: '', ja: '', translation: '' },
    usage: { when: '', translation: '', caution: '' },

    tags: ['ニュース'],

    publishedId: null,
    publishedVersion: 0,
    copiedFrom: null,

    learnedOn: '2026-06-24',
    createdAt: '2026-06-24T09:00:00.000Z',
    updatedAt: '2026-06-24T09:00:00.000Z',
    ...overrides,
  };
}

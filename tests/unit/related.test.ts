import { describe, expect, it } from 'vitest';
import { ENTRY_LIMITS } from '@/domain/limits';
import { messages } from '@/i18n/messages';
import { draftError, emptyDraft } from '@/lib/draft';
import { findByHeadword } from '@/lib/related';
import { makeEntry } from '../fixtures/entry';

describe('findByHeadword', () => {
  const notebook = [
    makeEntry({ id: 'kiken', headword: '危険' }),
    makeEntry({ id: 'kigu', headword: '危惧' }),
  ];

  it('finds the note a related word already has, so its row offers 開く rather than a duplicate', () => {
    expect(findByHeadword(notebook, '危惧')?.id).toBe('kigu');
  });

  it('ignores surrounding whitespace on either side, which a hand-typed related word often carries', () => {
    expect(findByHeadword(notebook, ' 危惧 ')?.id).toBe('kigu');
    expect(findByHeadword([makeEntry({ id: 'x', headword: '危惧 ' })], '危惧')?.id).toBe('x');
  });

  it('does not match on a prefix, which would hide the add button for 危 behind 危険', () => {
    expect(findByHeadword(notebook, '危')).toBeUndefined();
  });

  it('matches nothing for a blank related word instead of the first blank-headword note', () => {
    expect(findByHeadword([makeEntry({ headword: '' })], '  ')).toBeUndefined();
  });
});

describe('the 出典 a related-word add fills in', () => {
  const longest = '龍'.repeat(ENTRY_LIMITS.headword);

  it.each(Object.keys(messages) as (keyof typeof messages)[])(
    'stays within the 出典 limit in %s even for the longest headword, or the save would be refused',
    (locale) => {
      const source = messages[locale]['vocabulary.relatedSource'].replaceAll('{headword}', longest);
      const draft = {
        ...emptyDraft(),
        headword: longest,
        definition: '意味',
        source,
        learnedOn: '2026-06-24',
      };

      expect(source).toContain(longest);
      expect(draftError(draft, '2026-06-24')).toBeNull();
    },
  );
});

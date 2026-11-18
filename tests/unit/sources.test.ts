import { describe, expect, it } from 'vitest';
import { ENTRY_LIMITS } from '@/domain/limits';
import { recentSources } from '@/lib/sources';
import { makeEntry } from '../fixtures/entry';

const at = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();

describe('recentSources', () => {
  it('offers the newest source first, not the order the entries arrived in', () => {
    const entries = [
      makeEntry({ id: 'a', source: '朝会', createdAt: at(1) }),
      makeEntry({ id: 'b', source: '進撃の巨人', createdAt: at(3) }),
      makeEntry({ id: 'c', source: 'NHKニュース', createdAt: at(2) }),
    ];

    expect(recentSources(entries)).toEqual(['進撃の巨人', 'NHKニュース', '朝会']);
  });

  it('offers a source once even when many entries share it', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `e-${i}`, source: '朝会', createdAt: at(i + 1) }),
    );

    expect(recentSources(entries)).toEqual(['朝会']);
  });

  it('stops at five so the row does not crowd a phone-width form', () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ id: `e-${i}`, source: `source-${i}`, createdAt: at(i + 1) }),
    );

    expect(recentSources(entries)).toEqual([
      'source-7',
      'source-6',
      'source-5',
      'source-4',
      'source-3',
    ]);
  });

  it('skips entries saved without a source instead of offering a blank chip', () => {
    const entries = [
      makeEntry({ id: 'a', source: '', createdAt: at(3) }),
      makeEntry({ id: 'b', source: '   ', createdAt: at(2) }),
      makeEntry({ id: 'c', source: '朝会', createdAt: at(1) }),
    ];

    expect(recentSources(entries)).toEqual(['朝会']);
  });

  it('treats a source with stray spaces as the same source', () => {
    const entries = [
      makeEntry({ id: 'a', source: ' 朝会 ', createdAt: at(2) }),
      makeEntry({ id: 'b', source: '朝会', createdAt: at(1) }),
    ];

    expect(recentSources(entries)).toEqual(['朝会']);
  });

  it('keeps full-width and half-width spellings apart, since either may be deliberate', () => {
    const entries = [
      makeEntry({ id: 'a', source: 'NHK', createdAt: at(2) }),
      makeEntry({ id: 'b', source: 'ＮＨＫ', createdAt: at(1) }),
    ];

    expect(recentSources(entries)).toEqual(['NHK', 'ＮＨＫ']);
  });

  it('breaks a createdAt tie by id so the chips do not swap places between renders', () => {
    const entries = [
      makeEntry({ id: 'a', source: 'first', createdAt: at(1) }),
      makeEntry({ id: 'b', source: 'second', createdAt: at(1) }),
    ];

    expect(recentSources(entries)).toEqual(['second', 'first']);
    expect(recentSources([...entries].reverse())).toEqual(['second', 'first']);
  });

  it('skips a source longer than the form accepts, which the save would refuse once tapped', () => {
    const tooLong = 'あ'.repeat(ENTRY_LIMITS.source + 1);
    const atLimit = 'い'.repeat(ENTRY_LIMITS.source);
    const entries = [
      makeEntry({ id: 'a', source: tooLong, createdAt: at(3) }),
      makeEntry({ id: 'b', source: atLimit, createdAt: at(2) }),
      makeEntry({ id: 'c', source: '朝会', createdAt: at(1) }),
    ];

    expect(recentSources(entries)).toEqual([atLimit, '朝会']);
  });

  it('fills the limit from older entries when a newer source is too long', () => {
    const entries = [
      makeEntry({ id: 'a', source: 'あ'.repeat(ENTRY_LIMITS.source + 1), createdAt: at(3) }),
      makeEntry({ id: 'b', source: '進撃の巨人', createdAt: at(2) }),
      makeEntry({ id: 'c', source: '朝会', createdAt: at(1) }),
    ];

    expect(recentSources(entries, 2)).toEqual(['進撃の巨人', '朝会']);
  });

  it('returns nothing for a non-positive limit', () => {
    expect(recentSources([makeEntry()], 0)).toEqual([]);
  });
});

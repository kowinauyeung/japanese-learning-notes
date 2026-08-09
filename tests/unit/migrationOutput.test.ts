import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JLPT_LEVELS, POLITENESS, POS, STYLES, WORD_ORIGINS } from '@/domain/entry';
import { isValidIsoDate, sanitizeEntry } from '@/lib/sanitize';

/**
 * `migration/output.json` is the artefact of record for the 67 hand-written
 * notes: the original markdown is not in this repository, so this file — not
 * `parse.mjs` — is what `upload.mjs` will actually push into Firestore.
 *
 * That makes a "re-run the parser and diff" golden test impossible and, more
 * usefully, makes a conformance test necessary. The upload script performs no
 * validation of its own, so anything in here that no longer matches the current
 * domain schema would be written to Firestore intact and only surface later as
 * a blank field in the app. A field renamed in `src/domain` without the golden
 * file being regenerated fails here instead.
 */

interface RawEntry extends Record<string, unknown> {
  id: string;
  headword: string;
  wordSets: unknown[];
}

// Resolved from this file rather than the working directory, so the test does
// not depend on vitest having been started from the repository root.
const OUTPUT = fileURLToPath(new URL('../../migration/output.json', import.meta.url));

const raw = JSON.parse(readFileSync(OUTPUT, 'utf8')) as RawEntry[];

/** Exactly what `upload.mjs` writes for one entry, minus the Timestamps. */
function asUploaded(entry: RawEntry): Record<string, unknown> {
  const { id, wordSets: _wordSets, ...rest } = entry;
  return {
    ...rest,
    ownerUid: 'uid-owner',
    migrationKey: id,
    publishedId: null,
    publishedVersion: 0,
    copiedFrom: null,
  };
}

/**
 * Collected rather than asserted one at a time, so a failure names every row.
 * `check` runs once per entry: calling it twice would let the condition and the
 * message it reports disagree the moment one of them stops being pure.
 */
const problems = (check: (entry: RawEntry) => string | null): string[] =>
  raw.flatMap((entry) => {
    const problem = check(entry);
    return problem ? [`${entry.id}: ${problem}`] : [];
  });

describe('migration/output.json — the notes as they will be uploaded', () => {
  it('holds all 67 notes', () => {
    expect(raw).toHaveLength(67);
  });

  /** `upload.mjs` keys its idempotency map on this, so a clash would overwrite. */
  it('has a unique id per note, which becomes migrationKey', () => {
    expect(new Set(raw.map((e) => e.id)).size).toBe(raw.length);
    expect(problems((e) => (e.id ? null : 'empty id'))).toEqual([]);
  });

  it('gives every note the two fields the app treats as required', () => {
    expect(problems((e) => (e.headword ? null : 'empty headword'))).toEqual([]);
    expect(problems((e) => (e.definition ? null : 'empty definition'))).toEqual([]);
  });
});

describe('migration/output.json — values inside the current schema', () => {
  it.each([
    ['jlpt', (e: RawEntry) => [e.jlpt], JLPT_LEVELS as readonly string[]],
    ['origin', (e: RawEntry) => [e.origin], ['', ...WORD_ORIGINS]],
    ['style', (e: RawEntry) => [e.style], ['', ...STYLES]],
    ['politeness', (e: RawEntry) => [e.politeness], ['', ...POLITENESS]],
    ['pos', (e: RawEntry) => e.pos as unknown[], POS as readonly string[]],
  ])('keeps every %s inside the enum the app allows', (field, read, allowed) => {
    expect(
      problems((entry) => {
        const bad = read(entry).filter((v) => !allowed.includes(v as string));
        return bad.length ? `${field} ${JSON.stringify(bad)} is not in the schema` : null;
      }),
    ).toEqual([]);
  });

  it('keeps every freq on the 1–5 scale that ★.repeat can render', () => {
    expect(
      problems((e) =>
        Number.isInteger(e.freq) && (e.freq as number) >= 1 && (e.freq as number) <= 5
          ? null
          : `freq ${String(e.freq)}`,
      ),
    ).toEqual([]);
  });

  /** The 2026-02-31 class of defect, checked against the data rather than a literal. */
  it('records every learnedOn as a real calendar day', () => {
    expect(
      problems((e) => (isValidIsoDate(e.learnedOn) ? null : `learnedOn ${String(e.learnedOn)}`)),
    ).toEqual([]);
  });

  it('records timestamps that parse', () => {
    expect(
      problems((e) =>
        [e.createdAt, e.updatedAt].every(
          (v) => typeof v === 'string' && !Number.isNaN(new Date(v).getTime()),
        )
          ? null
          : 'unparseable createdAt/updatedAt',
      ),
    ).toEqual([]);
  });

  /**
   * `upload.mjs` drops `wordSets` on the grounds that set membership moved onto
   * the set itself and the field was empty everywhere. Verifying the second half
   * of that claim is what makes the drop provably lossless.
   */
  it('carries no wordSets membership that dropping the field would lose', () => {
    expect(
      problems((e) => (e.wordSets.length === 0 ? null : `wordSets ${String(e.wordSets)}`)),
    ).toEqual([]);
  });
});

describe('migration/output.json — survives the read path unchanged', () => {
  /**
   * The end-to-end check: map each note exactly as `upload.mjs` does, then read
   * it back through the same sanitiser the app uses on every Firestore document.
   * Anything the sanitiser has to fall back on is content that would be silently
   * lost between the notes and the screen.
   */
  it('loses no content when written by upload.mjs and read back by sanitizeEntry', () => {
    const lost: string[] = [];

    for (const entry of raw) {
      const read = sanitizeEntry('auto-id', asUploaded(entry));
      const note = (field: string, expected: unknown, actual: unknown) => {
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          lost.push(
            `${entry.id}.${field}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`,
          );
        }
      };

      note('headword', entry.headword, read.headword);
      note('reading', entry.reading, read.reading);
      note('definition', entry.definition, read.definition);
      note('definitionSub', entry.definitionSub, read.definitionSub);
      note('citationForm', entry.citationForm, read.citationForm);
      note('source', entry.source, read.source);
      note('jlpt', entry.jlpt, read.jlpt);
      note('origin', entry.origin, read.origin);
      note('style', entry.style, read.style);
      note('politeness', entry.politeness, read.politeness);
      note('freq', entry.freq, read.freq);
      note('pos', entry.pos, read.pos);
      note('tags', entry.tags, read.tags);
      note('learnedOn', entry.learnedOn, read.learnedOn);
      note('pitchAccent', entry.pitchAccent, read.pitchAccent);
      note('posInfo', entry.posInfo, read.posInfo);
      note('context', entry.context, read.context);
      note('usage', entry.usage, read.usage);
      note('senses', entry.senses, read.senses);
      note('examples', entry.examples, read.examples);
      note('related', entry.related, read.related);
    }

    expect(lost).toEqual([]);
  });

  it('arrives owned, unpublished and not copied from anyone', () => {
    const read = sanitizeEntry('auto-id', asUploaded(raw[0]!));
    expect(read.ownerUid).toBe('uid-owner');
    expect(read.publishedId).toBeNull();
    expect(read.publishedVersion).toBe(0);
    expect(read.copiedFrom).toBeNull();
  });
});

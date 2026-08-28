import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SessionDialog } from '@/components/history/SessionDialog';
import type { Entry } from '@/domain/entry';
import type { PracticeSession } from '@/domain/practice';
import { VocabDialogProvider } from '@/lib/vocabDialog';
import { makeEntry } from '../fixtures/entry';
import { renderWithI18n as render } from '../fixtures/renderWithI18n';

/**
 * 練習履歴, opened out, after the notebook has moved on.
 *
 * A session is a record of a day that has already happened, and it used to stop
 * being one the moment a word was deleted: the row could only be drawn by
 * resolving its entry id against the notebook as it stands now, so deleting a
 * note silently removed it from every drill that had ever marked it wrong. The
 * score stayed; the words behind it changed. `MissedWord` copies the headword
 * in so the record reads the same either way.
 *
 * 苦手な語 is deliberately not like this and is tested in `WeakWords`: a word
 * the learner deleted is one they chose to stop studying, so it should leave
 * the review list. Only the log is immutable.
 */

const KIRIWAKE = makeEntry({ id: 'w1', headword: '切り分け', reading: 'きりわけ', jlpt: 'N2' });
const DELETED = { entryId: 'w9', headword: '曖昧', reading: 'あいまい' };

const session = (over: Partial<PracticeSession>): PracticeSession => ({
  id: 's1',
  mode: 'flashcard',
  filterLabel: '#仕事',
  total: 3,
  correct: 1,
  words: null,
  missed: [],
  startedAt: '2026-06-24T09:00:00.000Z',
  finishedAt: '2026-06-24T09:04:00.000Z',
  ...over,
});

const renderDialog = (over: Partial<PracticeSession>, entries: Entry[] = [KIRIWAKE]) =>
  render(
    <MemoryRouter>
      <VocabDialogProvider>
        <SessionDialog session={session(over)} entries={entries} onClose={() => {}} />
      </VocabDialogProvider>
    </MemoryRouter>,
  );

/** Only the wrong answers, as a session recorded before `words` existed. */
const missedOnly = (missed: PracticeSession['missed']) => ({ words: null, missed });

describe('SessionDialog — a session recorded before the run was kept', () => {
  it('still names the word, from the copy the session recorded', () => {
    renderDialog(missedOnly([DELETED]), []);

    expect(screen.getByText('曖昧')).toBeInTheDocument();
    expect(screen.getByText('（あいまい）')).toBeInTheDocument();
  });

  /**
   * Not an assertion about styling. The note is gone, so `/vocabulary/w9` is a
   * dead address and the dialog behind it opens on nothing — a link here is an
   * offer the app cannot keep.
   */
  it('does not offer a link to the note that no longer exists', () => {
    renderDialog(missedOnly([DELETED]), []);

    expect(screen.queryByRole('link', { name: /曖昧/ })).not.toBeInTheDocument();
  });

  /**
   * The marker sits in the slot every other row fills with a JLPT badge. That
   * placement is the point: without it the row is simply not clickable and has
   * a gap where the badge was, which reads as a rendering fault rather than as
   * a word the learner deleted themselves.
   */
  it('marks the row as deleted, so an unclickable row does not read as broken', () => {
    renderDialog(missedOnly([DELETED]), []);

    expect(screen.getByText('削除済み')).toBeInTheDocument();
  });

  it('leaves a word that still exists as a link to its note', () => {
    renderDialog(
      missedOnly([{ entryId: 'w1', headword: '切り分け', reading: 'きりわけ' }, DELETED]),
    );

    const link = screen.getByRole('link', { name: /切り分け/ });
    expect(link).toHaveAttribute('href', '/vocabulary/w1');
    expect(within(link).getByText('N2')).toBeInTheDocument();
  });

  /**
   * The snapshot is a fallback for a note that is gone, not an override of one
   * that is not: a headword corrected after the drill reads as corrected here
   * too, and the row keeps its live JLPT and its link.
   */
  it('shows the notebook, not the snapshot, for a word that was edited since', () => {
    renderDialog(missedOnly([{ entryId: 'w1', headword: '切分け', reading: 'きりわけ' }]));

    expect(screen.getByText('切り分け')).toBeInTheDocument();
    expect(screen.queryByText('切分け')).not.toBeInTheDocument();
  });

  /**
   * The only rows still dropped: a session recorded before the snapshot
   * existed, naming a word since deleted. There is nothing left to print, and
   * an empty line is worse than a shorter list.
   */
  it('drops a pre-snapshot id with no word behind it rather than drawing a blank row', () => {
    renderDialog(missedOnly([{ entryId: 'w9', headword: '', reading: '' }]), []);

    expect(screen.queryByText('削除済み')).not.toBeInTheDocument();
    expect(screen.getByText('ありません')).toBeInTheDocument();
  });
});

describe('SessionDialog — the run, printed in full', () => {
  const CHOUKOU = makeEntry({ id: 'w2', headword: '兆候', reading: 'ちょうこう', jlpt: 'N1' });

  const run = () =>
    renderDialog(
      {
        words: [
          { entryId: 'w2', headword: '兆候', reading: 'ちょうこう', correct: true },
          { entryId: 'w1', headword: '切り分け', reading: 'きりわけ', correct: false },
          { ...DELETED, correct: true },
        ],
        missed: [{ entryId: 'w1', headword: '切り分け', reading: 'きりわけ' }],
      },
      [KIRIWAKE, CHOUKOU],
    );

  /**
   * The order is the whole reason this list is separate from 間違えた語, which
   * is filtered and therefore says nothing about where in the drill a word came
   * up. The numbers are read back with the words because both together are what
   * makes a row placeable — 「3問目を間違えた」 needs the position printed.
   *
   * The column order is asserted too, and it is not decoration: the outcome is
   * last so the ○ and ✕ line up as one column to read down, and the JLPT badge
   * is absent so nothing sits between the word and that column.
   */
  it('lists every word dealt in deal order — number, word, then outcome', () => {
    run();
    const ordered = screen.getAllByRole('list').find((element) => element.tagName === 'OL');
    const rows = within(ordered!).getAllByRole('listitem');

    expect(rows.map((row) => row.textContent)).toEqual([
      '1兆候（ちょうこう）○',
      '2切り分け（きりわけ）✕',
      '3曖昧（あいまい）削除済み○',
    ]);
  });

  /**
   * The glyph is the only thing distinguishing a right answer from a wrong one
   * in this list, so it carries a label rather than being decorative — the
   * shape alone is not readable, and colour alone is not either.
   */
  it('says how each word was answered, in text and not by colour alone', () => {
    run();

    expect(screen.getAllByRole('img', { name: '正解' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: '不正解' })).toHaveLength(1);
  });

  /**
   * One list, not two. The run and a separate list of the wrong answers drew
   * every missed word twice, in a dialog read on a phone.
   */
  it('draws each word once, with no second list of the wrong answers', () => {
    run();
    expect(screen.getAllByText('切り分け')).toHaveLength(1);
    expect(screen.queryByText('間違えた語')).not.toBeInTheDocument();
  });

  it('counts each outcome on its own chip, which is where the missed count went', () => {
    run();

    expect(screen.getByRole('button', { name: 'すべて 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '正解 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '不正解 1' })).toBeInTheDocument();
  });

  it('opens on the whole run, so nothing it claims to show starts hidden', () => {
    run();
    expect(screen.getByRole('button', { name: 'すべて 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  /**
   * The position is the drill's, not the list's. Renumbering a filtered list
   * from 1 would say the learner got the first card wrong, when what happened
   * is that they got the second one wrong.
   */
  it('keeps each row numbered by where it came up in the drill, not in the filter', () => {
    run();
    fireEvent.click(screen.getByRole('button', { name: '不正解 1' }));

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['2切り分け（きりわけ）✕']);
  });

  /**
   * The note is gone, so `/vocabulary/w9` is a dead address and the dialog
   * behind it opens on nothing. A link here is an offer the app cannot keep.
   */
  it('leaves a deleted word unlinked in the run, and links the ones that remain', () => {
    run();

    expect(screen.getByRole('link', { name: /兆候/ })).toHaveAttribute('href', '/vocabulary/w2');
    expect(screen.queryByRole('link', { name: /曖昧/ })).not.toBeInTheDocument();
  });

  it('narrows to the correct answers without losing their order', () => {
    run();
    fireEvent.click(screen.getByRole('button', { name: '正解 2' }));

    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      '1兆候（ちょうこう）○',
      '3曖昧（あいまい）削除済み○',
    ]);
  });

  /**
   * Buttons with `aria-pressed`, not a tablist: this is one list that shrinks,
   * and announcing several panels would promise a structure that is not there.
   */
  it('offers the filter as pressed buttons rather than as tabs', () => {
    run();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '正誤で絞り込み' })).toBeInTheDocument();
  });

  it('says so plainly when a filter selects nothing', () => {
    renderDialog({
      words: [{ entryId: 'w1', headword: '切り分け', reading: 'きりわけ', correct: false }],
      missed: [{ entryId: 'w1', headword: '切り分け', reading: 'きりわけ' }],
    });
    fireEvent.click(screen.getByRole('button', { name: '正解 0' }));

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('ありません')).toBeInTheDocument();
  });

  /**
   * Null and empty are different claims. A session recorded before the run was
   * kept has only its wrong answers, and printing those under this heading
   * would say the learner got nothing right in a drill they scored 1/3 on.
   */
  it('leaves the section out entirely for a session that never recorded its run', () => {
    renderDialog(missedOnly([{ entryId: 'w1', headword: '切り分け', reading: 'きりわけ' }]));

    expect(screen.queryByText('出題した語')).not.toBeInTheDocument();
  });
});

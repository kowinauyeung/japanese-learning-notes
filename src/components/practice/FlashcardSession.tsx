import { useEffect, useState } from 'react';
import { Ruby } from '@/components/Ruby';
import type { Entry } from '@/domain/entry';
import { useI18n } from '@/i18n/context';
import { SessionHeader } from './SessionHeader';

const isEditable = (node: unknown): boolean => {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.isContentEditable ||
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLSelectElement
  );
};

/**
 * Whether the session still owns the keyboard.
 *
 * It does not while anything is layered over it, and the session cannot be
 * told about all of them: `AppLayout` renders ＋追加 and the mobile ＋ button
 * on **every** route, `/practice/:mode` included, so the add-word sheet can be
 * open over a running card without this component ever hearing about it. A
 * document-level listener then sees every keystroke typed into that form —
 * `→` scores a card the learner never saw, `Space` is swallowed by
 * `preventDefault` so it cannot be typed, and `Escape` closes the sheet *and*
 * asks to quit the drill. The first of those writes wrong data into 苦手な語.
 *
 * Two questions rather than a register of overlays, because a register is what
 * lets the next overlay forget: is focus somewhere text goes, and is a modal
 * dialog on screen. `Modal` marks itself `role="dialog"`, which is a semantic
 * contract rather than an implementation detail.
 */
const ownsKeyboard = (target: unknown): boolean =>
  !isEditable(target) &&
  !isEditable(document.activeElement) &&
  document.querySelector('[role="dialog"]') === null;

/** The hint printed on a button. Not shown for 中断, which has no shortcut. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="ml-2 rounded border border-current/25 px-1.5 py-0.5 text-[10px] font-normal opacity-70">
      {children}
    </kbd>
  );
}

/**
 * One card at a time: the word, then its meaning, then a self-assessment.
 *
 * The two answer buttons only appear after the flip, and that is the whole
 * mechanic — 「わかった」 recorded before the meaning is visible measures
 * confidence rather than recall, and 苦手な語 is built out of these answers.
 */
export function FlashcardSession({
  entry,
  index,
  total,
  keyboard = true,
  onAnswer,
  onQuit,
}: {
  entry: Entry;
  index: number;
  total: number;
  /**
   * False while a dialog is over the card. Without it, the Escape that closes
   * the quit confirmation is also the Escape that reopens it.
   */
  keyboard?: boolean;
  onAnswer: (correct: boolean) => void;
  onQuit: () => void;
}) {
  const { t } = useI18n();
  const [flipped, setFlipped] = useState(false);

  const answer = (correct: boolean) => {
    setFlipped(false);
    onAnswer(correct);
  };

  /**
   * Space turns the card, ← and → answer it, Escape leaves.
   *
   * Bound on the document rather than a focused element: there is nothing here
   * worth making the learner tab to first, and a drill answered from the
   * keyboard is the whole point of a flashcard.
   *
   * The arrows are ignored before the flip, exactly as the buttons are absent
   * before it. A shortcut that could answer a card whose meaning is still
   * hidden would quietly reintroduce the thing the flip gate exists to stop.
   *
   * Space, by contrast, turns the card *both* ways — the hint sits on 裏を見る
   * because that is the press that matters, but pressing it again hides the
   * meaning rather than doing nothing. That asymmetry with the arrows is
   * deliberate: re-hiding is harmless and occasionally wanted, whereas
   * answering early is not recoverable.
   */
  useEffect(() => {
    if (!keyboard) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // A held key repeats, and a repeated answer would tear through the queue.
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!ownsKeyboard(event.target)) return;

      if (event.key === 'Escape') {
        onQuit();
        return;
      }
      if (event.key === ' ') {
        // Space scrolls the page by default, which moves the card being read.
        event.preventDefault();
        setFlipped((current) => !current);
        return;
      }
      if (!flipped) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        setFlipped(false);
        onAnswer(event.key === 'ArrowRight');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [keyboard, flipped, onAnswer, onQuit]);

  const meanings = entry.senses.map((sense) => sense.description).filter(Boolean);
  const example = entry.senses.find((sense) => sense.example)?.example ?? entry.examples[0]?.ja;
  const exampleTranslation =
    entry.senses.find((sense) => sense.example)?.translation ?? entry.examples[0]?.translation;

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <SessionHeader title={t('practice.flashcard')} index={index} total={total} onQuit={onQuit} />

      <div className="min-h-64 min-w-0 space-y-5 overflow-hidden rounded-card bg-card p-6 text-center shadow-panel">
        <Ruby
          headword={entry.headword}
          reading={flipped ? entry.reading : ''}
          className="has-ruby block font-display text-4xl font-bold [overflow-wrap:anywhere]"
        />

        {flipped ? (
          <div className="space-y-4 text-left">
            <ul className="prose-cjk space-y-1 text-sm">
              {(meanings.length ? meanings : [entry.definition]).map((meaning, position) => (
                <li key={position} className="flex gap-2">
                  <span className="text-muted">・</span>
                  <span>{meaning}</span>
                </li>
              ))}
            </ul>
            {entry.definitionSub && <p className="text-sm text-muted">{entry.definitionSub}</p>}
            {example && (
              <div className="rounded-panel bg-bg-alt p-3">
                <p className="prose-cjk text-sm">{example}</p>
                {exampleTranslation && (
                  <p className="mt-1 text-xs text-muted">{exampleTranslation}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('practice.recallHint')}</p>
        )}
      </div>

      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => answer(false)}
            className="min-h-12 rounded-pill bg-danger-soft text-sm font-semibold text-danger"
          >
            {t('practice.again')}
            <Key>←</Key>
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            className="min-h-12 rounded-pill bg-accent text-sm font-semibold text-on-accent"
          >
            {t('practice.gotIt')}
            <Key>→</Key>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          {t('practice.reveal')}
          <Key>Space</Key>
        </button>
      )}
    </section>
  );
}

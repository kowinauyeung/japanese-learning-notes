import { useEffect, useState } from 'react';
import { Ruby } from '@/components/Ruby';
import type { Entry } from '@/domain/entry';
import { SessionHeader } from './SessionHeader';

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
   */
  useEffect(() => {
    if (!keyboard) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // A held key repeats, and a repeated answer would tear through the queue.
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

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
      <SessionHeader title="フラッシュカード" index={index} total={total} onQuit={onQuit} />

      <div className="min-h-64 space-y-5 rounded-card bg-card p-6 text-center shadow-panel">
        <Ruby
          headword={entry.headword}
          reading={flipped ? entry.reading : ''}
          className="has-ruby block font-display text-4xl font-bold"
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
          <p className="text-sm text-muted">意味を思い出してから裏を見てください</p>
        )}
      </div>

      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => answer(false)}
            className="min-h-12 rounded-pill bg-danger-soft text-sm font-semibold text-danger"
          >
            もう一度
            <Key>←</Key>
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            className="min-h-12 rounded-pill bg-accent text-sm font-semibold text-on-accent"
          >
            わかった
            <Key>→</Key>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          裏を見る
          <Key>Space</Key>
        </button>
      )}
    </section>
  );
}

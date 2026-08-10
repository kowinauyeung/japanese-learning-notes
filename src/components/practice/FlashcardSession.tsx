import { useState } from 'react';
import { Ruby } from '@/components/Ruby';
import type { Entry } from '@/domain/entry';
import { SessionHeader } from './SessionHeader';

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
  onAnswer,
  onQuit,
}: {
  entry: Entry;
  index: number;
  total: number;
  onAnswer: (correct: boolean) => void;
  onQuit: () => void;
}) {
  const [flipped, setFlipped] = useState(false);

  const answer = (correct: boolean) => {
    setFlipped(false);
    onAnswer(correct);
  };

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
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            className="min-h-12 rounded-pill bg-accent text-sm font-semibold text-on-accent"
          >
            わかった
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="min-h-12 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          裏を見る
        </button>
      )}
    </section>
  );
}

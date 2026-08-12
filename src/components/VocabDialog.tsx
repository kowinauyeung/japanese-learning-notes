import { Link } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { Ruby } from '@/components/Ruby';
import { useEntries } from '@/lib/entries';
import { useVocabDialog } from '@/lib/vocabDialog';

/**
 * A word, looked at without leaving the page that mentioned it.
 *
 * A peek, not the detail page: meaning, the senses and one example, and a way
 * through to everything else. Editing and deleting are deliberately absent —
 * they change what other screens are showing, and the page underneath this one
 * has no idea it happened.
 *
 * Read out of `EntriesProvider` rather than fetched, because every screen that
 * can open this already holds the whole notebook. A word that is not there is
 * one deleted in another tab, and the dialog says so rather than showing a
 * frame with nothing in it.
 */
export function VocabDialog() {
  const { openId, close } = useVocabDialog();
  const { entries } = useEntries();

  if (openId === null) return null;
  const entry = entries.find((item) => item.id === openId);

  if (!entry) {
    return (
      <Modal open title="単語" onClose={close}>
        <p className="py-6 text-center text-sm text-muted">単語が見つかりません</p>
      </Modal>
    );
  }

  const meanings = entry.senses.map((sense) => sense.description).filter(Boolean);
  const example = entry.senses.find((sense) => sense.example)?.example ?? entry.examples[0]?.ja;

  return (
    <Modal
      open
      title="単語"
      onClose={close}
      footer={
        <Link
          to={`/vocabulary/${entry.id}`}
          className="grid min-h-10 w-full place-items-center rounded-pill bg-accent text-sm font-semibold text-on-accent"
        >
          詳細を見る
        </Link>
      }
    >
      <div className="space-y-4">
        <div>
          <Ruby
            headword={entry.headword}
            reading={entry.reading}
            className="has-ruby block font-display text-3xl font-bold"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-pill bg-accent-soft px-2.5 py-1 font-semibold text-accent">
              {entry.jlpt}
            </span>
            {entry.pos.map((part) => (
              <span key={part} className="rounded-pill bg-bg-alt px-2.5 py-1 text-muted">
                {part}
              </span>
            ))}
            <span className="text-muted tabular-nums">{entry.learnedOn}</span>
          </div>
        </div>

        {(meanings.length > 0 || entry.definition) && (
          <ul className="prose-cjk space-y-1 text-sm">
            {(meanings.length ? meanings : [entry.definition]).map((meaning, position) => (
              <li key={position} className="flex gap-2">
                <span className="text-muted">・</span>
                <span>{meaning}</span>
              </li>
            ))}
          </ul>
        )}

        {example && <p className="prose-cjk rounded-panel bg-bg-alt p-3 text-sm">{example}</p>}

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <span key={tag} className="text-xs text-accent">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

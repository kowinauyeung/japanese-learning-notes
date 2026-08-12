import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { KeyValueTable, Section } from '@/components/detail/Section';
import { EntryFormModal } from '@/components/entry-form/EntryFormModal';
import { PitchAccent } from '@/components/PitchAccent';
import { Ruby } from '@/components/Ruby';
import { useEntries } from '@/lib/entries';

/** ①②③… for sense and example numbering, matching the notes. */
function circled(index: number): string {
  return index < 20 ? String.fromCharCode(0x2460 + index) : `${index + 1}`;
}

function stars(freq: number): string {
  return '★'.repeat(freq) + '☆'.repeat(Math.max(0, 5 - freq));
}

export function Component() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { entries, loading, error, refresh, repository } = useEntries();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * Navigate only once both the delete and the refresh have succeeded. If the
   * refresh fails the entry is gone from Firestore but still in the cached
   * list, so leaving the user on a stale detail page with an error beats
   * sending them to a Browse list that still shows the deleted word.
   */
  const confirmDelete = async (entryId: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await repository.remove(entryId);
      await refresh();
      void navigate('/vocabulary', { replace: true });
    } catch (cause) {
      console.error(cause);
      setDeleteError('削除できませんでした。もう一度お試しください。');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p className="py-16 text-center text-sm text-muted">読み込み中…</p>;
  if (error) return <p className="py-16 text-center text-sm text-danger">{error}</p>;

  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted">単語が見つかりません</p>
        <Link to="/vocabulary" className="mt-2 inline-block text-sm text-accent underline">
          単語一覧に戻る
        </Link>
      </div>
    );
  }

  const manifest = [
    { label: '品詞', value: entry.pos.join('／') },
    { label: 'JLPTレベル', value: entry.jlpt },
    { label: '語種', value: entry.origin },
    { label: '文体', value: entry.style },
    { label: '丁寧さ', value: entry.politeness },
    { label: '頻度', value: stars(entry.freq) },
    { label: '登録形', value: entry.citationForm },
  ].filter((row) => row.value);

  const usageRows = [
    { label: 'いつ使う', value: entry.usage.when },
    { label: '訳語で言うと', value: entry.usage.translation },
    { label: '注意点', value: entry.usage.caution },
  ].filter((row) => row.value);

  return (
    <article className="space-y-4">
      {/* Header */}
      <header className="rounded-card bg-card p-5 shadow-panel sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Ruby
              headword={entry.headword}
              reading={entry.reading}
              className="has-ruby block font-display text-[34px] font-bold sm:text-[40px]"
            />
            {entry.pitchAccent !== null && (
              <PitchAccent
                reading={entry.reading || entry.headword}
                pitchAccent={entry.pitchAccent}
                className="mt-2 block font-display text-lg"
              />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-pill bg-accent-soft px-2.5 py-1 font-semibold text-accent">
                {entry.jlpt}
              </span>
              {entry.pos.map((part) => (
                <span key={part} className="rounded-pill bg-bg-alt px-2.5 py-1 text-muted">
                  {part}
                </span>
              ))}
              <span className="text-accent" title={`頻度 ${entry.freq}/5`}>
                {stars(entry.freq)}
              </span>
              <span className="text-muted tabular-nums">{entry.learnedOn}</span>
            </div>
            {entry.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/vocabulary?tag=${encodeURIComponent(tag)}`}
                    className="text-xs text-accent"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-9 rounded-pill bg-bg-alt px-4 text-xs font-semibold text-ink"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-9 rounded-pill bg-danger-soft px-4 text-xs font-semibold text-danger"
            >
              削除
            </button>
          </div>
        </div>
      </header>

      <Section emoji="📋" title="MANIFEST">
        <KeyValueTable rows={manifest} />
      </Section>

      {entry.posInfo && (
        <Section emoji="🔧" title={entry.posInfo.title}>
          <KeyValueTable rows={entry.posInfo.rows} />
        </Section>
      )}

      {/* The sentence the word was met in comes before the dictionary meaning,
          matching the markdown notes: 23 of the 24 that record a context put it
          first. Reading the encounter before the definition is also the order
          the word was actually learned in. */}
      {entry.context.original && (
        <Section emoji="📌" title="この文での使われ方">
          <blockquote className="prose-cjk rounded-panel border-l-4 border-accent bg-bg-alt px-4 py-3 text-sm">
            {entry.context.original}
          </blockquote>
          {entry.context.ja && (
            <p className="prose-cjk mt-4 text-sm whitespace-pre-line">{entry.context.ja}</p>
          )}
          {entry.context.translation && (
            <p className="prose-cjk mt-3 text-sm whitespace-pre-line text-muted">
              {entry.context.translation}
            </p>
          )}
        </Section>
      )}

      {(entry.definition || entry.definitionSub) && (
        <Section emoji="📖" title="意味・説明">
          {entry.definition && (
            <p className="prose-cjk text-sm whitespace-pre-line">{entry.definition}</p>
          )}
          {entry.definitionSub && (
            <p className="prose-cjk mt-4 border-t border-line pt-4 text-sm whitespace-pre-line">
              {entry.definitionSub}
            </p>
          )}
        </Section>
      )}

      {entry.senses.length > 0 && (
        <Section emoji="🌐" title="文脈別の意味">
          <ol className="divide-y divide-line">
            {entry.senses.map((sense, index) => (
              <li key={index} className="py-4 first:pt-0 last:pb-0">
                <h3 className="text-sm font-semibold">
                  <span className="mr-1.5 text-accent">{circled(index)}</span>
                  {sense.label}
                </h3>
                {sense.description && <p className="prose-cjk mt-2 text-sm">{sense.description}</p>}
                {sense.example && (
                  <blockquote className="prose-cjk mt-3 border-l-2 border-line pl-3 text-sm">
                    {sense.example}
                    {sense.exampleGloss && (
                      <span className="block text-xs text-muted">
                        （意味：{sense.exampleGloss}）
                      </span>
                    )}
                  </blockquote>
                )}
                {sense.translation && <p className="prose-cjk mt-2 text-sm">{sense.translation}</p>}
                {sense.usage && (
                  <p className="prose-cjk mt-2 text-xs text-muted">使う場面：{sense.usage}</p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {entry.examples.length > 0 && (
        <Section emoji="📝" title="例文">
          <ol className="divide-y divide-line">
            {entry.examples.map((example, index) => (
              <li key={index} className="py-3 first:pt-0 last:pb-0">
                <p className="prose-cjk text-sm">
                  <span className="mr-1.5 text-accent">{circled(index)}</span>
                  {example.ja}
                </p>
                {example.translation && (
                  <p className="prose-cjk mt-1 pl-6 text-sm text-muted">{example.translation}</p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {usageRows.length > 0 && (
        <Section emoji="🗣️" title="使い方・ニュアンス">
          <KeyValueTable rows={usageRows} />
        </Section>
      )}

      {entry.related.length > 0 && (
        <Section emoji="🔗" title="関連語">
          <ul className="divide-y divide-line text-sm">
            {entry.related.map((related, index) => (
              <li key={index} className="py-2.5 first:pt-0 last:pb-0">
                <span className="font-display font-bold">{related.headword}</span>
                <span className="prose-cjk text-muted"> — {related.note}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {entry.source && <p className="px-1 text-xs text-muted">出處：{entry.source}</p>}

      <EntryFormModal open={editing} entry={entry} onClose={() => setEditing(false)} />

      <ConfirmDialog
        open={confirmingDelete}
        title="単語を削除"
        message={`「${entry.headword}」を削除しますか？\nこの操作は取り消せません。`}
        confirmLabel="削除する"
        busy={deleting}
        error={deleteError}
        onClose={() => {
          setConfirmingDelete(false);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete(entry.id)}
      />
    </article>
  );
}

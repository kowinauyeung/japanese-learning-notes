import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEntries } from '../lib/entries';
import { deleteEntry } from '../lib/entryWrite';
import { Ruby } from '../components/Ruby';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EntryFormModal } from '../components/entry-form/EntryFormModal';
import { KeyValueTable, Section } from '../components/detail/Section';

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
  const { entries, loading, error, refresh } = useEntries();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <p className="text-muted py-16 text-center text-sm">読み込み中…</p>;
  if (error) return <p className="text-danger py-16 text-center text-sm">{error}</p>;

  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted text-sm">単語が見つかりません</p>
        <Link to="/vocabulary" className="text-accent mt-2 inline-block text-sm underline">
          一覧に戻る
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
      <header className="rounded-card bg-card shadow-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Ruby
              headword={entry.headword}
              reading={entry.reading}
              className="font-display has-ruby block text-[34px] font-bold sm:text-[40px]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-pill bg-accent-soft text-accent px-2.5 py-1 font-semibold">
                {entry.jlpt}
              </span>
              {entry.pos.map((part) => (
                <span key={part} className="bg-bg-alt text-muted rounded-pill px-2.5 py-1">
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
                    className="text-accent text-xs"
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
              className="rounded-pill bg-bg-alt text-ink min-h-9 px-4 text-xs font-semibold"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-pill bg-danger-soft text-danger min-h-9 px-4 text-xs font-semibold"
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

      {/* The overall definition — present in every note, so it leads the meaning
          sections, in the same position it held in the markdown. */}
      {(entry.definition || entry.definitionSub) && (
        <Section emoji="📖" title="意味・説明">
          {entry.definition && (
            <p className="prose-cjk text-sm whitespace-pre-line">{entry.definition}</p>
          )}
          {entry.definitionSub && (
            <p className="prose-cjk border-line mt-4 border-t pt-4 text-sm whitespace-pre-line">
              {entry.definitionSub}
            </p>
          )}
        </Section>
      )}

      {entry.context.original && (
        <Section emoji="📌" title="この文での使われ方">
          <blockquote className="border-accent prose-cjk bg-bg-alt rounded-panel border-l-4 px-4 py-3 text-sm">
            {entry.context.original}
          </blockquote>
          {entry.context.ja && (
            <p className="prose-cjk mt-4 text-sm whitespace-pre-line">{entry.context.ja}</p>
          )}
          {entry.context.translation && (
            <p className="prose-cjk text-muted mt-3 text-sm whitespace-pre-line">
              {entry.context.translation}
            </p>
          )}
        </Section>
      )}

      {entry.senses.length > 0 && (
        <Section emoji="🌐" title="文脈別の意味">
          <ol className="divide-line divide-y">
            {entry.senses.map((sense, index) => (
              <li key={index} className="py-4 first:pt-0 last:pb-0">
                <h3 className="text-sm font-semibold">
                  <span className="text-accent mr-1.5">{circled(index)}</span>
                  {sense.label}
                </h3>
                {sense.description && (
                  <p className="prose-cjk mt-2 text-sm">{sense.description}</p>
                )}
                {sense.example && (
                  <blockquote className="border-line prose-cjk mt-3 border-l-2 pl-3 text-sm">
                    {sense.example}
                    {sense.exampleGloss && (
                      <span className="text-muted block text-xs">（意味：{sense.exampleGloss}）</span>
                    )}
                  </blockquote>
                )}
                {sense.translation && (
                  <p className="prose-cjk mt-2 text-sm">{sense.translation}</p>
                )}
                {sense.usage && (
                  <p className="text-muted prose-cjk mt-2 text-xs">使う場面：{sense.usage}</p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {entry.examples.length > 0 && (
        <Section emoji="📝" title="例文">
          <ol className="divide-line divide-y">
            {entry.examples.map((example, index) => (
              <li key={index} className="py-3 first:pt-0 last:pb-0">
                <p className="prose-cjk text-sm">
                  <span className="text-accent mr-1.5">{circled(index)}</span>
                  {example.ja}
                </p>
                {example.translation && (
                  <p className="prose-cjk text-muted mt-1 pl-6 text-sm">{example.translation}</p>
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
          <ul className="divide-line divide-y text-sm">
            {entry.related.map((related, index) => (
              <li key={index} className="py-2.5 first:pt-0 last:pb-0">
                <span className="font-display font-bold">{related.headword}</span>
                <span className="text-muted prose-cjk"> — {related.note}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {entry.source && (
        <p className="text-muted px-1 text-xs">出處：{entry.source}</p>
      )}

      <EntryFormModal open={editing} entry={entry} onClose={() => setEditing(false)} />

      <ConfirmDialog
        open={confirmingDelete}
        title="単語を削除"
        message={`「${entry.headword}」を削除しますか？\nこの操作は取り消せません。`}
        confirmLabel="削除する"
        busy={deleting}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setDeleting(true);
          void deleteEntry(entry.id)
            .then(refresh)
            .then(() => navigate('/vocabulary', { replace: true }))
            .finally(() => setDeleting(false));
        }}
      />
    </article>
  );
}

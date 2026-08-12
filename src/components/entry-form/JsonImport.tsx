import { useState } from 'react';
import type { EntryDraft } from '@/domain/entry';
import { buildPrompt, jsonToDraft, SCHEMA } from '@/lib/jsonImport';
import { Area, Field, inputClass } from './fields';

export function JsonImport({ onLoad }: { onLoad: (draft: EntryDraft) => void }) {
  const [word, setWord] = useState('');
  const [language, setLanguage] = useState('廣東語');
  const [original, setOriginal] = useState('');
  const [source, setSource] = useState('');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const context = { original, source };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(buildPrompt(word || '（単語）', language, context));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const load = () => {
    const { draft, error: failure } = jsonToDraft(raw, context);
    if (failure) return setError(failure);
    setError(null);
    if (draft) onLoad(draft);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="単語">
          <input
            type="text"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder="兆候"
            className={inputClass}
          />
        </Field>
        <Field label="訳の言語">
          <input
            type="text"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="出会った文" hint="任意">
        <Area
          value={original}
          onChange={setOriginal}
          rows={2}
          placeholder="あやしい兆候ではあるのだろうけれど"
        />
      </Field>

      <Field label="出處" hint="任意">
        <input
          type="text"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="会議、同僚、小説「海辺のカフカ」…"
          className={inputClass}
        />
      </Field>

      <p className="text-xs text-muted">
        文を入れると、その文脈での役割まで AI に書かせます。空のままでも構いません。
      </p>

      <button
        type="button"
        onClick={() => void copyPrompt()}
        className="min-h-10 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
      >
        {copied ? 'コピーしました' : 'プロンプトをコピー'}
      </button>

      <details className="rounded-panel border border-line p-3">
        <summary className="cursor-pointer text-xs text-muted">JSON スキーマを見る</summary>
        <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">{SCHEMA}</pre>
      </details>

      <Field label="AI の返した JSON を貼り付け">
        <Area value={raw} onChange={setRaw} rows={10} placeholder="{ …" />
      </Field>

      {/*
        Pinned to the bottom of the dialog's scroll area rather than sitting
        after the paste box, which put it below the fold on most screens: the
        textarea is ten rows and the schema block above it expands, so the one
        control the whole tab exists to reach was the one needing a scroll.

        The negative margins cancel the scroll container's own padding so the
        backdrop spans the full width and the JSON passes under it, not beside
        it. `bottom-0` sticks it above the modal footer, which is outside this
        element and already `shrink-0`.
      */}
      <div className="sticky bottom-0 -mx-5 -mb-4 space-y-2 bg-card px-5 pt-2 pb-4">
        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={load}
          disabled={!raw.trim()}
          className="min-h-10 w-full rounded-pill bg-bg-alt text-sm font-semibold text-ink disabled:opacity-50"
        >
          読み込む
        </button>
      </div>
    </div>
  );
}

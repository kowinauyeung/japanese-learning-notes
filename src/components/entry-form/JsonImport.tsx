import { useState } from 'react';
import type { EntryDraft } from '../../types/entry';
import { buildPrompt, jsonToDraft, SCHEMA } from '../../lib/jsonImport';
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

      <p className="text-muted text-xs">
        文を入れると、その文脈での役割まで AI に書かせます。空のままでも構いません。
      </p>

      <button
        type="button"
        onClick={() => void copyPrompt()}
        className="rounded-pill bg-accent text-on-accent min-h-10 w-full text-sm font-semibold"
      >
        {copied ? 'コピーしました' : 'プロンプトをコピー'}
      </button>

      <details className="rounded-panel border-line border p-3">
        <summary className="text-muted cursor-pointer text-xs">JSON スキーマを見る</summary>
        <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">{SCHEMA}</pre>
      </details>

      <Field label="AI の返した JSON を貼り付け">
        <Area value={raw} onChange={setRaw} rows={10} placeholder="{ …" />
      </Field>

      {error && <p className="text-danger text-sm">{error}</p>}

      <button
        type="button"
        onClick={load}
        disabled={!raw.trim()}
        className="rounded-pill bg-bg-alt text-ink min-h-10 w-full text-sm font-semibold disabled:opacity-50"
      >
        読み込む
      </button>
    </div>
  );
}

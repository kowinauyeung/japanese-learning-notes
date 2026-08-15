import { useState } from 'react';
import type { TranslationLanguage } from '@/domain/user';
import { buildPrompt, promptLanguageName, SCHEMA } from '@/lib/jsonImport';
import { Area, Field, inputClass } from './fields';

/**
 * Everything the tab collects. Held by the modal rather than here, because the
 * 読み込む button lives in the modal footer — see `EntryFormModal`.
 */
export interface JsonImportState {
  word: string;
  language: string;
  original: string;
  source: string;
  raw: string;
}

export const emptyJsonImport = (
  translationLanguage?: TranslationLanguage | null,
): JsonImportState => ({
  word: '',
  language: promptLanguageName(translationLanguage),
  original: '',
  source: '',
  raw: '',
});

export function JsonImport({
  value,
  onChange,
}: {
  value: JsonImportState;
  onChange: (next: JsonImportState) => void;
}) {
  // Purely local: nothing outside this component acts on it.
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof JsonImportState>(key: K, next: JsonImportState[K]) =>
    onChange({ ...value, [key]: next });

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(
      buildPrompt(value.word || '（単語）', value.language, {
        original: value.original,
        source: value.source,
      }),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="単語">
          <input
            type="text"
            value={value.word}
            onChange={(event) => set('word', event.target.value)}
            placeholder="兆候"
            className={inputClass}
          />
        </Field>
        <Field label="訳の言語">
          <input
            type="text"
            value={value.language}
            onChange={(event) => set('language', event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="出会った文" hint="任意">
        <Area
          value={value.original}
          onChange={(v) => set('original', v)}
          rows={2}
          placeholder="あやしい兆候ではあるのだろうけれど"
        />
      </Field>

      <Field label="出處" hint="任意">
        <input
          type="text"
          value={value.source}
          onChange={(event) => set('source', event.target.value)}
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
        <Area value={value.raw} onChange={(v) => set('raw', v)} rows={10} placeholder="{ …" />
      </Field>
    </div>
  );
}

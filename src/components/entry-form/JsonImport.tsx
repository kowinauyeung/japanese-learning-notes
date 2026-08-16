import { useState } from 'react';
import type { TranslationLanguage } from '@/domain/user';
import { useI18n } from '@/i18n/context';
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
  const { t } = useI18n();

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
        <Field label={t('import.word')}>
          <input
            type="text"
            value={value.word}
            onChange={(event) => set('word', event.target.value)}
            placeholder="兆候"
            className={inputClass}
          />
        </Field>
        <Field label={t('import.translationLanguage')}>
          <input
            type="text"
            value={value.language}
            onChange={(event) => set('language', event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('import.sentence')} hint={t('form.optional')}>
        <Area
          value={value.original}
          onChange={(v) => set('original', v)}
          rows={2}
          placeholder="あやしい兆候ではあるのだろうけれど"
        />
      </Field>

      <Field label={t('form.source')} hint={t('form.optional')}>
        <input
          type="text"
          value={value.source}
          onChange={(event) => set('source', event.target.value)}
          placeholder="会議、同僚、小説「海辺のカフカ」…"
          className={inputClass}
        />
      </Field>

      <p className="text-xs text-muted">{t('import.contextHint')}</p>

      <button
        type="button"
        onClick={() => void copyPrompt()}
        className="min-h-10 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
      >
        {copied ? t('import.copied') : t('import.copyPrompt')}
      </button>

      <details className="rounded-panel border border-line p-3">
        <summary className="cursor-pointer text-xs text-muted">{t('import.schema')}</summary>
        <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">{SCHEMA}</pre>
      </details>

      <Field label={t('import.pasteJson')}>
        <Area value={value.raw} onChange={(v) => set('raw', v)} rows={10} placeholder="{ …" />
      </Field>
    </div>
  );
}

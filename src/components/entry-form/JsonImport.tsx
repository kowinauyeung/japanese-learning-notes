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
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { t } = useI18n();

  const set = <K extends keyof JsonImportState>(key: K, next: JsonImportState[K]) =>
    onChange({ ...value, [key]: next });

  const prompt = buildPrompt(value.word || '（単語）', value.language, {
    original: value.original,
    source: value.source,
  });

  /*
    The clipboard is not something a phone reliably has. `navigator.clipboard`
    is undefined outside a secure context and in the in-app webviews a phone
    opens links in, and calling `writeText` on it throws synchronously — which
    React does not route to an error boundary. `writeText` itself rejects when
    the permission or the focus is missing, which is what iOS does to a copy it
    does not consider part of a tap. Neither ends anywhere the user can see: an
    error thrown in an event handler and a rejection nobody catches are both
    console warnings, and what is left on screen is a button that does nothing.

    The call is split rather than chained off `?.` because optional chaining
    short-circuits the whole rest of the chain, so the missing-clipboard case
    would evaluate to `undefined` and run neither handler — the same inert
    button with the throw removed.

    Failing has to put the prompt on screen, not just say that copying failed.
    Unlike the diagnostics box, the prompt is nowhere else in the form: the
    button is the only route to it, so a failure without the text is a dead end.
  */
  const copyPrompt = () => {
    const written = navigator.clipboard?.writeText(prompt);
    // Compared against undefined rather than tested for truthiness: a promise
    // is always truthy, and reading one as a boolean is a question nobody means
    // to ask.
    if (written === undefined) {
      setState('failed');
      return;
    }
    written
      .then(() => {
        setState('copied');
        setTimeout(() => setState('idle'), 1800);
      })
      .catch(() => setState('failed'));
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
        onClick={copyPrompt}
        className="min-h-10 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent"
      >
        {state === 'copied' ? t('import.copied') : t('import.copyPrompt')}
      </button>

      {state === 'failed' && (
        <div className="space-y-1">
          <p className="text-[11px] text-danger">{t('import.copyError')}</p>
          <Field label={t('import.promptLabel')}>
            <textarea
              readOnly
              value={prompt}
              rows={8}
              className={`${inputClass} prose-cjk py-2 leading-relaxed`}
            />
          </Field>
        </div>
      )}

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

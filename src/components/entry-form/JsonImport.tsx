import { useState } from 'react';
import { INPUT_LIMITS } from '@/domain/limits';
import { EntryDraftingError, type EntryDraftingFailure } from '@/domain/ports';
import type { TranslationLanguage } from '@/domain/user';
import { useI18n } from '@/i18n/context';
import type { MessageKey } from '@/i18n/messages';
import { entryDraftingPort } from '@/lib/backend';
import { buildPrompt, promptLanguageName, SCHEMA } from '@/lib/jsonImport';
import { Area, Field, inputClass } from './fields';

/**
 * What to say for each way the drafting can fail.
 *
 * Separated from the call because only one of the four is worth trying again,
 * and a single "something went wrong" would invite a retry on the three that
 * cannot succeed. `unavailable` in particular is permanent for this reader —
 * the API is not offered in every country — so its message points at the manual
 * prompt below rather than at the button they just pressed.
 */
const FAILURE_MESSAGE: Record<EntryDraftingFailure, MessageKey> = {
  unavailable: 'import.aiUnavailable',
  quota: 'import.aiQuota',
  blocked: 'import.aiBlocked',
  failed: 'import.aiFailed',
};

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
  onDrafted,
}: {
  value: JsonImportState;
  onChange: (next: JsonImportState) => void;
  /**
   * Hand the model's reply to the modal, which runs it through the same
   * `jsonToDraft` a pasted one goes through. Not `onChange`, because filling
   * the box and importing it are two things and this button does both.
   */
  onDrafted: (raw: string) => void;
}) {
  // Purely local: nothing outside this component acts on it.
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState<EntryDraftingFailure | null>(null);
  const [pasteFailed, setPasteFailed] = useState(false);
  const { t } = useI18n();

  /*
    Asked once, at render, rather than stored: `available()` is a synchronous
    read of whether the SDK initialised, and it does not change during a
    session. Hiding the button outright — rather than showing one that explains
    itself away when pressed — is deliberate. The manual prompt underneath is
    the route in either case, and a control that is present but never works is
    worse than one that was never offered.
  */
  const canDraft = entryDraftingPort.available();

  /*
    Reading the clipboard is a narrower capability than writing to it, and the
    same contexts that take `writeText` do not necessarily give `readText`: it
    is absent outside a secure context, absent in several of the in-app webviews
    a phone opens links in, and gated behind a permission the browser may put
    its own confirmation in front of. Probed as a function rather than for the
    property, because a webview stub can define the name and nothing else.

    Feature-detected for the same reason the drafting button is: the box below
    still takes an ordinary paste from the keyboard or a long press, so a reader
    without this loses a shortcut rather than the route. Permission is a
    separate matter and cannot be probed — it is refused at the tap, which is
    what `pasteFailed` is for.
  */
  const canPaste = typeof navigator.clipboard?.readText === 'function';

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
    React does not route to an error boundary. A clipboard that is present can
    throw there too, before it has returned a promise, which is why the call is
    wrapped rather than guarded by the optional chain alone. `writeText` itself
    rejects when the permission or the focus is missing, which is what iOS does
    to a copy it does not consider part of a tap. Neither ends anywhere the user
    can see: an error thrown in an event handler and a rejection nobody catches
    are both console warnings, and what is left on screen is a button that does
    nothing.

    The call is split rather than chained off `?.` because optional chaining
    short-circuits the whole rest of the chain, so the missing-clipboard case
    would evaluate to `undefined` and run neither handler — the same inert
    button with the throw removed.

    Failing has to put the prompt on screen, not just say that copying failed.
    Unlike the diagnostics box, the prompt is nowhere else in the form: the
    button is the only route to it, so a failure without the text is a dead end.
  */
  const copyPrompt = () => {
    let written: Promise<void> | undefined;
    try {
      written = navigator.clipboard?.writeText(prompt);
    } catch {
      // A clipboard that exists and still throws before it returns a promise:
      // a webview stub, or a browser raising NotAllowedError for a document it
      // does not consider focused. Nothing downstream ever runs, so the state
      // has to be set here or the button stays inert.
      setState('failed');
      return;
    }
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

  /*
    Overwrite rather than append: the box holds one JSON document, and appending
    to a non-empty one produces something that cannot parse — a failure whose
    message would be about JSON rather than about the paste that caused it.

    Imported in the same breath, like the drafting button, and through the same
    `onDrafted`. So a reply that does not parse is refused with exactly the
    words a pasted-and-then-imported one is refused with, and it stays in the
    box to be corrected. Nothing about the failure path is new here, which is
    the point.
  */
  const pasteJson = () => {
    setPasteFailed(false);
    let read: Promise<string> | undefined;
    try {
      read = navigator.clipboard?.readText();
    } catch {
      // Present and still throwing before it returns a promise — the same
      // webview and focus cases `copyPrompt` documents above, in the other
      // direction.
      setPasteFailed(true);
      return;
    }
    if (read === undefined) {
      setPasteFailed(true);
      return;
    }
    read
      .then((text) => {
        // An empty clipboard is not a failure of the button and must not be
        // reported as one; it would also wipe a box the reader had already
        // filled by hand.
        if (!text.trim()) return setPasteFailed(true);
        onChange({ ...value, raw: text });
        onDrafted(text);
      })
      .catch(() => setPasteFailed(true));
  };

  /*
    The model's reply is not inspected here. It goes to the modal verbatim and
    through `jsonToDraft`, which is the same function the paste box's reply goes
    through — so a malformed answer is refused with the same words whichever
    route it arrived by. A second parser here is exactly the thing that would
    let a bad reply through one door while the other refused it.

    The raw box is filled as well as imported. If the import fails on a field
    that is too long, the reply is then on screen to edit and retry, instead of
    having been discarded by the button that fetched it.
  */
  const generate = async () => {
    setAiError(null);
    setDrafting(true);
    try {
      const raw = await entryDraftingPort.draft(prompt);
      onChange({ ...value, raw });
      onDrafted(raw);
    } catch (cause) {
      setAiError(cause instanceof EntryDraftingError ? cause.reason : 'failed');
    } finally {
      // In `finally` rather than after the call: an error path that leaves this
      // true is a button that stays disabled for the rest of the session.
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('import.word')}>
          <input
            type="text"
            value={value.word}
            onChange={(event) => set('word', event.target.value)}
            maxLength={INPUT_LIMITS.importWord}
            placeholder="兆候"
            className={inputClass}
          />
        </Field>
        <Field label={t('import.translationLanguage')}>
          <input
            type="text"
            value={value.language}
            onChange={(event) => set('language', event.target.value)}
            maxLength={INPUT_LIMITS.importLanguage}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('import.sentence')} hint={t('form.optional')}>
        <Area
          value={value.original}
          onChange={(v) => set('original', v)}
          maxLength={INPUT_LIMITS.importOriginal}
          rows={2}
          placeholder="あやしい兆候ではあるのだろうけれど"
        />
      </Field>

      <Field label={t('form.source')} hint={t('form.optional')}>
        <input
          type="text"
          value={value.source}
          onChange={(event) => set('source', event.target.value)}
          maxLength={INPUT_LIMITS.importSource}
          placeholder="会議、同僚、小説「海辺のカフカ」…"
          className={inputClass}
        />
      </Field>

      <p className="text-xs text-muted">{t('import.contextHint')}</p>

      {canDraft && (
        <div className="space-y-2">
          <button
            type="button"
            // `void`, not the bare handler: `generate` is async, and React's
            // onClick wants void — a returned promise is one nothing awaits and
            // whose rejection would go nowhere. It cannot reject (the try/catch
            // is total), and this says so rather than relying on it.
            onClick={() => void generate()}
            disabled={drafting || !value.word.trim()}
            className="min-h-10 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {drafting ? t('import.generating') : t('import.generate')}
          </button>
          {/* Shown before the button is pressed as well as after, because it is
              a statement about what the button produces and the reader decides
              whether to press it. The same warning appears again beside the
              filled form, where the wrong reading is actually visible. */}
          <p className="text-[11px] text-muted">{t('import.aiDisclaimer')}</p>
          {aiError && <p className="text-[11px] text-danger">{t(FAILURE_MESSAGE[aiError])}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={copyPrompt}
        className={`min-h-10 w-full rounded-pill text-sm font-semibold ${
          canDraft ? 'border border-line text-ink' : 'bg-accent text-on-accent'
        }`}
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

      {/* Outside the `Field` below, not inside it. `Field` renders a <label>
          around its children, and a <label> names its first labelable
          descendant — so a button placed in there takes the label meant for the
          textarea, leaving one control misnamed and the other unnamed. Caught
          by the component test, which could not find the button by its own
          text. */}
      {canPaste && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={pasteJson}
            className="min-h-10 w-full rounded-pill border border-line text-sm font-semibold text-ink"
          >
            {t('import.paste')}
          </button>
          {pasteFailed && <p className="text-[11px] text-danger">{t('import.pasteError')}</p>}
        </div>
      )}

      <Field label={t('import.pasteJson')}>
        {/* The one box in the form with no `maxLength`. It is not an oversight
            and it is not laxer: `jsonToDraft` refuses a paste past
            `INPUT_LIMITS.jsonPaste` and names the size it received, which is
            the message the user needs. The attribute would pre-empt it by
            trimming the paste to exactly the limit, and a JSON document cut off
            mid-object does not parse — so the one thing that could not be said
            is the one thing that was wrong with it. */}
        <Area
          value={value.raw}
          onChange={(v) => set('raw', v)}
          maxLength="unbounded"
          // Four, not the ten it was. The box stopped being the place the JSON
          // arrives once the two buttons above could fill it, so its height was
          // paying for a paste most readers no longer perform by hand. Ten rows
          // also pushed the schema block and everything under it below the fold
          // on a phone. It still grows with its content and still accepts a
          // typed paste, which is what the fallback needs it for.
          rows={4}
          placeholder="{ …"
        />
      </Field>
    </div>
  );
}

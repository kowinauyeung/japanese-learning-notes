import type { EntryDraft, Pos } from '@/domain/entry';
import { JLPT_LEVELS, POLITENESS, POS, STYLES, WORD_ORIGINS } from '@/domain/entry';
import { ENTRY_LIMITS, TAG_INPUT_MAX } from '@/domain/limits';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { parseTags } from '@/lib/draft';
import { accentKana } from '@/lib/mora';
import { Area, Field, RepeatableList, Select, Text, inputClass } from './fields';
import { PitchAccentField } from './PitchAccentField';

export function EntryForm({
  draft,
  onChange,
}: {
  draft: EntryDraft;
  onChange: (next: EntryDraft) => void;
}) {
  const { t } = useI18n();
  const entryLabel = useEntryLabel();
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('form.headword')} hint={t('form.required')}>
          <Text
            value={draft.headword}
            onChange={(v) => set('headword', v)}
            maxLength={ENTRY_LIMITS.headword}
          />
        </Field>
        <Field label={t('form.reading')} hint={t('form.kana')}>
          <Text
            value={draft.reading}
            onChange={(v) => set('reading', v)}
            maxLength={ENTRY_LIMITS.reading}
          />
        </Field>
        <PitchAccentField
          kana={accentKana(draft.headword, draft.reading)}
          value={draft.pitchAccent}
          onChange={(v) => set('pitchAccent', v)}
        />
        <Field label={t('form.tags')} hint={t('form.tagsHint')}>
          <Text
            value={draft.tags.join(' ')}
            onChange={(v) => set('tags', parseTags(v))}
            maxLength={TAG_INPUT_MAX}
            placeholder={t('form.tagsPlaceholder')}
          />
        </Field>
        <Field label={t('form.learnedOn')}>
          <input
            type="date"
            value={draft.learnedOn}
            onChange={(event) => set('learnedOn', event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t('form.source')} hint={t('form.optional')}>
          <Text
            value={draft.source}
            onChange={(v) => set('source', v)}
            maxLength={ENTRY_LIMITS.source}
            placeholder={t('form.sourcePlaceholder')}
          />
        </Field>
        <Field label={t('form.citationForm')} hint={t('form.optional')}>
          <Text
            value={draft.citationForm}
            onChange={(v) => set('citationForm', v)}
            maxLength={ENTRY_LIMITS.citationForm}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('vocabulary.partOfSpeech')} hint={t('form.multiple')}>
          <select
            multiple
            size={5}
            value={draft.pos}
            onChange={(event) =>
              set(
                'pos',
                [...event.target.selectedOptions].map((o) => o.value as Pos),
              )
            }
            className={`${inputClass} min-h-28 py-1`}
          >
            {POS.map((part) => (
              <option key={part} value={part}>
                {entryLabel(part)}
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-3">
          <Field label={t('vocabulary.jlptLevel')}>
            <Select
              value={draft.jlpt}
              onChange={(v) => set('jlpt', (v || 'レベル外') as EntryDraft['jlpt'])}
              options={JLPT_LEVELS}
              formatOption={entryLabel}
              blank={t('form.outsideLevel')}
            />
          </Field>
          <Field label={t('vocabulary.origin')}>
            <Select
              value={draft.origin}
              onChange={(v) => set('origin', v as EntryDraft['origin'])}
              options={WORD_ORIGINS}
              formatOption={entryLabel}
              blank={t('form.unset')}
            />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label={t('vocabulary.style')}>
            <Select
              value={draft.style}
              onChange={(v) => set('style', v as EntryDraft['style'])}
              options={STYLES}
              formatOption={entryLabel}
              blank={t('form.unset')}
            />
          </Field>
          <Field label={t('vocabulary.politeness')}>
            <Select
              value={draft.politeness}
              onChange={(v) => set('politeness', v as EntryDraft['politeness'])}
              options={POLITENESS}
              formatOption={entryLabel}
              blank={t('form.unset')}
            />
          </Field>
        </div>
      </div>

      <Field label={t('form.frequency')}>
        <select
          value={draft.freq}
          onChange={(event) => set('freq', Number(event.target.value) as EntryDraft['freq'])}
          className={inputClass}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {'★'.repeat(value)}
              {'☆'.repeat(5 - value)}
            </option>
          ))}
        </select>
      </Field>

      <div className="space-y-3">
        <Field label={`📖 ${t('form.definition')}`} hint={t('form.required')}>
          <Area
            value={draft.definition}
            onChange={(v) => set('definition', v)}
            maxLength={ENTRY_LIMITS.definition}
            rows={4}
          />
        </Field>
        <Field label={`📖 ${t('form.additionalNotes')}`} hint={t('form.optional')}>
          <Area
            value={draft.definitionSub}
            onChange={(v) => set('definitionSub', v)}
            maxLength={ENTRY_LIMITS.definitionSub}
            rows={4}
          />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">📌 {t('form.context')}</legend>
        <Field label={t('form.originalSentence')}>
          <Area
            value={draft.context.original}
            onChange={(v) => set('context', { ...draft.context, original: v })}
            maxLength={ENTRY_LIMITS.context}
            rows={2}
          />
        </Field>
        <Field label={t('form.contextJapanese')}>
          <Area
            value={draft.context.ja}
            onChange={(v) => set('context', { ...draft.context, ja: v })}
            maxLength={ENTRY_LIMITS.context}
          />
        </Field>
        <Field label={t('form.contextTranslation')}>
          <Area
            value={draft.context.translation}
            onChange={(v) => set('context', { ...draft.context, translation: v })}
            maxLength={ENTRY_LIMITS.context}
          />
        </Field>
      </fieldset>

      <RepeatableList
        title={`🌐 ${t('form.senses')}`}
        items={draft.senses}
        max={ENTRY_LIMITS.senses.count}
        onChange={(senses) => set('senses', senses)}
        blank={() => ({
          label: '',
          description: '',
          example: '',
          exampleGloss: '',
          translation: '',
          usage: '',
        })}
        render={(sense, update) => (
          <div className="space-y-2">
            <Field label={t('form.label')}>
              <Text
                value={sense.label}
                onChange={(v) => update({ ...sense, label: v })}
                maxLength={ENTRY_LIMITS.senses.label}
              />
            </Field>
            <Field label={t('form.japaneseDescription')}>
              <Area
                value={sense.description}
                onChange={(v) => update({ ...sense, description: v })}
                maxLength={ENTRY_LIMITS.senses.description}
              />
            </Field>
            <Field label={t('form.example')}>
              <Text
                value={sense.example}
                onChange={(v) => update({ ...sense, example: v })}
                maxLength={ENTRY_LIMITS.senses.text}
              />
            </Field>
            <Field label={t('form.exampleMeaning')}>
              <Text
                value={sense.exampleGloss}
                onChange={(v) => update({ ...sense, exampleGloss: v })}
                maxLength={ENTRY_LIMITS.senses.text}
              />
            </Field>
            <Field label={t('form.translation')}>
              <Text
                value={sense.translation}
                onChange={(v) => update({ ...sense, translation: v })}
                maxLength={ENTRY_LIMITS.senses.text}
              />
            </Field>
            <Field label={t('form.usageSituation')}>
              <Text
                value={sense.usage}
                onChange={(v) => update({ ...sense, usage: v })}
                maxLength={ENTRY_LIMITS.senses.text}
              />
            </Field>
          </div>
        )}
      />

      <RepeatableList
        title={`📝 ${t('form.examples')}`}
        items={draft.examples}
        max={ENTRY_LIMITS.examples.count}
        onChange={(examples) => set('examples', examples)}
        blank={() => ({ ja: '', translation: '' })}
        render={(example, update) => (
          <div className="space-y-2">
            <Field label={t('form.japanese')}>
              <Text
                value={example.ja}
                onChange={(v) => update({ ...example, ja: v })}
                maxLength={ENTRY_LIMITS.examples.text}
              />
            </Field>
            <Field label={t('form.translation')}>
              <Text
                value={example.translation}
                onChange={(v) => update({ ...example, translation: v })}
                maxLength={ENTRY_LIMITS.examples.text}
              />
            </Field>
          </div>
        )}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">🗣️ {t('form.usage')}</legend>
        <Field label={t('form.whenUsed')}>
          <Area
            value={draft.usage.when}
            onChange={(v) => set('usage', { ...draft.usage, when: v })}
            maxLength={ENTRY_LIMITS.usage}
          />
        </Field>
        <Field label={t('form.translationEquivalent')}>
          <Area
            value={draft.usage.translation}
            onChange={(v) => set('usage', { ...draft.usage, translation: v })}
            maxLength={ENTRY_LIMITS.usage}
          />
        </Field>
        <Field label={t('form.caution')}>
          <Area
            value={draft.usage.caution}
            onChange={(v) => set('usage', { ...draft.usage, caution: v })}
            maxLength={ENTRY_LIMITS.usage}
          />
        </Field>
      </fieldset>

      <RepeatableList
        title={`🔗 ${t('form.related')}`}
        items={draft.related}
        max={ENTRY_LIMITS.related.count}
        onChange={(related) => set('related', related)}
        blank={() => ({ headword: '', note: '' })}
        render={(related, update) => (
          <div className="space-y-2">
            <Field label={t('form.word')}>
              <Text
                value={related.headword}
                onChange={(v) => update({ ...related, headword: v })}
                maxLength={ENTRY_LIMITS.related.headword}
              />
            </Field>
            <Field label={t('form.difference')}>
              <Text
                value={related.note}
                onChange={(v) => update({ ...related, note: v })}
                maxLength={ENTRY_LIMITS.related.note}
              />
            </Field>
          </div>
        )}
      />
    </div>
  );
}

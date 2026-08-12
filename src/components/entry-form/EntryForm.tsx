import type { EntryDraft, Pos } from '@/domain/entry';
import { JLPT_LEVELS, POLITENESS, POS, STYLES, WORD_ORIGINS } from '@/domain/entry';
import { parseTags } from '@/lib/draft';
import { Area, Field, RepeatableList, Select, Text, inputClass } from './fields';
import { PitchAccentField } from './PitchAccentField';

export function EntryForm({
  draft,
  onChange,
}: {
  draft: EntryDraft;
  onChange: (next: EntryDraft) => void;
}) {
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="見出し語" hint="必須">
          <Text value={draft.headword} onChange={(v) => set('headword', v)} />
        </Field>
        <Field label="読み方" hint="かな">
          <Text value={draft.reading} onChange={(v) => set('reading', v)} />
        </Field>
        {/* The accent describes the kana, which is the headword itself when
            there is no separate reading. */}
        <PitchAccentField
          reading={draft.reading || draft.headword}
          value={draft.pitchAccent}
          onChange={(v) => set('pitchAccent', v)}
        />
        <Field label="タグ" hint="スペース・カンマ区切り">
          <Text
            value={draft.tags.join(' ')}
            onChange={(v) => set('tags', parseTags(v))}
            placeholder="仕事 N2文法"
          />
        </Field>
        <Field label="学んだ日">
          <input
            type="date"
            value={draft.learnedOn}
            onChange={(event) => set('learnedOn', event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="出處" hint="任意">
          <Text
            value={draft.source}
            onChange={(v) => set('source', v)}
            placeholder="会議、同僚、小説…"
          />
        </Field>
        <Field label="登録形" hint="任意">
          <Text value={draft.citationForm} onChange={(v) => set('citationForm', v)} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="品詞" hint="複数可">
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
                {part}
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-3">
          <Field label="JLPTレベル">
            <Select
              value={draft.jlpt}
              onChange={(v) => set('jlpt', (v || 'レベル外') as EntryDraft['jlpt'])}
              options={JLPT_LEVELS}
              blank="レベル外"
            />
          </Field>
          <Field label="語種">
            <Select
              value={draft.origin}
              onChange={(v) => set('origin', v as EntryDraft['origin'])}
              options={WORD_ORIGINS}
              blank="未設定"
            />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="文体">
            <Select
              value={draft.style}
              onChange={(v) => set('style', v as EntryDraft['style'])}
              options={STYLES}
              blank="未設定"
            />
          </Field>
          <Field label="丁寧さ">
            <Select
              value={draft.politeness}
              onChange={(v) => set('politeness', v as EntryDraft['politeness'])}
              options={POLITENESS}
              blank="未設定"
            />
          </Field>
        </div>
      </div>

      <Field label="頻度">
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
        <Field label="📖 意味・説明" hint="必須">
          <Area value={draft.definition} onChange={(v) => set('definition', v)} rows={4} />
        </Field>
        <Field label="📖 補足" hint="任意">
          <Area value={draft.definitionSub} onChange={(v) => set('definitionSub', v)} rows={4} />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">📌 この文での使われ方</legend>
        <Field label="元の文">
          <Area
            value={draft.context.original}
            onChange={(v) => set('context', { ...draft.context, original: v })}
            rows={2}
          />
        </Field>
        <Field label="文中での役割（日本語）">
          <Area
            value={draft.context.ja}
            onChange={(v) => set('context', { ...draft.context, ja: v })}
          />
        </Field>
        <Field label="文中での役割（訳）">
          <Area
            value={draft.context.translation}
            onChange={(v) => set('context', { ...draft.context, translation: v })}
          />
        </Field>
      </fieldset>

      <RepeatableList
        title="🌐 文脈別の意味"
        items={draft.senses}
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
            <Field label="見出し">
              <Text value={sense.label} onChange={(v) => update({ ...sense, label: v })} />
            </Field>
            <Field label="日本語の説明">
              <Area
                value={sense.description}
                onChange={(v) => update({ ...sense, description: v })}
              />
            </Field>
            <Field label="例文">
              <Text value={sense.example} onChange={(v) => update({ ...sense, example: v })} />
            </Field>
            <Field label="例文の意味">
              <Text
                value={sense.exampleGloss}
                onChange={(v) => update({ ...sense, exampleGloss: v })}
              />
            </Field>
            <Field label="訳">
              <Text
                value={sense.translation}
                onChange={(v) => update({ ...sense, translation: v })}
              />
            </Field>
            <Field label="使う場面">
              <Text value={sense.usage} onChange={(v) => update({ ...sense, usage: v })} />
            </Field>
          </div>
        )}
      />

      <RepeatableList
        title="📝 例文"
        items={draft.examples}
        onChange={(examples) => set('examples', examples)}
        blank={() => ({ ja: '', translation: '' })}
        render={(example, update) => (
          <div className="space-y-2">
            <Field label="日本語">
              <Text value={example.ja} onChange={(v) => update({ ...example, ja: v })} />
            </Field>
            <Field label="訳">
              <Text
                value={example.translation}
                onChange={(v) => update({ ...example, translation: v })}
              />
            </Field>
          </div>
        )}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">🗣️ 使い方・ニュアンス</legend>
        <Field label="いつ使う">
          <Area
            value={draft.usage.when}
            onChange={(v) => set('usage', { ...draft.usage, when: v })}
          />
        </Field>
        <Field label="訳語で言うと">
          <Area
            value={draft.usage.translation}
            onChange={(v) => set('usage', { ...draft.usage, translation: v })}
          />
        </Field>
        <Field label="注意点">
          <Area
            value={draft.usage.caution}
            onChange={(v) => set('usage', { ...draft.usage, caution: v })}
          />
        </Field>
      </fieldset>

      <RepeatableList
        title="🔗 関連語"
        items={draft.related}
        onChange={(related) => set('related', related)}
        blank={() => ({ headword: '', note: '' })}
        render={(related, update) => (
          <div className="space-y-2">
            <Field label="語">
              <Text
                value={related.headword}
                onChange={(v) => update({ ...related, headword: v })}
              />
            </Field>
            <Field label="違い">
              <Text value={related.note} onChange={(v) => update({ ...related, note: v })} />
            </Field>
          </div>
        )}
      />
    </div>
  );
}

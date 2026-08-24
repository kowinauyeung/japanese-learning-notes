import { KeyValueTable, Section } from '@/components/detail/Section';
import type { SectionSurface } from '@/components/detail/Section';
import type { Entry } from '@/domain/entry';
import { useI18n } from '@/i18n/context';
import { useEntryLabel } from '@/i18n/useEntryLabel';
import { circled, stars } from '@/lib/entryFormat';

/**
 * Everything recorded about a word below its headword.
 *
 * One implementation, rendered by the detail page and by the dialog. It used to
 * exist only on the page, and the dialog showed a summary of it — one meaning,
 * one example, no context, no usage notes, no related words — so a word opened
 * from a list looked emptier than the same word opened by its address. The
 * dialog is a different amount of room, not a different amount of the note, so
 * the only thing it varies is `surface`.
 *
 * Every section is conditional on having something to say, which is why a
 * sparse entry does not render a column of empty headings.
 */
export function EntryBody({ entry, surface = 'card' }: { entry: Entry; surface?: SectionSurface }) {
  const { t } = useI18n();
  const entryLabel = useEntryLabel();

  const manifest = [
    { label: t('vocabulary.partOfSpeech'), value: entry.pos.map(entryLabel).join('／') },
    { label: t('vocabulary.jlptLevel'), value: entryLabel(entry.jlpt) },
    { label: t('vocabulary.origin'), value: entryLabel(entry.origin) },
    { label: t('vocabulary.style'), value: entryLabel(entry.style) },
    { label: t('vocabulary.politeness'), value: entryLabel(entry.politeness) },
    { label: t('vocabulary.frequency'), value: stars(entry.freq) },
    { label: t('vocabulary.citationForm'), value: entry.citationForm },
  ].filter((row) => row.value);

  const usageRows = [
    { label: t('vocabulary.whenUsed'), value: entry.usage.when },
    { label: t('vocabulary.translationEquivalent'), value: entry.usage.translation },
    { label: t('vocabulary.caution'), value: entry.usage.caution },
  ].filter((row) => row.value);

  return (
    <>
      <Section emoji="📋" title={t('vocabulary.manifest')} surface={surface}>
        <KeyValueTable rows={manifest} />
      </Section>

      {entry.posInfo && (
        <Section emoji="🔧" title={entry.posInfo.title} surface={surface}>
          <KeyValueTable rows={entry.posInfo.rows} />
        </Section>
      )}

      {/* The sentence the word was met in comes before the dictionary meaning,
          matching the markdown notes: 23 of the 24 that record a context put it
          first. Reading the encounter before the definition is also the order
          the word was actually learned in. */}
      {entry.context.original && (
        <Section emoji="📌" title={t('vocabulary.context')} surface={surface}>
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
        <Section emoji="📖" title={t('vocabulary.definition')} surface={surface}>
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
        <Section emoji="🌐" title={t('vocabulary.senses')} surface={surface}>
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
                        {t('vocabulary.gloss', { value: sense.exampleGloss })}
                      </span>
                    )}
                  </blockquote>
                )}
                {sense.translation && <p className="prose-cjk mt-2 text-sm">{sense.translation}</p>}
                {sense.usage && (
                  <p className="prose-cjk mt-2 text-xs text-muted">
                    {t('vocabulary.usageSituation', { value: sense.usage })}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {entry.examples.length > 0 && (
        <Section emoji="📝" title={t('vocabulary.examples')} surface={surface}>
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
        <Section emoji="🗣️" title={t('vocabulary.usage')} surface={surface}>
          <KeyValueTable rows={usageRows} />
        </Section>
      )}

      {entry.related.length > 0 && (
        <Section emoji="🔗" title={t('vocabulary.related')} surface={surface}>
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

      {entry.source && (
        <p className="px-1 text-xs text-muted">
          {t('vocabulary.sourceLine', { source: entry.source })}
        </p>
      )}
    </>
  );
}

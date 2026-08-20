import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/context';

/**
 * A 単語集 description, collapsed to ten lines with a control to open it.
 *
 * The header of this page carries the set's name, its count, its edit and
 * delete buttons and the whole member list below. A description written as an
 * essay pushes all of that off the screen, and there is nothing on the page to
 * say the list is still down there — so the reader concludes the set is empty.
 * Ten lines is far more than a normal description needs and short enough that
 * the list stays in view on a phone.
 *
 * The count lives in the `line-clamp-10` class and nowhere else. A constant
 * would have to be interpolated into the class name, which Tailwind cannot see
 * — the generated stylesheet comes from scanning the source for whole class
 * names, so `line-clamp-${n}` produces no rule at all and the clamp silently
 * does nothing.
 *
 * **The toggle appears only when there is something to reveal.** Rendering it
 * unconditionally puts a もっと見る under a one-line description, which does
 * nothing when pressed. Whether the text actually overflows is not knowable
 * from its length — it depends on the font, the width and the script, and CJK
 * wraps at nearly every character — so it is measured after layout rather than
 * guessed from the string.
 */
export function SetDescription({ description }: { description: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    /*
      `scrollHeight > clientHeight` is the measurement, and it is only valid
      while the clamp is applied — an expanded element has already grown to fit,
      so the two are equal and this would conclude there is nothing to show and
      remove the control the user just used to expand it. Hence the guard: once
      expanded, the previous answer stands.

      A ResizeObserver rather than a one-shot read, because the answer changes
      with the width: a description that needs eleven lines on a phone needs
      four on a laptop, and rotating the device is not a re-render.
    */
    if (expanded) return;
    const measure = () => setClipped(element.scrollHeight > element.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, description]);

  return (
    <div className="mt-2">
      <p ref={ref} className={`prose-cjk text-sm text-muted ${expanded ? '' : 'line-clamp-10'}`}>
        {description}
      </p>
      {(clipped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 text-xs text-accent underline"
        >
          {expanded ? t('wordSets.showLess') : t('wordSets.showMore')}
        </button>
      )}
    </div>
  );
}

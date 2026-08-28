import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/**
 * One shape for every form control, held in one place.
 *
 * Four screens each declared their own: the entry form at `min-h-10 px-3
 * text-sm`, Browse's filter panel and the practice setup at `min-h-9 px-2
 * text-xs`, Settings at `min-h-11 px-4 text-sm`. The same 品詞 dropdown was
 * therefore three different heights and three different paddings depending on
 * which screen the reader opened it from, and inside a single screen the boxes
 * still did not line up — see `controlClass` for why that is not the same
 * problem.
 *
 * The box without a height, for the controls that grow: a textarea, a list box.
 */
export const controlBoxClass =
  'w-full min-w-0 rounded-panel border border-line bg-bg px-3 text-sm text-ink placeholder:text-muted disabled:opacity-50';

/**
 * The box with a height, and the height is fixed rather than a minimum.
 *
 * `min-height` is a floor the browser may exceed, and a native widget takes it
 * as advice. Measured on the practice setup at 390px with a coarse pointer,
 * where all four controls asked for `min-h-9`: WebKit drew the two dropdowns
 * at 25px and the two date fields beside them at 36px — one row, two heights,
 * and neither of them the 36 that was asked for. Chromium put all four at 36,
 * which is why nothing on a laptop ever showed it.
 *
 * Stating the height outright is what makes a row a row. 44px because that is
 * the touch target every one of these has to be, and because the
 * coarse-pointer rule in `index.css` raises their text to 16px inside it.
 * `tests/e2e/visual.spec.ts` holds both engines to it.
 */
export const controlClass = `${controlBoxClass} h-11`;

/** The growing variant, for prose. `rows` still sets the resting height. */
export const textAreaClass = `${controlBoxClass} py-2.5`;

/**
 * A `<select>` that keeps the shape above, indicator included.
 *
 * `appearance-none` is not cosmetic here. The native indicator is part of the
 * widget's intrinsic size — Safari draws two stacked chevrons and reserves the
 * width for them, Chrome a single triangle — so a select styled to the same
 * box as the input beside it still computes wider content and taller lines
 * than that input. Turning the widget off and drawing the chevron ourselves is
 * what leaves one box shape under our control on both engines.
 *
 * `pr-9` is the space the chevron sits in: without it a long option value runs
 * underneath the arrow.
 */
export function SelectControl({
  className = '',
  children,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <span className="relative block">
      <select {...select} className={`${controlClass} appearance-none pr-9 ${className}`}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 8"
        className="pointer-events-none absolute top-1/2 right-3 h-2 w-3 -translate-y-1/2 text-muted"
      >
        <path
          d="M1 1.5 6 6.5 11 1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * A date field, boxed by a wrapper rather than by itself.
 *
 * The wrapper is the whole point. A native date widget carries an intrinsic
 * size that iOS Safari will use in place of the width it was given, and when
 * it did, the field grew past the card around it — while both desktop engines,
 * and therefore every test here, showed a control the right width. A `<span>`
 * has no widget in it and no opinion about how wide it should be, so the box
 * the layout depends on is one nothing can push. `overflow-hidden` is what
 * holds the input to it; the value is left-aligned, so anything clipped is the
 * space after the date rather than the date.
 *
 * The inner input keeps `text-sm` because the coarse-pointer rule in
 * `index.css` selects on it by name to hold form text at 16px, which is what
 * stops iOS zooming the page on focus.
 */
export function DateControl({ className = '', ...input }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={`${controlClass} flex items-center overflow-hidden ${className}`}>
      <input
        type="date"
        {...input}
        className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-ink outline-none"
      />
    </span>
  );
}

/**
 * A chip: a pill-shaped toggle, for the filters and the multi-valued fields
 * where a dropdown would hide what is selected.
 *
 * `max-w-full` with `truncate` rather than letting it wrap: a word set named by
 * 400 characters otherwise turned one chip into a six-line paragraph with a
 * rounded border, which reads as broken layout rather than as something
 * pressable, and pushed every chip after it off the fold. Not `max-w-[N]`: a
 * name of ordinary length must still show in full, and the only width worth
 * capping against is whatever the row has left.
 *
 * `pointer-coarse` is where the touch target is stated. `px-3 py-1` around
 * 12px text measures 24px tall — fine under a mouse, and a bit over half the
 * 44px every other control in this app is now sized to. The variant rather
 * than a flat size because these rows are long: 18 parts of speech at 44px
 * each is a wall of buttons on a desktop that has no touch problem to solve.
 */
export function chipClass(active: boolean): string {
  return `max-w-full truncate rounded-pill px-3 py-1 text-xs font-medium transition pointer-coarse:min-h-11 pointer-coarse:px-4 ${
    active ? 'bg-accent text-on-accent' : 'bg-bg-alt text-muted hover:text-ink'
  }`;
}

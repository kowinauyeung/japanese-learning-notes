import type { ReactNode, SelectHTMLAttributes } from 'react';

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

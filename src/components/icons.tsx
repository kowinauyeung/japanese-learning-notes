import type { ReactNode } from 'react';

/**
 * The app's icons, drawn here rather than pulled from a set.
 *
 * Four line drawings at one weight is less than the smallest icon package
 * would add to a bundle this app precaches, and they can follow the theme:
 * every stroke is `currentColor`, so a tab colours its icon and its label with
 * the same class.
 *
 * `aria-hidden` on all of them, without exception. Each one sits beside its own
 * visible label in the tab bar, and the reader of a screen reader wants that
 * label once.
 */
function Icon({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${className}`}
    >
      {children}
    </svg>
  );
}

export function HomeIcon() {
  return (
    <Icon>
      <path d="M3.5 10.7 12 3.8l8.5 6.9" />
      <path d="M5.8 9.6V19a1.2 1.2 0 0 0 1.2 1.2h10a1.2 1.2 0 0 0 1.2-1.2V9.6" />
    </Icon>
  );
}

/** The notebook itself: an open book, which is what the logo is built from. */
export function BookIcon() {
  return (
    <Icon>
      <path d="M12 6.4C10.6 5.2 8.7 4.6 6 4.6a1 1 0 0 0-1 1v11.6a1 1 0 0 0 1 1c2.7 0 4.6.6 6 1.8" />
      <path d="M12 6.4c1.4-1.2 3.3-1.8 6-1.8a1 1 0 0 1 1 1v11.6a1 1 0 0 1-1 1c-2.7 0-4.6.6-6 1.8" />
      <path d="M12 6.4V20" />
    </Icon>
  );
}

/** Practice: a card being turned over, which both drills are a form of. */
export function PracticeIcon() {
  return (
    <Icon>
      <rect x="3.2" y="6.4" width="12.6" height="13.4" rx="2.2" />
      <path d="M8.2 3.9h9.4a2.2 2.2 0 0 1 2.2 2.2v9.6" />
      <path d="M6.8 12.8h5.4M6.8 16h3.4" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon className="h-5 w-5">
      <path d="M12 5.5v13M5.5 12h13" />
    </Icon>
  );
}

/**
 * The drafting mark, and the only icon here that is not the bottom navigation's.
 *
 * **A sparkle rather than a vendor's mark, and that is a decision.** Which
 * assistant answers is not fixed at build time — the model name is a Remote
 * Config value and the backend is one argument to `getAI` — and the manual
 * prompt beside the button exists so a reader can use their own assistant
 * instead. A logo would name one of them on a control that is about all of
 * them, and would go stale the day either changes.
 *
 * **Filled rather than stroked**, unlike the four above. Those are drawn at
 * 24px in the tab bar; this one sits inside a tab label and a button at roughly
 * 14, where an outline of two nested shapes closes up into a smudge. It is
 * still `currentColor`, which is what the rule above is actually about: it
 * takes the colour of the text it sits in, in either theme.
 *
 * **`aria-hidden`, like the rest, and here that needs a second control.** On the
 * button, the visible text already says AI in every locale. On the tab it does
 * not — 簡単 is about the form, not about the model — so the tab carries the
 * word in a visually hidden span. An icon is not something a screen reader can
 * be asked to interpret, and a mark nobody can hear is a feature they are not
 * told about.
 */
export function SparkleIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11 2q.9 6.2 7 7.6-6.1 1.4-7 7.6-.9-6.2-7-7.6 6.1-1.4 7-7.6Z" />
      <path d="M18.4 14.6q.4 2.7 3.6 3.4-3.2.7-3.6 3.4-.4-2.7-3.6-3.4 3.2-.7 3.6-3.4Z" />
    </svg>
  );
}

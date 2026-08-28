import type { ReactNode } from 'react';

/**
 * The bottom navigation's icons, drawn here rather than pulled from a set.
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

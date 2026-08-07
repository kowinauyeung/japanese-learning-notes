import { useId } from 'react';

/**
 * The 語彙庭 mark: an open book with a sprout rising from the spine.
 *
 * The two page halves are separate shapes with a real gap between them rather
 * than a drawn crease, so the mark sits on any surface — header, card, dark
 * theme — without needing to know the colour behind it. Leaves run the same
 * deep-to-bright gradient as the source logo, built from the two theme tokens
 * so the mark follows light and dark on its own.
 */
export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  // Two marks render at once on some routes, and duplicate gradient ids would
  // make the second one reference the first one's definition.
  const gradientId = useId();

  return (
    <svg viewBox="0 0 48 48" className={className} role="presentation" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="24" y1="22" x2="24" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--c-accent)" />
          <stop offset="1" stopColor="var(--c-sprout)" />
        </linearGradient>
      </defs>

      <g fill="var(--c-accent)">
        <path d="M23 40.5C18.5 35.2 12.5 33.2 7 33.2Q5.5 33.2 5.5 31.7L5.5 16.3Q5.5 14.8 7 14.8C13 15 19 17.4 23 21.8Z" />
        <path d="M25 40.5C29.5 35.2 35.5 33.2 41 33.2Q42.5 33.2 42.5 31.7L42.5 16.3Q42.5 14.8 41 14.8C35 15 29 17.4 25 21.8Z" />
      </g>

      <path
        d="M24 31.5C24 25 24 19 24 13.5"
        fill="none"
        stroke="var(--c-sprout)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g fill={`url(#${gradientId})`}>
        <path d="M24 20.5C15.5 19.5 10.5 14 11.5 5.5C20 7 24 12.5 24 20.5Z" />
        <path d="M24 21C29.5 20 33.8 16 34 8.8C28.5 10.2 24.8 14.5 24 21Z" />
      </g>
    </svg>
  );
}

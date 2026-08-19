import { useState } from 'react';
import { providerPhotoUrl } from '@/lib/avatar';

interface AvatarProps {
  /** Raw `photoUrl` off the session. Empty when the provider supplied none. */
  photoUrl: string | null | undefined;
  /** Drawn instead of the picture, and whenever the picture cannot be shown. */
  initial: string;
  alt: string;
  /** Size and placement. The shape and the fallback colours are fixed here. */
  className?: string;
}

/**
 * The user's face, or the letter that stands in for it.
 *
 * The letter is the fallback rather than the default: a provider photo is
 * recognisable at a glance in a way an initial is not. But it is a URL to
 * somebody else's server, so both ways of not having one are handled — none
 * supplied, and one supplied that does not load.
 */
export function Avatar({ photoUrl, initial, alt, className = '' }: AvatarProps) {
  const src = providerPhotoUrl(photoUrl);
  // Keyed by URL rather than a bare boolean, so a session change to a different
  // account is not born already failed by the previous account's dead photo.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  if (src && src !== brokenSrc) {
    return (
      <img
        src={src}
        alt={alt}
        // Google's avatar host answers 403 to a request carrying our origin as
        // its referrer, and there is nothing on that host to authenticate to.
        referrerPolicy="no-referrer"
        onError={() => setBrokenSrc(src)}
        className={`block rounded-pill bg-bg-alt object-cover ${className}`}
      />
    );
  }

  return (
    <div
      // Not an image role and not labelled: the letter is a decoration derived
      // from the display name, which is already on the page as text.
      aria-hidden="true"
      className={`grid place-items-center rounded-pill bg-accent font-bold text-on-accent ${className}`}
    >
      {initial}
    </div>
  );
}

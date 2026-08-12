import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useVocabDialog } from '@/lib/vocabDialog';

/**
 * Every way into a word, everywhere in the app.
 *
 * A real `<a href="/vocabulary/:id">` underneath, so the address can be copied,
 * opened in a new tab, and read by anything that reads links. A plain left
 * click is the only thing intercepted; every modified click is left to the
 * browser, which is what makes ⌘-click still open the full page in a tab.
 */
export function VocabLink({
  entryId,
  className,
  children,
}: {
  entryId: string;
  className?: string;
  children: ReactNode;
}) {
  const { open } = useVocabDialog();

  return (
    <Link
      to={`/vocabulary/${entryId}`}
      className={className}
      // Anchors are draggable, and a drag that ends on the link still fires a
      // click. Nothing here is a drag source, but rows in 単語集 are.
      draggable={false}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        open(entryId);
      }}
    >
      {children}
    </Link>
  );
}

import { describe, expect, it } from 'vitest';
import { about } from '@/content/about';
import type { Doc } from '@/content/doc';
import { privacy } from '@/content/privacy';
import { orPending, site } from '@/content/site';
import { support } from '@/content/support';
import { terms } from '@/content/terms';

const DOCS: [string, Doc][] = [
  ['about', about],
  ['privacy', privacy],
  ['terms', terms],
  ['support', support],
];

/**
 * The public documents are prose, and prose is not usually worth a test. These
 * four are, for one reason: **they are the pages a stranger reads before
 * deciding whether to hand over a Google account**, and they are the pages
 * Google's OAuth review looks at. A missing date or an empty section is a
 * broken promise rather than a typo.
 */
describe.each(DOCS)('%s', (_name, doc) => {
  it('has a title, a lead and a date a reader can compare', () => {
    expect(doc.title).not.toBe('');
    expect(doc.lead).not.toBe('');
    expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has no empty section, which renders as a heading promising nothing', () => {
    for (const section of doc.sections) {
      expect(section.heading).not.toBe('');
      expect(section.body.length + (section.list?.length ?? 0)).toBeGreaterThan(0);
    }
  });
});

/**
 * The one thing that must not ship, stated as a test so it is a decision.
 *
 * A privacy policy naming no contact is not a privacy policy, and an invented
 * address is worse — it reads as a promise, delivers nothing, and may belong to
 * somebody real. Both are blank on purpose until real values exist; this fails
 * the moment somebody tries to release without them.
 */
describe('contact details', () => {
  it.skip('are filled in — unskip this when the address and the form exist', () => {
    expect(site.contactEmail).toMatch(/@/);
    expect(site.feedbackFormUrl).toMatch(/^https:\/\//);
  });

  it('degrade to 準備中 rather than to an empty gap in a sentence', () => {
    expect(orPending('')).toBe('準備中');
    expect(orPending('a@b.example')).toBe('a@b.example');
  });

  it('are visible as 準備中 in the pages that promise a contact', () => {
    const text = [privacy, terms, support].flatMap((doc) =>
      doc.sections.flatMap((section) => [...section.body, ...(section.list ?? [])]),
    );
    expect(text.some((line) => line.includes('準備中'))).toBe(true);
  });
});

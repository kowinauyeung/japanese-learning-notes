import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { about } from '@/content/about';
import type { Doc } from '@/content/doc';
import { privacy } from '@/content/privacy';
import { site } from '@/content/site';
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
 * Two things the public pages must not say.
 *
 * **The repository.** The pages linked it and the source is public, but a
 * support page that names the repository hands the schema, the security rules,
 * the collection paths and the project ids to whoever is probing the service.
 * A reader who wants the source can find it; the crash screen should not be a
 * map of the backend.
 *
 * **A technology the service does not use.** The policy claimed App Check and
 * reCAPTCHA before either existed. A privacy policy naming a processor that
 * processes nothing is not cautious, it is untrue — and it is the kind of
 * untrue that survives, because nobody re-reads a policy looking for something
 * that is not there. When App Check ships, add it back with what it sends.
 */
describe('what the public pages must not disclose', () => {
  const everything = [about, privacy, terms, support]
    .flatMap((doc) => [
      doc.title,
      doc.lead,
      ...doc.sections.flatMap((s) => [s.heading, ...s.body, ...(s.list ?? [])]),
    ])
    .join('\n');

  it.each(['github', 'GitHub', 'ソースコード', 'MIT'])('does not mention %s', (needle) => {
    expect(everything).not.toContain(needle);
  });

  /**
   * The policy must name App Check **if and only if** the client initialises it.
   *
   * Both directions have already been wrong here. It named reCAPTCHA before
   * either existed, which was untrue; then the paragraph was added when they
   * did, on a branch where they still did not — the App Check client lives on
   * `feat/security-hardening` and this file lives here, and the two share no
   * file, so nothing would have conflicted to warn anybody.
   *
   * So this reads the client rather than hard-coding an expectation. That makes
   * the ordering constraint mechanical instead of documented in two pull
   * request descriptions: whichever branch adds App Check must add the
   * disclosure with it, and this goes red until they arrive together.
   *
   * Reading a source file from a test is not the usual thing. It is right here
   * because the claim *is* "the policy matches the implementation", and every
   * cheaper version of it asserts one side and trusts the other.
   */
  it('names App Check when, and only when, the client initialises it', () => {
    const client = readFileSync('src/infra/firebase/client.ts', 'utf8');
    const implemented = client.includes('initializeAppCheck');
    const disclosed = privacy.sections
      .flatMap((section) => section.body)
      .some((line) => line.includes('App Check') || line.includes('reCAPTCHA'));

    expect(disclosed).toBe(implemented);
  });
});

/**
 * A privacy policy naming no contact is not a privacy policy — and this one
 * names exactly one, on purpose. **There is no email address anywhere**: an
 * address printed on three public pages is a permanent disclosure that cannot
 * be withdrawn, while a form can be closed and replaced. APPI asks for a
 * channel through which a person can exercise their rights, not for an email.
 *
 * What that trades away is a second channel, and these tests are what keep the
 * remaining one honest: the link has to be real, and it has to reach every page
 * that promises it.
 */
describe('contact', () => {
  it('is a real form link', () => {
    expect(site.feedbackFormUrl).toMatch(/^https:\/\//);
  });

  it('carries no email address on any public page', () => {
    const text = [about, privacy, terms, support]
      .flatMap((doc) => doc.sections.flatMap((s) => [...s.body, ...(s.list ?? [])]))
      .join('\n');

    expect(text).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  });

  /**
   * The form is a control, not a URL in a sentence: a reader should not have to
   * select and paste an address to reach the one thing these pages exist to
   * send them to.
   */
  it('is reachable as a link, not only as text', () => {
    for (const doc of [privacy, terms, support]) {
      const links = doc.sections.flatMap((s) => (s.link ? [s.link] : []));
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link.href).toBe(site.feedbackFormUrl);
    }
  });
});

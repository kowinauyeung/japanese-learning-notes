import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  emptyJsonImport,
  JsonImport,
  type JsonImportState,
} from '@/components/entry-form/JsonImport';
import { buildPrompt } from '@/lib/jsonImport';
import { renderWithI18n as render } from '../helpers/renderWithI18n';

const withClipboard = (clipboard: unknown) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  withClipboard(undefined);
  delete (window as { __GOITEI_E2E__?: unknown }).__GOITEI_E2E__;
});

/** The seed the aliased `backend.e2e` port reads, installed per test. */
const seedDrafting = (entryDrafting: 'unavailable' | 'quota' | 'blocked' | 'failed') => {
  (window as { __GOITEI_E2E__?: unknown }).__GOITEI_E2E__ = { entryDrafting };
};

const FAILED = 'コピーできませんでした。下のプロンプトを選択してコピーしてください。';

function Harness({
  initial,
  onDrafted = () => {},
}: {
  initial: JsonImportState;
  onDrafted?: (raw: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return <JsonImport value={value} onChange={setValue} onDrafted={onDrafted} />;
}

describe('JsonImport — translation language preference', () => {
  it('shows the saved translation language as the initial editable value', () => {
    render(<Harness initial={emptyJsonImport('yue-Hant')} />);

    expect(screen.getByRole('textbox', { name: '訳の言語' })).toHaveValue('廣東話');
  });

  it('keeps a manual language override in the prompt instead of restoring the saved default', async () => {
    let copied = '';
    withClipboard({
      writeText: (text: string) => {
        copied = text;
        return Promise.resolve();
      },
    });
    render(<Harness initial={emptyJsonImport('en')} />);

    fireEvent.change(screen.getByRole('textbox', { name: '訳の言語' }), {
      target: { value: '廣東話' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'プロンプトをコピー' }));

    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();
    expect(copied).toContain('廣東話');
    expect(copied).not.toContain('Englishで書いてください');
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });
});

/**
 * The prompt exists nowhere else on the screen, so a copy that fails silently
 * leaves the user with no way to reach the text at all — the button is the only
 * route to it.
 *
 * `navigator.clipboard` is undefined outside a secure context and in the in-app
 * webviews a phone opens links in, and calling `writeText` on it throws
 * synchronously. React does not route a throw in an event handler to an error
 * boundary, and the rejection of a promise nobody awaits is a console warning,
 * so either way what the user sees is a button that does nothing.
 */
describe('JsonImport — copying the prompt when the clipboard is unavailable', () => {
  const typeWord = () =>
    fireEvent.change(screen.getByRole('textbox', { name: '単語' }), {
      target: { value: '兆候' },
    });

  const clickCopy = () =>
    fireEvent.click(screen.getByRole('button', { name: 'プロンプトをコピー' }));

  it('offers the prompt for manual copying when there is no clipboard, as in a phone in-app webview', () => {
    withClipboard(undefined);
    render(<Harness initial={emptyJsonImport('ja')} />);

    typeWord();
    clickCopy();

    expect(screen.getByText(FAILED)).toBeInTheDocument();
    // The whole prompt, not a truncated preview: what is on screen has to be
    // the thing the clipboard would have been given.
    expect(screen.getByRole('textbox', { name: 'プロンプト' })).toHaveValue(
      buildPrompt('兆候', '日本語', { original: '', source: '' }),
    );
    // Absence, because the two messages contradict each other: a button still
    // reading コピーしました tells the user the prompt is on their clipboard while
    // the fallback below tells them to copy it by hand, and the one they believe
    // is the one that leaves them with nothing pasted.
    expect(screen.queryByRole('button', { name: 'コピーしました' })).not.toBeInTheDocument();
  });

  it('offers the prompt for manual copying when writeText throws synchronously, which an in-app webview stub does', () => {
    withClipboard({
      writeText: () => {
        throw new DOMException('Document is not focused', 'NotAllowedError');
      },
    });
    render(<Harness initial={emptyJsonImport('ja')} />);

    typeWord();
    clickCopy();

    expect(screen.getByText(FAILED)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'プロンプト' })).toHaveValue(
      buildPrompt('兆候', '日本語', { original: '', source: '' }),
    );
  });

  it('offers the prompt for manual copying when writeText rejects, which a denied permission does', async () => {
    withClipboard({ writeText: () => Promise.reject(new Error('NotAllowedError')) });
    render(<Harness initial={emptyJsonImport('ja')} />);

    typeWord();
    clickCopy();

    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'プロンプト' })).toHaveValue(
      buildPrompt('兆候', '日本語', { original: '', source: '' }),
    );
  });
});

/**
 * The paste box is the one field in this form with no `maxLength`, and it has
 * to stay that way.
 *
 * This reads as an assertion about an attribute and is not one. `jsonToDraft`
 * refuses a paste past `INPUT_LIMITS.jsonPaste` and says how large it was, and
 * the browser applies `maxlength` to a paste by *inserting the first n
 * characters* — so with the attribute present the oversized branch is dead
 * code, the value handed to the parser is a JSON document cut off mid-object,
 * and what the user is told is that their JSON does not parse. The one fact
 * they need, that it was simply too big, is the one that can no longer be said.
 *
 * jsdom will not reproduce that: `maxlength` constrains user editing, and
 * setting `value` from a test is not user editing. The attribute's presence is
 * what the browser acts on, so the attribute is what this checks.
 */
describe('JsonImport — the paste box', () => {
  it('does not cap the pasted JSON, which would truncate it out of the size check', () => {
    render(<Harness initial={emptyJsonImport('ja')} />);

    const paste = screen.getByRole('textbox', { name: 'AI の返した JSON を貼り付け' });
    expect(paste).not.toHaveAttribute('maxlength');
  });

  /** The fields beside it are bounded, so the absence above is a decision. */
  it('still caps the short fields the user types by hand', () => {
    render(<Harness initial={emptyJsonImport('ja')} />);

    expect(screen.getByRole('textbox', { name: '訳の言語' })).toHaveAttribute('maxlength');
  });
});

/*
  The drafting port here is the one `backend.e2e.ts` supplies — vitest.config.ts
  aliases `@/lib/backend` for this project exactly as `--mode e2e` does for the
  browser build. It answers from the prompt rather than from a model, which is
  what makes the first assertion below about *this* word instead of about a
  fixture that would pass for any of them.
*/
describe('JsonImport — drafting with AI', () => {
  it('hands the model reply to the importer verbatim instead of parsing it here', async () => {
    // A second parser in the component is the defect this guards: it would let
    // a malformed reply through the AI route while the paste box refused it.
    let drafted = '';
    render(
      <Harness
        initial={{ ...emptyJsonImport('yue-Hant'), word: '兆候' }}
        onDrafted={(raw) => {
          drafted = raw;
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'AIで作成' }));
    await waitFor(() => expect(drafted).not.toBe(''));

    // Still fenced, and still the word that was asked about: the component
    // passes the reply on untouched, and `jsonToDraft` is the only thing that
    // strips the fence.
    expect(drafted).toContain('```json');
    expect(drafted).toContain('兆候');
  });

  it('shows the inaccuracy warning without waiting for a result to exist', () => {
    // The warning is a condition on shipping the feature at all, not a detail:
    // a wrong reading or pitch accent from a model is learned as fact. Asserted
    // before the button is pressed because that is when the reader decides.
    render(<Harness initial={{ ...emptyJsonImport('yue-Hant'), word: '兆候' }} />);

    expect(
      screen.getByText(
        'AIが書いた内容なので誤りが含まれることがあります。保存する前に読み・アクセント・レベルを確認してください。',
      ),
    ).toBeInTheDocument();
  });

  it('refuses to ask about nothing, which would prompt for （単語）', () => {
    // `buildPrompt` substitutes （単語） for an empty word so the prompt stays
    // readable to copy. Sent to a model that placeholder is a real request for
    // a word that does not exist, and it is billed like any other.
    render(<Harness initial={emptyJsonImport('yue-Hant')} />);

    expect(screen.getByRole('button', { name: 'AIで作成' })).toBeDisabled();
  });
});

/*
  That a reply which does not parse is refused, and refused by name, is settled
  in tests/unit/jsonImport.test.ts over `jsonToDraft` itself — four cases there,
  in milliseconds. The button below hands its text to that same function, so
  none of this re-checks it. What is only observable here is the button: whether
  it appears at all, what it does with what it read, and whether a refusal is
  visible or silent.
*/
describe('JsonImport — pasting from the clipboard', () => {
  it('overwrites the box and imports, rather than appending to what is there', async () => {
    // Appending would produce two JSON documents in one box, which cannot
    // parse — and the message would then be about JSON rather than about the
    // paste that broke it.
    let imported = '';
    withClipboard({ readText: () => Promise.resolve('{"headword":"兆候"}') });
    render(
      <Harness
        initial={{ ...emptyJsonImport('yue-Hant'), raw: '{"headword":"古い"}' }}
        onDrafted={(raw) => {
          imported = raw;
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'クリップボードから貼り付け' }));
    await waitFor(() => expect(imported).not.toBe(''));

    // The box is the assertion that catches an append, not `imported`: what is
    // handed to the importer is the clipboard text either way, so appending to
    // `raw` and passing the new text on would leave this passing while the box
    // held two JSON documents. Checked by reverting the overwrite and watching
    // it stay green — which is why the box is read here at all.
    expect(screen.getByRole('textbox', { name: 'AI の返した JSON を貼り付け' })).toHaveValue(
      '{"headword":"兆候"}',
    );
    expect(imported).toBe('{"headword":"兆候"}');
  });

  it('is absent where the clipboard cannot be read, instead of failing on the tap', () => {
    // `readText` is a narrower capability than `writeText`: it is missing
    // outside a secure context and in the webviews a phone opens links in. The
    // box below still takes a typed or long-pressed paste, so what is lost is a
    // shortcut — but a button that could never work is worse than no button.
    withClipboard({ writeText: () => Promise.resolve() });
    render(<Harness initial={emptyJsonImport('yue-Hant')} />);

    expect(
      screen.queryByRole('button', { name: 'クリップボードから貼り付け' }),
    ).not.toBeInTheDocument();
  });

  it('says a refused clipboard was refused, which is the defect #59 fixed the other way', () => {
    // A permission the reader denies rejects the promise. Unhandled, that is a
    // console warning and a button that did nothing — the exact shape of the
    // copy-side bug fixed in #59, in the opposite direction.
    withClipboard({ readText: () => Promise.reject(new Error('denied')) });
    render(<Harness initial={emptyJsonImport('yue-Hant')} />);

    fireEvent.click(screen.getByRole('button', { name: 'クリップボードから貼り付け' }));

    return waitFor(() =>
      expect(screen.getByText(/クリップボードを読み取れませんでした/)).toBeInTheDocument(),
    );
  });
});

describe('JsonImport — when drafting cannot work again', () => {
  it('keeps the reason on screen after the button that caused it has gone', async () => {
    /*
      A retired model, a project with the API switched off and a country where
      it is not offered all fail on the first call and never succeed after it,
      so the port stops reporting itself available and the button goes. Rendered
      inside that same condition — which it was — the explanation went with it,
      in the same paint: a control that vanished and nothing saying why.

      This is the shape `gemini-2.5-flash`'s retirement arrived in, and the
      reason the block outlives the button it contains.
    */
    seedDrafting('unavailable');
    render(<Harness initial={{ ...emptyJsonImport('yue-Hant'), word: '兆候' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'AIで作成' }));

    await waitFor(() =>
      expect(screen.getByText(/ここではAI作成を利用できません/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'AIで作成' })).not.toBeInTheDocument();
  });

  it('offers a retry for a spent allowance, which is not the same as a dead one', async () => {
    // `quota` returns tomorrow, so the button stays. Asserted beside the case
    // above because the two used to be indistinguishable on screen.
    seedDrafting('quota');
    render(<Harness initial={{ ...emptyJsonImport('yue-Hant'), word: '兆候' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'AIで作成' }));

    await waitFor(() => expect(screen.getByText(/本日のAI利用回数の上限/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'AIで作成' })).toBeInTheDocument();
  });
});

describe('JsonImport — edits made while a request is in flight', () => {
  it('does not let a slow clipboard read revert what was typed after it started', async () => {
    /*
      Both asynchronous handlers resumed after an await and wrote
      `{ ...value, raw }` — `value` as captured when the button was pressed. A
      browser may put its own paste confirmation in front of `readText` and sit
      there for seconds, so anything typed in the meantime was silently reverted
      by the reply. The clipboard path is the reachable one; `generate` had the
      same defect and now locks its fields as well.
    */
    let release!: (text: string) => void;
    withClipboard({
      readText: () => new Promise<string>((resolve) => (release = resolve)),
    });
    render(<Harness initial={emptyJsonImport('yue-Hant')} />);

    fireEvent.click(screen.getByRole('button', { name: 'クリップボードから貼り付け' }));
    fireEvent.change(screen.getByRole('textbox', { name: '単語' }), {
      target: { value: '古い' },
    });
    release('{"headword":"兆候"}');

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'AI の返した JSON を貼り付け' })).toHaveValue(
        '{"headword":"兆候"}',
      ),
    );
    // The word typed during the wait survived the reply.
    expect(screen.getByRole('textbox', { name: '単語' })).toHaveValue('古い');
  });
});

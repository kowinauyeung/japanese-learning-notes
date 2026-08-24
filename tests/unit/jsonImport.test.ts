import { describe, expect, it } from 'vitest';
import { INPUT_LIMITS } from '@/domain/limits';
import { buildPrompt, jsonToDraft, promptLanguageName, SCHEMA } from '@/lib/jsonImport';

/**
 * The import box takes JSON an assistant wrote somewhere else and a human
 * pasted in. Neither step is reliable: assistants fence or unfence the output
 * whatever the prompt asks, invent enum values, paraphrase the sentence they
 * were handed, and reach the box through a clipboard that rewrites its quotes. All of that has to become either a saveable draft or a
 * message the user can act on — never a thrown error inside the form.
 */

const minimal = { headword: '兆候', definition: '何かが起こる前ぶれ。' };

describe('jsonToDraft — parsing', () => {
  it('accepts a bare JSON object', () => {
    const { draft, error } = jsonToDraft(JSON.stringify(minimal));
    expect(error).toBeUndefined();
    expect(draft?.headword).toBe('兆候');
  });

  it.each([
    ['```json fence', '```json\n{"headword":"兆候","definition":"前ぶれ"}\n```'],
    ['bare ``` fence', '```\n{"headword":"兆候","definition":"前ぶれ"}\n```'],
    [
      'fence with surrounding blank lines',
      '\n\n```json\n{"headword":"兆候","definition":"前ぶれ"}\n```\n\n',
    ],
  ])('strips a %s, which the prompt asks for and an assistant may omit', (_case, raw) => {
    expect(jsonToDraft(raw).draft?.headword).toBe('兆候');
  });

  it.each(['', 'not json at all', '{"headword": }', '{headword: "兆候"}', '{"a":1'])(
    'reports unparseable input rather than throwing, for %o',
    (raw) => {
      const { draft, error } = jsonToDraft(raw);
      expect(draft).toBeUndefined();
      expect(error).toBe('JSON として解析できませんでした。');
    },
  );

  it.each(['[]', '[{"headword":"兆候"}]', '"兆候"', '42', 'null'])(
    'rejects the valid JSON %o that is not an object',
    (raw) => {
      expect(jsonToDraft(raw).error).toBe('JSON オブジェクトではありません。');
    },
  );
});

/**
 * The accent arrives through the paste box like everything else, and an
 * assistant asked for a number will sometimes send `"2"`, `2.5` or a sentence.
 * Coercion happens in `sanitizeDraft`; what this checks is that the import path
 * reaches it at all, rather than dropping a field the prompt now asks for.
 */
/**
 * Copying an assistant's answer out of a phone app is not a byte-for-byte
 * transfer. The same reply copied from a browser arrives with U+0022, and
 * copied from an iOS app arrives with U+201C and U+201D, because the app hands
 * over the typographically substituted prose rather than the source. `JSON.parse`
 * accepts only U+0022, so the paste is refused for a reason that has nothing to
 * do with whether the note is any good — and the user has no way to see why.
 */
describe('jsonToDraft — quotes an iOS app substituted on the way to the clipboard', () => {
  it('parses a note whose delimiters are curly quotes, which is what an iOS copy produces', () => {
    const raw = `{
“headword”: “最終日”,
“reading”: “さいしゅうび”,
“pos”: [“名詞”],
“definition”: “ある期間・行事・予定などの最後にあたる日。”
}`;

    const { draft, error } = jsonToDraft(raw);

    expect(error).toBeUndefined();
    expect(draft?.headword).toBe('最終日');
    expect(draft?.reading).toBe('さいしゅうび');
    expect(draft?.pos).toEqual(['名詞']);
  });

  /**
   * Only the quotes acting as delimiters are rewritten. A curly quote inside a
   * value is already legal JSON, and rewriting it would end the string early —
   * turning a note that merely failed to parse into one that parses as
   * something else, or splits a definition in half.
   */
  it('leaves curly quotes inside a value alone while repairing the delimiters', () => {
    const raw = '{“headword”:“兆候”,“definition”:“いわゆる“前ぶれ”のこと。”}';

    const { draft, error } = jsonToDraft(raw);

    expect(error).toBeUndefined();
    expect(draft?.definition).toBe('いわゆる“前ぶれ”のこと。');
  });

  it('parses a curly-quoted note still wrapped in the code fence the prompt asks for', () => {
    const raw = '```json\n{“headword”:“兆候”,“definition”:“前ぶれ”}\n```';

    expect(jsonToDraft(raw).draft?.headword).toBe('兆候');
  });

  /**
   * The repair runs only after an ordinary parse has already failed, so input
   * that was valid to begin with never reaches it. A definition quoting
   * dialogue keeps the punctuation the assistant chose.
   */
  it('does not touch a well-formed note whose value contains curly quotes', () => {
    const raw = JSON.stringify({ ...minimal, definition: '“やばい”という語の説明。' });

    expect(jsonToDraft(raw).draft?.definition).toBe('“やばい”という語の説明。');
  });

  /**
   * The repair must know which quote opened the string it is standing in. This
   * value is delimited by straight quotes, so the ” inside it is ordinary text.
   * Reading it as a delimiter does not fail the parse — it succeeds, drops the
   * character, and imports a definition the user never wrote. A refusal the
   * user can see is the only acceptable outcome; a silent edit is not.
   */
  it('refuses a straight-quoted value holding a curly quote, rather than importing it with the quote deleted', () => {
    const raw = '{"headword":"兆候","definition":"末尾の引用 ”, "source":"x"}';

    const { draft, error } = jsonToDraft(raw);

    expect(draft).toBeUndefined();
    expect(error).toBe('JSON として解析できませんでした。');
  });

  /**
   * Nested curly quotes that could close the value in more than one place are
   * not guessable. Splitting the value at the wrong one would move half of a
   * definition into a field of its own, which sanitisation then discards — an
   * import that looks like it worked and is missing the second half.
   */
  it('refuses nested curly quotes it cannot place, rather than splitting the value into another field', () => {
    const raw = '{“headword”:“x”,“definition”:“A, “B”: “C””}';

    const { draft, error } = jsonToDraft(raw);

    expect(draft).toBeUndefined();
    expect(error).toBe('JSON として解析できませんでした。');
  });

  /**
   * An escaped quote is content, not the end of the string. Treating it as a
   * delimiter would put the repair back outside the value halfway through it,
   * where the rest of the sentence reads as structure.
   */
  it('does not end a value at an escaped quote, which would resume repairing inside the sentence', () => {
    const raw = '{“headword”:“兆候”,“definition”:“\\"前ぶれ\\" のこと。”}';

    const { draft, error } = jsonToDraft(raw);

    expect(error).toBeUndefined();
    expect(draft?.definition).toBe('"前ぶれ" のこと。');
  });

  it('still reports input that curly quotes were not the problem with', () => {
    expect(jsonToDraft('{“headword”: }').error).toBe('JSON として解析できませんでした。');
  });
});

describe('jsonToDraft — the pitch accent', () => {
  const note = (pitchAccent: string) =>
    jsonToDraft(`{"headword":"卵","definition":"たまご","reading":"たまご",${pitchAccent}}`).draft;

  it('carries a well-formed accent through to the draft', () => {
    expect(note('"pitchAccent":2')?.pitchAccent).toBe(2);
    expect(note('"pitchAccent":0')?.pitchAccent).toBe(0);
  });

  it('takes the null the prompt asks for when the assistant is unsure', () => {
    expect(note('"pitchAccent":null')?.pitchAccent).toBeNull();
    expect(jsonToDraft('{"headword":"卵","definition":"たまご"}').draft?.pitchAccent).toBeNull();
  });

  /** An assistant asked for a number routinely quotes it. That is still an answer. */
  it('accepts a quoted number, which is how an assistant often sends one', () => {
    expect(note('"pitchAccent":"2"')?.pitchAccent).toBe(2);
  });

  it('drops what an assistant sends instead of a number', () => {
    expect(note('"pitchAccent":2.5')?.pitchAccent).toBeNull();
    expect(note('"pitchAccent":"わかりません"')?.pitchAccent).toBeNull();
    expect(note('"pitchAccent":"2（中高）"')?.pitchAccent).toBeNull();
  });
});

describe('jsonToDraft — required fields', () => {
  it('refuses a note with no headword', () => {
    expect(jsonToDraft('{"definition":"前ぶれ"}').error).toBe('"headword" が空です。');
    expect(jsonToDraft('{"headword":"   ","definition":"前ぶれ"}').error).toBe(
      '"headword" が空です。',
    );
  });

  it('refuses a note with no definition', () => {
    expect(jsonToDraft('{"headword":"兆候"}').error).toBe('"definition" が空です。');
  });

  /** Everything else is optional: a partial answer still has to save. */
  it('fills the rest from the blank draft', () => {
    const draft = jsonToDraft(JSON.stringify(minimal)).draft;
    expect(draft).toMatchObject({
      reading: '',
      pos: [],
      jlpt: 'レベル外',
      origin: '',
      freq: 3,
      senses: [],
      examples: [],
      related: [],
      tags: [],
    });
  });
});

/**
 * Nothing in `buildPrompt` tells the assistant today's date, so `learnedOn`
 * in its reply is a guess dressed up as an answer: sometimes today, sometimes
 * an empty string, sometimes a well-formed date that is neither — all three
 * observed from real replies to the same prompt. `isoDate` in `sanitize.ts`
 * only catches the malformed case; a syntactically valid but invented date
 * passed straight through and was imported as if the reader had typed it.
 * The reader cannot tell the difference on screen, and the field drives the
 * dashboard's contribution heatmap, so a wrong value there is silent.
 */
describe('jsonToDraft — learnedOn', () => {
  const now = new Date(2026, 7, 24);

  it('defaults to today when the assistant omits learnedOn', () => {
    expect(jsonToDraft(JSON.stringify(minimal), {}, now).draft?.learnedOn).toBe('2026-08-24');
  });

  it('defaults to today when the assistant sends an empty learnedOn', () => {
    const raw = JSON.stringify({ ...minimal, learnedOn: '' });
    expect(jsonToDraft(raw, {}, now).draft?.learnedOn).toBe('2026-08-24');
  });

  it('defaults to today rather than trusting a well-formed but invented learnedOn', () => {
    const raw = JSON.stringify({ ...minimal, learnedOn: '2019-03-14' });
    expect(jsonToDraft(raw, {}, now).draft?.learnedOn).toBe('2026-08-24');
  });
});

/**
 * The size checks, which are the import path's own and not the form's.
 *
 * The form has `maxLength` on every field and this path has none: it builds a
 * whole draft from a string in one go, without a keystroke anywhere. So the
 * attribute that stops a user typing too much is not in play here at all, and
 * an assistant asked for a definition will happily write three thousand
 * characters of prose.
 */
describe('jsonToDraft — size', () => {
  const oversize = (over: Record<string, unknown>) =>
    jsonToDraft(JSON.stringify({ ...minimal, ...over })).oversize;

  it('refuses a paste too large to parse without hanging the tab', () => {
    const huge = 'x'.repeat(INPUT_LIMITS.jsonPaste + 1);
    const { error, draft } = jsonToDraft(huge);

    expect(error).toContain('貼り付けが大きすぎます');
    expect(draft).toBeUndefined();
  });

  /**
   * Every offender named, because the alternative is a round trip per field:
   * a note with three oversize values reported one at a time is three more
   * visits to whichever assistant wrote it.
   */
  it('names every oversize field rather than stopping at the first', () => {
    const problems = oversize({
      headword: 'あ'.repeat(21),
      definition: 'あ'.repeat(1001),
      source: 'あ'.repeat(101),
    });

    expect(problems).toHaveLength(3);
    expect(problems?.join(' ')).toContain('headword');
    expect(problems?.join(' ')).toContain('definition');
    expect(problems?.join(' ')).toContain('source');
  });

  /**
   * Not truncated, and this is the assertion that says so. Keeping the first
   * thousand characters would import a note whose explanation stops
   * mid-sentence, with nothing on screen reporting the edit — and the user is
   * looking at the JSON that produced it and can shorten the field themselves.
   */
  it('imports nothing at all rather than a note silently cut short', () => {
    const { draft, oversize: problems } = jsonToDraft(
      JSON.stringify({ ...minimal, definition: 'あ'.repeat(1001) }),
    );

    expect(draft).toBeUndefined();
    expect(problems).toHaveLength(1);
  });

  it('reaches a nested field, which the security rules cannot see at any size', () => {
    const problems = oversize({
      senses: [{ label: '', description: 'あ'.repeat(501), example: '' }],
    });
    expect(problems?.[0]).toContain('senses[0].description');
  });

  it('lets a note at exactly the limit through', () => {
    const { draft, oversize: problems } = jsonToDraft(
      JSON.stringify({ ...minimal, definition: 'あ'.repeat(1000) }),
    );

    expect(problems).toBeUndefined();
    expect(draft?.definition).toHaveLength(1000);
  });
});

describe('jsonToDraft — coercion', () => {
  /**
   * The import path runs the same sanitiser as the Firestore read path, so an
   * invalid enum or a null inside an array is dropped before it can reach the
   * form and then Firestore. Asserted here because this is the entry point a
   * user actually pastes into.
   */
  it('drops values the schema does not allow instead of passing them through', () => {
    const draft = jsonToDraft(
      JSON.stringify({
        ...minimal,
        jlpt: 'N9',
        origin: 'ラテン語',
        freq: 99,
        pos: ['名詞', 'サ変動詞'],
        senses: [null, { label: '前触れ' }],
      }),
    ).draft;

    expect(draft?.jlpt).toBe('レベル外');
    expect(draft?.origin).toBe('');
    expect(draft?.freq).toBe(3);
    expect(draft?.pos).toEqual(['名詞']);
    expect(draft?.senses).toHaveLength(1);
  });

  it('parses tags out of the array the assistant returns', () => {
    const draft = jsonToDraft(
      JSON.stringify({ ...minimal, tags: ['#ニュース', 'ビジネス 会議', 'ニュース'] }),
    ).draft;
    expect(draft?.tags).toEqual(['ニュース', 'ビジネス', '会議']);
  });
});

describe('jsonToDraft — the user context wins', () => {
  /**
   * An assistant will happily paraphrase the sentence it was given. The user's
   * copy is the one that actually appeared, so it overwrites the answer.
   */
  it('overwrites context.original with the sentence the user typed', () => {
    const draft = jsonToDraft(
      JSON.stringify({ ...minimal, context: { original: '言い換えられた文' } }),
      { original: '  不況の兆候が見える  ' },
    ).draft;
    expect(draft?.context.original).toBe('不況の兆候が見える');
  });

  it('overwrites source with what the user typed', () => {
    const draft = jsonToDraft(JSON.stringify({ ...minimal, source: '推測' }), {
      source: '会議',
    }).draft;
    expect(draft?.source).toBe('会議');
  });

  it("keeps the assistant's value when the user supplied nothing but whitespace", () => {
    const draft = jsonToDraft(
      JSON.stringify({ ...minimal, source: '新聞', context: { original: '元の文' } }),
      { original: '   ', source: '  ' },
    ).draft;
    expect(draft?.source).toBe('新聞');
    expect(draft?.context.original).toBe('元の文');
  });
});

describe('buildPrompt', () => {
  it('names the word and the translation language', () => {
    const prompt = buildPrompt('兆候', '廣東話');
    expect(prompt).toContain('「兆候」');
    expect(prompt).toContain('廣東話');
    expect(prompt).toContain(SCHEMA);
  });

  /**
   * Asking for a context analysis when there is no sentence invites the
   * assistant to invent one, which would put fiction into the notes.
   */
  it('asks for a context analysis only when there is a sentence to analyse', () => {
    const withSentence = buildPrompt('兆候', '廣東話', { original: '不況の兆候が見える' });
    expect(withSentence).toContain('不況の兆候が見える');
    expect(withSentence).toContain('"context.original"');

    const without = buildPrompt('兆候', '廣東話');
    expect(without).toContain('出会った文がないため');
    expect(without).not.toContain('"context.original"');
  });

  /**
   * The prompt used to end with 「コードフェンスは不要です」. A fenced reply is the one
   * an iOS app will copy verbatim — plain prose comes back with its quotes
   * typographically substituted, which `JSON.parse` then refuses. Asking for
   * the fence costs nothing, because the parser has always stripped one.
   */
  it('asks for a code fence rather than forbidding it, so an iOS copy stays verbatim', () => {
    const prompt = buildPrompt('兆候', '廣東話');

    expect(prompt).not.toContain('コードフェンスは不要です');
    expect(prompt).toContain('```json');
  });

  it('passes a source through, and asks for it to be left blank otherwise', () => {
    expect(buildPrompt('兆候', '廣東話', { source: '会議' })).toContain('「会議」');
    expect(buildPrompt('兆候', '廣東話')).toContain('"source" は空のままにしてください');
  });

  /**
   * The rules and the shape are two halves of one instruction: a rule for a
   * field the assistant cannot see in the schema is a rule for a field it will
   * not emit.
   *
   * **The example is a number, and that is the whole point.** It was `null`
   * first, reasoning that a sample number would be copied as a guess. The
   * opposite happened: every other field in this schema shows a real value, so
   * the one blank read as "this field is normally empty", and GPT returned
   * `null` every time. A schema example is read as the shape of a normal
   * answer, not as a neutral placeholder.
   */
  it('shows a real number in the shape, not the blank state', () => {
    expect(SCHEMA).toContain('"pitchAccent": 2');
    expect(SCHEMA).not.toContain('"pitchAccent": null');
  });

  /**
   * The escape hatch survives, because a confident wrong accent is worse than
   * none — but it is now the exception it was meant to be. Paired with the rule
   * above: a permission to answer `null` next to an example of `null` is not a
   * fallback, it is an instruction.
   */
  it('demands a number by default and allows null only as the exception', () => {
    const prompt = buildPrompt('兆候', '廣東話');
    expect(prompt).toContain('必ず数値を入れてください');
    expect(prompt).toContain('本当に判断できない場合だけ');
  });

  /**
   * An assistant counts characters unless told not to, which puts the drop on
   * the wrong syllable for every word containing a yōon, っ, ん or ー — and the
   * import path has no way to tell a plausible wrong number from a right one.
   */
  it('spells out that a mora is not a character', () => {
    const prompt = buildPrompt('兆候', '廣東話');
    expect(prompt).toContain('「きょ」は1拍');
    expect(prompt).toContain('「っ」「ん」「ー」');
  });

  it('ignores a context made only of whitespace', () => {
    expect(buildPrompt('兆候', '廣東話', { original: '   ', source: '  ' })).toContain(
      '出会った文がないため',
    );
  });
});

describe('promptLanguageName', () => {
  it('maps every supported UI language to an unambiguous prompt language', () => {
    expect([
      promptLanguageName('en'),
      promptLanguageName('ja'),
      promptLanguageName('zh-Hant'),
      promptLanguageName('yue-Hant'),
      promptLanguageName('ko'),
      promptLanguageName('es'),
    ]).toEqual(['English', '日本語', '中文', '廣東話', '한국어', 'Español']);
  });

  it('keeps the existing Cantonese fallback when no preference is available', () => {
    expect(promptLanguageName()).toBe('廣東語');
    expect(promptLanguageName(null)).toBe('廣東語');
  });
});

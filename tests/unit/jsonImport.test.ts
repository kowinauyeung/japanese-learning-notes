import { describe, expect, it } from 'vitest';
import { buildPrompt, jsonToDraft, promptLanguageName, SCHEMA } from '@/lib/jsonImport';

/**
 * The import box takes JSON an assistant wrote somewhere else and a human
 * pasted in. Neither step is reliable: assistants wrap output in a code fence
 * they were told not to add, invent enum values, and paraphrase the sentence
 * they were handed. All of that has to become either a saveable draft or a
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
  ])('strips a %s that the assistant added anyway', (_case, raw) => {
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
      promptLanguageName('ko'),
      promptLanguageName('es'),
    ]).toEqual(['英語', '日本語', '繁体字中国語', '韓国語', 'スペイン語']);
  });

  it('keeps the existing Cantonese fallback when no preference is available', () => {
    expect(promptLanguageName()).toBe('廣東語');
    expect(promptLanguageName(null)).toBe('廣東語');
  });
});

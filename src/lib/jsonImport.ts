import type { EntryDraft } from '@/domain/entry';
import { INPUT_LIMITS } from '@/domain/limits';
import type { TranslationLanguage } from '@/domain/user';
import { describeSizeProblem, draftSizeProblems, emptyDraft } from './draft';
import { sanitizeDraft } from './sanitize';

const PROMPT_LANGUAGE_NAMES = {
  en: 'English',
  ja: '日本語',
  'zh-Hant': '中文',
  'yue-Hant': '廣東話',
  ko: '한국어',
  es: 'Español',
} as const satisfies Record<TranslationLanguage, string>;

/** Convert a persisted language code into wording for the Japanese AI prompt. */
export function promptLanguageName(language?: TranslationLanguage | null): string {
  return language ? PROMPT_LANGUAGE_NAMES[language] : '廣東語';
}

/** The shape shown in the app and asked of the assistant. */
export const SCHEMA = `{
  "headword": "見出し語",
  "reading": "かな",
  "pitchAccent": 2,
  "tags": [],
  "learnedOn": "YYYY-MM-DD",
  "pos": ["名詞"],
  "jlpt": "N2",
  "origin": "漢語",
  "style": "両方",
  "politeness": "普通",
  "freq": 3,
  "citationForm": "",
  "definition": "意味・説明（必須）",
  "definitionSub": "補足・注記",
  "source": "出典",
  "context": { "original": "", "ja": "", "translation": "" },
  "senses": [
    { "label": "", "description": "", "example": "",
      "exampleGloss": "", "translation": "", "usage": "" }
  ],
  "examples": [{ "ja": "", "translation": "" }],
  "usage": { "when": "", "translation": "", "caution": "" },
  "related": [{ "headword": "", "note": "" }]
}`;

export interface PromptContext {
  /** The sentence the word was met in, if the user has one. */
  original?: string;
  /** Where it was met — 会議, 同僚, a book title. */
  source?: string;
}

export function buildPrompt(word: string, language: string, context: PromptContext = {}): string {
  const original = context.original?.trim();
  const source = context.source?.trim();

  // Only ask for the context analysis when there is a sentence to analyse;
  // inventing an "original sentence" would put fiction into the notes.
  const contextLines = original
    ? `
この単語は次の文で出会いました：
「${original}」

- "context.original" にはこの文をそのまま入れてください。
- "context.ja" にはこの文の中での役割・働きを日本語で説明してください。
- "context.translation" には同じ説明を${language}で書いてください。
- "senses" と "examples" は、この文脈での意味を最初に置いてください。`
    : `
- 出会った文がないため "context" は空のままにしてください。`;

  const sourceLine = source
    ? `- "source" には「${source}」をそのまま入れてください。`
    : `- "source" は空のままにしてください。`;

  return `「${word}」という日本語の単語について、次のJSONスキーマだけを出力してください。説明文は不要で、JSON全体を \`\`\`json のコードブロックに入れてください。
${contextLines}

- "definitionSub" と各 "translation" は${language}で書いてください。
- "definition" は必須です。日本語で書いてください。
${sourceLine}
- "pos" は次から選んでください: 名詞・代名詞・動詞・い形容詞・な形容詞・副詞・連体詞・接続詞・感動詞・助詞・助動詞・接頭辞・接尾辞・擬音語・擬態語・慣用句・ことわざ・表現
- "jlpt" は N1〜N5 または レベル外
- "origin" は 和語・漢語・外来語・混種語 のいずれか
- "style" は 話し言葉・書き言葉・両方 のいずれか
- "politeness" は スラング・くだけた・普通・丁寧 のいずれか
- "freq" は 1〜5 の整数
- "pitchAccent" は音が下がる拍の番号です。0 は平板、1 は頭高。拍は文字ではなく、「きょ」は1拍、「っ」「ん」「ー」はそれぞれ1拍と数えてください。"reading" の拍数を超える数は書かないでください。
- "pitchAccent" は辞書に載っている一般的な語であれば必ず数値を入れてください。null にしてよいのは、アクセントに複数の説があるなど、本当に判断できない場合だけです。

${SCHEMA}`;
}

/**
 * Copying an assistant's reply out of a phone app is not a byte-for-byte
 * transfer. The same answer copied from a browser arrives with U+0022 and
 * copied from an iOS app arrives with U+201C and U+201D, because what the app
 * puts on the clipboard is the typographically substituted prose rather than
 * the source it rendered. `JSON.parse` accepts only U+0022, so the note is
 * refused for a reason that has nothing to do with the note.
 *
 * Asking for a code fence — which `buildPrompt` now does — is the better half
 * of the fix, because a fenced reply is copied verbatim. This is the other
 * half, for the paste that arrives substituted anyway.
 */
function parseTolerantly(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Falls through to the repair. Anything that parsed as written is returned
    // above untouched, so the rewrite below only ever sees input that is
    // already broken and cannot make a good note worse.
  }

  try {
    return JSON.parse(straightenDelimiters(text));
  } catch {
    return undefined;
  }
}

/**
 * Rewrite the quotes delimiting each value, leaving the ones inside it alone.
 *
 * Which is which cannot be decided from the neighbouring punctuation, because
 * that does not say what opened the value being read. A straight-quoted value
 * holding a ” is the case it gets wrong: read as a delimiter, the note parses,
 * imports, and is missing a character the user wrote — a silent edit, which is
 * worse than the refusal this is trying to avoid. So the scan tracks the quote
 * that opened the value it is standing in.
 *
 * A straight-quoted value ends where JSON says it ends. A curly-quoted one ends
 * at a ” standing where a delimiter can stand, which keeps a curly quote used
 * as punctuation mid-sentence inside the sentence.
 *
 * That last rule is a reading, not a proof: a ” inside a value that happens to
 * sit before a `:` `,` `}` or `]` still closes it early. What follows then reads
 * as structure and the parse fails, which is the refusal the caller reports —
 * but nothing here guarantees it fails for every such note, only that the two
 * shapes covered in the tests do.
 */
function straightenDelimiters(text: string): string {
  const out: string[] = [];
  let opener: '"' | '“' | undefined;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);

    if (opener === undefined) {
      if (ch === '"' || ch === '“') {
        opener = ch;
        out.push('"');
      } else {
        out.push(ch);
      }
      continue;
    }

    // An escape takes the character after it with it, so a quote the assistant
    // escaped never reads as the end of the value.
    if (ch === '\\') {
      out.push(ch, text.charAt(i + 1));
      i += 1;
      continue;
    }

    const ends = opener === '"' ? ch === '"' : ch === '”' && delimiterMayStandAt(text, i + 1);
    if (ends) {
      opener = undefined;
      out.push('"');
      continue;
    }

    out.push(ch);
  }

  return out.join('');
}

/** Whether the next thing after `from`, ignoring whitespace, follows a value. */
function delimiterMayStandAt(text: string, from: number): boolean {
  let i = from;
  while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
  return i === text.length || ':,}]'.includes(text.charAt(i));
}

/**
 * Import a note written by an assistant elsewhere. Only headword and
 * definition are required; every other field falls back to the blank draft,
 * so a partial answer still saves.
 *
 * Anything the user typed in `context` wins over the assistant's version of the
 * same field — an assistant will happily paraphrase the sentence it was given,
 * and the user's copy is the one that actually appeared.
 */
export function jsonToDraft(
  raw: string,
  context: PromptContext = {},
): { draft?: EntryDraft; error?: string; oversize?: string[] } {
  // Before the parse, not after: `JSON.parse` on a multi-megabyte paste blocks
  // the main thread long enough to read as a hung tab, and every check below
  // this line runs on the parsed result. A paste that large is not a note — the
  // schema's own worst case is a few kilobytes — so refusing it outright costs
  // nothing a real import needed.
  if (raw.length > INPUT_LIMITS.jsonPaste) {
    return {
      error: `貼り付けが大きすぎます: ${raw.length}字（上限 ${INPUT_LIMITS.jsonPaste}字）。`,
    };
  }

  // Tolerate a ```json fence. The prompt now asks for one, and assistants used
  // to add it even when told not to, so both eras of pasted note arrive here.
  const unfenced = raw
    .replace(/^\s*```(?:json)?/, '')
    .replace(/```\s*$/, '')
    .trim();

  // The shape is validated by the guards below; JSON.parse's `any` stops here.
  const parsed = parseTolerantly(unfenced) as Record<string, unknown> | undefined;
  if (parsed === undefined) return { error: 'JSON として解析できませんでした。' };
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'JSON オブジェクトではありません。' };
  }

  // Every field is coerced to its declared type here rather than cast. The JSON
  // is assistant-written and pasted by hand, so it routinely carries invalid
  // enum values, wrong types, or nulls inside arrays — all of which would
  // otherwise reach the form and Firestore intact.
  const draft: EntryDraft = sanitizeDraft(parsed);

  // `sanitizeDraft`'s `isoDate` only rejects a `learnedOn` that fails to
  // parse — it has no way to tell a real date from an invented one, and
  // nothing in `buildPrompt` tells the assistant what today is. The result
  // over real replies is not a fallback the reader can rely on: sometimes
  // today, sometimes an empty string, sometimes a well-formed date that is
  // neither. The reader cannot see the difference on screen, and the field
  // drives the dashboard heatmap, so a wrong value is silent. Today is
  // always what a freshly imported note should start from — the same
  // default `emptyDraft` gives a note started by hand — and the field
  // stays user-editable in the form afterwards.
  draft.learnedOn = emptyDraft().learnedOn;

  if (context.original?.trim()) draft.context.original = context.original.trim();
  if (context.source?.trim()) draft.source = context.source.trim();

  if (!draft.headword) return { error: '"headword" が空です。' };
  if (!draft.definition) return { error: '"definition" が空です。' };

  /*
    Length is checked here rather than left to the save button, and every
    violation is reported rather than the first.

    `sanitizeDraft` above has already coerced types and dropped unusable values,
    and it does **not** truncate — deliberately. An assistant asked for a
    definition writes prose, and silently keeping the first thousand characters
    would import a note whose explanation stops mid-sentence, with nothing on
    screen saying so. The user is looking at the JSON that produced it and can
    shorten the field themselves; that is the one situation where refusing is
    cheaper for them than repairing.

    All of them at once because the alternative is a round trip per field: a
    pasted note with six oversize values would otherwise be re-pasted six times,
    each time revealing one more problem.
  */
  const oversize = draftSizeProblems(draft).map(describeSizeProblem);
  if (oversize.length) return { oversize };

  return { draft };
}

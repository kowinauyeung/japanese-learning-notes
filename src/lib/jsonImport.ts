import type { EntryDraft } from '../types/entry';
import { emptyDraft, parseTags } from './draft';

/** The shape shown in the app and asked of the assistant. */
export const SCHEMA = `{
  "headword": "見出し語",
  "reading": "かな",
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
  "source": "出處",
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

  return `「${word}」という日本語の単語について、次のJSONスキーマだけを出力してください。説明文やコードフェンスは不要です。
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

${SCHEMA}`;
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
): { draft?: EntryDraft; error?: string } {
  let parsed: Record<string, unknown>;
  try {
    // Tolerate a ```json fence, which assistants add even when told not to.
    parsed = JSON.parse(raw.replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, '').trim());
  } catch {
    return { error: 'JSON として解析できませんでした。' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'JSON オブジェクトではありません。' };
  }

  const base = emptyDraft();
  const pick = <T,>(key: string, fallback: T): T =>
    parsed[key] === undefined || parsed[key] === null ? fallback : (parsed[key] as T);

  const draft: EntryDraft = {
    ...base,
    headword: String(pick('headword', '')).trim(),
    reading: String(pick('reading', '')),
    tags: Array.isArray(parsed.tags) ? parseTags((parsed.tags as string[]).join(' ')) : [],
    learnedOn: String(pick('learnedOn', base.learnedOn)) || base.learnedOn,
    pos: Array.isArray(parsed.pos) ? (parsed.pos as EntryDraft['pos']) : [],
    jlpt: pick('jlpt', base.jlpt),
    origin: pick('origin', base.origin),
    style: pick('style', base.style),
    politeness: pick('politeness', base.politeness),
    freq: pick('freq', base.freq),
    citationForm: String(pick('citationForm', '')),
    definition: String(pick('definition', '')).trim(),
    definitionSub: String(pick('definitionSub', '')),
    source: String(pick('source', '')),
    context: { ...base.context, ...(pick('context', {}) as object) },
    senses: Array.isArray(parsed.senses) ? (parsed.senses as EntryDraft['senses']) : [],
    examples: Array.isArray(parsed.examples) ? (parsed.examples as EntryDraft['examples']) : [],
    usage: { ...base.usage, ...(pick('usage', {}) as object) },
    related: Array.isArray(parsed.related) ? (parsed.related as EntryDraft['related']) : [],
  };

  if (context.original?.trim()) draft.context.original = context.original.trim();
  if (context.source?.trim()) draft.source = context.source.trim();

  if (!draft.headword) return { error: '"headword" が空です。' };
  if (!draft.definition) return { error: '"definition" が空です。' };
  return { draft };
}

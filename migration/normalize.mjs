// Normalisers for the free-text MANIFEST values found in the original notes.
// The notes were written by hand over a year, so every "enum" is really prose:
// 品詞 has 23 distinct values, 語種 21, 文体 17. Filters need canonical values,
// so each raw string is reduced to one (or, for 品詞, several) canonical tokens.

// Written 品詞 -> canonical Pos. Ordered longest-first so that 形容動詞 is
// matched before 形容詞 and 名詞句 before 名詞.
//
// Conversions worth naming:
//   形容詞/形容動詞 -> い形容詞/な形容詞  learner-facing naming
//   サ変動詞        -> 名詞               a conjugation class, not a POS; the
//                                        する-ness already lives in posInfo
//   名詞句          -> 表現               a phrase, not a part of speech
const POS_MAP = [
  ['形容動詞', 'な形容詞'],
  ['な形容詞', 'な形容詞'],
  ['い形容詞', 'い形容詞'],
  ['名詞句', '表現'],
  ['代名詞', '代名詞'],
  ['サ変動詞', '名詞'],
  ['擬態語', '擬態語'],
  ['擬音語', '擬音語'],
  ['慣用句', '慣用句'],
  ['ことわざ', 'ことわざ'],
  ['形容詞', 'い形容詞'],
  ['感動詞', '感動詞'],
  ['接続詞', '接続詞'],
  ['連体詞', '連体詞'],
  ['助動詞', '助動詞'],
  ['接頭辞', '接頭辞'],
  ['接尾辞', '接尾辞'],
  ['助詞', '助詞'],
  ['表現', '表現'],
  ['名詞', '名詞'],
  ['動詞', '動詞'],
  ['副詞', '副詞'],
];

/** 品詞 -> canonical tokens, e.g. "名詞（めいし）／動詞（どうし）" -> ["名詞","動詞"] */
export function normalizePos(raw) {
  if (!raw) return [];
  const stripped = raw.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
  const out = [];
  for (const chunk of stripped.split(/[／\/・、,＋+]/)) {
    for (const [written, canonical] of POS_MAP) {
      if (chunk.includes(written)) {
        if (!out.includes(canonical)) out.push(canonical);
        break;
      }
    }
  }
  return out;
}

/** JLPT -> N1..N5 or レベル外. "レベル外（ビジネス・技術用語）" -> "レベル外" */
export function normalizeJlpt(raw) {
  if (!raw) return 'レベル外';
  const m = raw.match(/N[1-5]/);
  return m ? m[0] : 'レベル外';
}

/** 語種 -> 和語 / 漢語 / 外来語 / 混種語 */
export function normalizeOrigin(raw) {
  if (!raw) return '';
  for (const kind of ['混種語', '外来語', '漢語', '和語']) {
    if (raw.includes(kind)) return kind;
  }
  return '';
}

/** 文体 -> 話し言葉 / 書き言葉 / 両方 */
export function normalizeStyle(raw) {
  if (!raw) return '';
  if (raw.includes('両方')) return '両方';
  const spoken = raw.includes('話し言葉');
  const written = raw.includes('書き言葉');
  if (spoken && written) return '両方';
  if (spoken) return '話し言葉';
  if (written) return '書き言葉';
  return '';
}

/** 丁寧さ -> first listed level. "丁寧／普通" -> 丁寧, "くだけた〜普通" -> くだけた */
export function normalizePoliteness(raw) {
  if (!raw) return '';
  const head = raw.split(/[／\/〜~・,、]/)[0];
  for (const level of ['くだけた', 'スラング', '丁寧', '普通']) {
    if (head.includes(level)) return level;
  }
  for (const level of ['くだけた', 'スラング', '丁寧', '普通']) {
    if (raw.includes(level)) return level;
  }
  return '';
}

/**
 * 頻度 -> 1..5.
 * Only the leading ★/☆ run counts: one note reads "★★★☆☆（技術分野では★★★★★）",
 * where naively counting every ★ in the string yields 8.
 */
export function normalizeFreq(raw) {
  if (!raw) return 3;
  const run = raw.match(/^[★☆]+/);
  if (!run) return 3;
  const stars = run[0].split('').filter((c) => c === '★').length;
  return stars >= 1 && stars <= 5 ? stars : 3;
}

/** Folder name -> Japanese tag, matching the app's Japanese UI. */
export const FOLDER_TAGS = {
  work: '仕事',
  daily: '日常',
  engineering: '技術',
  擬態語: '擬態語',
};

// One-shot migration parser: bak/**/*.md -> migration/output.json
//
// Nothing here runs in the app. It exists to lift the 67 hand-written notes into
// the Entry shape once, and is deliberately forgiving: a file that doesn't match
// the expected structure is still emitted, with its problems recorded in
// migration/review.json rather than aborting the run.

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizePos, normalizeJlpt, normalizeOrigin, normalizeStyle,
  normalizePoliteness, normalizeFreq, FOLDER_TAGS, stripDeep,
} from './normalize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BAK = join(HERE, '..', 'bak');

const SECTION_BY_EMOJI = {
  '📋': 'manifest',
  '🔧': 'posInfo',
  '📌': 'context',
  '📖': 'definition',
  '🌐': 'senses',
  '📝': 'examples',
  '🗣️': 'usage',
  '🔗': 'related',
};

const KANJI = /[一-龯々〆ヵヶ]/;

// ---------------------------------------------------------------- structure

/** Split a note into a flat, ordered list of headed blocks. */
function splitBlocks(text) {
  const blocks = [];
  let current = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (m) {
      const title = m[2].trim();
      const emoji = Object.keys(SECTION_BY_EMOJI).find((e) => title.startsWith(e)) ?? null;
      current = {
        level: m[1].length,
        emoji,
        kind: emoji ? SECTION_BY_EMOJI[emoji] : null,
        // drop the emoji and the trailing " (English gloss)" some headings carry
        title: title.replace(emoji ?? '', '').replace(/\s*\([^)]*\)\s*$/, '').trim(),
        lines: [],
      };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return blocks.map((b) => ({ ...b, body: b.lines.join('\n').trim() }));
}

/** Rows of the first `| key | value |` table in a block. */
function parseTable(body) {
  const rows = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/);
    if (!m) continue;
    const [, label, value] = m;
    if (/^-+$/.test(label) || label === '項目') continue;
    rows.push({ label, value });
  }
  return rows;
}

/**
 * Text following a `**ラベル：**` marker, up to the next bold marker,
 * horizontal rule, or end of block.
 */
function fieldAfterLabel(body, labelPattern) {
  const re = new RegExp(`\\*\\*${labelPattern}\\s*[：:]\\s*\\*\\*([\\s\\S]*?)(?=\\n\\s*\\*\\*|\\n\\s*---|$)`);
  const m = body.match(re);
  return m ? m[1].trim() : '';
}

/** Strip blockquote markers; separate the sentence from its （意味：…） gloss. */
function parseQuotedExample(raw) {
  const lines = raw.split('\n')
    .map((l) => l.replace(/^\s*>\s?/, '').trim())
    .filter(Boolean);
  const sentence = [];
  let gloss = '';
  for (const line of lines) {
    const m = line.match(/^[（(]\s*意味\s*[：:]\s*(.*?)\s*[）)]\s*$/);
    if (m) gloss = m[1];
    else sentence.push(line);
  }
  return { sentence: sentence.join(' '), gloss };
}

// ------------------------------------------------------------------ headword

/**
 * Headword and reading from the H1. The notes use three different conventions:
 *   「兆候（ちょうこう）」        -> 兆候 / ちょうこう        one trailing group = whole-word reading
 *   「切（き）り分（わ）け」      -> 切り分け / きりわけ      per-kanji furigana
 *   「小（こ）ネタ」              -> 小ネタ / こネタ          a single group mid-word is also per-kanji
 * A group always replaces the kanji run immediately before it, except when it
 * is the only group and sits at the very end, where it reads the whole word.
 */
function parseHeadword(h1, warn) {
  const groups = [...h1.matchAll(/（([^）]+)）/g)];
  const headword = h1.replace(/（[^）]+）/g, '').trim();

  let reading = '';
  if (groups.length === 1 && h1.trimEnd().endsWith('）')) {
    reading = groups[0][1].trim();
    // 「ポーリング方式（ほうしき）」 only spells out the kanji tail, so the
    // reading does not actually cover the whole headword.
    const prefix = headword.match(/^[^一-龯々]*/)[0];
    if (KANJI.test(headword) && prefix && !reading.startsWith(prefix)) {
      warn(`読み「${reading}」が見出し語「${headword}」全体を覆っていない可能性`);
    }
  } else if (groups.length) {
    reading = h1.replace(/[一-龯々]*（([^）]+)）/g, '$1').trim();
    // 「兼（かね）ね合（あ）い」— the furigana swallows the okurigana that
    // follows it, so the reading comes out as かねねあい instead of かねあい.
    for (const m of h1.matchAll(/（([^）]+)）([ぁ-ん])/g)) {
      if (m[1].endsWith(m[2])) {
        warn(`振り仮名「${m[1]}」が送り仮名「${m[2]}」と重複 — 読みが「${reading}」になっている`);
      }
    }
  }

  if (/[→⇒]|\s{2,}|　/.test(h1)) warn(`H1 の形式が不規則: 「${h1}」`);
  return { headword, reading };
}

// --------------------------------------------------------------- section bits

function parseSenses(blocks, sensesIndex) {
  const senses = [];
  for (let i = sensesIndex + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.level === 2) break;
    if (!/^意味/.test(b.title)) continue;
    const { sentence, gloss } = parseQuotedExample(fieldAfterLabel(b.body, '例文'));
    senses.push({
      label: b.title.replace(/^意味\s*[①-⑳0-9]+\s*[：:]\s*/, '').trim(),
      description: fieldAfterLabel(b.body, '日本語の説明'),
      example: sentence,
      exampleGloss: gloss,
      translation: fieldAfterLabel(b.body, '廣東語(?:（Cantonese）)?'),
      usage: fieldAfterLabel(b.body, '使う場面'),
    });
  }
  return senses;
}

function parseExamples(body) {
  const examples = [];
  for (const line of body.split('\n')) {
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      examples.push({ ja: numbered[1].trim(), translation: '' });
      continue;
    }
    const translated = line.match(/^\s*→\s*廣東[語話]\s*[：:]\s*(.*)$/);
    if (translated && examples.length) {
      examples[examples.length - 1].translation = translated[1].trim();
      continue;
    }
    // a wrapped continuation of the Japanese sentence
    if (line.trim() && examples.length && !examples[examples.length - 1].translation) {
      examples[examples.length - 1].ja += line.trim();
    }
  }
  return examples;
}

function parseRelated(body, warn) {
  const related = [];
  for (const line of body.split('\n')) {
    if (!/^\s*-\s+/.test(line)) continue;
    const m = line.match(/^\s*-\s+(.+?)\s*[—–―−]\s*(.+)$/);
    if (!m) {
      warn(`関連語の行を解析できず: ${line.trim()}`);
      continue;
    }
    related.push({
      headword: m[1].replace(/\*\*/g, '').trim(),
      note: m[2].trim(),
    });
  }
  return related;
}

// ------------------------------------------------------------------- per file

function parseFile(path, folder, filename) {
  const warnings = [];
  const warn = (msg) => warnings.push(msg);
  const text = readFileSync(path, 'utf8');
  const blocks = splitBlocks(text);
  const find = (kind, level) =>
    blocks.findIndex((b) => b.kind === kind && (level === undefined || b.level === level));

  const nameMatch = filename.match(/^(\d{4})(\d{2})(\d{2})_([^_]+)_(.+)\.md$/);
  if (!nameMatch) warn('ファイル名が YYYYMMDD_romaji_語.md の形式ではない');
  const [, y, mo, d, romaji] = nameMatch ?? [, '1970', '01', '01', filename];

  const h1 = text.split('\n').find((l) => /^#\s+\S/.test(l));
  if (!h1) warn('H1（見出し語）が見つからない');
  const { headword, reading } = parseHeadword(h1 ? h1.replace(/^#\s+/, '').trim() : '', warn);

  // MANIFEST
  const manifestIndex = find('manifest');
  if (manifestIndex === -1) warn('📋 MANIFEST セクションがない');
  const manifest = Object.fromEntries(
    (manifestIndex === -1 ? [] : parseTable(blocks[manifestIndex].body)).map((r) => [r.label, r.value]),
  );
  for (const key of ['品詞', 'JLPTレベル', '語種', '文体', '丁寧さ', '頻度']) {
    if (!manifest[key]) warn(`MANIFEST に「${key}」がない`);
  }

  // POS-specific table (名詞情報 / 動詞情報 / 形容詞情報 …)
  const posInfoIndex = find('posInfo');
  const posInfoRows = posInfoIndex === -1 ? [] : parseTable(blocks[posInfoIndex].body);

  // 【日本語】/【廣東語】 overall definition — sits outside any heading in most
  // notes, so it is matched against the whole document.
  if ((text.match(/\*\*【日本語】\*\*/g) ?? []).length > 1) warn('【日本語】ブロックが複数ある');
  const defJa = text.match(/\*\*【日本語】\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*【廣東語】\*\*)/);
  const defTr = text.match(/\*\*【廣東語】\*\*\s*\n([\s\S]*?)(?=\n\s*---|\n##|$)/);
  if (!defJa) warn('【日本語】の総釈義がない');
  if (!defTr) warn('【廣東語】の総釈義がない');

  // 📌 context (optional — only 24 notes have it)
  const contextIndex = find('context');
  const contextBody = contextIndex === -1 ? '' : blocks[contextIndex].body;

  // 🌐 senses
  const sensesIndex = find('senses');
  const senses = sensesIndex === -1 ? [] : parseSenses(blocks, sensesIndex);
  if (sensesIndex === -1) warn('🌐 文脈別の意味セクションがない');
  else if (!senses.length) warn('🌐 セクションはあるが「意味 ①」が読めなかった');
  senses.forEach((s, i) => {
    if (!s.description) warn(`意味 ${i + 1}: 日本語の説明が空`);
    if (!s.translation) warn(`意味 ${i + 1}: 廣東語訳が空`);
  });

  // 📝 examples
  const examplesIndex = find('examples');
  const examples = examplesIndex === -1 ? [] : parseExamples(blocks[examplesIndex].body);
  if (examplesIndex === -1) warn('📝 例文セクションがない');
  else if (!examples.length) warn('📝 セクションはあるが例文が読めなかった');
  examples.forEach((e, i) => {
    if (!e.translation) warn(`例文 ${i + 1}: 訳が空 — 「${e.ja.slice(0, 20)}…」`);
  });

  // 🗣️ usage
  const usageIndex = find('usage');
  const usageBody = usageIndex === -1 ? '' : blocks[usageIndex].body;
  if (usageIndex === -1) warn('🗣️ 使い方・ニュアンスセクションがない');

  // 🔗 related
  const relatedIndex = find('related');
  const related = relatedIndex === -1 ? [] : parseRelated(blocks[relatedIndex].body, warn);
  if (relatedIndex === -1) warn('🔗 関連語セクションがない');

  const learnedOn = `${y}-${mo}-${d}`;
  // Migrated notes keep their original date as createdAt so the year of history
  // the repo already holds is not collapsed into the migration timestamp.
  const createdAt = new Date(`${learnedOn}T00:00:00+09:00`).toISOString();

  // Every string below is run through stripDeep once the entry is assembled;
  // the fields carry prose written with Markdown emphasis the app cannot render.
  const entry = {
    id: romaji,

    headword,
    reading,
    pitchAccent: null,

    pos: normalizePos(manifest['品詞']),
    jlpt: normalizeJlpt(manifest['JLPTレベル']),
    origin: normalizeOrigin(manifest['語種']),
    style: normalizeStyle(manifest['文体']),
    politeness: normalizePoliteness(manifest['丁寧さ']),
    freq: normalizeFreq(manifest['頻度']),
    citationForm: manifest['登録形'] ?? '',
    posInfo: posInfoRows.length
      ? { title: blocks[posInfoIndex].title, rows: posInfoRows }
      : null,

    definition: defJa ? defJa[1].trim() : '',
    definitionSub: defTr ? defTr[1].trim() : '',
    senses,
    examples,
    related,

    // The notes never recorded 出處 as its own field, only the sentence itself.
    source: '',
    context: {
      original: fieldAfterLabel(contextBody, '元の文'),
      ja: fieldAfterLabel(contextBody, '文中での役割（日本語）'),
      translation: fieldAfterLabel(contextBody, '文中での役割（廣東語）'),
    },

    usage: {
      when: fieldAfterLabel(usageBody, 'いつ使う'),
      translation: fieldAfterLabel(usageBody, '廣東語で言うと'),
      caution: fieldAfterLabel(usageBody, '注意点'),
    },

    tags: [FOLDER_TAGS[folder] ?? folder],
    wordSets: [],

    learnedOn,
    createdAt,
    updatedAt: createdAt,
  };

  if (!entry.headword) warn('見出し語が空');
  if (!entry.definition) warn('definition が空 — 必須項目');
  if (!entry.pos.length) warn(`品詞を正規化できず: 「${manifest['品詞'] ?? ''}」`);
  if (!entry.origin) warn(`語種を正規化できず: 「${manifest['語種'] ?? ''}」`);
  if (!entry.style) warn(`文体を正規化できず: 「${manifest['文体'] ?? ''}」`);
  if (!entry.politeness) warn(`丁寧さを正規化できず: 「${manifest['丁寧さ'] ?? ''}」`);

  return { entry: stripDeep(entry), warnings, source: `${folder}/${filename}` };
}

// ---------------------------------------------------------------------- main

const files = [];
for (const folder of readdirSync(BAK)) {
  const dir = join(BAK, folder);
  if (!statSync(dir).isDirectory()) continue;
  for (const filename of readdirSync(dir)) {
    if (filename.endsWith('.md')) files.push({ folder, filename, path: join(dir, filename) });
  }
}
files.sort((a, b) => a.filename.localeCompare(b.filename));

const results = files.map((f) => parseFile(f.path, f.folder, f.filename));

// ids come from the filename romaji, which must stay unique for the migration
// to be re-runnable without creating duplicate documents
const seen = new Map();
for (const r of results) {
  const count = (seen.get(r.entry.id) ?? 0) + 1;
  seen.set(r.entry.id, count);
  if (count > 1) {
    r.warnings.push(`id「${r.entry.id}」が重複 — 「${r.entry.id}-${count}」に変更`);
    r.entry.id = `${r.entry.id}-${count}`;
  }
}

const entries = results.map((r) => r.entry);
const review = results
  .filter((r) => r.warnings.length)
  .map((r) => ({ source: r.source, headword: r.entry.headword, warnings: r.warnings }));

mkdirSync(HERE, { recursive: true });
writeFileSync(join(HERE, 'output.json'), JSON.stringify(entries, null, 2) + '\n');
writeFileSync(join(HERE, 'review.json'), JSON.stringify(review, null, 2) + '\n');

// ------------------------------------------------------------------- summary

const empty = (fn) => entries.filter(fn).length;
console.log(`解析: ${entries.length} 件 / 要確認: ${review.length} 件`);
console.log(`  definition（必須）: ${empty((e) => e.definition)}`);
console.log(`  senses あり        : ${empty((e) => e.senses.length)}`);
console.log(`  examples あり      : ${empty((e) => e.examples.length)}`);
console.log(`  related あり       : ${empty((e) => e.related.length)}`);
console.log(`  📌 context あり     : ${empty((e) => e.context.original)}`);
console.log(`  posInfo あり       : ${empty((e) => e.posInfo)}`);
console.log(`  登録形 あり        : ${empty((e) => e.citationForm)}`);
console.log(`  pos 分布           : ${[...new Set(entries.flatMap((e) => e.pos))].join(' ')}`);
console.log(`  tags               : ${[...new Set(entries.flatMap((e) => e.tags))].join(' ')}`);
console.log(`\n-> migration/output.json, migration/review.json`);

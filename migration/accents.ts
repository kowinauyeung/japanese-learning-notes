import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accentPattern, moraCount, splitMora } from '../src/lib/mora';

/**
 * Fill `pitchAccent` across the migrated notebook, in two halves.
 *
 *   yarn migrate:accents prompt          → migration/accents.prompt.txt
 *   yarn migrate:accents apply <answers> → merges into migration/output.json
 *
 * The halves are separate because the middle step is a person pasting the
 * prompt into an assistant. Nothing here calls one.
 *
 * **It reads `output.json`, not `bak/`.** `bak/` is the pre-correction markdown
 * and is not in the repository; re-deriving anything from it would reintroduce
 * three wrong readings and lose six hand-authored sections. `output.json` is the
 * artefact of record — see `migration/README.md`.
 *
 * `upload.mjs` needs no change to carry the result: it spreads `...rest` over
 * each entry, so `pitchAccent` has been shipping as `null` all along.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, 'output.json');
const PROMPT = join(HERE, 'accents.prompt.txt');

interface Entry {
  headword: string;
  reading: string;
  pos: string[];
  pitchAccent: number | null;
}

/** The kana the accent describes — the reading, or the headword when it is already kana. */
const kanaOf = (entry: Entry) => entry.reading || entry.headword;

/**
 * A phrase has no single accent number: 鵜呑みにする is several accent phrases,
 * and asking for one number invites an assistant to invent one. They are listed
 * in the prompt with the answer already given, so the refusal is on the record
 * rather than looking like an omission.
 */
const isPhrase = (entry: Entry) => entry.pos.some((p) => p === '慣用句' || p === '表現');

const readEntries = (): Entry[] => JSON.parse(readFileSync(OUTPUT, 'utf8')) as Entry[];

function writePrompt() {
  const entries = readEntries();
  const rows = entries.map((entry) => {
    const kana = kanaOf(entry);
    const mora = splitMora(kana);
    const note = isPhrase(entry) ? '  ← 句なので null' : '';
    return `${entry.headword}\t${kana}\t${mora.length}拍 (${mora.join('・')})${note}`;
  });

  const text = `次の${entries.length}語について、東京式アクセントの「下がる拍の番号」だけを JSON 配列で出力してください。説明文やコードフェンスは不要です。

- 番号は音が下がる拍です。0 は平板、1 は頭高。
- 拍数は各行に示してあります。**その拍数を超える番号は書かないでください。**
- 辞書に載っている一般的な語であれば必ず数値を入れてください。
- 次の場合は必ず null にしてください。推測は書かないでください。
  - 慣用句・複数文節の表現（各行に印をつけてあります）
  - 辞書にない造語・専門語・固有の複合語
  - 話者によって揺れる新語やスラング
- 擬態語・擬音語は、辞書に記載のあるものだけ数値を入れてください。

出力形式（${entries.length}件、見出し語は下の表と完全に一致させてください）:
[{ "headword": "兆候", "pitchAccent": 0 }, …]

見出し語\t読み\t拍
${rows.join('\n')}
`;

  writeFileSync(PROMPT, text, 'utf8');
  console.log(`${PROMPT} に ${entries.length} 語を書き出しました。`);
}

interface Answer {
  headword?: unknown;
  pitchAccent?: unknown;
}

function apply(answersPath: string) {
  const entries = readEntries();
  const byHeadword = new Map(entries.map((entry) => [entry.headword, entry]));

  const raw = readFileSync(answersPath, 'utf8')
    .replace(/^\s*```(?:json)?/, '')
    .replace(/```\s*$/, '')
    .trim();
  const answers: unknown = JSON.parse(raw);
  if (!Array.isArray(answers)) throw new Error('答えが JSON 配列ではありません');

  const filled: string[] = [];
  const refused: string[] = [];
  const unknown: string[] = [];
  const blank: string[] = [];

  for (const answer of answers as Answer[]) {
    const headword = typeof answer.headword === 'string' ? answer.headword : '';
    const entry = byHeadword.get(headword);
    if (!entry) {
      unknown.push(headword || '(見出し語なし)');
      continue;
    }

    const value = answer.pitchAccent;
    if (value === null || value === undefined) {
      blank.push(headword);
      continue;
    }

    // Every value is checked against this word's own mora count before it is
    // written. An assistant that counted characters produces numbers that are
    // plausible and wrong, and this is the only place left that can tell.
    const mora = moraCount(kanaOf(entry));
    const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    const pattern = Number.isFinite(number) ? accentPattern(number, mora) : null;
    if (pattern === null) {
      refused.push(`${headword}（${kanaOf(entry)}, ${mora}拍）← ${JSON.stringify(value)}`);
      continue;
    }

    entry.pitchAccent = number;
    filled.push(`${headword} ${number}（${pattern}）`);
  }

  const missing = entries.filter(
    (entry) => !answers.some((a) => (a as Answer).headword === entry.headword),
  );

  writeFileSync(OUTPUT, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  console.log(`\n書き込み: ${filled.length} 件`);
  for (const line of filled) console.log(`  ${line}`);
  if (blank.length) console.log(`\nnull のまま: ${blank.length} 件\n  ${blank.join(' / ')}`);
  if (refused.length) {
    console.log(`\n拍数に合わないため不採用: ${refused.length} 件`);
    for (const line of refused) console.log(`  ${line}`);
  }
  if (unknown.length) console.log(`\n見出し語が一致しません: ${unknown.join(' / ')}`);
  if (missing.length)
    console.log(`\n答えに含まれていません: ${missing.map((e) => e.headword).join(' / ')}`);
  console.log(
    `\n合計 ${entries.filter((e) => e.pitchAccent !== null).length}/${entries.length} 語にアクセントが入りました。`,
  );
}

const [mode, file] = process.argv.slice(2);
if (mode === 'prompt') writePrompt();
else if (mode === 'apply' && file) apply(file);
else {
  console.error('usage: accents.ts prompt | accents.ts apply <answers.json>');
  process.exit(1);
}

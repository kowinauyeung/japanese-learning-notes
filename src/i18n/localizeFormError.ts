import type { MessageKey } from './messages';

type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;

export function localizeFormError(error: string, t: Translate): string {
  const exact: Readonly<Record<string, MessageKey>> = {
    '見出し語は必須です。': 'validation.headwordRequired',
    '意味・説明は必須です。': 'validation.definitionRequired',
    '学習日を正しく入力してください。': 'validation.learnedOn',
    'アクセントを入れるには読み方（かな）が必要です。': 'validation.readingRequired',
    '拍の番号なので、整数で入れてください。': 'validation.integerMora',
    '0（平板）以上で入れてください。': 'validation.nonnegativeMora',
    'JSON として解析できませんでした。': 'import.invalidJson',
    'JSON オブジェクトではありません。': 'import.notObject',
    '"headword" が空です。': 'import.emptyHeadword',
    '"definition" が空です。': 'import.emptyDefinition',
  };
  const key = exact[error];
  if (key) return t(key);

  const tags = error.match(/^タグに使えない文字があります: (.+)$/u);
  if (tags?.[1]) return t('validation.invalidTags', { tags: tags[1] });

  const mora = error.match(/^(.+) は(\d+)拍です。$/u);
  if (mora?.[1] && mora[2]) return t('validation.moraCount', { kana: mora[1], count: mora[2] });

  // The size problems, whose sentinel wording is built by `describeSizeProblem`.
  // `path` is a code identifier and stays untranslated on purpose — it names a
  // key in the JSON schema the user is looking at.
  const tooLong = error.match(/^(.+) が長すぎます: (\d+)字（上限 (\d+)字）。$/u);
  if (tooLong?.[1] && tooLong[2] && tooLong[3]) {
    return t('validation.tooLong', { path: tooLong[1], actual: tooLong[2], max: tooLong[3] });
  }

  const tooMany = error.match(/^(.+) が多すぎます: (\d+)件（上限 (\d+)件）。$/u);
  if (tooMany?.[1] && tooMany[2] && tooMany[3]) {
    return t('validation.tooMany', { path: tooMany[1], actual: tooMany[2], max: tooMany[3] });
  }

  const range = error.match(/^学習日は (\S+) から (\S+) の間で入れてください。$/u);
  if (range?.[1] && range[2]) {
    return t('validation.learnedOnRange', { from: range[1], to: range[2] });
  }

  return error;
}

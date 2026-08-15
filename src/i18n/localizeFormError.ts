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

  return error;
}

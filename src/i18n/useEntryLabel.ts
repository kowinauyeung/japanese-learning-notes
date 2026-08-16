import { useCallback } from 'react';
import { useI18n } from './context';
import type { MessageKey } from './messages';

const metadataKeys: Readonly<Record<string, MessageKey>> = {
  名詞: 'metadata.pos.名詞',
  代名詞: 'metadata.pos.代名詞',
  動詞: 'metadata.pos.動詞',
  い形容詞: 'metadata.pos.い形容詞',
  な形容詞: 'metadata.pos.な形容詞',
  副詞: 'metadata.pos.副詞',
  連体詞: 'metadata.pos.連体詞',
  接続詞: 'metadata.pos.接続詞',
  感動詞: 'metadata.pos.感動詞',
  助詞: 'metadata.pos.助詞',
  助動詞: 'metadata.pos.助動詞',
  接頭辞: 'metadata.pos.接頭辞',
  接尾辞: 'metadata.pos.接尾辞',
  擬音語: 'metadata.pos.擬音語',
  擬態語: 'metadata.pos.擬態語',
  慣用句: 'metadata.pos.慣用句',
  ことわざ: 'metadata.pos.ことわざ',
  表現: 'metadata.pos.表現',
  和語: 'metadata.origin.和語',
  漢語: 'metadata.origin.漢語',
  外来語: 'metadata.origin.外来語',
  混種語: 'metadata.origin.混種語',
  話し言葉: 'metadata.style.話し言葉',
  書き言葉: 'metadata.style.書き言葉',
  両方: 'metadata.style.両方',
  スラング: 'metadata.politeness.スラング',
  くだけた: 'metadata.politeness.くだけた',
  普通: 'metadata.politeness.普通',
  丁寧: 'metadata.politeness.丁寧',
  平板: 'metadata.accent.平板',
  頭高: 'metadata.accent.頭高',
  中高: 'metadata.accent.中高',
  尾高: 'metadata.accent.尾高',
  レベル外: 'metadata.jlpt.レベル外',
};

export function useEntryLabel() {
  const { t } = useI18n();
  return useCallback(
    (value: string): string => {
      const key = metadataKeys[value];
      return key ? t(key) : value;
    },
    [t],
  );
}

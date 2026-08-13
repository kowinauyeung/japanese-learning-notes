import type { Doc } from './doc';
import { orPending, site } from './site';

export const support: Doc = {
  title: 'サポート',
  lead: 'うまく動かないとき、気づいたことがあるときの連絡先です。',
  updated: '2026-08-13',
  sections: [
    {
      heading: '不具合の報告・要望',
      body: [
        `フォームからお送りください。${orPending(site.feedbackFormUrl)}`,
        'エラー画面やアカウント画面の「診断情報をコピー」を押すと、調べるのに必要な情報が clipboard に入ります。フォームに貼り付けてください。何が入っているかは、貼り付ける前に確認できます。',
        '学習内容そのものや、メールアドレスを本文に書く必要はありません。診断情報にも含まれません。',
      ],
    },
    {
      heading: '公開の場でよければ',
      body: [
        `再現手順が公開されても構わない不具合は、GitHub の Issue でも受け付けます。${site.repositoryUrl}/issues`,
        'Issue は誰でも読めます。登録した単語の内容やメールアドレスは書かないでください。',
      ],
    },
    {
      heading: '脆弱性の報告',
      body: [
        `セキュリティに関わる問題は、公開の場ではなく ${orPending(site.contactEmail)} へ直接お知らせください。`,
        '修正するまでの間、内容を公開しないでいただけると助かります。',
      ],
    },
    {
      heading: 'データを取り出す・消す',
      body: [
        'アカウント画面から、登録した全データを JSON で書き出せます。',
        '同じ画面から、アカウントとデータを削除できます。削除は取り消せません。',
      ],
    },
  ],
};

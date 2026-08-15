import type { Doc } from './doc';
import { homeContent } from './home';
import { site } from './site';

const home = homeContent.ja;

export const about: Doc = {
  title: '語彙庭について',
  lead: home.lead,
  updated: '2026-08-13',
  sections: [
    {
      heading: home.purpose.heading,
      body: [...home.purpose.body],
    },
    {
      heading: home.features.heading,
      body: [],
      list: [...home.features.list],
    },
    {
      heading: '今の状態',
      body: [
        '現在は開発段階のため、機能が変わったり、不具合が発生したりすることがあります。お気づきの点があれば、お知らせください。',
        'データはいつでもエクスポートでき、アカウントとあわせて削除することもできます。',
      ],
    },
    {
      heading: '運営',
      body: [
        `${site.operator}が個人で開発・運営しています。法人のサービスではなく、業務として提供しているものでもありません。`,
        '日本語能力試験（JLPT）およびその主催団体とは関係がなく、Google の公式サービスでもありません。',
        'ご連絡は、サポートページのお問い合わせフォームからお願いします。',
      ],
    },
  ],
};

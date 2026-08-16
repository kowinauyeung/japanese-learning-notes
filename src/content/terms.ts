import type { Doc } from './doc';
import { site } from './site';

/**
 * A first draft, not legal advice.
 *
 * One thing here is a deliberate legal position rather than a wording choice:
 * **there is no blanket disclaimer.** A clause that is void takes the reader's
 * trust with it, so the limitation below is bounded rather than total.
 *
 * **It was total until review caught it**, and the gap is worth recording
 * because this comment did not describe the text underneath it. The clause
 * excluded liability except for intent and gross negligence — which, read the
 * other way round, excluded *everything* for ordinary negligence. 消費者契約法
 * 8条1項1号 is about exactly that shape: a clause wholly excluding a business's
 * liability, not only one excluding it for intent and gross negligence. The
 * carve-out that made the comment feel true was for the wrong half.
 *
 * What is here now bounds ordinary negligence by the *kind* of damage rather
 * than removing it: ordinary damages remain, consequential and special damages
 * and lost profits do not. Deliberately no monetary cap — the service is free,
 * so a cap at "the amount paid" is a total exclusion wearing a number.
 *
 * Still not reviewed by a lawyer. This is the structure being defensible, not
 * the wording being final.
 */
const FORM = 'お問い合わせフォームを開く';

export const terms: Doc = {
  title: '利用規約',
  lead: '本規約は、語彙庭の利用条件を定めるものです。ログインした時点で、本規約に同意したものとみなします。',
  updated: '2026-08-14',
  sections: [
    {
      heading: 'サービスについて',
      body: [
        `語彙庭は、日本語の語彙を記録・練習するための個人開発サービスであり、${site.operator}が個人で運営しています。`,
        '現在は開発段階にあり、機能の追加、変更または削除を予告なく行うことがあります。',
      ],
    },
    {
      heading: 'アカウント',
      body: [
        '本サービスには Google アカウントでログインします。運営者がログイン可能な利用者を制限する期間があります。',
        'アカウントは本人のみが利用し、第三者と共有しないでください。ログイン情報は、利用者の責任において管理してください。',
      ],
    },
    {
      heading: '禁止事項',
      body: ['利用者は、次の行為を行ってはなりません。'],
      list: [
        '法令または公序良俗に反する行為。',
        '他者の権利を侵害する内容を登録する行為。著作物の全部を許諾なく転載することを含みます。',
        '自動化された手段による大量のアクセスまたは本サービスの動作を妨げる行為。',
        '本サービスの不具合または脆弱性を、報告せずに利用する行為。',
        '他者になりすます行為。',
      ],
    },
    {
      heading: '利用者が登録した内容',
      body: [
        '利用者が登録した単語および学習記録に関する権利は、当該利用者に帰属します。運営者は、これらを他の目的に利用しません。',
        '将来、単語集の公開機能を提供する場合は、利用者が公開範囲を選択できるようにします。利用者が公開を選択しない限り、登録内容が他の利用者に表示されることはありません。',
      ],
    },
    {
      heading: '内容の正確性',
      body: [
        '語彙の意味、読み方、アクセント、例文、音声読み上げおよび AI による取り込み結果の正確性は保証しません。学習の参考としてご利用ください。',
        '本サービスは日本語能力試験（JLPT）およびその主催団体とは関係がなく、Google の公式サービスでもありません。',
      ],
    },
    {
      heading: '停止・終了',
      body: [
        'メンテナンス、障害、外部サービスの停止などにより、予告なく本サービスを利用できなくなることがあります。',
        '本サービスの提供を終了する場合は、可能な限り事前に告知し、データをエクスポートできる期間を設けます。',
        '禁止事項に該当する行為があった場合、事前に通知することなくアカウントを停止することがあります。',
      ],
    },
    {
      heading: 'バックアップ',
      body: [
        '運営者はデータの保全に努めますが、データが消失しないことを保証するものではありません。',
        '利用者は、アカウント画面からいつでも全データをエクスポートできます。重要なデータについては、利用者自身でも控えを保管してください。',
      ],
    },
    {
      heading: '責任について',
      body: [
        '本サービスは無償で提供しています。',
        '運営者の故意または重過失により生じた損害については、運営者がその全部について責任を負います。',
        '運営者の軽過失により生じた損害については、通常生じうる損害の範囲に限り責任を負います。特別の事情によって生じた損害、逸失利益および間接損害については、責任を負いません。',
      ],
    },
    {
      heading: '規約の変更',
      body: [
        '本規約を変更した場合は、このページの更新日を改めます。重要な変更については、アプリ内でもお知らせします。',
      ],
    },
    {
      heading: 'お問い合わせ',
      body: ['本規約に関するお問い合わせは、お問い合わせフォームよりご連絡ください。'],
      link: { label: FORM, href: site.feedbackFormUrl },
    },
  ],
};

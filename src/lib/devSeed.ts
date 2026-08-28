import { addDays, dateKey } from './dates';
import type { E2ESeed, SeedEntry, SeedSession, SeedWordSet } from './e2eSeed';

/**
 * The notebook a hand-driven `vite dev --mode e2e` starts with.
 *
 * The `e2e` build swaps the Firestore adapters for the in-memory ones in
 * `backend.e2e.ts`, which read their data out of `window.__GOITEI_E2E__` —
 * something only Playwright ever sets. Driven by hand the same build therefore
 * came up signed out, with an empty notebook, and reviewing any screen meant
 * signing in and typing words in first. This is what it comes up with instead.
 *
 * **It is not a test fixture and no spec may read it.** `tests/e2e/fixtures.ts`
 * owns those, and they are deliberately minimal — three words chosen to differ
 * from each other, against which every committed screenshot is taken. This is
 * the opposite brief: enough words, spread over enough of a year and enough
 * levels and tags, that the dashboard, the heatmap, the filter panel and the
 * word sets all have something to draw. A spec written against it would be
 * asserting on a fixture whose whole purpose is to keep changing as screens are
 * added to.
 *
 * Takes `now` for the reason `CLAUDE.md` gives: hard-coded dates would put
 * every word outside 今週 and leave the heatmap blank a year after this was
 * written, and a seed that only demonstrates the app on the day it was authored
 * demonstrates nothing.
 */
export function devSeed(now: Date): E2ESeed {
  /** `learnedOn` — a local calendar day, which is what the heatmap counts. */
  const on = (daysAgo: number) => dateKey(addDays(now, -daysAgo));
  /** A timestamp on that day, so 最近追加した語 orders the way the dates read. */
  const at = (daysAgo: number, hour = 9) => {
    const day = addDays(now, -daysAgo);
    day.setHours(hour, 0, 0, 0);
    return day.toISOString();
  };

  const entries: SeedEntry[] = [
    {
      id: 'dev-kiriwake',
      headword: '切り分け',
      reading: 'きりわけ',
      definition: '大きな問題を小さな部分に分けること。',
      definitionSub: '分拆問題',
      pos: ['名詞'],
      jlpt: 'N2',
      origin: '和語',
      style: '書き言葉',
      politeness: '普通',
      freq: 3,
      tags: ['仕事'],
      learnedOn: on(0),
      createdAt: at(0),
      updatedAt: at(0),
    },
    {
      id: 'dev-uchiawase',
      headword: '打ち合わせ',
      reading: 'うちあわせ',
      pitchAccent: 0,
      definition: '仕事の進め方を前もって相談すること。',
      definitionSub: '事前商討',
      pos: ['名詞'],
      jlpt: 'N2',
      origin: '和語',
      style: '両方',
      politeness: '普通',
      freq: 4,
      tags: ['仕事'],
      learnedOn: on(0),
      createdAt: at(0, 14),
      updatedAt: at(0, 14),
    },
    {
      // The one entry with every optional part filled in, so the detail page
      // and the dialog have all of their sections to draw rather than a
      // definition and six empty headings.
      id: 'dev-choukou',
      headword: '兆候',
      reading: 'ちょうこう',
      pitchAccent: 0,
      definition: '何かが起こる前ぶれ。',
      definitionSub: '徵兆',
      citationForm: '兆候',
      source: 'NHK ニュース',
      pos: ['名詞'],
      jlpt: 'N1',
      origin: '漢語',
      style: '書き言葉',
      politeness: '普通',
      freq: 4,
      posInfo: { title: '名詞情報', rows: [{ label: 'する動詞化', value: 'しない' }] },
      context: {
        original: '景気回復の兆候が見えてきた。',
        ja: '景気がよくなりはじめた様子が見える。',
        translation: '經濟復甦的跡象開始浮現。',
      },
      senses: [
        {
          label: '前触れ',
          description: '何かが起こる前に現れるしるし。',
          example: '地震の兆候をとらえる。',
          exampleGloss: '地震が起こる前のしるしを見つける。',
          translation: '捕捉地震的前兆。',
          usage: 'ニュースや報告書で使う。',
        },
      ],
      examples: [{ ja: '回復の兆候が見られる。', translation: '見到復甦的跡象。' }],
      related: [{ headword: '前兆', note: '兆候より不吉なことに使うことが多い。' }],
      usage: {
        when: '数字や観察から、これから起こることを述べるとき。',
        translation: '根據數據或觀察推斷將會發生的事。',
        caution: '話し言葉では大げさに聞こえる。',
      },
      tags: ['ニュース'],
      learnedOn: on(1),
      createdAt: at(1),
      updatedAt: at(1),
    },
    {
      id: 'dev-shimekiri',
      headword: '締め切り',
      reading: 'しめきり',
      pitchAccent: 0,
      definition: '物事を終わらせなければならない期限。',
      definitionSub: '截止日期',
      pos: ['名詞'],
      jlpt: 'N3',
      origin: '和語',
      style: '両方',
      politeness: '普通',
      freq: 5,
      tags: ['仕事'],
      learnedOn: on(2),
      createdAt: at(2),
      updatedAt: at(2),
    },
    {
      id: 'dev-aimai',
      headword: '曖昧',
      reading: 'あいまい',
      pitchAccent: 0,
      definition: 'はっきりしないようす。',
      definitionSub: '含糊、曖昧',
      pos: ['な形容詞'],
      jlpt: 'N1',
      origin: '漢語',
      style: '両方',
      politeness: '普通',
      freq: 3,
      tags: ['表現'],
      learnedOn: on(4),
      createdAt: at(4),
      updatedAt: at(4),
    },
    {
      // Kana-only, so `reading` is empty — the schema's own representation, and
      // the case where furigana must not be drawn at all.
      id: 'dev-chotto',
      headword: 'ちょっと',
      reading: '',
      definition: '少しの間、または少しの量。',
      pos: ['副詞'],
      jlpt: 'N5',
      origin: '和語',
      style: '話し言葉',
      politeness: 'くだけた',
      freq: 5,
      tags: ['日常'],
      learnedOn: on(6),
      createdAt: at(6),
      updatedAt: at(6),
    },
    {
      id: 'dev-tetsuzuki',
      headword: '手続き',
      reading: 'てつづき',
      pitchAccent: 2,
      definition: '物事を進めるために必要な決まった順序。',
      definitionSub: '手續',
      pos: ['名詞'],
      jlpt: 'N3',
      origin: '和語',
      style: '書き言葉',
      politeness: '丁寧',
      freq: 4,
      tags: ['生活'],
      learnedOn: on(11),
      createdAt: at(11),
      updatedAt: at(11),
    },
    {
      id: 'dev-hikkoshi',
      headword: '引っ越し',
      reading: 'ひっこし',
      definition: '住む場所を変えること。',
      definitionSub: '搬屋',
      pos: ['名詞'],
      jlpt: 'N4',
      origin: '和語',
      style: '両方',
      politeness: '普通',
      freq: 3,
      tags: ['生活'],
      learnedOn: on(19),
      createdAt: at(19),
      updatedAt: at(19),
    },
    {
      id: 'dev-natsukashii',
      headword: '懐かしい',
      reading: 'なつかしい',
      pitchAccent: 4,
      definition: '昔を思い出して心が温かくなるようす。',
      definitionSub: '懷念',
      pos: ['い形容詞'],
      jlpt: 'N2',
      origin: '和語',
      style: '両方',
      politeness: '普通',
      freq: 4,
      tags: ['感情'],
      learnedOn: on(33),
      createdAt: at(33),
      updatedAt: at(33),
    },
    {
      id: 'dev-sasuga',
      headword: 'さすが',
      reading: '',
      definition: '期待どおりで感心するようす。',
      definitionSub: '果然、不愧',
      pos: ['副詞'],
      jlpt: 'N2',
      origin: '和語',
      style: '話し言葉',
      politeness: 'くだけた',
      freq: 4,
      tags: ['会話'],
      learnedOn: on(58),
      createdAt: at(58),
      updatedAt: at(58),
    },
    {
      id: 'dev-keiki',
      headword: '景気',
      reading: 'けいき',
      pitchAccent: 0,
      definition: '経済全体の勢い。',
      definitionSub: '景氣',
      source: '日経新聞',
      pos: ['名詞'],
      jlpt: 'N2',
      origin: '漢語',
      style: '書き言葉',
      politeness: '普通',
      freq: 3,
      tags: ['ニュース'],
      learnedOn: on(97),
      createdAt: at(97),
      updatedAt: at(97),
    },
    {
      id: 'dev-cancel',
      headword: 'キャンセル',
      reading: '',
      definition: '予約や約束を取り消すこと。',
      definitionSub: '取消',
      pos: ['名詞'],
      jlpt: 'N4',
      origin: '外来語',
      style: '両方',
      politeness: '普通',
      freq: 4,
      tags: ['生活'],
      learnedOn: on(148),
      createdAt: at(148),
      updatedAt: at(148),
    },
    {
      id: 'dev-ukkari',
      headword: 'うっかり',
      reading: '',
      pitchAccent: 3,
      definition: '注意が足りず、思わずそうしてしまうようす。',
      definitionSub: '一時大意',
      pos: ['擬態語', '副詞'],
      jlpt: 'N3',
      origin: '和語',
      style: '話し言葉',
      politeness: 'くだけた',
      freq: 3,
      tags: ['日常'],
      learnedOn: on(226),
      createdAt: at(226),
      updatedAt: at(226),
    },
  ];

  const wordSets: SeedWordSet[] = [
    {
      id: 'dev-set-work',
      name: '仕事でよく聞く語',
      description: '打ち合わせと報告書で出てきた語。締め切りの話をするときの順に並べてある。',
      entryIds: ['dev-shimekiri', 'dev-uchiawase', 'dev-kiriwake', 'dev-tetsuzuki'],
    },
    {
      id: 'dev-set-news',
      name: 'ニュースの語',
      description: '朝のニュースで拾った語。',
      entryIds: ['dev-choukou', 'dev-keiki'],
    },
    {
      id: 'dev-set-daily',
      name: '日常会話',
      entryIds: ['dev-chotto', 'dev-sasuga', 'dev-ukkari', 'dev-hikkoshi', 'dev-cancel'],
    },
    // Deliberately empty: the state a set is in for as long as it takes to fill
    // one, and the only screen in the feature that has nothing else to show.
    { id: 'dev-set-empty', name: '今週おぼえる語', description: '', entryIds: [] },
  ];

  const sessions: SeedSession[] = [
    {
      id: 'dev-session-1',
      mode: 'flashcard',
      filterLabel: '単語集:仕事でよく聞く語',
      total: 4,
      correct: 3,
      missed: ['dev-tetsuzuki'],
      startedAt: at(1, 21),
      finishedAt: at(1, 21),
    },
    {
      id: 'dev-session-2',
      mode: 'dictation',
      filterLabel: '#日常',
      total: 3,
      correct: 1,
      missed: ['dev-ukkari', 'dev-sasuga'],
      startedAt: at(3, 20),
      finishedAt: at(3, 20),
    },
  ];

  return {
    signedIn: true,
    entries,
    // Enough for 苦手のみ to select something without it being most of the
    // notebook, which is what the filter looks like when it is working.
    weak: ['dev-tetsuzuki', 'dev-ukkari', 'dev-aimai'],
    wordSets,
    sessions,
  };
}

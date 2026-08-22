import type { Entry } from '@/domain/entry';
import type { E2ESeed } from '@/lib/e2eSeed';

export type ManifestSeed = Pick<E2ESeed, 'signedIn' | 'entries'>;

export interface ManifestScreenshotSpec {
  file: string;
  width: number;
  height: number;
  type: 'image/png';
  label: string;
  formFactor?: 'wide';
  route: string;
  waitForText: string;
  seed: ManifestSeed;
}

const WORDS = [
  {
    id: 'w-kiriwake',
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
    learnedOn: '2026-06-24',
    createdAt: '2026-06-24T01:00:00.000Z',
    updatedAt: '2026-06-24T01:00:00.000Z',
  },
  {
    id: 'w-choukou',
    headword: '兆候',
    reading: 'ちょうこう',
    pitchAccent: 0,
    definition: '何かが起こる前ぶれ。',
    definitionSub: '徵兆',
    source: 'NHK News',
    pos: ['名詞'],
    jlpt: 'N1',
    origin: '漢語',
    style: '書き言葉',
    politeness: '普通',
    freq: 4,
    tags: ['ニュース'],
    learnedOn: '2026-06-22',
    createdAt: '2026-06-22T01:00:00.000Z',
    updatedAt: '2026-06-22T01:00:00.000Z',
  },
  {
    id: 'w-chotto',
    headword: 'ちょっと',
    reading: 'ちょっと',
    definition: '少しの間、または少しの量。',
    pos: ['副詞'],
    jlpt: 'N5',
    origin: '和語',
    style: '話し言葉',
    politeness: 'くだけた',
    freq: 5,
    tags: ['日常'],
    learnedOn: '2026-01-15',
    createdAt: '2026-01-15T01:00:00.000Z',
    updatedAt: '2026-01-15T01:00:00.000Z',
  },
] satisfies Partial<Entry>[];

export const manifestScreenshots: readonly ManifestScreenshotSpec[] = [
  {
    file: 'screenshot-wide.png',
    width: 1280,
    height: 720,
    type: 'image/png',
    label: '学習の進み具合がひと目でわかるダッシュボード',
    formFactor: 'wide',
    route: '/',
    waitForText: '今週学んだ語',
    seed: { signedIn: true, entries: WORDS },
  },
  {
    file: 'screenshot-mobile.png',
    width: 390,
    height: 844,
    type: 'image/png',
    label: '単語の意味やアクセントをまとめて見られる詳細画面',
    route: '/vocabulary/w-choukou',
    waitForText: '何かが起こる前ぶれ。',
    seed: { signedIn: true, entries: WORDS },
  },
];

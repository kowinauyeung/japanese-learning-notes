import type { SupportedLocale } from '@/i18n/locales';

export interface HomeContent {
  lead: string;
  purpose: {
    heading: string;
    body: readonly string[];
  };
  features: {
    heading: string;
    list: readonly string[];
  };
}

/**
 * The durable product description shared by the public landing page and the
 * corresponding sections of the About document. Longer prose lives here
 * rather than among short interface labels so the two pages cannot drift.
 */
export const homeContent = {
  en: {
    lead: 'A vocabulary notebook for remembering the Japanese you encounter.',
    purpose: {
      heading: 'Why it exists',
      body: [
        'When the place where you record words is separate from the place where you review them, notes from meetings and books are easily forgotten. 語彙庭 brings recording, organising, practice and reflection together in one vocabulary notebook.',
        'Alongside readings, you can record accent, part of speech, word origin, style, politeness and how a word worked in the sentence where you found it. It is for expressions learned in context as well as dictionary headwords.',
      ],
    },
    features: {
      heading: 'What you can do',
      list: [
        'Save and search vocabulary by reading, tag, definition or example sentence.',
        'Create word sets and choose your own learning order.',
        'Practise with flashcards and dictation. Missed words stay in your weak words.',
        'Use history and My progress to see when, what and how much you studied.',
        'Create an AI prompt and import the returned JSON directly.',
      ],
    },
  },
  ja: {
    lead: '出会った日本語を、忘れないための単語帳です。',
    purpose: {
      heading: 'つくった理由',
      body: [
        '会議や本で出会った言葉を書き留めても、記録する場所と復習する場所が別々だと、書いただけで終わりがちです。語彙庭は、記録・整理・練習・振り返りを一か所にまとめた単語帳です。',
        '単語には、読み方に加え、アクセント、品詞、語種、文体、丁寧さ、出会った文の中での働きまで記録できます。辞書に載っている語だけでなく、その場で覚えた言い回しも記録できます。',
      ],
    },
    features: {
      heading: 'できること',
      list: [
        '単語を登録・検索できます。読み方、タグ、意味、例文のどこからでも探せます。',
        '単語集を作り、学ぶ順番を自分で決められます。',
        'フラッシュカードと書き取りで練習できます。間違えた単語は「苦手な語」として残ります。',
        '履歴と学習サマリーで、いつ、何に、どのくらい取り組んだかを確認できます。',
        'AI に渡すプロンプトを作成し、返された JSON をそのまま取り込めます。',
      ],
    },
  },
  'zh-Hant': {
    lead: '記下遇見的日文，讓你不再忘記。',
    purpose: {
      heading: '創作原因',
      body: [
        '即使記下在會議或書本中遇見的詞語，如果記錄和溫習分散在不同地方，筆記很容易就此擱置。語彙庭把記錄、整理、練習和回顧集中在一本單字簿內。',
        '除了讀音，你亦可以記錄聲調、詞性、語種、文體、禮貌程度，以及詞語在原句中的作用。不論是字典收錄的詞語，還是在情境中學到的表達方式，都可以保存。',
      ],
    },
    features: {
      heading: '主要功能',
      list: [
        '新增及搜尋單字，可從讀音、標籤、意思或例句尋找。',
        '建立單字集，自訂學習次序。',
        '透過單字卡和聽寫練習；答錯的詞語會保留在「較弱詞語」中。',
        '在紀錄和學習總覽查看學習時間、內容及進度。',
        '建立交給 AI 的 prompt，並直接匯入 AI 回傳的 JSON。',
      ],
    },
  },
  ko: {
    lead: '마주친 일본어를 잊지 않도록 기록하는 단어장입니다.',
    purpose: {
      heading: '만든 이유',
      body: [
        '회의나 책에서 만난 단어를 적어도 기록하는 곳과 복습하는 곳이 다르면 메모로 끝나기 쉽습니다. 語彙庭은 기록, 정리, 연습과 되돌아보기를 한 단어장에 모았습니다.',
        '읽는 법뿐 아니라 악센트, 품사, 어종, 문체, 공손함과 처음 만난 문장에서의 쓰임까지 기록할 수 있습니다. 사전에 실린 단어는 물론 상황 속에서 배운 표현도 저장할 수 있습니다.',
      ],
    },
    features: {
      heading: '할 수 있는 일',
      list: [
        '단어를 저장하고 읽는 법, 태그, 뜻 또는 예문으로 검색할 수 있습니다.',
        '단어 모음을 만들고 학습 순서를 직접 정할 수 있습니다.',
        '플래시카드와 받아쓰기로 연습하고, 틀린 단어를 취약 단어로 남길 수 있습니다.',
        '학습 기록과 학습 현황에서 언제 무엇을 얼마나 공부했는지 확인할 수 있습니다.',
        'AI용 prompt를 만들고 반환된 JSON을 바로 가져올 수 있습니다.',
      ],
    },
  },
  es: {
    lead: 'Un cuaderno para recordar el vocabulario japonés que encuentras.',
    purpose: {
      heading: 'Por qué existe',
      body: [
        'Cuando apuntas palabras de reuniones o libros en un lugar y las repasas en otro, es fácil que se queden olvidadas. 語彙庭 reúne el registro, la organización, la práctica y el repaso en un solo cuaderno de vocabulario.',
        'Además de la lectura, puedes guardar el acento, la categoría gramatical, el origen, el registro, la cortesía y el uso de una palabra en la frase donde apareció. Sirve tanto para palabras del diccionario como para expresiones aprendidas en contexto.',
      ],
    },
    features: {
      heading: 'Qué puedes hacer',
      list: [
        'Guarda y busca vocabulario por lectura, etiqueta, definición o frase de ejemplo.',
        'Crea listas de palabras y decide tu propio orden de aprendizaje.',
        'Practica con tarjetas y dictados. Las palabras falladas quedan entre tus puntos débiles.',
        'Consulta cuándo, qué y cuánto estudiaste en el historial y en Mi progreso.',
        'Crea un prompt para la IA e importa directamente el JSON que devuelve.',
      ],
    },
  },
} satisfies Record<SupportedLocale, HomeContent>;

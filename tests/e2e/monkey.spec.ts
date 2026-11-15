import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import type { Frequency } from '@/domain/entry';
import type { SeedEntry, SeedWordSet } from '@/lib/e2eSeed';
import { seed } from './fixtures';

interface Scenario {
  name: string;
  viewport: { width: number; height: number };
  seed: string;
}

interface Action {
  description: string;
  run: () => Promise<string | void>;
}

interface AvailableElement {
  index: number;
  marker: string;
  type: string;
}

const ROTATING_SEED = process.env.MONKEY_SEED || 'local-rotating-seed';
const STEPS = Math.min(100, Math.max(10, Number(process.env.MONKEY_STEPS) || 40));
const ACTION_CATEGORIES = [
  'navigate',
  'button',
  'link',
  'field',
  'select',
  'escape',
  'back',
] as const;

const SCENARIOS: Scenario[] = [
  { name: 'fixed desktop', viewport: { width: 1280, height: 720 }, seed: 'desktop-v1' },
  { name: 'fixed mobile', viewport: { width: 375, height: 720 }, seed: 'mobile-v1' },
  { name: 'rotating desktop', viewport: { width: 1280, height: 720 }, seed: ROTATING_SEED },
];

const ROUTES = [
  '/',
  '/vocabulary',
  '/vocabulary/monkey-word-1',
  '/wordsets',
  '/wordsets/monkey-set',
  '/practice/flashcards',
  '/practice/dictation',
  '/history',
  '/settings',
  '/account',
];

const TEXT_CORPUS = [
  '',
  '   ',
  '兆候',
  'Ｗ１２３',
  'Emoji 🚀🧑‍💻',
  '<script>window.__monkeyXss=true</script>',
  "' OR '1'='1",
  'e\u0301'.repeat(80),
  '\u200b'.repeat(20),
  'W'.repeat(200),
  'W'.repeat(201),
  '長'.repeat(500),
];

function makeMonkeyEntry(index: number): SeedEntry {
  return {
    id: `monkey-word-${index + 1}`,
    headword:
      index === 0
        ? 'W'.repeat(200)
        : index === 1
          ? '<script>🚀</script>'
          : `負荷試験${String(index + 1).padStart(2, '0')}`,
    reading: index < 2 ? '' : `ふかしけん${String(index + 1).padStart(2, '0')}`,
    definition: index === 0 ? 'W'.repeat(500) : `予測できない操作を試す語 ${index + 1}`,
    pos: ['名詞'],
    jlpt: 'N2',
    origin: '漢語',
    style: '書き言葉',
    politeness: '普通',
    freq: ((index % 5) + 1) as Frequency,
    tags: index % 2 === 0 ? ['負荷試験'] : ['monkey'],
    learnedOn: `2026-06-${String(24 - (index % 20)).padStart(2, '0')}`,
    createdAt: new Date(Date.UTC(2026, 5, 24, 0, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 5, 24, 0, 0, index)).toISOString(),
  };
}

const MONKEY_ENTRIES = Array.from({ length: 50 }, (_, index) => makeMonkeyEntry(index));

/** The 200-character headword, named because the session fixture snapshots it. */
const MONKEY_WORD_1 = makeMonkeyEntry(0);

const MONKEY_SET = {
  id: 'monkey-set',
  name: 'W'.repeat(200),
  description: 'W'.repeat(5000),
  entryIds: MONKEY_ENTRIES.slice(0, 12).map((entry) => entry.id),
} satisfies SeedWordSet;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFor(seedValue: number): () => number {
  let value = seedValue;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const MONKEY_CONTROL_ATTRIBUTE = 'data-monkey-control';

async function available(locator: Locator): Promise<AvailableElement[]> {
  return locator.evaluateAll(
    (elements, markerAttribute) =>
      elements.flatMap((element, index) => {
        const html = element as HTMLElement;
        const style = getComputedStyle(html);
        const rect = html.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const top = document.elementFromPoint(centerX, centerY);
        if (
          !html.checkVisibility() ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          rect.width === 0 ||
          rect.height === 0 ||
          centerX < 0 ||
          centerX > innerWidth ||
          centerY < 0 ||
          centerY > innerHeight ||
          html.closest('[inert], [aria-hidden="true"]') ||
          (top !== html && !html.contains(top)) ||
          html.getAttribute('aria-readonly') === 'true' ||
          (html instanceof HTMLInputElement && html.readOnly) ||
          (html instanceof HTMLTextAreaElement && html.readOnly)
        )
          return [];
        if ('disabled' in html && (html as HTMLButtonElement).disabled) return [];

        const marker = `${performance.now()}-${index}-${Math.random()}`;
        html.setAttribute(markerAttribute, marker);
        return [
          {
            index,
            marker,
            type: html.getAttribute('type') || html.tagName.toLowerCase(),
          },
        ];
      }),
    MONKEY_CONTROL_ATTRIBUTE,
  );
}

/**
 * Bounded, because `Locator.evaluate` resolves its locator by waiting for the
 * element to be attached rather than by reporting that it is gone — and this
 * project sets no action timeout, so the wait is the *test's*. A stale index
 * would therefore hang the run instead of being skipped, which is the failure
 * the visibility guards in `chooseAction` exist to replace. A second is orders
 * of magnitude more than reading a label off an attached element takes.
 */
const LABEL_TIMEOUT_MS = 1_000;
const ACTION_TIMEOUT_MS = 4_000;

async function labelOf(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => {
      const html = element as HTMLElement;
      const labelled =
        html.getAttribute('aria-label') ||
        ('labels' in html ? ((html as HTMLInputElement).labels?.[0]?.textContent ?? '') : '') ||
        html.textContent ||
        html.getAttribute('placeholder') ||
        html.tagName.toLowerCase();
      return labelled.trim().replace(/\s+/g, ' ').slice(0, 80);
    },
    undefined,
    { timeout: LABEL_TIMEOUT_MS },
  );
}

async function safeButtonElements(buttons: Locator): Promise<AvailableElement[]> {
  const elements = await available(buttons);
  const resolved = await Promise.all(
    elements.map(async (element) => {
      // `null`, not `''`: this label is a safety filter — it is the only thing
      // keeping the monkey off ログアウト and アカウントを削除 — so a label that
      // could not be read must drop its element rather than fall through the
      // test below as an empty string, which matches nothing and is kept.
      const label = await labelOf(buttons.nth(element.index)).catch(() => null);
      return { element, label };
    }),
  );
  return resolved
    .filter(
      ({ label }) =>
        label !== null &&
        !/ログアウト|アカウントを削除|データを削除|書き出す|単語を聞く|音声/.test(label),
    )
    .map(({ element }) => element);
}

async function chooseAction(page: Page, random: () => number): Promise<Action> {
  const category = ACTION_CATEGORIES[Math.floor(random() * ACTION_CATEGORIES.length)] ?? 'navigate';
  const elementDraw = random();
  const valueDraw = random();
  const route = ROUTES[Math.floor(elementDraw * ROUTES.length)] ?? '/';
  const navigate = (): Action => ({
    description: `navigate ${route}`,
    run: async () => {
      await page.goto(route);
    },
  });
  if (category === 'navigate') return navigate();

  const buttons = page.locator('button');
  const safeButtons = await safeButtonElements(buttons);
  if (category === 'button') {
    const chosen = safeButtons[Math.floor(elementDraw * safeButtons.length)];
    if (!chosen) return navigate();
    return {
      description: `click button index ${chosen.index}`,
      run: async () => {
        const button = buttons.nth(chosen.index);
        /*
         * The index is from a snapshot, and the snapshot can be of the previous
         * page. `available()` rejects anything a reader could not press —
         * `display: none` included — but it runs while the action is being
         * chosen, and the step before this one may have been a click on a link:
         * every route here is `lazy`, so the old page is still mounted while the
         * new one loads and the DOM under a given index changes out from under
         * the choice. Seed 33181645649 hit it exactly: 003 clicked 単語, 004
         * resolved index 2 against the vocabulary page it had become, where that
         * position holds a filter toggle that is `nav:hidden` on a desktop
         * width, and the run failed on a four second click timeout.
         *
         * Rechecking is the whole fix, because clicking it is not something this
         * suite may report: a control the browser is not painting is one no
         * reader can reach, so a monkey that presses it is testing nothing and
         * failing anyway. The skip goes into the history, so a run that keeps
         * doing this is visible rather than quietly shorter.
         */
        // Visibility before the label, and not the other way round: `labelOf`
        // goes through `Locator.evaluate`, which *waits* for an element that
        // is not there rather than reporting that it is gone. Resolving the
        // label first therefore turns the very staleness described above into
        // a run that hangs to its timeout with no skip recorded, which is the
        // failure this guard exists to replace.
        if (!(await button.isVisible()))
          return `skipped button index ${chosen.index}, no longer on screen`;
        const label = await labelOf(button);
        await test.step(`resolved button “${label}”`, () => button.click({ timeout: 4000 }));
        return `click button “${label}”`;
      },
    };
  }

  const links = page.locator('a[href^="/"]');
  const internalLinks = await available(links);
  if (category === 'link') {
    const chosen = internalLinks[Math.floor(elementDraw * internalLinks.length)];
    if (!chosen) return navigate();
    return {
      description: `click link index ${chosen.index}`,
      run: async () => {
        const link = links.nth(chosen.index);
        // Same staleness as the button above, and the same answer — including
        // the order: the index is the only label available for something that
        // is no longer on the page to be asked for one.
        if (!(await link.isVisible()))
          return `skipped link index ${chosen.index}, no longer on screen`;
        const label = await labelOf(link);
        await test.step(`resolved link “${label}”`, () => link.click({ timeout: 4000 }));
        return `click link “${label}”`;
      },
    };
  }

  const fields = page.locator('input:not([type="file"]), textarea');
  const availableFields = await available(fields);
  if (category === 'field') {
    const chosen = availableFields[Math.floor(elementDraw * availableFields.length)];
    if (!chosen) return navigate();
    const field = page.locator(`[${MONKEY_CONTROL_ATTRIBUTE}="${chosen.marker}"]`);
    return {
      description: `change ${chosen.type} index ${chosen.index}`,
      run: async () => {
        const skipped = `skipped field index ${chosen.index}, no longer on screen`;
        if (!(await field.isVisible().catch(() => false))) return skipped;
        const label = await labelOf(field).catch(() => null);
        if (label === null) return skipped;
        try {
          await test.step(`resolved ${chosen.type} “${label}”`, async () => {
            if (chosen.type === 'checkbox' || chosen.type === 'radio')
              return field.click({ timeout: ACTION_TIMEOUT_MS });
            if (chosen.type === 'date')
              return field.fill(['', '2026-02-28', '2026-06-24'][Math.floor(valueDraw * 3)] ?? '', {
                timeout: ACTION_TIMEOUT_MS,
              });
            if (chosen.type === 'number')
              return field.fill(['-1', '0', '2.7', '999999'][Math.floor(valueDraw * 4)] ?? '0', {
                timeout: ACTION_TIMEOUT_MS,
              });
            if (chosen.type === 'range') {
              const bounds = await field.evaluate(
                (element) => {
                  const input = element as HTMLInputElement;
                  return { min: input.min || '0', max: input.max || '100' };
                },
                undefined,
                { timeout: ACTION_TIMEOUT_MS },
              );
              return field.fill(valueDraw < 0.5 ? bounds.min : bounds.max, {
                timeout: ACTION_TIMEOUT_MS,
              });
            }
            return field.fill(TEXT_CORPUS[Math.floor(valueDraw * TEXT_CORPUS.length)] ?? '', {
              timeout: ACTION_TIMEOUT_MS,
            });
          });
        } catch (error) {
          if (!(await field.isVisible().catch(() => false))) return skipped;
          throw error;
        }
        return `change ${chosen.type} “${label}”`;
      },
    };
  }

  const selects = page.locator('select');
  const availableSelects = await available(selects);
  if (category === 'select') {
    const chosen = availableSelects[Math.floor(elementDraw * availableSelects.length)];
    if (!chosen) return navigate();
    const select = page.locator(`[${MONKEY_CONTROL_ATTRIBUTE}="${chosen.marker}"]`);
    return {
      description: `choose option in select index ${chosen.index}`,
      run: async () => {
        const skipped = `skipped select index ${chosen.index}, no longer on screen`;
        if (!(await select.isVisible().catch(() => false))) return skipped;
        const label = await labelOf(select).catch(() => null);
        if (label === null) return skipped;
        try {
          await test.step(`resolved select “${label}”`, async () => {
            const count = await select.locator('option').count();
            if (count > 0)
              await select.selectOption(
                { index: Math.floor(valueDraw * count) },
                { timeout: ACTION_TIMEOUT_MS },
              );
          });
        } catch (error) {
          if (!(await select.isVisible().catch(() => false))) return skipped;
          throw error;
        }
        return `choose option in “${label}”`;
      },
    };
  }

  if (category === 'escape') {
    return {
      description: 'press Escape',
      run: () => page.keyboard.press('Escape'),
    };
  }

  if (await page.evaluate(() => history.length > 1)) {
    return {
      description: 'browser Back',
      run: async () => {
        await page.goBack();
      },
    };
  }

  return navigate();
}

async function assertHealthy(
  page: Page,
  pageErrors: string[],
  firebaseRequests: string[],
): Promise<void> {
  const loading = page.getByText('読み込み中…', { exact: true });
  if (await loading.isVisible().catch(() => false))
    await expect(loading).toBeHidden({ timeout: 3000 });

  const layout = await page.evaluate(() => {
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0 &&
        !element.closest('[inert], [aria-hidden="true"]')
      );
    };
    const clippedText = [...document.querySelectorAll<HTMLElement>('h1,h2,h3,p,button,a,dd,label')]
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          style.overflowX === 'visible' &&
          style.whiteSpace !== 'nowrap' &&
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}: ${(element.textContent ?? '').trim().slice(0, 80)}`,
      );
    const dialogsOutsideViewport = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left < -1 ||
          rect.right > innerWidth + 1 ||
          rect.top < -1 ||
          rect.bottom > innerHeight + 1
        );
      })
      .map((element) => element.getAttribute('aria-label') || 'unnamed dialog');
    const elementsOutsideViewport = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .slice(0, 10)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()} left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} text=${(element.textContent ?? '').trim().slice(0, 40)}`;
      });

    return {
      errorScreen: document.body.textContent?.includes('問題が発生しました') ?? false,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      clippedText,
      dialogsOutsideViewport,
      elementsOutsideViewport,
      widths: {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      },
    };
  });

  expect(pageErrors.splice(0), 'uncaught browser errors').toEqual([]);
  expect(firebaseRequests, 'the e2e build must never reach Firebase').toEqual([]);
  expect(layout.errorScreen, 'the route error boundary rendered').toBe(false);
  expect(
    layout.horizontalOverflow,
    `the document overflowed horizontally: ${JSON.stringify({ widths: layout.widths, elements: layout.elementsOutsideViewport })}`,
  ).toBe(false);
  expect(layout.clippedText, 'visible text escaped its own box').toEqual([]);
  expect(layout.dialogsOutsideViewport, 'a dialog escaped the viewport').toEqual([]);
}

async function attachHistory(testInfo: TestInfo, seedValue: string, history: string[]) {
  await testInfo.attach('monkey-actions', {
    body: [`seed=${seedValue}`, `steps=${history.length}`, '', ...history].join('\n'),
    contentType: 'text/plain',
  });
}

const STALE_CONTROLS = [
  { categoryDraw: 0.5, element: 'input', expected: 'skipped field index 0, no longer on screen' },
  { categoryDraw: 0.6, element: 'select', expected: 'skipped select index 0, no longer on screen' },
];

for (const { categoryDraw, element, expected } of STALE_CONTROLS) {
  test(`skips a stale ${element} before resolving its label`, async ({ page }) => {
    await page.setContent('<main></main>');
    await page.evaluate((tagName) => {
      const control = document.createElement(tagName);
      control.setAttribute('aria-label', 'Monkey control');
      if (control instanceof HTMLSelectElement) control.add(new Option('Option'));
      document.body.append(control);
    }, element);

    const draws = [categoryDraw, 0, 0];
    const action = await chooseAction(page, () => draws.shift() ?? 0);
    await page.locator(element).evaluate((control) => control.remove());

    await expect(action.run()).resolves.toBe(expected);
  });
}

const STALE_TARGET_CONTROLS = [
  {
    categoryDraw: 0.5,
    element: 'input',
    expected: 'skipped field index 0, no longer on screen',
    survivingValue: 'untouched',
  },
  {
    categoryDraw: 0.6,
    element: 'select',
    expected: 'skipped select index 0, no longer on screen',
    survivingValue: 'one',
  },
];

for (const { categoryDraw, element, expected, survivingValue } of STALE_TARGET_CONTROLS) {
  test(`skips a stale ${element} without retargeting its sibling`, async ({ page }) => {
    await page.setContent('<main></main>');
    await page.evaluate((tagName) => {
      const makeControl = (id: string, value: string) => {
        const control = document.createElement(tagName);
        control.id = id;
        control.setAttribute('aria-label', 'Monkey control');
        if (control instanceof HTMLSelectElement) {
          control.add(new Option('One', 'one'));
          control.add(new Option('Two', 'two'));
        }
        control.setAttribute('value', value);
        return control;
      };
      const target = makeControl('target', 'target');
      const sibling = makeControl('surviving', 'untouched');
      document.body.append(target, sibling);
    }, element);

    const draws = [categoryDraw, 0, 0.9];
    const action = await chooseAction(page, () => draws.shift() ?? 0);
    await page.locator('#target').evaluate((control) => control.remove());

    await expect(action.run()).resolves.toBe(expected);
    await expect(page.locator('#surviving')).toHaveValue(survivingValue);
  });
}

for (const scenario of SCENARIOS) {
  test(`${scenario.name} survives random extreme input and navigation`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(30_000 + STEPS * 8_000);
    await page.setViewportSize(scenario.viewport);
    await seed(page, {
      signedIn: true,
      entries: MONKEY_ENTRIES,
      weak: ['monkey-word-2'],
      wordSets: [MONKEY_SET],
      sessions: [
        {
          id: 'monkey-session',
          mode: 'flashcard',
          filterLabel: `単語集:${MONKEY_SET.name}`,
          total: 12,
          correct: 7,
          // Snapshot taken from the entry itself, so the 200-character headword
          // this fixture exists to be hostile with reaches the history dialog
          // too, not only the word list.
          missed: [
            {
              entryId: MONKEY_WORD_1.id,
              headword: MONKEY_WORD_1.headword ?? '',
              reading: MONKEY_WORD_1.reading ?? '',
            },
          ],
          startedAt: '2026-06-23T00:00:00.000Z',
          finishedAt: '2026-06-23T00:05:00.000Z',
        },
      ],
    });

    const numericSeed = hashSeed(scenario.seed);
    const random = randomFor(numericSeed);
    const pageErrors: string[] = [];
    const firebaseRequests: string[] = [];
    const history: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    page.on('request', (request) => {
      if (
        /firestore\.googleapis\.com|firebaseio\.com|identitytoolkit|securetoken/.test(request.url())
      )
        firebaseRequests.push(request.url());
    });

    console.log(`[monkey] scenario=${scenario.name} seed=${scenario.seed} numeric=${numericSeed}`);
    await page.goto('/wordsets/monkey-set');

    try {
      await assertHealthy(page, pageErrors, firebaseRequests);
      for (let step = 1; step <= STEPS; step += 1) {
        const action = await chooseAction(page, random);
        const line = `${String(step).padStart(3, '0')}: ${action.description}`;
        history.push(line);
        await attachHistory(testInfo, scenario.seed, history);
        await test.step(line, async () => {
          const resolved = await action.run();
          if (resolved) {
            history[history.length - 1] = `${String(step).padStart(3, '0')}: ${resolved}`;
            await attachHistory(testInfo, scenario.seed, history);
          }
          await assertHealthy(page, pageErrors, firebaseRequests);
        });
      }
    } finally {
      await attachHistory(testInfo, scenario.seed, history);
    }
  });
}

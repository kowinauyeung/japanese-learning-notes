import {
  AIError,
  type GenerativeModel,
  GoogleAIBackend,
  getAI,
  getGenerativeModel,
} from 'firebase/ai';
import { EntryDraftingError, type EntryDraftingPort } from '@/domain/ports';
import { app } from '@/infra/firebase/client';

/**
 * The Gemini half of `EntryDraftingPort`.
 *
 * **`GoogleAIBackend` is the Gemini Developer API, and the alternative is not a
 * free one.** `AgentPlatformBackend` — which `@firebase/ai` documents as
 * "formerly known as the Vertex AI Gemini API", with `VertexAIBackend`
 * deprecated in its favour — requires the Blaze plan from its first request and
 * needs `aiplatform.googleapis.com`, which neither project has enabled. What it
 * adds over this one, regional pinning and wider file-URL support, this feature
 * does not use. Swapping is this line plus a change of billing plan.
 *
 * **No API key appears here or anywhere else in the bundle.** Firebase AI Logic
 * proxies the call and supplies the key on its own side, and App Check — already
 * initialised in `client.ts` — is what stops that proxy answering anybody else's
 * script. That is the whole reason this is a client module rather than the first
 * Cloud Function in this repository.
 */

/**
 * Flash rather than Pro, named here rather than configured.
 *
 * The no-cost tier covers the Flash family only, and filling a fixed schema for
 * one word is not a task a larger model answers better. Moving off this string
 * is a decision about money, so it should be a diff somebody reads.
 */
const MODEL = 'gemini-2.5-flash';

/**
 * `getAI` runs once, lazily, rather than at module scope.
 *
 * At module scope it would run in every build that imports the backend module —
 * including one whose project has never had the API enabled — and it would run
 * before the reader had asked for anything. Failing at import time turns a
 * feature that should be quietly absent into an app that does not start.
 */
let model: GenerativeModel | undefined;
let unavailable = false;

function ensureModel(): GenerativeModel | undefined {
  if (model || unavailable) return model;
  try {
    model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), { model: MODEL });
  } catch {
    // No AI Logic on this project, or the SDK refused to initialise. Recorded
    // rather than retried: it fails identically on every later attempt, and a
    // button that retries a permanent failure reads as a broken button.
    unavailable = true;
  }
  return model;
}

/**
 * Codes that mean this reader will never get an answer, however often they ask.
 *
 * Every one of them is a project or a build that was never wired up, so the
 * reader is told to use the prompt below instead of being invited to retry.
 * They are listed rather than matched loosely because the set is closed and
 * short, and a code added to the SDK later should fall through to `failed`
 * rather than be silently treated as permanent.
 */
const PERMANENT = new Set([
  'api-not-enabled',
  'no-api-key',
  'no-app-id',
  'no-project-id',
  'no-model',
  'unsupported',
]);

/**
 * Map the SDK's failure onto the four the reader can act on.
 *
 * **Quota has no code of its own, which is why the message is read at all.**
 * `AIErrorCode` has fourteen members and none of them is "you have run out";
 * the daily and per-minute limits arrive as an HTTP 429 wrapped in a generic
 * error whose status appears only in the text. The code is checked first, so a
 * code that is present always decides; the text is consulted only for the
 * conditions that never carry one.
 *
 * `response-error` is `blocked` rather than `failed` because that is what a
 * safety refusal surfaces as, and a refusal is the one failure a *different
 * word* might not reproduce — so it is the one worth saying "try another word"
 * about rather than "try again".
 */
function classify(error: unknown): EntryDraftingError {
  if (error instanceof AIError) {
    if (PERMANENT.has(error.code)) return new EntryDraftingError('unavailable');
    if (error.code === 'response-error') return new EntryDraftingError('blocked');
  }
  const text = error instanceof Error ? error.message : String(error);
  if (/\b429\b|quota|rate.?limit|exhausted/i.test(text)) return new EntryDraftingError('quota');
  if (/\b403\b|not.?enabled|unsupported.?user.?location/i.test(text)) {
    return new EntryDraftingError('unavailable');
  }
  return new EntryDraftingError('failed');
}

export const geminiEntryDrafting: EntryDraftingPort = {
  available: () => ensureModel() !== undefined,

  async draft(prompt) {
    const generative = ensureModel();
    if (!generative) throw new EntryDraftingError('unavailable');

    let text: string;
    try {
      const result = await generative.generateContent(prompt);
      // Inside the `try` on purpose: `text()` throws for a response that was
      // filtered, so the safety refusal arrives here rather than at the call
      // above, and `classify` is the only place that decides what it means.
      text = result.response.text();
    } catch (error) {
      throw classify(error);
    }

    // An empty reply is a failure the SDK does not raise — a response that
    // finished before writing anything resolves normally with no text. Left
    // alone it would reach `jsonToDraft` and be reported as invalid JSON, which
    // blames the parser for something that went wrong well upstream of it.
    if (!text.trim()) throw new EntryDraftingError('blocked');
    return text;
  },
};

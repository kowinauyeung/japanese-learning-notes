export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
export const GEMINI_MODEL_NAME_CONFIG_KEY = 'model_name';
export const GEMINI_REMOTE_CONFIG_FETCH_INTERVAL_MS = 5 * 60 * 1000;
export const GEMINI_REMOTE_CONFIG_FETCH_TIMEOUT_MS = 3_000;

/**
 * How long to wait for one drafting reply before giving up on it.
 *
 * Not a guess at how long the model takes — it answers this schema in seconds —
 * but a bound on how long a reader is asked to watch a control that may never
 * finish. See `deadline.ts` for the two awaits that have no bound of their own.
 *
 * Well under `@firebase/ai`'s own 180-second default, which is a ceiling for a
 * long generation rather than a number anybody waits out, and comfortably above
 * a slow but real answer, so a working request is never cut off to make the
 * failing one shorter.
 */
export const GEMINI_DRAFT_TIMEOUT_MS = 45_000;

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_NAME_CONFIG_KEY,
  GEMINI_REMOTE_CONFIG_FETCH_INTERVAL_MS,
  GEMINI_REMOTE_CONFIG_FETCH_TIMEOUT_MS,
} from '@/infra/ai/modelConfig';

const generateContent = vi.hoisted(() => vi.fn());
const getGenerativeModel = vi.hoisted(() => vi.fn(() => ({ generateContent })));
const remoteConfig = vi.hoisted<{
  defaultConfig: Record<string, string | number | boolean>;
  settings: { fetchTimeoutMillis: number; minimumFetchIntervalMillis: number };
}>(() => ({
  defaultConfig: {},
  settings: { fetchTimeoutMillis: 60_000, minimumFetchIntervalMillis: 43_200_000 },
}));
const cachedModel = vi.hoisted(() => ({ name: 'gemini-4.0-flash' }));
const remoteModel = vi.hoisted(() => ({ name: 'gemini-4.0-flash' }));
const ensureInitialized = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const fetchAndActivate = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const getValue = vi.hoisted(() => vi.fn(() => ({ asString: () => remoteModel.name })));

vi.mock('firebase/ai', () => ({
  AIError: class AIError extends Error {
    code = '';
  },
  GoogleAIBackend: class GoogleAIBackend {},
  getAI: vi.fn(() => ({})),
  getGenerativeModel,
}));
vi.mock('firebase/remote-config', () => ({
  ensureInitialized,
  fetchAndActivate,
  getRemoteConfig: vi.fn(() => remoteConfig),
  getValue,
}));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/app-check', () => ({
  ReCaptchaV3Provider: class ReCaptchaV3Provider {},
  initializeAppCheck: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  getAuth: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  remoteConfig.defaultConfig = {};
  remoteConfig.settings = { fetchTimeoutMillis: 60_000, minimumFetchIntervalMillis: 43_200_000 };
  cachedModel.name = 'gemini-4.0-flash';
  remoteModel.name = 'gemini-4.0-flash';
  ensureInitialized.mockResolvedValue(undefined);
  fetchAndActivate.mockResolvedValue(true);
  getValue.mockReturnValue({ asString: () => remoteModel.name });
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test');
  vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test');
  vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'test');
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test');
  vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '');
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('geminiEntryDrafting', () => {
  it('checks availability without fetching Remote Config during render', async () => {
    const { geminiEntryDrafting } = await import('@/infra/ai/entryDrafting');

    expect(geminiEntryDrafting.available()).toBe(true);

    // Availability is read during render, so it must not schedule network work
    // while the reader is typing or opening the import form.
    expect(ensureInitialized).not.toHaveBeenCalled();
    expect(fetchAndActivate).not.toHaveBeenCalled();
  });

  it('uses the Remote Config model name before drafting', async () => {
    generateContent.mockResolvedValueOnce({ response: { text: () => 'draft' } });
    const { geminiEntryDrafting } = await import('@/infra/ai/entryDrafting');

    await expect(geminiEntryDrafting.draft('prompt')).resolves.toBe('draft');

    // Without the cached value first, a reader can restart offline and regress
    // from a previously fixed model name to the retired bundled fallback.
    expect(ensureInitialized).toHaveBeenCalledWith(remoteConfig);
    // Without the fresh fetch, a console update cannot repair the next draft
    // after the operator publishes a replacement model name.
    expect(fetchAndActivate).toHaveBeenCalledWith(remoteConfig);
    // If this default drifts, first-load readers can hit a retired bundled
    // model before the console value has ever reached their browser.
    expect(remoteConfig.defaultConfig).toEqual({
      [GEMINI_MODEL_NAME_CONFIG_KEY]: DEFAULT_GEMINI_MODEL,
    });
    // If these settings drift, an emergency model-name change can take too long
    // to reach readers, or a slow Remote Config call can block drafting.
    expect(remoteConfig.settings).toEqual({
      fetchTimeoutMillis: GEMINI_REMOTE_CONFIG_FETCH_TIMEOUT_MS,
      minimumFetchIntervalMillis: GEMINI_REMOTE_CONFIG_FETCH_INTERVAL_MS,
    });
    // This is the user-visible recovery path: after the console parameter is
    // published, the next draft must ask the replacement model, not the retired
    // bundled default.
    expect(getGenerativeModel).toHaveBeenLastCalledWith(expect.anything(), {
      model: remoteModel.name,
    });
  });

  it('uses the cached Remote Config model when a fresh fetch fails', async () => {
    cachedModel.name = 'gemini-4.1-flash';
    fetchAndActivate.mockRejectedValueOnce(new Error('remote config unavailable'));
    getValue.mockReturnValue({ asString: () => cachedModel.name });
    generateContent.mockResolvedValueOnce({ response: { text: () => 'draft' } });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { geminiEntryDrafting } = await import('@/infra/ai/entryDrafting');

      await expect(geminiEntryDrafting.draft('prompt')).resolves.toBe('draft');

      expect(getValue).toHaveBeenCalledWith(remoteConfig, GEMINI_MODEL_NAME_CONFIG_KEY);
      expect(getGenerativeModel).toHaveBeenLastCalledWith(expect.anything(), {
        model: cachedModel.name,
      });
    } finally {
      error.mockRestore();
    }
  });

  it('becomes unavailable after a constructed model reports a permanent 404', async () => {
    generateContent.mockRejectedValueOnce(new Error('404 model no longer available'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { geminiEntryDrafting } = await import('@/infra/ai/entryDrafting');

      expect(geminiEntryDrafting.available()).toBe(true);
      await expect(geminiEntryDrafting.draft('prompt')).rejects.toEqual(
        expect.objectContaining({ reason: 'unavailable' }),
      );
      expect(geminiEntryDrafting.available()).toBe(false);
    } finally {
      error.mockRestore();
    }
  });
});

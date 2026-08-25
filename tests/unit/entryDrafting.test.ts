import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.hoisted(() => vi.fn());
const getGenerativeModel = vi.hoisted(() => vi.fn(() => ({ generateContent })));
const remoteConfig = vi.hoisted<{
  defaultConfig: Record<string, string | number | boolean>;
  settings: { fetchTimeoutMillis: number; minimumFetchIntervalMillis: number };
}>(() => ({
  defaultConfig: {},
  settings: { fetchTimeoutMillis: 60_000, minimumFetchIntervalMillis: 43_200_000 },
}));
const fetchAndActivate = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const getValue = vi.hoisted(() => vi.fn(() => ({ asString: () => 'gemini-4.0-flash' })));

vi.mock('firebase/ai', () => ({
  AIError: class AIError extends Error {
    code = '';
  },
  GoogleAIBackend: class GoogleAIBackend {},
  getAI: vi.fn(() => ({})),
  getGenerativeModel,
}));
vi.mock('firebase/remote-config', () => ({
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
  fetchAndActivate.mockResolvedValue(true);
  getValue.mockReturnValue({ asString: () => 'gemini-4.0-flash' });
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
  it('uses the Remote Config model name before drafting', async () => {
    generateContent.mockResolvedValueOnce({ response: { text: () => 'draft' } });
    const { geminiEntryDrafting } = await import('@/infra/ai/entryDrafting');

    await expect(geminiEntryDrafting.draft('prompt')).resolves.toBe('draft');

    expect(fetchAndActivate).toHaveBeenCalledWith(remoteConfig);
    expect(remoteConfig.defaultConfig).toEqual({ model_name: 'gemini-3.6-flash' });
    expect(remoteConfig.settings).toEqual({
      fetchTimeoutMillis: 3_000,
      minimumFetchIntervalMillis: 5 * 60 * 1000,
    });
    expect(getGenerativeModel).toHaveBeenLastCalledWith(expect.anything(), {
      model: 'gemini-4.0-flash',
    });
  });

  it('falls back to the bundled model when Remote Config cannot fetch', async () => {
    fetchAndActivate.mockRejectedValueOnce(new Error('remote config unavailable'));
    generateContent.mockResolvedValueOnce({ response: { text: () => 'draft' } });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { geminiEntryDrafting } = await import('@/infra/ai/entryDrafting');

      await expect(geminiEntryDrafting.draft('prompt')).resolves.toBe('draft');

      expect(getValue).not.toHaveBeenCalled();
      expect(getGenerativeModel).toHaveBeenLastCalledWith(expect.anything(), {
        model: 'gemini-3.6-flash',
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

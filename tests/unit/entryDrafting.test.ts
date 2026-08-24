import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.hoisted(() => vi.fn());
const getGenerativeModel = vi.hoisted(() => vi.fn(() => ({ generateContent })));

vi.mock('firebase/ai', () => ({
  AIError: class AIError extends Error {
    code = '';
  },
  GoogleAIBackend: class GoogleAIBackend {},
  getAI: vi.fn(),
  getGenerativeModel,
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
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test');
  vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test');
  vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'test');
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test');
  vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('geminiEntryDrafting', () => {
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

import type { IsoDateTime } from './common';

/** Simplified Chinese is deliberately absent. */
export const UI_LANGUAGES = ['en', 'ja', 'zh-Hant', 'ko', 'es'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface UserProfile {
  uid: string;
  /** Shown as the creator on anything this user publishes. */
  nickname: string;
  language: UiLanguage;
  /** Which language the entry-creation AI prompt should translate into. */
  translationLanguage: UiLanguage;
  /**
   * The durable copy. `index.html` still writes and reads localStorage before
   * first paint so the page never flashes the wrong theme; this value is what
   * syncs that choice across devices.
   */
  theme: ThemePreference;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type UserProfileDraft = Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>;

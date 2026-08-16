import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { THEME_PREFERENCES, TRANSLATION_LANGUAGES, UI_LANGUAGES } from '@/domain/user';
import type {
  ThemePreference,
  TranslationLanguage,
  UiLanguage,
  UserProfileDraft,
} from '@/domain/user';
import { useI18n } from '@/i18n/context';
import type { MessageKey } from '@/i18n/messages';
import { useLoadErrorMessage } from '@/i18n/useLoadErrorMessage';
import { useUserSettings } from '@/lib/userSettingsContext';
import type { UserSettingsValue } from '@/lib/userSettingsContext';

const UI_LANGUAGE_LABELS: Record<UiLanguage, string> = {
  en: 'English',
  ja: '日本語',
  'zh-Hant': '中文',
  ko: '한국어',
  es: 'Español',
};

const TRANSLATION_LANGUAGE_LABELS: Record<TranslationLanguage, string> = {
  ...UI_LANGUAGE_LABELS,
  'zh-Hant': '中文',
  'yue-Hant': '廣東話',
};

const THEME_LABEL_KEYS: Record<ThemePreference, MessageKey> = {
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
  system: 'settings.themeSystem',
};

export function Component() {
  const { t } = useI18n();
  const { profile, loading, saving, error, preview, save } = useUserSettings();
  const errorMessage = useLoadErrorMessage(error);

  if (loading) return <p className="text-sm text-muted">{t('settings.loading')}</p>;

  return (
    <SettingsForm
      key={profile.uid}
      profile={profile}
      saving={saving}
      error={errorMessage}
      preview={preview}
      save={save}
    />
  );
}

function SettingsForm({
  profile,
  saving,
  error,
  preview,
  save,
}: Pick<UserSettingsValue, 'profile' | 'saving' | 'preview' | 'save'> & {
  error: string | null;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<UserProfileDraft>({
    nickname: profile.nickname,
    language: profile.language,
    translationLanguage: profile.translationLanguage,
    theme: profile.theme,
  });
  const [baseline, setBaseline] = useState<UserProfileDraft>(draft);
  const [saved, setSaved] = useState(false);
  const dirty = !sameSettings(draft, baseline);
  const blocker = useBlocker(dirty);

  useEffect(() => () => preview(null), [preview]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('settings.unsavedLeave'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  const update = <K extends keyof UserProfileDraft>(key: K, value: UserProfileDraft[K]) => {
    const next = { ...draft, [key]: value };
    setSaved(false);
    setDraft(next);
    preview(next);
  };

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-bold">{t('settings.title')}</h1>
      <form
        className="mt-5 space-y-5 rounded-card bg-card p-6 shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          const next = { ...draft, nickname: draft.nickname.trim() };
          setDraft(next);
          preview(next);
          void save(next).then(() => {
            setBaseline(next);
            setSaved(true);
          });
        }}
      >
        <Field label={t('settings.nickname')} hint={t('settings.nicknameHint')}>
          <input
            value={draft.nickname}
            maxLength={50}
            onChange={(event) => update('nickname', event.target.value)}
            className="min-h-11 w-full rounded-panel border border-line bg-bg px-4 text-sm"
          />
        </Field>

        <Field label={t('settings.displayLanguage')}>
          <LanguageSelect
            value={draft.language}
            options={UI_LANGUAGES}
            labels={UI_LANGUAGE_LABELS}
            onChange={(value) => update('language', value)}
          />
        </Field>

        <Field label={t('settings.translationLanguage')} hint={t('settings.translationHint')}>
          <LanguageSelect
            value={draft.translationLanguage}
            options={TRANSLATION_LANGUAGES}
            labels={TRANSLATION_LANGUAGE_LABELS}
            onChange={(value) => update('translationLanguage', value)}
          />
        </Field>

        <Field label={t('settings.theme')}>
          <select
            value={draft.theme}
            onChange={(event) => update('theme', event.target.value as ThemePreference)}
            className="min-h-11 w-full rounded-panel border border-line bg-bg px-4 text-sm"
          >
            {THEME_PREFERENCES.map((value) => (
              <option key={value} value={value}>
                {t(THEME_LABEL_KEYS[value])}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={saving || !draft.nickname.trim()}
          className="min-h-11 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {saving ? t('settings.saving') : t('settings.save')}
        </button>
        {dirty && (
          <p className="text-center text-xs font-medium text-danger">{t('settings.unsaved')}</p>
        )}
        {saved && <p className="text-center text-xs text-accent">{t('settings.saved')}</p>}
        {error && <p className="text-center text-xs text-danger">{error}</p>}
      </form>
    </section>
  );
}

function sameSettings(left: UserProfileDraft, right: UserProfileDraft): boolean {
  return (
    left.nickname === right.nickname &&
    left.language === right.language &&
    left.translationLanguage === right.translationLanguage &&
    left.theme === right.theme
  );
}

function LanguageSelect<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels: Readonly<Record<T, string>>;
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="min-h-11 w-full rounded-panel border border-line bg-bg px-4 text-sm"
    >
      {options.map((language) => (
        <option key={language} value={language}>
          {labels[language]}
        </option>
      ))}
    </select>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

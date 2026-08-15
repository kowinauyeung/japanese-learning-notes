import { useState } from 'react';
import type { ReactNode } from 'react';
import { UI_LANGUAGES } from '@/domain/user';
import type { ThemePreference, UiLanguage, UserProfileDraft } from '@/domain/user';
import { useUserSettings } from '@/lib/userSettingsContext';
import type { UserSettingsValue } from '@/lib/userSettingsContext';

const LANGUAGE_LABELS: Record<UiLanguage, string> = {
  en: 'English',
  ja: '日本語',
  'zh-Hant': '繁體中文',
  ko: '한국어',
  es: 'Español',
};

const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'ライト',
  dark: 'ダーク',
  system: '端末の設定に合わせる',
};

export function Component() {
  const { profile, loading, saving, error, save } = useUserSettings();

  if (loading) return <p className="text-sm text-muted">設定を読み込んでいます…</p>;

  return (
    <SettingsForm key={profile.uid} profile={profile} saving={saving} error={error} save={save} />
  );
}

function SettingsForm({
  profile,
  saving,
  error,
  save,
}: Pick<UserSettingsValue, 'profile' | 'saving' | 'error' | 'save'>) {
  const [draft, setDraft] = useState<UserProfileDraft>({
    nickname: profile.nickname,
    language: profile.language,
    translationLanguage: profile.translationLanguage,
    theme: profile.theme,
  });
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof UserProfileDraft>(key: K, value: UserProfileDraft[K]) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-bold">設定</h1>
      <form
        className="mt-5 space-y-5 rounded-card bg-card p-6 shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          const next = { ...draft, nickname: draft.nickname.trim() };
          setDraft(next);
          void save(next).then(() => setSaved(true));
        }}
      >
        <Field label="ニックネーム" hint="公開したコンテンツの作成者名として表示されます。">
          <input
            value={draft.nickname}
            maxLength={50}
            onChange={(event) => update('nickname', event.target.value)}
            className="min-h-11 w-full rounded-panel border border-line bg-bg px-4 text-sm"
          />
        </Field>

        <Field label="表示言語">
          <LanguageSelect value={draft.language} onChange={(value) => update('language', value)} />
        </Field>

        <Field label="AI 翻訳言語" hint="単語追加用の AI プロンプトで使う既定の翻訳先です。">
          <LanguageSelect
            value={draft.translationLanguage}
            onChange={(value) => update('translationLanguage', value)}
          />
        </Field>

        <Field label="テーマ">
          <select
            value={draft.theme}
            onChange={(event) => update('theme', event.target.value as ThemePreference)}
            className="min-h-11 w-full rounded-panel border border-line bg-bg px-4 text-sm"
          >
            {Object.entries(THEME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={saving || !draft.nickname.trim()}
          className="min-h-11 w-full rounded-pill bg-accent text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {saving ? '保存しています…' : '設定を保存'}
        </button>
        {saved && <p className="text-center text-xs text-accent">保存しました。</p>}
        {error && <p className="text-center text-xs text-danger">{error}</p>}
      </form>
    </section>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: UiLanguage;
  onChange: (v: UiLanguage) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as UiLanguage)}
      className="min-h-11 w-full rounded-panel border border-line bg-bg px-4 text-sm"
    >
      {UI_LANGUAGES.map((language) => (
        <option key={language} value={language}>
          {LANGUAGE_LABELS[language]}
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

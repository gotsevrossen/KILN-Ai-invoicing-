import type { Lang } from '../i18n/index.tsx';

// Voice note text helpers, kept apart from the phone's speech module so they can be tested.

export type VoiceLang = 'app' | Lang;

/** The language a voice note is heard in, and the locale the phone listens for. US English or US Spanish. */
export function voiceLocale(setting: VoiceLang, appLang: Lang): { lang: Lang; locale: 'en-US' | 'es-US' } {
  const lang = setting === 'app' ? appLang : setting;
  return { lang, locale: lang === 'es' ? 'es-US' : 'en-US' };
}

/**
 * Joins what the phone heard. Android sends each pause as its own final piece; iOS sends one
 * growing text. `finals` are the pieces already done, `partial` the one still being heard.
 */
export function joinHeard(finals: string[], partial: string): string {
  return [...finals, partial].map((s) => s.trim()).filter(Boolean).join(' ');
}

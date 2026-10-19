import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import en, { type TKey } from './en';
import es from './es';

export type Lang = 'en' | 'es';
export type TOptions = Record<string, string | number>;
export type TFn = (key: TKey, options?: TOptions) => string;

const i18n = new I18n({ en, es });
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

function deviceLang(): Lang {
  return getLocales()[0]?.languageCode === 'es' ? 'es' : 'en';
}

/** Locale for money and dates. US English or US Spanish. */
export function localeFor(lang: Lang): string {
  return lang === 'es' ? 'es-US' : 'en-US';
}

/** Text in a given language. Customer-facing pages use the customer's language, not the owner's. */
export function translate(lang: Lang, key: TKey, options?: TOptions): string {
  return i18n.t(key, { ...options, locale: lang });
}

type LangContext = { lang: Lang; setLang: (lang: Lang) => void; t: TFn };

const Ctx = createContext<LangContext | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(deviceLang);
  const t = useCallback<TFn>((key, options) => translate(lang, key, options), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider');
  return ctx;
}

/** A translator for someone else's language (a customer's). */
export function useTFor(lang: Lang): TFn {
  return useCallback<TFn>((key, options) => translate(lang, key, options), [lang]);
}

/**
 * i18n shim — VibeStudio is English-only (the host app's 6-language
 * @vibestudio/i18n package was NOT extracted). This module keeps every
 * export the call sites use (useI18n, useLocale, useTranslation, useLb,
 * I18nProvider, LANGUAGES, …) so existing pages compile unchanged, while
 * resolving everything to English. Reintroduce a real i18n package later
 * if multi-language support is wanted.
 */
import { createContext, useContext, ReactNode } from "react";

export type Language = "en";
export interface LanguageInfo {
  code: Language;
  label: string;
  dir: "ltr" | "rtl";
}
/** Inline map like { en: 'Reports', de: 'Berichte', … } — extra keys ignored. */
export type InlineTranslation = { en?: string; [lang: string]: string | undefined };

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGES: LanguageInfo[] = [{ code: "en", label: "English", dir: "ltr" }];
export function getLanguageInfo(_code?: string): LanguageInfo {
  return LANGUAGES[0];
}

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  dir: "ltr" | "rtl";
  isRtl: boolean;
}

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (key, fallback) => fallback ?? key,
  dir: "ltr",
  isRtl: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const value: I18nContextType = {
    lang: "en",
    setLang: () => {},
    t: (key, fallback) => fallback ?? key,
    dir: "ltr",
    isRtl: false,
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Inline localization: L({ en: 'Reports', de: '…' }) → the English string. */
export function useLocale() {
  return (texts: InlineTranslation) => texts.en ?? Object.values(texts).find(Boolean) ?? "";
}

export function useTranslation() {
  const { t, lang, dir, isRtl } = useContext(I18nContext);
  return { t, lang, dir, isRtl };
}

/** Bilingual helper kept for call-site compatibility — returns the English text. */
export function useLb() {
  return function lb(en: string, _de?: string, extras?: InlineTranslation): string {
    return extras?.en ?? en;
  };
}

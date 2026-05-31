import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  translations,
  LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguageInfo,
  type Language,
  type LanguageInfo,
  type InlineTranslation,
} from '@vibestudio/i18n';

// Re-export so existing `import { Language, LANGUAGES } from '@/lib/i18n'` call sites keep working.
export { LANGUAGES, DEFAULT_LANGUAGE, getLanguageInfo };
export type { Language, LanguageInfo, InlineTranslation };

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  dir: 'ltr' | 'rtl';
  isRtl: boolean;
}

const I18nContext = createContext<I18nContextType>({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t: (key) => key,
  dir: 'ltr',
  isRtl: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  // German is the platform default (DEFAULT_LANGUAGE = 'de' in
  // @vibestudio/i18n/languages.ts). The provider previously hardcoded 'en'
  // which silently overrode the package default — fixed 2026-05-12.
  const [lang, setLangState] = useState<Language>(DEFAULT_LANGUAGE);
  const [mounted, setMounted] = useState(false);

  // Read stored language after mount to avoid SSR hydration mismatch.
  // First visit (no localStorage entry) → write DEFAULT_LANGUAGE in so
  // subsequent renders are deterministic and the cross-tab sync handler
  // has a value to react to.
  useEffect(() => {
    const stored = localStorage.getItem('acca_language') as Language;
    if (stored && translations[stored]) {
      setLangState(stored);
      const info = getLanguageInfo(stored);
      if (info) {
        document.documentElement.dir = info.dir;
        document.documentElement.lang = stored;
      }
    } else {
      // First-time visitor — persist the German default so the user's
      // next session, every tab, and every role share the same starting
      // language.
      localStorage.setItem('acca_language', DEFAULT_LANGUAGE);
      const info = getLanguageInfo(DEFAULT_LANGUAGE);
      if (info) {
        document.documentElement.dir = info.dir;
        document.documentElement.lang = DEFAULT_LANGUAGE;
      }
    }
    setMounted(true);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const handler = () => {
      const stored = localStorage.getItem('acca_language') as Language;
      if (stored && translations[stored] && stored !== lang) {
        setLangState(stored);
        const info = getLanguageInfo(stored);
        if (info) {
          document.documentElement.dir = info.dir;
          document.documentElement.lang = stored;
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [lang]);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('acca_language', newLang);
    const langInfo = getLanguageInfo(newLang);
    if (langInfo) {
      document.documentElement.dir = langInfo.dir;
      document.documentElement.lang = newLang;
    }
  }, []);

  const t = useCallback((key: string, fallback?: string): string => {
    // Lookup chain: selected language → DEFAULT_LANGUAGE (de) → English
    // → fallback string → key. Two-step language fallback so a missing
    // German string falls through to English (the most-complete locale)
    // before showing the raw key.
    return translations[lang]?.[key]
      || translations[DEFAULT_LANGUAGE]?.[key]
      || translations['en']?.[key]
      || fallback
      || key;
  }, [lang]);

  const langInfo = getLanguageInfo(lang);
  const dir = langInfo?.dir || 'ltr';
  const isRtl = dir === 'rtl';

  // Until mounted, render with DEFAULT_LANGUAGE to match SSR — no flash
  // of an English-then-German switch on every first paint.
  return (
    <I18nContext.Provider value={{ lang: mounted ? lang : DEFAULT_LANGUAGE, setLang, t, dir: mounted ? dir : 'ltr', isRtl: mounted ? isRtl : false }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Multi-language inline localization helper.
 * Usage: const L = useLocale();
 *        L({ en: 'Reports', de: 'Berichte', tr: 'Raporlar', fa: 'گزارش‌ها', ar: 'التقارير', uk: 'Звіти' })
 */
export function useLocale() {
  const { lang } = useContext(I18nContext);
  // Lookup order matches the global `t()`: selected → de (platform
  // default) → en (most-complete fallback) → empty. Inline calls that
  // forget German still render something readable.
  return (texts: InlineTranslation) => texts[lang] || texts[DEFAULT_LANGUAGE] || texts.en || '';
}

export function useTranslation() {
  const { t, lang, dir, isRtl } = useContext(I18nContext);
  return { t, lang, dir, isRtl };
}

/**
 * Inline bilingual helper — shared replacement for the many per-page
 * `const lb = (en, de) => de ? de : en` definitions.
 *
 * Two-arg form matches existing call sites: returns `de` when lang === 'de',
 * otherwise `en`. For proper tr/fa/ar/uk coverage, pass an `extras` object:
 *   lb('Reports', 'Berichte', { tr: 'Raporlar', fa: '...', ar: '...', uk: '...' })
 *
 * When a language is missing from `extras`, falls back to `en`.
 */
export function useLb() {
  const { lang } = useContext(I18nContext);
  return function lb(en: string, de: string, extras?: InlineTranslation): string {
    if (extras && extras[lang]) return extras[lang]!;
    if (lang === 'de') return de;
    return en;
  };
}

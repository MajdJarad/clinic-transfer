import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, translations, type Locale, type LocaleMeta } from './translations';

interface I18nContextValue {
  locale: Locale;
  meta: LocaleMeta;
  dir: 'rtl' | 'ltr';
  intl: string;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const KEY = 'transfer_locale';

function initialLocale(): Locale {
  const stored = localStorage.getItem(KEY);
  if (stored === 'ar' || stored === 'en' || stored === 'tr') return stored;
  return 'ar';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const meta = useMemo(() => LOCALES.find((l) => l.code === locale)!, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = meta.dir;
    localStorage.setItem(KEY, locale);
  }, [locale, meta.dir]);

  const value = useMemo<I18nContextValue>(() => {
    const dict = translations[locale];
    return {
      locale,
      meta,
      dir: meta.dir,
      intl: meta.intl,
      setLocale,
      t: (key, vars) => {
        let str = dict[key] ?? translations.ar[key] ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
          }
        }
        return str;
      },
    };
  }, [locale, meta]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

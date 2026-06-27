import { useEffect, useState } from 'react';
import { activateLocale, i18n, supportedLocales, type SupportedLocale } from '../i18n';

const STORAGE_KEY = 'fitword.locale';

function resolveInitialLocale(): SupportedLocale {
  return supportedLocales.includes(i18n.locale as SupportedLocale) ? (i18n.locale as SupportedLocale) : 'zh-CN';
}

export function useLocale() {
  const [locale, setLocale] = useState<SupportedLocale>(resolveInitialLocale);

  useEffect(() => {
    activateLocale(locale);
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  return { locale, setLocale } as const;
}

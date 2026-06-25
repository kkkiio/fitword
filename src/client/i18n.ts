import { i18n } from '@lingui/core';
import { messages as enMessages } from '../locales/en/messages.po';
import { messages as zhMessages } from '../locales/zh-CN/messages.po';

export const defaultLocale = 'zh-CN';
export const supportedLocales = ['zh-CN', 'en'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export function activateLocale(locale: SupportedLocale = defaultLocale) {
  const loadedMessages = {
    'zh-CN': zhMessages,
    en: enMessages,
  };
  const activeLocale = supportedLocales.includes(locale) ? locale : defaultLocale;

  i18n.load(loadedMessages);
  i18n.activate(activeLocale);

  document.documentElement.lang = activeLocale;
}

export { i18n };

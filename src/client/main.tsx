import { I18nProvider } from '@lingui/react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { activateLocale, i18n, supportedLocales, type SupportedLocale } from './i18n';
import './style.css';

const savedLocale = window.localStorage.getItem('fitword.locale') as SupportedLocale | null;
activateLocale(savedLocale && supportedLocales.includes(savedLocale) ? savedLocale : 'zh-CN');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);

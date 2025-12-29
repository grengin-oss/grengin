import { addMessages, init, getLocaleFromNavigator } from 'svelte-i18n';

import en from './locales/en.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import es from './locales/es.json';
import ko from './locales/ko.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';

export const SUPPORTED_LOCALES = {
  en: 'English',
  fr: 'Français',
  ja: '日本語',
  es: 'Español',
  ko: '한국어',
  pt: 'Português',
  zh: '中文'
} as const;

export type SupportedLocale = keyof typeof SUPPORTED_LOCALES;

addMessages('en', en);
addMessages('fr', fr);
addMessages('ja', ja);
addMessages('es', es);
addMessages('ko', ko);
addMessages('pt', pt);
addMessages('zh', zh);

init({
  fallbackLocale: 'en',
  initialLocale: getLocaleFromNavigator()
});

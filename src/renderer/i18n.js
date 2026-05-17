import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

const STORAGE_KEY = 'anydownload-gui-settings-v1';

const resources = {
  en: { translation: en },
  'zh-TW': { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko }
};

const SUPPORTED = new Set(Object.keys(resources));

/** Read saved language from persisted GUI settings (renderer only). */
function readInitialLng() {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw);
    const lng = s && typeof s.lng === 'string' ? s.lng.trim() : '';
    if (lng && SUPPORTED.has(lng)) return lng;
  } catch {
    /* ignore */
  }
  return undefined;
}

i18n.use(initReactI18next).init({
  resources,
  lng: readInitialLng() || 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false // react already safes from xss
  }
});

export { STORAGE_KEY };
export default i18n;

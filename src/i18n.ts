import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en/translation.json';
import faTranslation from './locales/fa/translation.json';

const savedLang = localStorage.getItem('pctweak_lang') || 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslation },
    fa: { translation: faTranslation },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export const setAppLanguage = (lang: 'en' | 'fa') => {
  i18n.changeLanguage(lang);
  localStorage.setItem('pctweak_lang', lang);
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
};

// Initial direction setting
document.documentElement.dir = savedLang === 'fa' ? 'rtl' : 'ltr';
document.documentElement.lang = savedLang;

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation files
import ptCommon from './locales/pt/common.json';
import ptNavigation from './locales/pt/navigation.json';
import ptDashboard from './locales/pt/dashboard.json';
import ptStudents from './locales/pt/students.json';
import ptClasses from './locales/pt/classes.json';
import ptMaterials from './locales/pt/materials.json';
import ptFinancial from './locales/pt/financial.json';
import ptSettings from './locales/pt/settings.json';
import ptAuth from './locales/pt/auth.json';
import ptSubscription from './locales/pt/subscription.json';
import ptExpenses from './locales/pt/expenses.json';

import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enDashboard from './locales/en/dashboard.json';
import enStudents from './locales/en/students.json';
import enClasses from './locales/en/classes.json';
import enMaterials from './locales/en/materials.json';
import enFinancial from './locales/en/financial.json';
import enSettings from './locales/en/settings.json';
import enAuth from './locales/en/auth.json';
import enSubscription from './locales/en/subscription.json';
import enExpenses from './locales/en/expenses.json';

const resources = {
  pt: {
    common: ptCommon,
    navigation: ptNavigation,
    dashboard: ptDashboard,
    students: ptStudents,
    classes: ptClasses,
    materials: ptMaterials,
    financial: ptFinancial,
    settings: ptSettings,
    auth: ptAuth,
    subscription: ptSubscription,
    expenses: ptExpenses,
  },
  en: {
    common: enCommon,
    navigation: enNavigation,
    dashboard: enDashboard,
    students: enStudents,
    classes: enClasses,
    materials: enMaterials,
    financial: enFinancial,
    settings: enSettings,
    auth: enAuth,
    subscription: enSubscription,
    expenses: enExpenses,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'pt',
    lng: 'pt', // default language
    debug: true, // Temporariamente para debug
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    interpolation: {
      escapeValue: false,
    },

    ns: ['common', 'navigation', 'dashboard', 'students', 'classes', 'materials', 'financial', 'settings', 'auth', 'subscription', 'expenses'],
    defaultNS: 'common',
  });

export default i18n;
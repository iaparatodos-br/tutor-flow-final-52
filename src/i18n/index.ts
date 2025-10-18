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
import ptNotifications from './locales/pt/notifications.json';
import ptCancellation from './locales/pt/cancellation.json';
import ptArchive from './locales/pt/archive.json';
import ptBilling from './locales/pt/billing.json';
import ptServices from './locales/pt/services.json';
import ptPlans from './locales/pt/plans.json';
import ptReports from './locales/pt/reports.json';
import ptAmnesty from './locales/pt/amnesty.json';
import ptAvailability from './locales/pt/availability.json';

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
import enNotifications from './locales/en/notifications.json';
import enCancellation from './locales/en/cancellation.json';
import enArchive from './locales/en/archive.json';
import enBilling from './locales/en/billing.json';
import enServices from './locales/en/services.json';
import enPlans from './locales/en/plans.json';
import enReports from './locales/en/reports.json';
import enAmnesty from './locales/en/amnesty.json';
import enAvailability from './locales/en/availability.json';

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
    notifications: ptNotifications,
    cancellation: ptCancellation,
    archive: ptArchive,
    billing: ptBilling,
    services: ptServices,
    plans: ptPlans,
    reports: ptReports,
    amnesty: ptAmnesty,
    availability: ptAvailability,
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
    notifications: enNotifications,
    cancellation: enCancellation,
    archive: enArchive,
    billing: enBilling,
    services: enServices,
    plans: enPlans,
    reports: enReports,
    amnesty: enAmnesty,
    availability: enAvailability,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'pt',
    lng: 'pt', // default language
    debug: false,
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    interpolation: {
      escapeValue: false,
    },

    ns: ['common', 'navigation', 'dashboard', 'students', 'classes', 'materials', 'financial', 'settings', 'auth', 'subscription', 'expenses', 'notifications', 'cancellation', 'archive', 'billing', 'services', 'plans', 'reports', 'amnesty', 'availability'],
    defaultNS: 'common',

    // Handler para keys faltando
    saveMissing: true,
    missingKeyHandler: (lng, ns, key) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`🌐 Missing translation: [${ns}] ${key} for language ${lng}`);
      }
    },
  });

export default i18n;
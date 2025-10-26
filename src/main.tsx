import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';

// ============================================
// INICIALIZAÇÃO DO COOKIE CONSENT (ANTES DO REACT)
// ============================================
import 'vanilla-cookieconsent/dist/cookieconsent.css';
import * as CookieConsent from 'vanilla-cookieconsent';
import { cookieConsentConfig } from './config/cookieConsent.config';

// Executar a biblioteca ANTES do React iniciar
CookieConsent.run(cookieConsentConfig);

// Expor globalmente para uso em componentes
(window as any).CookieConsent = CookieConsent;

console.info('[CookieConsent] Inicializado antes do React');
// ============================================

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';

// Importar apenas o CSS do Cookie Consent
// A inicialização será feita no App.tsx seguindo a documentação oficial
import 'vanilla-cookieconsent/dist/cookieconsent.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>,
);

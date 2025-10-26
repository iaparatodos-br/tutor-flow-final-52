import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';

// IMPORTAR COOKIE CONSENT
import 'vanilla-cookieconsent/dist/cookieconsent.css';
import * as CookieConsent from 'vanilla-cookieconsent';

// CONFIGURAR E RODAR ANTES DO REACT
(CookieConsent.run as any)({
  autoclear_cookies: true,
  page_scripts: true,
  cookie_expiration: 365,
  
  categories: {
    necessary: {
      enabled: true,
      readOnly: true
    },
    analytics: {
      enabled: false,
      readOnly: false
    },
    marketing: {
      enabled: false,
      readOnly: false
    }
  },

  language: {
    default: 'pt',
    autoDetect: 'browser',
    translations: {
      pt: {
        consent_modal: {
          title: '🍪 Este site usa cookies',
          description: 'Usamos cookies para garantir a melhor experiência. Cookies essenciais são necessários para o funcionamento do site (autenticação, pagamentos). Você pode escolher permitir cookies analíticos para nos ajudar a melhorar a plataforma.',
          primary_btn: {
            text: 'Aceitar todos',
            role: 'accept_all'
          },
          secondary_btn: {
            text: 'Rejeitar não essenciais',
            role: 'accept_necessary'
          },
          settings_btn: {
            text: 'Gerenciar preferências',
            role: 'settings'
          }
        },
        settings_modal: {
          title: 'Preferências de Cookies',
          save_settings_btn: 'Salvar preferências',
          accept_all_btn: 'Aceitar todos',
          reject_all_btn: 'Rejeitar não essenciais',
          close_btn_label: 'Fechar',
          cookie_table_headers: [
            { col1: 'Nome' },
            { col2: 'Provedor' },
            { col3: 'Finalidade' },
            { col4: 'Validade' }
          ],
          blocks: [
            {
              title: 'Como usamos cookies? 📋',
              description: 'Cookies são pequenos arquivos salvos no seu navegador. Eles nos ajudam a reconhecer você, manter sua sessão ativa e melhorar sua experiência. Você tem total controle sobre quais cookies aceitar. <a href="/legal" class="cc-link">Leia nossa Política de Cookies</a> para mais detalhes.'
            },
            {
              title: 'Cookies Estritamente Necessários',
              description: 'Esses cookies são essenciais para o funcionamento básico da plataforma. Eles gerenciam sua autenticação, processam pagamentos via Stripe e garantem a segurança das suas transações. Sem eles, você não conseguirá usar o TutorFlow.',
              toggle: {
                value: 'necessary',
                enabled: true,
                readonly: true
              },
              cookie_table: [
                {
                  col1: 'sb-*-auth-token',
                  col2: 'Supabase (TutorFlow)',
                  col3: 'Gerencia autenticação e sessão do usuário',
                  col4: '7 dias'
                },
                {
                  col1: '__stripe_*',
                  col2: 'Stripe',
                  col3: 'Processa pagamentos e previne fraudes',
                  col4: 'Sessão'
                },
                {
                  col1: 'cc_cookie',
                  col2: 'TutorFlow',
                  col3: 'Armazena suas preferências de cookies',
                  col4: '365 dias'
                }
              ]
            },
            {
              title: 'Cookies de Análise (Analytics)',
              description: 'Esses cookies nos ajudam a entender como você usa a plataforma, quais páginas visita e onde encontra dificuldades. Isso nos permite melhorar continuamente a experiência do TutorFlow. Nenhum dado pessoal identificável é coletado.',
              toggle: {
                value: 'analytics',
                enabled: false,
                readonly: false
              },
              cookie_table: [
                {
                  col1: '_ga, _ga_*',
                  col2: 'Google Analytics',
                  col3: 'Coleta dados anônimos sobre navegação',
                  col4: '2 anos'
                }
              ]
            },
            {
              title: 'Mais informações',
              description: 'Para dúvidas sobre como tratamos seus dados, entre em contato pelo email <a href="mailto:suporte@tutor-flow.app" class="cc-link">suporte@tutor-flow.app</a> ou consulte nossa <a href="/legal" class="cc-link">Política de Privacidade</a>.'
            }
          ]
        }
      },
      en: {
        consent_modal: {
          title: '🍪 We use cookies',
          description: 'We use cookies to ensure the best experience. Essential cookies are required for the site to function (authentication, payments). You can choose to allow analytics cookies to help us improve the platform.',
          primary_btn: {
            text: 'Accept all',
            role: 'accept_all'
          },
          secondary_btn: {
            text: 'Reject non-essential',
            role: 'accept_necessary'
          },
          settings_btn: {
            text: 'Manage preferences',
            role: 'settings'
          }
        },
        settings_modal: {
          title: 'Cookie Preferences',
          save_settings_btn: 'Save preferences',
          accept_all_btn: 'Accept all',
          reject_all_btn: 'Reject non-essential',
          close_btn_label: 'Close',
          cookie_table_headers: [
            { col1: 'Name' },
            { col2: 'Provider' },
            { col3: 'Purpose' },
            { col4: 'Expiry' }
          ],
          blocks: [
            {
              title: 'How we use cookies 📋',
              description: 'Cookies are small files saved in your browser. They help us recognize you, keep your session active, and improve your experience. You have full control over which cookies to accept. <a href="/legal" class="cc-link">Read our Cookie Policy</a> for more details.'
            },
            {
              title: 'Strictly Necessary Cookies',
              description: 'These cookies are essential for the platform to function. They manage your authentication, process Stripe payments, and ensure the security of your transactions. Without them, you won\'t be able to use TutorFlow.',
              toggle: {
                value: 'necessary',
                enabled: true,
                readonly: true
              },
              cookie_table: [
                {
                  col1: 'sb-*-auth-token',
                  col2: 'Supabase (TutorFlow)',
                  col3: 'Manages user authentication and session',
                  col4: '7 days'
                },
                {
                  col1: '__stripe_*',
                  col2: 'Stripe',
                  col3: 'Processes payments and prevents fraud',
                  col4: 'Session'
                },
                {
                  col1: 'cc_cookie',
                  col2: 'TutorFlow',
                  col3: 'Stores your cookie preferences',
                  col4: '365 days'
                }
              ]
            },
            {
              title: 'Analytics Cookies',
              description: 'These cookies help us understand how you use the platform, which pages you visit, and where you encounter difficulties. This allows us to continuously improve TutorFlow. No personally identifiable data is collected.',
              toggle: {
                value: 'analytics',
                enabled: false,
                readonly: false
              },
              cookie_table: [
                {
                  col1: '_ga, _ga_*',
                  col2: 'Google Analytics',
                  col3: 'Collects anonymous browsing data',
                  col4: '2 years'
                }
              ]
            },
            {
              title: 'More information',
              description: 'For questions about how we handle your data, contact us at <a href="mailto:support@tutor-flow.app" class="cc-link">support@tutor-flow.app</a> or read our <a href="/legal" class="cc-link">Privacy Policy</a>.'
            }
          ]
        }
      }
    }
  }
});

// AGORA SIM, renderizar o React
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>,
);

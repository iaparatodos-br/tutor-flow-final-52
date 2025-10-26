import type { CookieConsentConfig } from 'vanilla-cookieconsent';

export const cookieConsentConfig: CookieConsentConfig = {
  // Modo de operação: opt-in (LGPD exige consentimento explícito)
  mode: 'opt-in',
  
  // Auto-detecção de idioma
  autoDetectLanguage: true,
  
  // Gerenciamento de scripts de terceiros
  manageScriptTags: true,
  
  // Atraso para mostrar o banner (em ms)
  delay: 500,

  // Categorias de cookies
  categories: {
    necessary: {
      enabled: true,  // Sempre habilitado
      readOnly: true  // Não pode ser desabilitado
    },
    analytics: {
      enabled: false, // Desabilitado por padrão (LGPD)
      autoClear: {
        cookies: [
          { name: /^_ga/ },       // Google Analytics
          { name: '_gid' }
        ]
      }
    },
    marketing: {
      enabled: false,
      autoClear: {
        cookies: [
          { name: /^_fbp/ },      // Facebook Pixel
          { name: /^_gcl/ }       // Google Ads
        ]
      }
    }
  },

  language: {
    default: 'pt-BR',
    
    translations: {
      'pt-BR': {
        consentModal: {
          title: '🍪 Nós usamos cookies',
          description: 'Utilizamos cookies para melhorar sua experiência, analisar o tráfego do site e personalizar conteúdo. Você pode escolher quais categorias deseja aceitar. Para mais informações, consulte nossos <a href="/legal" class="cc-link">Documentos Legais</a>.',
          acceptAllBtn: 'Aceitar todos',
          acceptNecessaryBtn: 'Rejeitar todos',
          showPreferencesBtn: 'Gerenciar preferências',
          footer: `
            <a href="/legal" class="cc-link">Documentos Legais</a>
          `
        },
        preferencesModal: {
          title: 'Preferências de Cookies',
          acceptAllBtn: 'Aceitar todos',
          acceptNecessaryBtn: 'Rejeitar todos',
          savePreferencesBtn: 'Salvar preferências',
          closeIconLabel: 'Fechar',
          sections: [
            {
              title: 'Uso de Cookies',
              description: 'Usamos cookies para garantir as funcionalidades básicas do site e melhorar sua experiência online. Você pode escolher aceitar ou rejeitar cada categoria a qualquer momento.'
            },
            {
              title: 'Cookies Estritamente Necessários',
              description: 'Esses cookies são essenciais para o funcionamento adequado do TutorFlow. Não podem ser desabilitados.',
              linkedCategory: 'necessary',
              cookieTable: {
                headers: {
                  name: 'Cookie',
                  domain: 'Domínio',
                  desc: 'Descrição',
                  exp: 'Expiração'
                },
                body: [
                  {
                    name: 'cc_cookie',
                    domain: typeof window !== 'undefined' ? window.location.hostname : 'tutor-flow.app',
                    desc: 'Armazena suas preferências de cookies',
                    exp: '6 meses'
                  },
                  {
                    name: 'sb-*',
                    domain: typeof window !== 'undefined' ? window.location.hostname : 'tutor-flow.app',
                    desc: 'Sessão de autenticação (Supabase)',
                    exp: '7 dias'
                  }
                ]
              }
            },
            {
              title: 'Cookies de Análise',
              description: 'Esses cookies nos ajudam a entender como os visitantes interagem com o site, coletando informações anônimas.',
              linkedCategory: 'analytics',
              cookieTable: {
                headers: {
                  name: 'Cookie',
                  domain: 'Domínio',
                  desc: 'Descrição',
                  exp: 'Expiração'
                },
                body: [
                  {
                    name: '_ga',
                    domain: 'Google',
                    desc: 'Google Analytics - ID único',
                    exp: '2 anos'
                  },
                  {
                    name: '_gid',
                    domain: 'Google',
                    desc: 'Google Analytics - Sessão',
                    exp: '24 horas'
                  }
                ]
              }
            },
            {
              title: 'Cookies de Marketing',
              description: 'Utilizados para exibir anúncios relevantes e rastrear a eficácia de campanhas publicitárias.',
              linkedCategory: 'marketing'
            },
            {
              title: 'Mais informações',
              description: `Para dúvidas sobre nossa política de cookies, entre em contato através do email <a href="mailto:tutorflowsite@gmail.com" class="cc-link">tutorflowsite@gmail.com</a>.`
            }
          ]
        }
      },
      
      'en': {
        consentModal: {
          title: '🍪 We use cookies',
          description: 'We use cookies to enhance your experience, analyze site traffic, and personalize content. You can choose which categories to accept. For more information, see our <a href="/legal" class="cc-link">Legal Documents</a>.',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Reject all',
          showPreferencesBtn: 'Manage preferences',
          footer: `
            <a href="/legal" class="cc-link">Legal Documents</a>
          `
        },
        preferencesModal: {
          title: 'Cookie Preferences',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Reject all',
          savePreferencesBtn: 'Save preferences',
          closeIconLabel: 'Close',
          sections: [
            {
              title: 'Cookie Usage',
              description: 'We use cookies to ensure basic site functionality and improve your online experience. You can choose to accept or reject each category at any time.'
            },
            {
              title: 'Strictly Necessary Cookies',
              description: 'These cookies are essential for TutorFlow to work properly. They cannot be disabled.',
              linkedCategory: 'necessary',
              cookieTable: {
                headers: {
                  name: 'Cookie',
                  domain: 'Domain',
                  desc: 'Description',
                  exp: 'Expiration'
                },
                body: [
                  {
                    name: 'cc_cookie',
                    domain: typeof window !== 'undefined' ? window.location.hostname : 'tutor-flow.app',
                    desc: 'Stores your cookie preferences',
                    exp: '6 months'
                  },
                  {
                    name: 'sb-*',
                    domain: typeof window !== 'undefined' ? window.location.hostname : 'tutor-flow.app',
                    desc: 'Authentication session (Supabase)',
                    exp: '7 days'
                  }
                ]
              }
            },
            {
              title: 'Analytics Cookies',
              description: 'These cookies help us understand how visitors interact with the site by collecting anonymous information.',
              linkedCategory: 'analytics',
              cookieTable: {
                headers: {
                  name: 'Cookie',
                  domain: 'Domain',
                  desc: 'Description',
                  exp: 'Expiration'
                },
                body: [
                  {
                    name: '_ga',
                    domain: 'Google',
                    desc: 'Google Analytics - Unique ID',
                    exp: '2 years'
                  },
                  {
                    name: '_gid',
                    domain: 'Google',
                    desc: 'Google Analytics - Session',
                    exp: '24 hours'
                  }
                ]
              }
            },
            {
              title: 'Marketing Cookies',
              description: 'Used to display relevant ads and track the effectiveness of advertising campaigns.',
              linkedCategory: 'marketing'
            },
            {
              title: 'More information',
              description: `For questions about our cookie policy, contact us at <a href="mailto:tutorflowsite@gmail.com" class="cc-link">tutorflowsite@gmail.com</a>.`
            }
          ]
        }
      }
    }
  }
};
